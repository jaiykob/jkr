/**
 * Vercel Serverless Function — visit-update
 *
 * Founder-only visit actions for the admin dashboard. The operator's whole field
 * workflow runs through here: start a job, mark it done (which fires the
 * "all done" serviceComplete email + queues the next recurring visit), skip,
 * or cancel.
 *
 * AUTH: same admin token as admin-data.js (ADMIN_DASHBOARD_TOKEN, x-admin-token
 * header, constant-time compare). Writes go through the service_role key in
 * api/_lib/db.js — never the browser.
 *
 * POST body: { action: 'start'|'complete'|'skip'|'cancel'|'finish'|'declined'|'late-fee'|'en-route', visitId, notes? }
 *   finish    { finalLoad, agreed, dryRun }: price the final size on the server, charge the
 *             saved card once, then run `complete`. A decline sends a hosted invoice.
 *   declined  the customer said no on site: no charge, no Stripe call.
 *   late-fee  the late cancel fee, only when ORDER.isLateCancel.
 *   en-route  stamps en_route_at.
 *
 * Required env vars: ADMIN_DASHBOARD_TOKEN, SUPABASE_SERVICE_ROLE_KEY
 * (+ RESEND_API_KEY for the serviceComplete email; dry-runs without it).
 */

const crypto = require('crypto');
const db = require('./_lib/db');
const { sendEmail } = require('./_lib/email');
const tpl = require('./_lib/email-templates');
const { nextVisitDate } = require('./_lib/schedule');
const ORDER = require('./_lib/order-config');
const founding = require('./_lib/founding');
const { alertPaymentNeeded, money } = require('./_lib/charge-alerts');

const INVOICE_DAYS = 3;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(Buffer.from(String(a))).digest();
  const hb = crypto.createHash('sha256').update(Buffer.from(String(b))).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(`${String(d).slice(0, 10)}T12:00:00Z`);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

async function completeVisit(visitId, notePatch, now) {
  const ctx = await db.getVisitContext(visitId);
  if (!ctx) return [404, { error: 'Visit not found (or schema not applied)' }];

  const cust = ctx.customers || {};
  const sub  = ctx.subscriptions || {};

  // Sign the most recent "after" + "before" photos, if uploaded, for the
  // email. A missing photo isn't an error: the email just shows less.
  const latest = (kind) => (ctx.visit_photos || []).filter((p) => p.kind === kind)
    .sort((a, b) => new Date(b.taken_at || 0) - new Date(a.taken_at || 0))[0];
  const sign = async (p) => (p ? db.signPhotoDownload(p.storage_path) : null);
  const [photoUrl, beforePhotoUrl] = await Promise.all([
    sign(latest('after')), sign(latest('before')),
  ]);

  // Queue the next recurring visit (active recurring plans only).
  let nextDate = null;
  if (sub.status === 'active') {
    nextDate = nextVisitDate({ freqIdx: sub.freq_idx, afterDate: ctx.scheduled_date });
    if (nextDate) await db.createVisit({
      customerId: ctx.customer_id, subscriptionId: sub.id || null, scheduledDate: nextDate,
    });
  }

  const v = await db.updateVisit(visitId, {
    status: 'completed', completed_at: now, client_notified_at: now, ...notePatch,
  });

  if (cust.email) {
    const msg = tpl.serviceComplete({
      name:          cust.first_name,
      visitDate:     fmtDate(ctx.scheduled_date),
      nextVisitDate: fmtDate(nextDate),
      photoUrl,
      beforePhotoUrl,
      address:       cust.address,
    });
    await sendEmail({ to: cust.email, kind: 'transactional', idempotencyKey: `visit:${visitId}:complete`, ...msg });
  }

  return [200, { ok: !!v, visit: v, nextDate, emailed: !!cust.email, afterPhoto: !!photoUrl }];
}

/* ───────────────  AFTER THE JOB: the charge  ─────────────── */

const isDeclined = (e) => e && (e.type === 'StripeCardError' || e.code === 'card_declined' || e.code === 'authentication_required');
const intOrNull = (n) => (n === null || n === undefined || n === '' || !Number.isFinite(Number(n)) ? null : Math.round(Number(n)));

/**
 * What the final charge is, in integer cents. The booked size is charged the
 * cents quoted at booking; any other size is today's price; travel is always
 * the travel stored at booking. A founding customer (stamped on the SetupIntent
 * at booking) gets the founding percent off the whole amount.
 */
async function priceFinal(stripe, visit, finalLoad) {
  const size = ORDER.SIZES[finalLoad];
  const bookedIdx = intOrNull(visit.quoted_load_idx);
  const quotedLoad = intOrNull(visit.quoted_load_cents);
  const loadCents = finalLoad === bookedIdx && quotedLoad !== null ? quotedLoad : size.cents;
  const travelCents = intOrNull(visit.travel_cents) || 0;
  const beforeDiscount = loadCents + travelCents;
  const quotedTotal = intOrNull(visit.quoted_cents) !== null ? intOrNull(visit.quoted_cents) : (quotedLoad || 0) + travelCents;
  let discountCents = 0;
  if (visit.stripe_setup_intent_id) {
    const si = await stripe.setupIntents.retrieve(visit.stripe_setup_intent_id);
    if (si && si.metadata && si.metadata.founding === 'true') discountCents = Math.round(beforeDiscount * founding.FOUNDING.percentOff / 100);
  }
  return { loadCents, travelCents, beforeDiscount, quotedTotal, discountCents, cents: beforeDiscount - discountCents };
}

/** Charge the saved card off session. Throws Stripe's error; a payment that needs the customer counts as a decline. */
async function chargeSavedCard(stripe, visit, { amount, kind, finalLoad, key, description }) {
  const cust = visit.customers || {};
  const pi = await stripe.paymentIntents.create({
    amount, currency: 'usd', customer: cust.stripe_customer_id, payment_method: visit.stripe_payment_method_id,
    off_session: true, confirm: true, description,
    metadata: { kind, visit_id: String(visit.id), ...(finalLoad !== undefined ? { final_load_idx: String(finalLoad) } : {}) },
  }, { idempotencyKey: key });
  if (!pi || pi.status !== 'succeeded') {
    const e = new Error(`Payment is ${pi && pi.status}`);
    e.type = 'StripeCardError'; e.code = 'authentication_required';
    throw e;
  }
  return pi;
}

/**
 * The card was declined: send a hosted invoice for the same amount, remember
 * its link, and alert the owner ONCE. The webhook can see the same decline,
 * so both dedupe on the visit's payment_status.
 */
async function invoiceInstead(stripe, visit, { amount, kind, finalLoad, keyBase, patch, reason }) {
  const cust = visit.customers || {};
  const metadata = { visit_id: String(visit.id), kind, ...(finalLoad !== undefined ? { final_load_idx: String(finalLoad) } : {}) };
  const desc = kind === 'late_fee' ? 'Late cancel fee' : 'Junk removal';
  const inv = await stripe.invoices.create({
    customer: cust.stripe_customer_id, collection_method: 'send_invoice', days_until_due: INVOICE_DAYS,
    pending_invoice_items_behavior: 'exclude', description: desc, metadata,
  }, { idempotencyKey: `${keyBase}:invoice` });
  await stripe.invoiceItems.create({
    customer: cust.stripe_customer_id, invoice: inv.id, amount, currency: 'usd', description: desc, metadata,
  }, { idempotencyKey: `${keyBase}:invoice-item` });
  const fin = await stripe.invoices.finalizeInvoice(inv.id);
  const sentInv = await stripe.invoices.sendInvoice(inv.id);
  const invoiceUrl = (sentInv && sentInv.hosted_invoice_url) || (fin && fin.hosted_invoice_url) || null;

  const fresh = await db.getVisit(visit.id);
  const alreadyAlerted = !!fresh && fresh.payment_status === 'payment_needed';
  const row = await db.updateVisit(visit.id, { ...patch, payment_status: 'payment_needed', invoice_url: invoiceUrl });
  if (!row) console.error('[visit-update] could not store the invoice on visit', visit.id);
  if (!alreadyAlerted) {
    await alertPaymentNeeded(visit, { cents: amount, kind, invoiceUrl, reason, sendEmail });
    if (cust.email) {
      const msg = tpl.paymentNeeded({ name: cust.first_name, amount: money(amount), invoiceUrl });
      await sendEmail({ to: cust.email, kind: 'transactional', idempotencyKey: `${keyBase}:payment-needed`, ...msg });
    }
  }
  return invoiceUrl;
}

const NOT_CHARGEABLE = {
  paid: 'This visit is already paid.',
  late_fee_paid: 'The late fee on this visit is already paid.',
  no_charge: 'This visit was marked no charge.',
  payment_needed: 'An invoice is already out for this visit. Wait for it to be paid, or void it in Stripe first.',
};

function stripeClient() {
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
}

function dayLabel(date) {
  const d = date ? new Date(`${String(date).slice(0, 10)}T12:00:00Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null;
}

async function finishVisit(body, visit, notePatch, now) {
  if (NOT_CHARGEABLE[visit.payment_status]) return [409, { error: NOT_CHARGEABLE[visit.payment_status], paymentStatus: visit.payment_status }];
  const finalLoad = body.finalLoad === undefined || body.finalLoad === null || body.finalLoad === ''
    ? intOrNull(visit.quoted_load_idx) : Number(body.finalLoad);
  if (!Number.isInteger(finalLoad) || !ORDER.SIZES[finalLoad]) return [400, { error: 'finalLoad is not a size' }];
  if (!process.env.STRIPE_SECRET_KEY) return [500, { error: 'STRIPE_SECRET_KEY not configured' }];
  const stripe = stripeClient();

  let p;
  try { p = await priceFinal(stripe, visit, finalLoad); }
  catch (e) { console.error('[visit-update] pricing failed:', e.message); return [502, { error: 'Could not read the booking from Stripe. Nothing was charged.' }]; }
  const answer = { cents: p.cents, loadCents: p.loadCents, travelCents: p.travelCents, discountCents: p.discountCents, charged: false, paymentStatus: visit.payment_status };
  if (body.dryRun) return [200, { ...answer, dryRun: true }];

  if (p.beforeDiscount > p.quotedTotal && body.agreed !== true) {
    return [400, { error: 'The new price is higher than the booked price. The customer must agree first.', code: 'agreement_required', ...answer }];
  }
  if (!visit.customers || !visit.customers.stripe_customer_id || !visit.stripe_payment_method_id) return [400, { error: 'This visit has no saved card.' }];
  if (p.cents < 50) return [400, { error: 'The amount is too small to charge.' }];

  const key = `visit:${visit.id}:final:${finalLoad}`;
  const patch = { final_load_idx: finalLoad, final_cents: p.cents };
  let pi;
  try {
    pi = await chargeSavedCard(stripe, visit, { amount: p.cents, kind: 'final_charge', finalLoad, key, description: 'Junk removal' });
  } catch (e) {
    if (!isDeclined(e)) {
      console.error('[visit-update] charge failed:', e.message);
      return [e.type === 'StripeIdempotencyError' ? 409 : 502, { error: 'The charge did not go through. Check Stripe before trying again.' }];
    }
    try {
      const invoiceUrl = await invoiceInstead(stripe, visit, { amount: p.cents, kind: 'final_charge', finalLoad, keyBase: key, patch, reason: e.message });
      return [200, { ...answer, paymentStatus: 'payment_needed', invoiceUrl, declined: e.code || 'declined' }];
    } catch (e2) {
      console.error('[visit-update] invoice failed:', e2.message);
      return [502, { error: 'The card was declined and the invoice could not be sent. Send one from Stripe.' }];
    }
  }

  // Money moved. From here nothing may fail the answer.
  const row = await db.updateVisit(visit.id, { ...patch, payment_status: 'paid', stripe_payment_intent_id: pi.id });
  if (!row) console.error('[visit-update] CHARGED but could not mark visit paid:', visit.id, pi.id);
  const cust = visit.customers || {};
  if (cust.email) {
    try {
      const size = ORDER.SIZES[finalLoad];
      const msg = tpl.receipt({
        name: cust.first_name, amount: money(p.cents), load: size.label,
        travel: p.travelCents ? money(p.travelCents) : null, discount: p.discountCents ? `-${money(p.discountCents)}` : null,
        dayLabel: dayLabel(visit.scheduled_date),
      });
      await sendEmail({ to: cust.email, kind: 'transactional', idempotencyKey: `${pi.id}:receipt`, ...msg });
    } catch (e) { console.error('[visit-update] receipt failed:', e.message); }
  }
  const out = { ...answer, charged: true, paymentStatus: 'paid', paymentIntentId: pi.id };
  try {
    const [code, done] = await completeVisit(visit.id, notePatch, now);
    out.completed = code === 200; out.visit = done.visit; out.nextDate = done.nextDate;
  } catch (e) { console.error('[visit-update] charged, but complete failed:', e.message); out.completed = false; }
  return [200, out];
}

async function lateFeeVisit(visit, now) {
  if (NOT_CHARGEABLE[visit.payment_status]) return [409, { error: NOT_CHARGEABLE[visit.payment_status], paymentStatus: visit.payment_status }];
  if (!ORDER.isLateCancel(String(visit.scheduled_date || '').slice(0, 10), visit.window_key, Date.parse(now))) {
    return [400, { error: 'This booking is still inside the free cancel window.' }];
  }
  const amount = ORDER.POLICY.lateFeeCents;
  if (!(amount >= 50)) return [400, { error: 'The late fee is not set.' }];
  if (!visit.customers || !visit.customers.stripe_customer_id || !visit.stripe_payment_method_id) return [400, { error: 'This visit has no saved card.' }];
  if (!process.env.STRIPE_SECRET_KEY) return [500, { error: 'STRIPE_SECRET_KEY not configured' }];
  const stripe = stripeClient();
  const key = `visit:${visit.id}:late-fee`;
  const patch = { status: 'canceled', final_cents: amount };
  let pi;
  try {
    pi = await chargeSavedCard(stripe, visit, { amount, kind: 'late_fee', key, description: 'Late cancel fee' });
  } catch (e) {
    if (!isDeclined(e)) {
      console.error('[visit-update] late fee failed:', e.message);
      return [502, { error: 'The charge did not go through. Check Stripe before trying again.' }];
    }
    try {
      const invoiceUrl = await invoiceInstead(stripe, visit, { amount, kind: 'late_fee', keyBase: key, patch, reason: e.message });
      return [200, { cents: amount, charged: false, paymentStatus: 'payment_needed', invoiceUrl }];
    } catch (e2) {
      console.error('[visit-update] late fee invoice failed:', e2.message);
      return [502, { error: 'The card was declined and the invoice could not be sent. Send one from Stripe.' }];
    }
  }
  const row = await db.updateVisit(visit.id, { ...patch, payment_status: 'late_fee_paid', stripe_payment_intent_id: pi.id });
  if (!row) console.error('[visit-update] CHARGED late fee but could not mark visit:', visit.id, pi.id);
  const cust = visit.customers || {};
  if (cust.email) {
    try {
      const msg = tpl.lateFee({ name: cust.first_name, amount: money(amount), dayLabel: dayLabel(visit.scheduled_date), windowLabel: (ORDER.SCHEDULE.windows.find((w) => w.key === visit.window_key) || {}).label, cancelHours: ORDER.POLICY.cancelHours });
      await sendEmail({ to: cust.email, kind: 'transactional', idempotencyKey: `${pi.id}:receipt`, ...msg });
    } catch (e) { console.error('[visit-update] late fee email failed:', e.message); }
  }
  return [200, { cents: amount, charged: true, paymentStatus: 'late_fee_paid', paymentIntentId: pi.id }];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.ADMIN_DASHBOARD_TOKEN;
  if (!TOKEN)                                return res.status(500).json({ error: 'ADMIN_DASHBOARD_TOKEN not configured' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });

  const provided = req.headers['x-admin-token'];
  if (!provided || !safeEqual(provided, TOKEN)) return res.status(401).json({ error: 'Unauthorized' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  body = body || {};
  const { action, visitId, notes } = body;
  if (!visitId || !action) return res.status(400).json({ error: 'Missing visitId or action' });

  const now = new Date().toISOString();
  const notePatch = notes ? { operator_notes: String(notes).slice(0, 2000) } : {};

  try {
    if (action === 'start') {
      const v = await db.updateVisit(visitId, { status: 'in_progress', started_at: now, ...notePatch });
      return res.status(200).json({ ok: !!v, visit: v });
    }

    if (action === 'skip' || action === 'cancel') {
      const v = await db.updateVisit(visitId, { status: action === 'skip' ? 'skipped' : 'canceled', ...notePatch });
      return res.status(200).json({ ok: !!v, visit: v });
    }

    if (action === 'complete') {
      const [code, json] = await completeVisit(visitId, notePatch, now);
      return res.status(code).json(json);
    }

    if (action === 'en-route') {
      const v = await db.updateVisit(visitId, { en_route_at: now, ...notePatch });
      return res.status(200).json({ ok: !!v, visit: v });
    }

    if (action === 'finish' || action === 'declined' || action === 'late-fee') {
      const visit = await db.getVisit(visitId);
      if (!visit) return res.status(404).json({ error: 'Visit not found (or schema not applied)' });

      if (action === 'declined') {
        // The customer said no on site: no Stripe call, nothing charged.
        if (NOT_CHARGEABLE[visit.payment_status]) return res.status(409).json({ error: NOT_CHARGEABLE[visit.payment_status], paymentStatus: visit.payment_status });
        const v = await db.updateVisit(visitId, { payment_status: 'no_charge', final_cents: 0, status: 'canceled', ...notePatch });
        return res.status(200).json({ ok: !!v, paymentStatus: 'no_charge', visit: v });
      }
      const [code, json] = action === 'finish' ? await finishVisit(body, visit, notePatch, now) : await lateFeeVisit(visit, now);
      return res.status(code).json(json);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error('[visit-update] failed:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
