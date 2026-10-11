// End-to-end checks through the HTTP API with separate signed-in users.
// These are the "Success and Evidence" demonstrations of intent/intentv1.md.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, refused, ORG, PW } from './support.mjs';

const h = harness();
const { user, people, idOf, fill, organizer } = h;
const join4 = h.join;

before(() => h.start());
after(() => h.cleanup());

let firstChallenge;

test('the organizer signs in and opens a competition; a visitor can see it without logging in', async () => {
  refused(await organizer.login(ORG.email, 'wrong-password'), 401, 'bad_login');
  const r = await organizer.login(ORG.email, ORG.password);
  assert.equal(r.view.role, 'organizer');
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Lax/);
  let v = await organizer.ok('saveChallenge', { title: 'First Saturday', preview: 'Build a help desk.', date: '2026-11-14' });
  firstChallenge = v.admin.challenges[0].id;
  await organizer.ok('publish', { id: firstChallenge });

  const visitor = await user().view();
  assert.equal(visitor.role, 'visitor');
  assert.equal(visitor.challenge.title, 'First Saturday');
  assert.equal(visitor.challenge.enrollmentOpen, true);
  assert.deepEqual(Object.keys(visitor).sort(), ['challenge', 'demo', 'role']);
});

test('nothing can be done without an account', async () => {
  const anon = user();
  for (const type of ['createTeam', 'setOpen', 'invite', 'accept', 'enroll', 'abandonTeam', 'leaveTeam']) {
    refused(await anon.act(type, { id: 'x', toId: 'x', open: true }), 401, 'participants_only');
  }
  refused(await anon.act('saveChallenge', { title: 'Sneaky' }), 401, 'organizer_only');
});

test('a participant registers, logs in again, and opts in to the competition', async () => {
  await join4(['Ada', 'Ben', 'Cy', 'Di', 'Eve', 'Flo']);
  const ada = people.Ada;
  let v = await ada.view();
  assert.equal(v.role, 'participant');
  assert.equal(v.me.isOpen, false);
  await ada.logout();
  assert.equal((await ada.view()).role, 'visitor');
  refused(await ada.login('ada@example.com', 'not-my-password'), 401, 'bad_login');
  refused(await ada.login('nobody@example.com'), 401, 'bad_login');
  assert.equal((await ada.login('ADA@example.com')).view.me.displayName, 'Ada');
  v = await ada.ok('setOpen', { open: true });
  assert.equal(v.me.isOpen, true);
  await ada.ok('setOpen', { open: false });

  refused(await user().register('Ada'), 409, 'email_unavailable');
  refused(await user().call('/api/register', { email: ORG.email, password: PW, displayName: 'X', skills: ['a'] }), 409, 'email_unavailable');
  refused(await user().call('/api/register', { email: 'short@example.com', password: 'short', displayName: 'X', skills: ['a'] }), 400, 'bad_password');
  refused(await user().call('/api/register', { email: 'nope', password: PW, displayName: 'X', skills: ['a'] }), 409, 'bad_email');
});

test('passwords are stored hashed and never returned', async () => {
  const file = readFileSync(h.dataFile, 'utf8');
  assert.ok(!file.includes(PW));
  const acct = JSON.parse(file).accounts[0];
  assert.deepEqual(Object.keys(acct).sort(), ['email', 'hash', 'participantId', 'salt']);
  assert.ok(!JSON.stringify(await people.Ada.view()).includes(acct.hash));
});

test('a team is created, others are invited and must accept; four members make it READY', async () => {
  const ada = people.Ada;
  let v = await ada.ok('createTeam', { name: 'Team Ada' });
  assert.equal(v.team.status, 'FORMING');

  // Being invited does not make Ben a member.
  await people.Ben.ok('setOpen', { open: true });
  await ada.ok('invite', { toId: await idOf('Ben') });
  let ben = await people.Ben.view();
  assert.equal(ben.team, null);
  assert.equal(ben.invitation.teamName, 'Team Ada');
  assert.equal((await ada.view()).team.members.length, 1);
  v = await people.Ben.ok('accept', { id: ben.invitation.id });
  assert.equal(v.team.members.length, 2);
  // Once committed, Ben is no longer available to other teams.
  assert.ok(!(await people.Eve.view()).people.some((p) => p.displayName === 'Ben'));

  await fill('Ada', ['Cy', 'Di']);
  v = await ada.view();
  assert.equal(v.team.status, 'READY');
  assert.equal(v.team.canEnroll, true);
  assert.equal((await people.Di.view()).team.canEnroll, false);
});

test('someone committed to a team cannot create or join another in the same competition', async () => {
  const eve = people.Eve;
  await eve.ok('createTeam', { name: 'Team Eve' });
  refused(await people.Ben.act('createTeam', { name: 'Second' }), 409, 'already_on_team');
  refused(await people.Ben.act('setOpen', { open: true }), 409, 'already_committed');
  refused(await eve.act('invite', { toId: await idOf('Ben') }), 409, 'not_discoverable');
  const state = JSON.parse(readFileSync(h.dataFile, 'utf8'));
  const benId = await idOf('Ben');
  assert.equal(state.teams.filter((t) => t.memberIds.includes(benId)).length, 1);
});

test('the server decides who is acting; another user cannot act on your invitation or team', async () => {
  const eve = people.Eve, flo = people.Flo;
  await flo.ok('setOpen', { open: true });
  await eve.ok('invite', { toId: await idOf('Flo') });
  const inv = (await flo.view()).invitation;
  // Ada tries to accept, decline and withdraw an invitation that is not hers, naming Flo in the request.
  for (const type of ['accept', 'decline', 'withdraw']) {
    refused(await people.Ada.act(type, { id: inv.id, participantId: await idOf('Flo'), recipientId: await idOf('Flo') }), 409, 'not_yours');
  }
  // Only the creator may enroll, and a participant cannot use organizer actions.
  refused(await people.Ben.act('enroll'), 409, 'not_leader');
  refused(await people.Ada.act('setEnrollment', { id: firstChallenge, open: false }), 403, 'organizer_only');
  refused(await people.Ada.act('publish', { id: firstChallenge }), 403, 'organizer_only');
  refused(await organizer.act('createTeam', { name: 'Org team' }), 403, 'participants_only');
  refused(await people.Ada.act('dropEverything'), 400, 'unknown_action');
  // A forged or cross-site request is refused.
  refused(await people.Ada.call('/api/action', { type: 'enroll' }, { Origin: 'https://evil.example' }), 403, 'bad_origin');
  assert.equal((await user().call('/api/view', undefined)).view.role, 'visitor');
  await flo.ok('decline', { id: inv.id });
});

test('private information stays private between signed-in users', async () => {
  const emails = (v) => [...new Set(JSON.stringify(v).match(/[\w.+-]+@[\w.-]+/g) ?? [])].filter((e) => e !== ORG.email);
  // A teammate sees no email until its owner shares it.
  assert.deepEqual(emails(await people.Ada.view()), ['ada@example.com']);
  await people.Ben.ok('setShareEmail', { share: true });
  assert.deepEqual(emails(await people.Ada.view()).sort(), ['ada@example.com', 'ben@example.com']);
  // Someone on another team sees neither, and nothing about Team Ada.
  const eve = await people.Eve.view();
  assert.deepEqual(emails(eve), ['eve@example.com']);
  assert.ok(!JSON.stringify(eve).includes('Team Ada'));
  // Discovery carries only name, picture, skills and availability.
  for (const p of eve.people) {
    assert.deepEqual(Object.keys(p).sort(), ['availability', 'avatar', 'displayName', 'id', 'inviteBlock', 'skills']);
  }
  assert.deepEqual(emails(await organizer.view()), []);
  assert.deepEqual(emails(await user().view()), []);
});

test('a READY team joins the competition, is ENROLLED, and the organizer is notified', async () => {
  const v = await people.Ada.ok('enroll');
  assert.equal(v.team.status, 'ENROLLED');
  assert.equal(v.team.members.length, 4);
  assert.equal((await people.Cy.view()).team.status, 'ENROLLED');
  refused(await people.Ada.act('enroll'), 409, 'already_enrolled');

  const admin = (await organizer.view()).admin;
  assert.equal(admin.notifications.length, 1);
  assert.equal(admin.notifications[0].teamName, 'Team Ada');
  assert.deepEqual(admin.challenges[0].enrolled[0].members.sort(), ['Ada', 'Ben', 'Cy', 'Di']);
  assert.ok(h.logs.some((l) => l.includes('[notify] Team "Team Ada" enrolled in "First Saturday"')));
  assert.equal((await organizer.ok('markSeen')).admin.notifications.length, 0);
});

test('closing enrollment stops new teams, new members and new enrollments; viewing still works', async () => {
  await people.Flo.ok('setOpen', { open: false });
  await organizer.ok('setEnrollment', { id: firstChallenge, open: false });
  refused(await people.Flo.act('createTeam', { name: 'Late' }), 409, 'enrollment_closed');
  refused(await people.Flo.act('setOpen', { open: true }), 409, 'enrollment_closed');
  refused(await people.Eve.act('invite', { toId: await idOf('Flo') }), 409, 'enrollment_closed');
  const v = await people.Ada.view();
  assert.equal(v.challenge.enrollmentOpen, false);
  assert.equal(v.team.status, 'ENROLLED');
  assert.equal((await user().view()).challenge.title, 'First Saturday');
});

test('the next competition starts clean and the same people can take part again', async () => {
  let v = await organizer.ok('saveChallenge', { title: 'Second Saturday', preview: 'Build a scheduler.', date: '2026-12-12' });
  const second = v.admin.challenges.find((c) => c.title === 'Second Saturday').id;
  refused(await organizer.act('publish', { id: second }), 409, 'another_live');
  await organizer.ok('unpublish', { id: firstChallenge });
  assert.equal((await user().view()).challenge, null);
  await organizer.ok('publish', { id: second });

  const ben = await people.Ben.view();
  assert.equal(ben.challenge.title, 'Second Saturday');
  assert.equal(ben.team, null);
  assert.equal(ben.me.isCommitted, false);
  v = await people.Ben.ok('createTeam', { name: 'Team Ben' });
  assert.equal(v.team.status, 'FORMING');
  await fill('Ben', ['Ada']);
  assert.deepEqual((await people.Ada.view()).team.members.map((m) => m.displayName), ['Ben', 'Ada']);
  // The first competition's enrollment is still on record for the organizer.
  const admin = (await organizer.view()).admin;
  assert.equal(admin.challenges.find((c) => c.id === firstChallenge).enrolled.length, 1);
});

test('state is shared and durable: it survives a restart, and sessions do not', async () => {
  await h.stop();
  await h.start();
  assert.equal((await people.Ada.view()).role, 'visitor');
  const again = user();
  const v = (await again.login('ada@example.com')).view;
  assert.equal(v.team.name, 'Team Ben');
});

test('repeated wrong passwords are slowed down', async () => {
  const u = user();
  for (let i = 0; i < 10; i++) refused(await u.login('cy@example.com', `guess-${i}`), 401, 'bad_login');
  refused(await u.login('cy@example.com', PW), 429, 'too_many_attempts');
});

test('only the public folder is served', async () => {
  for (const path of ['/', '/app.js', '/styles.css']) assert.equal((await fetch(h.base + path)).status, 200);
  for (const path of ['/domain.js', '/data/demo.json', '/../package.json', '/%2e%2e/var/state.json', '/server.mjs']) {
    assert.equal((await fetch(h.base + path)).status, 404, path);
  }
});
