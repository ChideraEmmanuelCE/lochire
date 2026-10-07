# Payment API

Base URL: `https://lochire.vercel.app/api`. Requests use JSON. Authentication uses the `lh_session` HttpOnly, Secure, SameSite=Lax cookie. Mutating requests must originate from the configured LocHire origin. The browser never receives the private service access token or bank credentials.

Money is an integer number of **kobo**. `2000000` means ₦20,000. Test balances use `TEST-NGN`; bank transaction records use `NGN` and `mode: wema`. The ledgers are separate.

## Routes

| Method | Path | Input / behavior |
|---|---|---|
| GET | `/health` | Payment-service/storage/bank status |
| GET | `/config` | Safe feature flags and names of missing bank settings; no secret values |
| GET | `/postcode/config` | NIPOST availability, environment and missing setting names; no key values |
| POST | `/postcode/lookup` | Signed-in account; `code`, `consent: true`; permitted address result plus an account-bound signed confirmation valid for 30 minutes |
| POST | `/auth/register` | `name`, `email`, Nigerian `phone`, `password` (10+ characters), `role` (`worker`, `employer`, `both`), `demoConsent: true` |
| POST | `/auth/login` | `email`, `password`; establishes cookie |
| POST | `/auth/logout` | Revokes the current server session and clears its cookie |
| GET | `/wallet` | Own user, available/reserved test balances, bank environment, separate `bankDeposits` and nullable timestamped `bankBalance`, recent transactions/jobs, eligible reviews and trust evidence |
| GET | `/members/:walletId` | Registered member's name, role and work evidence; no private contacts or balances |
| POST | `/sandbox/fund` | `amount`; at most ₦100,000 test credit per rolling 24 hours |
| POST | `/jobs` | `workerId`, `title`, `scope`, `category`, integer `amount`; optional `rail: wema` only after configuration; optional `postcode` and `postcodeToken` from a confirmed selection |
| POST | `/jobs/:id/accept` | Invited worker accepts immutable scope/price |
| POST | `/jobs/:id/decline` | Invited worker cancels invitation |
| POST | `/jobs/:id/reserve` | Employer reserves test funds after worker acceptance |
| POST | `/jobs/:id/complete` | Participant marks completion; after both confirmations, test funds release once |
| POST | `/jobs/:id/cancel` | Employer cancels before completion confirmations; returns reserved test funds once |
| POST | `/jobs/:id/dispute` | `reason`; freezes funded test job, records concern; no administrator notification |
| POST | `/jobs/:id/review` | `rating` (1–5), `text`; one review per participant after completed work |
| GET | `/receipts/:reference` | Own receipt, related job and test/real label; other participants' receipts are inaccessible |
| POST | `/wema/onboarding/request` | `nin`, `consent: true`; only when bank-ready; NIN is sent to Wema, never stored |
| POST | `/wema/onboarding/verify` | `otp`; uses saved bank tracking reference, not a client-supplied wallet owner |
| POST | `/wema/onboarding/status` | Independently recheck the signed-in user’s pending wallet ownership; persist confirmed account/environment |
| POST | `/wema/deposits/check` | `reference` only; own active wallet in the current bank environment; requery credit and return refreshed own wallet summary |
| POST | `/wema/balance/refresh` | Read current available balance from Wema; match account/currency, preserve old timestamp on failure |
| POST | `/webhooks/wema/deposits` | Authenticated bank credit notification; independently verify reference/account/amount/currency/direction, then save one owned deposit/receipt |
| POST | `/wema/payments/create` | `jobId`, `password`; employer-only step-up, two active Wema wallets, accepted Wema-rail job |
| POST | `/wema/payments/reconcile` | `reference`; employer requeries own saved bank payment and independently verifies it |
| POST | `/wema/statements/request` | `fromDate`, `toDate`, `consent: true`; requires bank wallet and ALAT consent |
| POST | `/wema/statements/sync` | Fetches approved statement using saved, unexpired reference; returns only LocHire-related rows |
| POST | `/webhooks/wema/wallet` | Bank-agreed callback authentication plus independent wallet read-back |
| POST | `/webhooks/wema/authorize` | `transactionReference`, encrypted `securityInfo`; responds with `authorized` |
| POST | `/webhooks/wema/transactions` | Authenticated notification signal; requery determines final status, not the client payload |

Funding, job creation/actions and bank payment creation require `Idempotency-Key: <8–100 character unique key>`. Keep the same key and payload when retrying an uncertain response. Reusing the key with different details returns 409. Money guards run inside a D1 transaction, so concurrent jobs cannot spend the same balance. Job scope and price are immutable; create a new agreement for a change.

## Example test request

```js
await fetch('/api/sandbox/fund', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID()
  },
  body: JSON.stringify({ amount: 5000000 })
});
```

This adds ₦50,000 of **test money** to the authenticated account. It cannot charge a real account.

Errors have `{ error: "message" }`. Common codes: 400 invalid input, 401 sign-in/password failure, 403 ownership/origin failure, 404 inaccessible record, 409 changed state/insufficient funds/duplicate review, 429 request limit, 503 disconnected bank/service. Provider payloads and internal database errors are not exposed.

## Data model

`users`, `sessions`, `wallets`, `payment_jobs`, `job_locations`, `transactions`, `operations`, `payment_reviews`, `bank_requests`, `bank_events`, `bank_deposits`, `bank_balances`, `rate_limits`. Schema and versioned migrations live in `payment-backend/db/schema.ts` and `payment-backend/drizzle/`. Sessions are random opaque tokens; only their hashes are stored. Wallet balances are never taken from browser localStorage.

Job summaries return `location: null` when none was attached. An invited or declined worker receives only `status`, `environment` and `privateUntilAccepted: true`; postcode, address and administrative details are omitted. A server-recorded acceptance grants the participant the stored location, including in their own job-linked receipt view. Manual postcodes are unconfirmed and contain no provider address. See [the postcode guide](POSTCODE-INTEGRATION.md).

## Deposit contract

`/config` now includes `wema.deposits`: readiness, enabled flag, environment and missing setting names, never secret values. Bank read/check operations are limited to 10 attempts per account per five-minute window, alongside the overall request limit. A deposit check is read-only at the bank and repeated references are safe without initiating another transfer.

Amounts in `bankDeposits` and `bankBalance` are integer kobo. Deposits have `reference`, `status` (`pending`, `unknown`, `failed`, `successful`), nullable `amount`, `environment`, `receipt_reference`, `created_at`, and `verified_at`. A user-submitted reference/amount never establishes a successful deposit. Completed deposit receipts include a `deposit` projection with the original bank reference and account. The same reference has one receipt per verified account/environment; callbacks can confirm a deposit even if the user never entered a reference.

`bankBalance` is null until the first successful read. Its `available`, `account`, `currency`, `environment`, and `checkedAt` come from a verified bank read-back. Deposit history does not update `wallet.available` or `wallet.held`. A failed balance request returns 502 and preserves the prior snapshot/timestamp; it never reports zero as a substitute. No outbound transfer is submitted by a deposit check.

## Wema simulation

`/config` reports `wema.simulated=true`, `environment=demo`, and ready demo deposit features when `WEMA_MODE=demo`, `PAYMENT_MODE=sandbox`, `WEMA_ENABLED` is false, and the configured bank environment is not production. Conflicting live flags disable simulation. Provider credentials never turn simulation into a bank request.

Demo setup uses the existing onboarding routes: request with `consent:true` **without NIN**; verify with public code `123456`. `POST /wema/demo/deposits/create` takes integer-kobo `amount` and `scenario` (`successful`, `pending`, `failed`) plus Idempotency-Key. The same saved reference/check settles a pending deposit once. Accounts/balances/deposits use environment `demo`; transactions/receipts use `wema_demo` and TEST-NGN. Existing Wema payment routes simulate guarded transfers between demo wallets, reserve pending amounts and settle on reconciliation. Statement consent/history are simulated. All real bank callback routes are disabled.

`payment_jobs.bank_environment` records the creation environment; a demo agreement cannot be used for a bank transfer. `demo_bank_balances` keeps isolated available/held balances. No demo account ID is a ten-digit bank account number. Actual bank setup must be completed separately after selecting bank mode.
