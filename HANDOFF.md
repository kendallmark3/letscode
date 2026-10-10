# Let's Code V1 — handoff

## Run it
Requires Node 18 or newer. Nothing to install.

```
npm start     # http://localhost:4747  (PORT=8080 npm start to change the port)
npm test      # 15 rule checks
```

## What works
- **Challenge**: the four-hour, four-person challenge, with the $5,000 figure marked as a sample that is not funded.
- **Profile**: display name, private email, one to five skill tags, optional picture (initials otherwise). A new profile is unavailable until its owner opts in.
- **People**: search by skill or tap a skill filter; a carousel with Previous/Next buttons, keyboard scrolling and touch. Only name, picture, skills and availability are shown.
- **My team**: four seats, the team's combined skills, invitations sent with withdraw, and a choice to share your own email with teammates.
- **Inbox**: at most one invitation at a time, showing the challenge, team, members, skills and remaining seats; accept, decline, or pause.
- **Demo controls** (top bar): "View as" switches between participants so you can play both sides, "Skip 48 hours" advances the demo clock so invitations expire, "Reset demo" starts over. Progress survives a refresh.

## A five-minute walkthrough
1. Join free, create a profile, then create a team.
2. People: search "python", invite Priya. Invite Jordan too.
3. View as Priya Shah → Inbox → accept. View as Jordan Lee → decline.
4. View as yourself → My team: Priya's seat is filled, Jordan shows Declined and cannot be re-invited.
5. Invite two more people and accept as each: the team completes at four and other invitations close.
6. Try: View as Riley Jones (unavailable, so never in People); pause invitations with one pending; Skip 48 hours with one pending; create a team as Casey, then accept another team's invitation (it asks you to abandon the draft).

## How the boundaries are verified
`npm test` runs `test/domain.test.mjs` against the rules in `src/domain.js`:
unavailable people cannot be found or invited · discovery, invitations and non-member team views contain no email · email reaches teammates only when its owner shares it · one active incoming invitation per person, explained without naming the other team · accepting commits to one team and removes the person from discovery · a team stops at exactly four and closes its remaining invitations · a decline cannot be resent · only the sender can withdraw · invitations expire after 48 hours · pausing closes the pending invitation · a creator must explicitly abandon an empty draft to join elsewhere, and a draft with members cannot be abandoned.

The same flow was also driven end to end in a headless browser at desktop and phone widths (35 checks, no console errors). That script was a one-off and is not in the repository.

## What is simulated
- **No accounts or sign-in.** "View as" is a demo switch. Anyone using this browser can act as anyone.
- **No server-side data.** Everything, including any email you type, is stored in this browser's local storage. It is not private storage and is not shared between devices or people. Do not open this to public registration.
- **No messages.** An "invitation" is a record that appears in the other participant's inbox in the same browser. Nothing is emailed.
- **Time.** Invitations last 48 hours on the demo clock; they expire in real time or when you press "Skip 48 hours".
- **The event.** Participants, challenge, date and prize are fictional. There is no sponsor, judging, payment, or code submission.

## Decisions I made where the intent left room
- A creator alone in a draft team is not yet committed: they can still open themselves to invitations, and accepting one requires abandoning the draft. Once a team has two members, everyone on it is committed and leaves discovery.
- Any team member can invite; only the person who sent an invitation can withdraw it.
- A team may have more invitations out than open seats; the first acceptances win and the rest close.
- Withdrawn, expired, or closed invitations may be sent again. Declined ones may not.
- Leaving a team after joining, editing a profile, and renaming a team are not in V1.

## Before real use
A later intent must establish authentication, shared persistence, access controls, and reliable multi-user invitation handling, as the README says.
