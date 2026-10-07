/**
 * Vercel Serverless Function — create-booking
 * Carried over from Scoops Co. (2026-09-27), same structure.
 *
 * Takes a quote from the junk flow and creates one of:
 *   - One-time PaymentIntent (Path B): a single haul. The usual case.
 *   - Recurring subscription (Path A): a standing pickup for landlords and
 *     businesses, billed on the plan's own cadence (or a 3-month quarterly prepay)
 *
 * The amount is recomputed here from the generated matrix. No pre-created
 * Stripe Prices are needed; they are built inline.
 *
 * Required env vars in Vercel (Settings → Environment Variables):
 *   STRIPE_SECRET_KEY    = sk_test_... or sk_live_...
 *   STRIPE_PRODUCT_ID    = prod_...   (one "Junk removal" product in Stripe)
 *   BOOKINGS_OPEN        = true       (second booking gate, live mode only)
 */

const Stripe = require('stripe');
const crypto = require('crypto');
const db = require('./_lib/db');
const { DAILY_CAP } = require('./_lib/schedule');

// ── Server-side pricing. GENERATED — edit pricing.config.mjs, run `npm run build:pricing`.
// The server recomputes every booking from this matrix and rejects a quote that
// doesn't match it, so a hand-edit here that misses book/quote.html 400s
// every checkout. rows: load sizes, smallest first · cols: see PLAN_KEYS.
// INTEGER CENTS, per visit, which is also what lands on the card each period.
/* BUILD:server-prices */
const PRICES = [
  /* Single item  */ [  9900,  8900],
  /* 1/4 truck    */ [ 19900, 17900],
  /* 1/2 truck    */ [ 34900, 31900],
  /* 3/4 truck    */ [ 47900, 43900],
  /* Full truck   */ [ 59900, 54900],
];
// How each column bills. `stripe` goes straight to price_data.recurring;
// null marks a one-time column (PaymentIntent, not a subscription).
const BILLING_BY_COL = [
  /* One-time haul    */ {"weeks":null,"stripe":null},
  /* Monthly pickup   */ {"weeks":4.333333333333333,"stripe":{"interval":"month"}},
];
// Column key by index: what goes in Stripe/db metadata as the plan name.
const PLAN_KEYS = ["one_time","monthly"];
// Load size by row index, for metadata and the confirmation email.
const LOAD_LABELS = ["Single item","1/4 truck","1/2 truck","3/4 truck","Full truck"];
/* /BUILD:server-prices */

// TODO: real coupon codes, or {} for none. Code → percent off.
const COUPONS = {};

// Quarterly billing = 13 weeks of service charged up front, 10% off, billed
// every 3 months whatever the plan's own cadence is. Priced off the plan's
// WEEKLY-EQUIVALENT rate, not off its period price. Mirrored in
// book/checkout.html and pricing.config.mjs: keep the three in step.
const WEEKS_PER_QUARTER = 13;
const QUARTERLY_INTERVAL = { interval: 'month', interval_count: 3 };

/** Cents charged up front for one quarter of the plan in column `col`. */
function quarterCents(perPeriodCents, col) {
  const { weeks } = BILLING_BY_COL[col];
  return Math.round((perPeriodCents / weeks) * WEEKS_PER_QUARTER * (1 - 0.10));
}

// The authoritative service-area gate. GENERATED from SERVICE_AREA in
// pricing.config.mjs.
/* BUILD:server-zips */
const VALID_ZIPS = new Set(['97030','97080','97024','97236','97233','97060','97009','97230','97216','97089','97266','97086','97206','97215','97015','97202','97220','97218','97254','97213','97055','97019','97222','97232','97211','97212','97214','97022','97027','97267','98664','97204','97207','97208','97228','97238','97240','97242','97250','97251','97252','97253','97256','97258','97268','97269','97280','97281','97282','97283','97286','97290','97291','97292','97293','97294','97296','97298','97209','98683','97227','97045','98684','97023','97205','97201','97210','97217','97203','97239','97068','97036','98682','97004','98661','98662','98666','98668','98687','97219','98660','98663','97034','97221','98607','97225','98665','98686','97005','98606','97011','97075','97076','97077','97223','97035','97010','97229','98685','97013','97224','98671','97078','97079','97008','98604','97067','97231','97062','97003','97006','98642','97042','97070','97007','97049','97017','98622','97123','97014','97140','98648','97038','97124','97129','97002','98639','97020','98629','97056','97032','98674','98675','97132','98601']);
/* /BUILD:server-zips */

/**
 * The ZIP in "123 Oak Ln, Gresham 97030": the LAST five-digit group. The first
 * one is often the house number ("18250 SE Stark St").
 */
function zipFromAddress(addr) {
  const all = String(addr || '').match(/\b\d{5}\b/g);
  return all ? all[all.length - 1] : null;
}

module.exports = async (req, res) => {
  // ── CORS / preflight ──────────────────────────────────────
  const ALLOWED_ORIGINS = [
    'https://example.com',      // TODO: real domain
    'https://www.example.com',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  // ── Validate env ──────────────────────────────────────────
  const SECRET     = process.env.STRIPE_SECRET_KEY;
  const PRODUCT_ID = process.env.STRIPE_PRODUCT_ID;
  if (!SECRET)     return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });
  if (!PRODUCT_ID) return res.status(500).json({ error: 'STRIPE_PRODUCT_ID not configured' });

  const stripe = new Stripe(SECRET, { apiVersion: '2024-06-20' });

  // ── Booking kill switch ───────────────────────────────────
  // Three gates must all be open to take a live booking, same as Scoops Co.:
  //   1. BOOKINGS_OPEN_SERVER below (in code, deploys from `main`)
  //   2. BOOKINGS_OPEN=true in Vercel env vars
  //   3. BOOKINGS_OPEN_CLIENT in book/checkout.html (UI only)
  // Only LIVE mode (sk_live) is gated, so test-mode runs keep working.
  // EMERGENCY BRAKE: flip this to false and merge. It stands alone.
  const BOOKINGS_OPEN_SERVER = false;   // CLOSED until launch
  const isLiveMode = SECRET.startsWith('sk_live');
  if (isLiveMode && (!BOOKINGS_OPEN_SERVER || process.env.BOOKINGS_OPEN !== 'true')) {
    return res.status(503).json({
      error: "We're not taking online bookings just yet. Call or text us and we'll get you on the schedule.",
    });
  }

  // ── Parse body ────────────────────────────────────────────
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  body = body || {};

  const {
    email,
    name,
    phone,
    paymentMethodId,
    quotedCents,         // client's displayed PER-VISIT price (cents): cross-checked, never trusted
    load,                // row index into PRICES (0 = smallest load)
    freqIdx,             // column index into PRICES
    coupon = '',
    zip,
    quarterly = false,   // 10% discount + quarterly billing (recurring plans only)
    metadata  = {},
  } = body;

  if (!email || !paymentMethodId) {
    return res.status(400).json({ error: 'Missing required fields: email, paymentMethodId' });
  }

  // Recompute the price server-side. Bounds come from the matrix itself, so a
  // table resize can't leave a hardcoded bound pointing off the end.
  const row = parseInt(load, 10);
  const fi  = parseInt(freqIdx, 10);
  if (!(row >= 0 && row < PRICES.length) || !(fi >= 0 && fi < PRICES[0].length)) {
    return res.status(400).json({ error: 'Invalid quote parameters. Please rebuild your quote.' });
  }
  if (!VALID_ZIPS.has(String(zip || '').trim())) {
    return res.status(400).json({ error: 'Sorry, that address is outside our service area' });
  }
  // The address is what the route and the CRM use, so it has to name the ZIP
  // that just passed the gate.
  const addressZip = zipFromAddress(metadata && metadata.address);
  if (addressZip && addressZip !== String(zip).trim()) {
    return res.status(400).json({ error: 'Sorry, that address is outside our service area' });
  }

  const pct       = COUPONS[String(coupon).trim().toUpperCase()] || 0;
  const baseCents = PRICES[row][fi];   // already cents: do NOT multiply by 100
  const amount    = pct > 0 ? Math.round(baseCents * (1 - pct / 100)) : baseCents;
  // Derived from the billing table, never from a hardcoded column index.
  const isOneTime = !BILLING_BY_COL[fi].stripe;
  const planKey   = !isOneTime && quarterly ? 'quarterly' : PLAN_KEYS[fi];

  const clientCents = Math.round(Number(quotedCents));
  if (Number.isFinite(clientCents) && clientCents !== amount) {
    return res.status(400).json({ error: 'Quote is out of date. Please refresh and rebuild your quote.' });
  }
  if (!(amount >= 50)) {
    // Stripe's minimum charge is $0.50. A zero or near-zero price is a config error.
    return res.status(400).json({ error: 'This quote cannot be booked online. Please call us.' });
  }

  // ── Day-capacity backstop ─────────────────────────────────
  // Refuse a route day that's already at DAILY_CAP. FAIL-OPEN: if the count
  // can't be read, allow the booking; a capacity read must never block a
  // paying customer. Every booking claims a day, one-time hauls included,
  // because a haul takes a truck for the day just like a standing pickup.
  const pickupWeekday = String((metadata && metadata.pickup_weekday) || '').trim();
  if (pickupWeekday) {
    try {
      const counts = await db.scheduledVisitCountsByWeekday();
      if (counts && (counts[pickupWeekday] || 0) >= DAILY_CAP) {
        return res.status(409).json({ error: `${pickupWeekday}s are fully booked. Please choose another day.` });
      }
    } catch (e) { console.warn('[create-booking] capacity check skipped:', e.message); }
  }

  // Set after the client's metadata is spread, so a page can't overwrite them.
  // Quote photos (api/photo-quote.js): only paths in the shape the server
  // names them. The webhook signs these for the owner, so a page must not be
  // able to slip in any other object in the bucket.
  const photos = String((metadata && metadata.photos) || '').split(',')
    .map((p) => p.trim()).filter((p) => db.QUOTE_PHOTO_RE.test(p)).slice(0, 4);
  const serverMeta = { plan: planKey, load: LOAD_LABELS[row], load_idx: String(row), photos: photos.join(',') };

  // Idempotency anchor: a network retry of the SAME booking reuses these keys
  // (Stripe returns the original objects instead of a second customer and a
  // second charge), while a fresh PaymentMethod gets a new key.
  const idemBase = crypto.createHash('sha256')
    .update([email, paymentMethodId, amount, row, fi, quarterly ? 'q' : 'm'].join('|'))
    .digest('hex').slice(0, 40);

  try {
    // 1. Create customer with default PM
    const customer = await stripe.customers.create({
      email,
      name:  name  || undefined,
      phone: phone || undefined,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
      metadata: { ...metadata, ...serverMeta },
    }, { idempotencyKey: `${idemBase}:cust` });

    // ── PATH B: One-time haul — single PaymentIntent ──────
    if (isOneTime) {
      const pi = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        customer: customer.id,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: false,
        description: `Brand Name — ${LOAD_LABELS[row]} haul`,
        statement_descriptor_suffix: 'HAUL',
        metadata: { ...metadata, ...serverMeta, plan: 'one_time' },
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      }, { idempotencyKey: `${idemBase}:pi` });

      return res.status(200).json({
        customerId:               customer.id,
        subscriptionId:           null,
        oneTimeClientSecret:      pi.client_secret,
        firstInvoiceClientSecret: null,
        plan:                     'one_time',
        amountChargedToday:       pi.amount,
      });
    }

    // ── PATH A: Recurring subscription ────────────────────
    // Each plan bills on its OWN cadence from BILLING_BY_COL. The quoted number
    // is the charged number; nothing here may invent a period the customer
    // wasn't shown. Quarterly overrides the cadence with a 3-month prepay.
    const interval    = quarterly ? QUARTERLY_INTERVAL : BILLING_BY_COL[fi].stripe;
    const finalAmount = quarterly ? quarterCents(amount, fi) : amount;

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{
        price_data: {
          currency: 'usd',
          product:  PRODUCT_ID,
          unit_amount: finalAmount,
          recurring: interval,
        },
      }],
      default_payment_method: paymentMethodId,
      payment_behavior:       'default_incomplete',
      payment_settings:       { save_default_payment_method: 'on_subscription' },
      expand:                 ['latest_invoice.payment_intent'],
      metadata: {
        ...metadata,
        ...serverMeta,
        cadence:      PLAN_KEYS[fi],    // the service cadence, even when billed quarterly
        quoted_price: String(amount),   // per-visit price after coupon, cents
      },
    }, { idempotencyKey: `${idemBase}:sub` });

    const invoice = subscription.latest_invoice;
    const pi = invoice && invoice.payment_intent;
    return res.status(200).json({
      customerId:               customer.id,
      subscriptionId:           subscription.id,
      oneTimeClientSecret:      null,
      firstInvoiceClientSecret: pi ? pi.client_secret : null,
      plan:                     planKey,
      amountChargedToday:       invoice && Number.isFinite(invoice.amount_due) ? invoice.amount_due : finalAmount,
    });
  } catch (err) {
    if (err && err.type && String(err.type).startsWith('Stripe')) {
      return res.status(err.statusCode || 402).json({ error: err.message, code: err.code, type: err.type });
    }
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
};
