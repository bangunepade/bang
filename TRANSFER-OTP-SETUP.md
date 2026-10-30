# Transfer OTP retired

The wallet transfer flow no longer uses email OTP. The authenticated Netlify function validates the signed-in Firebase user, recipient address, amount, balances, fee configuration, and duplicate transfer ID in a Firestore transaction. Existing Firestore OTP intent/throttle records and security rules are intentionally left untouched for preservation.

Transfers remain internal website ledger entries, not blockchain transactions. Test on a preview deployment with test accounts before publishing to production.
