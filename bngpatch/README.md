# BANG BNG website

This build uses BNG only as an internal website ledger unit. No public BNG token contract is configured.

## Live price integration
- The previous synthetic BNGUSDT price and candles have been removed.
- `/.netlify/functions/bng-price` returns the internal BNG reference-price series and public market data only for supported external assets.
- The dashboard and `/chart.html` refresh the live market every 30 seconds.
- BNG reference prices are internal ledger reference values, not exchange quotes or guaranteed redemption values.
- External BTC/BNB price data may be unavailable when market data providers fail.
- The dashboard chart is a live price history collected while the page is open; it does not fabricate historical candles.

Deploy on Netlify with the included `netlify/functions/bng-price.js`.


## Visitor analytics
This build includes privacy-conscious server-side visitor analytics using Netlify Functions + Netlify Blobs.

Tracked events:
- `visit`: page visit/session start
- `active`: heartbeat while the page is visible
- `connect`: click on the MetaMask connection control

The owner panel shows Visitors, Active, and Connect counts plus IP addresses. The panel is **not public**; it requires the Netlify environment variable `BANG_ANALYTICS_KEY`.

### Netlify setup
1. In Netlify, open Site configuration → Environment variables.
2. Add `BANG_ANALYTICS_KEY` with a long random secret value.
3. Deploy this folder.
4. Open your site once as:
   `https://1bang.top/?analytics=YOUR_SECRET`
   The private BANG TRACE panel will then appear in the top-left.
5. Remove the query string from your bookmark after the first setup; the browser stores the key for the session.

IP addresses are personal data in many jurisdictions. Use an appropriate privacy notice/cookie/analytics disclosure for your visitors and retain only what you actually need.

## BANG TRACE market monitor
The private BANG TRACE panel now also displays the live BNG/USD price and the live market 24-hour percentage movement outside the chart. Positive movement is shown with a `+` and green text; negative movement with a `−` and red text; flat movement is neutral.


## P2P escrow
The `/p2p.html` page now contains an on-chain ERC20-to-ERC20 escrow interface backed by `contracts/BangBngP2PEscrow.sol`. Deploy and verify the contract as an internal website ledger unit, then paste its address into the P2P page. The frontend supports wallet connection, token approvals, offer creation, acceptance, release and refund.

The P2P contract charges a transparent 0.50% protocol fee from the locked sell asset. M-Pesa/bank/cash payments are intentionally not represented as trustless escrow because the blockchain cannot independently verify an off-chain payment.


### Social link preview
The landing page now includes Open Graph and X/Twitter large-card metadata.
The preview image is `assets/bang-bng-social-preview.jpg` (1200x630).
Deploy the entire folder/ZIP so `https://1bang.top/assets/bang-bng-social-preview.jpg` is publicly reachable.

## FAQ bot escalation to customer support / admin
The built-in FAQ bot now offers escalation buttons when a question is not covered or a visitor asks to speak with a person. It links to `support@1bang.top`, `/contact.html`, and `admin@1bang.top`. Support/admin email addresses do not automatically grant website administrator permissions; access must remain controlled by Firebase/server-side authorization. The bot is keyword-based and does not create a support ticket automatically.


## BANG BNG FAQ assistant
The built-in FAQ assistant is available on the main site pages and covers Home, Token, Mining, Community, P2P, Swap, Chart, Explorer, Network, Developers, Docs, About, Contact, account access, balances, wallet safety, fees, privacy, and troubleshooting. When a question is not matched confidently or the visitor requests a person, it offers Customer Support, Contact Page, and Admin Help escalation. It is a deterministic FAQ bot, not a generative AI agent; unknown questions are escalated instead of guessed.


## Community profile pictures
The community chat includes Upload photo, Take picture (mobile camera), and Remove controls in the Your chat profile panel. Photos are resized to a small JPEG and stored on the signed-in user's Firestore profile, then copied into each message so the sender's picture appears beside chat messages. No Firebase Storage bucket is required. Deploy the included Firestore rules; user profile updates must remain limited to the authenticated user's own document.


## Internal Ledger Explorer (added)
- `/explorer.html` now includes a signed-in internal ledger view, search/filter controls, and CSV export for Excel/LibreOffice/Google Sheets.
- `/api/internal-explorer` is served by a Netlify Function and verifies Firebase ID tokens. Standard accounts are restricted server-side to `walletTransactions` records where `uid` equals their UID. Only accounts with the Firebase custom claim `admin: true` can view all ledger records.
- The API returns up to 500 latest matching records per request, ordered by `createdAt`. Deploy the included Firestore composite index (`firebase deploy --only firestore:indexes`) before using the personal-account query in production. CSV exports the currently loaded records after the active filters.
- Firestore client rules for `walletTransactions` remain deny-all; the API uses the configured `FIREBASE_SERVICE_ACCOUNT_JSON` service account.
- This is an internal platform ledger explorer, not a blockchain consensus explorer. Internal balances and transactions are not automatically BSC transactions. This explorer shows internal ledger records only.
- Deployment: deploy the complete folder to Netlify with existing Firebase service account environment configuration. Test with two user accounts and an admin account before announcing it as production-ready.

### Administrator recovery of mistaken internal transfers
The Internal Explorer now exposes a recovery panel only when the signed-in Firebase ID token contains the `admin: true` custom claim. An administrator must supply the exact internal transfer ID and a reason. Recovery is server-side, transactional, single-use, and audit logged. The recipient must still hold the full transferred amount in their internal BNG balance; otherwise the operation is rejected without changing balances. It only applies to internal ledger transfers, never public blockchain transfers. Test in a staging Firebase project before production deployment.


## Multi-asset internal wallets and BNG fees
The wallet page now supports internal ledger balances/addresses for BNG, BTC, BNB and USDT. Internal transfers charge 0.50% in BNG and credit the configured administrator wallet. Set `BANG_ADMIN_UID`, `BNG_PER_USDT`, `BNG_PER_BNB`, and `BNG_PER_BTC` in Netlify; non-BNG asset transfers fail closed until rates are configured. Admin-only balance controls are audit logged. These are ledger balances only, not real public-chain wallets or reserves. See `MULTI-ASSET-INTERNAL-WALLET-SETUP.md`.


## Internal swaps (added in this build)
The swap page now has a separate internal-ledger swap form for BNG, BTC, BNB and USDT in both directions. The backend uses a Firestore transaction, a 0.50% source-asset fee, configured server-side BNG-equivalent rates, and treasury inventory checks. It fails closed when rates or destination reserves are unavailable. These ledger swaps are not public-chain trades. See `INTERNAL-SWAP-SETUP.md`. The MetaMask swap remains disabled until the separate on-chain fee router is deployed and configured.


## P2P escrow quote update

The P2P offer form now records a seller-entered price per BNG, quote currency (KES/USD), payment method, and optional terms. It calculates the expected external payment total for display. These quotes are not verified prices; fiat payment remains external and must be verified by the seller. Escrow still locks only internal website-ledger BNG, not on-chain tokens or fiat funds.

## Mining balance disclosure

The mining page now states clearly that promotional rewards are internal ledger records, not on-chain minting, guaranteed cash value, or guaranteed redemption. A real on-chain asset requires a deployed network/token distribution path and verifiable transactions; this UI change does not create reserves or convert balances.


## KYC temporarily disabled
The KYC form and P2P KYC gate have been removed from this build. This does not delete any identity files or KYC records already stored in Firebase; review and securely delete old records separately if appropriate. Do not treat the removal of KYC as legal or compliance approval to operate a real-money marketplace.

## P2P currency tools (October 2026 update)
- `p2p.html` now includes a multi-currency converter for BNG, BTC, BNB, USDT, USDC and selected fiat currencies.
- BNG/BTC/BNB indicative USD values are read from the existing `/api/bng-price` market-data function; fiat conversion uses a public USD FX reference feed.
- The professional trade calculator estimates gross value, an illustrative 0.5% fee, total including fee, and net after fee. A separate arithmetic calculator is also included.
- Prices are indicative market/reference data only. They are not guaranteed sale prices, executable swaps, proof of liquidity, or on-chain balances. Actual P2P offers continue to support KES and USD as accepted by the server.
- If market or FX providers are unavailable, the converter reports that the rate is unavailable rather than inventing a value.


## Browser compatibility

Added best-effort legacy rendering styles and a browser capability notice. Public pages are designed to degrade gracefully on older browsers where possible. Modern authentication modules, CAPTCHA, secure wallet actions, and some advanced effects still require a browser with modern JavaScript modules, Fetch, and current TLS support; no website can guarantee compatibility with every historical browser version. For account access and financial actions, use a currently supported browser.
