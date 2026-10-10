# Let's Code V1

## Outcome
Build a polished, runnable first version of Let's Code: a free way for programmers to discover teammates and form a four-person team for one Intent Driven Saturdays challenge. A person arriving alone should understand the opportunity, create a minimal profile, and either assemble a team or accept an invitation without maintaining a social network.

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
