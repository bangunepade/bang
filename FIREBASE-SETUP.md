# BANG BNG Community — production authentication setup

## 1. Create Firebase project
Create a Firebase project and a Web App. Enable:
- Authentication → Google
- Authentication → Email/Password
- Firestore
- Functions
- Hosting (optional)

The Web App configuration is already connected in `firebase-config.js` for the `bang-bng-community` project.

## 2. Authorized domain
In Firebase Authentication settings add:
- `1bang.top`
- your Netlify preview domain if you use one

## 3. Deploy backend
From this folder, install Firebase CLI and run:
`firebase login`
`firebase use bang-bng-community`
`cd functions && npm install && cd ..`
`firebase deploy --only functions,firestore`

## 4. Make yourself owner
Create/sign in with the owner's account first. Then, using Firebase Admin credentials locally (never upload this credential to the website):
`cd functions`
`GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json node set-admin.js owner@example.com`

Sign out and back in. The Owner Admin button will appear.

## 5. Password reset
Users use "Forgot password?" and Firebase sends a reset email.
Admins can trigger a reset link, but admins never see user passwords.

## Security
Do not put a service-account JSON, Firebase Admin credentials, or any secret in the website.
The admin dashboard is protected by Firebase custom claims and server-side Cloud Functions.


## Current connection
- Firebase project: `bang-bng-community`
- Firestore user profiles: `/users/{uid}`
- Community messages: `/rooms/{roomId}/messages/{messageId}`
- Google sign-in: Firebase Authentication popup
- Email/password sign-in and password reset: Firebase Authentication
- Admin authorization: Firebase custom claim `admin=true`

## Before going live
1. In Firebase Authentication → Settings → Authorized domains, add `1bang.top` and the exact Netlify domain used for deployment.
2. Deploy the included Firestore rules so the chat message rules become active.
3. Deploy the Functions before using the Owner Admin dashboard.
4. Set the owner custom claim with `functions/set-admin.js`, then sign out and back in.


## Mining balance permissions — required deployment
The site ZIP alone does **not** publish Firestore rules to Firebase. The included `firestore.rules` allows an authenticated user to read and update only `/miningUsers/{their Firebase UID}` and validates the expected fields. To publish it from this project folder, run:

```sh
firebase login
firebase use bang-bng-community
firebase deploy --only firestore:rules
```

Alternatively, open Firebase Console → project `bang-bng-community` → Firestore Database → Rules, paste the contents of `firestore.rules`, and click **Publish**. Confirm that the rules are published in the same project ID as `firebase-config.js`. Then test: sign in, start mining, wait for a save action (start/pause), sign out, sign back in, and confirm Pending BNG / Total Earned remain. Check the browser console and Firestore Data tab if reads or writes still fail.

**Important limitation:** this browser-side mining implementation is a persistent reward estimate, not a secure on-chain mining contract. A user who controls their browser can manipulate client-side values. Do not treat pending rewards as real transferable BNG; production-grade rewards require server-authoritative accounting and a properly secured distribution contract/wallet.

## Built-in FAQ assistant
`bng-faq-bot.js` is included on the home, Community, and Mining pages. It is a local keyword-based FAQ assistant and does not send user questions to an external AI service. Answers describe current functionality and explicitly state that on-chain claiming is not enabled.
