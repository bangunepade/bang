# BANG BNG Internal P2P Escrow

This is an internal website-ledger feature, not the old BSC Solidity escrow. It does not call MetaMask, use chain ID 56, or broadcast blockchain transactions.

## Supported assets
BNG, BTC, BNB, USDT, ADA, BCH, ETH, SOL, DOGE, and XRP. These match the assets supported by the current internal swap.

## Flow
- A seller creates an offer using a selected asset already available in their internal wallet. A sell offer locks that asset atomically in `walletBalances/{sellerUid}` / `internalP2PEscrows/{escrowId}`.
- The minimum offer value is 10 BNG-equivalent, estimated using the internal BNG reference and external token USD reference. The server checks the current reference rate before creating or accepting an offer.
- The existing 0.878690% P2P fee is charged separately in BNG. For non-BNG sell offers, the seller must have both the selected asset and enough BNG to pay the fee.
- A buy offer does not reserve the buyer's balance when published. When a seller accepts, the seller locks the selected asset and pays the fee in BNG.
- Buyer accepts the open offer. Any M-Pesa/bank payment is external and is not verified by the website.
- Buyer marks payment sent; seller independently verifies receipt, then releases. The backend atomically credits the selected asset to the buyer and marks the escrow released.
- Seller may cancel only an unaccepted sell offer, which unlocks the selected asset. The P2P fee already charged is not refunded. Buyer or seller may dispute an accepted/paid trade; funds remain locked until an authenticated Firebase custom-claim admin resolves it with `admin-release` or `admin-refund`.

## Requirements
- Netlify environment variable `FIREBASE_SERVICE_ACCOUNT_JSON` must be configured for the correct Firebase project.
- Deploy `firestore.rules`; the `internalP2PEscrows` collection is server-only.
- Only trusted administrators should have the Firebase custom claim `admin: true`.
- Test using low-value test accounts before public use.

## Limitations
- These are provisional internal ledger balances and escrow records, not public-chain assets, external custody, or redeemable cash.
- The displayed BNG price is an internal reference, not a live exchange quote or guaranteed cash value. Other token USD values are indicative references and can change.
- The seller's fiat quote is user-provided and informational; the platform does not custody, initiate, or automatically verify M-Pesa/bank payments.
- A dispute remains frozen until an authorized admin resolves it. Set up support and admin procedures before inviting real users.

## Other marketplace features
- Public offers never expose email addresses or account UIDs.
- Buyer and seller can chat privately after acceptance.
- After release, each party may submit one 1–5 star rating and optional short comment.
- Preserve existing Firestore records and security rules when deploying updates.
