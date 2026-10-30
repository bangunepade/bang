# BNG simulated reference-price integration

- BNG/USDT and BNG/BNB endpoint responses now return a deterministic demo price constrained to $0.30–$1.00 and daily illustrative candles starting 2025-08-01.
- The endpoint explicitly labels the data `simulated`, `SIMULATED_DEMO`, and `ledgerOnly`; it is not verified exchange data, liquidity, redemption value, or an on-chain oracle.
- Internal swaps and transfers calculate BNG-equivalent conversion/fees using the same simulated BNG USD reference. BTC and BNB conversions use `BTC_USD_PRICE` and `BNB_USD_PRICE` environment values (defaults 100000 and 600 respectively); configure these for the intended demo scenario.
- Wallet, P2P, swap, mining, explorer, chart and home surfaces show a clear simulated-price ribbon. P2P market pricing that already requests `/api/bng-price` receives the simulated BNG reference.
- Internal balances and explorer transactions remain internal ledger records. This does not create liquidity, token market value, on-chain swaps, or real historical market data.
- Deploy by publishing the ZIP contents to the connected Netlify site. Do not overwrite Firebase rules or existing user data.


## Price-label presentation
- The compact site ribbon uses “INTERNAL REFERENCE” and states that it is not a live exchange quote.
- The backend/API retains explicit simulation metadata so integrations and users are not misled about source, liquidity, or redemption value.
