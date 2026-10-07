# Wema demo: complete flow without bank credentials

The live app is running **LocHire's simulation of Wema banking**. No Wema API is called. This is separate from Wema's actual sandbox, which needs approved credentials and contract testing.

## Walkthrough

1. Create/sign into a LocHire test wallet with fictional details. Choose **Hiring** for the payer and **Finding work** for the worker.
2. Select **Set up demo wallet**, confirm simulation consent, then use public code **123456**. No SMS is sent; no real NIN or bank OTP is requested or accepted.
3. A **DEMO-… account ID** appears with a zero simulated bank balance. It is not a bank number and cannot receive transfers.
4. As hirer, select **Deposit with Wema**. Enter up to ₦100,000 per rolling 24 hours and choose successful, pending or failed. Successful adds simulated funds and a receipt. Pending saves a reference; choose **Check same reference** to complete once. Failed adds no funds.
5. Create a second worker test account, complete its demo setup and copy its LocHire `LH-…` wallet ID.
6. As employer, create a payment agreement using that worker ID and **Simulated Wema wallet**. Accept it as worker. As employer, confirm your LocHire password and request the demo payment. Sufficient simulated funds must be available.
7. The payment becomes pending and its amount is reserved in the simulated bank ledger. Choose **Check demo payment** to complete the transfer once. The worker's simulated balance increases and both participants receive simulated receipts. Neither ordinary TEST-NGN job balance changes.
8. Mark work finished as worker and confirm as employer. This records completion without requesting a second payment. Eligible completed-job reviews remain available.
9. Request bank payment history: in demo mode consent is simulated, with no ALAT login. Sync to see only the account's simulated records.

## Isolation

All records persist across devices under the user's authenticated wallet. Demo receipts explicitly say **SIMULATED WEMA**, `wema_demo`, TEST-NGN, and no real money. `demo_bank_balances` has nonnegative available/held constraints; shared guarded atomic operations prevent duplicate deposits, overdrafts and repeated settlement. Demo deposit references cannot settle another account's deposit. No bank API, email or SMS is sent.

Use `WEMA_MODE=demo`, `PAYMENT_MODE=sandbox`, `WEMA_ENABLED=false`, and a non-production `WEMA_ENVIRONMENT`. Conflicting real-bank flags disable simulation. External provider calls and bank callbacks are blocked while demo mode is selected. A payment agreement records its environment; demo agreements cannot spend bank funds.

## Connect the actual bank later

Set `WEMA_MODE=bank`, configure approved Wema sandbox credentials/products and mappings, and activate the provider only after contract testing. Complete actual bank onboarding; the DEMO ID is never reused as a bank number. Create new sandbox-bank payment agreements. Demo balances/history remain simulated and never convert into Wema money. See WEMA-INTEGRATION.md and DEPOSIT-FLOW.md.

## Balance updates

Each completed action immediately updates the acting user's dashboard. Open wallet screens fetch saved balances, held funds, deposits, payment jobs and receipts every 30 seconds, and refresh when you return to the tab. This lets a worker see a payment from an employer without manually reloading. Hidden tabs and signed-out sessions do not poll. A failed refresh retains the last saved balances and shows an update warning; it never guesses an amount. Background refreshes cannot overwrite a newer payment response or close a payment form. Simulated Wema balances remain separate from ordinary test-job funds. Actual bank balances are timestamped snapshots and still require the bank balance refresh action.

## Worker and hirer modes

**Finding work:** receive job payments, view earnings and withdraw available funds. Workers never need a deposit to receive work or payment. Deposit buttons and the deposit tab are hidden. **Hiring:** deposit funds, create payment agreements and pay workers. Use the wallet mode buttons or the app's role selector to switch. Both modes use the same account, existing balances and private history; switching does not create, reset or transfer money. The backend stores the active mode and rejects deposit/top-up/payment creation in worker mode.

After receiving a simulated Wema payment, choose **Withdraw Wema earnings**, enter an amount, a fictional destination label and your LocHire password, and confirm the demo notice. The simulated available bank balance decreases once and a private receipt is saved. Ordinary test earnings have a separate **Withdraw earnings** action and receipt. Held funds cannot be withdrawn. Retries cannot double debit; overdrafts and fractional kobo are rejected. There is no actual bank payout, bank-account validation, withdrawal fee or settlement-time promise. Real Wema withdrawal is disabled until approved payout contracts and verification are integrated. Never enter real bank details in the demo destination field.
