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

Worker earnings use direct bank settlement rather than a stored-value worker wallet. Hirer-only premium credits have a separate balance and funding flow; they cannot pay workers or be withdrawn as work earnings. Platform share is currently zero; processing fees are deducted from the worker's settlement. Paid status confirms the charge, not bank receipt. Refund initiation and ambiguous provider-request recovery currently use merchant support/dashboard operations.

**Email verification and password recovery need `RESEND_API_KEY` and a verified `EMAIL_FROM` in private backend runtime settings.** The app reports missing delivery instead of claiming an email was sent. In-app notifications and authenticated password changes already work. Password changes revoke all sessions. New hiring and payment notifications queue privacy-preserving work email alerts to verified account emails. Settings controls the work-email preference; account security mail is unaffected. Delivery attempts are saved and retried on later authenticated activity, using provider idempotency keys; historical inbox records are not emailed. The owner dashboard shows provider acceptance, pending deliveries and failures.

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

## Appearance and mobile layout

The Android-first interface uses four bottom tabs and a More menu for Payments, Settings and Account. Settings offers Light, Dark and Device appearance; the browser saves the selection and applies it before styles load. Filters, optional profile details, bank setup and payment histories expand on demand. Work agreements remain visible before confirmation. The logo asset is unchanged. Touch controls, safe-area spacing and reduced-motion support are included. No remote fonts or animated decoration are loaded.

## Passwords and email verification

More → Settings → Password & security offers current-password changes and email recovery. Account shows verification status and resend. With the backend email provider configured, signup requests a verification email and pauses profile creation until verification. Email links return to LocHire with a one-hour, single-use token; verification resumes the next step and password reset returns to sign-in. Configure the backend `RESEND_API_KEY` secret and verified `EMAIL_FROM` sender before testing actual email delivery.

## First-user launch

Worker invitation: https://lochire.ng/#join-worker

Hirer invitation: https://lochire.ng/#join-hirer

Empty listing pages offer share buttons. Follow `docs/LAUNCH_PLAN.md` to recruit 20 genuine published workers and 5 hirers in one area; these are targets, not acquired users. Worker mode hides funding/premium controls, and the backend rejects premium funding or purchases unless the saved role is Hiring. Work earnings continue to settle to the linked bank; no manual worker withdrawal is represented.

## Live local worker matches and interviews

In Hiring mode, open More → Live worker matches (or the live panel on Workers). New published profiles are matched to a hirer's open jobs by occupation, work type, required skills, experience, start date, city and general service area. The feed explains each match. The worker's “Send my published profile” and “Ready to receive work enquiries” choices control inclusion. Private account contacts, precise location and licence information are excluded from suggestion emails. Hirers can disable candidate alerts in their profile or disable all work mail in Settings.

Candidate summaries go to verified registered hirers with matching openings, with one email notification per hirer per Lagos calendar day. The feed continues updating as more profiles arrive. Activity uses authenticated heartbeats while the worker is viewing LocHire; “Active now” expires after 90 seconds. Upcoming availability is labelled by date. Activity is shown to hirer accounts, and the interface checks for updates every 30 seconds.

“Accept for interview” asks for a future WAT date/time, interview address or meeting link, contact person and phone. The hirer explicitly approves sharing those details. An invitation and inbox notification are saved, with an email queued to the worker's verified account. The worker can confirm attendance or decline; accepting an interview does not confirm employment or agreed pay. Both participants can revisit the interview in My work, and download a calendar event. Declining a matched profile hides that suggestion for the opening and preserves the decision. Duplicate or competing requests cannot create duplicate invitations.

Migration 0013 adds local match decisions, expiring activity timestamps and frozen email retry payloads without changing historical records. Email uses the existing delivery queue and Resend configuration, with retries during authenticated activity. There is no cold email outreach to companies outside LocHire. Automated UI tests cover both roles, light/dark appearance and saved interview details; service tests cover match ownership, opt-outs, stale activity, competing decisions and email idempotency.
