Let’s Go! — Progressive Intent V2

Real Users, Persistent Teams & Competition Rules

Outcome

Turn the existing Let’s Go! demonstration into a real multi-user team-formation application.

Preserve the existing experience wherever possible. Add registration, login, shared persistence, and enforce the competition rules on the server/database rather than relying on browser state.

This iteration is primarily a rules-engine and identity upgrade, not a redesign.

Authoritative Inputs

The existing repository is the working baseline.
Preserve the existing challenge, people, team, invitation, and organizer experience unless a change is necessary to satisfy this intent.
There may be only one active event at a time.
Teams contain four people.
Users participate in only one team within the active event.
Required Outcomes

Registration and Login

A person must register before participating.

Registration creates a persistent user record.

A registered user can log in and return later from another browser/device with their state preserved.

Authentication must identify the actual user. Remove the existing participant identity-switching mechanism from the real participant experience.

Active Event

Only one event may be active at a time.

Any number of teams may attempt to form for that event.

When the event is closed:

no new teams may be created;
no invitations may be accepted;
no teams may register;
the event remains available as historical data.
A future event starts with clean participation state.

Team Creation

A user who is not committed to another team in the active event may create a team.

That user becomes the team leader.

Creating a team prevents the leader from joining or creating another team for the same event while that team exists.

The leader recruits members into the remaining three seats.

Invitations

Invitations are tentative.

Acceptance is commitment.

A person accepting an invitation becomes a member of that team and cannot:

join another team;
create another team;
accept another team’s invitation;
for the same active event.

Do not allow a person to occupy more than one team position for an event under any race condition or simultaneous request.

Leader Responsibility

The team leader controls recruitment.

Once a person has accepted membership, the leader cannot selectively remove that member in order to replace them with another candidate.

Accepted members are commitments, not placeholders.

Team Abandonment

A leader may abandon a team freely if nobody else has accepted membership.

If one or more invited people have already accepted and the leader abandons the team:

the team is dissolved;
all accepted members are released back into the available participant pool;
those released members receive no penalty;
they may immediately create or join another team;
the leader becomes ineligible to participate in the remainder of that event.
This consequence must be clearly explained before the leader confirms abandonment.

Member Withdrawal

Before the team has registered for the event, an accepted member may voluntarily leave the team.

That member returns to the available participant pool.

The leader is not penalized because another member voluntarily withdrew.

The open seat may then be recruited again.

Team Registration

A team may register for the active event only when all four seats are filled with committed members.

Registration is an explicit action by the team leader.

Once registered:

the roster is locked;
members cannot leave through the normal participant interface;
the leader cannot remove or replace members;
no additional invitations may exist for the team;
all four members are committed to that event.
Exceptional roster changes after registration require organizer/admin intervention and should not be part of the normal participant workflow.

Event Closure

Closing the active event freezes normal participant changes.

Preserve users, teams, membership, registrations, and event results as historical data.

Users become eligible to participate again when a new event becomes active.

Core Rule

The experience should make this progression obvious:

Invite = tentative

Accept = commitment

Register team = locked

Boundaries

Do not redesign the application unnecessarily.

Do not add chat, social feeds, résumé functionality, payments, judging, code submission, sponsor management, or other future product features in this iteration.

Do not prescribe a specific database, framework, authentication library, schema, or architecture unless required by the existing repository. Choose the simplest reliable implementation consistent with the project.

Server-side enforcement is authoritative. UI disabling alone is not sufficient protection for competition rules.

The database must prevent invalid team membership even when two requests happen nearly simultaneously.

Retain privacy boundaries from V1: participant email addresses must not become publicly discoverable.

Success Evidence

Demonstrate with automated tests and a runnable application that:

A new user can register, log out, and log back in.
User state persists outside a single browser session.
Only one event can be active.
A user cannot belong to two teams in the same event.
A team leader cannot join another team while leading a team.
Accepting an invitation commits the participant to that team.
A leader cannot remove an accepted member simply to replace them.
A leader can abandon an empty team without penalty.
A leader abandoning a team containing accepted members releases those members and disqualifies the leader for that event.
Released members may immediately seek another team.
A member voluntarily leaving an unregistered team does not penalize the leader.
Only a complete four-person team can register.
Registration locks the roster.
A closed event accepts no new teams, invitations, memberships, or registrations.
A new event allows previously participating users to compete again.
Server-side rules reject attempts to bypass these restrictions directly.
Preserve existing valid V1 rule tests where they remain consistent with this intent. Replace tests only where this intent intentionally changes the earlier behavior.

Bring the working application back for inspection before adding another product feature.

That is about the amount of intent I think this deserves. No giant authentication specification, no prescribed tables, no AWS architecture. Give Claude the business rules and make it prove that the rules hold.

And I especially like this state model now:

Available → Leader or Member → Team Complete → Registered → Locked → Event Closed.

The leader-abandonment penalty is the interesting piece. It introduces just enough consequence to stop people from assembling a team, shopping around for “better” programmers, and dumping the people who already committed. That fits the character of Intent Driven Saturdays very well. 

