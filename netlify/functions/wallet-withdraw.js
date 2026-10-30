const crypto = require('crypto');
const { requireUser, json } = require('./lib/firebase-admin');
const { getPromoConfig, accrued } = require('./lib/mining-rate');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const { admin, decoded } = await requireUser(event);
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { error: 'Invalid request body.' }); }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e15) return json(400, { error: 'Enter a valid positive BNG amount.' });
    const db = admin.firestore();
    const miningRef = db.collection('miningUsers').doc(decoded.uid);
    const walletRef = db.collection('walletBalances').doc(decoded.uid);
    const promoConfig = await getPromoConfig(admin);
    const transactionId = 'BNG-TX-' + crypto.randomBytes(16).toString('hex').toUpperCase();
    const transactionRef = db.collection('walletTransactions').doc(transactionId);
    const createdAtMs = Date.now();
    const result = await db.runTransaction(async (tx) => {
      const [ms, ws] = await Promise.all([tx.get(miningRef), tx.get(walletRef)]);
      const m = ms.exists ? ms.data() : {};
      const w = ws.exists ? ws.data() : {};
      let pending = Math.max(0, Number(m.pending || 0));
      let total = Math.max(0, Number(m.total || 0));
      let running = m.running === true;
      let startedAtMs = Math.max(0, Number(m.startedAtMs || 0));
      const now = createdAtMs;
      const earned = running && startedAtMs > 0 ? accrued(startedAtMs, now, promoConfig) : 0;
      pending += earned;
      total += earned;
      if (amount > pending + 1e-9) {
        const err = new Error('Insufficient mining balance. Refresh your balance and try again.'); err.statusCode = 400; throw err;
      }
      const feeRate = 0.00878690; const fee = Math.round((amount * feeRate + Number.EPSILON) * 1e6) / 1e6; const credited = Math.round((amount - fee + Number.EPSILON) * 1e6) / 1e6; pending = Math.max(0, pending - amount);
      // Keep mining active, but restart the accrual clock at this transaction.
      if (running) startedAtMs = now;
      tx.set(miningRef, { uid: decoded.uid, email: typeof decoded.email === 'string' ? decoded.email : '', pending, total, running, startedAtMs, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      const newWallet = Math.round((Math.max(0, Number(w.bng || 0)) + credited + Number.EPSILON) * 1e6) / 1e6;
      tx.set(walletRef, { uid: decoded.uid, bng: newWallet, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.create(transactionRef, { uid: decoded.uid, transactionId, type: 'mining_to_dashboard', asset: 'BNG', amount: credited, requestedAmount: amount, fee, feeRate, status: 'completed_internal_transfer', createdAt: admin.firestore.FieldValue.serverTimestamp(), createdAtMs, publicVerification: true, ledgerOnly: true });
      return { transactionId, createdAtMs, transferred: credited, requestedAmount: amount, fee, feeRate, miningPending: pending, walletBng: newWallet, running, startedAtMs, ledgerOnly: true };
    });
    return json(200, result);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('wallet-withdraw failed:', error);
    return json(status, { error: status === 500 ? 'Unable to transfer rewards right now.' : error.message });
  }
};
