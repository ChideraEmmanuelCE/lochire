# Paystack activation for LocHire

The current product sells LocHire Premium (₦900) and Premium Plus (₦1,200), each for 30 days without renewal. It uses one-time hosted checkout without worker subaccounts or split payments.

Follow [the Paystack Premium setup guide](../payment-backend/PAYSTACK_PREMIUM_SETUP.md) for secure live-key configuration, the exact webhook URL, backend flags and verification steps.

The production webhook is **https://lochire.ng/api/webhooks/paystack**. Store `PAYSTACK_SECRET_KEY` as a sensitive production environment variable in Vercel and redeploy. No public key is required. Keep `PAYSTACK_ENABLED=false`; premium uses `PAYSTACK_PREMIUM_ENABLED=true` with `PAYMENTS_PRODUCT=premium`.

Email verification, recovery and Premium Plus alerts continue to use private `RESEND_API_KEY` and a verified `EMAIL_FROM`. Gateway credentials, database binding and existing account data remain unchanged.
