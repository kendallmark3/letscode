// Password hashing and login sessions, using only Node's built-in crypto.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

export const validPassword = (pw) => typeof pw === 'string' && pw.length >= MIN_PASSWORD && pw.length <= MAX_PASSWORD;

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

export function verifyPassword(password, { salt, hash }) {
  const given = scryptSync(String(password), salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return given.length === stored.length && timingSafeEqual(given, stored);
}

const digest = (value) => createHash('sha256').update(String(value)).digest();

// Constant-time comparison for a secret that is not stored hashed (the organizer password).
export const sameSecret = (a, b) => timingSafeEqual(digest(a), digest(b));

// Sessions live in memory: a restart signs everyone out, and nothing secret is written to disk.
// Only a hash of each token is kept, so a memory dump does not yield usable cookies.
export class Sessions {
  #byHash = new Map();
  #ttlMs;
  #now;

  constructor({ ttlMs = 7 * 24 * 60 * 60 * 1000, now = Date.now } = {}) {
    this.#ttlMs = ttlMs;
    this.#now = now;
  }

  create(identity) {
    const token = randomBytes(32).toString('base64url');
    this.#byHash.set(digest(token).toString('hex'), { identity, expiresAt: this.#now() + this.#ttlMs });
    return token;
  }

  get(token) {
    if (!token) return null;
    const key = digest(token).toString('hex');
    const session = this.#byHash.get(key);
    if (!session) return null;
    if (session.expiresAt <= this.#now()) {
      this.#byHash.delete(key);
      return null;
    }
    return session.identity;
  }

  destroy(token) {
    if (token) this.#byHash.delete(digest(token).toString('hex'));
  }
}

// Slows password guessing: a fixed number of failures per key within a window.
export class Attempts {
  #byKey = new Map();
  #max;
  #windowMs;
  #now;

  constructor({ max = 10, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
    this.#max = max;
    this.#windowMs = windowMs;
    this.#now = now;
  }

  blocked(key) {
    const entry = this.#byKey.get(key);
    if (entry && entry.resetAt <= this.#now()) this.#byKey.delete(key);
    return (this.#byKey.get(key)?.count ?? 0) >= this.#max;
  }

  fail(key) {
    const entry = this.#byKey.get(key) ?? { count: 0, resetAt: this.#now() + this.#windowMs };
    entry.count += 1;
    this.#byKey.set(key, entry);
  }

  clear(key) {
    this.#byKey.delete(key);
  }
}
