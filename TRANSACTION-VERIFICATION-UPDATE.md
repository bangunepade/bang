# Permanent Transaction ID + Explorer Verification Update

- New internal-ledger transaction IDs use the format `BNG-TX-` followed by 32 uppercase hexadecimal characters.
- Mining-to-dashboard withdrawals return and display a transaction ID.
- Internal wallet transfers store the same transaction ID on the transfer record and the sender/recipient/fee ledger entries.
- P2P escrow creation assigns a stable transaction ID to the escrow, and subsequent acceptance/release/refund records reuse it.
- The Explorer includes a public verification lookup by exact transaction ID or internal wallet address. Public results omit Firebase UIDs and show limited ledger metadata.
- Existing transaction records remain intact. Historical records without a transaction ID use their prior transfer/escrow/document identifier as a fallback.
- These are internal platform ledger IDs, not blockchain transaction hashes. No Firestore rules were changed.

## Deployment
Deploy this full ZIP through the existing GitHub-connected Netlify site or Netlify CLI so the `netlify/functions` handlers are included. Keep existing environment variables and Firestore collections. Test with a new mining withdrawal, internal transfer, and P2P escrow; then verify each returned ID in `/explorer.html`.

Validation performed locally: ZIP integrity and JavaScript syntax checks. Live Firebase/Netlify behavior has not been tested from this environment.


## 2026-10-17 staking IDs and timestamp update

New staking deposits, early/matured withdrawals, and scheduled maturity payouts now create permanent BNG-TX-… records in walletTransactions with server timestamps and public verification enabled. Stake cards show transaction IDs and a full localized date/time/year, with direct Explorer links. Wallet/mining/staking balance cards show the last available server-side balance timestamp to the signed-in account holder. Public Explorer and P2P offer records display full date/time/year timestamps and transaction IDs. Personal account balances remain private; public pages expose transaction/offer details only, not each user's full wallet balance. These remain internal-ledger records, not blockchain transactions.
