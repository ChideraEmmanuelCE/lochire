# LocHire

Local hiring for artisans, domestic workers and everyday workers. Built in the existing plain HTML, CSS and JavaScript framework. Production demo: https://lochire.vercel.app/

## What works

- Short homepage with separate Find work and Hire someone journeys; visible role switching for a person using both roles.
- Guided worker and employer profiles for individuals, households and businesses. Category-specific driving and live-in/live-out fields, availability, coverage, flexible pricing and optional work examples. Public profile views omit private email and phone fields.
- Separate guided ongoing-job and one-off-task posting flows, review before saving, optional local task photos, edit, close and reopen.
- Search and occupation, location, availability, engagement type, experience and rate filters. Suitability explanations compare listed skills, coverage, payment basis, availability and experience; unknowns are explicit. No reliability score or demographic ranking.
- Employer profiles can be inspected before responding. Ongoing-job interview invitations and task/quote discussions support acceptance, decline, questions and proposed conversation times in WAT.
- Dedicated engagement records with scope, pay, schedule, dates, general location and accommodation/materials arrangements. Each proposal creates a new version, keeps previous versions and resets both confirmations. Completion requires both parties. Only completed-engagement participants can submit one review each.
- Local blocking, private report-draft download, privacy, community guidelines and help pages. Native modal dialogs, keyboard focus outlines, reduced-motion support and responsive cards/forms/navigation.

## Honest demo boundaries

The Vercel project had no environment variables, authentication, shared backend or delivery service when inspected. Everything is therefore labelled as a **local demo**. Fictional sample profiles and openings are distinct from the visitor's locally created data. There are no seeded reviews or completed verification badges.

Data is stored under `lochire-local-demo-v3` in browser localStorage. Older prototype entries are not imported. Reset clears current and old demo entries. Use fictional contact information: anyone with access to the same browser can inspect its storage, and there is no authenticated security boundary. Contact fields are omitted from public UI views, but this is not production access control. No private home-address field is collected. Optional photos remain on the device and should not contain private documents.

“Preview other party in demo” explicitly simulates the counterpart on the same device; it does not switch authenticated accounts. Messages, invitations, confirmations, reviews and openings are not shared across devices. No email is sent. Conversation times are proposed, not calendar bookings.

Phone, identity, references and business checks all remain **Not checked**. Reporting only downloads a private draft marked **NOT SUBMITTED**; no administrator receives or reviews it. The support action opens the visitor's email client with the project owner's existing contact; delivery or response is not guaranteed. There are no payments, escrow, insurance or legal guarantees.

Business outreach drafts and technology-job samples from the original prototype have been removed from the main experience.

## Development and validation

Node 22.12+ (or current supported Node), Python 3 for optional local serving:

```sh
npm install
npm run build
npm test
python3 -m http.server 8080
```

The site remains static. `build` checks browser JavaScript syntax and copies only public app assets plus a responsive test fixture into `dist` for Vercel. Development dependencies and configuration files are excluded. jsdom is a development-only dependency. Tests cover profile creation and cancellation, both posting flows, editing, opening status, filtering, public contact visibility, invitations, both confirmations, completion/reviews, task quotes, closed-state rules, version changes and nonparticipant access denial. Browser checks separately cover native dialogs, keyboard interaction and responsive layout.

## Required before a real Lagos pilot

1. Authentication with secure sessions and account recovery; one account can own worker and employer profiles.
2. Persistent shared database and server-side validation/authorization for ownership, conversations, current-version confirmations, completion and review eligibility. Never rely on browser storage or client IDs for privacy.
3. Consent-based private contact sharing, data retention/deletion controls, secure photo uploads and backups. Keep sensitive fields separate from public profile records.
4. Server-delivered in-app notifications and a configured email provider with delivery logging, preferences and secrets stored only in server environment variables.
5. Explicit phone confirmation and optional identity/reference/business-check providers, evidence, consent and audit trails. Present specific completed checks without promising conduct.
6. A private administrator report inbox/queue, access-controlled review actions, moderation policy and an operational support process; test blocking across authenticated accounts.
7. A small Lagos pilot to validate categories, local coverage, pay expectations and usability on low-bandwidth phones. Review product policies and applicable requirements with suitable local advisers before collecting real personal information.

No production credentials or secret keys belong in frontend code or this repository.


## Ratings, nearby discovery and booking update

- Worker cards and profiles show the average 1–5 star rating and count of eligible completed-engagement reviews. Unrated workers stay unrated. Client names, work descriptions and completed-work history are linked to the engagement record; sample reviews are never invented.
- Employers can filter by rating, sort by highest rating or nearest distance, and request a one-off booking directly from a profile/card. This creates a pending local request and an opening; the existing acceptance, work-detail confirmation and completion rules still apply.
- Nearby discovery requests browser GPS only after an explicit action. Radii include 30 m, 100 m, 500 m, 1 km, 5 km and 30 km. Distances display combined accuracy uncertainty. Profiles lacking a recent location are excluded from radius searches. No coordinates are invented for fictional workers.
- Search position stays in memory, can be cleared and expires after 30 minutes. Optional movement updates stop when leaving discovery or hiding/leaving the page. Worker location snapshots are explicitly shared into local browser storage, removable and expire after 24 hours. Public profile projections exclude coordinates. These distances are approximate snapshots, not background worker tracking or guaranteed live positioning.
- Worker email sharing is opt-in. Enquiry drafts can be downloaded or opened in the user's mail app; the application never sends mail or invents sample addresses.
- Fixed bottom actions sit lower above a compact, quieter footer. Existing top navigation stays fixed.

These additions preserve the local-demo boundary. Public reviews across devices, genuine worker availability, delivered booking notifications and automatic emails require authenticated accounts, a shared backend and an email provider.
