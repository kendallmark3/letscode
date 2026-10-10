// The HTTP application: static files, accounts, and the API through which every
// rule in domain.js is applied to the one authoritative state.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import * as D from './domain.js';
import { Attempts, Sessions, hashPassword, sameSecret, validPassword, verifyPassword, MIN_PASSWORD } from './auth.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
const MAX_BODY = 256 * 1024;
const COOKIE = 'sid';
const AVATAR = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// What a signed-in participant may do. The actor is always the session's own id.
const PARTICIPANT_ACTIONS = {
  createTeam: (s, id, a, now) => D.createTeam(s, id, a.name, now),
  abandonDraft: (s, id, a, now) => D.abandonDraft(s, id, now),
  invite: (s, id, a, now) => D.invite(s, id, String(a.toId), now),
  withdraw: (s, id, a, now) => D.withdraw(s, String(a.id), id, now),
  accept: (s, id, a, now) => D.accept(s, String(a.id), id, now, { abandonDraft: a.abandonDraft === true }),
  decline: (s, id, a, now) => D.decline(s, String(a.id), id, now),
  setOpen: (s, id, a, now) => D.setOpen(s, id, a.open === true, now),
  setShareEmail: (s, id, a) => D.setShareEmail(s, id, a.share === true),
  enroll: (s, id, a, now) => D.enrollTeam(s, id, now),
};

const ORGANIZER_ACTIONS = {
  saveChallenge: (s, a) => D.saveChallenge(s, { id: a.id, title: a.title, preview: a.preview, date: a.date }),
  publish: (s, a) => D.publishChallenge(s, String(a.id)),
  unpublish: (s, a) => D.unpublishChallenge(s, String(a.id)),
  deleteChallenge: (s, a) => D.deleteChallenge(s, String(a.id)),
  setEnrollment: (s, a) => D.setEnrollment(s, String(a.id), a.open === true),
  markSeen: (s) => D.markNotificationsSeen(s),
};

export function createApp({
  dataFile,
  publicDir,
  organizerEmail,
  organizerPassword,
  seed = null, // { demo, password } to start a new data file with fictional accounts
  secureCookies = false,
  now = Date.now,
  log = console.log,
}) {
  const orgEmail = organizerEmail.trim().toLowerCase();
  const sessions = new Sessions({ now });
  const attempts = new Attempts({ now });
  let state = load();

  function load() {
    if (existsSync(dataFile)) {
      const saved = JSON.parse(readFileSync(dataFile, 'utf8'));
      if (saved.version !== 3) throw new Error(`${dataFile} is not a version 3 data file.`);
      return saved;
    }
    if (!seed) return D.createEmptyState();
    const s = D.createInitialState(seed.demo);
    s.accounts = s.participants.map((p) => ({ participantId: p.id, email: p.email.toLowerCase(), ...hashPassword(seed.password) }));
    return s;
  }

  // Requests are handled one at a time on a single thread, so read-check-write
  // inside one synchronous step cannot interleave with another user's action.
  function commit(next) {
    if (next === state) return;
    mkdirSync(dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(next));
    renameSync(tmp, dataFile);
    state = next;
  }

  const viewFor = (identity) => ({
    ...D.viewFor(state, identity),
    demo: seed ? { password: seed.password, organizerEmail: orgEmail, organizerPassword } : null,
  });

  function cookie(token, maxAgeSeconds) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureCookies ? '; Secure' : ''}`;
  }

  const tokenOf = (req) =>
    (req.headers.cookie ?? '')
      .split(';')
      .map((c) => c.trim().split('='))
      .find(([name]) => name === COOKIE)?.[1] ?? null;

  // A session for an account that no longer exists is treated as signed out.
  function identityOf(req) {
    const identity = sessions.get(tokenOf(req));
    if (identity?.participantId && !D.findPerson(state, identity.participantId)) return null;
    return identity;
  }

  async function readJson(req) {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
      throw new HttpError(415, 'bad_request', 'Send JSON.');
    }
    // Browsers attach Origin to cross-site POSTs; refuse any that is not this site.
    const origin = req.headers.origin;
    if (origin && !origin.endsWith(`://${req.headers.host}`)) throw new HttpError(403, 'bad_origin', 'Request refused.');
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, 'too_large', 'That is too large to send. Try a smaller picture.');
      chunks.push(chunk);
    }
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (body && typeof body === 'object' && !Array.isArray(body)) return body;
    } catch {
      // fall through
    }
    throw new HttpError(400, 'bad_request', 'That request could not be read.');
  }

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }

  function signIn(res, identity) {
    const token = sessions.create(identity);
    send(res, 200, { view: viewFor(identity) }, { 'Set-Cookie': cookie(token, 7 * 24 * 60 * 60) });
  }

  function register(body, res) {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!validPassword(body.password)) throw new HttpError(400, 'bad_password', `Choose a password of at least ${MIN_PASSWORD} characters.`);
    const avatar =
      body.avatar?.type === 'image' && typeof body.avatar.value === 'string' && body.avatar.value.length < 80_000 && AVATAR.test(body.avatar.value)
        ? { type: 'image', value: body.avatar.value }
        : undefined;
    // Validates name, email and skills before any account is recorded.
    const next = D.addParticipant(state, {
      email,
      displayName: body.displayName,
      skills: Array.isArray(body.skills) ? body.skills : [],
      avatar,
    });
    // Says nothing about whether the address is already registered to someone else.
    if (email === orgEmail || state.accounts.some((a) => a.email === email)) {
      throw new HttpError(409, 'email_unavailable', 'That email cannot be used for a new account. If it is yours, log in instead.');
    }
    const participantId = next.participants.at(-1).id;
    next.accounts.push({ participantId, email, ...hashPassword(body.password) });
    commit(next);
    signIn(res, { participantId });
  }

  function login(body, req, res) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const key = `${req.socket.remoteAddress}|${email}`;
    if (attempts.blocked(key)) throw new HttpError(429, 'too_many_attempts', 'Too many attempts. Wait a few minutes and try again.');
    let identity = null;
    if (email === orgEmail) {
      if (sameSecret(password, organizerPassword)) identity = { organizer: true };
    } else {
      const account = state.accounts.find((a) => a.email === email);
      // Hash even for an unknown address so the response time does not reveal which emails have accounts.
      const ok = verifyPassword(password, account ?? DUMMY);
      if (account && ok) identity = { participantId: account.participantId };
    }
    if (!identity) {
      attempts.fail(key);
      throw new HttpError(401, 'bad_login', 'Email or password is incorrect.');
    }
    attempts.clear(key);
    signIn(res, identity);
  }

  function action(body, identity, res) {
    const type = String(body.type ?? '');
    let next;
    if (Object.hasOwn(PARTICIPANT_ACTIONS, type)) {
      if (!identity?.participantId) throw new HttpError(identity ? 403 : 401, 'participants_only', 'Log in as a participant to do that.');
      next = PARTICIPANT_ACTIONS[type](state, identity.participantId, body, now());
    } else if (Object.hasOwn(ORGANIZER_ACTIONS, type)) {
      if (!identity?.organizer) throw new HttpError(identity ? 403 : 401, 'organizer_only', 'Only the organizer can do that.');
      next = ORGANIZER_ACTIONS[type](state, body);
    } else {
      throw new HttpError(400, 'unknown_action', 'That action is not recognised.');
    }
    const enrolled = type === 'enroll' ? next.notifications.at(-1) : null;
    commit(next);
    if (enrolled) {
      // The organizer's notice is the entry on the admin screen; this line is for the operator's log.
      log(`[notify] Team "${next.teams.find((t) => t.id === enrolled.teamId).name}" enrolled in "${D.liveChallenge(next).title}".`);
    }
    send(res, 200, { view: viewFor(identity) });
  }

  async function api(req, res, path) {
    commit(D.sweep(state, now()));
    if (req.method === 'GET' && path === '/api/view') return send(res, 200, { view: viewFor(identityOf(req)) });
    if (req.method !== 'POST') throw new HttpError(404, 'not_found', 'Not found.');
    const body = await readJson(req);
    if (path === '/api/register') return register(body, res);
    if (path === '/api/login') return login(body, req, res);
    if (path === '/api/logout') {
      sessions.destroy(tokenOf(req));
      return send(res, 200, { view: viewFor(null) }, { 'Set-Cookie': cookie('', 0) });
    }
    if (path === '/api/action') return action(body, identityOf(req), res);
    throw new HttpError(404, 'not_found', 'Not found.');
  }

  async function serveStatic(res, path) {
    const file = normalize(join(publicDir, path === '/' ? 'index.html' : path));
    try {
      if (!file.startsWith(publicDir + sep)) throw new Error('outside public');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  }

  async function handler(req, res) {
    let path;
    try {
      path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!path.startsWith('/api/')) return serveStatic(res, path);
    try {
      await api(req, res, path);
    } catch (e) {
      // A refused rule is a normal outcome: report it and leave the state untouched.
      if (e instanceof D.DomainError) return send(res, 409, { error: { code: e.code, message: e.message } });
      if (e instanceof HttpError) return send(res, e.status, { error: { code: e.code, message: e.message } });
      log(e);
      send(res, 500, { error: { code: 'server_error', message: 'Something went wrong. Try again.' } });
    }
  }

  return { handler, getState: () => state };
}

const DUMMY = hashPassword('no-such-account');
