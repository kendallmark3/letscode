# Let's Go! — handoff

Current intent for the rules: `intent/intentv5.md` ("Real Users, Persistent Teams & Competition Rules"), which restates `intent/intentv2.md` under the current name and builds on the real-accounts step in `intent/intentv1.md`. It was run against the finished application on 2026-10-11 and needed no code changes: all sixteen of its demonstrations already pass.

The rule the whole experience is built to make obvious:

**Invite = tentative · Accept = commitment · Register team = locked**

## Name and front page (intent/intentv3a.md)
- The product is called **Let's Go!** on every screen, in the browser tab, and in the current documents. The repository, package name and data files keep the old name, and earlier intent files are left as written.
- The front page opens with **Proof Before Resume**: no résumé needed, build with a team, earn recognition. The open event follows directly below.
- The team picture is an original illustration drawn in the page itself (four figures with different skills around a shared screen, linked to an AI spark, with a "proof" badge). It uses the page's own colours, so it follows light and dark, and carries a text description for screen readers. No photo, no real person, no outside image service.
- Recognition is described, not built: there is no winners page, badge or ranking yet. The page promises no jobs or earnings.

## Run it
Requires Node 20 or newer. Nothing to install.

```
npm run demo   # fictional accounts and a sample event, for looking around
npm start      # real mode: starts empty; people register, the organizer adds events
npm test       # 56 checks
```

Both serve http://localhost:4747 (`PORT=8080 npm start` to change it).

**Demo logins** (`npm run demo` only; shown in a banner at the top of the page):
- Participants: `participant1@example.com` … `participant10@example.com`, password `letscode-demo`
- Organizer: `organizer@example.com`, password `organizer-demo`

To be several people at once, use separate browser profiles or private windows: each keeps its own login. Pages pick up other people's actions within about five seconds.

**Real mode**: set `ORGANIZER_EMAIL` and `ORGANIZER_PASSWORD` before starting. If no password is set, a random one is created for that run and printed in the terminal. Data is kept in `var/state.json` (`DATA_FILE` to move it). Delete the file to start over.

## The rules as built
- **Accounts.** Register, log in, log out, and come back from another browser or device with everything as you left it. Visitors can read the open event; everything else needs an account.
- **One event at a time.** Any number of teams can form for it. The next event starts clean for everyone.
- **Leading is a commitment.** Creating a team makes you its leader and takes you out of the pool: you cannot be invited, opt in, or join or create another team while yours exists.
- **Invitations are tentative.** Being invited changes nothing. Each person has at most one open invitation at a time.
- **Accepting is a commitment.** It takes a seat. From then on that person cannot join, create, or accept into another team in this event.
- **A leader cannot remove a member.** There is no such action, on screen or in the API. An accepted member is not a placeholder.
- **A member may leave before registration.** They return to the pool, open to invitations again; the seat reopens; the leader is not penalised.
- **A leader may abandon the team.**
  - With no one else on it: freely, no consequence.
  - With committed members: the team is dissolved, the members are released without penalty and are immediately back in the pool, and **the leader cannot take part in the rest of that event**. The team page states this before the button, and the confirmation repeats it.
- **Registration.** Only a team with four committed members can register, and only its leader can do it. Registering locks the roster: nobody can leave, the leader cannot abandon, and there are no open invitations. Changes after that are for the organizer.
- **Closing the event** (organizer) freezes participants: no new teams, no invitations sent or accepted, no opting in, no leaving or abandoning, no registrations. Everything stays readable and on record.
- **Privacy.** Email is visible to its owner, and to teammates only if its owner shares it. Sharing is switched off again when someone leaves or a team is dissolved. The organizer sees registered teams and member names, no emails.

## How the sixteen demonstrations are verified
`npm test` runs three files:

- `test/api-rules.test.mjs` runs the real server and acts as separate signed-in users for the commitment rules: a leader cannot join elsewhere · abandoning an empty team is free · no way to remove a member · a member leaves without the leader being penalised and the seat is refilled · abandoning with members releases them and disqualifies the leader · released members join another team at once · only a complete team registers · registration locks the roster · a closed event refuses everything · a new event lets everyone compete again, including the disqualified leader, with the earlier event's history kept.
- It also fires requests **at the same instant**: two people accepting the last seat (exactly one wins), and one person sending "create a team" and "accept an invitation" together four times over (exactly one succeeds). After each, the saved data is read back to confirm nobody holds two seats and no team exceeds four.
- `test/api.test.mjs` covers accounts and access: register, log out, log in again, state surviving a server restart, unauthenticated and wrong-role requests refused, acting on someone else's invitation refused, cross-site requests refused, hashed passwords, login throttling, and that each viewer receives only the emails they are entitled to.
- `test/domain.test.mjs` holds the rule tests carried from V1 plus the new ones (33). Two V1 tests were replaced because this intent deliberately changes what they checked: a leader alone in a team could previously accept another team's invitation, and a team with members could not be abandoned at all.

The flows were also driven in a headless browser with separate signed-in users at desktop and phone widths (22 checks for the new rules, plus the earlier 30-check account walkthrough as a regression; no console errors). Those scripts were one-offs and are not in the repository.

## How "the database prevents it" is met
The data store is a single JSON file written by one server process. Three things make invalid membership impossible rather than merely unlikely:

1. Node handles one request at a time, and every action is one uninterrupted step from reading the state to saving it. Two simultaneous requests are therefore applied one after the other, and the second sees the first's result.
2. Each rule is re-checked on the server on every request; the screens only hide what would be refused anyway.
3. Before anything is written, the store itself verifies the whole state and refuses to save if anyone holds two seats in an event, a team has more than four members, or two events are live.

I kept this instead of adding a database server because the intent asks for the simplest reliable implementation, and this needs no installation. Its limit is that it must stay one process on one machine. That is the point at which a real database would be worth its cost.

## What you should know before real people use it
- **The organizer is notified in the app, not by email.** A "New registrations" panel and a badge on the Admin tab appear when a team registers, and a line is written to the server log. Email is deferred by your decision.
- **Email addresses are not verified, and there is no password reset.** Both need a mail service.
- **Exceptional roster changes after registration have no tool yet.** The intent says they need the organizer and are outside the normal participant workflow; there is no organizer screen for it, so today it would mean editing the data file.
- **It needs HTTPS in front of it when deployed.** Set `SECURE_COOKIES=1` and `HOST=0.0.0.0` behind a TLS-terminating proxy. As shipped it listens on this machine only. The data file must be on a disk that survives redeploys.
- **Logins last seven days and are held in memory**, so restarting the server signs everyone out. Data is not affected.
- **There is one organizer login**, set by environment variables.

## Decisions I made where the intent left room
- **"Closed" and "offline" are two organizer steps.** Closing an event freezes it but keeps it on show. Taking it offline makes room to make the next event live. I kept them separate so a closed event can stay visible until you are ready to open the next one.
- **Closing also freezes leaving and abandoning**, since the intent says it freezes normal participant changes. Declining or withdrawing an invitation, pausing, and sharing an email still work.
- **A released or departed member is automatically open to invitations again**, which is how I read "returns to the available participant pool". They can pause if they prefer.
- **A leader cannot leave their own team**, only abandon it, so leadership never passes to someone who did not ask for it.
- **A member who left can be invited back** by the same team. Only a declined invitation cannot be repeated.
- **Starting a team closes any invitation you had open**, because you are no longer available.
- **The penalty is recorded per event** and disappears when the next event goes live.
- **Wording.** The button is "Register team" and the status reads Forming, Team complete, Registered · locked. The organizer's control is "Close event" / "Reopen event". Screens say "event" throughout.
- **A dissolved team is kept on record** but hidden from participants and not counted for the organizer.
- Carried over: any member can invite, only the sender can withdraw an invitation, and only signed-in participants can browse people.

## Earlier decisions this intent replaces
- "Members cannot leave a team" (your answer on 2026-10-10): they now can, until the team registers.
- A leader alone in a team could accept another team's invitation in one step. They must now abandon their empty team first.
