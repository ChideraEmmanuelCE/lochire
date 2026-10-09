# LocHire live service

LocHire's private API serves the public app at https://lochire.vercel.app.

The hiring platform now uses authenticated, shared D1 records for profiles, openings, conversations, agreed work, completion, reviews, in-app notifications, reports and participant-acknowledged direct payments. Browser-local hiring examples are not imported into live listings.

## Production configuration

- `APP_MODE=production`, `PAYMENT_MODE=live`, `WEMA_MODE=live`, `WEMA_ENVIRONMENT=production`.
- Keep `WEMA_ENABLED=false` until the subscribed product contracts and production credentials have been confirmed. Test-money funding, withdrawals and bank simulations are blocked at the service boundary in production.
- Keep the existing `SERVICE_SECRET`, `APP_ORIGIN` and private Site audience. Gateway credentials remain server-only.
- `ADMIN_EMAILS` identifies permitted administrator email addresses. Email-based admin access also requires verification. Alternatively configure `ADMIN_USER_IDS` only for owner-verified existing account IDs through private runtime settings; registration alone does not grant administration.
- Email verification and recovery require secret `RESEND_API_KEY` and verified `EMAIL_FROM`. Without them, the API explicitly reports that email delivery is unavailable. Signed-in password changes already work and revoke all sessions.

## Data and safety

Migration 0008 adds the live hiring tables without rewriting applied migrations or erasing test history. Historical test balances are retained privately and cannot become spendable production funds. Live wallet summaries hide test balances and simulation transactions.

Profile ownership derives from the session. Only participants can access and change conversations or payment declarations. Revision checks reject stale edits. Both sides confirm the current work version and completion before reviews. Only the receiving worker can acknowledge a payment. These declarations are not bank verification, custody, escrow or withdrawable balances.

Exact locations and account contacts stay private. Discovery returns coarse distance, and shared location expires after 24 hours. Private postcodes appear to workers after invitation acceptance. Reports are stored privately; verified administrators can resolve them and suspend reported profiles. Suspended profiles cannot republish themselves.

## Checks and publication

Run `node --test tests/*.test.mjs` and build through the Sites helper. Publish from the existing Site identity in `.openai/hosting.json`; preserve the `DB` binding and owner-private audience. Update the corresponding backend source snapshot in `ChideraEmmanuelCE/lochire` together with a backend publication. A GitHub frontend push does not deploy this backend.

The current production frontend deliberately keeps Wema deposits and withdrawals unavailable. Final bank activation also needs the real payout contract and a matching frontend bank flow, followed by approved bank end-to-end testing. No real Wema calls have been verified yet.
