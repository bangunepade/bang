const { getAdmin, json } = require('./lib/firebase-admin');

// Public endpoint exposes aggregate counts only; never account IDs or wallet data.
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });
  try {
    const admin = getAdmin();
    const db = admin.firestore();
    const [miners, stakes] = await Promise.all([
      db.collection('miningUsers').where('running', '==', true).get(),
      db.collection('bngStakes').where('status', '==', 'active').get()
    ]);
    // Match mining.html/mining-state.js: a miner is active only when running is true
    // AND startedAtMs is a positive timestamp. Legacy/incomplete records are excluded.
    const activeMiningAccounts = miners.docs.filter((doc) => {
      const data = doc.data() || {};
      const startedAtMs = Number(data.startedAtMs || 0);
      return data.running === true && Number.isFinite(startedAtMs) && startedAtMs > 0;
    });

    const stakingUids = new Set();
    for (const doc of stakes.docs) {
      const uid = doc.data().uid;
      if (typeof uid === 'string' && uid) stakingUids.add(uid);
    }
    return json(200, {
      miningAccounts: activeMiningAccounts.length,
      stakingAccounts: stakingUids.size,
      activeStakes: stakes.size,
      updatedAt: Date.now(),
      aggregateOnly: true
    });
  } catch (error) {
    console.error('activity-news endpoint failed:', error);
    return json(503, { error: 'Activity counts are temporarily unavailable.' });
  }
};
