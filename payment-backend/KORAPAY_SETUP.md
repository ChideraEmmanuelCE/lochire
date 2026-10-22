> Historical Kora integration only. New premium purchases use Paystack. See [PAYSTACK_PREMIUM_SETUP.md](PAYSTACK_PREMIUM_SETUP.md). Do not activate Kora checkout using this older guide.

# LocHire premium access through Kora

LocHire sells worker access, not salary processing, deposits or withdrawals.

* Premium: NGN 900 for 30 days, unlocking full job details and expressions of interest.
* Premium Plus: NGN 1,200 for 30 days, with new nearby-job emails matched by city, optional area and service.
* Manual renewal only. Plus purchases start a full 30-day Plus pass without prorating overlapping access. Same-tier renewals extend the existing pass.
* Published worker profiles and hirer invitations stay free. The directory starts with all published, unsuspended and unblocked workers; location is an optional filter.

Checkout is created on the server for the authenticated user's ID, account email and a server-controlled amount. The browser cannot supply another beneficiary. Kora signs notifications; the server independently queries reference, currency, amount and account email. A database transaction grants each verified order once. Test and live entitlements are separate. Revoked or refunded passes lose their associated grant without removing unrelated passes.

`PAYMENTS_PRODUCT=premium` is the deployed product. The `legacy` setting exists only for historical regression fixtures; do not enable it in production. Old payment tables are retained as records and do not provide current premium entitlements.

## Test configuration

`KORAPAY_MODE=test`, `KORAPAY_PREMIUM_ENABLED=true`, `KORAPAY_WEBHOOKS_ENABLED=true`, and `KORAPAY_PREMIUM_TEST_USERS` restrict simulated checkout to explicitly approved accounts. Vercel stores `KORAPAY_TEST_SECRET_KEY` privately. Its gateway relays only its own saved test key to the authenticated backend for signature verification. Clients cannot override it.

Provider requests use a fixed Kora API origin with manual redirect handling. The backend rejects 3xx responses without following them or forwarding credentials. This is compatible with the deployed Worker runtime.

The webhook remains `https://lochire.ng/api/webhooks/korapay`. Test checkout stays private and ordinary members see an honest pending-activation notice.

## Live activation

Keep live checkout unavailable until Kora approval, private live-key configuration and provider-backed end-to-end checkout testing succeed. The live backend requires `KORAPAY_MODE=live`, `KORAPAY_BUSINESS_APPROVED=true`, `KORAPAY_PREMIUM_ENABLED=true`, and a private native `KORAPAY_SECRET_KEY` starting with `sk_live_`. Never place keys in source, public configuration or chat.

## Email delivery

New openings atomically create a durable alert outbox task. Fan-out targets only verified opted-in users whose live Plus pass existed before the job was posted. Existing jobs are not replayed on subscription. A job/user uniqueness constraint prevents duplicate alerts. Before sending, the system rechecks membership, expiry, visibility, preferences and blocks. Resend idempotency keys and database leases protect retries. Background delivery continues after the response, with pending records retried on later successful application activity. Closed jobs, expired passes and disabled preferences suppress queued alerts.

Nearby-job emails show a short job summary, location, formatted pay, work date and a direct link to the job. The email footer links to the signed-in account’s alert preferences, with the panel opened automatically after sign-in. Nearby-job opt-in is separate from invitation/message email preferences; account-security emails keep their own delivery rules. Provider retries retain the original email body and idempotency key, while eligibility is checked again before each attempt.

Configure `RESEND_API_KEY` privately and a verified `EMAIL_FROM` sender. The queue is not a promise of a hire or exclusive access. Monitor failed/review queue statuses and Kora settlement in the owner dashboards.
