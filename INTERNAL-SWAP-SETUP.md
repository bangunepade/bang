# Internal multi-asset swaps — BNG gas fee

The authenticated `/.netlify/functions/internal-swap` endpoint and `/api/wallet/swap` route support swaps in either direction among BNG, BTC, USDT, ADA, BCH, ETH, SOL, DOGE and XRP. BNB is also retained as a legacy supported asset in this build.

## Fee behavior
- Every successful internal swap charges a separate **0.50% BNG fee**, calculated from the BNG-equivalent value of the input amount using server-configured rates.
- The fee is debited from the user's BNG balance, even when the source asset is not BNG. Swapping from BNG therefore requires enough BNG for both the input and the fee.
- The fee is credited to the configured internal treasury in the same atomic Firestore transaction as the swap.
- A swap fails without changing balances if the user lacks the input asset or BNG fee, the destination treasury reserve is insufficient, a rate is missing/invalid, or the request ID was already processed.

## Required Netlify environment variables
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase Admin service account JSON.
- `BANG_ADMIN_UID`: UID of the treasury account holding internal ledger reserves.
- `BNG_PER_BTC`
- `BNG_PER_USDT`
- `BNG_PER_BNB` (for legacy BNB support)
- `BNG_PER_ADA`
- `BNG_PER_BCH`
- `BNG_PER_ETH`
- `BNG_PER_SOL`
- `BNG_PER_DOGE`
- `BNG_PER_XRP`

Each `BNG_PER_<ASSET>` value follows the established convention: units of that asset equal to 1 BNG. Use trusted, maintained rates. The endpoint fails closed when a required rate is absent or invalid. The treasury must hold sufficient, accounted destination-asset reserves; do not fabricate reserves.

## Test before production
1. Deploy to a Netlify deploy preview and use two or more test accounts.
2. Test all supported pairs in both directions, especially non-BNG source assets with insufficient BNG gas balance.
3. Test insufficient input balance, insufficient treasury reserve, missing/invalid rates, duplicate swap IDs and concurrent swaps.
4. Reconcile wallet balances, treasury balances, `walletSwaps`, and `walletTransactions` after each test.
5. Keep real on-chain swaps disabled until a reviewed router is deployed and configured.

**Important:** these are internal website ledger exchanges, not on-chain transactions or proof of real crypto reserves. Native BNG gas on a future BANG BNG blockchain is different from this internal BNG ledger fee. The current 0.50% fee is accounted in the website's internal ledger only.
