BANG BNG rule update

- New accounts created on/after 2026-10-23T00:00:00Z can receive a one-time 2 BNG internal-ledger welcome bonus. It is idempotent per Firebase UID and recorded in welcomeBonuses and walletTransactions. Existing accounts are not backfilled.
- Minimum BNG wallet transfer: 10 BNG (enforced server-side). Non-BNG transfer rules remain unchanged.
- P2P escrow: BNG only, minimum 10 BNG per offer (enforced server-side and in the UI).
- Swaps: minimum input value of 1 BNG-equivalent (enforced server-side); the 0.50% BNG fee and treasury/rate checks remain.
- These are internal ledger entries, not on-chain assets or guaranteed redeemable value.

- P2P offer creation requires at least 10 BNG in available wallet balance. The UI disables publishing below 10 BNG, and the server rechecks the balance transactionally before locking funds.
