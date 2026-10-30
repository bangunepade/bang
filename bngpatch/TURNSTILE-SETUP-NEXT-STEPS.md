# Cloudflare Turnstile setup for 1bang.top

## Scope in this ZIP
- The BNG Help Bot script is included only on `index.html` (home page). It has been removed from other top-level HTML pages.
- The existing Turnstile frontend helper and Netlify verification functions are retained.
- No Firebase configuration, balances, Firestore rules, or account records were intentionally changed.

## Required configuration
1. In Cloudflare Dashboard, create a Turnstile widget and allow the hostname `1bang.top` (also add `www.1bang.top` only if you actually serve the site there). A domain registration or DNS transfer to Cloudflare is not required for Turnstile.
2. In Netlify site environment variables, set `TURNSTILE_SITE_KEY` to the widget's public site key and `TURNSTILE_SECRET_KEY` to its secret key. Keep the secret private; never commit it to this ZIP or GitHub.
3. Trigger a deploy after setting variables.
4. Test sign-in, sign-up, password reset, and any other form that calls `BNGCaptcha.verify`. Confirm the widget renders and the server verification endpoint returns success for a valid token and rejects an invalid token.

## Important limitation
Until both keys are configured, the existing helper uses only its basic honeypot/time checks; Cloudflare Turnstile is not active. The server-side verification endpoint itself fails closed when the secret is missing. Do not consider CAPTCHA protection active until the live forms have been tested after deployment.
