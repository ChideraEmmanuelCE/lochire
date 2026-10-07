# Hackaholics demo: LocHire work + Wema-ready payments

## Three-minute demonstration

1. Open https://lochire.vercel.app/#wallet. Explain: "LocHire connects local workers to employers. This payment layer keeps the agreed work and money record together. We are demonstrating test money while Wema integration credentials are pending."
2. Create a **worker** test account with fictional details. Copy its `LH-…` wallet ID. Show the optional Wema setup card and explain the bank's NIN/OTP flow.
3. Sign out and create an **employer** account, or use a second device/private browser session. Add ₦50,000 of test funds. Create a ₦20,000 payment job using the copied worker ID, title and scope.
4. Sign in as the worker. Open **Payment jobs**, read the scope/price and accept. Sign in as employer and reserve the test payment. Show the balance moving from Available to Reserved.
5. Mark the worker's side finished. Show that this alone does not release the payment. Confirm completion as employer. Show the worker receiving ₦20,000 once and open/download its test receipt.
6. Leave a participant review. Show the worker's completed-job count and rating. Explain that these are test activity records; real reputation will use actual completed engagements. No worker is labelled "100% reliable".

Each real browser session has one signed-in account. Separate normal/private browsers or two devices make a two-person demo easier. Signing out and back in also works; payment records are saved on the server.

## The Wema connection to explain

"With Wema's Wallet Creation and Debit Wallet products, consenting users can create bank wallets and pay workers from one confirmed Wema wallet to another. Our backend records a transfer only after requerying Wema and matching the reference, amount and accounts. Transaction history is tied to the job. Reading additional bank history requires customer approval in ALAT."

The proposed direct bank payment is separate from the test reserve/release flow. A real escrow or holding arrangement requires bank approval. Wema supplies product access, credentials, callback details and the subscribed request/response contracts; those final mappings are isolated in the adapter.

## Useful points for judges

- Bank onboarding comes from everyday work demand: local workers need a clear way to receive income.
- Employers see agreed scope and price before paying; both sides retain a receipt.
- Separate authenticated accounts can see the same payment job across devices.
- Retries and duplicate callbacks cannot create duplicate wallet movement/history.
- Trust is based on specific completed-job and review evidence, with sample counts visible.
- The existing hiring examples remain local; public hiring, delivered email/SMS and moderation need their own live services. Do not claim those are already connected.
