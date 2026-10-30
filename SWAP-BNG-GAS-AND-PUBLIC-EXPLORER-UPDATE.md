# Multi-asset swap with BNG gas fee

- Authenticated internal swaps support BNG, BTC, USDT, ADA, BCH, ETH, SOL, DOGE and XRP in either direction. Legacy BNB support remains available.
- A separate 0.50% fee is charged in BNG, calculated from the source amount's BNG-equivalent value using server-configured `BNG_PER_*` rates.
- The fee is debited from the user's BNG balance and credited to the configured treasury in the same atomic transaction as the swap.
- Swaps fail closed if the user lacks the source balance or BNG fee, the destination treasury lacks reserves, rates are missing/invalid, or a request ID has already been processed.
- Each successful swap receives a permanent `BNG-TX-` transaction ID and a receipt with the pair, output, BNG fee and Explorer verification link.
- These records are internal-ledger entries only; no blockchain transaction or blockchain hash is created.

## Required configuration
`FIREBASE_SERVICE_ACCOUNT_JSON`, `BANG_ADMIN_UID`, and `BNG_PER_BTC`, `BNG_PER_USDT`, `BNG_PER_ADA`, `BNG_PER_BCH`, `BNG_PER_ETH`, `BNG_PER_SOL`, `BNG_PER_DOGE`, `BNG_PER_XRP`. `BNG_PER_BNB` is additionally required when BNB is used. Each rate is the number of units of that asset equal to 1 BNG. Use trusted maintained rates and a treasury with accounted reserves. Never fabricate balances or claim internal ledger units are withdrawable coins.
