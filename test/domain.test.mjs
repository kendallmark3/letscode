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
  const me = D.findPerson(s, s.currentUserId);
  assert.equal(me.open, false);
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

test('a creator must explicitly abandon an empty draft to join another team', () => {
  let s = D.createTeam(fresh(), ALEX, '', T0);
  s = D.createTeam(s, CASEY, 'Cloud Crew', T0);
  s = D.invite(s, CASEY, SAM, T0);
  const caseyOut = lastInv(s).id;
  s = D.invite(s, ALEX, CASEY, T0);
  const toCasey = lastInv(s).id;
  assert.throws(() => D.accept(s, toCasey, CASEY, T0), code('needs_abandon'));
  s = D.accept(s, toCasey, CASEY, T0, { abandonDraft: true });
  assert.equal(s.teams.length, 1);
  assert.deepEqual(D.teamOf(s, CASEY).memberIds, [ALEX, CASEY]);
  assert.equal(s.invitations.find((i) => i.id === caseyOut).status, 'closed');
  assert.throws(() => D.accept(s, caseyOut, SAM, T0), code('invitation_unavailable'));
});

test('a draft with other members cannot be abandoned, and its creator cannot join elsewhere', () => {
  let s = D.createTeam(fresh(), ALEX, '', T0);
  s = D.createTeam(s, CASEY, '', T0);
  s = D.setOpen(s, ALEX, true, T0);
  s = D.invite(s, CASEY, ALEX, T0);
  const toAlex = lastInv(s).id;
  // Alex's own team gains a member while that invitation is pending.
  s = D.invite(s, ALEX, PRIYA, T0);
  s = D.accept(s, lastInv(s).id, PRIYA, T0);
  assert.equal(s.invitations.find((i) => i.id === toAlex).status, 'closed');
  assert.throws(() => D.accept(s, toAlex, ALEX, T0, { abandonDraft: true }), code('invitation_unavailable'));
  assert.throws(() => D.abandonDraft(s, ALEX, T0), code('not_empty'));
  assert.equal(s.teams.filter((t) => t.memberIds.includes(ALEX)).length, 1);
});

test('actions do not mutate the state they are given', () => {
  const s = fresh();
  const before = JSON.stringify(s);
  D.invite(D.createTeam(s, ALEX, '', T0), ALEX, PRIYA, T0);
  assert.equal(JSON.stringify(s), before);
});
