// The admin APIs behind jkr/index.html: header-only token auth, constant-time
// compare, and no data without the token. No network: fetch is stubbed.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
Object.assign(process.env, { ADMIN_DASHBOARD_TOKEN: 'right-token', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
globalThis.fetch = async () => ({ ok: true, json: async () => [] });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
async function call(file, { method = 'GET', headers = {}, url = '/', body } = {}) {
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await require(path.join(ROOT, file))({ method, headers, url, query: {}, body }, res);
  return { status, json };
}

for (const file of ['api/admin-data.js', 'api/visit-update.js', 'api/visit-photo.js']) {
  const method = file === 'api/admin-data.js' ? 'GET' : 'POST';
  const body = { action: 'start', visitId: 'v1', kind: 'before' };
  ok((await call(file, { method, body })).status === 401, `${file}: no token was let in`);
  ok((await call(file, { method, body, headers: { 'x-admin-token': 'wrong' } })).status === 401, `${file}: wrong token was let in`);
  // A token in the URL must never work (it leaks into history and logs).
  ok((await call(file, { method, body, url: '/?token=right-token' })).status === 401, `${file}: ?token= in the URL was accepted`);
}
const good = await call('api/admin-data.js', { headers: { 'x-admin-token': 'right-token' } });
ok(good.status === 200 && Array.isArray(good.json.customers), 'right token did not return data');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
