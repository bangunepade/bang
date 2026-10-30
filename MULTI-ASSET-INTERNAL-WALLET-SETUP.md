# BANG BNG multi-asset internal ledger setup

## What this adds
- Internal ledger balances and account-specific internal addresses for BNG, BTC, BNB, and USDT. These are NOT public blockchain deposit addresses and do not hold or prove reserves of native crypto.
- Internal transfers for each asset. A 0.50% fee is charged in BNG and credited to the configured admin wallet.
- Admin-only credit/debit/set controls for internal balances with a reason and immutable-style audit/transaction records. These controls create ledger entries, not real crypto.

## Required Netlify environment variables
- `FIREBASE_SERVICE_ACCOUNT_JSON`: existing Firebase Admin service account JSON.
- `BANG_ADMIN_UID`: Firebase UID of the account that receives transfer fees. Must be set explicitly.
- `BNG_PER_USDT`: BNG units per 1 USDT for fee conversion.
- `BNG_PER_BNB`: BNG units per 1 BNB for fee conversion.
- `BNG_PER_BTC`: BNG units per 1 BTC for fee conversion.

The fee for a transfer of a non-BNG asset is `transfer amount × configured BNG-per-asset rate × 0.005`. Do not set arbitrary conversion values in production; maintain rates from a trusted price source and monitor them. Transfers for an asset fail closed if its rate is missing or invalid. BNG transfers charge 0.5% of the BNG amount. Sender must have enough BNG to pay the fee in addition to the transferred amount.

## Deploy and test
1. Set the environment variables in Netlify and redeploy.
2. Deploy Firestore rules: `firebase deploy --only firestore:rules`.
3. Confirm the admin account has Firebase custom claim `admin: true` and that `BANG_ADMIN_UID` matches its UID.
4. Test with two non-production accounts: address creation, each asset transfer, fee debit/credit, duplicate request rejection, insufficient BNG fee balance, invalid address rejection, and admin credit/debit/set with audit record.
5. Verify transaction history and CSV export.

## Accounting / safety notes
These are internal ledger units only. They are not real BTC/BNB/USDT deposits, not on-chain transfers, and not a proof of backing. Admin balance controls can create unbacked ledger balances; keep them restricted and audit every change. The 0.50% charge is an internal platform fee, not a blockchain gas fee.
