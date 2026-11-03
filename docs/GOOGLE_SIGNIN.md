# Google sign-in for LocHire

LocHire uses Google Identity Services (GIS) to get a signed **ID token**, not Google API access tokens. A private server verifies the token with Google's published RSA signing keys, then issues the normal LocHire HttpOnly session. No Google client secret is required for this flow.

## Google Cloud owner setup

1. Open https://console.cloud.google.com/apis/credentials (Google Auth Platform > Clients).
2. Configure the application's brand/consent screen as **LocHire**. Select External audience for the public app and publish when ready.
3. Create a **Web application** OAuth client. Under **Authorized JavaScript origins**, enter:
   - https://lochire.ng
   - https://www.lochire.ng
   - https://lochire.vercel.app (only if this alternative host will be used)
   Each origin must be exact. No trailing slash.
4. Copy the Web application's Client ID ending in `.apps.googleusercontent.com`. For the GIS popup/JS callback implementation, no redirect URI is needed.
5. Save `GOOGLE_CLIENT_ID` as an environment variable on the **Vercel** `lochire` project, at least for Production. Client IDs are public identifiers; **do not place a client secret in the browser or in GitHub**.
6. The Vercel gateway relays that same public ID only on `/api/config` and `/api/auth/google*` requests to the private backend. The backend may alternatively set its own `GOOGLE_CLIENT_ID` variable.

## Backend deployment (required before enabling front end)

This project has two deployments:
- The public Vercel static frontend/gateway; GitHub pushes deploy this part.
- The **private Sites backend** in `payment-backend/`; a frontend GitHub push **does not deploy it**.

Apply `payment-backend/drizzle/0023_google_identities.sql` to the existing D1 database first. Use the existing private Sites source/build/save/deploy process to deploy `payment-backend/lib/google-identity.mjs`, updated `service.mjs`, `hiring.mjs`, and the schema. Then deploy the Vercel frontend with the Web client ID configured. Do not run tests against the live database.

## User flows

- **Existing linked user:** Google proves the same provider subject; server creates a fresh LocHire session and preserves all profiles, messages, job history and subscriptions.
- **Existing password user:** They sign in with their password **one last time**, open **My account → Google sign-in**, and choose the Google account with the **same email**. Once connected, future Google logins do not need a password. This explicit linking prevents an unverified email match from taking over an account.
- **New user:** Google verifies the email and name; LocHire asks only once for phone, age declaration/date of birth, terms consent, and optional compressed profile photo. The new Google account immediately has a verified email. The user is signed in with the existing LocHire cookie.
- **Current email/password users:** Existing sign-up, sign-in, reset-password, emails, roles and sessions continue to work unchanged. A Google-created account can set a LocHire password using the verified-email recovery flow if delivery is configured.

Google credentials and ID tokens are not stored in browser storage; only the durable Google `sub` is stored privately and uniquely linked to a LocHire user. The browser never chooses a user ID for login, and database uniqueness prevents a Google subject from being linked to multiple accounts.

## Testing

Run `npm ci && npm run build && npm test` in the frontend root and `node --test payment-backend/tests/*.test.mjs` from the root using a supported Node version. Use test OAuth keys in local automated tests and a Google account in the configured consent screen for manual popup testing. Check new-account signup, account linking, previously linked sign-in, expired/altered/wrong-audience tokens, email verification, suspensions, and sign-out.

Google reference: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
