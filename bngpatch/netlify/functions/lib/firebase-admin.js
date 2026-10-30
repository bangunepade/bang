const admin = require('firebase-admin');

function getAdmin() {
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    const error = new Error('Mining backend is not configured: missing FIREBASE_SERVICE_ACCOUNT_JSON in Netlify environment variables.');
    error.statusCode = 503;
    throw error;
  }
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (_) {
    const error = new Error('Mining backend configuration is invalid.');
    error.statusCode = 503;
    throw error;
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || 'bang-bng-community'
  });
  return admin;
}

async function requireUser(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    const error = new Error('Please sign in again to use mining.');
    error.statusCode = 401;
    throw error;
  }
  const firebase = getAdmin();
  try {
    const decoded = await firebase.auth().verifyIdToken(match[1], true);
    return { admin: firebase, decoded };
  } catch (_) {
    const error = new Error('Your sign-in has expired. Please sign in again.');
    error.statusCode = 401;
    throw error;
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

module.exports = { getAdmin, requireUser, json };
