# LocHire live API

The browser calls same-origin `/api/` routes. Vercel forwards them to the private backend with a server-only service key. Authenticated requests use the opaque HttpOnly `lh_session` cookie. POST requests require the configured app Origin. There is no browser-supplied user ID authorization.

| Route | Method | Behavior |
|---|---|---|
| `config`, `health` | GET | Production feature readiness and persistent storage health |
| `auth/register` | POST | Name, email, Nigerian phone, password, role and `termsConsent=true` |
| `auth/login`, `auth/logout` | POST | Session creation and revocation |
| `auth/password` | POST | Current password and new password; revokes all sessions |
| `auth/forgot`, `auth/reset` | POST | Email recovery request and single-use reset token; email provider required |
| `auth/verification/request`, `auth/verify` | POST | Verification email and single-use address confirmation |
| `hiring/state` | GET | Shared published listings plus this account's private records |
| `hiring/profiles/worker`, `hiring/profiles/employer` | POST | Save owned profile; updates require its current `revision` |
| `hiring/openings` | POST | Create an owned opening; retry with the same `requestId` |
| `hiring/openings/:id` | POST | Owner-only edit or `{action:"status",status,revision}` |
| `hiring/engagements` | POST | Worker interest or employer invitation / one-off booking |
| `hiring/engagements/:id/:action` | POST | Participant action: accept, decline, message, terms, confirm, complete, cancel, review |
| `hiring/payments` | POST | Hirer declares a direct payment, amount in integer kobo and stable `requestId` |
| `hiring/payments/:id` | POST | Worker acknowledges or disputes receipt |
| `hiring/blocks` | POST | Account-owned profile blocks or unblocks another profile |
| `hiring/reports` | POST | Privately save a report with target, kind, reason and details |
| `hiring/notifications` | POST | Mark the signed-in account's notifications read |
| `payments/banks` | GET | Authenticated provider-supported Nigerian bank list |
| `payments/bank/resolve` | POST | Consent, bank code, account number; returns a private confirmation token |
| `payments/bank/save` | POST | Confirmation token, password and consent; creates private worker subaccount |
| `payments/checkout` | POST | Hirer-only agreed work/version/period; server-owned amount and recipient |
| `payments/verify` | POST | Participant-only authoritative verification of a saved reference |
| `webhooks/paystack` | POST | Raw-body SHA-512 signature validation, then provider verification |
| `wallet/role` | POST | Change active worker / hirer mode without changing account |
| `wallet` | GET | Production summary; no historical test-money balance |
| `admin/reports` | GET / POST | Verified administrator queue and recorded moderation resolution |

Every engagement mutation requires the current `revision`. Confirmation also requires the current terms `version`. Stale requests return 409; refresh before taking an action on changed details. Only the recipient can respond to a pending invitation. Completion requires confirmed work details and both participants. One review per participant per completed engagement is permitted.

Direct-payment records have `reported`, `acknowledged` or `disputed` status. Only the employer reports payment and only the receiving worker acknowledges it. They never create bank balances, authorize a debit or issue bank-verified receipts.

Public discovery removes phone, email, exact coordinates and postcodes. Optional transient `lat` and `lon` query parameters return coarse worker distances; they are not saved as the visitor's location. Exact worker snapshots expire for discovery after 24 hours.

Production rejects test-money funding and retired bank routes. `hiring/state` also returns `provider`, owner-only masked `bank` and participant-only `onlinePayments`; anonymous responses contain no bank or payment details. Online charge success and participant-acknowledged direct payments remain separate. No stored-value wallet is created. See `PROVIDER_SETUP.md` for activation and settlement/fee details.
