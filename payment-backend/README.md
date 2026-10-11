# LocHire private service

The private backend serves https://lochire.vercel.app through its authenticated Vercel gateway. It persists accounts, worker/hirer profiles, jobs, conversations, agreements, completion, reviews, reports, notifications, cash/transfer acknowledgements and Paystack checkout attempts in D1.

## Payments

Paystack hosted checkout uses a worker subaccount to settle proceeds directly to the worker's connected supported Nigerian bank. A worker confirms the resolved bank name, account ownership, consent to settlement and current LocHire password before connecting it. Full account numbers are never published; durable destination records contain only the bank, name, masked suffix and provider reference.

Every checkout uses a server-owned amount/recipient/reference tied to the work, terms version and payment period. The hirer must review the confirmed amount. Verification checks the provider's reference, amount, currency, mode and subaccount. Webhooks require the exact raw payload's HMAC SHA-512 signature and trigger authoritative read-back. Repeated requests/events cannot duplicate the record. Timeouts retain the saved reference for support reconciliation.

Paystack success confirms a charge, not bank settlement or receipt. Platform share is zero; provider fees are deducted from the worker's settlement and disclosed in the UI. Cash/direct-transfer declarations are separate, participant-acknowledged records. No stored-value wallet, escrow, top-ups or manual withdrawals are provided. Refund initiation and admin recovery of ambiguous provider requests currently require merchant support/dashboard operations.

## Configuration and activation

Production uses `APP_MODE=production`, `PAYMENT_MODE=live`, `PAYSTACK_MODE=live`. Keep `PAYSTACK_ENABLED=false` until the owner completes provider account activation, confirms marketplace subaccount eligibility and configures a live `PAYSTACK_SECRET_KEY` as a private secret. Production refuses test keys or mode. Configure the webhook at https://lochire.vercel.app/api/webhooks/paystack. No public key or separate webhook secret is needed for this hosted integration.

Keep the existing service secret, app origin, DB binding and owner-private audience. Authenticated account verification/reset email needs a secret Resend key and verified sender. Administrators require verified allowlisted email or a privately approved existing account ID.

Migration 0009 adds Paystack destination, payment and temporary bank-verification tables. Applied migrations and historical records remain unchanged. Retired bank and test-money routes are blocked in production, and historical simulation balances cannot become live money.

## Checks and deployment

Run `node --test tests/*.test.mjs` and build/package through the Sites source helper. Preserve `.openai/hosting.json` identity and `DB`. The GitHub `payment-backend` directory is a source snapshot; a frontend push does not deploy this service. Publish the backend through Sites separately. Provider tests currently use deterministic mock responses; actual Paystack end-to-end verification needs owner credentials and approved test/live transactions.

## Account email

Registration requests a verification email through Resend. Configure `RESEND_API_KEY` as a secret and `EMAIL_FROM` as an address on a Resend-verified domain, then redeploy to activate sending. When activated, unverified accounts may browse and manage sign-in but must verify before publishing profiles, arranging work or making online payments. Until configured, the UI clearly reports that email sending is awaiting activation; current-password changes remain available.

Password reset and verification links return to the public LocHire origin, expire after one hour, and are stored as SHA-256 hashes. Link consumption is atomic. Resetting or changing a password revokes all sessions and unused reset links. Resend failure never discards the created account or returns an unmailed token. Recovery answers do not reveal whether an account exists. Verification requests have a one-minute resend interval and account endpoints have server rate limits.

Migration 0010 removes only the owner-authorized test account identified by its original immutable ID, along with its unshared test profile, opening and session data. It cannot remove a new registration using the same email. Other accounts and shared work/payment dependencies are preserved.

For Resend's domain-free test sender, set `EMAIL_MODE=test`, `EMAIL_TEST_RECIPIENT` to the Resend account email and `EMAIL_FROM=LocHire <onboarding@resend.dev>`. Only this account receives mail or requires email verification; other accounts retain current-password changes. Reset replies remain generic. After verifying a sender domain, change EMAIL_FROM and EMAIL_MODE to production, then redeploy.

## Owner dashboard and Paystack commerce

The public gateway keeps the database service private. `/admin` and `/admin#finance` use the existing LocHire account session; only the configured owner with a verified email receives admin data. Ordinary users cannot query totals, customer emails, bank destinations or earnings.

Users can fund **LocHire credits** through hosted Paystack checkout. Credits pay for premium job listings; they are not a general bank wallet and cannot be cashed out or used for worker settlement. Agreed work still settles directly to the worker's Paystack subaccount. The configured LocHire commission is shown before payment and independently checked against Paystack's split allocation.

Premium gives the hirer's open posts a Featured label and placement before other matching posts. Users can buy 30 days with credits or hosted checkout, or explicitly select a monthly Paystack plan. Monthly plans require owner activation after pricing is saved. Hosted subscription management lets users cancel renewal; access lasts until the paid period expires. Changing the price creates a new plan for future subscribers and leaves existing subscriptions on their original plan.

### Activation

1. Activate the Nigerian business at https://dashboard.paystack.com/ and connect its settlement bank. Request/enable Transfers if Paystack requires it for this business.
2. Set the backend **secret** `PAYSTACK_SECRET_KEY=sk_live_…`. This hosted checkout implementation does not require a public key. Keep the secret out of browser code and Git.
3. Preserve `PAYSTACK_MODE=live` and set `PAYSTACK_ENABLED=true` after configuration. Production rejects test keys. Test-provider fixtures exercise the flows without moving money.
4. Set the live webhook URL to `https://lochire.ng/api/webhooks/paystack`. The gateway preserves the raw body and signature. No separate webhook secret is needed; Paystack signs using the secret key.
5. Sign in with the verified owner account, open `/admin#finance`, set the work fee (0–20%) and premium price, and enable monthly renewal if wanted. Zero price pauses premium purchases.
6. Connect the payout account using bank-name verification and the owner's current LocHire password. Keep Paystack OTP approvals enabled. Check a transfer using its saved reference; an ambiguous timeout must not be followed by a new transfer.
7. Complete an actual small payment and withdrawal with the owner present before advertising live payment availability. Without live credentials, controls stay disabled and state clearly that activation is pending.

### Accounting and verification

The `0011_commerce` migration adds a credit ledger, revenue ledger, memberships, checkout orders, payout destinations, withdrawals, refund adjustments and dispute holds. Existing accounts, sessions, profiles and balances are preserved. Checkout return URLs are only triggers: reference, currency, mode, amount, customer and plan/subaccount are verified server-side before applying value. Applied flags and immutable reference entries make duplicate/concurrent callbacks idempotent.

Owner withdrawals are capped by both the revenue ledger and Paystack's available balance, excluding user credit liabilities, pending top-ups, outstanding withdrawals and dispute holds. A ₦1,000 conservative transfer-fee buffer is retained until Paystack reports the actual fee. Already settled revenue may be in the business's bank rather than Paystack's transfer balance; it cannot be withdrawn there a second time. Chargebacks and refunds adjust the ledgers and can create a negative customer credit balance when already-spent funds are reversed. Cases Paystack has not resolved remain held for review in its dashboard.

Run `node --test tests/*.test.mjs` for server security/accounting and `npm test` in the frontend for authenticated UI flows. Provider requests are mocked in automated tests; they do not substitute for a live-provider smoke test after activation.
