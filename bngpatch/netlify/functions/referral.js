const { requireUser, json } = require('./lib/firebase-admin');
const BONUS_BNG = 0.5;
const SITE_URL = 'https://1bang.top';

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const { admin, decoded } = await requireUser(event);
    const db = admin.firestore();
    const uid = decoded.uid;
    const ownReferral = db.collection('referrals').doc(uid);
    if (event.httpMethod === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { error: 'Invalid JSON.' }); }
      const referrerUid = typeof body.referrerUid === 'string' ? body.referrerUid.trim() : '';
      if (!referrerUid || referrerUid === uid || !/^[A-Za-z0-9_-]{10,150}$/.test(referrerUid)) return json(400, { error: 'Invalid referral link.' });
      // Validate the inviter before opening the Firestore transaction. Do not
      // make external Auth calls from a transaction callback that Firestore may retry.
      const authUser = await admin.auth().getUser(referrerUid).catch(() => null);
      if (!authUser || referrerUid === uid) return json(400, { error: 'Invalid referral link.' });
      await db.runTransaction(async tx => {
        const existing = await tx.get(ownReferral);
        if (existing.exists) return; // first valid referral wins; cannot overwrite later
        tx.create(ownReferral, {
          referredUid: uid,
          referrerUid,
          status: 'pending',
          bonusBng: BONUS_BNG,
          referredEmail: typeof decoded.email === 'string' ? decoded.email : '',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      return json(200, { ok: true });
    }
    const [ownSnap, referredSnap] = await Promise.all([
      ownReferral.get(), db.collection('referrals').where('referrerUid', '==', uid).get()
    ]);
    const eligibleCount = referredSnap.docs.filter(d => d.data().status === 'eligible').length;
    const pendingCount = referredSnap.size - eligibleCount;
    // Read active mining status through the Admin SDK; client Firestore rules stay private.
    const referredUsers = await Promise.all(referredSnap.docs.map(async d => {
      const item = d.data();
      const referredUid = typeof item.referredUid === 'string' ? item.referredUid : d.id;
      let isMiningActive = false;
      try {
        const miningSnap = await db.collection('miningUsers').doc(referredUid).get();
        isMiningActive = miningSnap.exists && miningSnap.data().running === true;
      } catch (e) {
        console.warn('Could not read referred mining status:', e.message);
      }
      const eligible = item.status === 'eligible';
      return {
        email: typeof item.referredEmail === 'string' ? item.referredEmail : '',
        status: eligible ? 'eligible' : 'pending',
        miningActive: isMiningActive,
        bonusEarnedBng: eligible ? Math.max(0, Number(item.bonusBng) || BONUS_BNG) : 0,
        createdAt: item.createdAt && typeof item.createdAt.toDate === 'function' ? item.createdAt.toDate().toISOString() : null
      };
    }));
    referredUsers.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const activeCount = referredUsers.filter(person => person.miningActive).length;
    const referralEarnedBng = referredUsers.reduce((sum, person) => sum + person.bonusEarnedBng, 0);
    return json(200, {
      referralLink: `${SITE_URL}/mining?ref=${encodeURIComponent(uid)}`,
      eligibleCount, pendingCount, activeCount, referralEarnedBng, referredUsers,
      referredBy: ownSnap.exists ? ownSnap.data().referrerUid : null,
      bonusBng: BONUS_BNG
    });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('referral failed:', error);
    return json(status, { error: status === 500 ? 'Unable to process referral right now.' : error.message });
  }
};
