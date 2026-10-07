# LocHire + Wema: integration guide

The published app has a persistent **test wallet**. Real Wema accounts and transfers are disabled until Wema supplies credentials and confirms the subscribed API contracts. A test balance is never converted to real naira.

## Product approach

Registration creates a LocHire account and a zero-balance test wallet. Bank setup is optional and separate, so a person can explore hiring without opening a bank account. Once Wema is connected, users can request a Wema wallet, consent to the bank checks, enter their NIN and complete the bank OTP flow. Account details appear only after independent bank confirmation.

For bank payments, both parties need confirmed Wema wallets. The employer creates a **Wema** payment agreement; the worker accepts its scope and amount. The employer confirms their password before the backend requests a debit from their own Wema wallet to the worker's Wema wallet. A pending request is not shown as paid. The bank authorization callback validates the encrypted mandate, and a transaction callback triggers independent status/amount/account verification. Only a confirmed transfer creates real payment-history records.

The test flow reserves and releases test balances after two-party completion. The proposed real bank flow is a **direct bank transfer**; it does not claim to hold funds in escrow. Wema must approve any future custody, holding or escrow product before it is enabled.

## Official references reviewed

| Product | Official documentation | What LocHire uses |
|---|---|---|
| Wallet Services | https://playground.alat.ng/product-wallet-services | A bank wallet associated with each consenting user |
| Wallet Creation | https://playground.alat.ng/api-wallet-creation | NIN request, bank OTP, pending account generation, callback |
| Debit Wallet | https://playground.alat.ng/api-debit-wallet | Source and beneficiary enquiries, transfer request, debit authorization callback |
| Pay with Bank Account | https://playground.alat.ng/api-pay-with-bank-account | Alternative ALAT-approved collection rail; adapter methods exist but it is not the default worker-payout route |
| Get Statement | https://playground.alat.ng/api-get-statement | ALAT consent before fetching LocHire-related bank history |

The official wallet documentation requires NIN and an OTP sent to its associated phone. Bank generation may be pending and completed by callback. Get Statement requires the customer to approve in ALAT; its active consent request lasts 15 minutes. A bank account cannot establish that a worker will be reliable.

## What to obtain from Wema at Hackaholics

1. Approved **Wallet Creation**, **Debit Wallet**, wallet read-back/status, transaction notification and optional **Get Statement** access, with sandbox credentials first.
2. API base URL, API key/authentication header requirements, assigned `channelId`, Wema bank code and product rate limits.
3. Exact JSON schemas and status/amount/currency definitions for your subscribed products. Confirm `destinationBankCode`, enquiry results, transfer status fields and statement request fields in `payment-backend/lib/wema.mjs`.
4. A read-back endpoint that independently confirms the generated wallet's email, account number/name and active status. Configure its path as `WEMA_WALLET_VERIFY_PATH`, using `{trackingId}` where required.
5. A transaction requery endpoint that confirms reference, final status, **exact amount**, currency, debit account and beneficiary account. Configure `WEMA_TRANSFER_STATUS_PATH`, using `{reference}` and optionally `{channelId}`. Confirm whether bank amounts are naira or kobo.
6. Callback registration and authentication details. The current notification handler expects a bank-agreed secret in `x-wema-callback-token`. This is **our integration contract**, not a claim that Wema natively signs callbacks this way. If Wema supplies a different signature/IP/mTLS mechanism, adapt the gateway and callback verifier to it before enabling.
7. Confirmation that the proposed AES-GCM `securityInfo` mandate and response `{ transactionReference, authorized }` fit the debit authorization product. The authorization callback uses the encrypted, per-transaction mandate and does not require the notification secret header.

Credentials alone cannot establish a product-specific schema that is only available after subscription. Those mappings are isolated in one adapter, so the UI, auth, jobs, ledger and receipts do not need rebuilding.

## Environment variables

Set bank values in the **private payment backend**, not in the Vercel frontend bundle. Deploy a saved backend version after changing runtime values.

| Variable | Purpose |
|---|---|
| `WEMA_ENABLED` | Keep `false` until bank sandbox testing is complete |
| `WEMA_ENVIRONMENT` | `sandbox` for bank testing, `production` only for approved live access; bank sandbox receipts stay marked test |
| `WEMA_BASE_URL` | Bank-issued HTTPS API origin/base path |
| `WEMA_API_KEY` | Secret key; sent only by server requests |
| `WEMA_CHANNEL_ID` | Channel assigned to LocHire |
| `WEMA_CALLBACK_TOKEN` | Bank-agreed transaction/wallet notification authentication secret |
| `WEMA_MANDATE_KEY` | Random 32-byte key, encoded as 64 lowercase hex characters, for AES-GCM mandates |
| `WEMA_WALLET_VERIFY_PATH` | Confirmed wallet read-back path |
| `WEMA_TRANSFER_STATUS_PATH` | Confirmed payment requery path |
| `WEMA_AMOUNT_UNIT` | `naira` or `kobo`, matching the bank response |
| `WEMA_BANK_CODE` | Wema bank code, confirm against bank list; default `035` |
| `WEMA_CONTRACT_CONFIRMED` | Set `true` only after validating schemas, callback transport and mandate contract |

The public adapter implements the documented wallet request/OTP and debit-wallet paths. Private subscription response projections are explicitly marked in `lib/wema.mjs`. `bankReadiness()` fails closed while required configuration is missing. No real bank key, NIN or OTP is present in source control.

## Public callback URLs to register

| URL | Purpose |
|---|---|
| `https://lochire.vercel.app/api/webhooks/wema/wallet` | Notification that a requested wallet has been generated; independently verify before activating |
| `https://lochire.vercel.app/api/webhooks/wema/authorize` | Validate encrypted debit mandate against the saved payment reference, amount, payer and beneficiary |
| `https://lochire.vercel.app/api/webhooks/wema/transactions` | Requery the bank and record a verified transfer once |

The private backend origin is not the URL to give the bank. Vercel forwards approved callback requests to it using server-only access credentials.

## Bank activation sequence

1. Confirm the subscribed response/request projections in `lib/wema.mjs` and the callback verifier. Use Wema's actual sandbox contract rather than guessed values.
2. Configure sandbox bank variables and redeploy the backend. Confirm `/api/config` reports the intended readiness.
3. Test NIN/OTP, delayed account generation, rejected OTP, unrelated wallet callbacks and account ownership. The application never stores NIN or OTP.
4. With two bank-confirmed accounts, create a Wema payment job, accept it as the worker, and initiate a transfer as the employer. Confirm enquiry results before debit.
5. Test successful, failed and delayed transfers. Retries must requery the **same reference**; timeouts must not create another bank debit. Verify replayed notifications cannot duplicate history.
6. Test a callback claiming success with the wrong reference, amount, currency or beneficiary. No credit/history entry may be accepted from it. Statement imports are informational and never change the test ledger.
7. Request statement consent in ALAT and test approval, rejection and expiry. Do not silently read unrelated account history.
8. After Wema approves production access and operational requirements, switch to the approved production configuration and test a small permitted transfer. Keep test and real records separately labelled.

Live failures are not automatically refunded by a local balance update. Bank reversals require a bank-confirmed reversal contract; they are intentionally not inferred from a failed HTTP response.
