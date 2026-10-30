const { requireUser, json } = require('./lib/firebase-admin');
const crypto = require('crypto');
const { getSimulatedBngPrice } = require('./lib/bng-market');
const ASSETS = { BNG:'bng', BTC:'btc', BNB:'bnb', USDT:'usdt', ADA:'ada', BCH:'bch', ETH:'eth', SOL:'sol', DOGE:'doge', XRP:'xrp' };
const round = n => Math.round((Number(n) + Number.EPSILON) * 1e8) / 1e8;
const err = (message, statusCode=400) => { const e = new Error(message); e.statusCode = statusCode; return e; };
// Environment rates use the public convention: 1 BNG = X units of the quote asset.
 // Convert each asset to its BNG-equivalent value for the common swap calculation.
const MARKET_IDS = { BTC:'bitcoin', BNB:'binancecoin', USDT:'tether', ADA:'cardano', BCH:'bitcoin-cash', ETH:'ethereum', SOL:'solana', DOGE:'dogecoin', XRP:'ripple' };
let cachedPrices = null, cachedAt = 0;
async function getMarketPrices() {
  if (cachedPrices && Date.now() - cachedAt < 60_000) return cachedPrices;
  const ids = [...new Set(Object.values(MARKET_IDS))].join(',');
  const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(ids) + '&vs_currencies=usd', { headers: { accept: 'application/json' } });
  if (!response.ok) throw err('Live reference prices are temporarily unavailable. Please retry later.', 503);
  const data = await response.json();
  const prices = {};
  for (const [asset, id] of Object.entries(MARKET_IDS)) {
    const value = Number(data?.[id]?.usd);
    if (Number.isFinite(value) && value > 0) prices[asset] = value;
  }
  cachedPrices = prices; cachedAt = Date.now(); return prices;
}
async function bngValueRate(asset) {
  if (asset === 'BNG') return 1;
  const key = ({ USDT:'BNG_PER_USDT', BNB:'BNG_PER_BNB', BTC:'BNG_PER_BTC', ADA:'BNG_PER_ADA', BCH:'BNG_PER_BCH', ETH:'BNG_PER_ETH', SOL:'BNG_PER_SOL', DOGE:'BNG_PER_DOGE', XRP:'BNG_PER_XRP' })[asset];
  const bngUsd = getSimulatedBngPrice();
  // Explicit server rates override market-derived estimates. Otherwise use current USD references.
  const configured = Number(process.env[key]);
  if (process.env[key] && Number.isFinite(configured) && configured > 0) return configured;
  const prices = await getMarketPrices();
  const assetUsd = prices[asset];
  if (!Number.isFinite(assetUsd) || assetUsd <= 0 || !Number.isFinite(bngUsd) || bngUsd <= 0) throw err('No valid reference rate is available for ' + asset + '. Swap paused safely.', 503);
  return assetUsd / bngUsd;
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
    if (from !== 'BNG' && to !== 'BNG') return json(400, { error: 'Each swap must include BNG as the source or destination. Convert the asset back to BNG before swapping into another asset.' });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e15 || round(amount) !== amount) return json(400, { error: 'Enter a positive amount with up to 8 decimal places.' });
    if (!/^[a-f0-9-]{20,80}$/i.test(swapId)) return json(400, { error: 'Invalid swap request. Please retry.' });
    const [fromRate, toRate] = await Promise.all([bngValueRate(from), bngValueRate(to)]);
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
    const liabilityRef = db.collection('demoSwapLiabilities').doc('internal-demo-ledger');
    const result = await db.runTransaction(async tx => {
      const [us, ts, prior, ls] = await Promise.all([tx.get(userRef), tx.get(treasuryRef), tx.get(swapRef), tx.get(liabilityRef)]);
      if (prior.exists) throw err('This swap request has already been processed. Refresh your wallet.', 409);
      const user = us.exists ? us.data() : {};
      const treasury = ts.exists ? ts.data() : {};
      const fromField = ASSETS[from], toField = ASSETS[to];
      const userFrom = Math.max(0, Number(user[fromField] || 0));
      const userBng = Math.max(0, Number(user.bng || 0));
      const liability = ls.exists ? ls.data() : {};
      if (userFrom + 1e-10 < amount) throw err('Insufficient '+from+' internal balance.', 400);
      if (userBng + 1e-10 < feeBng + (from === 'BNG' ? amount : 0)) throw err('Insufficient BNG balance to cover the BNG swap gas fee and input amount.', 400);
      // Internal demo mode: swaps use provisional website-ledger units, not backed reserves.
      // Record the outstanding demo liability instead of pretending the treasury has real assets.
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
      tx.set(liabilityRef, { mode: 'internal_demo_only', ledgerOnly: true, updatedAt: now, assets: { ...(liability.assets || {}), [toField]: round(Number((liability.assets || {})[toField] || 0) + output) }, note: 'Provisional internal demo ledger liabilities; not backed by external reserves and not redeemable as on-chain assets.' }, { merge: true });
      tx.create(swapRef, { swapId, transactionId, uid: decoded.uid, from, to, amountIn: amount, feeRate: 0.005, feeAmount: feeBng, feeAsset: 'BNG', gasFeeBng: feeBng, amountOut: output, fromBngRate: fromRate, toBngRate: toRate, status: 'completed_internal_demo_swap', ledgerOnly: true, demoLedger: true, reserveBacked: false, publicVerification: true, createdAt: now, createdAtMs });
      tx.create(userTxRef, { uid: decoded.uid, transactionId, type: 'internal_swap', from, to, asset: from, amount: amount, amountIn: amount, feeAmount: feeBng, gasFeeBng: feeBng, feeAsset: 'BNG', amountOut: output, status: 'completed_internal_demo_swap', ledgerOnly: true, demoLedger: true, reserveBacked: false, publicVerification: true, createdAt: now, createdAtMs });
      tx.create(feeTxRef, { uid: adminUid, transactionId, type: 'internal_swap_gas_fee_received', fromUid: decoded.uid, sourceAsset: from, sourceAmount: amount, amount: feeBng, feeAmount: feeBng, feeAsset: 'BNG', gasFeeBng: feeBng, swapId, status: 'completed_internal_demo_swap', ledgerOnly: true, demoLedger: true, reserveBacked: false, publicVerification: true, createdAt: now, createdAtMs });
      const c = changes.get(decoded.uid), balances = {};
      for (const asset of Object.keys(ASSETS)) balances[asset] = round(Math.max(0, Number(c.base[ASSETS[asset]] || 0) + (c.deltas[ASSETS[asset]] || 0)));
      return { swapId, transactionId, createdAtMs, from, to, amountIn: amount, feeAmount: feeBng, gasFeeBng: feeBng, feeRate: 0.005, feeAsset: 'BNG', amountOut: output, balances, status: 'completed_internal_demo_swap', ledgerOnly: true, demoLedger: true, reserveBacked: false, publicVerification: true };
    });
    return json(200, result);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('internal-swap failed:', error);
    return json(status, { error: status === 500 ? 'Unable to complete the internal swap right now.' : error.message });
  }
};
