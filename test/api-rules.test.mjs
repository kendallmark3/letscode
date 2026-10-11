// The commitment rules of intent/intentv2.md, checked through the HTTP API with
// separate signed-in users: invite is tentative, accept is commitment, register is locked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, refused } from './support.mjs';

const h = harness();
const { people, idOf, fill, organizer } = h;
const NAMES = ['Lea', 'Mo', 'Nia', 'Oz', 'Pat', 'Quin', 'Rae', 'Sol', 'Tao', 'Uma', 'Val', 'Wes'];
let eventId;

before(async () => {
  await h.start();
  eventId = await h.openEvent();
  await h.join(NAMES);
});
after(() => h.cleanup());

// Seats held per person in one event, read from the saved data itself.
const seatsOnDisk = (challengeId = eventId) => {
  const state = JSON.parse(readFileSync(h.dataFile, 'utf8'));
  const seats = {};
  for (const t of state.teams) {
    if (t.challengeId !== challengeId || t.dissolvedAt) continue;
    for (const id of t.memberIds) seats[id] = (seats[id] ?? 0) + 1;
  }
  return seats;
};
const noOneHoldsTwoSeats = () => assert.ok(Object.values(seatsOnDisk()).every((n) => n === 1), JSON.stringify(seatsOnDisk()));

test('a leader cannot join another team while leading one, and can after abandoning an empty team', async () => {
  await people.Mo.ok('setOpen', { open: true });
  await people.Lea.ok('createTeam', { name: 'Lea leads' });
  await people.Lea.ok('invite', { toId: await idOf('Mo') });
  // Mo is invited (tentative), then starts a team of their own: the invitation is no longer open to them.
  const inv = (await people.Mo.view()).invitation;
  assert.equal((await people.Mo.view()).team, null);
  await people.Mo.ok('createTeam', { name: 'Mo leads' });
  refused(await people.Mo.act('accept', { id: inv.id }), 409, 'invitation_unavailable');
  refused(await people.Mo.act('setOpen', { open: true }), 409, 'already_committed');
  refused(await people.Lea.act('invite', { toId: await idOf('Mo') }), 409, 'not_discoverable');
  refused(await people.Mo.act('createTeam', { name: 'Second' }), 409, 'already_on_team');

  // Abandoning an empty team costs nothing.
  const v = await people.Mo.ok('abandonTeam');
  assert.equal(v.team, null);
  assert.equal(v.me.isIneligible, false);
  await fill('Lea', ['Mo']);
  assert.deepEqual((await people.Mo.view()).team.members.map((m) => m.displayName), ['Lea', 'Mo']);
  noOneHoldsTwoSeats();
});

test('accepting commits; the leader cannot remove an accepted member to replace them', async () => {
  const state = JSON.parse(readFileSync(h.dataFile, 'utf8'));
  const accepted = state.invitations.find((i) => i.status === 'accepted');
  for (const type of ['removeMember', 'kick', 'replaceMember']) {
    refused(await people.Lea.act(type, { id: await idOf('Mo'), memberId: await idOf('Mo') }), 400, 'unknown_action');
  }
  refused(await people.Lea.act('withdraw', { id: accepted.id }), 409, 'invitation_unavailable');
  // A leader cannot leave either: the only way out is to abandon, with its consequence.
  refused(await people.Lea.act('leaveTeam'), 409, 'leader_cannot_leave');
  assert.equal((await people.Lea.view()).team.members.length, 2);
});

test('a member leaves an unregistered team: back in the pool, leader not penalised, seat recruitable', async () => {
  await fill('Lea', ['Nia']);
  let v = await people.Nia.ok('leaveTeam');
  assert.equal(v.team, null);
  assert.equal(v.me.isOpen, true);
  assert.equal(v.me.isIneligible, false);
  const lea = await people.Lea.view();
  assert.equal(lea.me.isIneligible, false);
  assert.equal(lea.team.openSeats, 2);
  assert.ok(lea.people.some((p) => p.displayName === 'Nia'));
  refused(await people.Mo.act('abandonTeam'), 409, 'not_leader');
  await fill('Lea', ['Oz', 'Pat']);
  v = await people.Lea.view();
  assert.equal(v.team.status, 'READY');
  noOneHoldsTwoSeats();
});

test('abandoning a team with committed members releases them and disqualifies the leader for this event', async () => {
  await people.Quin.ok('createTeam', { name: 'Quin leads' });
  await fill('Quin', ['Rae', 'Sol']);
  await people.Rae.ok('setShareEmail', { share: true });
  const v = await people.Quin.ok('abandonTeam');
  assert.equal(v.team, null);
  assert.equal(v.me.isIneligible, true);
  refused(await people.Quin.act('createTeam', { name: 'Again' }), 409, 'ineligible');
  refused(await people.Quin.act('setOpen', { open: true }), 409, 'ineligible');

  // Released members: no penalty, back in the pool, and able to act at once.
  for (const n of ['Rae', 'Sol']) {
    const m = await people[n].view();
    assert.ok(m.team === null && m.me.isOpen && !m.me.isIneligible, n);
  }
  const nia = await people.Nia.ok('createTeam', { name: 'Nia leads' });
  assert.ok(nia.people.some((p) => p.displayName === 'Rae'));
  assert.ok(!nia.people.some((p) => p.displayName === 'Quin'));
  refused(await people.Nia.act('invite', { toId: await idOf('Quin') }), 409, 'not_discoverable');
  await fill('Nia', ['Rae']);
  await people.Sol.ok('createTeam', { name: 'Sol leads' });
  assert.equal((await people.Rae.view()).team.name, 'Nia leads');
  // Rae's earlier choice to share an email did not follow them to the new team.
  assert.ok(!JSON.stringify(await people.Nia.view()).includes('rae@example.com'));
  noOneHoldsTwoSeats();
});

test('only a complete team registers, and registration locks the roster', async () => {
  refused(await people.Nia.act('enroll'), 409, 'not_ready');
  refused(await people.Mo.act('enroll'), 409, 'not_leader');
  const v = await people.Lea.ok('enroll');
  assert.equal(v.team.status, 'ENROLLED');
  assert.equal(v.team.canChange, false);
  refused(await people.Mo.act('leaveTeam'), 409, 'roster_locked');
  refused(await people.Lea.act('abandonTeam'), 409, 'roster_locked');
  refused(await people.Lea.act('invite', { toId: await idOf('Tao') }), 409, 'team_full');
  assert.equal((await people.Pat.view()).team.members.length, 4);
  assert.equal((await organizer.view()).admin.challenges[0].enrolled[0].name, 'Lea leads');
});

test('simultaneous requests never put one person in two seats or five people on a team', async () => {
  // Three people each hold an invitation to the last seat of the same team and accept at the same instant.
  await people.Tao.ok('createTeam', { name: 'Tao leads' });
  await fill('Tao', ['Uma', 'Val']);
  const rivals = ['Wes', 'Sol'];
  await people.Sol.ok('abandonTeam');
  for (const n of rivals) {
    if (!(await people[n].view()).me.isOpen) await people[n].ok('setOpen', { open: true });
    await people.Tao.ok('invite', { toId: await idOf(n) });
  }
  const invs = await Promise.all(rivals.map(async (n) => (await people[n].view()).invitation.id));
  const results = await Promise.all(rivals.map((n, i) => people[n].act('accept', { id: invs[i] })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await people.Tao.view()).team.members.length, 4);

  // One person fires "create a team" and "accept an invitation" together, many times over.
  const loser = rivals[results.findIndex((r) => r.status === 409)];
  await people[loser].ok('setOpen', { open: true });
  await people.Nia.ok('invite', { toId: await idOf(loser) });
  const inv = (await people[loser].view()).invitation.id;
  const burst = await Promise.all([
    people[loser].act('accept', { id: inv }),
    people[loser].act('createTeam', { name: 'Race' }),
    people[loser].act('accept', { id: inv }),
    people[loser].act('createTeam', { name: 'Race 2' }),
  ]);
  assert.equal(burst.filter((r) => r.status === 200).length, 1);
  const seats = seatsOnDisk();
  assert.equal(seats[await idOf(loser)], 1);
  noOneHoldsTwoSeats();
  const state = JSON.parse(readFileSync(h.dataFile, 'utf8'));
  assert.ok(state.teams.every((t) => t.memberIds.length <= 4));
});

test('a closed event accepts no new teams, invitations, memberships, registrations or roster changes', async () => {
  await people.Tao.ok('setShareEmail', { share: true });
  await organizer.ok('setEnrollment', { id: eventId, open: false });
  refused(await people.Quin.act('createTeam', { name: 'Late' }), 409, 'enrollment_closed');
  refused(await people.Tao.act('enroll'), 409, 'enrollment_closed');
  refused(await people.Uma.act('leaveTeam'), 409, 'enrollment_closed');
  refused(await people.Nia.act('abandonTeam'), 409, 'enrollment_closed');
  refused(await people.Nia.act('invite', { toId: await idOf('Quin') }), 409, 'enrollment_closed');
  // Everything stays readable.
  const v = await people.Uma.view();
  assert.equal(v.challenge.enrollmentOpen, false);
  assert.equal(v.team.members.length, 4);
  assert.equal((await h.user().view()).challenge.title, 'First Saturday');
});

test('a new event lets everyone compete again, including the disqualified leader; history is kept', async () => {
  await organizer.ok('unpublish', { id: eventId });
  const second = await h.openEvent('Second Saturday', '2026-12-12');
  const quin = await people.Quin.view();
  assert.equal(quin.me.isIneligible, false);
  await people.Quin.ok('createTeam', { name: 'Quin again' });
  await fill('Quin', ['Lea', 'Mo']);
  assert.deepEqual((await people.Mo.view()).team.members.map((m) => m.displayName), ['Quin', 'Lea', 'Mo']);
  assert.ok(Object.values(seatsOnDisk(second)).every((n) => n === 1));
  // The first event's registration and its dissolved team are still on record.
  const admin = (await organizer.view()).admin;
  assert.equal(admin.challenges.find((c) => c.id === eventId).enrolled[0].name, 'Lea leads');
  const state = JSON.parse(readFileSync(h.dataFile, 'utf8'));
  assert.ok(state.teams.some((t) => t.challengeId === eventId && t.dissolvedAt && t.name === 'Quin leads'));
  assert.deepEqual(state.challenges.find((c) => c.id === eventId).disqualified, [await idOf('Quin')]);
});
