// Behind a proxy, rate limits follow the visitor's address, not the proxy's.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { harness, refused } from './support.mjs';

const h = harness({ trustProxy: true });
before(() => h.start());
after(() => h.cleanup());

const ask = { name: 'Dana', company: 'Northwind', email: 'dana@northwind.example' };

test('the inquiry limit is per visitor address, taken from the entry the proxy appended', async () => {
  const u = h.user();
  const from = (chain) => u.call('/api/inquiry', ask, { 'X-Forwarded-For': chain });
  for (let i = 0; i < 5; i++) assert.equal((await from('203.0.113.7')).status, 200);
  refused(await from('203.0.113.7'), 429, 'too_many_inquiries');
  // A different visitor through the same proxy is unaffected.
  assert.equal((await from('198.51.100.9')).status, 200);
  // Pretending to be someone else by adding entries in front does not help.
  refused(await from('198.51.100.9, 203.0.113.7'), 429, 'too_many_inquiries');
});
