const { requireUser, getAdmin, json } = require('./lib/firebase-admin');
const { getSimulatedBngPrice } = require('./lib/bng-market');

function iso(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}
function publicRecord(doc, data, fallbackId) {
  const d = data || {};
  const amountOutRaw = d.amountOut ?? d.outputAmount;
  const gasFeeRaw = d.gasFeeBng ?? (String(d.feeAsset || '').toUpperCase() === 'BNG' ? d.feeAmount : null);
  const txId = String(d.transactionId || d.transferId || d.escrowId || doc || fallbackId || '');
  return {
    id: String(doc || fallbackId || ''),
    transactionId: txId,
    type: String(d.type || d.kind || 'internal_transaction'),
    asset: String(d.asset || d.fromAsset || 'BNG'),
    amount: Number.isFinite(Number(d.amountIn ?? d.amount ?? d.amountOut)) ? Number(d.amountIn ?? d.amount ?? d.amountOut) : null,
    fromAsset: String(d.fromAsset || d.from || d.sourceAsset || ''),
    toAsset: String(d.toAsset || d.to || ''),
    amountOut: amountOutRaw !== null && amountOutRaw !== undefined && Number.isFinite(Number(amountOutRaw)) ? Number(amountOutRaw) : null,
    gasFeeBng: gasFeeRaw !== null && gasFeeRaw !== undefined && Number.isFinite(Number(gasFeeRaw)) ? Number(gasFeeRaw) : null,
    status: String(d.status || 'recorded'),
    createdAt: iso(d.createdAt || d.updatedAt || d.timestamp),
    escrowId: String(d.escrowId || ''),
    bngReferencePriceUsd: getSimulatedBngPrice(),
    priceType: 'SIMULATED_DEMO',
    ledger: 'BANG BNG internal ledger',
    ledgerOnly: true
  };
}
function isPublicActivity(record) {
  const type = String(record.type || '').toLowerCase();
  if (type.includes('internal_swap_fee_received') || type.includes('internal_swap_gas_fee_received')) return false;
  return /(swap|transfer|withdraw|mining|stake|staking|p2p|escrow|trade|deposit|matur|reward)/.test(type) || /^bng-tx-/i.test(record.transactionId);
}
function addSnapshot(found, snap, source) {
  for (const doc of snap.docs || []) {
    const r = publicRecord(doc.id, doc.data());
    if (!isPublicActivity(r)) continue;
    if (source === 'escrow') r.type = 'p2p_' + String(doc.data()?.status || 'trade');
    if (!found.has(r.transactionId) || /swap/.test(r.type)) found.set(r.transactionId || doc.id, r);
  }
}
async function getRecentPublicRecords(db, limit) {
  const found = new Map();
  const collections = [
    ['walletTransactions', 'transactions'],
    ['walletTransfers', 'transfers'],
    ['internalP2PEscrows', 'escrow']
  ];
  for (const [name, source] of collections) {
    let snap;
    try {
      snap = await db.collection(name).orderBy('createdAt', 'desc').limit(limit * 2).get();
    } catch (err) {
      if (err.code !== 9 && !/index|failed-precondition/i.test(String(err.message || ''))) throw err;
      snap = await db.collection(name).limit(limit * 2).get();
    }
    addSnapshot(found, snap, source);
  }
  return [...found.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, limit);
}
async function verifyPublic(event) {
  const admin = getAdmin();
  const db = admin.firestore();
  const params = new URLSearchParams(event.rawQuery || '');
  const term = String(params.get('verify') || '').trim();
  if (!term || term.length > 180) return json(400, { error: 'Enter a transaction ID or internal wallet address.' });
  const found = new Map();
  const addDocs = snap => snap.docs.forEach(doc => {
    const record = publicRecord(doc.id, doc.data());
    if (!isPublicActivity(record)) return;
    if (record.type === 'internal_swap_fee_received' || record.type === 'internal_swap_gas_fee_received') return;
    const key = record.transactionId || doc.id;
    if (!found.has(key) || record.type === 'internal_swap') found.set(key, record);
  });
  const txs = db.collection('walletTransactions');
  const transfers = db.collection('walletTransfers');
  const escrows = db.collection('internalP2PEscrows');
  const isAddress = /^(BNG|BTC|BNB|USDT)-[A-F0-9]{32}$/i.test(term);
  if (isAddress) {
    const lookup = await db.collection('walletAddressLookup').doc(term.toUpperCase()).get();
    if (lookup.exists && lookup.data().uid) {
      const uid = String(lookup.data().uid);
      const [userTxs, asSeller, asBuyer] = await Promise.all([
        txs.where('uid', '==', uid).limit(150).get(),
        escrows.where('sellerUid', '==', uid).limit(50).get(),
        escrows.where('buyerUid', '==', uid).limit(50).get()
      ]);
      addDocs(userTxs);
      for (const snap of [asSeller, asBuyer]) for (const doc of snap.docs) {
        const d = doc.data(); const r = publicRecord(doc.id, { ...d, type: 'p2p_' + String(d.status || 'trade'), transactionId: d.transactionId || 'BNG-TX-' + doc.id.toUpperCase(), createdAt: d.updatedAt || d.createdAt });
        if (isPublicActivity(r)) found.set('escrow-' + doc.id, r);
      }
    }
    const [recipientTx, recipientTransfers, sellerAddress, buyerAddress] = await Promise.all([
      txs.where('recipientAddress', '==', term.toUpperCase()).limit(100).get(),
      transfers.where('recipientAddress', '==', term.toUpperCase()).limit(100).get(),
      escrows.where('sellerAddress', '==', term.toUpperCase()).limit(50).get(),
      escrows.where('buyerAddress', '==', term.toUpperCase()).limit(50).get()
    ]);
    addDocs(recipientTx); addDocs(recipientTransfers);
    for (const snap of [sellerAddress, buyerAddress]) for (const doc of snap.docs) {
      const d = doc.data(); const r = publicRecord(doc.id, { ...d, type: 'p2p_' + String(d.status || 'trade'), transactionId: d.transactionId || 'BNG-TX-' + doc.id.toUpperCase(), createdAt: d.updatedAt || d.createdAt });
      if (isPublicActivity(r)) found.set('escrow-' + doc.id, r);
    }
  } else {
    const normalized = term.toUpperCase();
    const [byTxId, byTransferId, byDoc, byEscrow, transferDoc] = await Promise.all([
      txs.where('transactionId', '==', normalized).limit(100).get(),
      txs.where('transferId', '==', term).limit(100).get(),
      txs.doc(term).get(),
      escrows.doc(term).get(),
      transfers.doc(term).get()
    ]);
    addDocs(byTxId); addDocs(byTransferId);
    if (byDoc.exists) { const r = publicRecord(byDoc.id, byDoc.data()); if (isPublicActivity(r)) found.set(r.transactionId || byDoc.id, r); }
    if (byEscrow.exists) { const d = byEscrow.data(); const r = publicRecord(byEscrow.id, { ...d, type: 'p2p_' + String(d.status || 'trade'), transactionId: d.transactionId || 'BNG-TX-' + byEscrow.id.toUpperCase(), createdAt: d.updatedAt || d.createdAt }); if (isPublicActivity(r)) found.set(r.transactionId || byEscrow.id, r); }
    if (transferDoc.exists) { const r = publicRecord(transferDoc.id, transferDoc.data()); if (isPublicActivity(r)) found.set(r.transactionId || transferDoc.id, r); }
  }
  const transactions = [...found.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 100);
  return json(200, { mode: 'public_verification', ledgerOnly: true, count: transactions.length, transactions, message: transactions.length ? 'Matching internal ledger records found.' : 'No matching records found. Check the ID or wallet address.' });
}
exports.handler = async event => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed.' });
  try {
    const params = new URLSearchParams(event.rawQuery || '');
    if (params.has('verify')) return await verifyPublic(event);
    const limitValue = Number(params.get('limit') || 100);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(200, Math.floor(limitValue))) : 100;
    const db = getAdmin().firestore();
    const transactions = await getRecentPublicRecords(db, limit);
    return json(200, { network: 'BANG BNG Internal Ledger', ledgerOnly: true, publicView: true, limit, count: transactions.length, transactions });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('internal-explorer failed:', error);
    return json(status, { error: status === 500 ? 'Unable to load public explorer records right now.' : error.message });
  }
};
