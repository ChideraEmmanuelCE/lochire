# LocHire private payment service

Persistent wallet accounts, test ledger, payment agreements, receipts, reviews and an isolated Wema adapter. LocHire's Vercel gateway accesses this service through its owner-private Sites boundary.

Product/integration documentation: https://github.com/ChideraEmmanuelCE/lochire

`app/api/[...path]/route.ts` routes requests to `lib/service.mjs`. The service implements secure sessions, participant authorization, integer-kobo accounting and idempotent transactional batches. `lib/wema.mjs` implements bank HTTP methods, read-back verification and encrypted debit mandates. Live calls fail closed until the subscribed bank contract is confirmed.

`db/schema.ts` and `drizzle/` own the D1 schema. `tests/payments.test.mjs` exercises the service with SQLite and separately mocked bank responses.

Preserve the Sites Vinext starter's `sites()` integration, project ID and `DB` binding in `.openai/hosting.json`. Configure runtime secrets through Sites, then deploy a saved version. Keep the service private.

```sh
node --test tests/payments.test.mjs
npm run build
```

Schema edits: `npm run db:generate`, inspect the new migration, test, then publish. Keep applied migrations unchanged.

`PAYMENT_MODE=sandbox` controls the test ledger. `WEMA_ENABLED=false` disables bank APIs until approved credentials and schemas are configured. Test balances never become real naira. Variable names are in `.env.example`; actual secrets remain in runtime configuration.

## NIPOST postcode locations

`lib/postcode.mjs` performs consented, authenticated postcode lookup and signs account-bound confirmation tokens. `job_locations` stores optional immutable payment-job locations; its accepted timestamp controls worker address visibility. Provider calls remain disabled without the NIPOST key. See the frontend repository's `docs/POSTCODE-INTEGRATION.md` for activation, approved sandbox examples and the privacy contract. Run `node --test tests/*.test.mjs` to include the postcode and payment tests.

## Wema deposits

`lib/deposits.mjs` verifies incoming credits independently and persists `bank_deposits` plus private deposit receipts. `bank_balances` stores a timestamped bank-read snapshot. Neither changes the TEST-NGN ledger. The new migration adds environment-specific account ownership. Legacy active accounts with no recorded bank environment cannot use the new deposit path; re-confirm them with the bank rather than guessing their environment. Deposit APIs remain disabled by default until the bank supplies and approves credit/balance endpoints and response mappings. See the public repository’s `docs/DEPOSIT-FLOW.md` and `.env.example`.
