# Temporary BNG mining promotion — deployment notes

- The one-time global promotion begins when the first authenticated account starts mining.
- During the 20-minute window, active mining accrues at 1,000,000,000,000 provisional BNG per minute.
- After the campaign's fixed end timestamp, mining accrues at the normal 1 provisional BNG per 24 hours.
- Start/end timestamps are stored in Firestore at `globalMiningConfig/temporaryBoost`; pausing, resuming, or redeploying does not restart the campaign.
- Mining rewards are internal website ledger entries only. They are not on-chain BNG and do not imply that BTC, BNB, or USDT reserves exist.
- Mining-to-wallet withdrawals and internal transfer request limits were raised to 1e15 to accommodate the campaign. This is a technical cap, not a promise of liquidity or value.
- Test with a non-production Firebase project first. Large balances can expose numeric precision, display, fee, and accounting assumptions.
- Never present provisional ledger balances as cash-equivalent or guaranteed redeemable assets. External swaps require real reserves, pricing, liquidity, and a deployed swap mechanism.
