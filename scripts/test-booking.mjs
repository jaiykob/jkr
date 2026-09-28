// Exercises api/create-subscription.js against a fake Stripe: validation,
// the server-side price cross-check, the ZIP gate, the live-mode booking gate,
// and both paths (one-time PaymentIntent, recurring subscription). No network.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICES, ONE_TIME_COL, COLUMNS, BILLING, ALL_ZIPS } from '../pricing.config.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Fake Stripe, installed in the require cache before the handler loads.
const calls = [];
class FakeStripe {
  constructor() {
    this.customers = { create: async (p) => { calls.push(['customer', p]); return { id: 'cus_1' }; } };
    this.paymentIntents = { create: async (p) => { calls.push(['pi', p]); return { client_secret: 'pi_secret', amount: p.amount }; } };
    this.subscriptions = { create: async (p) => {
      calls.push(['sub', p]);
      return { id: 'sub_1', latest_invoice: { amount_due: p.items[0].price_data.unit_amount, payment_intent: { client_secret: 'inv_secret' } } };
    } };
  }
}
const Module = require('node:module');
const load = Module._load;
Module._load = function (req, ...rest) { return req === 'stripe' ? FakeStripe : load.call(this, req, ...rest); };
// No Supabase configured: db calls must fail open.
delete process.env.SUPABASE_URL;
const handler = require(path.join(ROOT, 'api/create-subscription.js'));

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
