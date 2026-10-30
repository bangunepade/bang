const { requireUser, json } = require('./lib/firebase-admin');
const crypto = require('crypto');
const { getSimulatedBngPrice } = require('./lib/bng-market');
const ASSETS = { BNG:'bng', BTC:'btc', BNB:'bnb', USDT:'usdt', ADA:'ada', BCH:'bch', ETH:'eth', SOL:'sol', DOGE:'doge', XRP:'xrp' };
const round = n => Math.round((Number(n) + Number.EPSILON) * 1e8) / 1e8;
const err = (message, statusCode=400) => { const e = new Error(message); e.statusCode = statusCode; return e; };
// Environment rates use the public convention: 1 BNG = X units of the quote asset.
 // Convert each asset to its BNG-equivalent value for the common swap calculation.
function bngValueRate(asset) {
  if (asset === 'BNG') return 1;
  const key = ({ USDT:'BNG_PER_USDT', BNB:'BNG_PER_BNB', BTC:'BNG_PER_BTC', ADA:'BNG_PER_ADA', BCH:'BNG_PER_BCH', ETH:'BNG_PER_ETH', SOL:'BNG_PER_SOL', DOGE:'BNG_PER_DOGE', XRP:'BNG_PER_XRP' })[asset];
  const bngUsd = getSimulatedBngPrice();
  const quotePerBng = asset === 'USDT' ? bngUsd
    : asset === 'BNB' ? bngUsd / Number(process.env.BNB_USD_PRICE || 600)
    : asset === 'BTC' ? bngUsd / Number(process.env.BTC_USD_PRICE || 100000)
    : Number(process.env[key]);
  if (!Number.isFinite(quotePerBng) || quotePerBng <= 0) throw err('Internal swaps are paused: a valid '+key+' rate is not configured on the server.', 503);
  return 1 / quotePerBng;
}
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const { admin, decoded } = await requireUser(event);
    let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { error: 'Invalid request body.' }); }
    const from = String(body.from || '').toUpperCase();
    const to = String(body.to || '').toUpperCase();
    const amount = Number(body.amount);
    const swapId = typeof body.swapId === 'string' ? body.swapId : '';
    if (!Object.prototype.hasOwnProperty.call(ASSETS, from) || !Object.prototype.hasOwnProperty.call(ASSETS, to)) return json(400, { error: 'Choose BNG, BTC, BNB, USDT, ADA, BCH, ETH, SOL, DOGE or XRP.' });
    if (from === to) return json(400, { error: 'Choose two different assets.' });
    if (from !== 'BNG' && to !== 'BNG') return json(400, { error: 'Swaps must use BNG as one side. Swap the asset back to BNG before converting to another asset.' });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e15 || round(amount) !== amount) return json(400, { error: 'Enter a positive amount with up to 8 decimal places.' });
    if (!/^[a-f0-9-]{20,80}$/i.test(swapId)) return json(400, { error: 'Invalid swap request. Please retry.' });
    const fromRate = bngValueRate(from), toRate = bngValueRate(to);
    if (amount * fromRate < 2 - 1e-10) return json(400, { error: 'Minimum swap size is 2 BNG-equivalent. Increase the input amount and try again.' });
    // The 0.50% swap gas fee is always charged in BNG, based on the BNG-equivalent value of the input.
    const feeBng = round(amount * fromRate * 0.005);
    const output = round(amount * fromRate / toRate);
    const transactionId = 'BNG-TX-' + crypto.randomBytes(16).toString('hex').toUpperCase();
    const createdAtMs = Date.now();
    if (!(output > 0) || !Number.isFinite(output)) return json(400, { error: 'Swap output is too small or invalid.' });
    const adminUid = String(process.env.BANG_ADMIN_UID || '').trim();
    if (!adminUid) return json(503, { error: 'Internal swap treasury is not configured. Set BANG_ADMIN_UID in Netlify environment variables.' });
    const db = admin.firestore();
    const userRef = db.collection('walletBalances').doc(decoded.uid);
    const treasuryRef = db.collection('walletBalances').doc(adminUid);
    const swapRef = db.collection('walletSwaps').doc(swapId);
    const userTxRef = db.collection('walletTransactions').doc(swapId+'_swap');
    const feeTxRef = db.collection('walletTransactions').doc(swapId+'_fee');
    const result = await db.runTransaction(async tx => {
      const [us, ts, prior] = await Promise.all([tx.get(userRef), tx.get(treasuryRef), tx.get(swapRef)]);
      if (prior.exists) throw err('This swap request has already been processed. Refresh your wallet.', 409);
      const user = us.exists ? us.data() : {};
      const treasury = ts.exists ? ts.data() : {};
      const fromField = ASSETS[from], toField = ASSETS[to];
      const userFrom = Math.max(0, Number(user[fromField] || 0));
      const userBng = Math.max(0, Number(user.bng || 0));
      const treasuryTo = Math.max(0, Number(treasury[toField] || 0));
      if (userFrom + 1e-10 < amount) throw err('Insufficient '+from+' internal balance.', 400);
      if (userBng + 1e-10 < feeBng + (from === 'BNG' ? amount : 0)) throw err('Insufficient BNG balance to cover the BNG swap gas fee and input amount.', 400);
      if (treasuryTo + 1e-10 < output) throw err('Swap unavailable: the internal treasury does not have enough '+to+' reserve. No balances were changed.', 409);
      const changes = new Map();
      function add(uid, data, asset, delta) {
        if (!changes.has(uid)) changes.set(uid, { base: data || {}, deltas: {} });
        const c = changes.get(uid); c.deltas[ASSETS[asset]] = (c.deltas[ASSETS[asset]] || 0) + delta;
      }
      // Swap input is converted at the configured rate; the separate 0.50% gas fee is deducted in BNG.
      add(decoded.uid, user, from, -amount);
      add(decoded.uid, user, to, output);
      add(decoded.uid, user, 'BNG', -feeBng);
      add(adminUid, treasury, from, amount);
      add(adminUid, treasury, to, -output);
      add(adminUid, treasury, 'BNG', feeBng);
      const now = admin.firestore.FieldValue.serverTimestamp();
      for (const [uid, c] of changes.entries()) {
        const next = { uid, updatedAt: now };
        for (const asset of Object.keys(ASSETS)) {
          const field = ASSETS[asset];
          const balance = round(Math.max(0, Number(c.base[field] || 0) + (c.deltas[field] || 0)));
          if (balance < -1e-8) throw err('Swap would create a negative '+asset+' balance. No changes were made.', 409);
          next[field] = Math.max(0, balance);
        }
        tx.set(db.collection('walletBalances').doc(uid), next, { merge: true });
      }
      tx.create(swapRef, { swapId, transactionId, uid: decoded.uid, from, to, amountIn: amount, feeRate: 0.005, feeAmount: feeBng, feeAsset: 'BNG', gasFeeBng: feeBng, amountOut: output, fromBngRate: fromRate, toBngRate: toRate, status: 'completed_internal_swap', ledgerOnly: true, publicVerification: true, createdAt: now, createdAtMs });
      tx.create(userTxRef, { uid: decoded.uid, transactionId, type: 'internal_swap', from, to, asset: from, amount: amount, amountIn: amount, feeAmount: feeBng, gasFeeBng: feeBng, feeAsset: 'BNG', amountOut: output, status: 'completed_internal_swap', ledgerOnly: true, publicVerification: true, createdAt: now, createdAtMs });
      tx.create(feeTxRef, { uid: adminUid, transactionId, type: 'internal_swap_gas_fee_received', fromUid: decoded.uid, sourceAsset: from, sourceAmount: amount, amount: feeBng, feeAmount: feeBng, feeAsset: 'BNG', gasFeeBng: feeBng, swapId, status: 'completed_internal_swap', ledgerOnly: true, publicVerification: true, createdAt: now, createdAtMs });
      const c = changes.get(decoded.uid), balances = {};
      for (const asset of Object.keys(ASSETS)) balances[asset] = round(Math.max(0, Number(c.base[ASSETS[asset]] || 0) + (c.deltas[ASSETS[asset]] || 0)));
      return { swapId, transactionId, createdAtMs, from, to, amountIn: amount, feeAmount: feeBng, gasFeeBng: feeBng, feeRate: 0.005, feeAsset: 'BNG', amountOut: output, balances, status: 'completed_internal_swap', ledgerOnly: true, publicVerification: true };
    });
    return json(200, result);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('internal-swap failed:', error);
    return json(status, { error: status === 500 ? 'Unable to complete the internal swap right now.' : error.message });
  }
};
