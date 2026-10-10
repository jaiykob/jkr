// After payment: the Discord ping, the owner email, the customer emails and
// the row the dashboard reads, through the real webhook handler with a fake
// Stripe and a stand-in email sender. No network.
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';

const require = createRequire(import.meta.url);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fake Stripe (the event is the request body) and a sendEmail that records.
const sent = [];
let customerMeta = {};
const customerUpdates = [];
class FakeStripe {
  constructor() {
    this.webhooks = { constructEvent: (raw) => JSON.parse(raw.toString('utf8')) };
    this.customers = { update: async (id, p) => { customerUpdates.push({ id, ...p }); return { id, ...p }; }, retrieve: async (id) => ({ id, name: 'Jane Smith', email: 'jane@example.com', phone: '5035550100', metadata: customerMeta }) };
    this.subscriptions = { retrieve: async (id) => ({ id, status: 'active', items: { data: [] }, metadata: {} }) };
  }
}
const Module = require('node:module');
const load = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'stripe') return FakeStripe;
  if (req === './_lib/email') return { sendEmail: async (m) => { sent.push(m); return { ok: true }; } };
  return load.call(this, req, ...rest);
};
const webhook = require('../api/stripe-webhook.js');
const { buildDiscordEmbed, travelLine } = webhook;
const tpl = require('../api/_lib/email-templates.js');

async function deliver(event, env = {}) {
  Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', OPS_WEBHOOK_URL: '', OPS_EMAIL: '' }, env);
  sent.length = 0;
  const req = Readable.from([Buffer.from(JSON.stringify(event))]);
  req.method = 'POST';
  req.headers = { 'stripe-signature': 't=1,v1=x' };
  let status = 0;
  const res = { status(s) { status = s; return this; }, json() { return this; }, end() { return this; }, setHeader() {} };
  await webhook(req, res);
  return status;
}

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

console.log('== owner email ==');
const booking = (id, over = {}) => ({
  id, type: 'payment_intent.succeeded', livemode: false,
  data: { object: { id: 'pi_1', customer: 'cus_1', amount_received: 37400, metadata: {
    plan: 'one_time', load: '1/2 truck', zone_label: 'Zone 2', travel_cents: '2500', miles: '16.8',
    address: '9 Elm St, Portland 97202', pickup_day: 'Tuesday, Oct 14', items: 'Couch, mattress', frequency: 'One-time haul', ...over } } },
});
// Discord is down (its fetch throws): the owner email still goes.
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('discord unreachable'); };
let st = await deliver(booking('evt_1'), { OPS_EMAIL: 'owner@example.com', OPS_WEBHOOK_URL: 'https://discord.invalid/webhook' });
const owner = sent.find((m) => m.to === 'owner@example.com');
ok(st === 200, `webhook answered ${st}`);
ok(!!owner, 'no owner email on a new booking');
ok(owner && owner.idempotencyKey === 'evt_1:owner', `owner email key is ${owner && owner.idempotencyKey} (a redelivery would send twice)`);
ok(owner && /New booking/.test(owner.subject) && /\$374\.00/.test(owner.subject), `owner subject: ${owner && owner.subject}`);
ok(owner && /1\/2 truck/.test(owner.html) && /Zone 2/.test(owner.html) && /9 Elm St/.test(owner.html) && /503/.test(owner.html), 'owner email lacks the load, travel, address or phone');
ok(owner && /\/jkr\//.test(owner.html), 'owner email does not link the dashboard');
ok(sent.some((m) => m.to === 'jane@example.com'), 'the customer confirmation stopped going out');
globalThis.fetch = realFetch;
// No OPS_EMAIL: no owner email, no error, the customer still hears from us.
st = await deliver(booking('evt_2'));
ok(st === 200 && !sent.some((m) => /New booking/.test(m.subject || '')), 'an owner email went out with OPS_EMAIL unset');
ok(sent.some((m) => m.to === 'jane@example.com'), 'without OPS_EMAIL the customer email stopped');
// A renewal is not a new booking.
st = await deliver({ id: 'evt_3', type: 'invoice.payment_succeeded', livemode: false,
  data: { object: { id: 'in_1', customer: 'cus_1', subscription: 'sub_1', billing_reason: 'subscription_cycle', amount_paid: 34400, metadata: {} } } },
  { OPS_EMAIL: 'owner@example.com' });
ok(!sent.some((m) => m.to === 'owner@example.com'), 'a monthly renewal sent an owner booking email');
// A declined card is not a booking either.
st = await deliver({ id: 'evt_4', type: 'payment_intent.payment_failed', livemode: false,
  data: { object: { id: 'pi_2', customer: 'cus_1', amount: 37400, metadata: { plan: 'one_time' } } } }, { OPS_EMAIL: 'owner@example.com' });
ok(!sent.some((m) => m.to === 'owner@example.com'), 'a declined card sent an owner booking email');

console.log('== customer emails ==');
const ctxAll = { name: 'Jane', plan: 'One-time haul', amount: '$374.00', frequency: 'One-time haul', pickupDay: 'Tuesday', address: '1 Oak St',
  load: '1/2 truck', travel: 'Zone 2: $25.00', quoteUrl: 'https://www.example.com/book/quote.html', quotedPrice: '$374.00',
  reviewUrl: 'https://g.page/r/x', visitDate: 'Tue, Oct 14', updateUrl: 'https://pay.example.com', unsubscribeUrl: 'https://www.example.com/u', photos: [] };
const strip = (h) => String(h).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
for (const [k, fn] of Object.entries(tpl)) {
  if (typeof fn !== 'function' || /^(layout|button|detail|escape)/i.test(k)) continue;
  let out; try { out = fn(ctxAll); } catch { continue; }
  if (!out || !out.html) continue;
  const all = `${out.subject}\n${strip(out.html)}\n${out.text || ''}`;
  ok(!/[—–]/.test(all), `${k}: a dash as punctuation: "${(all.match(/.{0,25}[—–].{0,25}/) || [''])[0]}"`);
  ok(!/\bTODO\b/.test(all), `${k}: a TODO a customer would read`);
  ok(!/\b(okay|gonna|honestly|totally|a lot of|super easy|no biggie)\b/i.test(all), `${k}: slang: "${(all.match(/.{0,20}\b(okay|gonna|honestly|totally|a lot of|super easy|no biggie)\b.{0,20}/i) || [''])[0]}"`);
  ok(!/\b(dogs?|poop|scoop\w*|Scoops|yard)\b/i.test(all.replace(/yard debris/gi, '')), `${k}: a leftover from the old business`);
}

console.log('== database ==');
// The row upsertSubscription sends to Supabase, captured instead of rows.
const rows = [];
process.env.SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
globalThis.fetch = async (url, init) => {
  rows.push({ url, body: JSON.parse(init.body || 'null') });
  return { ok: true, status: 201, json: async () => [{ id: 'sub-row' }], text: async () => '' };
};
const db = require('../api/_lib/db.js');
await db.upsertSubscription({ customerId: 'c1', plan: 'one_time', loadSize: '1/2 truck', priceCents: 37400,
  travelZone: 'Zone 2', travelCents: '2500', travelMiles: '16.8', dedupeId: 'pi_1' });
const row = rows.length && rows[rows.length - 1].body;
ok(row && row.travel_zone === 'Zone 2' && row.travel_cents === 2500 && row.travel_miles === 16.8, `travel not in the subscription row: ${JSON.stringify(row)}`);
rows.length = 0;
await db.upsertSubscription({ customerId: 'c1', plan: 'one_time', loadSize: '1/2 truck', priceCents: 34900, dedupeId: 'pi_2' });
const before = rows.length && rows[rows.length - 1].body;
ok(before && !('travel_zone' in before) && !('travel_cents' in before), 'a booking without travel wrote empty travel columns');

console.log('== slots ==');
// A Supabase stand-in for visits: GET filters on market, status, date range, id and stripe_setup_intent_id.
const ORDER = require('../api/_lib/order-config.js');
const NOW = Date.now();
let visitRows = [], down = false, posts = [];
const pings = [], patches = [];
const eqId = (q) => (q.get('id') || '').replace(/^eq\./, '');
const fakeVisits = (r) => { visitRows = r.map((v, i) => ({ id: v.id || `v${i}`, customer_id: 'c1', customers: { id: 'c1', email: 'jane@example.com' }, ...v })); down = false; };
const dbDown = () => { down = true; };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.hostname === 'discord.invalid') { pings.push(JSON.parse(init.body)); return { ok: true, status: 204, text: async () => '' }; }
  if (down) throw new Error('database unreachable');
  const q = u.searchParams;
  if (u.pathname.endsWith('/customers') && (init.method || 'GET') === 'POST') return { ok: true, status: 201, json: async () => [{ id: 'c1' }], text: async () => '' };
  if (!u.pathname.endsWith('/visits')) return { ok: true, status: 200, json: async () => [], text: async () => '' };
  if (init.method === 'PATCH') {
    const row = visitRows.find((r) => r.id === eqId(q));
    if (!row) return { ok: true, status: 200, json: async () => [], text: async () => '' };
    Object.assign(row, JSON.parse(init.body)); patches.push({ id: row.id, ...JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => [row], text: async () => '' };
  }
  if ((init.method || 'GET') === 'POST') {
    const b = JSON.parse(init.body); posts.push(b);
    const row = { id: `new${posts.length}`, ...b }; visitRows.push(row);
    return { ok: true, status: 201, json: async () => [row], text: async () => '' };
  }
  let out = visitRows;
  const eq = (k) => (q.get(k) || '').startsWith('eq.') ? q.get(k).slice(3) : null;
  const neq = (k) => (q.get(k) || '').startsWith('neq.') ? q.get(k).slice(4) : null;
  if (eq('market')) out = out.filter((v) => v.market === eq('market'));
  if (neq('status')) out = out.filter((v) => v.status !== neq('status'));
  if (eq('id')) out = out.filter((v) => v.id === eq('id'));
  if (eq('stripe_setup_intent_id')) out = out.filter((v) => v.stripe_setup_intent_id === eq('stripe_setup_intent_id'));
  for (const [k, v] of u.searchParams.entries()) {
    if (k === 'scheduled_date' && v.startsWith('gte.')) out = out.filter((r) => r.scheduled_date >= v.slice(4));
    if (k === 'scheduled_date' && v.startsWith('lte.')) out = out.filter((r) => r.scheduled_date <= v.slice(4));
  }
  if ((q.get('select') || '').includes('customers(')) out = out.map((r) => ({ ...r, customers: r.customers || { id: r.customer_id, email: 'jane@example.com' } }));
  return { ok: true, status: 200, json: async () => out, text: async () => '' };
};
async function callCapacity(qs) {
  const handler = require('../api/day-capacity.js');
  let status = 0, json = null; const headers = {};
  const res = { setHeader(k, v) { headers[k] = v; }, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await handler({ method: 'GET', url: '/api/day-capacity' + qs, headers: {}, query: Object.fromEntries(new URLSearchParams(qs)) }, res);
  return { status, json, headers };
}
const first = ORDER.openDays(NOW)[0].date;
const v = (window_key, status = 'scheduled') => ({ scheduled_date: first, window_key, market: 'portland', status });
const threeScheduledIn = (k) => [v(k), v(k), v(k)];
// two scheduled and one canceled in w08, cap 2: the canceled one is not counted, so w08 is full only by the two
fakeVisits([v('w08'), v('w08'), v('w08', 'canceled')]);
let cap = await callCapacity('?market=portland');
let d0 = cap.json.days.find((d) => d.date === first);
ok(cap.status === 200 && cap.headers['Cache-Control'] === 'no-store', 'capacity is not sent no-store');
ok(d0.windows.find((w) => w.key === 'w08').full === true, 'two scheduled visits at cap 2 did not fill the window');
ok(d0.windows.find((w) => w.key === 'w10').full === false, 'an empty window was flagged full');
fakeVisits([v('w08'), v('w08', 'canceled'), v('w08', 'canceled')]);
cap = await callCapacity('?market=portland');
ok(cap.json.days[0].windows[0].full === false, 'a canceled visit counted');
fakeVisits([...threeScheduledIn('w08')]);
ok((await callCapacity('?market=portland')).json.days[0].windows[0].full === true, 'full window not flagged');
// another market's visits do not count
fakeVisits([{ ...v('w08'), market: 'sacramento' }, { ...v('w08'), market: 'sacramento' }]);
ok((await callCapacity('?market=portland')).json.days[0].windows[0].full === false, 'another market filled this market');
// a day is full when its total reaches the daily cap, or every window is full
fakeVisits([v('w08'), v('w08'), v('w10'), v('w10'), v('w12'), v('w12')]);
d0 = (await callCapacity('?market=portland')).json.days[0];
ok(d0.full === true, 'a day at the daily cap is not full');
fakeVisits([v('w08'), v('w08'), v('w10'), v('w10'), v('w12'), v('w12'), v('w14'), v('w14')]);
ok((await callCapacity('?market=portland')).json.days[0].full === true, 'a day with every window full is not full');
fakeVisits([v('w08')]);
ok((await callCapacity('?market=portland')).json.days[0].full === false, 'a quiet day is full');
ok(!JSON.stringify((await callCapacity('?market=portland')).json).includes('jane'), 'capacity leaks customer data');
// slotCounts shape
fakeVisits([v('w08'), v('w10')]);
const sc = await db.slotCounts({ market: 'portland', from: first, to: first });
ok(sc[first] && sc[first].total === 2 && sc[first].w08 === 1 && sc[first].w10 === 1, `slotCounts is ${JSON.stringify(sc)}`);
// createBookedVisit is idempotent on the setup intent, and getVisit carries the customer
fakeVisits([]); posts = [];
const f1 = { customerId: 'c1', scheduledDate: first, windowKey: 'w08', market: 'portland', stripeSetupIntentId: 'seti_1', quotedCents: 34900, travelCents: 0 };
const b1 = await db.createBookedVisit(f1);
const b2 = await db.createBookedVisit(f1);
ok(b1 && b2 && b1.id === b2.id && posts.length === 1, `createBookedVisit wrote ${posts.length} rows for one setup intent`);
ok(posts[0] && posts[0].window_key === 'w08' && posts[0].stripe_setup_intent_id === 'seti_1' && posts[0].quoted_cents === 34900 && posts[0].status === 'scheduled', `visit row is ${JSON.stringify(posts[0])}`);
const gv = await db.getVisit(b1.id);
ok(gv && gv.customers && gv.customers.email === 'jane@example.com', 'getVisit has no customer');
// fail soft
dbDown();
ok((await db.createBookedVisit(f1)) === null, 'createBookedVisit threw or returned a row with the database down');
dbDown();
ok(Object.keys(await db.slotCounts({ market: 'portland', from: first, to: first })).length === 0, 'slotCounts is not empty with the database down');
dbDown();
ok((await callCapacity('?market=portland')).json.days.every((d) => !d.full && d.windows.every((w) => !w.full)), 'capacity must fail open');


console.log('== booked ==');
const day = first;
const createdVisits = () => posts;
const sentEmails = () => sent;
const discordPings = () => pings;
const setupIntentSucceeded = (meta, id = 'evt_si_1') => ({
  id, type: 'setup_intent.succeeded', livemode: false,
  data: { object: { id: 'seti_9', object: 'setup_intent', customer: 'cus_1', payment_method: 'pm_9', status: 'succeeded', metadata: meta } },
});
const bookEnv = { OPS_EMAIL: 'owner@example.com', OPS_WEBHOOK_URL: 'https://discord.invalid/hook' };
customerMeta = { address: '9 Elm St, Portland 97202', plan: 'one_time' };
fakeVisits([]); posts = []; pings.length = 0; customerUpdates.length = 0;
const ev = setupIntentSucceeded({ kind: 'booking', date: day, window: 'w10', total_cents: '37400', travel_cents: '2500', load_idx: '2', zone_label: 'Zone 2' });
await deliver(ev, bookEnv);
ok(createdVisits().length === 1 && createdVisits()[0].window_key === 'w10' && createdVisits()[0].payment_status === 'card_saved', 'visit not written');
ok(createdVisits()[0] && createdVisits()[0].stripe_payment_method_id === 'pm_9' && createdVisits()[0].travel_cents === 2500, `visit row is ${JSON.stringify(createdVisits()[0])}`);
ok(customerUpdates.some((u) => u.id === 'cus_1' && u.invoice_settings && u.invoice_settings.default_payment_method === 'pm_9'), 'the saved card is not the customer default payment method');
const conf = sentEmails().find((e) => e.to === 'jane@example.com');
ok(sentEmails().some((e) => /Nothing is charged today/.test(e.html) && /10 am to 12 pm/.test(e.html)), 'confirmation lacks the window or the rule');
ok(conf && /\$374\.00/.test(conf.html) && /Zone 2/.test(conf.html) && /\$25\.00/.test(conf.html) && /charged after the job/.test(conf.html), 'confirmation lacks the total, the travel line or the consent');
ok(conf && /Nothing is charged today/.test(conf.text), 'confirmation text lacks the rule');
ok(sentEmails().some((e) => e.to === 'owner@example.com'), 'no owner email');
ok(discordPings().length === 1 && /New booking/.test(discordPings()[0].embeds[0].title), 'no Discord ping');
ok(sentEmails().every((e) => /^seti_9:(cust|owner)$/.test(e.idempotencyKey)), 'email keys are not SetupIntent based: ' + sentEmails().map((e) => e.idempotencyKey));
ok(patches.length === 1 && patches[0].booking_notified_at, 'the visit was not stamped booking_notified_at after all three went out');
await deliver(ev, bookEnv);
ok(createdVisits().length === 1, 'a redelivered event wrote a second visit');
ok(discordPings().length === 1, 'a redelivered event pinged Discord again');
ok(sentEmails().length === 0, 'a redelivery after a full first delivery sent email again');
// A different event for the same SetupIntent is also quiet.
await deliver(setupIntentSucceeded({ kind: 'booking', date: day, window: 'w10', total_cents: '37400', travel_cents: '2500', load_idx: '2' }, 'evt_si_other'), bookEnv);
ok(createdVisits().length === 1 && discordPings().length === 1 && sentEmails().length === 0, 'a second event for the same setup intent notified again');
// The first try wrote the visit and died before announcing it: the retry sends all three, once, and stamps.
visitRows.forEach((r) => { r.booking_notified_at = null; }); patches.length = 0;
await deliver(ev, bookEnv);
ok(createdVisits().length === 1 && discordPings().length === 2, 'the retry of an unstamped visit did not ping (or wrote a second visit)');
ok(sentEmails().filter((e) => e.to === 'jane@example.com').length === 1 && sentEmails().filter((e) => e.to === 'owner@example.com').length === 1, 'the retry of an unstamped visit did not send the confirmation and the owner email once each');
ok(patches.length === 1 && patches[0].booking_notified_at, 'the retry did not stamp the visit');
 pings.splice(1);
await deliver(setupIntentSucceeded({ kind: 'something_else' }, 'evt_si_2'), bookEnv);
ok(createdVisits().length === 1 && discordPings().length === 1, 'a setup intent that is not a booking wrote a visit or pinged');
ok(sentEmails().length === 0, 'a setup intent that is not a booking sent email');
// The customer's merged metadata must not make a final charge a booking.
customerMeta = { plan: 'one_time', kind: 'booking', date: day, window: 'w10' };
await deliver({ id: 'evt_fc_1', type: 'payment_intent.succeeded', livemode: false,
  data: { object: { id: 'pi_fc', customer: 'cus_1', amount_received: 37400, metadata: { kind: 'final_charge', visit_id: 'v1' } } } }, bookEnv);
ok(createdVisits().length === 1 && discordPings().length === 1 && !sentEmails().length, 'a final charge was read as a booking');
customerMeta = { address: '9 Elm St, Portland 97202' };
fakeVisits([]); posts = []; pings.length = 0; customerUpdates.length = 0;
dbDown();
await deliver(setupIntentSucceeded({ kind: 'booking', date: day, window: 'w12', total_cents: '34900', travel_cents: '0' }, 'evt_si_3'), bookEnv);
ok(sentEmails().some((e) => e.to === 'jane@example.com' && /12 to 2 pm/.test(e.html)), 'a database error lost the confirmation (fail soft)');
ok(sentEmails().length >= 2 && discordPings().length === 1, 'a database error lost the owner email or the ping (fail soft)');
// Reminders show the window.
const rem = tpl.visitReminder({ name: 'Jane', visitDate: 'Tue Oct 14', windowLabel: '10 am to 12 pm' });
ok(/10 am to 12 pm/.test(rem.html) && /10 am to 12 pm/.test(rem.text), 'the reminder does not show the window');
const rem0 = tpl.visitReminder({ name: 'Jane', visitDate: 'Tue Oct 14' });
ok(!/undefined/.test(rem0.html + rem0.text), 'a reminder without a window prints undefined');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
