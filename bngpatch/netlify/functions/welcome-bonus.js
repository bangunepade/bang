const { requireUser, json } = require('./lib/firebase-admin');
const BONUS = 2;
// Accounts created on/after this rollout date qualify. Existing accounts are not backfilled.
const ELIGIBILITY_START = Date.parse('2026-10-23T00:00:00Z');
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const { admin, decoded } = await requireUser(event);
    const userRecord = await admin.auth().getUser(decoded.uid);
    const createdAt = Date.parse(userRecord.metadata.creationTime || '');
    if (!Number.isFinite(createdAt) || createdAt < ELIGIBILITY_START) return json(403, { error: 'Welcome bonus is available only to newly registered accounts.' });
    const db = admin.firestore();
    const bonusRef = db.collection('welcomeBonuses').doc(decoded.uid);
    const balanceRef = db.collection('walletBalances').doc(decoded.uid);
    const txRef = db.collection('walletTransactions').doc('welcome_' + decoded.uid);
    const result = await db.runTransaction(async tx => {
      const [bonusSnap, balanceSnap] = await Promise.all([tx.get(bonusRef), tx.get(balanceRef)]);
      if (bonusSnap.exists) return { granted: false, balance: Number((balanceSnap.data() || {}).bng || 0) };
      const balance = balanceSnap.exists ? balanceSnap.data() : {};
      const current = Math.max(0, Number(balance.bng || 0));
      const next = Math.round((current + BONUS) * 1e8) / 1e8;
      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.set(balanceRef, { uid: decoded.uid, bng: next, updatedAt: now }, { merge: true });
      tx.create(bonusRef, { uid: decoded.uid, amount: BONUS, asset: 'BNG', reason: 'new_account_welcome_bonus', createdAt: now, ledgerOnly: true });
      tx.create(txRef, { uid: decoded.uid, type: 'welcome_bonus', asset: 'BNG', amount: BONUS, status: 'completed_internal_bonus', createdAt: now, ledgerOnly: true });
      return { granted: true, balance: next };
    });
    return json(200, { ...result, bonus: result.granted ? BONUS : 0, asset: 'BNG', ledgerOnly: true });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('welcome-bonus failed:', error);
    return json(status, { error: status === 500 ? 'Unable to initialize the welcome bonus right now.' : error.message });
  }
};
