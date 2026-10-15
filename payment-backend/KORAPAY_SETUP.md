# Kora setup status

The notification URL is `https://lochire.ng/api/webhooks/korapay`.

This release implements a notification inbox, not the complete deposit/wallet
integration. It verifies the HMAC-SHA256 signature of `JSON.stringify(data)`,
queries Kora's charge endpoint independently, then records minimal confirmed NGN
virtual-account receipts once in `bank_events`, with `status=verified_unapplied`.
Duplicate callbacks do not add receipts or money. Test and live receipts have
separate IDs. No full provider payload, BVN, payer bank details or keys are stored.

It does **not** create customer bank accounts, associate receipts with LocHire
users, credit balances, purchase listings, pay workers or enable withdrawals.
Existing Paystack and direct-payment flows are unchanged. Do not advertise bank
funding as available or ask users to transfer money yet.

## Configure testing

1. In Kora Test mode, open Settings > API Configuration > Notification URLs.
2. Set the notification URL above using Update URLs. This alone does not enable
   transaction processing.
3. Save the test secret as a private Sites runtime secret named
   `KORAPAY_SECRET_KEY`. Do not paste it into chat, source or browser code.
4. Set `KORAPAY_MODE=test` and `KORAPAY_WEBHOOKS_ENABLED=true`, then deploy the
   existing saved Site version to apply the environment revision.
5. GET the notification URL to confirm `webhookReady=true`. Until configured,
   POST responds 503 so Kora can retry instead of silently losing notifications.

### Enter the test key directly in Vercel

The owner can instead save `KORAPAY_TEST_SECRET_KEY` as a **Secret** scoped to
Production in the LocHire Vercel project's environment settings. Here Production
means the hosted gateway environment; the Kora key must still start `sk_test_`.
Redeploy Vercel after saving it. Never post the key in chat or source code.

For this path, set the private Sites runtime config to `KORAPAY_MODE=test`,
`KORAPAY_WEBHOOKS_ENABLED=true`, `KORAPAY_ALLOW_TEST_KEY_RELAY=true`, and
`KORAPAY_BUSINESS_APPROVED=false`, then deploy the saved Site version.
The gateway sends only its own saved test key over HTTPS, only on the exact Kora
webhook route, after stripping client-supplied copies. The backend requires its
existing private service credential before reading this header. It does not
persist or return the relayed key, accepts no live key via this path, and gives
a directly configured Sites key precedence. Missing keys still return 503.

There is no separate credential-entry form inside LocHire. Screenshots are not
keys. This config enables only the notification inbox, never balance funding.

## Before real deposits

Obtain Kora approval specifically for an unregistered marketplace issuing
customer virtual accounts, holding spendable balances and paying workers. KYC
submission/approval alone does not establish access to all those products.

Implement and test account creation/ownership, secure customer BVN submission,
atomic credits, reconciliation of missed notifications, provider fees,
refunds/reversals, balance spending, worker earnings and withdrawals before
enabling funding. `KORAPAY_BUSINESS_APPROVED=true` is additionally required for
live notification handling. That switch does not implement the missing flows.

Provider documentation:
- https://developers.korapay.com/docs/webhooks
- https://developers.korapay.com/docs/virtual-bank-accounts-ngn
- https://developers.korapay.com/docs/api-keys
