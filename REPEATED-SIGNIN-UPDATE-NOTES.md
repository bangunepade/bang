BANG BNG sign-in persistence update

- Set Firebase browser authentication persistence to browserLocalPersistence on Mining, P2P, Staking, Swap, and Wallet pages.
- This allows the existing signed-in session to persist while navigating between these pages, so users do not need to sign in again on each page.
- The Mining page's hidden compatibility elements remain in place because existing page scripts reference those element IDs; they are not visible sign-in fields.
- Account-specific balances and actions remain protected by Firebase authentication and server-side authorization. Public pages remain publicly accessible.
- The owner Security Dashboard remains separately protected.

Deploy the ZIP as a manual Netlify deploy. Test sign-in on Home, then open Mining, Wallet, Swap, P2P, and Staking in the same browser. If the Home page uses a different Firebase project configuration, these pages cannot share the same session until that configuration is aligned.
