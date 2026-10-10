// Exercises api/create-booking.js against a fake Stripe: validation,
// the server-side price cross-check, the ZIP gate, the live-mode booking gate,
// and both paths (one-time PaymentIntent, recurring subscription). No network.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICES, ONE_TIME_COL, COLUMNS, BILLING, ALL_ZIPS, ZIP_ZONES, ZONES } from '../pricing.config.mjs';
import ZIP_MILES from '../data/zip-miles.mjs';
import { installFakeStripe } from './lib/fake-stripe.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Fake Stripe, installed in the require cache before the handler loads.
const { calls } = installFakeStripe();
// No Supabase configured: db calls must fail open.
delete process.env.SUPABASE_URL;
const handler = require(path.join(ROOT, 'api/create-booking.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

async function call(body, env = {}) {
  Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRODUCT_ID: 'prod_x', BOOKINGS_OPEN: '' }, env);
  calls.length = 0;
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: {}, body }, res);
  return { status, json };
}

const zip = ALL_ZIPS[0];
const RECUR = COLUMNS.findIndex((c) => BILLING[c].stripe);
const good = (over = {}) => ({
  email: 'a@b.co', name: 'Jane Smith', phone: '5035550100', paymentMethodId: 'pm_1',
  load: 2, freqIdx: ONE_TIME_COL, quotedCents: PRICES[2][ONE_TIME_COL], zip,
  metadata: { address: `1 Oak Ln, Gresham ${zip}`, pickup_weekday: 'Tuesday' }, ...over,
});

console.log('== validation ==');
ok((await call({ ...good(), email: '' })).status === 400, 'missing email accepted');
ok((await call(good({ load: 99 }))).status === 400, 'row out of range accepted');
ok((await call(good({ freqIdx: 99 }))).status === 400, 'column out of range accepted');
ok((await call(good({ zip: '90210' }))).status === 400, 'out-of-area ZIP accepted');
ok((await call(good({ metadata: { address: '1 Oak Ln 90210' } }))).status === 400, 'address in another ZIP accepted');
const stale = await call(good({ quotedCents: 1 }));
ok(stale.status === 400 && /out of date/.test(stale.json.error), 'stale quote not refused');
ok(calls.length === 0, 'a Stripe object was created on a refused booking');

console.log('== live-mode gate (closed until launch) ==');
const live = await call(good(), { STRIPE_SECRET_KEY: 'sk_live_x', BOOKINGS_OPEN: 'true' });
ok(live.status === 503, `live booking not refused while BOOKINGS_OPEN_SERVER=false (got ${live.status})`);
ok(calls.length === 0, 'live mode created a Stripe object');

console.log('== one-time haul ==');
const one = await call(good());
ok(one.status === 200 && one.json.plan === 'one_time', `one-time failed: ${JSON.stringify(one.json)}`);
const pi = calls.find((c) => c[0] === 'pi');
ok(pi && pi[1].amount === PRICES[2][ONE_TIME_COL], 'one-time charged a different amount than quoted');
ok(pi && pi[1].metadata.load === '1/2 truck' && pi[1].metadata.plan === 'one_time', 'one-time metadata wrong');
ok(!calls.some((c) => c[0] === 'sub'), 'one-time created a subscription');

console.log('== quote photos ==');
const okPath = 'quotes/2026-09-28/0123456789abcdef01234567.jpg';
const ph = await call(good({ metadata: { ...good().metadata, photos: `${okPath},1111/visit/after-1.jpg,../x.jpg` } }));
const phPi = calls.find((c) => c[0] === 'pi');
ok(ph.status === 200 && phPi && phPi[1].metadata.photos === okPath, `photo paths not filtered to server-named ones: ${phPi && phPi[1].metadata.photos}`);

console.log('== recurring pickup ==');
const rec = await call(good({ freqIdx: RECUR, quotedCents: PRICES[2][RECUR] }));
ok(rec.status === 200 && rec.json.plan === COLUMNS[RECUR], `recurring failed: ${JSON.stringify(rec.json)}`);
const sub = calls.find((c) => c[0] === 'sub');
ok(sub && sub[1].items[0].price_data.unit_amount === PRICES[2][RECUR], 'recurring billed a different amount than quoted');
ok(sub && JSON.stringify(sub[1].items[0].price_data.recurring) === JSON.stringify(BILLING[COLUMNS[RECUR]].stripe), 'recurring interval differs from config');
const q = await call(good({ freqIdx: RECUR, quotedCents: PRICES[2][RECUR], quarterly: true }));
ok(q.status === 200 && q.json.plan === 'quarterly', 'quarterly failed');
const qs = calls.find((c) => c[0] === 'sub');
ok(qs && qs[1].items[0].price_data.recurring.interval_count === 3, 'quarterly not billed every 3 months');

console.log('== travel ==');
// A ZIP in the second zone (a real fee), and one measured but past the last zone.
const z2 = ALL_ZIPS.find((z) => ZIP_ZONES[z].zone === ZONES[1].key);
const t2 = ZIP_ZONES[z2].cents;
const farZip = Object.keys(ZIP_MILES.zips).find((z) => !ZIP_ZONES[z]);
ok(t2 > 0 && farZip, 'test setup: need a zone 2 ZIP with a fee and a ZIP past the last zone');
// ZIP+4 in the address: the ZIP is still read as the five digits.
const away = good({ zip: z2, quotedCents: PRICES[2][ONE_TIME_COL] + t2,
  metadata: { address: `9 Elm St, Portland ${z2}-1234`, pickup_weekday: 'Tuesday' } });
const tr = await call(away);
const trPi = calls.find((c) => c[0] === 'pi');
ok(tr.status === 200, `zone 2 booking refused: ${JSON.stringify(tr.json)}`);
ok(trPi && trPi[1].amount === PRICES[2][ONE_TIME_COL] + t2, 'travel not added to the one-time charge');
ok(trPi && trPi[1].metadata.zone === ZONES[1].key && trPi[1].metadata.zone_label === ZONES[1].label, 'zone missing from metadata');
ok(trPi && trPi[1].metadata.travel_cents === String(t2) && trPi[1].metadata.load_cents === String(PRICES[2][ONE_TIME_COL]), 'travel or load cents missing from metadata');
ok(trPi && trPi[1].metadata.zip === z2 && trPi[1].metadata.miles === String(ZIP_ZONES[z2].miles), 'zip or miles missing from metadata');
const cust = calls.find((c) => c[0] === 'customer');
ok(cust && cust[1].metadata.zone === ZONES[1].key, 'travel missing from the customer metadata');
// The total without travel (an old quote, or a fee that changed since) is refused.
const loadOnly = await call({ ...away, quotedCents: PRICES[2][ONE_TIME_COL] });
ok(loadOnly.status === 400 && /out of date/.test(loadOnly.json.error), 'a total without travel was accepted');
ok(calls.length === 0, 'a refused travel quote created a Stripe object');
const tooFar = await call(good({ zip: farZip, metadata: { address: `1 Main St ${farZip}` } }));
ok(tooFar.status === 400 && /outside our service area/.test(tooFar.json.error), `a ZIP past the last zone was accepted (${farZip})`);
// Recurring and quarterly carry travel on every visit.
const subT = await call({ ...away, freqIdx: RECUR, quotedCents: PRICES[2][RECUR] + t2 });
const subC = calls.find((c) => c[0] === 'sub');
ok(subT.status === 200 && subC && subC[1].items[0].price_data.unit_amount === PRICES[2][RECUR] + t2, 'the monthly price left travel out');
ok(subC && subC[1].metadata.travel_cents === String(t2), 'travel missing from the subscription metadata');
await call({ ...away, freqIdx: RECUR, quotedCents: PRICES[2][RECUR] + t2, quarterly: true });
const qT = calls.find((c) => c[0] === 'sub');
const weeks = BILLING[COLUMNS[RECUR]].weeks;
ok(qT && qT[1].items[0].price_data.unit_amount === Math.round(((PRICES[2][RECUR] + t2) / weeks) * 13 * 0.9), 'the quarterly prepay left travel out');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
