# LocHire deposit flow

## What is live today

The app, database, deposit screens and adapter are deployed. Test top-ups work end to end. Real Wema deposits remain **disabled** until approved product credentials and verified credit/balance response contracts are supplied. Bank behavior is currently tested with simulated responses, not actual Wema sandbox access.

## User journey

1. Create/sign into a LocHire wallet. Choose **Add money**.
2. Choose **Add test funds** to practise without spending real money, or **See Wema deposit flow** for bank transfers.
3. When connected, consent to Wema onboarding, complete NIN/OTP checks and wait for independent account confirmation. Use **Check Wema account setup** if the account-generation callback is delayed. LocHire does not save NIN/OTP.
4. In **Deposit with Wema**, inspect the confirmed bank/account name/number. Copy the number and transfer using a banking app. Never transfer to the `LH-…` application ID. Sandbox details are test-only; never send real money to them.
5. Wema notifies LocHire. The backend independently queries the credit status and matches the reference, destination account, NGN currency, credit direction and a positive exact amount. The callback amount/status is not trusted.
6. A confirmed credit appears once under **Deposits** and **Transactions**, with a private receipt containing the original bank reference. If automatic confirmation is delayed, enter the bank reference and check it. A screenshot or “I paid” claim does not create a successful deposit.
7. **Refresh Wema balance** asks Wema for the current available amount. The bank account/currency must match, and the displayed timestamp remains visible. History totals are not a bank balance.

Test balances and Wema funds are separate. Wema funds stay in the customer's bank wallet, and accepted Wema job agreements use the existing direct bank transfer path. Test agreements reserve/release test funds. Neither is a claim that LocHire operates real escrow.

## Delays and errors

| State | What the user sees | What changes |
|---|---|---|
| Pending | Awaiting bank confirmation; check the same reference | Saved pending check, no amount/receipt |
| Unknown | Bank confirmation unavailable; retry later | Saved reference, no successful deposit |
| Failed | Bank reports failed; contact the sending bank | No deposit receipt; a later independent successful status can correct the record |
| Successful | Wema confirmed; view receipt | One deposit record/receipt; test funds unchanged |
| Wrong account / currency / direction / response | Unable to confirm or account mismatch | No deposit receipt |
| Balance outage | Bank balance could not be checked | Previous snapshot and timestamp retained |

Do not send another transfer because a status is pending. Check with the sending bank when a debit is unresolved. Transfer fees, limits, bank availability and settlement timing are determined by the bank; LocHire does not promise free or instant deposits. Reversals need a separate bank-confirmed reversal contract and are not implemented by changing a local balance.

## Wema integration to activate

Start with approved Wallet Creation, Account Management/balance and Transaction Notification products. Ask Wema for an independent **incoming credit requery** endpoint, exact amount units, account/reference/status/currency/direction fields, authenticated notification contract and sandbox credit fixtures. The Credit Wallet API described in public docs is a channel payout/funding product; this app does not debit an unspecified channel settlement account to fund user deposits.

The isolated adapter is `payment-backend/lib/deposits.mjs`. Its current subscription projections are:

```json
{"data":{"transactionReference":"BANK-fixture-01","destinationAccountNumber":"0000000001","status":"SUCCESSFUL","direction":"CREDIT","currency":"NGN","amount":"123.45"}}
```

```json
{"data":{"accountNumber":"0000000001","currency":"NGN","availableBalance":"987.65"}}
```

These are **fictional test contracts**, not a claim about Wema's private response schema. Update those projections to the subscribed bank schema before enabling. Allowed statuses are SUCCESS/SUCCESSFUL, PENDING and FAILED. Amounts must be whole kobo or valid naira with at most two decimal places. The server never rounds a malformed bank amount into an accepted credit.

Configure the existing bank settings plus:

| Variable | Required value |
|---|---|
| `WEMA_DEPOSITS_ENABLED` | Default `false`; enable only after sandbox contract tests |
| `WEMA_DEPOSIT_CONTRACT_CONFIRMED` | Default `false`; confirms incoming credit verification and balance mappings |
| `WEMA_DEPOSIT_STATUS_PATH` | Bank-approved GET path with `{reference}` and optional `{channelId}` |
| `WEMA_BALANCE_PATH` | Bank-approved GET path with `{accountNumber}` and optional `{channelId}` |
| `WEMA_AMOUNT_UNIT` | Explicit `naira` or `kobo` |
| `WEMA_AUTH_HEADER` | `x-api-key` (default) or `Ocp-Apim-Subscription-Key`, as bank-issued |

Keys stay in the private backend runtime. Redeploy after configuration changes. Register `https://lochire.vercel.app/api/webhooks/wema/deposits` for the approved credit-notification stream; authentication currently uses the bank-agreed `x-wema-callback-token` contract described in WEMA-INTEGRATION.md. If Wema uses one combined debit/credit stream, its approved dispatcher must route job transfer signals and external credit signals appropriately. Known in-app job payment references are not duplicated as deposits.

Activation tests: valid credit, pending→successful, timeout→successful, failed, wrong reference/account/currency/direction, fractional amount, duplicate and concurrent notifications, callback before user action, unauthenticated notification, balance failure, receipt access by another account, and sandbox→production isolation. Run `npm test` and `node --test payment-backend/tests/*.test.mjs`, then repeat against Wema's actual sandbox. Production activation also requires bank approval and a permitted small live verification.

## Official documentation

- [Wallet Services](https://playground.alat.ng/product-wallet-services)
- [Transaction Notification](https://playground.alat.ng/api-transaction-notification)
- [ALAT API portal and subscriptions](https://wema-alatdev-apimgt.developer.azure-api.net/)
