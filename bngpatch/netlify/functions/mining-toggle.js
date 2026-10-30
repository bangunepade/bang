const { requireUser, json } = require('./lib/firebase-admin');
const { ensurePromoWindow, getPromoConfig, accrued, accruedBtc, cappedEnd, currentRatePerDay, MAX_SESSION_MS, INTERNAL_BTC_PER_DAY } = require('./lib/mining-rate');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const { admin, decoded } = await requireUser(event);
    const db = admin.firestore();
    // One global campaign starts on the first mining start and never restarts.
    await ensurePromoWindow(admin);
    const promoConfig = await getPromoConfig(admin);
    const ref = db.collection('miningUsers').doc(decoded.uid);
    const now = Date.now();
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const referralRef = db.collection('referrals').doc(decoded.uid);
      const referralSnap = await tx.get(referralRef);
      const referral = referralSnap.exists ? referralSnap.data() : null;
      const referrerMiningRef = referral && referral.status === 'pending'
        ? db.collection('miningUsers').doc(referral.referrerUid)
        : null;
      const referrerMiningSnap = referrerMiningRef ? await tx.get(referrerMiningRef) : null;
      const d = snap.exists ? snap.data() : {};
      let pending = Math.max(0, Number(d.pending || 0));
      let total = Math.max(0, Number(d.total || 0));
      let btcPending = Math.max(0, Number(d.btcPending || 0));
      let btcTotal = Math.max(0, Number(d.btcTotal || 0));
      let running = d.running === true;
      let startedAtMs = Math.max(0, Number(d.startedAtMs || 0));

      let referralAwarded = false;
      if (running && startedAtMs > 0) {
        const effectiveEnd = cappedEnd(startedAtMs, now);
        const earned = accrued(startedAtMs, effectiveEnd, promoConfig);
        const btcEarned = 0;
        pending += earned;
        total += earned;
        btcPending += btcEarned;
        btcTotal += btcEarned;
        running = false;
        startedAtMs = 0;
      } else {
        // Only the first start by a referred account qualifies the inviter.
        if (referral && referral.status === 'pending' && referrerMiningRef && referrerMiningSnap) {
          const referrerData = referrerMiningSnap.exists ? referrerMiningSnap.data() : {};
          const bonus = 0.5;
          tx.set(referrerMiningRef, {
            uid: referral.referrerUid,
            email: referrerData.email || '',
            pending: Math.max(0, Number(referrerData.pending || 0)) + bonus,
            total: Math.max(0, Number(referrerData.total || 0)) + bonus,
            running: referrerData.running === true,
            startedAtMs: Math.max(0, Number(referrerData.startedAtMs || 0)),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          tx.update(referralRef, {
            status: 'eligible',
            bonusAwardedAt: admin.firestore.FieldValue.serverTimestamp(),
            bonusBng: bonus
          });
          referralAwarded = true;
        }
        running = true;
        startedAtMs = now;
      }

      tx.set(ref, {
        uid: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email : '',
        pending, total, btcPending, btcTotal, running, startedAtMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { pending, total, btcPending, btcTotal, running, startedAtMs, currentPending: pending, currentTotal: total, currentBtcPending: btcPending, currentBtcTotal: btcTotal, btcRatePerDay: INTERNAL_BTC_PER_DAY, sessionDurationHours: 48, ratePerDay: currentRatePerDay(now, promoConfig), normalRatePerDay: 1.5, boostPerMinute: Number(promoConfig.boostPerMinute || 1e12), promoStartAtMs: Number(promoConfig.promoStartAtMs || 0), promoEndAtMs: Number(promoConfig.promoEndAtMs || 0), promoActive: now < Number(promoConfig.promoEndAtMs || 0), referralAwarded };
    });
    return json(200, result);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('mining-toggle failed:', error);
    return json(status, { error: status === 500 ? 'Unable to update mining right now.' : error.message });
  }
};
