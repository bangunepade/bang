const crypto = require('crypto');
const { requireUser, json } = require('./lib/firebase-admin');
const { getSimulatedBngPrice } = require('./lib/bng-market');
const ASSETS = { BNG: 'bng', BTC: 'btc', BNB: 'bnb', USDT: 'usdt' };
const round = n => Math.round((Number(n) + Number.EPSILON) * 1e8) / 1e8;
const err = (message, statusCode = 400) => { const e = new Error(message); e.statusCode = statusCode; return e; };
function rateFor(asset) {
  if (asset === 'BNG') return 1;
  const key = ({ USDT: 'BNG_PER_USDT', BNB: 'BNG_PER_BNB', BTC: 'BNG_PER_BTC' })[asset];
  // Rate convention: 1 BNG = X units of the quote asset. Convert quote-asset
  // amounts back to their BNG value when calculating the 0.5% BNG fee.
  const bngUsd = getSimulatedBngPrice();
  const quotePerBng = asset === 'USDT' ? bngUsd
    : asset === 'BNB' ? bngUsd / Number(process.env.BNB_USD_PRICE || 600)
    : asset === 'BTC' ? bngUsd / Number(process.env.BTC_USD_PRICE || 100000)
    : Number(process.env[key]);
  if (!Number.isFinite(quotePerBng) || quotePerBng <= 0) throw err('The admin has not configured a valid BNG fee conversion rate for ' + asset + '. Transfers of this asset are temporarily disabled.', 503);
  return 1 / quotePerBng;
}
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const { admin, decoded } = await requireUser(event);
    let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (_) { throw err('Invalid request body.'); }
    const asset = String(body.asset || '').toUpperCase();
    const recipientAddress = typeof body.recipientAddress === 'string' ? body.recipientAddress.trim().toUpperCase() : '';
    const amount = Number(body.amount);
    const transferId = typeof body.transferId === 'string' ? body.transferId : '';
    if (!Object.prototype.hasOwnProperty.call(ASSETS, asset)) throw err('Choose BNG, BTC, BNB, or USDT.');
    if (!new RegExp('^' + asset + '-[A-F0-9]{32}$').test(recipientAddress)) throw err('Enter a valid internal ' + asset + ' wallet address.');
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e15 || Math.round(amount * 1e8) / 1e8 !== amount) throw err('Enter a valid positive amount with up to 8 decimal places.');
    if (asset === 'BNG' && amount < 10) throw err('Minimum BNG transfer is 10 BNG.');
    if (!/^[a-f0-9-]{20,80}$/i.test(transferId)) throw err('Invalid transfer request. Please retry.');
    const feeRate = rateFor(asset), feeBng = round(amount * feeRate * 0.005);
    if (!Number.isFinite(feeBng) || feeBng < 0) throw err('Fee calculation failed.');
    const db = admin.firestore(), lookupSnap = await db.collection('walletAddressLookup').doc(recipientAddress).get();
    if (!lookupSnap.exists || String(lookupSnap.data().asset || 'BNG').toUpperCase() !== asset || !lookupSnap.data().uid) throw err('That internal ' + asset + ' wallet address was not found.', 404);
    const recipientUid = lookupSnap.data().uid;
    if (recipientUid === decoded.uid) throw err('You cannot send assets to your own wallet address.');
    const adminUid = String(process.env.BANG_ADMIN_UID || '').trim();
    if (!adminUid) throw err('Internal transfer fee recipient is not configured. Set BANG_ADMIN_UID in Netlify environment variables.', 503);
    const senderRef = db.collection('walletBalances').doc(decoded.uid), recipientRef = db.collection('walletBalances').doc(recipientUid), adminRef = db.collection('walletBalances').doc(adminUid);
    const transactionId = 'BNG-TX-' + crypto.randomBytes(16).toString('hex').toUpperCase();
    const createdAtMs = Date.now();
    const transferRef = db.collection('walletTransfers').doc(transferId), sentRef = db.collection('walletTransactions').doc(transferId + '_sent'), receivedRef = db.collection('walletTransactions').doc(transferId + '_received'), feeTxRef = db.collection('walletTransactions').doc(transferId + '_fee');
    const result = await db.runTransaction(async tx => {
      const [ss, rs, as, ts] = await Promise.all([tx.get(senderRef), tx.get(recipientRef), tx.get(adminRef), tx.get(transferRef)]);
      if (ts.exists) throw err('This transfer request has already been processed. No additional funds were moved.', 409);
      const sender = ss.exists ? ss.data() : {}, recipient = rs.exists ? rs.data() : {}, adminWallet = as.exists ? as.data() : {};
      const field = ASSETS[asset], senderBalance = Math.max(0, Number(sender[field] || 0)), senderBng = Math.max(0, Number(sender.bng || 0));
      const fee = decoded.uid === adminUid ? 0 : feeBng;
      const requiredAsset = asset === 'BNG' ? amount + fee : amount;
      if (senderBalance + 1e-10 < requiredAsset) throw err('Insufficient ' + asset + ' balance including the transfer fee.', 400);
      if (asset !== 'BNG' && senderBng + 1e-10 < fee) throw err('Insufficient BNG to pay the 0.5% internal transfer fee (' + fee + ' BNG).', 400);
      const stamp = admin.firestore.FieldValue.serverTimestamp(), changes = new Map();
      function entry(uid, data) { if (!changes.has(uid)) changes.set(uid, { base: data || {}, deltas: {} }); return changes.get(uid); }
      function delta(uid, data, assetName, amountDelta) { const e = entry(uid, data); e.deltas[ASSETS[assetName]] = (e.deltas[ASSETS[assetName]] || 0) + amountDelta; }
      delta(decoded.uid, sender, asset, -amount); delta(decoded.uid, sender, 'BNG', -fee); delta(recipientUid, recipient, asset, amount); if (fee > 0) delta(adminUid, adminWallet, 'BNG', fee);
      for (const [uid, e] of changes) {
        const next = { uid, updatedAt: stamp };
        for (const a of Object.keys(ASSETS)) { const prior = Math.max(0, Number(e.base[ASSETS[a]] || 0)), value = round(prior + (e.deltas[ASSETS[a]] || 0)); if (value < -1e-8) throw err('Transfer would create a negative ' + a + ' balance. No changes were made.', 409); next[ASSETS[a]] = Math.max(0, value); }
        tx.set(db.collection('walletBalances').doc(uid), next, { merge: true });
      }
      tx.create(transferRef, { transferId, transactionId, fromUid: decoded.uid, toUid: recipientUid, recipientAddress, asset, amount, feeRate: 0.005, feeBng: fee, feeConversionRate: feeRate, status: 'completed_internal_transfer', createdAt: stamp, createdAtMs, publicVerification: true, ledgerOnly: true, verificationMethod: 'authenticated_session' });
      tx.create(sentRef, { uid: decoded.uid, transactionId, transferId, type: 'internal_transfer_sent', toUid: recipientUid, recipientAddress, asset, amount, feeBng: fee, feeAsset: 'BNG', status: 'completed_internal_transfer', createdAt: stamp, createdAtMs, publicVerification: true, ledgerOnly: true });
      tx.create(receivedRef, { uid: recipientUid, transactionId, transferId, type: 'internal_transfer_received', fromUid: decoded.uid, asset, amount, status: 'completed_internal_transfer', createdAt: stamp, createdAtMs, publicVerification: true, ledgerOnly: true });
      if (fee > 0) tx.create(feeTxRef, { uid: adminUid, transactionId, transferId, type: 'internal_transfer_fee_received', fromUid: decoded.uid, toUid: adminUid, asset: 'BNG', amount: fee, sourceAsset: asset, sourceAmount: amount, transferId, status: 'completed_internal_transfer', createdAt: stamp, createdAtMs, publicVerification: true, ledgerOnly: true });
      const senderAfter = changes.get(decoded.uid), finalBalances = {};
      for (const a of Object.keys(ASSETS)) finalBalances[a] = round(Math.max(0, Number(senderAfter.base[ASSETS[a]] || 0) + (senderAfter.deltas[ASSETS[a]] || 0)));
      return { transactionId, createdAtMs, transferred: amount, asset, feeBng: fee, feeRate: 0.005, walletBalances: { BNG: finalBalances.bng, BTC: finalBalances.btc, BNB: finalBalances.bnb, USDT: finalBalances.usdt }, status: 'completed_internal_transfer', ledgerOnly: true };
    });
    return json(200, result);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('wallet-transfer failed:', error);
    return json(status, { error: status === 500 ? 'Unable to complete the internal transfer right now.' : error.message });
  }
};
