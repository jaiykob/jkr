/**
 * Vercel Serverless Function: create-booking
 *
 * Round 6, pay at booking (founder, 2026-10-10: "payments have to be accepted
 * at time of bookings so i can pay hauler"): the quoted total is PAID when the
 * customer books, and the card is saved so that after the job a bigger size is
 * charged the difference and a smaller one refunded it (api/visit-update.js).
 * This function creates a Stripe customer and ONE PaymentIntent for the total
 * (less any founding discount) with setup_future_usage 'off_session', and
 * returns its client secret for the page to confirm. It never creates a
 * SetupIntent, a subscription or a coupon. The webhook books the job when the
 * PaymentIntent succeeds (payment_intent.succeeded, metadata.kind 'booking').
 *
 * The total is recomputed here from the order module (size price plus the
 * ZIP's travel fee). The page's number is only cross-checked. The customer's
 * consent to the difference being charged or refunded later is required and
 * stamped here, with the server clock, on the card path and the wallet path alike.
 *
 * Refusals (nothing is created in Stripe for any of them):
 *   400 bad_request | outside_area | stale_quote | closed_day | consent_required
 *   409 window_full (capacity fails open when the database cannot be read)
 *   503 live mode with a closed gate
 *
 * Required env vars in Vercel (Settings → Environment Variables):
 *   STRIPE_SECRET_KEY    = sk_test_... or sk_live_...
 *   BOOKINGS_OPEN        = true       (second booking gate, live mode only)
 */

const Stripe = require('stripe');
const crypto = require('crypto');
const db = require('./_lib/db');
const site = require('./_lib/site');
const founding = require('./_lib/founding');
// Sizes, prices, windows, open days, consent version. GENERATED from
// pricing.config.mjs by `npm run build:pricing`.
const ORDER = require('./_lib/order-config');
// The authoritative service-area gate AND the travel fee: a ZIP outside every
// zone gets null. GENERATED (whole file) from ZONES in pricing.config.mjs.
const travel = require('./_lib/travel');

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
    `https://${site.DOMAIN}`,   // the site address: api/_lib/site.js
    site.SITE_URL,
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
  const SECRET = process.env.STRIPE_SECRET_KEY;
  if (!SECRET) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });

  const stripe = new Stripe(SECRET, { apiVersion: '2024-06-20' });

  // ── Booking kill switch ───────────────────────────────────
  // Three gates must all be open to take a live booking, same as Scoops Co.:
  //   1. BOOKINGS_OPEN_SERVER below (in code, deploys from `main`)
  //   2. BOOKINGS_OPEN=true in Vercel env vars
  //   3. BOOKINGS_OPEN_CLIENT in book/quote.html (UI only)
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
    try { body = JSON.parse(body); } catch { return res.status(400).json({ code: 'bad_request', error: 'Invalid JSON' }); }
  }
  body = body || {};

  const {
    email, name, phone, size, zip, date,
    window: windowKey,
    quotedCents,         // the page's displayed total (cents): cross-checked, never trusted
    consent,
    attemptId,
    founding: foundingShown = false,   // the page showed the founding member discount
    metadata = {},
  } = body;
  const bad = (error) => res.status(400).json({ code: 'bad_request', error });

  if (!email || !/^[^\s@]+@[^\s@]+$/.test(String(email))) return bad('Missing required field: email');
  if (!/^[\w-]{1,100}$/.test(String(attemptId || ''))) return bad('Missing required field: attemptId');
  const row = Number(size);
  if (!Number.isInteger(row) || row < 0 || row >= ORDER.SIZES.length) return bad('Invalid size. Please rebuild your quote.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return bad('Invalid day');
  const win = ORDER.SCHEDULE.windows.find((w) => w.key === windowKey);
  if (!win) return bad('Invalid arrival window');

  const trip = travel.travelFor(zip);
  if (!trip) {
    return res.status(400).json({ code: 'outside_area', error: 'Sorry, that address is outside our service area' });
  }
  // The address is what the route and the CRM use, so it has to name the ZIP
  // that just passed the gate.
  const addressZip = zipFromAddress(metadata && metadata.address);
  if (addressZip && addressZip !== String(zip).trim()) {
    return res.status(400).json({ code: 'outside_area', error: 'Sorry, that address is outside our service area' });
  }

  // The size's price plus the travel fee for the ZIP's zone, integer cents
  // (do NOT multiply by 100).
  const loadCents   = ORDER.SIZES[row].cents;
  const totalCents  = ORDER.totalFor(row, trip.cents);
  const clientCents = Math.round(Number(quotedCents));
  if (!Number.isFinite(clientCents) || clientCents !== totalCents) {
    return res.status(400).json({ code: 'stale_quote', totalCents, error: 'Your quote is out of date. Please review the new total.' });
  }

  if (!ORDER.isBookable(date, windowKey, Date.now())) {
    return res.status(400).json({ code: 'closed_day', error: 'We are not booking that day. Please choose another.' });
  }

  // Consent to the difference being charged or refunded after the job. The
  // time is stamped by the server, never taken from the page.
  if (!consent || consent.agreed !== true || consent.version !== ORDER.POLICY.consentVersion) {
    return res.status(400).json({ code: 'consent_required', error: 'Please agree to the terms and to the difference being charged or refunded to book.' });
  }
  const consentAt = new Date().toISOString();

  // ── Window capacity backstop ──────────────────────────────
  // FAIL-OPEN: if the count can't be read, allow the booking; a capacity read
  // must never block a customer.
  try {
    const counts = await db.slotCounts({ market: trip.market, from: date, to: date });
    const day = counts && counts[date];
    if (day && ((day[windowKey] || 0) >= win.cap || (day.total || 0) >= ORDER.SCHEDULE.dailyCap)) {
      return res.status(409).json({ code: 'window_full', error: 'That arrival window just filled up. Please choose another.' });
    }
  } catch (e) { console.warn('[create-booking] capacity check skipped:', e.message); }

  // Quote photos (api/photo-quote.js): only paths in the shape the server
  // names them. The webhook signs these for the owner, so a page must not be
  // able to slip in any other object in the bucket.
  const photos = String((metadata && metadata.photos) || '').split(',')
    .map((p) => p.trim()).filter((p) => db.QUOTE_PHOTO_RE.test(p)).slice(0, 4);
  // Spread AFTER the page's metadata, so a page can't overwrite them. Travel
  // and the quote ride with the booking so the webhook, email, Discord ping
  // and dashboard never recompute them.
  const serverMeta = {
    kind: 'booking', size: ORDER.SIZES[row].key, load: ORDER.SIZES[row].label, load_idx: String(row),
    load_cents: String(loadCents), travel_cents: String(trip.cents), total_cents: String(totalCents),
    zip: trip.zip, zone: trip.zone, zone_label: trip.label, miles: String(trip.miles), market: trip.market,
    date, window: windowKey, consent_at: consentAt, consent_version: ORDER.POLICY.consentVersion,
    photos: photos.join(','),
  };

  // ── Founding member offer (api/_lib/founding.js; off unless FOUNDING.open)
  // Re-counted live here, never trusted from the page. The discount comes off
  // the booking payment, and founding: 'true' rides in its metadata so the
  // after job difference takes the same percent off the final total (R19).
  // If the page showed the offer but the last spot just went, refuse so the
  // customer reviews the regular price (founding_closed).
  let foundingApplied = false;
  if (founding.FOUNDING.open) {
    let left = null;
    try { left = await founding.spotsLeft(stripe, { fresh: true }); }
    catch (e) { console.warn('[create-booking] founding count unreadable:', e.message); }
    if (left === null) foundingApplied = foundingShown === true;
    else if (left > 0) foundingApplied = true;
    else if (foundingShown === true) {
      return res.status(409).json({
        code:  'founding_closed',
        error: 'The last founding member spot was just claimed, so this booking is at the regular price. Your updated total is shown above. Please review it and book again.',
      });
    }
  }
  const foundingCents = foundingApplied ? founding.firstMonthDiscountCents(totalCents) : 0;
  const foundingResult = foundingApplied ? { percentOff: founding.FOUNDING.percentOff, discountCents: foundingCents } : null;
  // Stamped after the page's metadata is spread, so a page cannot stamp
  // itself a founding member (which is what the spot count reads).
  Object.assign(serverMeta, foundingApplied
    ? { founding: 'true', founding_discount_cents: String(foundingCents) }
    : { founding: 'false', founding_discount_cents: '0' });

  // Idempotency: each key is the hash of the exact params sent, EXCLUDING
  // consent_at (the server clock), so an edited resubmit (new phone, address,
  // notes) gets a new key. A second Book of the same order reuses the key with
  // a different consent_at: Stripe answers StripeIdempotencyError, and
  // createOnce below retries once with a fresh key. So every attempt gets a
  // new customer and a new PaymentIntent. That is harmless while nothing is
  // paid (an unconfirmed PaymentIntent simply lapses); a second CHARGE is
  // stopped by the page, which asks Stripe whether its last PaymentIntent was
  // paid before it books again (lastPay in js/order.js).
  const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
    : JSON.stringify(v));
  const keyFor = (kind, params) => {
    const q = { ...params, metadata: { ...params.metadata } };
    delete q.metadata.consent_at;
    return crypto.createHash('sha256').update(attemptId + '|' + kind + '|' + canon(q)).digest('hex').slice(0, 40);
  };
  const createOnce = async (kind, create, params) => {
    const key = `${keyFor(kind, params)}:${kind}`;
    try { return await create(params, { idempotencyKey: key }); }
    catch (e) {
      if (!(e && e.type === 'StripeIdempotencyError')) throw e;
      return create(params, { idempotencyKey: `${key}:${crypto.randomBytes(6).toString('hex')}` });
    }
  };

  try {
    const customer = await createOnce('cust', (q, o) => stripe.customers.create(q, o), {
      email,
      name:  name  || undefined,
      phone: phone || undefined,
      metadata: { ...metadata, ...serverMeta },
    });

    // The booking payment: the total now, the card saved for the difference.
    // The page confirms it (Payment Element or a wallet); nothing here does.
    const amountCents = totalCents - foundingCents;
    const paymentIntent = await createOnce('pi', (q, o) => stripe.paymentIntents.create(q, o), {
      amount: amountCents,
      currency: 'usd',
      customer: customer.id,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      description: `${site.NAME}: ${ORDER.SIZES[row].label} haul, ${trip.label}, ${date}`,
      metadata: { ...metadata, ...serverMeta },
    });

    return res.status(200).json({
      customerId:                customer.id,
      paymentIntentClientSecret: paymentIntent.client_secret,
      totalCents,                // the total before any founding discount
      amountCents,               // what is charged now
      loadCents,
      travelCents:               trip.cents,
      founding:                  foundingResult,
    });
  } catch (err) {
    if (err && err.type && String(err.type).startsWith('Stripe')) {
      return res.status(err.statusCode || 402).json({ error: err.message, code: err.code, type: err.type });
    }
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
};
