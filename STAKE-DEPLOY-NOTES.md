# BANG BNG Internal Staking — Deployment Notes

## Features
- Stake available provisional mined BNG from `miningUsers/{uid}.pending`.
- Full-term configured reward: 10% after 7 days. Early withdrawal is prorated by elapsed time and capped at 10%.
- Principal plus reward is credited to the user's internal `walletBalances/{uid}.bng` ledger.
- Scheduled `stake-maturity` function processes matured active stakes every 5 minutes.
- Stake and payout changes are server-side only; `bngStakes` client reads/writes are denied in Firestore rules.
- User-facing page: `/stake.html`.

## Deploy
1. Confirm Netlify environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` is configured for the same Firebase project as `firebase-config.js`.
2. Deploy the site and Netlify Functions. Scheduled functions require a Netlify plan/site configuration that supports Scheduled Functions; verify the scheduled function is enabled in Netlify.
3. Deploy Firestore rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes`.
4. Test with two non-production accounts: start mining, stake a small amount, verify pending mined balance decreases, try early withdrawal, and confirm wallet balance and ledger transaction. For maturity testing, use a staging-only shortened term rather than editing production records.
5. Verify direct client writes to `bngStakes`, `walletBalances`, and `walletTransactions` are denied.

## Important disclosures
This is an internal website ledger, not an on-chain staking contract. The 10% configured reward is an accounting rule and is not proof of reserves, market value, or a guarantee of transferable tokens. Before publicly offering this feature, confirm the platform has enough authorized BNG reserves and obtain appropriate legal/compliance review. Never describe internal ledger balances as on-chain assets.
