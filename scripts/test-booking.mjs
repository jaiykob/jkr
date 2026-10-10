// Exercises api/create-booking.js against a fake Stripe: validation, the
// server-side total cross-check, the ZIP gate, consent, closed days, window
// capacity, the live-mode booking gate, and the SetupIntent that saves the
// card (setupIntents.create; never a PaymentIntent or a subscription). No network.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ZIPS, ZIP_ZONES, ZONES } from '../pricing.config.mjs';
import ZIP_MILES from '../data/zip-miles.mjs';
import { installFakeStripe } from './lib/fake-stripe.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Fake Stripe, installed in the require cache before the handler loads.
const { calls } = installFakeStripe();
// No Supabase configured: db calls must fail open.
delete process.env.SUPABASE_URL;
const db = require(path.join(ROOT, 'api/_lib/db.js'));
const ORDER = require(path.join(ROOT, 'api/_lib/order-config.js'));
const { travelFor } = require(path.join(ROOT, 'api/_lib/travel.js'));
const handler = require(path.join(ROOT, 'api/create-booking.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

async function call(body, env = {}) {
  Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', BOOKINGS_OPEN: '' }, env);
  calls.length = 0;
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: {}, body }, res);
  return { status, json };
}
const lastSetupIntent = () => calls.filter(([k]) => k === 'si').pop()[1];

// db.slotCounts replaced on the loaded module (Ruling R4): no database needed.
const realSlotCounts = async () => ({});   // nothing booked yet
db.slotCounts = realSlotCounts;
function fakeFullWindow(date, windowKey) {
  db.slotCounts = async () => ({ [date]: { total: 2, [windowKey]: 2 } });
}
const addDays = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

const zip = ALL_ZIPS[0];
const days = ORDER.openDays(Date.now());
const day = days[0].date;
const good = (over = {}) => ({
  email: 'a@b.co', name: 'Jane Smith', phone: '5035550100', size: 2, zip, date: day, window: 'w10',
  quotedCents: ORDER.totalFor(2, travelFor(zip).cents), consent: { agreed: true, version: ORDER.POLICY.consentVersion },
  attemptId: 'att_1', metadata: { address: `1 Oak Ln, Gresham ${zip}` }, ...over,
});

console.log('== validation ==');
ok((await call(good({ email: '' }))).json.code === 'bad_request', 'missing email accepted');
ok((await call(good({ attemptId: '' }))).json.code === 'bad_request', 'missing attemptId accepted');
ok((await call(good({ size: 99 }))).json.code === 'bad_request', 'size out of range accepted');
ok((await call(good({ window: 'w99' }))).json.code === 'bad_request', 'unknown window accepted');
ok((await call(good({ date: 'tomorrow' }))).json.code === 'bad_request', 'malformed date accepted');
ok((await call(good({ metadata: { address: '1 Oak Ln 90210' } }))).json.code === 'outside_area', 'address in another ZIP accepted');
ok(calls.length === 0, 'a Stripe object was created on a refused booking');

console.log('== live-mode gate (closed until launch) ==');
const live = await call(good(), { STRIPE_SECRET_KEY: 'sk_live_x', BOOKINGS_OPEN: 'true' });
ok(live.status === 503, `live booking not refused while BOOKINGS_OPEN_SERVER=false (got ${live.status})`);
ok(calls.length === 0, 'live mode created a Stripe object');

console.log('== refusals ==');
const stale = await call(good({ quotedCents: 1 }));
ok(stale.status === 400 && stale.json.code === 'stale_quote' && stale.json.totalCents === good().quotedCents, 'stale quote');
ok((await call(good({ zip: '90210' }))).json.code === 'outside_area', 'outside area');
ok((await call(good({ date: '2020-01-01' }))).json.code === 'closed_day', 'past day');
// Closed weekday inside the open range (a Sunday), before the lead time (today), past the horizon.
const today = ORDER.todayPacific(Date.now());
const sunday = Array.from({ length: ORDER.SCHEDULE.daysAhead + ORDER.SCHEDULE.leadDays + 1 }, (_, i) => addDays(today, i))
  .find((d) => new Date(d + 'T00:00:00Z').getUTCDay() === 0 && d > days[0].date && d < days[days.length - 1].date);
ok(sunday, 'test setup: a Sunday inside the open range');
ok((await call(good({ date: sunday }))).json.code === 'closed_day', 'a closed weekday was accepted');
ok(!days.some((d) => d.date === today), 'test setup: today should not be open');
ok((await call(good({ date: today }))).json.code === 'closed_day', 'a day before the lead time was accepted');
const beyond = addDays(days[days.length - 1].date, 7);
ok((await call(good({ date: beyond }))).json.code === 'closed_day', 'a day past the horizon was accepted');
ok((await call(good({ consent: { agreed: false } }))).json.code === 'consent_required', 'no consent');
ok((await call(good({ consent: undefined }))).json.code === 'consent_required', 'missing consent object');
ok((await call(good({ consent: { agreed: 'true', version: ORDER.POLICY.consentVersion } }))).json.code === 'consent_required', 'a truthy string counted as consent');
ok((await call(good({ consent: { agreed: true, version: 'old' } }))).json.code === 'consent_required', 'old consent version');
fakeFullWindow(day, 'w10');
const full = await call(good());
ok(full.status === 409 && full.json.code === 'window_full', 'full window');
ok((await call(good({ window: 'w14' }))).status === 200, 'a different window on the same day was refused');
db.slotCounts = async () => ({ [day]: { total: ORDER.SCHEDULE.dailyCap, w14: 0 } });
ok((await call(good({ window: 'w14' }))).status === 409, 'a full day (daily cap) was accepted');
db.slotCounts = async () => { throw new Error('db down'); };
ok((await call(good())).status === 200, 'capacity did not fail open when the count threw');
db.slotCounts = async () => null;
ok((await call(good())).status === 200, 'capacity did not fail open when the count was null');
db.slotCounts = realSlotCounts;
// Nothing was created by any refusal above (the 200s are the ones that did).
await call(good({ quotedCents: 1 }));
ok(calls.length === 0, 'a Stripe object was created on a refused booking');

console.log('== setup intent ==');
const r = await call(good());
ok(r.status === 200 && r.json.setupIntentClientSecret, 'no client secret');
ok(r.json.totalCents === good().quotedCents && r.json.travelCents === travelFor(zip).cents
  && r.json.loadCents === ORDER.SIZES[2].cents && r.json.customerId, `response shape ${JSON.stringify(r.json)}`);
ok(calls.some(([k]) => k === 'si') && !calls.some(([k]) => k === 'pi' || k === 'sub' || k === 'coupon'), 'a charge was created at booking');
const si = lastSetupIntent();
ok(si.usage === 'off_session' && si.customer && si.automatic_payment_methods.enabled === true, 'setup intent is not an off session setup for the customer');
const meta = si.metadata;
ok(meta.kind === 'booking' && meta.window === 'w10' && meta.date === day && meta.size === ORDER.SIZES[2].key, 'setup intent metadata');
ok(meta.load_idx === '2' && meta.load_cents === String(ORDER.SIZES[2].cents) && meta.travel_cents === String(travelFor(zip).cents)
  && meta.total_cents === String(good().quotedCents) && meta.market === 'portland' && meta.zip === zip && meta.founding === 'false',
  'setup intent money, market or zip metadata');
ok(meta.zone === travelFor(zip).zone && meta.zone_label === travelFor(zip).label && meta.miles === String(travelFor(zip).miles), 'setup intent zone metadata');
ok(meta.consent_version === ORDER.POLICY.consentVersion && Math.abs(Date.parse(meta.consent_at) - Date.now()) < 60000, 'consent time not stamped by the server');
ok(meta.address === `1 Oak Ln, Gresham ${zip}`, 'the page address was not kept');
const stamped = await call(good({ consent: { agreed: true, version: ORDER.POLICY.consentVersion, at: '2000-01-01T00:00:00Z' } }));
ok(stamped.status === 200 && lastSetupIntent().metadata.consent_at !== '2000-01-01T00:00:00Z', 'the page chose the consent time');
const cust = calls.find(([k]) => k === 'customer')[1];
ok(cust.email === 'a@b.co' && cust.metadata.kind === 'booking' && !cust.payment_method, 'customer should carry metadata and no payment method yet');
const over = await call(good({ metadata: { address: '1 Oak', kind: 'final_charge', total_cents: '1' } }));
ok(over.status === 200 && lastSetupIntent().metadata.kind === 'booking' && lastSetupIntent().metadata.total_cents === String(good().quotedCents),
  'the page overwrote server metadata');

console.log('== quote photos ==');
const okPath = 'quotes/2026-09-28/0123456789abcdef01234567.jpg';
const ph = await call(good({ metadata: { ...good().metadata, photos: `${okPath},1111/visit/after-1.jpg,../x.jpg` } }));
ok(ph.status === 200 && lastSetupIntent().metadata.photos === okPath, `photo paths not filtered to server-named ones: ${lastSetupIntent().metadata.photos}`);

console.log('== idempotency ==');
const idem = () => calls.filter(([k]) => k === 'customer' || k === 'si').map(([, , o]) => o && o.idempotencyKey);
// The same booking sent twice a moment apart: same params but consent_at, so
// the first key is reused with other params, Stripe says idempotency error,
// and the handler retries once with a fresh key. Both calls succeed.
const r1 = await call(good());
const keysA = idem();
await new Promise((r) => setTimeout(r, 5));
const r2 = await call(good());
ok(r1.status === 200 && r2.status === 200 && r2.json.setupIntentClientSecret, 'a retry differing only by consent_at failed');
ok(calls.filter(([k]) => k === 'customer').length === 2, 'the fallback did not retry the customer with a fresh key');
ok(keysA.every(Boolean) && keysA[0].split(':').length === 2 && idem()[1].split(':').length === 3, 'the fallback key is not the first key plus a suffix');
// Truly identical params (the clock fixed) get the original objects back, no error.
const RealDate = Date, FIXED = 1790000000000;
globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED; } };
const sameDay = ORDER.openDays(FIXED)[0].date;
const i1 = await call(good({ attemptId: 'att_same', date: sameDay }));
const i2 = await call(good({ attemptId: 'att_same', date: sameDay }));
globalThis.Date = RealDate;
ok(i1.status === 200 && i2.status === 200 && i1.json.customerId === i2.json.customerId && calls.length === 2
  && idem()[0].split(':').length === 2 && idem()[1].split(':').length === 2, 'an identical retry did not get the original objects');
await call(good({ attemptId: 'att_2' }));
ok(idem()[0] !== keysA[0], 'a new attempt reused the old idempotency key');
// An edited resubmit under the same attempt succeeds: other phone, address, notes.
const e1 = await call(good({ attemptId: 'att_edit' }));
const e2 = await call(good({ attemptId: 'att_edit', phone: '5035550199', metadata: { address: `2 Elm St, Gresham ${zip}`, notes: 'gate code 1' } }));
ok(e1.status === 200 && e2.status === 200 && e2.json.setupIntentClientSecret, 'an edited resubmit under the same attempt failed');
ok(lastSetupIntent().metadata.address.startsWith('2 Elm St') && calls.find(([k]) => k === 'customer')[1].phone === '5035550199', 'the edited resubmit did not use the edited details');
ok(idem().every((k) => k.split(':').length === 2), 'an edited resubmit needed the fallback key: its key should differ from the first');
const w2 = await call(good({ attemptId: 'att_edit', window: 'w14' }));
ok(w2.status === 200, 'a changed window under the same attempt failed');

console.log('== travel ==');
// A ZIP in the second zone (a real fee), and one measured but past the last zone.
const z2 = ALL_ZIPS.find((z) => ZIP_ZONES[z].zone === ZONES[1].key);
const t2 = ZIP_ZONES[z2].cents;
const farZip = Object.keys(ZIP_MILES.zips).find((z) => !ZIP_ZONES[z]);
ok(t2 > 0 && farZip, 'test setup: need a zone 2 ZIP with a fee and a ZIP past the last zone');
// ZIP+4 in the address: the ZIP is still read as the five digits.
const away = good({ zip: z2, quotedCents: ORDER.SIZES[2].cents + t2, metadata: { address: `9 Elm St, Portland ${z2}-1234` } });
const tr = await call(away);
ok(tr.status === 200 && tr.json.totalCents === ORDER.SIZES[2].cents + t2, `zone 2 booking refused: ${JSON.stringify(tr.json)}`);
const trM = lastSetupIntent().metadata;
ok(trM.total_cents === String(ORDER.SIZES[2].cents + t2), 'travel not added to the total');
ok(trM.zone === ZONES[1].key && trM.zone_label === ZONES[1].label, 'zone missing from metadata');
ok(trM.travel_cents === String(t2) && trM.load_cents === String(ORDER.SIZES[2].cents), 'travel or load cents missing from metadata');
ok(trM.zip === z2 && trM.miles === String(ZIP_ZONES[z2].miles), 'zip or miles missing from metadata');
ok(calls.find((c) => c[0] === 'customer')[1].metadata.zone === ZONES[1].key, 'travel missing from the customer metadata');
// The total without travel (an old quote, or a fee that changed since) is refused.
const loadOnly = await call({ ...away, quotedCents: ORDER.SIZES[2].cents });
ok(loadOnly.status === 400 && loadOnly.json.code === 'stale_quote' && loadOnly.json.totalCents === ORDER.SIZES[2].cents + t2, 'a total without travel was accepted');
ok(calls.length === 0, 'a refused travel quote created a Stripe object');
const tooFar = await call(good({ zip: farZip, metadata: { address: `1 Main St ${farZip}` } }));
ok(tooFar.status === 400 && tooFar.json.code === 'outside_area', `a ZIP past the last zone was accepted (${farZip})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
