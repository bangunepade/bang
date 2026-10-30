# BANG BNG bot and CAPTCHA activation

## Help bot
The built-in FAQ help bot is now included on the HTML pages in this package, not only the home page. It runs locally in the browser and does not need a third-party API key. It is an FAQ assistant, not a live human support service.

## Real CAPTCHA (Cloudflare Turnstile)
The site code already supports Turnstile, but an actual challenge cannot be activated until the owner configures valid keys in Netlify.

1. In Cloudflare Dashboard, open Turnstile and create a widget for `1bang.top` (also add `www.1bang.top` if used).
2. In Netlify → Site configuration → Environment variables, set `TURNSTILE_SITE_KEY` to the public site key and `TURNSTILE_SECRET_KEY` to the secret key. Keep the secret only in Netlify; never put it in the ZIP, frontend JavaScript, or GitHub.
3. Redeploy the site so the Netlify functions receive the variables.
4. Test `/api/captcha-config`: it should return `enabled: true` and a non-empty `siteKey` (do not share the secret).
5. Open the sign-in gate and confirm the Turnstile challenge/status appears. Test sign-in, sign-up, Google sign-in, and password reset. Invalid or missing verification should be rejected server-side.

If those keys are not configured, the page can only run the existing honeypot and minimum-time checks; those are not a full CAPTCHA. This ZIP does not invent keys or claim CAPTCHA is active without provider configuration.

## Safety
No Firebase records, balances, Firestore rules, or service-account credentials were intentionally changed by this update. Test on a preview deployment first.
