// The admin APIs behind jkr/index.html: header-only token auth, constant-time
// compare, and no data without the token. No network: fetch is stubbed.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
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

// The job card: the four order flow actions, each posted through the one helper that sends the token header.
const dash = fs.readFileSync(path.join(ROOT, 'jkr/index.html'), 'utf8');
for (const a of ['finish', 'declined', 'cancel-refund', 'en-route']) {
  ok(dash.includes(`data-action="${a}"`), `jkr/index.html: no data-action="${a}" button`);
  ok(dash.includes(`jobAction('${a}'`) || dash.includes(`action: '${a}'`) || dash.includes(`action:'${a}'`), `jkr/index.html: ${a} is never posted`);
}
ok(!dash.includes('data-action="late-fee"') && !dash.includes("jobAction('late-fee'"), 'jkr/index.html: still charges a late fee (pay at booking keeps it from the refund)');
for (const label of ['On my way', 'Finish', 'Cancel and refund', 'Customer said no']) ok(dash.includes(label), `jkr/index.html: no "${label}" action`);
// Ruling R18: the money buttons ask in the page, never with a browser dialog, and are disabled while a request is in flight.
{
  const a = dash.indexOf('// ── order flow job card'), b = dash.indexOf('function visitRow(');
  const card = a >= 0 && b > a ? dash.slice(a, b) : '';
  ok(card.length > 0, 'jkr/index.html: the order flow job card block is not where the test looks');
  ok(!/\b(alert|confirm|prompt)\s*\(/.test(card), 'jkr/index.html: a job card action uses alert, confirm or prompt');
  for (const [what, re] of [['the finish result', /Charge \$|Charge '\s*\+/], ['a refund', /Refund /], ['no change', /No change/]]) ok(re.test(card), `jkr/index.html: the finish step does not show ${what}`);
  ok(/disabled/.test(card) && /busy/.test(card), 'jkr/index.html: the money buttons are not disabled while in flight');
}
ok(/'x-admin-token'\s*:\s*apiToken\(\)/.test(dash), 'jkr/index.html: the post helper does not send x-admin-token');
ok(!/[?&]token=/.test(dash), 'jkr/index.html: has a ?token= URL form');
{
  const fn = dash.match(/function smsLink\(phone\)\{[\s\S]*?\n  \}/);
  ok(!!fn, 'jkr/index.html: no smsLink function');
  if (fn) {
    const smsLink = new Function(fn[0] + '; return smsLink;')();
    const body = '?&body=' + encodeURI('On our way, about 20 minutes');
    ok(smsLink('5035550100?&body=x,15550001111') === 'sms:5035550100' + body, 'smsLink did not strip a hostile phone');
    ok(smsLink('(503) 555-0100') === 'sms:5035550100' + body, 'smsLink mangled a normal phone');
    ok(smsLink('+1 503 555 0100;5') === 'sms:+15035550100' + body, 'smsLink kept a stray separator');
    ok(smsLink('555') === null && smsLink(null) === null, 'smsLink built a link from a short phone');
  }
}
ok(dash.includes('js/order-config.js'), 'jkr/index.html: does not load js/order-config.js');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
