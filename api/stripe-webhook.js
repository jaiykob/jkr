/**
 * Vercel Serverless Function — stripe-webhook
 *
 * Receives events from Stripe and forwards the important ones to a Discord
 * channel via webhook. Keeps a record outside Stripe so signups, failed
 * payments, and cancellations don't get lost.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY        = sk_test_... or sk_live_...
 *   STRIPE_WEBHOOK_SECRET    = whsec_...   (from Stripe dashboard → Webhooks)
 *
 * Optional env vars:
 *   OPS_WEBHOOK_URL          = https://discord.com/api/webhooks/...
 *                              If set, ops-relevant events POST here as a
 *                              Discord embed. Generic JSON destinations
 *                              (Zapier/Make) also work — set OPS_WEBHOOK_RAW=1
 *                              to skip the Discord formatter.
 *
 * Stripe dashboard setup:
 *   Developers → Webhooks → Add endpoint
 *     URL:     https://YOUR-DOMAIN/api/stripe-webhook
 *     Events:  invoice.payment_succeeded
 *              invoice.payment_failed
 *              customer.subscription.created
 *              customer.subscription.deleted
 *              payment_intent.succeeded
 *              payment_intent.payment_failed
 *   Copy the signing secret (whsec_...) into STRIPE_WEBHOOK_SECRET.
 */

const Stripe = require('stripe');
const { sendEmail } = require('./_lib/email');
const tpl = require('./_lib/email-templates');
const db  = require('./_lib/db');
const { firstVisitDate } = require('./_lib/schedule');

// Display label per plan key. MUST cover every value PLAN_KEYS can produce in
// api/create-booking.js plus 'quarterly'. A missing key prints the raw
// slug into the customer's confirmation email (a real Scoops Co. bug).
const PLAN_LABEL = {
  one_time:  'One-time haul',
  monthly:   'Monthly pickup',
  quarterly: 'Quarterly (10% off)',
};

// Only used to build links for humans (the Discord CRM link). Anything a third
// party POSTs to (the Stripe webhook endpoint) must use the host that does NOT
// redirect: Stripe does not follow redirects, and an endpoint on a redirecting
// host fails every delivery silently. TODO: real domain.
const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://www.example.com').replace(/\/+$/, '');

// Vercel must NOT parse the body — Stripe signature verification needs the raw bytes.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function fmtAmount(cents) {
  if (cents == null) return null;
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

function stripeDashboardBase(livemode) {
  return livemode ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test';
}

/**
 * The subscription an invoice belongs to, in either payload shape. The event
 * body is rendered in the WEBHOOK ENDPOINT's API version (set in the Stripe
 * Dashboard), not the version pinned below — and from 2025-03-31 ("basil")
 * `invoice.subscription` moved to `invoice.parent.subscription_details`.
 * Reading only the old field would silently drop every renewal status update
 * on an endpoint created on a newer version.
 */
function invoiceSubscriptionId(inv) {
  if (!inv) return null;
  if (typeof inv.subscription === 'string') return inv.subscription;
  const nested = inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription;
  return typeof nested === 'string' ? nested : null;
}

// Pull customer (+ subscription when relevant) so the embed has name, phone,
// and booking metadata regardless of which event triggered it.
async function gatherContext(stripe, event) {
  const obj        = event.data.object || {};
  const customerId = typeof obj.customer === 'string' ? obj.customer : null;

  // For subscription.* events, obj IS the subscription — but a snapshot from
  // when the event was generated. Events arrive out of order (the first
  // invoice's payment_succeeded can land before subscription.created), so the
  // subscription is always re-read live: its status is what decides whether
  // this is a paid booking, and a stale 'incomplete' must not win.
  const isSubEvent = event.type.startsWith('customer.subscription.');
  const subId      = isSubEvent ? obj.id : invoiceSubscriptionId(obj);

  let customer = null;
  let subscription = null;

  if (customerId) {
    try { customer = await stripe.customers.retrieve(customerId); }
    catch (e) { console.error('[stripe-webhook] customer retrieve failed:', e.message); }
  }
  if (subId) {
    try { subscription = await stripe.subscriptions.retrieve(subId); }
    catch (e) {
      console.error('[stripe-webhook] subscription retrieve failed:', e.message);
      if (isSubEvent) subscription = obj;
    }
  }

  // Booking metadata is written onto the subscription (and customer) by
  // create-booking.js. Subscription wins because it carries the most.
  const metadata = {
    ...(customer && customer.metadata)     || {},
    ...(obj.metadata)                       || {},
    ...(subscription && subscription.metadata) || {},
  };

  return {
    customerId,
    subscription,
    livemode: !!event.livemode,
    name:  (customer && customer.name)  || null,
    phone: (customer && customer.phone) || null,
    email: (customer && customer.email)
        || obj.customer_email
        || (obj.charges && obj.charges.data && obj.charges.data[0] && obj.charges.data[0].billing_details && obj.charges.data[0].billing_details.email)
        || null,
    metadata,
  };
}

function buildDiscordEmbed(ctx, payload) {
  const isGood = payload.kind === 'signup_or_payment';
  const title  = payload.title
    || (isGood ? '✅ Payment received' : '⚠️ Payment issue — attention needed');
  const color = isGood ? 0x2D5A1E : 0xC0392B;

  const m = ctx.metadata || {};
  const fields = [];

  if (payload.eventType)        fields.push({ name: 'Event',     value: `\`${payload.eventType}\``, inline: true });
  const amt = fmtAmount(payload.amount);
  if (amt)                      fields.push({ name: 'Amount',    value: amt, inline: true });
  if (m.plan)                   fields.push({ name: 'Plan',      value: m.plan, inline: true });

  if (ctx.name)                 fields.push({ name: 'Name',      value: ctx.name, inline: true });
  if (ctx.phone)                fields.push({ name: 'Phone',     value: ctx.phone, inline: true });
  if (ctx.email)                fields.push({ name: 'Email',     value: ctx.email, inline: true });

  if (m.address)                fields.push({ name: 'Address',   value: m.address, inline: false });
  if (m.pickup_day)             fields.push({ name: 'Day',       value: m.pickup_day, inline: true });
  if (m.load)                   fields.push({ name: 'Load',      value: m.load, inline: true });
  if (m.items)                  fields.push({ name: 'Items',     value: String(m.items).slice(0, 1000), inline: false });
  if (m.frequency)              fields.push({ name: 'Frequency', value: m.frequency, inline: true });
  if (m.heard_via)              fields.push({ name: 'Heard via', value: m.heard_via, inline: true });

  // Links out to the two places you'd actually go from a ping. The CRM link
  // carries no token by design — jkr/index.html prompts and keeps it in
  // sessionStorage, so the URL stays safe to sit in a chat log forever.
  const links = [`[Open CRM](${SITE_ORIGIN}/jkr/)`];
  if (ctx.customerId) {
    const base = stripeDashboardBase(ctx.livemode);
    links.push(`[Stripe customer](${base}/customers/${ctx.customerId})`);
  }
  fields.push({ name: 'Links', value: links.join('  ·  '), inline: false });

  if (payload.reason)     fields.push({ name: 'Reason',  value: String(payload.reason).slice(0, 1000), inline: false });
  if (payload.receiptUrl) fields.push({ name: 'Receipt', value: payload.receiptUrl, inline: false });

  return {
    username: 'Brand Name',
    embeds: [{
      title,
      color,
      fields,
      timestamp: new Date().toISOString(),
    }],
  };
}

/**
 * What (if anything) to post to Discord for this event. The channel doubles as
 * the payment-failure monitor, so every declined checkout says so plainly, and
 * "New booking" is reserved for money that has actually landed.
 *
 *   subscription.created          silent (the charge hasn't run yet, or its
 *                                 invoice event already pinged — events arrive
 *                                 in either order, so only one of them may)
 *   first invoice paid            🎉 New booking
 *   renewal paid                  ✅ Payment received
 *   one-time PaymentIntent paid   🎉 New booking
 *   invoice PaymentIntent paid    silent (the invoice event already pinged)
 *   first invoice failed          ⚠️ Checkout declined
 *   renewal failed                ⚠️ Renewal failed
 *   one-time PaymentIntent failed ⚠️ Checkout declined
 *   subscription deleted          ⚠️ Subscription cancelled
 */
function opsPayload(ctx, event) {
  const obj  = event.data.object || {};
  const m    = ctx.metadata || {};
  const oneTime = m.plan === 'one_time';
  const reason  = (obj.last_payment_error && obj.last_payment_error.message)
    || (obj.last_finalization_error && obj.last_finalization_error.message)
    || obj.cancellation_reason || null;
  const good = (title) => ({
    kind: 'signup_or_payment', title, eventType: event.type,
    amount: obj.amount_paid ?? obj.amount_received ?? obj.amount ?? null,
    receiptUrl: obj.hosted_invoice_url || obj.receipt_url || null,
  });
  const bad = (title) => ({ kind: 'attention_needed', title, eventType: event.type, reason });

  switch (event.type) {
    case 'customer.subscription.created':
      return null;
    case 'invoice.payment_succeeded':
      return obj.billing_reason === 'subscription_create'
        ? good('🎉 New booking — manual handoff needed') : good('✅ Payment received');
    case 'payment_intent.succeeded':
      return oneTime ? good('🎉 New booking — manual handoff needed') : null;
    case 'invoice.payment_failed':
      return obj.billing_reason === 'subscription_create'
        ? bad('⚠️ Checkout declined — card failed at signup, no booking made')
        : bad('⚠️ Renewal payment failed — attention needed');
    case 'payment_intent.payment_failed':
      return oneTime ? bad('⚠️ Checkout declined — one-time haul not paid') : null;
    case 'customer.subscription.deleted':
      return bad('⚠️ Subscription cancelled');
    default:
      return null;
  }
}

async function notifyOps(ctx, payload) {
  const url = process.env.OPS_WEBHOOK_URL;
  if (!url) return;
  const raw  = process.env.OPS_WEBHOOK_RAW === '1';
  const body = raw ? { ...payload, ctx } : buildDiscordEmbed(ctx, payload);
  try {
    const r = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      console.error('[stripe-webhook] ops notify non-2xx:', r.status, text.slice(0, 300));
    }
  } catch (e) {
    console.error('[stripe-webhook] ops notify failed:', e.message);
  }
}

// Customer-facing transactional email. Fail-safe: sendEmail dry-runs (no-op +
// log) until RESEND_API_KEY is set, so this is safe to deploy dormant. Only the
// two launch-critical triggers are wired; the rest of the 7 (api/_lib README)
// live on the visit-done action or the OpenClaw agent.
async function emailCustomer(ctx, event) {
  if (!ctx || !ctx.email) return;
  const m   = ctx.metadata || {};
  const obj = event.data.object || {};
  let msg = null;

  // Booking confirmation fires only once the money actually lands — never on
  // customer.subscription.created, which (with default_incomplete) precedes the
  // charge and would "confirm" a booking whose card then declines.
  //   • Recurring: the FIRST paid invoice (billing_reason 'subscription_create').
  //     Renewals (billing_reason 'subscription_cycle') are intentionally silent.
  //   • One-time haul: the PaymentIntent — there's no invoice or subscription,
  //     so subscription.created never fired and this was previously un-emailed.
  const isFirstRecurringInvoice =
    event.type === 'invoice.payment_succeeded' && obj.billing_reason === 'subscription_create';
  const isOneTimePaid =
    event.type === 'payment_intent.succeeded' && m.plan === 'one_time';

  if (isFirstRecurringInvoice || isOneTimePaid) {
    const amountCents = isFirstRecurringInvoice
      ? (obj.amount_paid ?? null)
      : (obj.amount_received ?? obj.amount ?? null);
    msg = tpl.bookingConfirmation({
      name:      ctx.name,
      plan:      PLAN_LABEL[m.plan] || m.plan,
      amount:    fmtAmount(amountCents != null ? amountCents : (Number(m.quoted_price ?? m.quoted_monthly) || null)),
      frequency: m.frequency,
      pickupDay: m.pickup_day,
      address:   m.address,
      load:      m.load,
    });
  } else if (event.type === 'invoice.payment_failed' && obj.billing_reason !== 'subscription_create') {
    // Renewals only. A first invoice fails while the customer is still on the
    // checkout page looking at the decline message; emailing them a link to
    // pay that abandoned invoice as well invites a second, duplicate plan when
    // they retry with another card.
    msg = tpl.paymentFailed({
      name:      ctx.name,
      amount:    fmtAmount(obj.amount_due ?? obj.amount_remaining ?? null),
      updateUrl: obj.hosted_invoice_url || null,
    });
  }
  if (!msg) return;

  // event.id keys the send so a webhook redelivery can't double-email.
  await sendEmail({ to: ctx.email, kind: 'transactional', idempotencyKey: `${event.id}:cust`, ...msg });
}

// Stripe subscription.status → our public.sub_status enum.
function mapSubStatus(s) {
  switch (s) {
    case 'trialing':
    case 'active':              return 'active';
    case 'past_due':
    case 'unpaid':              return 'past_due';
    case 'canceled':            return 'canceled';
    case 'paused':              return 'paused';
    default:                    return 'incomplete'; // incomplete / incomplete_expired
  }
}
function toIso(unixSeconds) {
  return unixSeconds ? new Date(Number(unixSeconds) * 1000).toISOString() : null;
}
// The LAST five-digit group: the first is often the house number out here
// ("18250 SE Stark St, Gresham 97030"). Mirrors create-booking.js.
function zipFromAddress(addr) {
  const all = String(addr || '').match(/\b\d{5}\b/g);
  return all ? all[all.length - 1] : null;
}

// Persist the booking spine to Supabase (service_role). Fail-safe: every db.*
// call no-ops + logs when SUPABASE_SERVICE_ROLE_KEY is unset or the schema isn't
// applied yet, so this can deploy dormant and never break the webhook.
async function persistSpine(ctx, event) {
  if (!ctx || !ctx.customerId) return;
  const obj = event.data.object || {};
  const m   = ctx.metadata || {};

  const sub    = ctx.subscription;                 // live — see gatherContext
  const subId  = invoiceSubscriptionId(obj);
  const paidFirstInvoice =
    event.type === 'invoice.payment_succeeded' && obj.billing_reason === 'subscription_create';

  try {
    // A recurring booking. create-booking uses payment_behavior
    // 'default_incomplete', so subscription.created fires BEFORE the card is
    // charged — the customer can still be declined. The rows are written then
    // (useful for the CRM), but the first VISIT is only scheduled once the
    // subscription is actually active. Before 2026-09-17 it was scheduled on
    // created, so a declined card still produced a visit on the route, a
    // day-capacity slot and a "we're coming tomorrow" reminder email.
    // Both events run the same upsert, so whichever arrives second completes it.
    if ((event.type === 'customer.subscription.created' || paidFirstInvoice) && sub) {
      const customer = await db.upsertCustomer({
        stripeCustomerId: ctx.customerId,
        name: ctx.name, email: ctx.email, phone: ctx.phone,
        address: m.address, zip: zipFromAddress(m.address),
      });
      if (!customer) return;
      const item       = sub.items && sub.items.data && sub.items.data[0];
      const priceCents = item && item.price && item.price.unit_amount;
      const status     = paidFirstInvoice ? 'active' : mapSubStatus(sub.status);
      const subscription = await db.upsertSubscription({
        customerId:           customer.id,
        stripeSubscriptionId: sub.id,
        plan:                 m.plan,
        frequency:            m.frequency,
        freqIdx:              m.freq_idx,
        pickupDay:            m.pickup_day,
        loadSize:             m.load,
        priceCents:           priceCents != null ? priceCents : Number(m.quoted_price ?? m.quoted_monthly) || null,
        status,
        currentPeriodEnd:     toIso(sub.current_period_end ?? (item && item.current_period_end)),
        startedAt:            toIso(sub.start_date || sub.created),
      });
      // First visit — paid bookings only, idempotent (none if one exists).
      if (subscription && status === 'active') {
        const date = firstVisitDate({ freqIdx: m.freq_idx, weekday: m.pickup_weekday });
        if (date) await db.ensureFirstVisit({
          customerId: customer.id, subscriptionId: subscription.id, scheduledDate: date,
        });
      }
    } else if (event.type === 'payment_intent.succeeded' && m.plan === 'one_time') {
      // One-time haul: no Stripe subscription. Persist the customer and a
      // one_time subscription row so the visit always has a parent.
      const customer = await db.upsertCustomer({
        stripeCustomerId: ctx.customerId,
        name: ctx.name, email: ctx.email, phone: ctx.phone,
        address: m.address, zip: zipFromAddress(m.address),
      });
      if (!customer) return;
      const subscription = await db.upsertSubscription({
        customerId: customer.id,
        plan:       'one_time',
        frequency:  m.frequency,
        freqIdx:    m.freq_idx,
        pickupDay:  m.pickup_day,
        loadSize:   m.load,
        priceCents: obj.amount_received ?? obj.amount ?? null,
        status:     'one_time',
        startedAt:  new Date().toISOString(),
        dedupeId:   obj.id,
      });
      if (subscription) {
        const date = firstVisitDate({ freqIdx: m.freq_idx, weekday: m.pickup_weekday });
        if (date) await db.ensureFirstVisit({
          customerId: customer.id, subscriptionId: subscription.id, scheduledDate: date,
        });
      }
    } else if (event.type === 'invoice.payment_succeeded' && subId) {
      await db.updateSubscriptionByStripeId(subId, {
        status: 'active',
        ...(obj.lines && obj.lines.data && obj.lines.data[0] && obj.lines.data[0].period
          ? { current_period_end: toIso(obj.lines.data[0].period.end) } : {}),
      });
    } else if (event.type === 'invoice.payment_failed' && subId && obj.billing_reason !== 'subscription_create') {
      // A renewal that failed. A first-invoice decline is a checkout that never
      // became a booking; it stays 'incomplete' and Stripe expires it in 23h.
      await db.updateSubscriptionByStripeId(subId, { status: 'past_due' });
    } else if (event.type === 'customer.subscription.deleted') {
      const row = await db.updateSubscriptionByStripeId(obj.id, { status: 'canceled' });
      // Without this a cancelled customer kept their scheduled visits: still
      // on the route, still holding capacity, still getting reminder emails.
      if (row) await db.cancelFutureVisits(row.id);
    }
  } catch (e) {
    console.error('[stripe-webhook] persistSpine failed:', e.message);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const SECRET     = process.env.STRIPE_SECRET_KEY;
  const WH_SECRET  = process.env.STRIPE_WEBHOOK_SECRET;
  if (!SECRET || !WH_SECRET) {
    return res.status(500).json({ error: 'Stripe env vars missing' });
  }

  const stripe = new Stripe(SECRET, { apiVersion: '2024-06-20' });

  let event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(raw, sig, WH_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const obj = event.data.object || {};

  const OPS_GOOD = new Set([
    'customer.subscription.created',
    'invoice.payment_succeeded',
    'payment_intent.succeeded',
  ]);
  const OPS_BAD = new Set([
    'invoice.payment_failed',
    'payment_intent.payment_failed',
    'customer.subscription.deleted',
  ]);

  if (OPS_GOOD.has(event.type) || OPS_BAD.has(event.type)) {
    const ctx = await gatherContext(stripe, event);
    const payload = opsPayload(ctx, event);
    if (payload) await notifyOps(ctx, payload);

    // Persist the booking spine to Supabase (customers/subscriptions).
    await persistSpine(ctx, event);

    // Send the customer-facing email (booking confirmation / payment-failed).
    await emailCustomer(ctx, event);
  } else {
    console.log('[stripe-webhook] unhandled event:', event.type);
  }

  return res.status(200).json({ received: true });
};
