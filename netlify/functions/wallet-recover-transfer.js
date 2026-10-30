const { requireUser, json } = require('./lib/firebase-admin');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try {
    const { admin, decoded } = await requireUser(event);
    if (decoded.admin !== true) return json(403, { error: 'Administrator permission is required.' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { error: 'Invalid request body.' }); }
    const transferId = typeof body.transferId === 'string' ? body.transferId.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!/^[a-f0-9-]{20,80}$/i.test(transferId)) return json(400, { error: 'Enter the exact internal transfer ID.' });
    if (reason.length < 8 || reason.length > 500) return json(400, { error: 'Enter an audit reason between 8 and 500 characters.' });

    const db = admin.firestore();
    const transferRef = db.collection('walletTransfers').doc(transferId);
    const recoveryRef = db.collection('walletTransferRecoveries').doc(transferId);
    const result = await db.runTransaction(async (tx) => {
      const [transferSnap, recoverySnap] = await Promise.all([tx.get(transferRef), tx.get(recoveryRef)]);
      if (!transferSnap.exists) { const e = new Error('Transfer not found.'); e.statusCode = 404; throw e; }
      if (recoverySnap.exists) { const e = new Error('This transfer already has an administrator recovery record.'); e.statusCode = 409; throw e; }
      const transfer = transferSnap.data() || {};
      if (transfer.asset !== 'BNG' || transfer.status !== 'completed_internal_transfer' || !transfer.fromUid || !transfer.toUid || transfer.fromUid === transfer.toUid) {
        const e = new Error('Only completed internal BNG transfers can be recovered.'); e.statusCode = 409; throw e;
      }
      const amount = Number(transfer.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12 || Math.round(amount * 1e6) / 1e6 !== amount) {
        const e = new Error('Transfer amount is invalid; recovery was stopped.'); e.statusCode = 409; throw e;
      }
      const senderRef = db.collection('walletBalances').doc(transfer.fromUid);
      const recipientRef = db.collection('walletBalances').doc(transfer.toUid);
      const senderTxRef = db.collection('walletTransactions').doc('recovery_' + transferId + '_sender');
      const recipientTxRef = db.collection('walletTransactions').doc('recovery_' + transferId + '_recipient');
      const [senderSnap, recipientSnap] = await Promise.all([tx.get(senderRef), tx.get(recipientRef)]);
      const senderBalance = Math.max(0, Number(senderSnap.exists ? senderSnap.data().bng || 0 : 0));
      const recipientBalance = Math.max(0, Number(recipientSnap.exists ? recipientSnap.data().bng || 0 : 0));
      if (recipientBalance + 1e-9 < amount) { const e = new Error('Recovery denied: recipient no longer has enough BNG in their internal balance. No balances were changed.'); e.statusCode = 409; throw e; }
      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.set(recipientRef, { uid: transfer.toUid, bng: Math.round((recipientBalance - amount) * 1e6) / 1e6, updatedAt: now }, { merge: true });
      tx.set(senderRef, { uid: transfer.fromUid, bng: Math.round((senderBalance + amount) * 1e6) / 1e6, updatedAt: now }, { merge: true });
      tx.create(recoveryRef, { transferId, fromUid: transfer.fromUid, toUid: transfer.toUid, amount, asset: 'BNG', reason, recoveredByUid: decoded.uid, status: 'recovered_by_admin', createdAt: now, ledgerOnly: true });
      tx.create(senderTxRef, { transactionId: 'recovery_' + transferId, transferId, uid: transfer.fromUid, fromUid: transfer.toUid, toUid: transfer.fromUid, type: 'admin_transfer_recovery_received', asset: 'BNG', amount, status: 'recovered_by_admin', reason, recoveredByUid: decoded.uid, createdAt: now, ledgerOnly: true });
      tx.create(recipientTxRef, { transactionId: 'recovery_' + transferId, transferId, uid: transfer.toUid, fromUid: transfer.toUid, toUid: transfer.fromUid, type: 'admin_transfer_recovery_sent', asset: 'BNG', amount, status: 'recovered_by_admin', reason, recoveredByUid: decoded.uid, createdAt: now, ledgerOnly: true });
      tx.update(transferRef, { recoveryStatus: 'recovered_by_admin', recoveredAt: now, recoveredByUid: decoded.uid, recoveryReason: reason });
      return { transferId, amount, asset: 'BNG', status: 'recovered_by_admin', senderUid: transfer.fromUid, recipientUid: transfer.toUid, auditRecorded: true };
    });
    return json(200, result);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('wallet-recover-transfer failed:', error);
    return json(status, { error: status === 500 ? 'Unable to recover this transfer right now.' : error.message });
  }
};
