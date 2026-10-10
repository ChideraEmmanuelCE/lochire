# LocHire production provider activation

Profiles, openings, conversations and direct-payment acknowledgements use the existing persistent backend. No additional API is needed to create a worker or hirer profile.

## Wema / ALAT bank payments

LocHire currently keeps bank money movement disabled. Direct cash/bank-transfer declarations are records between participants, not verified bank transactions, escrow or wallet balances.

Request production partnership access from Wema for Wallet Creation, Wallet Account Management, Credit Wallet/incoming-transfer notifications and Debit Wallet/interbank transfers. The bank must enable the relevant products for LocHire's assigned channel. Request the current API/OpenAPI specifications, sandbox access, production base URL, API subscription key, channel ID, KYC/OTP flows, registered callback requirements, transaction read-back/status endpoints, account balance endpoint, incoming-transfer verification, fees/limits and refund/failure behavior. Ask separately for the approved collection/card product if card checkout is required; wallet access alone does not activate card payments.

Official references:
- https://playground.alat.ng/product-wallet-services
- https://playground.alat.ng/api-wallet-creation
- https://playground.alat.ng/api-ws-account-management
- https://playground.alat.ng/api-debit-wallet

Private backend configuration currently expects:
- `WEMA_BASE_URL`: bank-confirmed production base URL.
- `WEMA_API_KEY`: bank-issued secret subscription/API key.
- `WEMA_CHANNEL_ID`: bank-assigned channel.
- `WEMA_AUTH_HEADER`: bank-confirmed authentication header.
- `WEMA_WALLET_VERIFY_PATH`, `WEMA_TRANSFER_STATUS_PATH`, `WEMA_DEPOSIT_STATUS_PATH`, `WEMA_BALANCE_PATH`: routes validated against the assigned product contract. Existing adapter response mappings must be reconciled with current specifications.
- `WEMA_CALLBACK_TOKEN`: LocHire callback secret where supported by the bank contract; do not substitute this for the bank's actual callback verification protocol.
- `WEMA_MANDATE_KEY`: internally generated 32-byte encryption key, hex encoded, for locally protected mandate material. This is not a bank-issued API key.

Do not enable money movement just by supplying a key. Implement/reconcile the agreed contract, complete customer bank-onboarding and payout UI, verify callbacks and authoritative read-back, test retries/reconciliation/failures in sandbox, and perform an explicitly approved controlled production test before activation. Historical simulation money must remain excluded.

## Resend verification and password recovery emails

Supply a sending-access Resend API key in private backend secret `RESEND_API_KEY`, and a sender on a verified domain in `EMAIL_FROM` (for example, `LocHire <accounts@your-domain>`). Complete the domain's required DNS verification in Resend. Account verification/reset delivery is implemented; general hiring-event emails are not implemented.

Official reference: https://resend.com/docs

## Optional postcode lookup

Manual general area entry already works. Automated lookup needs the assigned NIPOST production API key and the confirmed lookup contract. This is optional for profile creation and payments.

## Where to configure keys

Store credentials in the private LocHire backend environment, never in frontend JavaScript, GitHub, screenshots or chat. Keep `WEMA_ENABLED=false` and `WEMA_DEPOSITS_ENABLED=false` until the integration is validated. Existing authentication/storage/hosting need no replacement API.
