# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Let's Code V1: a local, single-browser demonstration of forming a four-person team for one challenge. It is deliberately a demo, not a multi-user product: no accounts, no backend data, no messages sent. INTENT-V1.md is the approved outcome and its **Boundaries** section is authoritative; PRODUCT-CONTEXT.md is positioning and later-scope context, not V1 requirements. HANDOFF.md records what works, what is simulated, and the rule choices made where the intent left room.

## Commands

Node 18+; there are no dependencies, no build step, and no linter.

```
npm start                                   # serve at http://localhost:4747 (PORT=8080 npm start to change)
npm test                                    # all rule tests (node --test)
node --test --test-name-pattern="expire"    # run tests whose name matches
```

The default port is 4747 because 5173 is commonly taken by another dev server on this machine.

## Architecture

Three layers, all plain ES modules with no framework:

- `src/domain.js` holds every team, invitation and privacy rule. It is pure and runs unchanged in Node and the browser. Each action takes `(state, ...args, now)` and returns a **new** state, or throws `DomainError(code, message)` where `message` is safe to show the user. Time is always passed in as `now`; the module never reads the clock. Actions call `begin()`, which clones the state and expires overdue invitations first.
- `src/app.js` is the UI. It keeps one `state` object in `localStorage` (`lets-code-demo-v1`), re-renders the whole `#app` from template strings on every change, and routes by URL hash (`#challenge`, `#people`, `#team`, `#inbox`, `#admin`). All mutations go through `act()`, which runs a domain action, saves, shows a toast (the domain error message on refusal) and re-renders. Clicks are delegated through `data-action` attributes to the `actions` map.
- `server.mjs` is a static file server that exposes only `src/` (at `/`) and `data/`. `data/demo.json` seeds the initial state via `createInitialState`; it is sample content, and the state shape differs from it (e.g. its single `challenge` becomes the first, live entry of `challenges`).

Things that span files and are easy to break:

- **Privacy is enforced by view functions, not the UI.** `discover`, `teamView` and `invitationView` build what a given viewer may see from `publicProfile`; an email is added only in `teamView`, only for a viewer on that team, and only when the owner set `shareEmailWithTeam`. Render other people from these views, never from `state.participants` directly. The only raw-profile read in the UI is the current user's own.
- **Everything is scoped to the one live challenge.** `state.challenges[]` holds drafts and at most one `status: 'live'`. Teams and invitations carry `challengeId`, and a participant's opt-in is `openFor: <challengeId>`. The scoping lives in three lookups, `teamOf`, `pendingIncoming` and `isOpen`, which read `liveChallenge(state)`; the other rules build on those, so do not query `state.teams` or `state.invitations` around them. With nothing live, those lookups return nothing and `createTeam`/`setOpen` refuse.
- **Saved state is versioned.** `migrate()` upgrades a browser's stored state (currently version 2); when the state shape changes, bump the version and extend it rather than discarding progress.
- **Commitment is derived, not stored.** A person is committed when their team has two or more members (`isCommitted`); a creator alone in a draft is not, and may still accept another invitation by explicitly abandoning the draft. Discoverability is `isOpen && !isCommitted`.
- **`inviteBlock` is the single source for "why can't I invite this person"**, used both to refuse the action in `invite` and to label cards in the People view. Its messages must not reveal another team's identity.
- **The demo clock**: `app.js` computes `now()` as real time plus `state.clockOffsetMs`; "Skip 48 hours" advances the offset so expiry can be demonstrated. `render()` calls `sweep()` so expired invitations are reflected on any redraw.
- **Focus survives re-render** through `data-fk` keys: `render()` refocuses the element with the same key, or the view's `h1`. Give new interactive controls a stable `data-fk`. The skill search updates only `#results` (`renderResults`) so typing does not lose focus.
- "View as" (`state.currentUserId`) is a demo identity switch and must stay visibly distinct from authentication.

## Tests

`test/domain.test.mjs` exercises the boundaries from INTENT-V1.md against `domain.js` using `data/demo.json` and a fixed `T0` timestamp. When a rule changes, change it in `domain.js` and cover it there; the UI has no automated tests in the repository.

## Working method

This project follows Progressive Intent (the `intent-drive-starter` plugin): state the outcome, run the result, inspect it, add only the next necessary correction. `intent/current-feature.md` is the active intent and must state an Outcome and Success / Evidence before code changes. Mark's feedback on the running app goes into a small dated correction (FEEDBACK-NEXT.md is the template); keep V1 as the baseline and do not generate a backlog of speculative intent files or add the later-scope commercial features from PRODUCT-CONTEXT.md unprompted.
