// Run locally with Firebase Admin credentials:
// GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json node set-admin.js owner@example.com
const admin = require("firebase-admin");
admin.initializeApp();
const email = process.argv[2];
if (!email) throw new Error("Usage: node set-admin.js owner@example.com");
admin.auth().getUserByEmail(email)
  .then(u => admin.auth().setCustomUserClaims(u.uid, {admin:true}))
  .then(() => console.log("Admin claim set. Sign out and back in on the website."))
  .catch(console.error);
