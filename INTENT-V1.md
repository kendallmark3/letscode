# Let’s Code — Progressive Intent V1

## Outcome
Build a polished, runnable first version of Let’s Code: a free way for programmers to discover teammates and form a four-person team for one Intent Driven Saturdays challenge. A person arriving alone should understand the opportunity, create a minimal profile, and either assemble a team or accept an invitation without maintaining a social network.

## Authoritative inputs
- This intent and PRODUCT-CONTEXT.md contain Mark Kendall’s approved product direction.
- README.md explains how to use this package and the separate skill pack.
- data/demo.json supplies fictional participants and a fictional challenge for immediate exploration. It is sample content, not a prescribed data model.

## Required outputs
- A working app that can be run locally, with clear setup instructions.
- An inviting challenge entrance, minimal profile flow, searchable participant carousel, four-seat team view, and quiet invitation inbox.
- A clearly labeled demo that lets Mark experience both sides of an invitation using fictional participants. Show real state changes; do not make buttons merely display success messages.
- A short handoff describing what works, how to run it, and what remains simulated.

## Boundaries
- Entry is free. Profile essentials are email, display name, picture, and a few skill tags. No résumé, contact import, calendar connection, payment, or long questionnaire. Allow a default avatar so a missing photo does not block participation.
- Email is private. Discovery reveals only display name, picture/avatar, skills, and availability for this event.
- A participant can create a team or be invited. Discovery shows participants who have opted into this event and are open to invitations. Unavailable is the default; joining is an explicit choice.
- A team has four seats including its creator. Team members may invite people into open seats. Invitations show the challenge, inviting team, current members, skills, and remaining seats before acceptance.
- To keep participation quiet, each recipient has at most one active incoming invitation for the event. Invitations expire, may be declined, and may be withdrawn by the sender. Explain an unavailable invitation slot without exposing another team’s private information.
- Acceptance commits a participant to one team for this event, fills one seat, closes conflicting outgoing invitations from a former draft team, and removes that person from discovery. Never allow two teams or a fifth member. Joining another team as a creator requires explicitly abandoning the old draft; only an otherwise empty draft can be abandoned this way.
- Declining does not disclose a reason. A declined invitation cannot be resent by that team during the same event. A full team closes its remaining pending invitations. A participant may pause incoming invitations; pending invitations then close.
- No built-in chat or feed. After joining, each member may explicitly share their own email with teammates. Do not expose it automatically.
- V1 sends no real email or messages. Its inbox and expiration behavior must be demonstrable in the app. Use fictional profiles; clearly separate demo identity switching from authentication. Do not treat browser-only storage as safe for live private data or open public registration.
- No real prize, sponsor, judging, payments, repository collection, or code transfer in V1. Label the sample $5,000 challenge as illustrative.
- Mark owns outcomes and feedback. The coding agent chooses framework, design, implementation, and verification within these boundaries. Reuse an existing project’s conventions when applicable.

## Success and evidence
Mark can run the app and, without creating a long profile:
1. Understand the four-hour challenge and distinguish illustrative prize content from a funded event.
2. Search by skill, browse participants, and see his team’s accepted skills and open seats.
3. Create a team, invite an available participant, switch demo identity, and accept or decline.
4. Confirm that unavailable people are not discoverable, private email is hidden, joining prevents another commitment, and a full team has exactly four members.
5. Pause invitations and choose whether to share contact information after joining.
6. Refresh without losing the demo’s progress and reset the demo intentionally.

The experience must feel polished on phone and desktop: legible cards, clear actions, useful empty states, keyboard-accessible controls, and a carousel that does not depend on swiping alone. Demonstrate checks for the important team and invitation boundaries. Bring the running result back to Mark before expanding scope.
