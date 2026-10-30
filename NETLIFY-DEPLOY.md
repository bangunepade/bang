# BANG BNG — Netlify deployment

This folder is ready to upload to Netlify as a static site with Netlify Functions.

## Deploy
1. Upload the contents of this folder (or the ZIP) to Netlify.
2. Set the site domain to `1bang.top` when ready.
3. In Firebase Authentication → Settings → Authorized domains, add `1bang.top` and the exact Netlify domain.
4. Firebase Authentication and Firestore remain on Firebase. Mining state/toggle now run through Netlify Functions so mining itself does not require Firebase Cloud Functions. Other community/admin/account-management actions that still call Firebase Cloud Functions remain separate and may require Blaze.

## Important
- `firebase-config.js` contains the normal Firebase Web SDK configuration; it does not contain a Firebase Admin service-account secret.
- Never upload a service-account JSON file.
- The Owner Admin UI only trusts the secure Firebase custom claim `admin=true`.
- The Log Out button now performs a real Firebase sign-out.

## Netlify Functions
The Netlify functions are in `netlify/functions/` and are configured by `netlify.toml`.

## Firebase rules required for chat and permanent mining balances

After deploying the website to Netlify, open Firebase Console → Firestore Database → Rules, replace the rules with the included `firestore.rules`, and click **Publish**. Uploading the file to Netlify alone does not publish Firestore security rules. These rules keep each mining balance private to its owner and allow authenticated users to read/send community messages. Do not use public write rules.

## Authentication setup

In Firebase Console → Authentication → Sign-in method, enable **Email/Password** and **Google**. Under Authentication → Settings → Authorized domains, make sure `1bang.top`, `www.1bang.top`, and your active `*.netlify.app` domain are listed. An address such as `support@1bang.top` can be used as a Firebase login email only after someone creates that account with a password (or you create it through Firebase Admin); this does not create an email inbox. Password reset emails require a real, accessible mailbox and configured Firebase email delivery.

## Mining balance notes

The website persists pending mining rewards in Firestore per Firebase UID. It is an in-site pending reward estimate, not an on-chain BNG transfer. The reward calculation is 1 BNG per 24 hours while a saved mining session is running. Users cannot reset their saved balance with the Pause Mining button. Deploy the included Firestore rules for this feature to work.


## Included FAQ assistant
The floating “BNG Help” chat is included on the home, Community, and Mining pages. It answers common FAQs locally. It does not provide live human support and never asks for passwords, one-time codes, seed phrases, or private keys.

## Deploying the balance fix correctly
Netlify deploys the website files only. Firestore rules must separately be published to the `bang-bng-community` Firebase project using `firebase deploy --only firestore:rules` from the project folder, or by publishing the included `firestore.rules` in Firebase Console. Do not assume that uploading this ZIP to Netlify deploys Firebase rules.


## Free-plan mining backend (Netlify Functions)

Mining uses `netlify/functions/mining-state.js` and `netlify/functions/mining-toggle.js`. They verify the Firebase ID token server-side and only read/write `miningUsers/{verified Firebase UID}` through the Firebase Admin SDK. Browser clients still cannot write mining balances directly; keep the included `firestore.rules` restrictive.

### Required one-time configuration

1. In Google Cloud Console for project `bang-bng-community`, create or select a service account with the minimum Firestore access needed (typically **Cloud Datastore User**). Do not use a broad Owner role.
2. Create a JSON key only if your deployment policy permits service-account keys. Keep it private; never put it in the ZIP, website files, Git, or `firebase-config.js`.
3. In Netlify → Site configuration → Environment variables, add `FIREBASE_SERVICE_ACCOUNT_JSON` with the entire service-account JSON as its value. Limit who can edit Netlify environment variables. Trigger a fresh deploy after setting it.
4. Keep the Firebase project ID as `bang-bng-community`, and make sure the Firebase Authentication user accounts are in that same project.
5. Test with a normal test account: load `/mining`, start, pause, refresh, and sign in again. Verify only that user's `/miningUsers/{uid}` document changes. Never test by opening public Firestore writes.

Netlify Functions may be available on a free tier subject to Netlify's current usage limits. This is not a guarantee of zero cost across all services. Firebase Firestore usage limits still apply. The server-side reward record is provisional and is not an on-chain token transfer.

### Important limitation

This changes the mining endpoints only. `community.html` still calls Firebase Cloud Functions for some admin/account operations (such as account deletion and user administration). Those operations are not migrated by this mining fix and may still require a Firebase billing-plan upgrade. Do not delete the original `functions/` directory until those workflows are migrated and tested separately.
