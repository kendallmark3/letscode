# Let's Go! V1

## Outcome
Build a polished, runnable first version of Let's Go!: a free way for programmers to discover teammates and form a four-person team for one Intent Driven Saturdays challenge. A person arriving alone should understand the opportunity, create a minimal profile, and either assemble a team or accept an invitation without maintaining a social network.

## Inputs
- INTENT-V1.md and PRODUCT-CONTEXT.md: Mark Kendall's approved product direction.
- data/demo.json: fictional participants and challenge. Sample content, not a prescribed data model.

## Success / Evidence
Mark can run the app and, without creating a long profile:
1. Understand the four-hour challenge and distinguish illustrative prize content from a funded event.
2. Search by skill, browse participants, and see his team's accepted skills and open seats.
3. Create a team, invite an available participant, switch demo identity, and accept or decline.
4. Confirm that unavailable people are not discoverable, private email is hidden, joining prevents another commitment, and a full team has exactly four members.
5. Pause invitations and choose whether to share contact information after joining.
6. Refresh without losing the demo's progress and reset the demo intentionally.

The experience must feel polished on phone and desktop: legible cards, clear actions, useful empty states, keyboard-accessible controls, and a carousel that does not depend on swiping alone. Demonstrate checks for the important team and invitation boundaries. Bring the running result back to Mark before expanding scope.

## Constraints / Boundaries
The Boundaries section of INTENT-V1.md is authoritative and applies in full.

---

# Intent Delta 1: organizer-managed challenges (2026-10-10)

## Observation
V1 has one fixed challenge. There is nowhere to put challenges in, date them, or make them live.

## Keep
Each person creates their own team from the challenge or accepts an invitation. All V1 team, invitation and privacy rules. The illustrative-demo labelling.

## Change
An admin screen where an organizer adds a challenge (title, description, date), edits it, makes it live, and takes it offline. Participants see only the live challenge, with its date, and form teams from it.

## New Boundary
One challenge is live at a time. A challenge needs a title, description and date before it can go live. Teams and invitations belong to the challenge they were formed in. Opting in to invitations is per challenge.

## Evidence
Mark adds a challenge with a date, makes it live, and sees it on the Challenge page; he creates a team from it. With nothing live, participants see a clear "no challenge open" state and cannot form teams. A second challenge cannot go live while one is.

---

# Intent Delta 2: organizer access (2026-10-10)

## Observation
Anyone can open the admin screen. Mark asked whether a login screen is needed.

## Keep
"View as" stays a demo identity switch, visibly distinct from sign-in. No accounts.

## Change
"View as" gains an Organizer role. Only the Organizer sees and can open the admin screen. The Organizer is not a participant: no profile, team or inbox.

## New Boundary
This is a demo role, not security. Real sign-in is not built until a server with shared data exists, and arrives as its own intent together with it.

## Evidence
As a visitor or participant there is no Admin tab and `#admin` shows an "organizers only" message. As Organizer the admin screen works. The screen says plainly that the role is simulated.

---

# Intent V2: real users (2026-10-10)

`intent/intentv1.md` (titled "Progressive Intent V2") is Mark's authoritative intent for this step and applies in full. In brief:

## Outcome
Move Let's Go! from a single-browser demonstration into a simple real-user experience: create an account, log in, view the open competition, create or join one team, complete the four-person team, join the competition. The system knows who each participant is and enforces the rules across users.

## Success / Evidence
The twelve demonstrations listed under "Success and Evidence" in `intent/intentv1.md`, shown with separate authenticated users and enforced by the authoritative application state. Existing rule coverage is kept and extended.

---

# Intent Delta 3: no leaving a team (2026-10-10)

## Observation
After V2, a member who accepts an invitation cannot leave the team. Mark was asked whether that should change.

## Keep
Acceptance commits a participant to that team for the competition. Only a draft with no other members can be abandoned.

## New Boundary
Do not add a way to leave a forming team.

---

# Intent: commitment rules (2026-10-11)

`intent/intentv2.md` ("Real Users, Persistent Teams & Competition Rules") is Mark's authoritative intent for this step and applies in full. Where it differs from earlier intents and deltas, it wins. In particular it replaces Delta 3 (members may now leave an unregistered team) and the V1 rule that a leader alone in a draft could still accept another team's invitation.

## Outcome
A real multi-user team-formation application whose competition rules are enforced by the server: invite is tentative, accept is commitment, registering the team locks it.

## Success / Evidence
The sixteen demonstrations listed under "Success Evidence" in `intent/intentv2.md`, shown by automated tests and the running application.

---

# Intent V3a: Let's Go! and Proof Before Resume (2026-10-11)

`intent/intentv3a.md` is Mark's authoritative intent for this step.

## Outcome
The product is called "Let's Go!", and the front page says what it is for: Proof Before Resume, with a custom image of a team building together in the AI age.

## Success / Evidence
Logged out, on desktop and phone and in dark appearance, the front page shows the new name, "Proof Before Resume", the team image, the event details and "Join free". No "Let's Code" remains on any screen. All existing tests pass.

---

# Intent V5: Let's Go! rules, confirmed (2026-10-11)

`intent/intentv5.md` restates the commitment rules under the current name, Let's Go!. It is the current authority for the rules and replaces `intent/intentv2.md`, which has the same content.

## Outcome
The running application satisfies every rule in `intent/intentv5.md` under the name Let's Go!.

## Success / Evidence
The sixteen demonstrations listed under "Success Evidence" in `intent/intentv5.md` pass as automated tests on the current code.

---

# Intent: sponsor page (2026-10-11)

`intent/sponsor.md` is Mark's authoritative intent for this step. Where it differs from the site, the resolutions Mark approved apply: teams of four (about six teams as a target) instead of "25 candidates"; $7,500 as starting guidance; event-day benefits described as part of the event, not as site features; inquiries saved in the app for the organizer, with no checkout and no email yet.

## Outcome
A public sponsor-facing page that answers "why should my company sponsor one of these challenges?" within a few minutes, looks worth sponsoring, stays consistent with the rest of the site, and ends in an inquiry.

## Success / Evidence
Logged out, anyone can reach the page from a Sponsors link, read what Intent Driven Saturdays is, what a sponsor funds and receives, the approximate cost, and send an inquiry that the organizer then sees on the Admin screen. Inquiries are visible to no one else. All existing tests pass.
