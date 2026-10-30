BANG BNG — Netlify upload package

This archive contains the website files at the archive root, including netlify.toml,
netlify/functions/, public assets, pages, and firestore.rules.

IMPORTANT DEPLOYMENT LIMITS
- A manual drag-and-drop deploy may publish static files but may not build/deploy Netlify Functions.
- For the complete platform (Netlify Functions included), connect the GitHub repository or deploy with Netlify CLI from the extracted project directory.
- Build publish directory: .
- Functions directory: netlify/functions (configured in netlify.toml)
- Do NOT upload Firebase service-account JSON files or paste secrets into website files.
- firestore.rules is NOT deployed by a Netlify deploy. Publish it separately through Firebase Console or Firebase CLI only after testing and approval.
- This package has not been deployed to production and does not change 1bang.top by itself.

SAFE DEPLOY CHECKLIST
1. Keep a backup of the currently deployed site and current Firestore rules.
2. Extract the ZIP so netlify.toml is at the project root.
3. For full deployment, use GitHub-connected Netlify or Netlify CLI; verify that Functions are included in the deploy log.
4. Configure required server-side environment variables in Netlify Site configuration; never put secrets in frontend files.
5. Deploy to a preview/branch deploy first. Test sign-in, profile editing, chat, mining, OTP and API endpoints with test accounts.
6. Publish Firestore rules separately only after Emulator Suite tests and owner approval.

The included hardened Firestore rules are a proposed change. They have not been verified in the Firebase Emulator Suite or deployed.
