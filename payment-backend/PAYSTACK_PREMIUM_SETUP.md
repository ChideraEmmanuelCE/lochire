# Paystack Starter setup for LocHire

LocHire collects only its own premium fees: ₦900 for Premium and ₦1,200 for Premium Plus, each for 30 days without automatic renewal. Salary and task payments are arranged directly between participants. The integration does not need worker subaccounts, Transfers, a public API key or a subscription plan.

## Live configuration

1. In Paystack, complete activation for the Starter account and its settlement bank.
2. In Vercel → RIDEA → lochire → Settings → Environment Variables, add **PAYSTACK_SECRET_KEY** with the account's live secret (`sk_live_…`) for **Production**, using a sensitive value. Redeploy production after saving. Never paste the key in chat, source files, browser code or screenshots.
3. In the private Sites backend, set `PAYSTACK_MODE=live`, `PAYSTACK_PREMIUM_ENABLED=true` and `PAYSTACK_ALLOW_KEY_RELAY=true`. Keep `PAYMENTS_PRODUCT=premium`, `APP_MODE=production`, `PAYMENT_MODE=live`, `PAYSTACK_ENABLED=false` and `KORAPAY_PREMIUM_ENABLED=false`. Redeploy the backend to apply settings.
4. In Paystack's live API Keys & Webhooks settings, save **https://lochire.ng/api/webhooks/paystack** as the webhook URL. Paystack signs events with the same secret API key; there is no separate webhook secret.
5. Check `https://lochire.ng/api/config`: `payments.name` should be `Paystack`, `mode` should be `live`, and `ready` should become `true`. This checks configuration, not account approval or a real payment.
6. With the owner present, sign into a published worker profile and approve one ₦900 or ₦1,200 checkout. Verify the return to LocHire, one saved purchase, active access, and the matching Paystack dashboard transaction. A missing key keeps checkout unavailable. Do not claim live payments work until a real checkout has been verified.

Alternatively, save the live secret directly in the private backend and leave `PAYSTACK_ALLOW_KEY_RELAY=false`. A matching backend secret takes precedence. With gateway relay, only the saved server environment value is forwarded after service authentication; client-supplied keys are ignored. Keep preview/test credentials separate from production.

## Verification and refunds

The backend initializes a hosted payment with an authenticated user's email, a server-owned amount in kobo, a unique reference and account/tier metadata. The callback URL is generated per purchase. Only Paystack's HTTPS checkout host is accepted. A callback or claimed success alone never grants access: the backend verifies the provider transaction's reference, metadata, amount, currency, mode and customer email.

Signed `charge.success` webhooks use the same verification and atomic grant path as the user's Check payment action. Duplicate callbacks and retries cannot add another pass. `refund.processed` is read back from Paystack's Refund and Transaction APIs before revoking the affected pass. Initiate refunds in the Paystack dashboard; LocHire does not initiate them. Check disputes and settlements there as well.

Migration 0022 adds `provider` to the existing `lh_kora_premium_orders` table. Its default preserves historical Kora rows; new Paystack purchases explicitly select Paystack. Existing premium grants are preserved. Keep historical Kora credentials available for any outstanding Kora orders.

## Automated checks

Run `npm test` and `npm run build` in the frontend, and `node --test tests/*.test.mjs` in the private backend. Fixtures exercise checkout, test/live separation, raw webhook signatures, refunds, duplicate fulfillment, secret relay and the account UI without making external charges.

Official references: [Accept payments](https://paystack.com/docs/payments/accept-payments/), [Verify payments](https://paystack.com/docs/payments/verify-payments/), [Webhooks](https://paystack.com/docs/payments/webhooks/), [Refunds](https://paystack.com/docs/api/refund/).
