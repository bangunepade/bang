# BANG BNG mining/staking update notes

- Mining reward rate: 10% monthly is not a real-world mining yield; the existing mining engine still accrues according to its configured internal ledger rate and session/campaign rules. It must not be described as 10% of deposited principal unless that principal-based logic is separately implemented and verified.
- Staking server rules: 100 BNG minimum, 10,000,000 BNG maximum, 30-day term, 10% reward on net stake at maturity. The 10% is a configured internal-ledger reward, not a guaranteed return or on-chain yield.
- Fee rate set to 0.878690% for mining-to-dashboard transfers, staking deposits, and P2P offer creation. Fees are internal ledger fees.
- These balances and transactions are internal Firestore ledger records, not on-chain transfers or guaranteed value. External deposits still require a deployed chain and trusted transaction verifier.
