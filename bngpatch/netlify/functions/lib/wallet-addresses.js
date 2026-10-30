const crypto = require('crypto');
const ASSETS = ['BNG','BTC','BNB','USDT','ADA','BCH','ETH','SOL','DOGE','XRP'];

async function ensureAssetAddress(admin, uid, asset) {
  const db = admin.firestore();
  const addressRef = db.collection('walletAddresses').doc(uid);
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = asset + '-' + crypto.randomBytes(16).toString('hex').toUpperCase();
    const result = await db.runTransaction(async tx => {
      const existing = await tx.get(addressRef);
      const data = existing.exists ? existing.data() : {};
      const addresses = data.addresses && typeof data.addresses === 'object' ? data.addresses : {};
      const current = String(addresses[asset] || (asset === 'BNG' ? data.address || '' : '') || '');
      if (current) {
        const lookupRef = db.collection('walletAddressLookup').doc(current);
        const lookup = await tx.get(lookupRef);
        if (!lookup.exists) tx.create(lookupRef, {
          uid, address: current, asset,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        if (!addresses[asset] || (asset === 'BNG' && !data.address)) {
          tx.set(addressRef, {
            addresses: { ...addresses, [asset]: current },
            ...(asset === 'BNG' ? { address: current } : {}),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
        return { address: current };
      }
      const lookupRef = db.collection('walletAddressLookup').doc(candidate);
      const lookup = await tx.get(lookupRef);
      if (lookup.exists) return { collision: true };
      tx.set(addressRef, {
        uid,
        addresses: { ...addresses, [asset]: candidate },
        ...(asset === 'BNG' ? { address: candidate } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      tx.create(lookupRef, {
        uid, address: candidate, asset,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { address: candidate };
    });
    if (result.address) return result.address;
  }
  const error = new Error('Could not create your internal ' + asset + ' wallet address. Please try again.');
  error.statusCode = 503;
  throw error;
}

async function ensureAllAssetAddresses(admin, uid) {
  const walletAddresses = {};
  for (const asset of ASSETS) walletAddresses[asset] = await ensureAssetAddress(admin, uid, asset);
  return walletAddresses;
}
module.exports = { ASSETS, ensureAssetAddress, ensureAllAssetAddresses };
