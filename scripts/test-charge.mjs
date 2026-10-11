// After the job (api/visit-update.js), pay at booking: the booking paid the
// quoted total; Finish prices the final size on the server and charges or
// refunds the difference; a declined difference becomes an invoice; Cancel and
// refund and Customer said no refund what was paid, less the late fee or the
// refusal fee. Real handler, fake Stripe, fake database (exports on the loaded
// api/_lib/db.js), recorded email and Discord. No network.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeStripe } from './lib/fake-stripe.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let { calls, state } = installFakeStripe();
const reinstall = (o) => { ({ calls, state } = installFakeStripe(o)); };
const TOKEN = 'test-admin-token-xyz';
Object.assign(process.env, {
  STRIPE_SECRET_KEY: 'sk_test_x', ADMIN_DASHBOARD_TOKEN: TOKEN, SUPABASE_SERVICE_ROLE_KEY: 'srk',
  OPS_WEBHOOK_URL: 'https://discord.invalid/hook', OPS_EMAIL: 'owner@example.com',
});

// Recorded email and Discord, set before the handler loads.
const sent = [];
const email = require(path.join(ROOT, 'api/_lib/email.js'));
email.sendEmail = async (m) => { sent.push(m); return { ok: true }; };
const pings = [];
globalThis.fetch = async (url, init = {}) => { pings.push({ url: String(url), body: JSON.parse(init.body || 'null') }); return { ok: true, status: 204, text: async () => '' }; };

// The database: visit rows in memory. failWrite(patch) -> true makes that one write fail (returns null).
const db = require(path.join(ROOT, 'api/_lib/db.js'));
const rows = new Map();
let failWrite = () => false;
db.getVisit = async (id) => (rows.has(id) ? JSON.parse(JSON.stringify(rows.get(id))) : null);
db.getVisitContext = async (id) => (rows.has(id) ? { ...rows.get(id), subscriptions: null, visit_photos: [] } : null);
db.updateVisit = async (id, patch) => { if (!rows.has(id) || failWrite(patch)) return null; Object.assign(rows.get(id), patch); return { ...rows.get(id) }; };
db.signPhotoDownload = async () => null;

const ORDER = require(path.join(ROOT, 'api/_lib/order-config.js'));
const handler = require(path.join(ROOT, 'api/visit-update.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

let seq = 0;
const today = ORDER.todayPacific(Date.now());
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const farDay = addDays(today, 10);
const PAID = 34900 + 2500;   // booked at 1/2 truck for 34900 plus 2500 travel, paid at booking
function fakeVisit(over = {}) {
  const id = `visit_${++seq}`;
  rows.set(id, {
    id, status: 'scheduled', scheduled_date: farDay, window_key: 'w10',
    quoted_load_idx: 2, quoted_load_cents: 34900, quoted_cents: PAID, travel_cents: 2500,
    payment_status: 'paid', paid_cents: PAID, refunded_cents: 0,
    stripe_payment_intent_id: `pi_booking_${seq}`, stripe_payment_method_id: 'pm_saved',
    customer_id: 'c1', customers: { id: 'c1', stripe_customer_id: 'cus_1', email: 'jane@example.com', first_name: 'Jane', phone: '5035550100' },
    ...over,
  });
  return rows.get(id);
}
async function act(body, { token = TOKEN, queryToken = false } = {}) {
  calls.length = 0; sent.length = 0; pings.length = 0;
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  const headers = token ? { 'x-admin-token': token } : {};
  await handler({ method: 'POST', headers, query: queryToken ? { token: TOKEN } : {}, body }, res);
  return { status, json };
}
const of = (kind) => calls.filter(([k]) => k === kind);
const piCalls = () => of('pi').map(([, p]) => p);
const refundCalls = () => of('refund').map(([, p, o]) => ({ ...p, key: o && o.idempotencyKey }));
const moneyCalls = () => calls.filter(([k]) => ['pi', 'refund', 'invoice', 'invoice-item', 'pi-cancel'].includes(k));
const invoiceSent = () => calls.some(([k]) => k === 'send-invoice');
const alerts = () => pings.filter((p) => p.url === process.env.OPS_WEBHOOK_URL);
const receiptTo = () => sent.find((e) => e.to === 'jane@example.com' && /receipt/i.test(e.subject || ''));
const allDone = () => sent.some((e) => /All done/i.test(e.subject || ''));
const setPrice = (row, cents) => { ORDER.SIZES[row].cents = cents; };
const realPrice2 = ORDER.SIZES[2].cents;
const $ = (c) => `$${(c / 100).toFixed(2)}`;

const v = fakeVisit();
console.log('== price ==');
let r = await act({ action: 'finish', visitId: v.id, finalLoad: 2, dryRun: true });
ok(r.status === 200 && r.json.cents === PAID && r.json.paidCents === PAID && r.json.differenceCents === 0 && moneyCalls().length === 0, `dry run charged or mispriced ${JSON.stringify(r.json)}`);
ok(r.json.loadCents === 34900 && r.json.travelCents === 2500 && r.json.charged === false && r.json.refunded === false, 'dry run breakdown');
setPrice(2, 39900);   // the table changed after booking
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 2, dryRun: true })).json.cents === PAID, 'booked size not priced at its quoted cents');
const big = ORDER.SIZES[3].cents + 2500;
r = await act({ action: 'finish', visitId: v.id, finalLoad: 3, dryRun: true });
ok(r.json.cents === big && r.json.differenceCents === big - PAID && r.json.agreementRequired === true, `bigger size not today's price plus booked travel, less what was paid ${JSON.stringify(r.json)}`);
const small = ORDER.SIZES[1].cents + 2500;
r = await act({ action: 'finish', visitId: v.id, finalLoad: 1, dryRun: true });
ok(r.json.cents === small && r.json.differenceCents === small - PAID && r.json.differenceCents < 0 && r.json.agreementRequired === false, `smaller size difference ${JSON.stringify(r.json)}`);
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 99, dryRun: true })).status === 400, 'a size that does not exist was priced');
ok(rows.get(v.id).final_load_idx == null && rows.get(v.id).status === 'scheduled', 'a dry run wrote to the visit');

console.log('== agreement ==');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 3 })).status === 400 && moneyCalls().length === 0, 'bigger size charged without agreement');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 3, agreed: 'true' })).status === 400 && moneyCalls().length === 0, 'a truthy string counted as agreement');
ok(rows.get(v.id).final_load_idx == null, 'a refused finish wrote the final size');

console.log('== charge more ==');
r = await act({ action: 'finish', visitId: v.id, finalLoad: 3, agreed: true });
ok(r.status === 200 && piCalls().length === 1 && of('refund').length === 0, `charge more: ${r.status} ${JSON.stringify(r.json)}`);
const p0 = piCalls()[0];
ok(p0 && p0.amount === big - PAID && p0.off_session === true && p0.confirm === true && p0.customer === 'cus_1' && p0.payment_method === 'pm_saved' && p0.currency === 'usd', `difference charge params ${JSON.stringify(p0)}`);
ok(p0 && p0.automatic_payment_methods && p0.automatic_payment_methods.enabled === true && p0.automatic_payment_methods.allow_redirects === 'never', 'the difference charge lacks allow_redirects never (R14)');
ok(p0 && p0.metadata.kind === 'difference' && p0.metadata.visit_id === v.id && p0.metadata.final_load_idx === '3', `difference metadata ${JSON.stringify(p0 && p0.metadata)}`);
ok(of('pi')[0][2] && of('pi')[0][2].idempotencyKey === `visit:${v.id}:diff:3`, 'difference idempotency key');
ok(r.json.charged === true && r.json.refunded === false && r.json.paymentStatus === 'paid' && r.json.cents === big && r.json.paidCents === PAID && r.json.differenceCents === big - PAID, `finish answer ${JSON.stringify(r.json)}`);
let row = rows.get(v.id);
ok(row.payment_status === 'paid' && row.final_load_idx === 3 && row.final_cents === big && row.paid_cents === big, `visit after charge more ${JSON.stringify(row)}`);
ok(row.stripe_payment_intent_id === 'pi_booking_1', 'the booking PaymentIntent id was replaced (refunds need it)');
ok(row.status === 'completed' && allDone(), 'the complete path did not run after the charge');
let rec = receiptTo();
ok(rec && rec.html.includes($(PAID)) && rec.html.includes($(big - PAID)) && rec.html.includes($(big)), 'the receipt does not show paid, adjusted and final');
ok(rec && rec.idempotencyKey === `visit:${v.id}:receipt:3`, `receipt key ${rec && rec.idempotencyKey}`);
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 3, agreed: true })).status === 409 && moneyCalls().length === 0, 'charged twice');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 1, agreed: true })).status === 409 && moneyCalls().length === 0, 'a finished job settled a second size');
setPrice(2, realPrice2);

console.log('== refund less ==');
const vs = fakeVisit();
r = await act({ action: 'finish', visitId: vs.id, finalLoad: 1 });
ok(r.status === 200 && of('pi').length === 0 && refundCalls().length === 1, `refund less: ${r.status} ${JSON.stringify(r.json)} pi ${of('pi').length}`);
const rf = refundCalls()[0];
ok(rf && rf.payment_intent === vs.stripe_payment_intent_id && rf.amount === PAID - small, `refund params ${JSON.stringify(rf)}`);
ok(rf && rf.key === `visit:${vs.id}:refund:1`, `refund key ${rf && rf.key}`);
ok(r.json.refunded === true && r.json.charged === false && r.json.differenceCents === small - PAID && r.json.paymentStatus === 'paid' && r.json.cents === small, `refund answer ${JSON.stringify(r.json)}`);
row = rows.get(vs.id);
ok(row.refunded_cents === PAID - small && row.paid_cents === PAID && row.final_cents === small && row.final_load_idx === 1 && row.status === 'completed', `visit after refund ${JSON.stringify(row)}`);
rec = receiptTo();
ok(rec && rec.html.includes($(PAID)) && rec.html.includes($(PAID - small)) && rec.html.includes($(small)) && /refund/i.test(rec.html), 'the receipt does not show paid, refunded and final');
ok((await act({ action: 'finish', visitId: vs.id, finalLoad: 1 })).status === 409 && moneyCalls().length === 0, 'refunded twice');

console.log('== same ==');
const vq = fakeVisit();
r = await act({ action: 'finish', visitId: vq.id, finalLoad: 2 });
ok(r.status === 200 && moneyCalls().length === 0 && r.json.differenceCents === 0 && r.json.charged === false && r.json.refunded === false, `same size touched Stripe ${JSON.stringify(r.json)}`);
ok(rows.get(vq.id).status === 'completed' && rows.get(vq.id).final_cents === PAID && rows.get(vq.id).payment_status === 'paid', 'same size not completed and settled');
rec = receiptTo();
ok(rec && rec.html.includes($(PAID)) && /no change/i.test(rec.html), 'the receipt for the same size does not say no change');
// finalLoad left out means the booked size
const vq2 = fakeVisit();
ok((await act({ action: 'finish', visitId: vq2.id })).status === 200 && moneyCalls().length === 0 && rows.get(vq2.id).final_load_idx === 2, 'finish without a size did not settle the booked size');

console.log('== founding ==');
const full = 34900 + 2500;
const off = Math.round(full * 25 / 100);
state.paymentIntents.pi_f = { id: 'pi_f', amount: full - off, amount_received: full - off, metadata: { kind: 'booking', founding: 'true' } };
const fv = fakeVisit({ stripe_payment_intent_id: 'pi_f', paid_cents: full - off });
r = await act({ action: 'finish', visitId: fv.id, finalLoad: 2, dryRun: true });
ok(r.json.cents === full - off && r.json.discountCents === off && r.json.differenceCents === 0, `founding: the booked size is not what was paid ${JSON.stringify(r.json)}`);
const fBig = ORDER.SIZES[3].cents + 2500;
const fBigCents = fBig - Math.round(fBig * 25 / 100);
r = await act({ action: 'finish', visitId: fv.id, finalLoad: 3, agreed: true });
ok(piCalls()[0] && piCalls()[0].amount === fBigCents - (full - off) && r.json.cents === fBigCents, `founding: difference ${JSON.stringify(r.json)} ${piCalls()[0] && piCalls()[0].amount}`);
// paid_cents missing (a write that never landed): the booking PaymentIntent says what was paid
state.paymentIntents.pi_m = { id: 'pi_m', amount: PAID, amount_received: PAID, metadata: { kind: 'booking', founding: 'false' } };
const mv = fakeVisit({ stripe_payment_intent_id: 'pi_m', paid_cents: null });
ok((await act({ action: 'finish', visitId: mv.id, finalLoad: 2, dryRun: true })).json.paidCents === PAID, 'paid_cents missing: not read from the booking PaymentIntent');

console.log('== decline ==');
const v2 = fakeVisit();
reinstall({ decline: 'authentication_required' });
r = await act({ action: 'finish', visitId: v2.id, finalLoad: 3, agreed: true });
ok(r.status === 200 && r.json.paymentStatus === 'payment_needed' && invoiceSent() && alerts().length === 1, `decline not handled ${JSON.stringify(r.json)} alerts ${alerts().length}`);
ok(calls.some(([k, p]) => k === 'invoice' && p.collection_method === 'send_invoice' && p.days_until_due > 0 && p.metadata.visit_id === v2.id && p.metadata.kind === 'difference'), 'invoice params');
ok(calls.some(([k, p]) => k === 'invoice-item' && p.amount === big - PAID), 'the invoice is not for the difference');
ok(calls.some(([k, p]) => k === 'pi-update' && p.metadata.kind === 'difference' && p.metadata.visit_id === v2.id), 'the invoice payment intent was not stamped with kind and visit_id');
row = rows.get(v2.id);
ok(row.payment_status === 'payment_needed' && /^https:\/\/invoice\.example\//.test(row.invoice_url || '') && row.status === 'completed' && row.paid_cents === PAID, `declined visit ${JSON.stringify(row)}`);
ok(sent.some((e) => e.to === 'owner@example.com') && sent.some((e) => e.to === 'jane@example.com' && /invoice/i.test(e.subject || '')), 'owner or customer not told');
ok(allDone(), 'a declined difference sent no all done email (R13: the job is still done)');
ok(of('refund').length === 0, 'a declined difference refunded something');
r = await act({ action: 'finish', visitId: v2.id, finalLoad: 4, agreed: true });
ok(r.status === 409 && calls.length === 0 && alerts().length === 0, 'retry after a decline charged or invoiced again');
reinstall({ decline: 'card_declined' });
const v2b = fakeVisit();
r = await act({ action: 'finish', visitId: v2b.id, finalLoad: 3, agreed: true });
ok(r.json.paymentStatus === 'payment_needed' && invoiceSent(), 'card_declined not invoiced');
// the webhook's payment_failed lands first and marks payment_needed: the customer still gets one payment needed email, the owner one alert
const v2c = fakeVisit();
const realGet = db.getVisit; let reads = 0;
db.getVisit = async (id) => { const got = await realGet(id); reads++; if (reads === 2 && got) got.payment_status = 'payment_needed'; return got; };
r = await act({ action: 'finish', visitId: v2c.id, finalLoad: 3, agreed: true });
db.getVisit = realGet;
const pnMails = sent.filter((e) => e.to === 'jane@example.com' && /invoice/i.test(e.subject || ''));
ok(r.json.paymentStatus === 'payment_needed' && pnMails.length === 1 && /invoice\.example/.test(pnMails[0].html), `customer payment needed emails: ${pnMails.length}`);
ok(alerts().length === 0, 'the owner was alerted twice');

console.log('== not succeeded ==');
// R18: a difference PaymentIntent that is neither succeeded nor requires_payment_method is canceled before an invoice is sent.
reinstall({ offSessionStatus: 'processing' });
const vp = fakeVisit();
r = await act({ action: 'finish', visitId: vp.id, finalLoad: 3, agreed: true });
const kinds = calls.map(([k]) => k);
ok(r.status === 200 && r.json.paymentStatus === 'payment_needed' && kinds.includes('pi-cancel') && kinds.indexOf('pi-cancel') < kinds.indexOf('invoice'), `a processing difference was not canceled before the invoice: ${kinds.join(',')}`);
reinstall({ offSessionStatus: 'requires_payment_method' });
const vp2 = fakeVisit();
r = await act({ action: 'finish', visitId: vp2.id, finalLoad: 3, agreed: true });
ok(r.json.paymentStatus === 'payment_needed' && !of('pi-cancel').length && invoiceSent(), 'requires_payment_method was canceled or not invoiced');
reinstall({ offSessionStatus: 'processing', cancelFails: true });
const vp3 = fakeVisit();
r = await act({ action: 'finish', visitId: vp3.id, finalLoad: 3, agreed: true });
ok(r.status === 502 && !invoiceSent() && rows.get(vp3.id).status === 'scheduled' && rows.get(vp3.id).payment_status === 'paid', `a difference that could not be canceled was invoiced or completed ${r.status}`);

console.log('== money moved, the write failed ==');
reinstall();
const vw = fakeVisit();
failWrite = (patch) => patch.paid_cents != null;   // the write after the charge fails
r = await act({ action: 'finish', visitId: vw.id, finalLoad: 3, agreed: true });
failWrite = () => false;
const firstPi = r.json && r.json.paymentIntentId;
ok(r.status === 200 && firstPi, `charge with a failed write ${r.status} ${JSON.stringify(r.json)}`);
ok(rows.get(vw.id).final_load_idx === 3, 'the final size was not written before the money moved');
ok((await act({ action: 'finish', visitId: vw.id, finalLoad: 4, agreed: true })).status === 409 && moneyCalls().length === 0, 'after a charge whose write failed, another size charged again');
const vw2 = fakeVisit({ status: 'scheduled' });
failWrite = (patch) => patch.paid_cents != null || patch.status === 'completed';
r = await act({ action: 'finish', visitId: vw2.id, finalLoad: 3, agreed: true });
failWrite = () => false;
ok(rows.get(vw2.id).status === 'scheduled' && rows.get(vw2.id).final_load_idx === 3, 'test setup: the charge and the complete write were both lost');
ok((await act({ action: 'finish', visitId: vw2.id, finalLoad: 4, agreed: true })).status === 409 && moneyCalls().length === 0, 'with the size locked by the first try, another size was charged');
const again = await act({ action: 'finish', visitId: vw2.id, finalLoad: 3, agreed: true });
ok(again.status === 200 && again.json.paymentIntentId === r.json.paymentIntentId, `a same size retry made a second charge: ${r.json.paymentIntentId} then ${again.json && again.json.paymentIntentId}`);
failWrite = (patch) => patch.final_load_idx != null && patch.paid_cents == null && patch.refunded_cents == null && !patch.status;   // the write BEFORE the money fails
const vw3 = fakeVisit();
r = await act({ action: 'finish', visitId: vw3.id, finalLoad: 3, agreed: true });
failWrite = () => false;
ok(r.status === 502 && moneyCalls().length === 0, `money moved although the final size could not be written first: ${r.status}`);
reinstall({ refundFails: true });
const vr = fakeVisit();
r = await act({ action: 'finish', visitId: vr.id, finalLoad: 1 });
ok(r.status === 502 && rows.get(vr.id).status === 'scheduled' && !allDone(), `a failed refund completed the job or answered ${r.status}`);
reinstall();
r = await act({ action: 'finish', visitId: vr.id, finalLoad: 1 });
ok(r.status === 200 && refundCalls().length === 1 && rows.get(vr.id).refunded_cents === PAID - small, 'the refund retry did not go through once');

console.log('== cancel ==');
const early = fakeVisit({ scheduled_date: farDay, window_key: 'w10' });
r = await act({ action: 'cancel-refund', visitId: early.id, dryRun: true });
ok(r.status === 200 && r.json.refundCents === PAID && r.json.keptCents === 0 && r.json.late === false && moneyCalls().length === 0, `cancel dry run ${JSON.stringify(r.json)}`);
r = await act({ action: 'cancel-refund', visitId: early.id });
ok(r.status === 200 && refundCalls().length === 1 && refundCalls()[0].amount === PAID && refundCalls()[0].payment_intent === early.stripe_payment_intent_id && refundCalls()[0].key === `visit:${early.id}:cancel-refund`, `early cancel: full refund ${JSON.stringify(refundCalls())}`);
row = rows.get(early.id);
ok(row.status === 'canceled' && row.payment_status === 'refunded' && row.refunded_cents === PAID, `early cancel visit ${JSON.stringify(row)}`);
ok(sent.some((e) => e.to === 'jane@example.com' && e.html.includes($(PAID)) && /refund/i.test(e.html)), 'the customer was not told about the refund');
ok((await act({ action: 'cancel-refund', visitId: early.id })).status === 409 && moneyCalls().length === 0, 'canceled and refunded twice');
const late = fakeVisit({ scheduled_date: today, window_key: 'w14' });
r = await act({ action: 'cancel-refund', visitId: late.id });
ok(r.status === 200 && r.json.late === true && refundCalls()[0] && refundCalls()[0].amount === PAID - ORDER.POLICY.lateFeeCents && r.json.keptCents === ORDER.POLICY.lateFeeCents, `late cancel: refund less the late fee ${JSON.stringify(r.json)}`);
ok(rows.get(late.id).payment_status === 'late_fee_kept' && rows.get(late.id).status === 'canceled' && rows.get(late.id).final_cents === ORDER.POLICY.lateFeeCents, 'late cancel not recorded as late_fee_kept');
ok(sent.some((e) => e.to === 'jane@example.com' && e.html.includes($(ORDER.POLICY.lateFeeCents))), 'the late cancel email does not name the fee');
// only what is still unrefunded is refunded (R18)
const part = fakeVisit({ refunded_cents: 10000 });
r = await act({ action: 'cancel-refund', visitId: part.id });
ok(refundCalls()[0] && refundCalls()[0].amount === PAID - 10000 && rows.get(part.id).refunded_cents === PAID, `a partly refunded visit refunded more than was left ${JSON.stringify(refundCalls())}`);
// the fee is more than was paid: nothing to refund, no Stripe call
const tiny = fakeVisit({ scheduled_date: today, window_key: 'w14', paid_cents: 3000 });
r = await act({ action: 'cancel-refund', visitId: tiny.id });
ok(r.status === 200 && moneyCalls().length === 0 && r.json.refundCents === 0 && rows.get(tiny.id).payment_status === 'late_fee_kept', `a fee bigger than the payment: ${JSON.stringify(r.json)}`);
for (const status of ['in_progress', 'completed', 'canceled', 'declined']) {
  const x = fakeVisit({ status });
  ok((await act({ action: 'cancel-refund', visitId: x.id })).status === 409 && moneyCalls().length === 0, `a ${status} visit was canceled and refunded`);
}
const unpaid = fakeVisit({ payment_status: 'refunded' });
ok((await act({ action: 'cancel-refund', visitId: unpaid.id })).status === 409 && moneyCalls().length === 0, 'a refunded visit was refunded again');
reinstall({ refundFails: true });
const rfail = fakeVisit();
ok((await act({ action: 'cancel-refund', visitId: rfail.id })).status === 502 && rows.get(rfail.id).status === 'scheduled' && rows.get(rfail.id).payment_status === 'paid', 'a failed cancel refund still canceled the visit');
reinstall();
ok((await act({ action: 'late-fee', visitId: fakeVisit().id })).status === 400 && moneyCalls().length === 0, 'the old late-fee action still charges');
for (const action of ['cancel', 'skip']) {
  const x = fakeVisit();
  ok((await act({ action, visitId: x.id })).status === 409 && rows.get(x.id).status === 'scheduled', `a paid booking was closed by ${action} with no refund`);
}
const legacy = fakeVisit({ payment_status: null, paid_cents: null, quoted_cents: null, window_key: null });
ok((await act({ action: 'skip', visitId: legacy.id })).status === 200 && rows.get(legacy.id).status === 'skipped', 'a recurring visit with no booking payment can no longer be skipped');

console.log('== said no ==');
const v3 = fakeVisit();
r = await act({ action: 'declined', visitId: v3.id, dryRun: true });
ok(r.status === 200 && r.json.refundCents === PAID - ORDER.POLICY.refusalFeeCents && moneyCalls().length === 0, `said no dry run ${JSON.stringify(r.json)}`);
r = await act({ action: 'declined', visitId: v3.id });
ok(r.status === 200 && refundCalls().length === 1 && refundCalls()[0].amount === PAID - ORDER.POLICY.refusalFeeCents && refundCalls()[0].key === `visit:${v3.id}:declined-refund`, `said no refund ${JSON.stringify(refundCalls())}`);
ok(rows.get(v3.id).status === 'declined' && rows.get(v3.id).payment_status === 'refunded' && rows.get(v3.id).refunded_cents === PAID - ORDER.POLICY.refusalFeeCents, `said no visit ${JSON.stringify(rows.get(v3.id))}`);
ok(sent.some((e) => e.to === 'jane@example.com' && /refund/i.test(e.html)), 'the customer was not told about the refund');
ok((await act({ action: 'declined', visitId: v3.id })).status === 409 && moneyCalls().length === 0, 'said no refunded twice');
ok((await act({ action: 'finish', visitId: v3.id, finalLoad: 2 })).status === 409 && moneyCalls().length === 0, 'a declined visit was finished');
ok((await act({ action: 'finish', visitId: early.id, finalLoad: 2 })).status === 409 && moneyCalls().length === 0, 'a canceled visit was finished');
// a refusal fee, when the founder sets one, is kept
const realFee = ORDER.POLICY.refusalFeeCents;
ORDER.POLICY.refusalFeeCents = 2500;
const v4 = fakeVisit();
r = await act({ action: 'declined', visitId: v4.id });
ORDER.POLICY.refusalFeeCents = realFee;
ok(refundCalls()[0] && refundCalls()[0].amount === PAID - 2500 && r.json.keptCents === 2500, `the refusal fee was not kept ${JSON.stringify(r.json)}`);
for (const status of ['completed', 'canceled']) {
  const x = fakeVisit({ status });
  ok((await act({ action: 'declined', visitId: x.id })).status === 409 && moneyCalls().length === 0, `said no on a ${status} visit refunded`);
}
// said no once the job is under way (a before photo sets in_progress): one refund, less the fee
const v5 = fakeVisit({ status: 'in_progress' });
r = await act({ action: 'declined', visitId: v5.id, dryRun: true });
ok(r.status === 200 && r.json.refundCents === PAID - ORDER.POLICY.refusalFeeCents && moneyCalls().length === 0, `said no during a job, dry run ${JSON.stringify(r.json)}`);
r = await act({ action: 'declined', visitId: v5.id });
ok(r.status === 200 && refundCalls().length === 1 && moneyCalls().length === 1 && refundCalls()[0].amount === PAID - ORDER.POLICY.refusalFeeCents && refundCalls()[0].payment_intent === v5.stripe_payment_intent_id && refundCalls()[0].key === `visit:${v5.id}:declined-refund`, `said no during a job: refunds ${JSON.stringify(refundCalls())}`);
ok(rows.get(v5.id).status === 'declined' && rows.get(v5.id).refunded_cents === PAID - ORDER.POLICY.refusalFeeCents, `said no during a job, visit ${JSON.stringify(rows.get(v5.id))}`);
ok((await act({ action: 'declined', visitId: v5.id })).status === 409 && moneyCalls().length === 0, 'said no during a job refunded twice');
// with a refusal fee set, the fee is kept on an in_progress visit too
ORDER.POLICY.refusalFeeCents = 2500;
const v6 = fakeVisit({ status: 'in_progress' });
r = await act({ action: 'declined', visitId: v6.id });
ORDER.POLICY.refusalFeeCents = realFee;
ok(r.status === 200 && refundCalls().length === 1 && refundCalls()[0].amount === PAID - 2500 && r.json.keptCents === 2500 && rows.get(v6.id).status === 'declined' && rows.get(v6.id).final_cents === 2500, `said no during a job did not keep the fee ${JSON.stringify(r.json)}`);
// the refund fails: the job stays under way, nothing recorded
reinstall({ refundFails: true });
const v7 = fakeVisit({ status: 'in_progress' });
ok((await act({ action: 'declined', visitId: v7.id })).status === 502 && rows.get(v7.id).status === 'in_progress' && rows.get(v7.id).payment_status === 'paid' && rows.get(v7.id).refunded_cents === 0, `a failed said no refund still closed the job ${JSON.stringify(rows.get(v7.id))}`);
reinstall();
// cancel and refund still refuses a job under way, and points at the two actions that fit
r = await act({ action: 'cancel-refund', visitId: fakeVisit({ status: 'in_progress' }).id });
ok(r.status === 409 && moneyCalls().length === 0 && r.json.error === 'This job is under way. Use Customer said no, or Finish.', `cancel during a job: ${JSON.stringify(r.json)}`);
// once Finish has started settling a size (money may have moved), neither refund path may run
for (const [action, status] of [['declined', 'in_progress'], ['declined', 'scheduled'], ['cancel-refund', 'scheduled']]) {
  const x = fakeVisit({ status, final_load_idx: 3 });
  r = await act({ action, visitId: x.id });
  ok(r.status === 409 && r.json.finalLoad === 3 && moneyCalls().length === 0 && rows.get(x.id).status === status, `${action} ran on a ${status} job Finish had started settling ${JSON.stringify(r.json)}`);
}

console.log('== en route ==');
const er = fakeVisit();
ok((await act({ action: 'en-route', visitId: er.id })).status === 200 && rows.get(er.id).en_route_at && moneyCalls().length === 0, 'en-route not stamped');

console.log('== auth ==');
for (const action of ['finish', 'cancel-refund', 'declined']) {
  ok((await act({ action, visitId: v.id }, { token: null })).status === 401, `${action}: no token accepted`);
  ok((await act({ action, visitId: v.id }, { token: null, queryToken: true })).status === 401, `${action}: ?token= accepted`);
  ok((await act({ action, visitId: v.id }, { token: 'wrong' })).status === 401, `${action}: wrong token accepted`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
