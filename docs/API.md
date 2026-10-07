# Payment API

Base URL: `https://lochire.vercel.app/api`. Requests use JSON. Authentication uses the `lh_session` HttpOnly, Secure, SameSite=Lax cookie. Mutating requests must originate from the configured LocHire origin. The browser never receives the private service access token or bank credentials.

Money is an integer number of **kobo**. `2000000` means ₦20,000. Test balances use `TEST-NGN`; bank transaction records use `NGN` and `mode: wema`. The ledgers are separate.

## Routes

| Method | Path | Input / behavior |
|---|---|---|
| GET | `/health` | Payment-service/storage/bank status |
| GET | `/config` | Safe feature flags and names of missing bank settings; no secret values |
| POST | `/auth/register` | `name`, `email`, Nigerian `phone`, `password` (10+ characters), `role` (`worker`, `employer`, `both`), `demoConsent: true` |
| POST | `/auth/login` | `email`, `password`; establishes cookie |
| POST | `/auth/logout` | Revokes the current server session and clears its cookie |
| GET | `/wallet` | Own user, available/reserved test balances, recent transactions/jobs, eligible reviews and trust evidence |
| GET | `/members/:walletId` | Registered member's name, role and work evidence; no private contacts or balances |
| POST | `/sandbox/fund` | `amount`; at most ₦100,000 test credit per rolling 24 hours |
| POST | `/jobs` | `workerId`, `title`, `scope`, `category`, integer `amount`; optional `rail: wema` only after configuration |
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

`users`, `sessions`, `wallets`, `payment_jobs`, `transactions`, `operations`, `payment_reviews`, `bank_requests`, `bank_events`, `rate_limits`. Schema and versioned migrations live in `payment-backend/db/schema.ts` and `payment-backend/drizzle/`. Sessions are random opaque tokens; only their hashes are stored. Wallet balances are never taken from browser localStorage.
