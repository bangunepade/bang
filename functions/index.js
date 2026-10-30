const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();
const auth = admin.auth();
const db = admin.firestore();
const MINING_RATE_PER_DAY = 1;

function requireSignedIn(request) {
  if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "Please sign in first.");
}


function requireAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }
}

// Owner-only user listing. Passwords are never returned.
exports.listUsers = onCall(async (request) => {
  requireAdmin(request);
  const users = [];
  let page = await auth.listUsers(1000);
  while (true) {
    for (const u of page.users) {
      users.push({
        uid: u.uid, email: u.email || "", displayName: u.displayName || "",
        disabled: !!u.disabled, provider: (u.providerData[0] && u.providerData[0].providerId) || "password",
        createdAt: u.metadata.creationTime || null,
        lastSignIn: u.metadata.lastSignInTime || null
      });
    }
    if (!page.pageToken) break;
    page = await auth.listUsers(1000, page.pageToken);
  }
  return {users};
});

exports.disableUser = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  if (!uid) throw new HttpsError("invalid-argument", "User ID is required.");
  if (uid === request.auth.uid) throw new HttpsError("failed-precondition", "You cannot disable your own account.");
  await auth.updateUser(uid, {disabled: true});
  return {ok:true};
});

exports.enableUser = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  if (!uid) throw new HttpsError("invalid-argument", "User ID is required.");
  await auth.updateUser(uid, {disabled: false});
  return {ok:true};
});


exports.deleteMyAccount = onCall(async (request) => {
  requireSignedIn(request);
  const uid = request.auth.uid;
  // Client must reauthenticate with the account owner's valid email/password first.
  // The callable also requires a recently authenticated Firebase ID token.
  const authTime = Number(request.auth.token.auth_time || 0);
  if (!authTime || (Date.now() / 1000 - authTime) > 5 * 60) {
    throw new HttpsError("failed-precondition", "Please sign in again with your email and password, then retry account deletion.");
  }
  // Remove user-owned profile/mining documents and chat messages before deleting Auth.
  const batchDeleteQuery = async (query) => {
    let snap = await query.limit(400).get();
    while (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      if (snap.size < 400) break;
      snap = await query.limit(400).get();
    }
  };
  await db.collection("users").doc(uid).delete().catch(() => {});
  await db.collection("miningUsers").doc(uid).delete().catch(() => {});
  await batchDeleteQuery(db.collectionGroup("messages").where("uid", "==", uid));
  await auth.deleteUser(uid);
  return {ok:true};
});

exports.deleteUser = onCall(async (request) => {
  requireAdmin(request);
  const uid = String(request.data?.uid || "");
  if (!uid) throw new HttpsError("invalid-argument", "User ID is required.");
  if (uid === request.auth.uid) throw new HttpsError("failed-precondition", "You cannot delete your own account.");
  await auth.deleteUser(uid);
  return {ok:true};
});

// All authoritative mining writes happen on the server; clients cannot edit balances directly.
exports.getMiningState = onCall(async (request) => {
  requireSignedIn(request);
  const uid = request.auth.uid;
  const snap = await db.collection("miningUsers").doc(uid).get();
  const d = snap.exists ? snap.data() : {};
  const pending = Math.max(0, Number(d.pending || 0));
  const total = Math.max(0, Number(d.total || 0));
  const running = !!d.running;
  const startedAtMs = Number(d.startedAtMs || 0);
  const earned = running && startedAtMs > 0 ? Math.max(0, (Date.now() - startedAtMs) / 86400000 * MINING_RATE_PER_DAY) : 0;
  return { pending, total, running, startedAtMs, currentPending: pending + earned, currentTotal: total + earned, ratePerDay: MINING_RATE_PER_DAY };
});

exports.toggleMining = onCall(async (request) => {
  requireSignedIn(request);
  const uid = request.auth.uid;
  const ref = db.collection("miningUsers").doc(uid);
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : {};
    let pending = Math.max(0, Number(d.pending || 0));
    let total = Math.max(0, Number(d.total || 0));
    let running = !!d.running;
    let startedAtMs = Number(d.startedAtMs || 0);
    const now = Date.now();
    if (running && startedAtMs > 0) {
      const earned = Math.max(0, (now - startedAtMs) / 86400000 * MINING_RATE_PER_DAY);
      pending += earned; total += earned; running = false; startedAtMs = 0;
    } else {
      running = true; startedAtMs = now;
    }
    tx.set(ref, { uid, email: request.auth.token.email || "", pending, total, running, startedAtMs, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { pending, total, running, startedAtMs, currentPending: pending, currentTotal: total, ratePerDay: MINING_RATE_PER_DAY };
  });
});

exports.passwordResetLink = onCall(async (request) => {
  requireAdmin(request);
  const email = String(request.data?.email || "").trim();
  if (!email) throw new HttpsError("invalid-argument", "Email is required.");
  const link = await auth.generatePasswordResetLink(email);
  // The link is returned to the owner only so it can be delivered through
  // a configured email provider. For production, prefer sending it server-side.
  return {link};
});
