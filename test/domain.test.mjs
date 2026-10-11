import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/domain.js';

const demo = JSON.parse(readFileSync(new URL('../data/demo.json', import.meta.url)));
const T0 = 1_000_000;
const fresh = () => D.createInitialState(demo);
const ALEX = 'demo-1', PRIYA = 'demo-2', JORDAN = 'demo-3', SAM = 'demo-4', TAYLOR = 'demo-5', CASEY = 'demo-6', RILEY = 'demo-8';

const code = (c) => (e) => e instanceof D.DomainError && e.code === c;
const lastInv = (s) => s.invitations.at(-1);

// Alex creates a team and `ids` each accept an invitation in turn.
function teamWith(s, creator, ids, now = T0) {
  s = D.createTeam(s, creator, '', now);
  for (const id of ids) {
    s = D.invite(s, creator, id, now);
    s = D.accept(s, lastInv(s).id, id, now);
  }
  return s;
}

test('unavailable people are not discoverable and cannot be invited', () => {
  let s = D.createTeam(fresh(), ALEX, '', T0);
  const ids = D.discover(s, ALEX).map((p) => p.id);
  assert.ok(!ids.includes(RILEY) && !ids.includes('demo-10'));
  assert.equal(ids.length, 7);
  assert.throws(() => D.invite(s, ALEX, RILEY, T0), code('not_discoverable'));
});

test('a new profile is unavailable by default', () => {
  const s = D.addParticipant(fresh(), { email: 'me@example.com', displayName: 'New Person', skills: ['Go'] });
  const me = s.participants.at(-1);
  assert.equal(D.isOpen(s, me.id), false);
  assert.ok(!D.discover(s, ALEX).some((p) => p.id === me.id));
  assert.throws(() => D.addParticipant(fresh(), { email: 'nope', displayName: 'X', skills: ['Go'] }), code('bad_email'));
  assert.throws(() => D.addParticipant(fresh(), { email: 'a@b.co', displayName: 'X', skills: [] }), code('bad_skills'));
});

test('discovery and non-member team views never contain an email', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA]);
  s = D.setShareEmail(s, PRIYA, true);
  assert.ok(!JSON.stringify(D.discover(s, ALEX)).includes('@'));
  assert.ok(!JSON.stringify(D.discover(s, null)).includes('@'));
  const team = D.teamOf(s, ALEX);
  assert.ok(!JSON.stringify(D.teamView(s, team.id, JORDAN)).includes('@'));
});

test('email is shared with teammates only by its owner’s choice', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA]);
  const team = D.teamOf(s, ALEX);
  assert.ok(!JSON.stringify(D.teamView(s, team.id, ALEX)).includes('@'));
  s = D.setShareEmail(s, PRIYA, true);
  const members = D.teamView(s, team.id, ALEX).members;
  assert.equal(members.find((m) => m.id === PRIYA).email, 'participant2@example.com');
  assert.equal(members.find((m) => m.id === ALEX).email, undefined);
  assert.throws(() => D.setShareEmail(s, JORDAN, true), code('no_team'));
});

test('invitation shows team, members, skills and remaining seats, but no email', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA]);
  s = D.invite(s, ALEX, JORDAN, T0);
  const v = D.invitationView(s, lastInv(s).id, JORDAN);
  assert.equal(v.teamName, "Alex Morgan's team");
  assert.deepEqual(v.members.map((m) => m.id), [ALEX, PRIYA]);
  assert.equal(v.openSeats, 2);
  assert.ok(v.skills.includes('Python') && v.challenge.title);
  assert.ok(!JSON.stringify(v).includes('@'));
  assert.equal(D.invitationView(s, lastInv(s).id, SAM), null);
});

test('a recipient has at most one active incoming invitation', () => {
  let s = D.createTeam(fresh(), ALEX, '', T0);
  s = D.createTeam(s, CASEY, '', T0);
  s = D.invite(s, ALEX, PRIYA, T0);
  assert.throws(() => D.invite(s, CASEY, PRIYA, T0), code('slot_taken'));
  assert.throws(() => D.invite(s, ALEX, PRIYA, T0), code('already_invited'));
  // The explanation names no team.
  const [, msg] = D.inviteBlock(s, CASEY, PRIYA);
  assert.ok(!msg.includes('Alex'));
});

test('accepting commits to one team and removes the person from discovery', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA]);
  s = D.createTeam(s, CASEY, '', T0);
  assert.ok(!D.discover(s, CASEY).some((p) => p.id === PRIYA));
  assert.throws(() => D.invite(s, CASEY, PRIYA, T0), code('not_discoverable'));
  assert.throws(() => D.setOpen(s, PRIYA, true, T0), code('already_committed'));
  assert.throws(() => D.createTeam(s, PRIYA, '', T0), code('already_on_team'));
  assert.equal(s.teams.filter((t) => t.memberIds.includes(PRIYA)).length, 1);
});

test('a full team has exactly four members and closes its pending invitations', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA, JORDAN]);
  s = D.invite(s, ALEX, SAM, T0);
  const samInv = lastInv(s).id;
  s = D.invite(s, PRIYA, TAYLOR, T0); // teammates may invite too
  const taylorInv = lastInv(s).id;
  s = D.accept(s, samInv, SAM, T0);
  const team = D.teamOf(s, ALEX);
  assert.equal(team.memberIds.length, 4);
  assert.equal(s.invitations.find((i) => i.id === taylorInv).status, 'closed');
  assert.throws(() => D.accept(s, taylorInv, TAYLOR, T0), code('invitation_unavailable'));
  assert.throws(() => D.invite(s, ALEX, CASEY, T0), code('team_full'));
  assert.equal(D.teamOf(s, ALEX).memberIds.length, 4);
  const v = D.teamView(s, team.id, ALEX);
  assert.ok(v.isFull && v.openSeats === 0 && v.seats.every(Boolean));
});

test('declining is final for that team in this event', () => {
  let s = D.createTeam(fresh(), ALEX, '', T0);
  s = D.invite(s, ALEX, PRIYA, T0);
  s = D.decline(s, lastInv(s).id, PRIYA, T0);
  assert.equal(lastInv(s).status, 'declined');
  assert.throws(() => D.invite(s, ALEX, PRIYA, T0), code('declined_before'));
  // Another team may still invite.
  s = D.createTeam(s, CASEY, '', T0);
  s = D.invite(s, CASEY, PRIYA, T0);
  assert.equal(lastInv(s).status, 'pending');
});

test('only the sender can withdraw, and a withdrawn slot is free again', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA]);
  s = D.invite(s, ALEX, JORDAN, T0);
  const id = lastInv(s).id;
  assert.throws(() => D.withdraw(s, id, PRIYA, T0), code('not_yours'));
  assert.throws(() => D.accept(s, id, SAM, T0), code('not_yours'));
  s = D.withdraw(s, id, ALEX, T0);
  assert.throws(() => D.accept(s, id, JORDAN, T0), code('invitation_unavailable'));
  s = D.invite(s, PRIYA, JORDAN, T0);
  assert.equal(lastInv(s).status, 'pending');
});

test('invitations expire', () => {
  let s = D.createTeam(fresh(), ALEX, '', T0);
  s = D.invite(s, ALEX, PRIYA, T0);
  const id = lastInv(s).id;
  const later = T0 + D.INVITE_TTL_MS;
  assert.equal(D.sweep(s, later - 1), s);
  assert.throws(() => D.accept(s, id, PRIYA, later), code('invitation_unavailable'));
  s = D.sweep(s, later);
  assert.equal(s.invitations[0].status, 'expired');
  assert.equal(D.pendingIncoming(s, PRIYA), null);
});

test('pausing closes the pending invitation and hides the person', () => {
  let s = D.createTeam(fresh(), ALEX, '', T0);
  s = D.invite(s, ALEX, PRIYA, T0);
  s = D.setOpen(s, PRIYA, false, T0);
  assert.equal(lastInv(s).status, 'closed');
  assert.ok(!D.discover(s, ALEX).some((p) => p.id === PRIYA));
  assert.throws(() => D.invite(s, ALEX, PRIYA, T0), code('not_discoverable'));
});

// ---------- commitment: leading, leaving, abandoning ----------

test('creating a team commits the leader: unavailable to others and unable to join elsewhere', () => {
  let s = D.createTeam(fresh(), ALEX, '', T0);
  s = D.invite(s, ALEX, CASEY, T0);
  const toCasey = lastInv(s).id;
  // Casey starts a team while that invitation is pending: it closes, and Casey leaves the pool.
  s = D.createTeam(s, CASEY, 'Cloud Crew', T0);
  assert.equal(s.invitations.find((i) => i.id === toCasey).status, 'closed');
  assert.throws(() => D.accept(s, toCasey, CASEY, T0), code('invitation_unavailable'));
  assert.ok(!D.discover(s, ALEX).some((p) => p.id === CASEY));
  assert.throws(() => D.invite(s, ALEX, CASEY, T0), code('not_discoverable'));
  assert.throws(() => D.setOpen(s, CASEY, true, T0), code('already_committed'));
  assert.throws(() => D.createTeam(s, CASEY, 'Another', T0), code('already_on_team'));
  assert.equal(D.viewFor(s, { participantId: CASEY }).me.isCommitted, true);
});

test('a leader abandons an empty team freely and can then join another', () => {
  let s = D.createTeam(fresh(), ALEX, '', T0);
  s = D.createTeam(s, CASEY, '', T0);
  s = D.invite(s, CASEY, SAM, T0);
  const caseyOut = lastInv(s).id;
  s = D.abandonTeam(s, CASEY, T0);
  assert.equal(s.teams.length, 1);
  assert.equal(s.invitations.find((i) => i.id === caseyOut).status, 'closed');
  assert.equal(D.isIneligible(s, CASEY), false);
  s = D.setOpen(s, CASEY, true, T0);
  s = D.invite(s, ALEX, CASEY, T0);
  s = D.accept(s, lastInv(s).id, CASEY, T0);
  assert.deepEqual(D.teamOf(s, CASEY).memberIds, [ALEX, CASEY]);
});

test('abandoning a team with committed members releases them and puts the leader out of the event', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA, JORDAN]);
  s = D.setShareEmail(s, PRIYA, true);
  s = D.invite(s, ALEX, SAM, T0);
  const pending = lastInv(s).id;
  s = D.abandonTeam(s, ALEX, T0);
  // Dissolved: nobody holds a seat, and the open invitation is gone.
  for (const id of [ALEX, PRIYA, JORDAN]) assert.equal(D.teamOf(s, id), null);
  assert.equal(s.invitations.find((i) => i.id === pending).status, 'closed');
  assert.equal(D.findPerson(s, PRIYA).shareEmailWithTeam, false);
  // Released members carry no penalty and are straight back in the pool.
  assert.equal(D.isIneligible(s, PRIYA), false);
  assert.ok(D.isDiscoverable(s, PRIYA) && D.isDiscoverable(s, JORDAN));
  s = D.createTeam(s, CASEY, '', T0);
  s = D.invite(s, CASEY, PRIYA, T0);
  s = D.accept(s, lastInv(s).id, PRIYA, T0);
  s = D.createTeam(s, JORDAN, 'Jordan leads', T0);
  assert.deepEqual(D.teamOf(s, PRIYA).memberIds, [CASEY, PRIYA]);
  assert.equal(D.teamOf(s, JORDAN).creatorId, JORDAN);
  // The leader cannot create, opt in, be found or be invited for the rest of this event.
  assert.equal(D.viewFor(s, { participantId: ALEX }).me.isIneligible, true);
  assert.throws(() => D.createTeam(s, ALEX, '', T0), code('ineligible'));
  assert.throws(() => D.setOpen(s, ALEX, true, T0), code('ineligible'));
  assert.ok(!D.discover(s, CASEY).some((p) => p.id === ALEX));
  assert.throws(() => D.invite(s, CASEY, ALEX, T0), code('not_discoverable'));
  D.checkIntegrity(s);
});

test('the penalty lasts for that event only', () => {
  let s = D.abandonTeam(teamWith(fresh(), ALEX, [PRIYA]), ALEX, T0);
  let id;
  [s, id] = draft(s);
  s = D.publishChallenge(D.unpublishChallenge(s, LIVE), id);
  assert.equal(D.isIneligible(s, ALEX), false);
  s = D.createTeam(s, ALEX, '', T0);
  assert.equal(D.teamOf(s, ALEX).creatorId, ALEX);
  // The earlier event keeps its record.
  assert.ok(s.teams.some((t) => t.challengeId === LIVE && t.dissolvedAt));
  assert.ok(!JSON.stringify(D.viewFor(s, null)).includes('disqualified'));
});

test('a member may leave before registration; the leader is not penalised and the seat reopens', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA, JORDAN, SAM]);
  assert.equal(D.teamView(s, D.teamOf(s, ALEX).id, ALEX).status, 'READY');
  s = D.setShareEmail(s, SAM, true);
  s = D.leaveTeam(s, SAM, T0);
  const v = D.teamView(s, D.teamOf(s, ALEX).id, ALEX);
  assert.ok(v.status === 'FORMING' && v.openSeats === 1);
  assert.equal(D.isIneligible(s, ALEX), false);
  assert.equal(D.findPerson(s, SAM).shareEmailWithTeam, false);
  assert.ok(D.isDiscoverable(s, SAM));
  // The seat can be recruited again, by the same person or anyone else.
  s = D.invite(s, ALEX, TAYLOR, T0);
  s = D.accept(s, lastInv(s).id, TAYLOR, T0);
  assert.equal(D.teamOf(s, ALEX).memberIds.length, 4);
  assert.throws(() => D.leaveTeam(s, ALEX, T0), code('leader_cannot_leave'));
  assert.throws(() => D.abandonTeam(s, PRIYA, T0), code('not_leader'));
  assert.throws(() => D.leaveTeam(s, CASEY, T0), code('no_team'));
});

test('a leader has no way to remove an accepted member', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA]);
  const accepted = s.invitations.find((i) => i.toId === PRIYA).id;
  // Withdrawing only ever applies to an invitation still waiting for an answer.
  assert.throws(() => D.withdraw(s, accepted, ALEX, T0), code('invitation_unavailable'));
  assert.deepEqual(D.teamOf(s, PRIYA).memberIds, [ALEX, PRIYA]);
  assert.ok(!Object.keys(D).some((name) => /remove|kick|replace/i.test(name)));
});

test('registration locks the roster', () => {
  let s = D.enrollTeam(teamWith(fresh(), ALEX, [PRIYA, JORDAN, SAM]), ALEX, T0);
  assert.throws(() => D.leaveTeam(s, PRIYA, T0), code('roster_locked'));
  assert.throws(() => D.abandonTeam(s, ALEX, T0), code('roster_locked'));
  assert.throws(() => D.invite(s, ALEX, TAYLOR, T0), code('team_full'));
  const v = D.teamView(s, D.teamOf(s, ALEX).id, PRIYA);
  assert.ok(v.status === 'ENROLLED' && v.canChange === false);
  assert.ok(!s.invitations.some((i) => i.teamId === v.id && i.status === 'pending'));
  assert.equal(D.teamOf(s, ALEX).memberIds.length, 4);
});

test('a closed event freezes rosters as well', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA]);
  s = D.setEnrollment(s, LIVE, false);
  assert.throws(() => D.leaveTeam(s, PRIYA, T0), code('enrollment_closed'));
  assert.throws(() => D.abandonTeam(s, ALEX, T0), code('enrollment_closed'));
  assert.deepEqual(D.teamOf(s, PRIYA).memberIds, [ALEX, PRIYA]);
});

test('the store check rejects any state with someone on two teams or an oversized team', () => {
  const s = teamWith(fresh(), ALEX, [PRIYA]);
  D.checkIntegrity(s);
  const twoSeats = structuredClone(D.createTeam(s, CASEY, '', T0));
  twoSeats.teams[1].memberIds.push(PRIYA);
  assert.throws(() => D.checkIntegrity(twoSeats), /two seats/);
  const five = structuredClone(s);
  five.teams[0].memberIds.push(JORDAN, SAM, TAYLOR);
  assert.throws(() => D.checkIntegrity(five), /invalid roster/);
  const twoLive = structuredClone(s);
  twoLive.challenges.push({ ...twoLive.challenges[0], id: 'other' });
  assert.throws(() => D.checkIntegrity(twoLive), /more than one live/);
});

test('actions do not mutate the state they are given', () => {
  const s = fresh();
  const before = JSON.stringify(s);
  D.invite(D.createTeam(s, ALEX, '', T0), ALEX, PRIYA, T0);
  assert.equal(JSON.stringify(s), before);
});

// ---------- challenges ----------

const LIVE = 'demo-saturday';
const draft = (s, fields = {}) => {
  s = D.saveChallenge(s, { title: 'Second Saturday', preview: 'Build something else.', date: '2026-11-14', ...fields });
  return [s, s.challenges.at(-1).id];
};

test('a new challenge is a draft and participants still see only the live one', () => {
  const [s, id] = draft(fresh());
  assert.equal(s.challenges.find((c) => c.id === id).status, 'draft');
  assert.equal(D.liveChallenge(s).id, LIVE);
  assert.throws(() => D.saveChallenge(fresh(), { title: '' }), code('bad_title'));
  assert.throws(() => D.saveChallenge(fresh(), { title: 'X', date: '2026-02-31x' }), code('bad_date'));
});

test('only one challenge is live at a time', () => {
  let [s, id] = draft(fresh());
  assert.throws(() => D.publishChallenge(s, id), code('another_live'));
  s = D.unpublishChallenge(s, LIVE);
  s = D.publishChallenge(s, id);
  assert.deepEqual(s.challenges.filter((c) => c.status === 'live').map((c) => c.id), [id]);
  assert.throws(() => D.publishChallenge(s, LIVE), code('another_live'));
});

test('a challenge needs a title, description and date to be live', () => {
  let s = D.unpublishChallenge(fresh(), LIVE);
  let id;
  [s, id] = draft(s, { date: '' });
  assert.throws(() => D.publishChallenge(s, id), code('incomplete'));
  s = D.saveChallenge(s, { id, title: 'Second Saturday', preview: 'Build something else.', date: '2026-11-14' });
  s = D.publishChallenge(s, id);
  assert.equal(D.liveChallenge(s).date, '2026-11-14');
  // A live challenge cannot be edited into an incomplete one.
  assert.throws(() => D.saveChallenge(s, { id, title: 'Second Saturday', preview: '', date: '2026-11-14' }), code('incomplete'));
});

test('with nothing live, no one is discoverable and teams cannot form', () => {
  const s = D.unpublishChallenge(fresh(), LIVE);
  assert.equal(D.liveChallenge(s), null);
  assert.equal(D.discover(s, ALEX).length, 0);
  assert.throws(() => D.createTeam(s, ALEX, '', T0), code('no_live_challenge'));
  assert.throws(() => D.setOpen(s, PRIYA, true, T0), code('no_live_challenge'));
});

test('teams and opt-ins belong to their challenge', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA]);
  let id;
  [s, id] = draft(s);
  s = D.publishChallenge(D.unpublishChallenge(s, LIVE), id);
  // A new challenge: no one has opted in, and the earlier team does not carry over.
  assert.equal(D.teamOf(s, PRIYA), null);
  assert.equal(D.discover(s, ALEX).length, 0);
  s = D.createTeam(s, CASEY, '', T0);
  s = D.setOpen(s, PRIYA, true, T0);
  s = D.invite(s, CASEY, PRIYA, T0);
  s = D.accept(s, lastInv(s).id, PRIYA, T0);
  assert.deepEqual(D.teamOf(s, PRIYA).memberIds, [CASEY, PRIYA]);
  // The first challenge's team is intact when it returns.
  // (The sample challenge has no date, so it needs one before it can go live again.)
  s = D.saveChallenge(D.unpublishChallenge(s, id), { id: LIVE, title: 'Sample', preview: 'Sample.', date: '2026-12-05' });
  s = D.publishChallenge(s, LIVE);
  assert.deepEqual(D.teamOf(s, PRIYA).memberIds, [ALEX, PRIYA]);
});

test('only an offline challenge without teams can be deleted', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA]);
  assert.throws(() => D.deleteChallenge(s, LIVE), code('is_live'));
  s = D.unpublishChallenge(s, LIVE);
  assert.throws(() => D.deleteChallenge(s, LIVE), code('has_teams'));
  let id;
  [s, id] = draft(s);
  s = D.deleteChallenge(s, id);
  assert.ok(!s.challenges.some((c) => c.id === id));
});

// ---------- enrollment ----------

const TEAM4 = [PRIYA, JORDAN, SAM];

test('a team moves FORMING, READY, ENROLLED and the organizer is told', () => {
  let s = D.createTeam(fresh(), ALEX, 'Four', T0);
  const id = D.teamOf(s, ALEX).id;
  assert.equal(D.teamView(s, id, ALEX).status, 'FORMING');
  assert.throws(() => D.enrollTeam(s, ALEX, T0), code('not_ready'));
  s = teamWith(fresh(), ALEX, TEAM4);
  const v = D.teamView(s, D.teamOf(s, ALEX).id, ALEX);
  assert.ok(v.status === 'READY' && v.canEnroll);
  assert.equal(D.teamView(s, v.id, PRIYA).canEnroll, false);
  assert.throws(() => D.enrollTeam(s, PRIYA, T0), code('not_leader'));
  assert.throws(() => D.enrollTeam(s, CASEY, T0), code('no_team'));
  s = D.enrollTeam(s, ALEX, T0);
  assert.equal(D.teamView(s, v.id, PRIYA).status, 'ENROLLED');
  assert.deepEqual(D.teamOf(s, SAM).memberIds, [ALEX, ...TEAM4]);
  assert.throws(() => D.enrollTeam(s, ALEX, T0), code('already_enrolled'));
  const admin = D.viewFor(s, { organizer: true }).admin;
  assert.equal(admin.notifications.length, 1);
  assert.equal(admin.notifications[0].teamName, "Alex Morgan's team");
  assert.equal(admin.challenges[0].enrolled[0].members.length, 4);
  assert.equal(D.viewFor(D.markNotificationsSeen(s), { organizer: true }).admin.notifications.length, 0);
});

test('closing enrollment stops team formation and enrollment, but not viewing', () => {
  let s = teamWith(fresh(), ALEX, TEAM4);
  s = D.createTeam(s, CASEY, '', T0);
  s = D.invite(s, CASEY, TAYLOR, T0);
  const pending = lastInv(s).id;
  s = D.setEnrollment(s, LIVE, false);
  assert.throws(() => D.createTeam(s, 'demo-7', '', T0), code('enrollment_closed'));
  assert.throws(() => D.invite(s, CASEY, 'demo-7', T0), code('enrollment_closed'));
  assert.throws(() => D.accept(s, pending, TAYLOR, T0), code('enrollment_closed'));
  assert.throws(() => D.setOpen(s, RILEY, true, T0), code('enrollment_closed'));
  assert.throws(() => D.enrollTeam(s, ALEX, T0), code('enrollment_closed'));
  assert.equal(D.teamView(s, D.teamOf(s, ALEX).id, ALEX).canEnroll, false);
  assert.equal(D.viewFor(s, null).challenge.enrollmentOpen, false);
  assert.equal(D.viewFor(s, { participantId: ALEX }).team.members.length, 4);
  // The organizer can reopen by hand.
  s = D.enrollTeam(D.setEnrollment(s, LIVE, true), ALEX, T0);
  assert.equal(D.teamOf(s, ALEX).enrolledAt, T0);
  assert.throws(() => D.setEnrollment(s, 'nope', true), code('unknown_challenge'));
});

test('an enrolled team does not stop its members joining the next competition', () => {
  let s = D.enrollTeam(teamWith(fresh(), ALEX, TEAM4), ALEX, T0);
  let id;
  [s, id] = draft(s);
  s = D.publishChallenge(D.unpublishChallenge(s, LIVE), id);
  assert.equal(D.liveChallenge(s).enrollmentOpen, true);
  assert.equal(D.viewFor(s, { participantId: PRIYA }).team, null);
  s = D.createTeam(s, PRIYA, '', T0);
  s = D.setOpen(s, ALEX, true, T0);
  s = D.invite(s, PRIYA, ALEX, T0);
  s = D.accept(s, lastInv(s).id, ALEX, T0);
  assert.deepEqual(D.teamOf(s, ALEX).memberIds, [PRIYA, ALEX]);
});

// ---------- per-viewer views ----------

const emailsIn = (v) => [...new Set(JSON.stringify(v).match(/[\w.+-]+@[\w.-]+/g) ?? [])];

test('a visitor sees the competition and nothing about people or teams', () => {
  const s = teamWith(fresh(), ALEX, [PRIYA]);
  const v = D.viewFor(s, null);
  assert.deepEqual(Object.keys(v).sort(), ['challenge', 'role']);
  assert.equal(v.challenge.title, demo.challenge.title);
  assert.equal(D.viewFor(s, { participantId: 'nobody' }).role, 'visitor');
});

test('a participant view holds only their own email, plus teammates who chose to share', () => {
  let s = teamWith(fresh(), ALEX, [PRIYA]);
  s = D.createTeam(s, CASEY, 'Other', T0);
  s = D.invite(s, CASEY, JORDAN, T0);
  assert.deepEqual(emailsIn(D.viewFor(s, { participantId: ALEX })), ['participant1@example.com']);
  s = D.setShareEmail(s, PRIYA, true);
  assert.deepEqual(emailsIn(D.viewFor(s, { participantId: ALEX })).sort(), ['participant1@example.com', 'participant2@example.com']);
  // Someone outside the team sees neither, and nothing of another team's name or invitations.
  const outsider = D.viewFor(s, { participantId: SAM });
  assert.deepEqual(emailsIn(outsider), ['participant4@example.com']);
  assert.ok(!JSON.stringify(outsider).includes('Other') && !JSON.stringify(outsider).includes("Alex Morgan's team"));
  // The organizer sees no emails at all.
  assert.deepEqual(emailsIn(D.viewFor(s, { organizer: true })), []);
});
