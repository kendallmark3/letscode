Let’s Go! — Progressive Intent V2

Outcome

Move Let’s Go! from a single-browser demonstration into a simple real-user experience.

A programmer should be able to:

Create an account → Log in → View the open competition → Create or join one team → Complete the four-person team → Join the competition

The system must know who each participant is and enforce the competition/team rules across users.

Keep this simple.

This is not a social network, tournament platform, messaging system, or complex membership application.



Authoritative Inputs

The existing repository is the working baseline.

Preserve the current product experience and rules unless this intent explicitly changes them.

The existing application already supports:

challenges
one live challenge at a time
participant profiles
participant discovery
four-person teams
invitations
accepting and declining invitations
team-specific privacy
challenge-specific participation
organizer/admin challenge management
Extend these capabilities rather than rebuilding them.



Required Outputs

Real User Identity

Replace the current demo-only identity switching as the normal participant experience.

A participant must have an authenticated account before they can:

opt into a competition
create a team
invite/select competitors
accept a team invitation
leave or change a forming team
enroll a completed team
Visitors may view the current public competition without logging in.

Keep registration and login minimal.

Use the participant’s existing profile information where appropriate.



Competition Commitment

A participant may belong to only one team in an active competition.

For the currently open competition, a participant cannot simultaneously:

belong to two teams
create one team while committed to another
accept multiple team invitations
enroll with multiple teams
This rule is scoped to the competition.

Participation in a completed or previous competition must not prevent participation in a later competition.



Team Formation

A team contains exactly 4 competitors when complete.

A participant may create a team while enrollment for the competition is open.

The creator occupies one seat.

The existing participant discovery and invitation experience should remain the primary way to fill the remaining seats.

Before final competition enrollment, team membership may still change within the existing team rules.

No participant should ever occupy seats on two teams for the same competition.



Participant Consent

Being selected or invited does not automatically make someone a team member.

The invited participant must accept.

Acceptance commits that participant to that team for the competition.

Once committed, the participant should no longer appear as available to other teams for that competition.



Team Status

Make the current state obvious without introducing complicated workflow.

A team should effectively move through:

FORMING → READY → ENROLLED

FORMING
Fewer than four accepted members.

READY
Four accepted members, but the team has not yet entered the competition.

ENROLLED
The completed team has joined the competition.

Use whatever implementation best fits the existing application.



Join Competition

When a team reaches four accepted members, give the appropriate team member a clear action:

Join Competition

Joining must:

require exactly four valid team members
enroll the team in the current competition
preserve all four members’ commitment to that team
prevent conflicting participation in that competition
clearly confirm successful enrollment
notify the organizer/admin that a new team has enrolled
Email may be used for the organizer notification if appropriate to the existing architecture.

Do not build a general-purpose notification system merely to satisfy this requirement.



Enrollment Window

Competition enrollment is controlled by the organizer.

The organizer can open enrollment and close enrollment.

When enrollment is closed:

new teams cannot be created for that competition
new participants cannot join teams for that competition
teams cannot newly enroll
existing competition information may still be viewed
Closing enrollment represents the cutoff.

There is no need for waitlists, late registration, exceptions, or automated reopening in this iteration.

The next competition begins as a separate competition with its own participation state.



Boundaries

Keep the existing four-person team concept.

Keep participant email private except where the participant has explicitly chosen to share it under the existing rules.

Do not expose private teams or private participant information merely because authentication now exists.

Do not add:

chat
social feeds
followers
rankings
payments
judging
submissions
résumé management
recruiter workflows
multiple simultaneous competition commitments
complicated role or permission hierarchies
The organizer/admin role may continue to manage competitions.

Participant authentication should be secure enough for real users rather than simulated browser identity switching.

Shared state must work across different users/devices. Browser-only local state is no longer sufficient for authoritative participant, team, invitation, or enrollment information.

The coding agent owns the authentication technology, persistence approach, architecture, implementation details, and migration strategy unless a choice must be brought back because it materially affects cost, deployment, or product behavior.

Preserve the current visual experience wherever practical.



Success and Evidence

Demonstrate the feature using separate authenticated users.

Show that:

A visitor can view the open competition without logging in.
A participant can register/login and opt into the competition.
A participant can create a team.
Other authenticated participants can be invited and accept.
Four accepted participants make the team READY.
A participant committed to one team cannot join or create another team in the same competition.
A READY team can select Join Competition and become ENROLLED.
The organizer can see that the team enrolled and receives the intended notification.
Closing enrollment prevents additional team formation or enrollment.
A future competition starts cleanly and allows those same people to participate again.
Private team and participant information remains protected between authenticated users.
The important participation rules are enforced by the authoritative application state, not merely hidden or disabled in the browser.
Keep existing automated rule coverage and add tests for the new authentication, enrollment, competition commitment, and access-control boundaries.

Bring the running result back for inspection before adding any further competition-management features.

This fits the repo extremely well. V1 actually anticipated exactly this: its README says that before public registration, a later intent needed authentication, shared persistence, access controls, and reliable multi-user invitation handling. 

And I like one change from our earlier thinking: don’t make the creator “select” four people outright. Keep the invitation/acceptance model Claude already built. You pick who you want, but they have to say yes. That’s cleaner and prevents people from getting drafted onto teams they never agreed to join.

Give Claude this one file only as V2. I wouldn’t add architecture instructions. This is exactly where Progressive Intent earns its keep: tell it what has become real, give it the boundaries, and let it figure out the implementation.


