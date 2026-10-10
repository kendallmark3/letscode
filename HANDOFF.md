# Let's Code V2 — handoff

V2 moves Let's Code from a single-browser demonstration to real accounts and shared state. The intent is `intent/intentv1.md` (titled "Progressive Intent V2").

## Run it
Requires Node 20 or newer. Nothing to install.

```
npm run demo   # fictional accounts and a sample competition, for looking around
npm start      # real mode: starts empty; people register, the organizer adds competitions
npm test       # 40 checks
```

Both serve http://localhost:4747 (`PORT=8080 npm start` to change it).

**Demo logins** (`npm run demo` only; shown in a banner at the top of the page):
- Participants: `participant1@example.com` … `participant10@example.com`, password `letscode-demo`
- Organizer: `organizer@example.com`, password `organizer-demo`

To be several people at once, use separate browser profiles or private windows: each keeps its own login. Pages pick up other people's actions within about five seconds.

**Real mode**: set `ORGANIZER_EMAIL` and `ORGANIZER_PASSWORD` before starting. If no password is set, a random one is created for that run and printed in the terminal. Data is kept in `var/state.json` (`DATA_FILE` to move it). Delete the file to start over.

## What works
- **Accounts**: create an account (name, email, password, skills, optional picture), log in, log out. Visitors can read the open competition without an account; everything else requires one.
- **One team per competition**: a participant cannot be on two teams, create a team while committed to another, or accept a second invitation. This is scoped to the competition, so the next one starts clean for everyone.
- **Invitation and consent**: unchanged from V1. Being invited does not make someone a member; they must accept. Once committed they leave discovery.
- **Team status**: Forming (fewer than four), Ready (four accepted members), Enrolled (joined the competition).
- **Join Competition**: when a team is Ready, the person who started it gets the button. Teammates see who they are waiting for. Enrolling confirms on screen and tells the organizer.
- **Enrollment window**: the organizer opens and closes enrollment for the live competition. Closed means no new teams, no new members, no new enrollments; everything can still be viewed.
- **Organizer**: adds, dates, publishes and unpublishes competitions (one live at a time), opens and closes enrollment, and sees enrolled teams with their members' names.

## How the twelve demonstrations are verified
`test/api.test.mjs` runs the real server and drives it over HTTP as separate signed-in users, one test per demonstration in the intent: visitor view · register, log in, opt in · create a team · invite and accept across users · four members make Ready · no second team in the same competition · Ready becomes Enrolled · organizer sees it and is notified · closing enrollment blocks formation and enrollment · the next competition starts clean · private information stays private between users · rules are enforced by the server.

That last group checks what a browser cannot be trusted with: unauthenticated actions are refused, a user cannot act on someone else's invitation even by naming them in the request, a participant cannot call organizer actions, cross-site requests are refused, passwords are stored hashed, repeated wrong passwords are slowed, and only the public folder is served.

`test/domain.test.mjs` keeps the V1 rule coverage and adds enrollment, team status and per-viewer privacy (26 tests).

The same flow was also driven in a headless browser with eight separate signed-in users at desktop and phone widths (30 checks, no console errors). That script was a one-off and is not in the repository.

## What you should know before real people use it
- **The organizer is notified in the app, not by email.** A "New enrollments" panel and a badge on the Admin tab appear when a team enrolls, and a line is written to the server log. No email is sent: there is no mail service, and choosing one affects cost and deployment, so that is yours to decide.
- **Email addresses are not verified.** Anyone can register with any address. There is no password reset; a forgotten password currently means a new account. Both need the same mail service.
- **It runs as one process with a JSON file.** That is what makes the rules reliable (requests are handled one at a time), and it is fine for one event's worth of people on one machine. It is not built to run as several copies behind a load balancer.
- **It needs HTTPS in front of it when deployed.** Set `SECURE_COOKIES=1` and `HOST=0.0.0.0` behind a TLS-terminating proxy. As shipped it listens on this machine only.
- **Logins last seven days and are held in memory**, so restarting the server signs everyone out. Data is not affected.
- **There is one organizer login**, set by environment variables, not an organizer account that can be created in the app.
- **The V1 browser-only demo is gone**, along with "View as", "Skip 48 hours" and "Reset demo". Invitations still expire after 48 hours, in real time. Anything the old demo left in a browser's storage is deleted on first load.

## Decisions I made where the intent left room
- **Who presses Join Competition**: the person who started the team.
- **Leaving a team is still not possible.** The intent says membership "may still change within the existing team rules" before enrollment, and the existing rules have no leave, only abandoning an empty draft. So a member who changes their mind after accepting is stuck until the next competition. This is the first thing I would ask you about.
- **Closing enrollment also stops opting in and inviting**, not only creating, accepting and enrolling, since neither could lead anywhere.
- **A competition goes live with enrollment open.** The organizer closes it at the cutoff and can reopen it by hand.
- **Only signed-in participants can browse people.** In V1 a visitor could; with real people that seemed wrong.
- **The organizer sees enrolled teams and member names only.** No emails, and nothing about teams still forming beyond a count.
- **Registering with an email that already has an account** gives a deliberately vague message, so the form cannot be used to check whether someone has signed up.
- Carried over from V1: a creator alone in a draft is not yet committed; any member can invite; only the sender can withdraw; a declined invitation cannot be resent.
