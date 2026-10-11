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
 * PAY AT BOOKING (founder, 2026-10-10): the customer paid the quoted total when
 * booking (the booking PaymentIntent, visit.stripe_payment_intent_id) and the
 * card was saved. After the job the difference is settled against what was
 * paid (visit.paid_cents less visit.refunded_cents):
 *
 * POST body: { action, visitId, notes? }, action one of
 *   start | complete | skip | cancel | en-route      (skip and cancel refuse a paid booking)
 *   finish         { finalLoad, agreed, dryRun }: price the final size on the server
 *                  (the booked size at its quoted cents, another size at today's
 *                  price, travel as stored, founding off as at booking) and settle:
 *                    bigger   charge the difference to the saved card off session
 *                             (needs agreed === true); a decline sends a hosted invoice
 *                    smaller  refund the difference on the booking payment
 *                    same     no Stripe call
 *                  then run `complete` (a declined difference still completes, R13).
 *   cancel-refund  { dryRun }: cancel a scheduled booking with a full refund, or
 *                  less the late fee inside ORDER.POLICY.cancelHours.
 *   declined       { dryRun }: the customer said no on site: refund less the refusal fee.
 *
 * Money safety (Review Focus 1, ruling R18): every Stripe call has an idempotency
 * key per visit (and size); the final size is written BEFORE money moves, so a
 * retry after a lost write can only repeat that size (same keys, no second
 * charge); a finished, canceled or declined visit refuses another settlement;
 * refunds never exceed what is still unrefunded.
 *
 * Required env vars: ADMIN_DASHBOARD_TOKEN, SUPABASE_SERVICE_ROLE_KEY,
 * STRIPE_SECRET_KEY (+ RESEND_API_KEY for the emails; dry-runs without it).
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
const MIN_CHARGE_CENTS = 50;   // Stripe's smallest card charge in usd: a smaller difference is waived

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

/* ───────────────  AFTER THE JOB: settle the difference  ─────────────── */

const isDeclined = (e) => e && (e.type === 'StripeCardError' || e.code === 'card_declined' || e.code === 'authentication_required');
const intOrNull = (n) => (n === null || n === undefined || n === '' || !Number.isFinite(Number(n)) ? null : Math.round(Number(n)));
const sizeLabel = (i) => (ORDER.SIZES[i] ? ORDER.SIZES[i].label : 'another size');
const windowLabel = (key) => (ORDER.SCHEDULE.windows.find((w) => w.key === key) || {}).label;

function stripeClient() {
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
}

function dayLabel(date) {
  const d = date ? new Date(`${String(date).slice(0, 10)}T12:00:00Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null;
}

/** The booking PaymentIntent (founding stamp, and what was paid if the visit lost it), or null. Throws if Stripe cannot be read. */
async function bookingPayment(stripe, visit) {
  return visit.stripe_payment_intent_id ? stripe.paymentIntents.retrieve(visit.stripe_payment_intent_id) : null;
}

/** What was paid at booking (plus any difference since) and refunded since, in cents. */
function paidOf(visit, bookingPi) {
  let paid = intOrNull(visit.paid_cents);
  if (paid === null && bookingPi) paid = intOrNull(bookingPi.amount_received != null ? bookingPi.amount_received : bookingPi.amount);
  const refunded = intOrNull(visit.refunded_cents) || 0;
  return { paid, refunded, net: paid === null ? null : paid - refunded };
}

/**
 * The final total and the difference, in integer cents. The booked size is
 * priced at the cents quoted at booking; any other size at today's price;
 * travel is always the travel stored at booking. A founding booking (stamped
 * on the booking PaymentIntent) takes the founding percent off the final total
 * (R19). difference = final total less what is paid and not refunded:
 * above 0 is charged, below 0 refunded.
 */
async function priceFinal(stripe, visit, finalLoad) {
  const bookedIdx = intOrNull(visit.quoted_load_idx);
  const quotedLoad = intOrNull(visit.quoted_load_cents);
  const loadCents = finalLoad === bookedIdx && quotedLoad !== null ? quotedLoad : ORDER.SIZES[finalLoad].cents;
  const travelCents = intOrNull(visit.travel_cents) || 0;
  const beforeDiscount = loadCents + travelCents;
  const bookingPi = await bookingPayment(stripe, visit);
  const isFounding = !!(bookingPi && bookingPi.metadata && bookingPi.metadata.founding === 'true');
  const discountCents = isFounding ? Math.round(beforeDiscount * founding.FOUNDING.percentOff / 100) : 0;
  const cents = beforeDiscount - discountCents;
  const { paid, refunded, net } = paidOf(visit, bookingPi);
  return { loadCents, travelCents, discountCents, cents, paid, refunded, net, differenceCents: net === null ? null : cents - net };
}

/**
 * The difference could not be charged (declined, or a payment Stripe could not
 * finish): send a hosted invoice for it, remember its link, and alert the owner
 * ONCE. The webhook can see the same decline, so both dedupe on payment_status.
 */
async function invoiceInstead(stripe, visit, { amount, finalLoad, keyBase, patch, reason }) {
  const cust = visit.customers || {};
  const kind = 'difference';
  const metadata = { visit_id: String(visit.id), kind, final_load_idx: String(finalLoad) };
  const desc = 'Junk removal: the difference for a bigger load';
  const inv = await stripe.invoices.create({
    customer: cust.stripe_customer_id, collection_method: 'send_invoice', days_until_due: INVOICE_DAYS,
    pending_invoice_items_behavior: 'exclude', description: desc, metadata,
  }, { idempotencyKey: `${keyBase}:invoice` });
  await stripe.invoiceItems.create({
    customer: cust.stripe_customer_id, invoice: inv.id, amount, currency: 'usd', description: desc, metadata,
  }, { idempotencyKey: `${keyBase}:invoice-item` });
  const fin = await stripe.invoices.finalizeInvoice(inv.id);
  // Stripe does not copy invoice metadata onto the invoice's PaymentIntent; stamp it so the webhook knows it is not a booking.
  if (fin && fin.payment_intent) {
    try { await stripe.paymentIntents.update(typeof fin.payment_intent === 'string' ? fin.payment_intent : fin.payment_intent.id, { metadata }); }
    catch (e) { console.error('[visit-update] could not stamp the invoice payment intent:', e.message); }
  }
  const sentInv = await stripe.invoices.sendInvoice(inv.id);
  const invoiceUrl = (sentInv && sentInv.hosted_invoice_url) || (fin && fin.hosted_invoice_url) || null;

  const fresh = await db.getVisit(visit.id);
  const alreadyAlerted = !!fresh && fresh.payment_status === 'payment_needed';
  const row = await db.updateVisit(visit.id, { ...patch, payment_status: 'payment_needed', invoice_url: invoiceUrl });
  if (!row) console.error('[visit-update] could not store the invoice on visit', visit.id);
  if (!alreadyAlerted) {
    await alertPaymentNeeded(visit, { cents: amount, kind, invoiceUrl, reason, sendEmail });
  }
  // The customer always hears from the path that has the invoice link (the webhook never sends this one).
  if (cust.email) {
    try {
      const msg = tpl.paymentNeeded({ name: cust.first_name, amount: money(amount), invoiceUrl });
      await sendEmail({ to: cust.email, kind: 'transactional', idempotencyKey: `${keyBase}:payment-needed`, ...msg });
    } catch (e) { console.error('[visit-update] payment needed email failed:', e.message); }
  }
  return invoiceUrl;
}

/** Why a visit cannot be settled or refunded, by its status or payment status. */
const STATUS_REFUSAL = {
  completed: 'This job is already finished.',
  canceled: 'This booking was canceled.',
  declined: 'The customer said no on this job.',
  skipped: 'This job was skipped.',
  in_progress: 'This job is under way. Use Customer said no, or Finish.',   // cancel-refund only: said no accepts it
};
const PAYMENT_REFUSAL = {
  payment_needed: 'An invoice is already out for this visit. Wait for it to be paid, or void it in Stripe first.',
  refunded: 'This booking was already refunded.',
  late_fee_kept: 'This booking was already canceled and refunded.',
};
const refusePayment = (visit) => [409, {
  error: PAYMENT_REFUSAL[visit.payment_status] || 'This visit has no booking payment to settle against.',
  paymentStatus: visit.payment_status || null,
}];

async function finishVisit(body, visit, notePatch, now) {
  if (['completed', 'canceled', 'declined', 'skipped'].includes(visit.status)) return [409, { error: STATUS_REFUSAL[visit.status], status: visit.status }];
  if (visit.payment_status !== 'paid') return refusePayment(visit);
  const finalLoad = body.finalLoad === undefined || body.finalLoad === null || body.finalLoad === ''
    ? intOrNull(visit.quoted_load_idx) : Number(body.finalLoad);
  if (!Number.isInteger(finalLoad) || !ORDER.SIZES[finalLoad]) return [400, { error: 'finalLoad is not a size' }];
  // A settlement already started at one size (money may have moved) can only be retried at that size.
  const locked = intOrNull(visit.final_load_idx);
  if (locked !== null && locked !== finalLoad) {
    return [409, { error: `This job is being settled at ${sizeLabel(locked)}. Finish it at that size, or check Stripe first.`, finalLoad: locked }];
  }
  if (!process.env.STRIPE_SECRET_KEY) return [500, { error: 'STRIPE_SECRET_KEY not configured' }];
  const stripe = stripeClient();

  let p;
  try { p = await priceFinal(stripe, visit, finalLoad); }
  catch (e) { console.error('[visit-update] pricing failed:', e.message); return [502, { error: 'Could not read the booking payment from Stripe. Nothing was charged or refunded.' }]; }
  if (p.net === null) return [400, { error: 'We do not know what was paid at booking for this visit. Check Stripe.' }];
  const diff = p.differenceCents;
  const answer = {
    cents: p.cents, loadCents: p.loadCents, travelCents: p.travelCents, discountCents: p.discountCents,
    paidCents: p.net, differenceCents: diff, agreementRequired: diff > 0,
    charged: false, refunded: false, paymentStatus: visit.payment_status,
  };
  if (body.dryRun) return [200, { ...answer, dryRun: true }];

  if (diff > 0 && body.agreed !== true) {
    return [400, { error: 'The new price is higher than what was paid. The customer must agree first.', code: 'agreement_required', ...answer }];
  }
  const cust = visit.customers || {};
  const charge = diff >= MIN_CHARGE_CENTS;
  const refund = diff < 0;
  if (charge && (!cust.stripe_customer_id || !visit.stripe_payment_method_id)) return [400, { error: 'This visit has no saved card. Charge the difference from Stripe.' }];
  if (refund && !visit.stripe_payment_intent_id) return [400, { error: 'This visit has no booking payment to refund. Refund it from Stripe.' }];

  const settled = { final_load_idx: finalLoad, final_cents: p.cents };
  // Write the final size BEFORE any money moves: if a later write is lost, a
  // retry can only repeat this size, and its idempotency keys stop a second charge.
  if ((charge || refund) && locked === null) {
    const pre = await db.updateVisit(visit.id, settled);
    if (!pre) return [502, { error: 'Could not save the final size. Nothing was charged or refunded. Try again.' }];
  }

  let pi = null, re = null, declined = null;
  if (charge) {
    const key = `visit:${visit.id}:diff:${finalLoad}`;
    try {
      pi = await stripe.paymentIntents.create({
        amount: diff, currency: 'usd', customer: cust.stripe_customer_id, payment_method: visit.stripe_payment_method_id,
        off_session: true, confirm: true, automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: 'Junk removal: the difference for a bigger load',
        metadata: { kind: 'difference', visit_id: String(visit.id), final_load_idx: String(finalLoad) },
      }, { idempotencyKey: key });
    } catch (e) {
      if (!isDeclined(e)) {
        console.error('[visit-update] difference charge failed:', e.message);
        return [e.type === 'StripeIdempotencyError' ? 409 : 502, { error: 'The charge did not go through. Check Stripe before trying again.' }];
      }
      declined = { code: e.code || 'declined', message: e.message };
    }
    if (pi && pi.status !== 'succeeded') {
      // R18: anything still able to take money is stopped before an invoice asks for it again.
      if (pi.status !== 'requires_payment_method') {
        try { await stripe.paymentIntents.cancel(pi.id); }
        catch (e) {
          console.error('[visit-update] could not cancel the difference payment:', pi.id, pi.status, e.message);
          return [502, { error: `The charge for the difference is ${pi.status} in Stripe and could not be stopped. Check Stripe before trying again.` }];
        }
      }
      declined = { code: pi.status, message: `The payment for the difference was ${pi.status}.` };
    }
    if (declined) {
      try {
        const invoiceUrl = await invoiceInstead(stripe, visit, { amount: diff, finalLoad, keyBase: key, patch: settled, reason: declined.message });
        // The job is done whether or not the card worked: complete it (status done, the all done email).
        const out = { ...answer, paymentStatus: 'payment_needed', invoiceUrl, declined: declined.code };
        try {
          const [code, done] = await completeVisit(visit.id, notePatch, now);
          out.completed = code === 200; out.visit = done.visit; out.nextDate = done.nextDate;
        } catch (e3) { console.error('[visit-update] declined, and complete failed:', e3.message); out.completed = false; }
        return [200, out];
      } catch (e2) {
        console.error('[visit-update] invoice failed:', e2.message);
        return [502, { error: 'The card was declined and the invoice could not be sent. Send one from Stripe.' }];
      }
    }
  } else if (refund) {
    try {
      re = await stripe.refunds.create({
        payment_intent: visit.stripe_payment_intent_id, amount: -diff,
        metadata: { kind: 'difference_refund', visit_id: String(visit.id), final_load_idx: String(finalLoad) },
      }, { idempotencyKey: `visit:${visit.id}:refund:${finalLoad}` });
    } catch (e) {
      console.error('[visit-update] difference refund failed:', e.message);
      return [e.type === 'StripeIdempotencyError' ? 409 : 502, { error: 'The refund did not go through. Check Stripe before trying again.' }];
    }
  }

  // Settled. From here nothing may fail the answer.
  const patch = { ...settled, payment_status: 'paid' };
  if (pi) patch.paid_cents = p.paid + diff;
  if (re) patch.refunded_cents = p.refunded + (-diff);
  const row = await db.updateVisit(visit.id, patch);
  if (!row) console.error('[visit-update] SETTLED but could not record it on visit', visit.id, pi ? pi.id : re ? re.id : 'no money moved');
  if (cust.email) {
    try {
      const msg = tpl.receipt({
        name: cust.first_name, paid: money(p.net), adjust: pi ? 'charged' : re ? 'refunded' : 'none',
        adjustment: pi || re ? money(Math.abs(diff)) : null, final: money(pi || re ? p.cents : p.net),
        load: sizeLabel(finalLoad), travel: p.travelCents ? money(p.travelCents) : null,
        discount: p.discountCents ? `${money(p.discountCents)} off` : null, dayLabel: dayLabel(visit.scheduled_date),
      });
      // The webhook's receipt for the same difference uses this key too, so the customer gets one.
      await sendEmail({ to: cust.email, kind: 'transactional', idempotencyKey: `visit:${visit.id}:receipt:${finalLoad}`, ...msg });
    } catch (e) { console.error('[visit-update] receipt failed:', e.message); }
  }
  const out = { ...answer, charged: !!pi, refunded: !!re, paymentStatus: 'paid', ...(pi ? { paymentIntentId: pi.id } : {}), ...(re ? { refundId: re.id } : {}) };
  try {
    const [code, done] = await completeVisit(visit.id, notePatch, now);
    out.completed = code === 200; out.visit = done.visit; out.nextDate = done.nextDate;
  } catch (e) { console.error('[visit-update] settled, but complete failed:', e.message); out.completed = false; }
  return [200, out];
}

/**
 * Cancel and refund (kind 'cancel'): a full refund before the free cancel
 * window, else what was paid less the late fee. Customer said no (kind
 * 'declined'): what was paid less the refusal fee. Cancel only for a booking
 * still ahead (scheduled or en route); Customer said no also once the job is
 * under way (a before photo sets in_progress), unless Finish has already
 * started settling a size. Only what is still unrefunded is refunded (R18).
 */
async function refundBooking(kind, body, visit, notePatch, now) {
  const open = kind === 'declined' ? ['scheduled', 'en_route', 'in_progress'] : ['scheduled', 'en_route'];
  if (!open.includes(visit.status)) return [409, { error: STATUS_REFUSAL[visit.status] || 'This booking cannot be refunded here.', status: visit.status }];
  if (visit.payment_status !== 'paid') return refusePayment(visit);
  // Finish writes the final size before money moves: once it has, only Finish at that size may settle.
  const locked = intOrNull(visit.final_load_idx);
  if (locked !== null) return [409, { error: `This job is being settled at ${sizeLabel(locked)}. Finish it at that size, or check Stripe first.`, finalLoad: locked }];
  const late = kind === 'cancel' && ORDER.isLateCancel(String(visit.scheduled_date || '').slice(0, 10), visit.window_key, Date.parse(now));
  const feeCents = kind === 'cancel' ? (late ? ORDER.POLICY.lateFeeCents : 0) : ORDER.POLICY.refusalFeeCents;

  let stripe = null;
  const needStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) throw Object.assign(new Error('STRIPE_SECRET_KEY not configured'), { status: 500 });
    return stripe || (stripe = stripeClient());
  };
  let paid = paidOf(visit, null);
  if (paid.net === null) {
    try { paid = paidOf(visit, await bookingPayment(needStripe(), visit)); }
    catch (e) { return [e.status || 502, { error: e.status ? e.message : 'Could not read the booking payment from Stripe. Nothing was refunded.' }]; }
  }
  if (paid.net === null) return [400, { error: 'We do not know what was paid at booking for this visit. Check Stripe.' }];
  const refundCents = Math.max(0, paid.net - feeCents);
  const keptCents = paid.net - refundCents;
  const answer = { refundCents, keptCents, feeCents, late, paidCents: paid.net };
  if (body.dryRun) return [200, { ...answer, dryRun: true }];

  let re = null;
  if (refundCents > 0) {
    if (!visit.stripe_payment_intent_id) return [400, { error: 'This visit has no booking payment to refund. Refund it from Stripe.' }];
    let s;
    try { s = needStripe(); } catch (e) { return [500, { error: e.message }]; }
    try {
      re = await s.refunds.create({
        payment_intent: visit.stripe_payment_intent_id, amount: refundCents,
        metadata: { kind: kind === 'cancel' ? 'cancel_refund' : 'declined_refund', visit_id: String(visit.id) },
      }, { idempotencyKey: `visit:${visit.id}:${kind === 'cancel' ? 'cancel-refund' : 'declined-refund'}` });
    } catch (e) {
      console.error(`[visit-update] ${kind} refund failed:`, e.message);
      return [e.type === 'StripeIdempotencyError' ? 409 : 502, { error: 'The refund did not go through. Nothing was changed. Check Stripe before trying again.' }];
    }
  }

  const status = kind === 'cancel' ? 'canceled' : 'declined';
  const paymentStatus = kind === 'cancel' ? (late && keptCents > 0 ? 'late_fee_kept' : 'refunded') : (refundCents > 0 ? 'refunded' : 'paid');
  const row = await db.updateVisit(visit.id, {
    status, payment_status: paymentStatus, refunded_cents: paid.refunded + refundCents, final_cents: keptCents, ...notePatch,
  });
  if (!row) console.error(`[visit-update] ${kind}: refunded ${refundCents} but could not record it on visit`, visit.id, re && re.id);
  const cust = visit.customers || {};
  if (cust.email) {
    try {
      const msg = tpl.refundNotice({
        name: cust.first_name, why: kind === 'cancel' ? 'canceled' : 'declined', refund: money(refundCents),
        kept: keptCents ? money(keptCents) : null, late, dayLabel: dayLabel(visit.scheduled_date), windowLabel: windowLabel(visit.window_key),
        cancelHours: ORDER.POLICY.cancelHours,
      });
      await sendEmail({ to: cust.email, kind: 'transactional', idempotencyKey: `visit:${visit.id}:${kind}-refund:email`, ...msg });
    } catch (e) { console.error(`[visit-update] ${kind} refund email failed:`, e.message); }
  }
  return [200, { ...answer, refunded: !!re, refundId: re ? re.id : null, status, paymentStatus, ok: !!row }];
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
      // A booking paid at booking is closed through Cancel and refund (or Finish), never left paid and undone.
      const visit = await db.getVisit(visitId);
      if (visit && visit.payment_status === 'paid' && intOrNull(visit.paid_cents) !== null) {
        return res.status(409).json({ error: 'This booking is paid. Use Cancel and refund, or Finish.' });
      }
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

    if (action === 'finish' || action === 'declined' || action === 'cancel-refund') {
      const visit = await db.getVisit(visitId);
      if (!visit) return res.status(404).json({ error: 'Visit not found (or schema not applied)' });
      const [code, json] = action === 'finish' ? await finishVisit(body, visit, notePatch, now)
        : await refundBooking(action === 'cancel-refund' ? 'cancel' : 'declined', body, visit, notePatch, now);
      return res.status(code).json(json);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error('[visit-update] failed:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
