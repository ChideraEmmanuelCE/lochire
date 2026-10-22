# LocHire private service

The private backend serves https://lochire.ng through its authenticated Vercel gateway. It persists accounts, profiles, jobs, conversations, agreements, reviews, notifications, direct-payment acknowledgements and premium purchases in D1.

## Paystack premium payments

The current product collects LocHire's own one-time fees through Paystack hosted checkout: Premium costs ₦900 (90000 kobo), and Premium Plus costs ₦1,200 (120000 kobo). Each pass lasts 30 days. Plus adds matching new-job emails with an independent opt-out. There is no automatic renewal, salary collection, split settlement, wallet funding or withdrawal flow.

The server owns the price, reference, account and tier. Checkout uses no subaccount or Paystack subscription plan. Return URLs are only triggers: reference, amount, currency, customer email, metadata and test/live mode must match the saved order before access is granted. Webhooks verify the exact raw body's HMAC SHA-512 signature, then independently read the transaction from Paystack. Atomic grants prevent duplicate access from retries or concurrent verification. Confirmed refunds revoke the related pass, and late success events cannot restore it.

See PAYSTACK_PREMIUM_SETUP.md for the exact runtime settings and webhook URL. Keep `PAYMENTS_PRODUCT=premium` and the retired salary-payment flag `PAYSTACK_ENABLED=false`. The premium flag is `PAYSTACK_PREMIUM_ENABLED`. No public key is required.

Migration 0022 adds a provider label to the existing premium order table. Historical orders default to `korapay`; new orders explicitly use `paystack`. Existing grants, orders and account data stay intact. Historical Kora verification remains available through its original provider configuration.

## Checks and deployment

Run `node --test tests/*.test.mjs` and build/package through the Sites source helper. Preserve `.openai/hosting.json`, the `DB` binding, existing service secret and owner-private audience. The GitHub `payment-backend` directory is a source snapshot; a frontend push does not publish this service. Deploy the backend separately through Sites before the frontend.

Automated tests use deterministic provider responses and do not move money. A real checkout still needs a configured Paystack account and an owner-approved transaction.

## Account email

Registration requests a verification email through Resend. Configure `RESEND_API_KEY` as a secret and `EMAIL_FROM` as an address on a Resend-verified domain, then redeploy to activate sending. When activated, unverified accounts may browse and manage sign-in but must verify before publishing profiles, arranging work or making online payments. Until configured, the UI clearly reports that email sending is awaiting activation; current-password changes remain available.

Password reset and verification links return to the public LocHire origin, expire after one hour, and are stored as SHA-256 hashes. Link consumption is atomic. Resetting or changing a password revokes all sessions and unused reset links. Resend failure never discards the created account or returns an unmailed token. Recovery answers do not reveal whether an account exists. Verification requests have a one-minute resend interval and account endpoints have server rate limits.

Migration 0010 removes only the owner-authorized test account identified by its original immutable ID, along with its unshared test profile, opening and session data. It cannot remove a new registration using the same email. Other accounts and shared work/payment dependencies are preserved.

For Resend's domain-free test sender, set `EMAIL_MODE=test`, `EMAIL_TEST_RECIPIENT` to the Resend account email and `EMAIL_FROM=LocHire <onboarding@resend.dev>`. Only this account receives mail or requires email verification; other accounts retain current-password changes. Reset replies remain generic. After verifying a sender domain, change EMAIL_FROM and EMAIL_MODE to production, then redeploy.

## Owner dashboard

`/admin#finance` requires the existing verified, allowlisted owner account. It shows confirmed premium sales and provider fees, including historical purchases. Manage settlements and initiate refunds in the relevant provider dashboard. The app does not initiate transfers or refunds.
