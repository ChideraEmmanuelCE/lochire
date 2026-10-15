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

There is currently no separate credential-entry form in LocHire. Secret setup
must use the supported private hosting configuration; screenshots are not keys.

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
