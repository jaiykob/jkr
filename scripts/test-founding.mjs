// The founding member offer: the math, the spot count, and the booking API
// applying it (or refusing when the last spot just went). Off by default; the
// test switches it on in memory only. Fake Stripe, no network.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeStripe } from './lib/fake-stripe.mjs';
import { PRICES, ONE_TIME_COL, COLUMNS, BILLING, ALL_ZIPS, ZIP_ZONES } from '../pricing.config.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

// Fake Stripe (scripts/lib/fake-stripe.mjs): state.claimed is the founding bookings so far.
const { calls, state } = installFakeStripe();
delete process.env.SUPABASE_URL;

const founding = require(path.join(ROOT, 'api/_lib/founding.js'));
const handler = require(path.join(ROOT, 'api/create-booking.js'));
const spotsApi = require(path.join(ROOT, 'api/founding-spots.js'));

async function call(body) {
  Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRODUCT_ID: 'prod_x', BOOKINGS_OPEN: '' });
  calls.length = 0;
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: {}, body }, res);
  return { status, json };
}
async function spots(env = {}) {
  Object.assign(process.env, env);
  let json = null;
  const res = { setHeader() {}, status() { return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await spotsApi({ method: 'GET', headers: {} }, res);
  return json;
}

const zip = ALL_ZIPS.find((z) => ZIP_ZONES[z].cents > 0);
const total = PRICES[2][ONE_TIME_COL] + ZIP_ZONES[zip].cents;
const good = (over = {}) => ({
  email: 'a@b.co', name: 'Jane', phone: '5035550100', paymentMethodId: 'pm_1', load: 2, freqIdx: ONE_TIME_COL,
  quotedCents: total, zip, metadata: { address: `1 Oak Ln ${zip}`, pickup_weekday: 'Tuesday' }, ...over,
});

console.log('== the math ==');
const pct = founding.FOUNDING.percentOff;
ok(founding.firstMonthDiscountCents(total) === Math.round(total * pct / 100), 'one-time discount is not the percent of the whole price');
ok(founding.firstMonthDiscountCents(30000, { quarterly: true }) === Math.round(10000 * pct / 100), 'a quarter does not count as three months');
ok(founding.firstMonthDiscountCents(0) === 0, 'a zero charge got a discount');

console.log('== off by default ==');
ok(founding.FOUNDING.open === false, 'the offer is switched on in the code');
let r = await call(good({ founding: true }));
const pi0 = calls.find((c) => c[0] === 'pi');
ok(r.status === 200 && pi0 && pi0[1].amount === total, 'with the offer off, a booking still got a discount');
ok(r.json && r.json.founding == null, 'the offer is off but the booking says founding');
ok((await spots({ STRIPE_SECRET_KEY: 'sk_test_x' })).open === false, 'founding-spots says open while the offer is off');
delete process.env.STRIPE_SECRET_KEY;
ok((await spots()).open === false, 'founding-spots without Stripe is not closed');

console.log('== booking with the offer ==');
founding.FOUNDING.open = true;
founding._resetCache();
state.claimed = 3;
ok((await spots({ STRIPE_SECRET_KEY: 'sk_test_x' })).left === founding.FOUNDING.spots - 3, 'spots left miscounted');
r = await call(good({ founding: true }));
const pi1 = calls.find((c) => c[0] === 'pi');
const off = Math.round(total * pct / 100);
ok(r.status === 200 && pi1 && pi1[1].amount === total - off, `one-time charge with the offer is ${pi1 && pi1[1].amount}, want ${total - off} (travel included in the base)`);
ok(pi1 && pi1[1].metadata.founding === 'true' && pi1[1].metadata.founding_discount_cents === String(off), 'the booking is not stamped founding');
ok(r.json.founding && r.json.founding.discountCents === off, 'the response does not report the discount');
const RECUR = COLUMNS.findIndex((c) => BILLING[c].stripe);
r = await call(good({ freqIdx: RECUR, quotedCents: PRICES[2][RECUR] + ZIP_ZONES[zip].cents, founding: true }));
const sub = calls.find((c) => c[0] === 'sub'), coupon = calls.find((c) => c[0] === 'coupon');
ok(r.status === 200 && sub && sub[1].discounts && coupon && coupon[1].duration_in_months === 1, 'a monthly pickup did not get a one month coupon');

console.log('== the last spot just went ==');
state.claimed = founding.FOUNDING.spots;
founding._resetCache();
r = await call(good({ founding: true }));
ok(r.status === 409 && r.json.code === 'founding_closed', `shown the offer after the last spot went: ${r.status} ${JSON.stringify(r.json)}`);
ok(!calls.some((c) => c[0] === 'pi' || c[0] === 'sub'), 'a closed offer still created a charge');
r = await call(good());
const pi2 = calls.find((c) => c[0] === 'pi');
ok(r.status === 200 && pi2 && pi2[1].amount === total, 'a booking not shown the offer was refused or discounted after it closed');
founding.FOUNDING.open = false;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
