// Entry point. No dependencies.
//   npm start      real mode: empty data file, accounts are created by registering
//   npm run demo   fictional accounts and a sample challenge, in a separate data file
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/server-app.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const env = process.env;
const demo = env.DEMO === '1';
const port = Number(env.PORT) || 4747;
const host = env.HOST || '127.0.0.1';

const organizerEmail = env.ORGANIZER_EMAIL || 'organizer@example.com';
// Without a configured password, a fresh one is made for this run and shown once below.
const organizerPassword = env.ORGANIZER_PASSWORD || (demo ? 'organizer-demo' : randomBytes(12).toString('base64url'));

const app = createApp({
  dataFile: env.DATA_FILE || join(root, 'var', demo ? 'demo-state.json' : 'state.json'),
  publicDir: join(root, 'public'),
  organizerEmail,
  organizerPassword,
  seed: demo ? { demo: JSON.parse(readFileSync(join(root, 'data', 'demo.json'), 'utf8')), password: 'letscode-demo' } : null,
  secureCookies: env.SECURE_COOKIES === '1',
});

createServer(app.handler).listen(port, host, () => {
  console.log(`Let's Go! running at http://localhost:${port}${demo ? '  (demo data)' : ''}`);
  console.log(`Organizer login: ${organizerEmail}`);
  if (!env.ORGANIZER_PASSWORD) console.log(`Organizer password${demo ? ' (demo)' : ' for this run'}: ${organizerPassword}`);
  if (demo) console.log('Participant logins: participant1@example.com … participant10@example.com, password letscode-demo');
});
