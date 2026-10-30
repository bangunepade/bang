# BANG BNG local time and bot protection

## Automatic time for visitors worldwide

The site-wide clock uses the visitor's browser locale and IANA time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`). It updates every second and shows the local date including year, time, and time-zone name. Existing transaction and receipt timestamps that use `toLocaleString()` continue to display in the visitor's local locale/time zone. UTC timestamps should remain available in CSV exports for unambiguous record keeping.

## Cloudflare Turnstile setup (recommended)

The code supports server-verified Cloudflare Turnstile on the main login/signup gate and Community login/signup, including Google sign-in and password-reset actions.

1. In Cloudflare, open Turnstile and create a widget for `1bang.top` (add `www.1bang.top` if that hostname is used).
2. In Netlify for the production site, add these environment variables:
   - `TURNSTILE_SITE_KEY` — public site key from Cloudflare.
   - `TURNSTILE_SECRET_KEY` — private secret key from Cloudflare. Never put this in frontend code, GitHub, or a public message.
3. Trigger a new deploy so the Netlify Functions receive the variables.
4. Test login, signup, Google sign-in, and password reset. Verify the challenge appears and that a missing/invalid challenge blocks the action.

The `captcha-config` function only returns the public site key. The `verify-captcha` function sends the token to Cloudflare Siteverify using the secret on the server. CAPTCHA is optional until both variables are configured. If no site key is configured, only low-friction client-side honeypot and minimum-interaction-time checks run; these are not equivalent to a real CAPTCHA and should not be considered strong bot protection.

## Deployment checks

- Keep `TURNSTILE_SECRET_KEY` server-side in Netlify only.
- Keep Firebase Admin credentials server-side and preserve current Firestore rules.
- Confirm the new `/api/captcha-config` and `/api/verify-captcha` routes deploy with the `netlify/functions` directory.
- CAPTCHA provider availability and production host configuration must be tested after deployment.
