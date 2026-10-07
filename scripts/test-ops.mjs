// Travel reaches the owner and the customer after payment: the Discord ping,
// the confirmation email, and the row the dashboard reads. No network.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
delete process.env.SUPABASE_URL;
const { buildDiscordEmbed, travelLine } = require('../api/stripe-webhook.js');
const tpl = require('../api/_lib/email-templates.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

console.log('== Discord ==');
const m = { plan: 'one_time', load: '1/2 truck', zone: 'z2', zone_label: 'Zone 2', travel_cents: '2500', miles: '16.8' };
const e = buildDiscordEmbed({ metadata: m }, { kind: 'signup_or_payment', amount: 37400 });
const f = e.embeds[0].fields.find((x) => x.name === 'Travel');
ok(f && /Zone 2/.test(f.value) && /\$25\.00/.test(f.value) && /16\.8 mi/.test(f.value), `Discord travel field is ${JSON.stringify(f)}`);
const home = buildDiscordEmbed({ metadata: { ...m, zone: 'home', zone_label: 'Home zone', travel_cents: '0', miles: '3.1' } }, { kind: 'signup_or_payment', amount: 34900 });
ok(/no travel charge/i.test((home.embeds[0].fields.find((x) => x.name === 'Travel') || {}).value || ''), 'a home zone booking does not say no travel charge');
const old = buildDiscordEmbed({ metadata: { plan: 'one_time', load: '1/2 truck' } }, { kind: 'signup_or_payment', amount: 34900 });
ok(!old.embeds[0].fields.some((x) => x.name === 'Travel'), 'a booking from before travel zones shows an empty travel field');

console.log('== email ==');
ok(travelLine(m) === 'Zone 2: $25.00', `travelLine is "${travelLine(m)}"`);
ok(travelLine({}) === null, 'travelLine without travel metadata is not null');
const mail = tpl.bookingConfirmation({ name: 'Jane', load: '1/2 truck', travel: travelLine(m), amount: '$374.00' });
ok(/Travel/.test(mail.html) && /Zone 2: \$25\.00/.test(mail.html), 'confirmation email html has no travel line');
ok(/Travel: Zone 2: \$25\.00/.test(mail.text), 'confirmation email text has no travel line');
const plain = tpl.bookingConfirmation({ name: 'Jane', load: '1/2 truck', amount: '$349.00' });
ok(!/Travel/.test(plain.html), 'an email without travel still prints a travel row');

console.log('== database ==');
// The row upsertSubscription sends to Supabase, captured instead of sent.
const sent = [];
process.env.SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
globalThis.fetch = async (url, init) => {
  sent.push({ url, body: JSON.parse(init.body || 'null') });
  return { ok: true, status: 201, json: async () => [{ id: 'sub-row' }], text: async () => '' };
};
const db = require('../api/_lib/db.js');
await db.upsertSubscription({ customerId: 'c1', plan: 'one_time', loadSize: '1/2 truck', priceCents: 37400,
  travelZone: 'Zone 2', travelCents: '2500', travelMiles: '16.8', dedupeId: 'pi_1' });
const row = sent.length && sent[sent.length - 1].body;
ok(row && row.travel_zone === 'Zone 2' && row.travel_cents === 2500 && row.travel_miles === 16.8, `travel not in the subscription row: ${JSON.stringify(row)}`);
sent.length = 0;
await db.upsertSubscription({ customerId: 'c1', plan: 'one_time', loadSize: '1/2 truck', priceCents: 34900, dedupeId: 'pi_2' });
const before = sent.length && sent[sent.length - 1].body;
ok(before && !('travel_zone' in before) && !('travel_cents' in before), 'a booking without travel wrote empty travel columns');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
