# LocHire: first 20 workers and 5 hirers

Start with one area you can reach personally, such as a neighbourhood in Ilesa. Keep the first jobs close enough for workers to attend. Expand after people have completed real work and left reviews.

## Targets for the first week

| Target | Count | What counts |
| --- | ---: | --- |
| Published workers | 20 | Real people who signed up themselves, verified their email and published complete profiles |
| Hirers with genuine needs | 5 | Households or businesses with real tasks, dates and budgets |
| Published jobs | 5 | One useful opening per hirer; never invented listings |
| Completed engagements | 3 | Both participants confirm the agreed work and completion |
| Reviews | 3 | Reviews from actual completed engagements |

Focus initially on three categories: cleaning, plumbing and electrical work. Recruit roughly 8 cleaners, 6 plumbers and 6 electricians. Change this mix if genuine local demand points elsewhere.

## Worker invitation

Link: https://lochire.ng/#join-worker

> Hi, I’m Chidera, the person building LocHire. It helps local workers show their skills and connect with people who need their services. Create your account, verify your email, and add your skills, area, availability and expected pay here: https://lochire.ng/#join-worker. Signing up does not guarantee a job. You can message me if you need help completing your profile.

Send personally to workers you know or through a local artisan/group administrator who agrees to share it. Use LocHire’s “Invite a worker” share button. Don’t add people’s profiles or personal details without their permission.

## Hirer invitation

Link: https://lochire.ng/#join-hirer

> Hi, I’m Chidera, the person building LocHire. If you have a real cleaning, plumbing or electrical task, you can post the work, area, date and budget, then discuss it with a local worker: https://lochire.ng/#join-hirer. You and the worker agree the work and payment together. I’d appreciate your feedback on the process.

Begin with trusted households, shop owners, property managers and small businesses with a current need. Use “Invite a hirer” in the empty jobs list. Ask each person to publish a genuine task, not a promotional placeholder.

## Three-day starting routine

1. **Day 1:** Contact people you know, collect their agreement to join and help the first 6 workers publish complete profiles. Obtain 2 genuine job posts.
2. **Day 2:** Reach the remaining workers through introductions and approved local groups. Help all 5 hirers write a clear scope, budget, date and general area.
3. **Day 3:** Help participants use invitations, messages and work confirmations. Follow up on problems and collect feedback. Only mark work complete after it actually happened.

Use the owner dashboard to track registrations and published profiles. A registration alone is not an onboarded worker. Keep private contact and job details inside signed-in conversations.

## Before accepting online payments

The current live backend has Paystack disabled and no Paystack secret key. The payment integration and signed-webhook verification exist. The owner must finish business activation and confirm that the provider permits LocHire’s worker settlement and premium-credit model. Configure the live key securely in backend settings, set the webhook to the app’s `/api/webhooks/paystack` endpoint, then validate a small, explicitly approved payment and its actual bank settlement before enabling it for users.

Workers’ earnings currently settle directly to their connected bank through Paystack; there is no spendable worker wallet or manual withdrawal button. Hirer premium credits are separate from worker earnings. Cash and direct transfers can be recorded and acknowledged while online payment activation is pending; those acknowledgements are not bank verification.

## Trust and support

Profiles are self-reported. Don’t advertise people as identity-, phone- or reference-verified until those checks have genuinely been completed. Review each initial worker’s profile, discuss experience and ask about suitable references with their consent. Use reports and the admin moderation queue for concerns. Reviews become available after both participants confirm completed work.

## Email alerts

New invitations, messages, work-status changes, reviews, payment notices and support updates queue transactional email alerts. Only verified account emails with work alerts enabled receive them. Emails contain a sign-in link and no private message body, job title, amount or location. Settings → Work email alerts controls the preference; account verification and password recovery are unaffected.

Saved emails are attempted after successful hiring/payment events and during authenticated inbox refreshes, with bounded retries and stable provider idempotency keys. Historical notifications are not mailed. There is no independent scheduled retry worker; queued failures wait for later activity. Uncertain sends beyond 23 hours, or exhausted attempts, remain marked for owner review in `live_notification_emails`; don’t blindly resend them with a new key.

No invitations have been sent to third parties by the assistant, and these targets are not claimed as acquired users.
