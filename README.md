# LocHire

An interactive hackathon prototype for local hiring. Plain HTML, CSS and JavaScript, with no build step. Serve the directory with any static server or deploy it to Vercel (Framework: Other).

## Demo journey
1. Choose an opening or post one with skills, location and salary.
2. Inspect a candidate's explained match and self-reported work sample.
3. Create an interview invitation, confirm its time and export a calendar event.
4. Switch to the candidate view, edit the profile and share it in the demo shortlist.
5. Explore fictional companies and copy or download an outreach draft.

## Limits
All initial companies, vacancies and candidates are fictional. State is saved only in localStorage on the visitor's device. This is not multi-user authentication, live company outreach, a verified employment service or automated messaging. No third party receives entered data. The Google Fonts stylesheet requests fonts externally; system fonts work when it is unavailable.

Matching uses skills (60%), compatible city or remote role (25%), and salary ceiling (15%). It does not use age, gender, photographs or protected demographic attributes. Work samples are self-reported. Employers make the invitation decision; the score is not a guarantee of suitability.

A production pilot requires employer and candidate accounts, consent-based outreach, vacancy verification, a shared database, protected contact data, messaging delivery, server validation, and assessment verification.

## Local run
`python3 -m http.server 8080`

Open http://localhost:8080. Reset demo restores the initial sample data after confirmation.
