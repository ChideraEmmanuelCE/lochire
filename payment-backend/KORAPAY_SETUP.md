# Kora sandbox wallet

Notification URL: https://lochire.ng/api/webhooks/korapay
Private test screen: https://lochire.ng/#bank-sandbox

## Current behavior

This integration is **sandbox-only**. It cannot move real money, activate live
premium listings or change live work payment records. Kora's wallet API wrapper
rejects live mode and live credentials even if the business approval flag is set.
Existing direct-payment and Paystack functionality remains unchanged.

Access requires a verified LocHire email in `ADMIN_EMAILS` or
`KORAPAY_TESTER_EMAILS`, plus `KORAPAY_SANDBOX_WALLET_ENABLED=true` and
`KORAPAY_MODE=test`. The menu is private to these accounts. Hiring mode can add
test funds, buy test premium and pay a separate approved worker for mutually
confirmed work. Finding work mode can withdraw only test earnings.

The isolated `kora_test_*` tables hold transfer accounts, verified deposits,
hirer funds, worker earnings, operation claims, receipts and test memberships.
These tables are never included in the live credit balance or live premium
eligibility. Migration 0014 is additive and preserves existing data.

## Configure

The owner saves `KORAPAY_TEST_SECRET_KEY` as a **Secret** for the LocHire Vercel
project's Production environment, then redeploys. Production here describes the
hosting environment; the Kora key must still start `sk_test_`. Never post it in
chat, browser code, logs or the repository.

Private Sites runtime configuration:

- `KORAPAY_MODE=test`
- `KORAPAY_WEBHOOKS_ENABLED=true`
- `KORAPAY_ALLOW_TEST_KEY_RELAY=true`
- `KORAPAY_SANDBOX_WALLET_ENABLED=true`
- `KORAPAY_BUSINESS_APPROVED=false`
- `KORAPAY_TESTER_EMAILS=` (optional comma-separated extra test accounts)

Alternatively, save `KORAPAY_SECRET_KEY` directly as a private Sites secret. A
native Sites key takes precedence. The gateway sends its own test key over HTTPS
only to the Kora webhook and `/api/payments/kora/*` routes, after dropping
client-supplied copies. Private-service authentication precedes reading the key;
the backend never persists or returns it. App mutations still require an exact
allowed Origin, authenticated session, verified email and tester access.

A read-only connectivity probe at the notification URL with
`?check=connection` checks Kora's bank-list API and caches the public boolean
result for one minute. It exposes no keys, bank accounts or customer data.
`webhookReady=true` alone proves configuration, not provider API access.

## Test journey

1. Sign in using an approved verified account and open More > Bank transfer
   sandbox. Use Test API connection to confirm provider access.
2. Switch to Hiring and create/check the test account. The backend uses Kora's
   sandbox bank code `000` and published test BVN `22222222222`. No real identity
   or bank credentials are requested. A creation timeout keeps the same account
   reference; retries query it instead of creating another account.
3. Simulate a deposit. This calls Kora's sandbox-credit API only. Submission alone
   does not change any balance. Never transfer real money to the displayed test
   account number.
4. Check deposits. Each payment is queried independently; the verified account
   number and account reference must match the account owned by this user.
   Available test funds equal the verified paid amount less the provider fee.
   Signed callbacks run the same credit routine. Duplicate callbacks and
   reconciliation credit once atomically. Check history pages until complete;
   the UI's Check deposits button advances to the next page when one exists.
5. Buy test premium. A test membership lasts 30 days and never features a live
   listing. The configured premium price is used, with a test-only ₦1,000
   fallback when no live price has been configured.
6. To test paying work, add a second verified tester to the allowlist. Create
   private/unpublished test profiles and confirm the scope/pay with both people.
   A work period/version has one deterministic test payment reference. The hirer
   is debited the agreed amount; worker earnings receive the amount less the
   configured LocHire commission. No live payment acknowledgement is inserted.
7. In the worker account, request a test withdrawal. Only Kora's published test
   accounts are used: UBA `033` / `0000000000` for success and Wema `035` /
   `0000000000` for failure. Provider fees may reduce the simulated bank receipt.
   Password confirmation and consent are required for balance purchases and
   withdrawals. Hirer funding cannot be withdrawn as worker earnings.
8. A withdrawal reserves earnings before the provider POST. Ambiguous errors keep
   them reserved; Check payout queries the original reference, never resubmits
   the POST. Only a verified failure/reversal restores earnings, once. A later
   contradictory success freezes the wallet for review. A successful query
   confirms Kora's test result, not a real bank receipt.

## Before real money

Kora must approve the unregistered marketplace's actual virtual-account,
customer-balance and worker-payout model. KYC approval alone does not establish
that product access. This code deliberately cannot be enabled for real wallet
payments with an environment switch.

A separate live implementation/review is required for real customer KYC and
bank-account ownership, settlement availability/liquidity, fees, deposit
refunds/reversals/chargebacks, withdrawal recovery and reconciliation, and any
required safeguarding arrangement. Sandbox failures use synthetic provider
fixtures; actual provider provisioning/access must also be verified. Do not
advertise live bank funding while these requirements remain outstanding.

Official contracts:
- https://developers.korapay.com/docs/virtual-bank-accounts-ngn
- https://developers.korapay.com/docs/webhooks
- https://developers.korapay.com/docs/payout-via-api
- https://developers.korapay.com/docs/testing-your-integration
