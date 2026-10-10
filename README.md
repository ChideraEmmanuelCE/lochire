# LocHire

**Find local workers. Find work near you.**

Live app: https://lochire.vercel.app/

LocHire is now an authenticated hiring platform. Profiles, openings, invitations, messages, work agreements, completion, reviews, notifications and reports are saved in a shared server database. Visitors see real published listings; there are no seeded workers, fictional jobs or simulated counterpart controls in the production frontend. Previous browser-local examples are not imported.

## Live user journeys

1. Create an account or sign in. One account can find work and hire people.
2. Create a work profile with service, skills, availability, pay and general area, or an employer profile for an individual, household or business.
3. Hirers post ongoing jobs or one-off tasks, invite a worker or request a booking. Workers can express interest in published openings.
4. The recipient accepts. Both participants message each other and confirm the same version of the scope, pay, schedule and work location.
5. Each participant confirms completion. Reviews become available only after both confirm.
6. A hirer can declare a direct cash or bank-transfer payment. Only the worker can acknowledge receipt or dispute that record. Acknowledged earnings are not a spendable wallet balance.

Workers connect their bank account in Payments. Hirers pay the agreed price using hosted checkout; Paystack handles settlement to the worker. Cash and direct-transfer records remain available separately. The footer is removed; Account contains Help, Privacy and guidance.

## Payment activation

Paystack replaces the previous bank-specific integration. Hosted checkout, private bank-account confirmation/subaccounts, durable payment attempts, participant status checks and signed webhooks are implemented. Production money movement remains unavailable until the owner's activated Paystack account and live secret are configured and actual provider tests are completed. See `docs/PROVIDER_SETUP.md` for the exact setup.

The app offers direct bank settlement rather than a stored-value wallet. Platform share is currently zero; processing fees are deducted from the worker's settlement. Paid status confirms the charge, not bank receipt. Refunds and ambiguous provider-request recovery currently use merchant support/dashboard operations.

**Email verification and password recovery need `RESEND_API_KEY` and a verified `EMAIL_FROM` in private backend runtime settings.** The app reports missing delivery instead of claiming an email was sent. In-app notifications and authenticated password changes already work. Password changes revoke all sessions. Email notifications for hiring events are not currently sent.

**Identity, licence, phone and reference checks are not independently verified.** Profiles are labelled self-reported. Manual postcodes remain unchecked; the NIPOST adapter is retained but no key is configured.

## Privacy and administration

Account email and phone, exact location snapshots, conversations, reports and payment declarations are private. Nearby searches return coarse distances rather than coordinates, and shared location expires after 24 hours. A worker sees an opening's private postcode after acceptance. Browser storage remembers only the selected role.

The owner report queue is at `/#admin`. `ADMIN_EMAILS` is configured for the owner's account email; email-based access also requires verification to prevent someone claiming an address from becoming an administrator. Alternatively, set `ADMIN_USER_IDS` privately to an owner-verified existing account ID. Report resolutions, profile suspensions and opening closure are supported. Suspended profiles cannot republish themselves.

## Architecture and deployment

The Vercel frontend calls the same-origin `api/gateway.js`. The gateway forwards only the app session cookie, validated route and permitted headers to the private Sites service. Its service credentials never enter frontend assets. Cloudflare D1 stores the live hiring records and historical bank/test data separately. Production hides historical test balances and transactions.

Frontend project: `lochire`, team `RIDEA`, domain `lochire.vercel.app`, repository `ChideraEmmanuelCE/lochire`.

Backend identity is preserved in `payment-backend/.openai/hosting.json`. A frontend GitHub push does not publish the backend. Backend changes must also pass the Sites source, build, save and deploy workflow. Migrations 0008–0009 add the live hiring and Paystack schema without changing applied migrations or erasing historical data.

Runtime: `APP_MODE=production`, `PAYMENT_MODE=live`, `PAYSTACK_MODE=live`, `PAYSTACK_ENABLED=false` until activation. Gateway credentials and the backend's `SERVICE_SECRET` remain private.

## Development checks

```sh
npm ci
npm run build
npm test
node --test payment-backend/tests/*.test.mjs
```

The UI integration tests run two separate browser sessions through the actual backend service and SQLite adapter, covering published profiles, openings, invitations, work confirmation, completion and reviews. Service tests cover ownership, privacy, stale edits, concurrent mutations, idempotent payment declarations, administrative access and production banking gates.

A static file server can preview the layout but cannot run accounts. Use the configured gateway and private backend for the full application. See `docs/API.md` for the live routes.
