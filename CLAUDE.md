# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Let's Go! (named Let's Code until `intent/intentv3a.md`; the repository, package and data keep the old name): programmers register, form a four-person team for the one live event through invitations that must be accepted, and register the completed team. An organizer manages events and closes them. The governing idea is **invite = tentative, accept = commitment, register = locked**.

Intent history, oldest first: INTENT-V1.md (single-browser demo; its **Boundaries** still govern team, invitation and privacy rules), the two deltas in `intent/current-feature.md` (organizer-managed challenges), `intent/intentv1.md` (real accounts and shared state), `intent/intentv2.md` (commitment rules), `intent/intentv3a.md` (the name Let's Go! and the Proof Before Resume front page), and `intent/intentv5.md` (the commitment rules restated under the current name; the current authority for rules, and it wins where it differs from earlier ones). The product name in the older files was updated to Let's Go! on 2026-10-11 at Mark's request; their content is otherwise as written. PRODUCT-CONTEXT.md is positioning and later-scope context, not requirements. HANDOFF.md records what works, the known gaps, and the choices made where an intent left room.

## Commands

Node 20+; no dependencies, no build step, no linter.

```
npm run demo                                # seeded fictional accounts, data in var/demo-state.json
npm start                                   # real mode, empty data in var/state.json
npm test                                    # all tests (node --test)
node --test test/domain.test.mjs            # one file
node --test --test-name-pattern="enroll"    # tests whose name matches
```

Serves http://localhost:4747. The default port is 4747 because 5173 is commonly taken by another dev server on this machine. Environment: `PORT`, `HOST` (default 127.0.0.1), `DATA_FILE`, `ORGANIZER_EMAIL`, `ORGANIZER_PASSWORD` (random per run if unset, printed at start), `SECURE_COOKIES=1`, `DEMO=1`. Demo logins are printed at start and shown in the page banner. Delete the data file to reset; `var/` is git-ignored.

## Architecture

The server owns the state and the rules; the browser only displays and asks.

- `src/domain.js` holds every rule. It is pure: each action takes `(state, ...args, now)` and returns a **new** state, or throws `DomainError(code, message)` where `message` is safe to show the user. It never reads the clock or knows about HTTP. Actions call `begin()`, which clones the state and expires overdue invitations first.
- `src/server-app.js` is `createApp(options)`: static files from `public/`, accounts, sessions, and the JSON API. It holds the one in-memory `state`, and `commit()` writes it to the data file (temp file then rename). Because Node handles one request at a time and every action is a single synchronous check-and-write, two users cannot both win a race for a seat or an invitation slot. Do not introduce an `await` between reading `state` and `commit()`.
- `src/auth.js`: scrypt password hashing, in-memory sessions keyed by a hash of the cookie token, and a failed-login limiter.
- `server.mjs` is only the entry point that reads the environment.
- `public/app.js` is the interface. It imports nothing from `src/`, keeps no authoritative data, re-renders `#app` from template strings, and routes by URL hash. It polls `GET /api/view` every five seconds to pick up other users' actions, skipping while a form is in use.

API: `GET /api/view`, `POST /api/register`, `/api/login`, `/api/logout`, and `POST /api/action` with `{ type, ...args }`. The two action tables at the top of `server-app.js` (`PARTICIPANT_ACTIONS`, `ORGANIZER_ACTIONS`) are the complete list of what each role can do; adding a capability means adding a domain function and one entry there. Every response carries the caller's fresh view.

Things that span files and are easy to break:

- **The actor always comes from the session.** Participant actions receive the session's own participant id; nothing in the request body can name who is acting. Keep it that way when adding actions.
- **Privacy is enforced by `viewFor(state, viewer)`**, the only thing the server sends about state. It is assembled from `publicProfile`, `discover`, `teamView` and `invitationView`. A visitor gets the competition only; a participant gets their own email, plus a teammate's email only when that teammate set `shareEmailWithTeam`; the organizer gets competitions and enrolled teams by name, with no emails. Never send raw `state`, `state.participants` or `state.accounts`. `test/domain.test.mjs` and `test/api.test.mjs` both assert which emails appear in each view.
- **Everything is scoped to the one live challenge.** `state.challenges[]` holds drafts and at most one `status: 'live'`. Teams and invitations carry `challengeId`, and a participant's opt-in is `openFor: <challengeId>`. The scoping lives in `teamOf`, `pendingIncoming` and `isOpen`, which read `liveChallenge(state)`; the other rules build on those, so do not query `state.teams` or `state.invitations` around them. This is what lets the same people take part in the next competition.
- **Vocabulary.** The screens say "event", "register" and "close event"; the code still says `challenge`, `enroll`/`enrolledAt` and `enrollmentOpen` for the same things. Renaming them would touch the saved data shape, so they were left.
- **Closing an event.** `challenge.enrollmentOpen` gates `createTeam`, `invite`, `accept`, `setOpen(true)`, `enrollTeam`, `leaveTeam` and `abandonTeam`. Viewing is never gated. Closed is different from offline (`status: 'draft'`), which is what makes room for the next event.
- **Commitment is derived, not stored.** `isCommitted` is simply "is on a team", leader or member; `teamOf` is the one lookup and it skips dissolved teams (`dissolvedAt`). Team status is derived too: `teamStatus()` gives ENROLLED if `enrolledAt` is set, READY at four members, otherwise FORMING.
- **A roster shrinks only two ways, both through `changeableTeam()`**: `leaveTeam` (a member, no penalty) and `abandonTeam` (the leader; free when alone, otherwise the team is dissolved, members return to the pool and the leader is added to `challenge.disqualified`). Both are refused once the team is registered or the event is closed. There is deliberately no action that lets a leader remove a member; do not add one. `isIneligible` reads the per-event disqualification, and `publicChallenge` must never include that list.
- **The store refuses invalid states.** `commit()` calls `checkIntegrity()` before writing: nobody in two seats per event, no team over four, one live event at most. It is the last line of defence, not a substitute for the checks inside each action.
- **`inviteBlock` is the single source for "why can't I invite this person"**, used both to refuse `invite` and to label cards. Its messages must not reveal another team's identity.
- **Organizer notification** is a record in `state.notifications`, shown on the admin screen until marked seen, plus a server log line. There is no email; do not add a mail dependency without asking, since it affects cost and deployment.
- **Focus survives re-render** in `public/app.js` through `data-fk` keys: `render()` refocuses the element with the same key, or the view's `h1`. Give new interactive controls a stable `data-fk`. The skill search updates only `#results` so typing keeps focus.
- **Saved data is versioned** (`version: 3`). `createApp` refuses a data file of another version; if the state shape changes, bump it and write a migration rather than breaking existing files.

## Tests

- `test/domain.test.mjs`: rules against `domain.js`, using `data/demo.json` and a fixed `T0` timestamp.
- `test/api.test.mjs` (accounts, access control, privacy) and `test/api-rules.test.mjs` (commitment rules and simultaneous requests): each starts the real server on a random port with a temporary data file, via `test/support.mjs`, and acts as separate signed-in users with their own cookies. Within a file the tests run in order and build on each other (one long story), so add new ones at the point where the needed state exists.

A rule change belongs in `domain.js` with a domain test; anything about who may do or see something also needs an API test. The UI has no automated tests in the repository.

## Working method

This project follows Progressive Intent (the `intent-drive-starter` plugin): state the outcome, run the result, inspect it, add only the next necessary correction. `intent/current-feature.md` must state an Outcome and Success / Evidence before code changes. Mark's feedback on the running app becomes a small dated delta appended there, built on its own feature branch and brought back for inspection before the next. Do not generate a backlog of speculative intent files or add the later-scope features from PRODUCT-CONTEXT.md unprompted. Bring a choice back to Mark when it materially affects cost, deployment or product behaviour.
