# 48-hour internal-ledger mining update

- Mining sessions accrue for a maximum of 48 hours from their server-recorded start time.
- BNG accrual keeps the existing promotional-window rules and normal rate.
- BTC is a separate **internal demonstration ledger** entry, not real Bitcoin mining, a blockchain balance, or a guaranteed payout.
- The internal BTC rate defaults to `0.00001 BTC/day` and can be configured in Netlify as `INTERNAL_BTC_PER_DAY`. This only changes internal demo entries.
- Real BTC mining requires proof-of-work mining hardware or a pool, and real BNG payouts require an authorized on-chain distribution mechanism.
- Existing Firestore records are retained; the new `btcPending` and `btcTotal` fields are added when sessions are updated.
- Deploy the full ZIP to the same Netlify site and ensure `FIREBASE_SERVICE_ACCOUNT_JSON` remains configured. Do not replace Firestore rules with permissive rules.

The campaign is not a guarantee that a browser stays open or that real crypto is generated. Server-side timestamps prevent refreshes from resetting the 48-hour limit.
