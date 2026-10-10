# Paystack activation for LocHire

LocHire uses Paystack hosted checkout and split settlement to each worker's supported Nigerian bank account. A provider-confirmed payment and a bank settlement are separate events. The app does not offer a stored-value wallet, top-ups, manual withdrawals, custody or escrow.

## What the owner needs

1. Create and activate a Nigerian business account at https://dashboard.paystack.com. Complete the provider's required business checks and confirm that worker subaccounts/split settlement are permitted for the LocHire business model.
2. Configure `PAYSTACK_SECRET_KEY` as a secret in the private LocHire backend environment. Use a test key only in an isolated non-production test environment. Production refuses test keys/mode.
3. Set the Paystack webhook URL to **https://lochire.vercel.app/api/webhooks/paystack**. The gateway forwards the exact raw payload; the backend verifies Paystack's SHA-512 signature and confirms saved references with the transaction verification API.
4. Set `PAYSTACK_MODE=live`, `PAYSTACK_ENABLED=true` only for the activated account. No public key is required because checkout is initialized server-side and uses Paystack's hosted authorization URL. There is no separate Paystack webhook secret: signatures use the secret API key.
5. Validate supported banks, account-name resolution, subaccount eligibility, available checkout methods, payment verification, settlement timing, fees, failure/reversal handling and customer-support/refund operations in the provider's sandbox before going live. Actual provider tests and a controlled live payment require the merchant's approved account and explicit authorization for the amount.

## Implemented flow

- Workers choose a supported bank, enter an account number and approve verification. After checking the resolved name, they confirm account ownership/settlement and their LocHire password.
- The server creates a worker subaccount. The public app never exposes full bank numbers or subaccount codes; only the owner sees the bank, account name and last four digits. Resolved account data has a ten-minute confirmation window and is removed on save; expired tokens are purged on payment requests.
- A hirer selects a mutually confirmed work agreement, reviews the agreed amount, identifies the period for recurring/hourly/daily work, and approves checkout.
- The amount, recipient and reference are determined on the server. The platform's share is zero; provider fees are borne by the worker's settlement and are disclosed before checkout.
- Checkout attempts are durable and keyed to work, terms version and period. Repeated or concurrent submissions do not create a second charge. An uncertain initialization stays saved for reconciliation; do not manually repeat it with different work details to bypass that guard.
- A return URL never proves success. Signed webhook events and participant-triggered status checks verify reference, amount, currency, provider mode and subaccount before showing paid. Duplicate events produce one history record/notification. A reversed payment cannot later be overwritten as successful.
- Paystack handles settlement on its schedule. LocHire does not label payment success as a completed bank payout.
- Direct cash/bank-transfer declarations still require worker acknowledgement and are shown separately from provider-verified payments.

Refund initiation and an administrative provider-recovery tool are not implemented in the app. Use the Paystack business dashboard and LocHire report channel for these operations. An ambiguous checkout/subaccount timeout is held for support review to prevent duplicate external actions.

## Official API references

- https://paystack.com/docs/payments/split-payments/
- https://paystack.com/docs/api/subaccount/
- https://paystack.com/docs/api/verification/
- https://paystack.com/docs/api/miscellaneous/
- https://paystack.com/docs/api/transaction/
- https://paystack.com/docs/payments/webhooks/

## Other optional providers

Email verification/password recovery: private `RESEND_API_KEY` and `EMAIL_FROM` on a verified sending domain. General hiring-event emails are not implemented.

Automated postcode lookup: the assigned NIPOST API key and approved lookup contract. Manual general area entry already works. No additional API is required for profiles, jobs or conversations.

Never put secret keys in frontend JavaScript, GitHub, chat or screenshots. Gateway and database credentials remain unchanged.
