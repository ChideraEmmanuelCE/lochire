# NIPOST postcode integration

LocHire includes optional postcode selection in **Post an opening → Work details** and **Wallet → Create payment agreement**. City and general area remain available without the provider. Blank postcode fields do not block posting or payments.

## What the app does

1. An employer may enter a postcode in hyphenated, spaced or compact form. A format check alone produces **Not checked**, never a verification badge.
2. When connected, the employer explicitly consents to sending the code to NIPOST and chooses **Check postcode**. An authenticated LocHire wallet session is required for provider calls, including when posting a local hiring example.
3. The returned postcode, permitted address information and environment appear for review. The employer must choose **Use this job location** to attach the checked result. Changing the input clears that confirmation; an old asynchronous response cannot select a different location.
4. The service signs the lookup result for the authenticated account and a 30-minute validity period. A payment agreement accepts a checked address only with an intact, matching, unexpired confirmation. Client-supplied address/status fields cannot manufacture a resolved location.
5. Payment-job locations are stored in D1 `job_locations`, linked to the immutable agreement. Before worker acceptance, the worker receives only the status/environment—not the postcode, building address, administrative details or confirmation token. Acceptance records a server timestamp and grants that participant access. Declining an invitation does not grant address access. Other accounts cannot access the job.
6. Completed-job receipt views retain the participant-authorized location. Local hiring engagements take a snapshot of the opening's selected location. Their public opening view hides exact details, and the local counterpart flow reveals them after acceptance. **LocalStorage is still a demonstration, not an access-control boundary**; use fictional information there.

The postcode describes a location reference. It does not prove a person's identity, occupancy, ownership, reliability, availability or travel distance. This feature does not replace LocHire's existing permission-based nearby search or Wema's bank checks.

## Backend configuration

Set these variables on the existing private backend, then deploy a saved backend version. Never place a secret postcode key in HTML, a browser script, the Vercel static bundle or GitHub.

| Variable | Value / purpose |
|---|---|
| `POSTCODE_ENABLED` | Currently `false`; set `true` after approved sandbox access is configured |
| `POSTCODE_ENVIRONMENT` | Currently `sandbox`; use `production` only with approved live access |
| `POSTCODE_API_KEY` | Secret `nipost_test_…` or `nipost_live_…` key matching the environment |
| `POSTCODE_LOOKUP_LEVEL` | Currently `2`; supported levels `1`–`3`, capped by granted provider access |
| `POSTCODE_BASE_URL` | Defaults to `https://api.postcode.gov.ng`; only official HTTPS postcode.gov.ng hosts are accepted |

NIPOST requests use `X-API-Key`. Lookup level 1 checks validity; higher permitted levels return more address information. Lack of returned address information is labelled explicitly. No coordinates are requested by this integration.

Test keys use the provider's separate sandbox dataset and do not consume credits. They do not resolve live residential codes. Official sandbox examples include `FC-01-A01-KP-27` and `FC-01-A01-LR-01`; use them only as **demo locations**, not as a visitor's real home or job site. Live keys require the provider's approval/KYB, and richer live lookups consume credits. The app limits lookup attempts per account and preserves posting when lookup is unavailable.

## API

- `GET /api/postcode/config`: public availability/environment/settings names; no secret values.
- `POST /api/postcode/lookup`: signed-in account, same-origin request, JSON `{ "code": "FC-01-A01-KP-27", "consent": true }`.
- `POST /api/jobs`: optional `postcode` and `postcodeToken` from the selected result. A postcode without a token is saved as unconfirmed with no provider address.

Missing keys, unavailable service, invalid codes, insufficient access/credits and rate limits yield a clear retry/continue state. The proxy does not expose raw provider errors or credentials. A key alone does not justify marking a manual entry as provider-confirmed.

## Activation and demo

1. Obtain the hackathon test key with `lookup` scope and the required address access. Confirm the sandbox origin with the organizers if they supply a different official endpoint.
2. Store the secret, enable the postcode adapter and redeploy the backend. Check `/api/postcode/config` for sandbox readiness.
3. Sign into a LocHire test wallet. In job posting, enter an official sandbox example, consent, check it, review the returned location and explicitly select it.
4. Show that the public listing hides the exact reference. In a wallet agreement, compare the invited worker's view with their view after acceptance.
5. Complete the existing test payment flow and open the receipt. Present postcode resolution and Wema transfer verification as separate responsibilities.

The current deployment has no supplied NIPOST key. Manual/blank entries and privacy rules work; the actual provider lookup remains disconnected. Adapter responses are covered by mocks until authorized sandbox credentials are supplied.

## Official references

- [Documentation](https://docs.postcode.gov.ng/)
- [Authentication and sandbox examples](https://docs.postcode.gov.ng/authentication)
- [Lookup access levels](https://docs.postcode.gov.ng/concepts/lookup-levels)
- [Postcode format](https://docs.postcode.gov.ng/concepts/postcode-format)
- [Web widget](https://docs.postcode.gov.ng/widget/web-embed)

The format page calls the code “12 characters”, but its documented segments total 11 alphanumeric characters, excluding separators. LocHire normalizes the five segments rather than trusting that length statement. This implementation uses direct HTTP lookup; the widget documentation currently says npm publication is pending.
