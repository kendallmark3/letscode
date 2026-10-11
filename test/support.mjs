// Runs the real server on a random port with a temporary data file, and gives
// each test "browser" its own session cookie.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server-app.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
export const ORG = { email: 'organizer@example.com', password: 'organizer-test-pw' };
export const PW = 'correct-horse-9';

export const refused = (r, status, code) => {
  assert.equal(r.status, status, JSON.stringify(r.error));
  assert.equal(r.error.code, code);
};

export function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'letscode-'));
  const h = { dataFile: join(dir, 'state.json'), base: '', logs: [], people: {} };
  let server;

  h.start = () => {
    h.logs = [];
    const app = createApp({ dataFile: h.dataFile, publicDir, organizerEmail: ORG.email, organizerPassword: ORG.password, log: (m) => h.logs.push(String(m)) });
    server = createServer(app.handler);
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
      h.base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    }));
  };
  h.stop = () => new Promise((resolve) => server.close(resolve));
  h.cleanup = async () => {
    await h.stop();
    rmSync(dir, { recursive: true, force: true });
  };

  // One browser: keeps its own session cookie.
  h.user = () => {
    let cookie = '';
    const call = async (path, body, headers = {}) => {
      const res = await fetch(h.base + path, body === undefined
        ? { headers: { cookie } }
        : { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, ...headers }, body: JSON.stringify(body) });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const json = await res.json();
      return { status: res.status, view: json.view, error: json.error, setCookie: set };
    };
    const u = {
      call,
      view: async () => (await call('/api/view')).view,
      act: (type, args = {}) => call('/api/action', { type, ...args }),
      // Expect success and return the new view.
      ok: async (type, args) => {
        const r = await u.act(type, args);
        assert.equal(r.status, 200, `${type}: ${r.error?.message}`);
        return r.view;
      },
      register: (name, skills = ['Testing']) =>
        call('/api/register', { email: `${name.toLowerCase()}@example.com`, password: PW, displayName: name, skills }),
      login: (email, password = PW) => call('/api/login', { email, password }),
      logout: () => call('/api/logout', {}),
    };
    return u;
  };

  h.join = async (names) => {
    for (const n of names) {
      h.people[n] = h.user();
      const r = await h.people[n].register(n);
      assert.equal(r.status, 200, r.error?.message);
    }
  };
  h.idOf = async (n) => (await h.people[n].view()).me.id;

  // The leader invites each person; each opts in (if needed) and accepts.
  h.fill = async (leader, others) => {
    for (const n of others) {
      if (!(await h.people[n].view()).me.isOpen) await h.people[n].ok('setOpen', { open: true });
      await h.people[leader].ok('invite', { toId: await h.idOf(n) });
      const inv = (await h.people[n].view()).invitation;
      await h.people[n].ok('accept', { id: inv.id });
    }
  };

  h.organizer = h.user();
  // Signs the organizer in and makes one event live. Returns its id.
  h.openEvent = async (title = 'First Saturday', date = '2026-11-14') => {
    if ((await h.organizer.view()).role !== 'organizer') await h.organizer.login(ORG.email, ORG.password);
    const v = await h.organizer.ok('saveChallenge', { title, preview: 'Build something.', date });
    const id = v.admin.challenges.find((c) => c.title === title).id;
    await h.organizer.ok('publish', { id });
    return id;
  };
  return h;
}
