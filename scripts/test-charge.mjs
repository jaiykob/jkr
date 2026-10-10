// The after job charge (api/visit-update.js): the final size priced on the
// server, one charge only, an invoice on a decline, the customer saying no and
// the late cancel fee. Real handler, fake Stripe, fake database (exports on the
// loaded api/_lib/db.js), recorded email and Discord. No network.
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

// The database: visit rows in memory.
const db = require(path.join(ROOT, 'api/_lib/db.js'));
const rows = new Map();
db.getVisit = async (id) => (rows.has(id) ? JSON.parse(JSON.stringify(rows.get(id))) : null);
db.getVisitContext = async (id) => (rows.has(id) ? { ...rows.get(id), subscriptions: null, visit_photos: [] } : null);
db.updateVisit = async (id, patch) => { if (!rows.has(id)) return null; Object.assign(rows.get(id), patch); return { ...rows.get(id) }; };
db.signPhotoDownload = async () => null;

const ORDER = require(path.join(ROOT, 'api/_lib/order-config.js'));
const handler = require(path.join(ROOT, 'api/visit-update.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

let seq = 0;
const today = ORDER.todayPacific(Date.now());
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const farDay = addDays(today, 10);
function fakeVisit(over = {}) {
  const id = `visit_${++seq}`;
  rows.set(id, {
    id, status: 'in_progress', scheduled_date: farDay, window_key: 'w10',
    quoted_load_idx: 2, quoted_load_cents: 34900, quoted_cents: 34900 + 2500, travel_cents: 2500,
    payment_status: 'card_saved', stripe_setup_intent_id: `seti_v${seq}`, stripe_payment_method_id: 'pm_saved',
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
const piCalls = () => calls.filter(([k]) => k === 'pi').map(([, p]) => p);
const invoiceSent = () => calls.some(([k]) => k === 'send-invoice');
const alerts = () => pings.filter((p) => p.url === process.env.OPS_WEBHOOK_URL);
const setPrice = (row, cents) => { ORDER.SIZES[row].cents = cents; };
const realPrice2 = ORDER.SIZES[2].cents;

// visit booked at 1/2 truck for 34900 + 2500 travel
const v = fakeVisit();
console.log('== price ==');
let r = await act({ action: 'finish', visitId: v.id, finalLoad: 2, dryRun: true });
ok(r.json && r.json.cents === 37400 && calls.length === 0, `dry run charged or mispriced ${JSON.stringify(r.json)}`);
ok(r.json.loadCents === 34900 && r.json.travelCents === 2500 && r.json.charged === false, 'dry run breakdown');
setPrice(2, 39900);   // the table changed after booking
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 2, dryRun: true })).json.cents === 37400, 'booked size not charged its quoted cents');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 3, dryRun: true })).json.cents === ORDER.SIZES[3].cents + 2500, 'new size not today\'s price plus booked travel');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 99, dryRun: true })).status === 400, 'a size that does not exist was priced');
console.log('== agreement ==');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 3 })).status === 400 && calls.length === 0, 'bigger size charged without agreement');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 3, agreed: 'true' })).status === 400 && calls.length === 0, 'a truthy string counted as agreement');
console.log('== charge once ==');
r = await act({ action: 'finish', visitId: v.id, finalLoad: 3, agreed: true });
ok(r.status === 200 && piCalls().length === 1 && piCalls()[0].off_session === true && piCalls()[0].metadata.kind === 'final_charge', `final charge ${r.status} ${JSON.stringify(r.json)}`);
const p0 = piCalls()[0];
ok(p0.amount === ORDER.SIZES[3].cents + 2500 && p0.customer === 'cus_1' && p0.payment_method === 'pm_saved' && p0.confirm === true && p0.currency === 'usd', `charge params ${JSON.stringify(p0)}`);
ok(p0.automatic_payment_methods && p0.automatic_payment_methods.allow_redirects === 'never' && p0.automatic_payment_methods.enabled === true, 'final charge lacks automatic_payment_methods with allow_redirects never');
ok(p0.metadata.visit_id === v.id && p0.metadata.final_load_idx === '3', 'charge metadata');
ok(r.json.charged === true && r.json.paymentStatus === 'paid' && r.json.cents === p0.amount, 'finish answer');
ok(rows.get(v.id).payment_status === 'paid' && rows.get(v.id).final_load_idx === 3 && rows.get(v.id).final_cents === p0.amount && rows.get(v.id).stripe_payment_intent_id, 'visit not marked paid');
ok(rows.get(v.id).status === 'completed' && sent.some((e) => /All done/i.test(e.subject)), 'the complete path did not run after the charge');
ok(sent.some((e) => e.to === 'jane@example.com' && /receipt/i.test(e.subject) && /\$/.test(e.html)), 'no receipt');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 3, agreed: true })).status === 409 && piCalls().length === 0, 'charged twice');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 1, agreed: true })).status === 409 && piCalls().length === 0, 'charged a second size');
setPrice(2, realPrice2);
const k1 = fakeVisit();
await act({ action: 'finish', visitId: k1.id, finalLoad: 2 });
ok(piCalls().length === 1, 'same size, no charge');
console.log('== founding ==');
state.setupIntents.seti_f = { id: 'seti_f', metadata: { founding: 'true' } };
const fv = fakeVisit({ stripe_setup_intent_id: 'seti_f' });
const fd = await act({ action: 'finish', visitId: fv.id, finalLoad: 2, dryRun: true });
const full = 34900 + 2500;
const off = Math.round(full * 25 / 100);
ok(fd.json.cents === full - off, `founding not taken off ${JSON.stringify(fd.json)}`);
await act({ action: 'finish', visitId: fv.id, finalLoad: 2 });
ok(piCalls()[0] && piCalls()[0].amount === full - off, 'founding discount missing from the charge');
console.log('== decline ==');
const v2 = fakeVisit({ quoted_load_idx: 1, quoted_load_cents: 19900, quoted_cents: 19900, travel_cents: 0 });
reinstall({ decline: 'authentication_required' });
r = await act({ action: 'finish', visitId: v2.id, finalLoad: 1 });
ok(r.json.paymentStatus === 'payment_needed' && invoiceSent() && alerts().length === 1, `decline not handled ${JSON.stringify(r.json)} alerts ${alerts().length}`);
ok(calls.some(([k, p]) => k === 'invoice' && p.collection_method === 'send_invoice' && p.days_until_due > 0 && p.metadata.visit_id === v2.id && p.metadata.kind === 'final_charge'), 'invoice params');
ok(calls.some(([k, p]) => k === 'invoice-item' && p.amount === 19900), 'invoice item amount');
ok(rows.get(v2.id).payment_status === 'payment_needed' && /^https:\/\/invoice\.example\//.test(rows.get(v2.id).invoice_url || ''), 'invoice url not stored');
ok(sent.some((e) => e.to === 'owner@example.com') && sent.some((e) => e.to === 'jane@example.com'), 'owner or customer not told');
ok(rows.get(v2.id).status === 'completed' && rows.get(v2.id).payment_status === 'payment_needed' && rows.get(v2.id).invoice_url, 'a declined visit was not completed with payment_needed kept');
ok(sent.some((e) => /All done/i.test(e.subject)), 'a declined visit sent no all done email');
ok(calls.some(([k, p]) => k === 'pi-update' && p.metadata.kind === 'final_charge' && p.metadata.visit_id === v2.id), 'the invoice payment intent was not stamped with kind and visit_id');
ok(piCalls()[0].automatic_payment_methods && piCalls()[0].automatic_payment_methods.enabled === true && piCalls()[0].automatic_payment_methods.allow_redirects === 'never', 'charge lacks automatic_payment_methods never redirect');
// a retry with another size after the decline must not create a second charge or invoice
r = await act({ action: 'finish', visitId: v2.id, finalLoad: 2, agreed: true });
ok(r.status === 409 && calls.length === 0 && alerts().length === 0, 'retry after a decline charged or invoiced again');
// a plain decline also invoices
reinstall({ decline: 'card_declined' });
const v2b = fakeVisit({ quoted_load_idx: 1, quoted_load_cents: 19900, quoted_cents: 19900, travel_cents: 0 });
r = await act({ action: 'finish', visitId: v2b.id, finalLoad: 1 });
ok(r.json.paymentStatus === 'payment_needed' && invoiceSent(), 'card_declined not invoiced');
// the webhook's payment_failed lands first and marks payment_needed: the customer still gets one payment needed email
const v2c = fakeVisit({ quoted_load_idx: 1, quoted_load_cents: 19900, quoted_cents: 19900, travel_cents: 0 });
const realGet = db.getVisit; let reads = 0;
db.getVisit = async (id) => { const row = await realGet(id); reads++; if (reads === 2 && row) row.payment_status = 'payment_needed'; return row; };
r = await act({ action: 'finish', visitId: v2c.id, finalLoad: 1 });
db.getVisit = realGet;
const pnMails = sent.filter((e) => e.to === 'jane@example.com' && /invoice/i.test(e.subject));
ok(r.json.paymentStatus === 'payment_needed' && pnMails.length === 1 && /invoice\.example/.test(pnMails[0].html), `customer payment needed emails: ${pnMails.length}`);
ok(alerts().length === 0, 'the owner was alerted twice');
reinstall();
console.log('== said no and late fee ==');
const v3 = fakeVisit({ payment_status: 'card_saved' });
ok((await act({ action: 'declined', visitId: v3.id })).status === 200 && calls.length === 0, 'said no touched Stripe');
ok(rows.get(v3.id).payment_status === 'no_charge', 'said no not recorded');
ok((await act({ action: 'finish', visitId: v3.id, finalLoad: 2 })).status === 409, 'a no charge visit was charged');
const early = fakeVisit({ scheduled_date: farDay, window_key: 'w10', payment_status: 'card_saved' });
ok((await act({ action: 'late-fee', visitId: early.id })).status === 400 && calls.length === 0, 'late fee outside the window');
const late = fakeVisit({ scheduled_date: today, window_key: 'w14', payment_status: 'card_saved' });
r = await act({ action: 'late-fee', visitId: late.id });
ok(r.status === 200 && piCalls().at(-1).amount === ORDER.POLICY.lateFeeCents && piCalls().at(-1).metadata.kind === 'late_fee' && piCalls().at(-1).off_session === true && piCalls().at(-1).automatic_payment_methods && piCalls().at(-1).automatic_payment_methods.allow_redirects === 'never', `late fee ${r.status}`);
ok(rows.get(late.id).payment_status === 'late_fee_paid' && sent.some((e) => e.to === 'jane@example.com'), 'late fee not recorded or told');
ok((await act({ action: 'late-fee', visitId: late.id })).status === 409 && calls.length === 0, 'late fee charged twice');
const er = fakeVisit();
ok((await act({ action: 'en-route', visitId: er.id })).status === 200 && rows.get(er.id).en_route_at, 'en-route not stamped');
console.log('== auth ==');
ok((await act({ action: 'finish', visitId: v.id }, { token: null })).status === 401, 'no token accepted');
ok((await act({ action: 'finish', visitId: v.id }, { token: null, queryToken: true })).status === 401, '?token= accepted');
ok((await act({ action: 'finish', visitId: v.id }, { token: 'wrong' })).status === 401, 'wrong token accepted');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
