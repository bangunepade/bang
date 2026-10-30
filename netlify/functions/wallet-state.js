const { requireUser, json } = require('./lib/firebase-admin');
const { ASSETS, ensureAllAssetAddresses } = require('./lib/wallet-addresses');
const RATE_PER_DAY = 1;
exports.handler = async event => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });
  try {
    const { admin, decoded } = await requireUser(event);
    const db = admin.firestore();
    const [miningSnap, walletSnap] = await Promise.all([
      db.collection('miningUsers').doc(decoded.uid).get(),
      db.collection('walletBalances').doc(decoded.uid).get()
    ]);
    // Provision all ten internal asset addresses for every account on wallet load.
    const walletAddresses = await ensureAllAssetAddresses(admin, decoded.uid);
    const m = miningSnap.exists ? miningSnap.data() : {};
    const w = walletSnap.exists ? walletSnap.data() : {};
    const now = Date.now(), pending = Math.max(0, Number(m.pending || 0)), startedAtMs = Math.max(0, Number(m.startedAtMs || 0));
    const earned = m.running === true && startedAtMs > 0 ? Math.max(0, (now-startedAtMs)/86400000*RATE_PER_DAY) : 0;
    const assetBalances = Object.fromEntries(ASSETS.map(asset => [asset, Math.max(0, Number(w[asset.toLowerCase()] || 0))]));
    
    const asIso = value => value && typeof value.toDate === 'function' ? value.toDate().toISOString() : null;
    return json(200, { miningPending: pending + earned, walletBng: assetBalances.BNG, assetBalances, walletAddress: walletAddresses.BNG, walletAddresses, running: m.running === true, ratePerDay: RATE_PER_DAY, admin: decoded.admin === true, walletBalanceUpdatedAt: asIso(w.updatedAt), miningBalanceUpdatedAt: asIso(m.updatedAt), serverTime: new Date(now).toISOString(), ledgerOnly: true });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('wallet-state failed:', error);
    return json(status, { error: status === 500 ? 'Unable to load wallet right now.' : error.message });
  }
};
