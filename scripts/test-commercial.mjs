// The commercial request form's API: validation, the honeypot, delivery to
// the founder (database row, Discord, email), the travel zone in the notes,
// and an honest error when nothing reached the founder. No network.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ZIPS, ZIP_ZONES } from '../pricing.config.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

// Stand-ins: sendEmail records; fetch records (Supabase and Discord).
const emails = [], fetches = [];
let emailResult = { ok: true };
const Module = require('node:module');
const load = Module._load;
Module._load = function (req, ...rest) {
  if (req === './_lib/email') return { sendEmail: async (m) => { emails.push(m); return emailResult; } };
  return load.call(this, req, ...rest);
};
let fetchOk = true;
globalThis.fetch = async (url, init) => { fetches.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null }); return { ok: fetchOk, status: fetchOk ? 201 : 500, text: async () => '' }; };

const handler = require(path.join(ROOT, 'api/commercial-lead.js'));
let ip = 0;
async function call(body, env = {}) {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPS_WEBHOOK_URL', 'OPS_EMAIL']) delete process.env[k];
  Object.assign(process.env, env);
  emails.length = 0; fetches.length = 0;
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: { 'x-forwarded-for': `10.1.0.${++ip}`, 'user-agent': 'test' }, body }, res);
  return { status, json };
}
const ALL = { SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_ROLE_KEY: 'k', OPS_WEBHOOK_URL: 'https://discord.invalid/hook', OPS_EMAIL: 'owner@example.com' };
const z2 = ALL_ZIPS.find((z) => ZIP_ZONES[z].cents > 0);
const good = (over = {}) => ({
  first_name: 'Dana', last_name: 'Reyes', title: 'Property manager', email: 'dana@example.org', phone: '503 555 0199',
  company: 'Elm Street Apartments', address: '100 Elm St, Portland', zip: z2, property_type: 'Apartments',
  how_often: 'Monthly', size: '48 units', notes: 'Unit turnovers, mostly furniture and mattresses.', ...over,
});

console.log('== validation ==');
ok((await call(good({ email: '' }), ALL)).status === 400, 'a request with no email was accepted');
ok((await call(good({ email: 'dana@' }), ALL)).status === 400, 'a bad email was accepted');
ok((await call(good({ company: '' }), ALL)).status === 400, 'a request with no company was accepted');
ok(fetches.length === 0 && emails.length === 0, 'a refused request still reached a channel');

console.log('== honeypot ==');
const hp = await call(good({ website: 'http://spam.example' }), ALL);
ok(hp.status === 200 && hp.json.ok === true, 'the honeypot did not answer 200');
ok(fetches.length === 0 && emails.length === 0, 'a bot request reached a channel');

console.log('== delivery ==');
let r = await call(good(), ALL);
ok(r.status === 200 && r.json.ok === true && r.json.stored === true, `delivery failed: ${JSON.stringify(r.json)}`);
const row = (fetches.find((f) => f.url.includes('/rest/v1/leads')) || {}).body;
ok(row && row.service === 'commercial' && row.email === 'dana@example.org' && row.zip === z2, `lead row wrong: ${JSON.stringify(row)}`);
ok(row && /Elm Street Apartments/.test(row.notes) && /Apartments/.test(row.notes) && /Monthly/.test(row.notes), 'the notes lack the company, type or how often');
ok(row && row.notes.includes(ZIP_ZONES[z2].label), 'the notes do not name the travel zone');
ok(fetches.some((f) => f.url.includes('discord')), 'no Discord ping');
const mail = emails[0];
ok(mail && mail.to === 'owner@example.com' && mail.replyTo === 'dana@example.org', 'the owner email is missing or does not reply to the customer');
ok(mail && /Elm Street Apartments/.test(mail.subject) && !/[—–]/.test(mail.subject), `owner subject: ${mail && mail.subject}`);

console.log('== zones ==');
r = await call(good({ zip: '98601x' }), ALL);
ok(r.status === 400, 'a malformed ZIP was accepted');
const far = Object.keys(ZIP_ZONES).length ? '97106' : '';
r = await call(good({ zip: far }), ALL);
const farRow = (fetches.find((f) => f.url.includes('/rest/v1/leads')) || {}).body;
ok(r.status === 200 && farRow && /past our travel zones/.test(farRow.notes), 'a ZIP past the zones is not flagged for a hand quote');

console.log('== nothing reached the founder ==');
emailResult = { ok: true, skipped: true };   // no RESEND_API_KEY: a dry run is not a delivery
r = await call(good(), {});
ok(r.status === 502 && /call or text/i.test(r.json.error), `an undelivered request did not say so: ${r.status} ${JSON.stringify(r.json)}`);
emailResult = { ok: true };

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
