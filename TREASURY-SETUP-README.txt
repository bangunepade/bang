BANG BNG TREASURY CONFIGURATION — READ BEFORE DEPLOYING

PURPOSE
This release improves the existing admin-only wallet balance tool so it can view and audit-adjust all assets supported by the internal swap endpoint, and fixes the internal BNG reference-price response. It does not mint real tokens or create external liquidity.

NETLIFY ENVIRONMENT VARIABLES TO VERIFY
- FIREBASE_SERVICE_ACCOUNT_JSON: valid Firebase Admin service-account JSON for the same Firebase project used by the live site. Keep secret; never put it in frontend files or chat.
- BANG_ADMIN_UID: Firebase UID of the dedicated treasury account whose walletBalances/{uid} document holds internal treasury reserves.
- BNB_USD_PRICE and BTC_USD_PRICE: if retained, use accurate, regularly updated reference prices; the code defaults are illustrative fallbacks, not guaranteed live quotes.
- BNG_PER_ADA, BNG_PER_BCH, BNG_PER_ETH, BNG_PER_SOL, BNG_PER_DOGE, BNG_PER_XRP: positive server-side values are required for these asset conversions. Convention: 1 unit of the quote asset equals this many BNG, as used by internal-swap.js. Verify the exact intended rates before enabling those pairs.

HOW TO RECORD A TREASURY RESERVE
1. Confirm BANG_ADMIN_UID is the intended treasury Firebase UID.
2. Sign in as an account with the Firebase Admin custom claim admin=true. The email address alone does not grant admin access.
3. Use the existing administrator balance controls to inspect the treasury UID and choose the relevant asset.
4. Only credit the amount that is genuinely backed by assets or that you explicitly intend to offer as a clearly labelled internal, non-redeemable ledger reserve. Record a specific audit reason.
5. Test with a small amount on a preview deploy, and confirm the user balance, treasury balance, fee entry, and swap receipt all reconcile.

IMPORTANT LIMITATIONS
- walletBalances are internal website ledger units, not proof of reserves, blockchain assets, or a promise of redemption. A ledger credit is not a deposit and must not be presented as one.
- Never add arbitrary large USDT/BTC/BNB balances to make the error disappear. Do not disable the treasury reserve check.
- Admin balance controls require a verified Firebase token carrying the admin=true custom claim. If the owner account does not have that claim, configure it securely in trusted Firebase Admin code; do not add a client-side bypass.
- Keep the current site ZIP backed up. Deploy this ZIP to a preview first, test sign-in, price endpoint, reserve checks, and swaps, then publish only after review.
