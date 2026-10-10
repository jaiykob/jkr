/**
 * Brand Name — shared Supabase (PostgREST) writer for the booking spine.
 *
 * Thin wrapper over the Supabase REST API using the SERVICE_ROLE key (bypasses
 * RLS). Plain fetch, no SDK — matches the Discord/Resend pattern. Every spine
 * write (customers, subscriptions, visits) goes through here so idempotency and
 * fail-safe behavior live in exactly one place.
 *
 * Required env vars (production):
 *   SUPABASE_URL               = https://YOUR-PROJECT.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  = (Project Settings → API → service_role secret)
 *
 * FAIL-SAFE: with no service-role key (or before db/schema.sql is applied) every
 * function logs and returns null instead of throwing — a missing env var or an
 * un-applied schema can never break the Stripe webhook. Same philosophy as the
 * optional OPS_WEBHOOK_URL / RESEND_API_KEY.
 */

function cfg() {
  return {
    url: process.env.SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co',
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

// Low-level PostgREST call. Never throws; returns parsed JSON array, or null on
// any failure (missing key, table not created yet, non-2xx, network error).
async function rest(method, path, { body, prefer } = {}) {
  const { url, key } = cfg();
  if (!key) {
    console.log('[db] no SUPABASE_SERVICE_ROLE_KEY — spine write skipped:', method, path);
    return null;
  }
  try {
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[db] non-2xx:', method, path, r.status, t.slice(0, 300));
      return null;
    }
    if (r.status === 204) return [];
    return await r.json().catch(() => []);
  } catch (e) {
    console.error('[db] request failed:', method, path, e.message);
    return null;
  }
}

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

/**
 * Upsert a customer keyed on stripe_customer_id (unique). Returns the row
 * (with its uuid id) or null. Only writes columns we actually have at booking
 * time; checkout doesn't yet collect access_notes.
 */
async function upsertCustomer({ stripeCustomerId, name, email, phone, address, zip }) {
  if (!stripeCustomerId) return null;
  const { first_name, last_name } = splitName(name);
  const row = {
    stripe_customer_id: stripeCustomerId,
    first_name, last_name,
    email:   email   || null,
    phone:   phone   || null,
    address: address || null,
    zip:     zip     || null,
  };
  const rows = await rest('POST', 'customers?on_conflict=stripe_customer_id', {
    body: row,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * Upsert a subscription keyed on stripe_subscription_id (unique). For one-time
 * hauls (no Stripe subscription) pass stripeSubscriptionId=null and a unique
 * `dedupeId` (the PaymentIntent id) so a webhook redelivery doesn't duplicate.
 */
async function upsertSubscription(fields) {
  const {
    customerId, stripeSubscriptionId, plan, frequency, freqIdx,
    pickupDay, loadSize, priceCents, status, currentPeriodEnd, startedAt, dedupeId,
    travelZone, travelCents, travelMiles,
  } = fields;
  const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  if (!customerId) return null;

  const row = {
    customer_id: customerId,
    plan:        plan || null,
    frequency:   frequency || null,
    ...(Number.isFinite(Number(freqIdx)) ? { freq_idx: parseInt(freqIdx, 10) } : {}),
    pickup_day:  pickupDay || null,
    load_size:   loadSize || null,
    // Travel zone, fee and road miles (create-booking metadata). Absent on
    // bookings made before travel zones, so only written when present.
    ...(travelZone ? { travel_zone: travelZone } : {}),
    ...(num(travelCents) != null ? { travel_cents: Math.round(num(travelCents)) } : {}),
    ...(num(travelMiles) != null ? { travel_miles: num(travelMiles) } : {}),
    ...(Number.isFinite(Number(priceCents)) ? { price_cents: parseInt(priceCents, 10) } : {}),
    status:      status || 'incomplete',
    ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
    ...(startedAt ? { started_at: startedAt } : {}),
  };

  if (stripeSubscriptionId) {
    row.stripe_subscription_id = stripeSubscriptionId;
    const rows = await rest('POST', 'subscriptions?on_conflict=stripe_subscription_id', {
      body: row,
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  // One-time hauls have no Stripe subscription id. Synthesize a stable unique
  // key from the PaymentIntent id so a webhook redelivery upserts the same row
  // instead of inserting a duplicate.
  if (dedupeId) row.stripe_subscription_id = `pi_${dedupeId}`;
  const rows = await rest('POST', 'subscriptions?on_conflict=stripe_subscription_id', {
    body: row,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** Update a subscription's status/period by its Stripe id. No-op if not found. */
async function updateSubscriptionByStripeId(stripeSubscriptionId, patch) {
  if (!stripeSubscriptionId) return null;
  const rows = await rest(
    'PATCH',
    `subscriptions?stripe_subscription_id=eq.${encodeURIComponent(stripeSubscriptionId)}`,
    { body: patch, prefer: 'return=representation' },
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// ── Visits ───────────────────────────────────────────────────────────────────

/** Create one visit. Returns the row (with id) or null. */
async function createVisit({ customerId, subscriptionId, scheduledDate, status = 'scheduled' }) {
  if (!customerId || !scheduledDate) return null;
  const rows = await rest('POST', 'visits', {
    body: {
      customer_id:     customerId,
      subscription_id: subscriptionId || null,
      scheduled_date:  scheduledDate,
      status,
    },
    prefer: 'return=representation',
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * Create the first visit for a subscription only if it has none yet. Idempotent
 * against webhook redelivery (visits carry no Stripe id to upsert on).
 */
async function ensureFirstVisit({ customerId, subscriptionId, scheduledDate }) {
  if (!customerId || !subscriptionId || !scheduledDate) return null;
  const existing = await rest('GET', `visits?subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id&limit=1`);
  if (existing === null) return null;            // table missing / error — skip
  if (Array.isArray(existing) && existing.length) return existing[0]; // already has a visit
  return createVisit({ customerId, subscriptionId, scheduledDate });
}

/**
 * Cancel a subscription's visits that haven't happened yet (scheduled, today
 * or later). Past and completed visits are left alone — they're history.
 * Returns the cancelled rows, or null on error / no table.
 */
async function cancelFutureVisits(subscriptionId, fromDateStr) {
  if (!subscriptionId) return null;
  const today = fromDateStr || new Date().toISOString().slice(0, 10);
  const rows = await rest(
    'PATCH',
    `visits?subscription_id=eq.${encodeURIComponent(subscriptionId)}&status=eq.scheduled&scheduled_date=gte.${today}`,
    { body: { status: 'canceled' }, prefer: 'return=representation' },
  );
  return Array.isArray(rows) ? rows : null;
}

/** Patch a visit by id. Returns the row or null. */
async function updateVisit(visitId, patch) {
  if (!visitId) return null;
  const rows = await rest('PATCH', `visits?id=eq.${encodeURIComponent(visitId)}`, {
    body: patch,
    prefer: 'return=representation',
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** One visit row by id, with its customer (customers(*)). */
async function getVisit(visitId) {
  if (!visitId) return null;
  const rows = await rest('GET', `visits?id=eq.${encodeURIComponent(visitId)}&select=*,customers(*)&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** One visit joined with its customer + subscription, for building email context. */
async function getVisitContext(visitId) {
  if (!visitId) return null;
  const rows = await rest(
    'GET',
    `visits?id=eq.${encodeURIComponent(visitId)}&select=*,customers(*),subscriptions(*),visit_photos(*)`,
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** Visits scheduled on `dateStr` that still need a reminder, joined with customer. */
async function visitsDueForReminder(dateStr) {
  if (!dateStr) return [];
  const rows = await rest(
    'GET',
    `visits?scheduled_date=eq.${dateStr}&status=eq.scheduled&reminder_sent_at=is.null` +
      `&select=*,customers(first_name,email),subscriptions(pickup_day)`,
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * Active recurring subscriptions and their visits, so a cron can ensure each has
 * a future scheduled visit (self-healing if a completion didn't generate one).
 */
async function activeSubscriptionsWithVisits() {
  const rows = await rest(
    'GET',
    `subscriptions?status=eq.active&select=*,visits(id,scheduled_date,status)`,
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * Count upcoming scheduled visits grouped by weekday name. Because each active
 * recurring subscription self-heals to keep exactly one future 'scheduled' visit
 * at a time, this is a live proxy for how many customers already own each route
 * day — the signal behind the day-capacity cap.
 *
 * @returns {Object} { Monday: n, Thursday: n, ... } (weekdays with 0 omitted).
 *   Returns {} when the DB/schema is unreachable so callers can fail open.
 */
async function scheduledVisitCountsByWeekday(fromDateStr) {
  const today = fromDateStr || new Date().toISOString().slice(0, 10);
  const rows = await rest(
    'GET',
    `visits?status=eq.scheduled&scheduled_date=gte.${today}&select=scheduled_date`,
  );
  const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const counts = {};
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r.scheduled_date) continue;
    // Bare DATE → noon UTC so the weekday never shifts across timezones.
    const wd = NAMES[new Date(`${String(r.scheduled_date).slice(0, 10)}T12:00:00Z`).getUTCDay()];
    counts[wd] = (counts[wd] || 0) + 1;
  }
  return counts;
}

// ── Windows (order flow) ─────────────────────────────────────────────────────

/**
 * Visits per day and 2 hour window for one market, canceled ones left out.
 * @returns {Object} { 'YYYY-MM-DD': { total, w08, w10, ... } }. {} when the
 *   database cannot be read, so the capacity API fails open.
 */
async function slotCounts({ market, from, to } = {}) {
  if (!market || !from || !to) return {};
  const rows = await rest(
    'GET',
    `visits?market=eq.${encodeURIComponent(market)}&status=neq.canceled` +
      `&scheduled_date=gte.${from}&scheduled_date=lte.${to}&select=scheduled_date,window_key&limit=5000`,
  );
  const out = {};
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r.scheduled_date) continue;
    const day = (out[String(r.scheduled_date).slice(0, 10)] ||= { total: 0 });
    day.total += 1;
    if (r.window_key) day[r.window_key] = (day[r.window_key] || 0) + 1;
  }
  return out;
}

/**
 * Create the booked visit of an order (card saved, charged after the job).
 * Idempotent on stripe_setup_intent_id: a redelivered webhook gets the existing
 * row back. Returns the visit, or null (logged) on any failure.
 */
async function createBookedVisit(fields = {}) {
  const f = fields;
  if (!f.customerId || !f.scheduledDate || !f.windowKey || !f.stripeSetupIntentId) return null;
  const find = () => rest('GET', `visits?stripe_setup_intent_id=eq.${encodeURIComponent(f.stripeSetupIntentId)}&select=*&limit=1`);
  const existing = await find();
  if (existing === null) return null;
  if (Array.isArray(existing) && existing[0]) return existing[0];
  const int = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  const rows = await rest('POST', 'visits?on_conflict=stripe_setup_intent_id', {
    body: {
      customer_id:              f.customerId,
      subscription_id:          f.subscriptionId || null,
      scheduled_date:           f.scheduledDate,
      status:                   'scheduled',
      window_key:               f.windowKey,
      market:                   f.market || 'portland',
      quoted_load_idx:          int(f.quotedLoadIdx),
      quoted_load_cents:        int(f.quotedLoadCents),
      quoted_cents:             int(f.quotedCents),
      travel_cents:             int(f.travelCents),
      payment_status:           f.paymentStatus || 'card_saved',
      stripe_setup_intent_id:   f.stripeSetupIntentId,
      stripe_payment_method_id: f.stripePaymentMethodId || null,
      consent_at:               f.consentAt || null,
      consent_version:          f.consentVersion || null,
    },
    prefer: 'resolution=ignore-duplicates,return=representation',
  });
  if (Array.isArray(rows) && rows[0]) return rows[0];
  if (rows === null) return null;
  // A parallel delivery won the insert: return its row.
  const again = await find();
  return Array.isArray(again) && again[0] ? again[0] : null;
}

// ── Visit photos + private storage ───────────────────────────────────────────

/** Record a before/after photo row (file already in the private bucket). */
async function recordVisitPhoto({ visitId, customerId, kind, storagePath }) {
  if (!visitId || !customerId || !kind || !storagePath) return null;
  const rows = await rest('POST', 'visit_photos', {
    body: { visit_id: visitId, customer_id: customerId, kind, storage_path: storagePath },
    prefer: 'return=representation',
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** Storage paths of a visit's photos of one kind ([] when none, null on error). */
async function visitPhotoPaths(visitId, kind) {
  if (!visitId || !kind) return null;
  const rows = await rest('GET', `visit_photos?visit_id=eq.${encodeURIComponent(visitId)}&kind=eq.${encodeURIComponent(kind)}&select=storage_path`);
  return Array.isArray(rows) ? rows.map((r) => r.storage_path) : null;
}

// Low-level Supabase Storage call (different base path than PostgREST).
async function storage(method, path, body) {
  const { url, key } = cfg();
  if (!key) { console.log('[db] no service key — storage call skipped:', method, path); return null; }
  try {
    const r = await fetch(`${url}/storage/v1/${path}`, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[db] storage non-2xx:', method, path, r.status, t.slice(0, 200));
      return null;
    }
    return await r.json().catch(() => ({}));
  } catch (e) {
    console.error('[db] storage failed:', method, path, e.message);
    return null;
  }
}

const PHOTO_BUCKET = 'visit-photos';

/** Mint a one-time signed upload URL so the dashboard PUTs the file direct to Supabase. */
async function signPhotoUpload(objectPath) {
  const data = await storage('POST', `object/upload/sign/${PHOTO_BUCKET}/${objectPath}`);
  if (!data || !data.url) return null;
  const { url } = cfg();
  return { uploadUrl: `${url}/storage/v1${data.url}`, token: data.token, path: objectPath };
}

/** Short-lived signed GET URL for a private photo (for embedding in an email). */
async function signPhotoDownload(objectPath, expiresIn = 60 * 60 * 24 * 7) {
  const data = await storage('POST', `object/sign/${PHOTO_BUCKET}/${objectPath}`, { expiresIn });
  if (!data || !data.signedURL) return null;
  const { url } = cfg();
  return `${url}/storage/v1${data.signedURL}`;
}

/**
 * Customer quote photos (api/photo-quote.js) live in the same private bucket
 * under quotes/. The server names them, so a path that doesn't match this is
 * not ours and is never recorded or signed.
 */
const QUOTE_PHOTO_RE = /^quotes\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{24}\.jpg$/;

/** Upload JPEG bytes to the private bucket. Returns the path, or null. */
async function uploadPhoto(objectPath, buffer) {
  const { url, key } = cfg();
  if (!key) { console.log('[db] no service key — photo upload skipped:', objectPath); return null; }
  try {
    const r = await fetch(`${url}/storage/v1/object/${PHOTO_BUCKET}/${objectPath}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' },
      body: buffer,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[db] photo upload non-2xx:', objectPath, r.status, t.slice(0, 200));
      return null;
    }
    return objectPath;
  } catch (e) {
    console.error('[db] photo upload failed:', objectPath, e.message);
    return null;
  }
}

module.exports = {
  upsertCustomer,
  upsertSubscription,
  updateSubscriptionByStripeId,
  createVisit,
  ensureFirstVisit,
  cancelFutureVisits,
  updateVisit,
  getVisit,
  getVisitContext,
  visitsDueForReminder,
  activeSubscriptionsWithVisits,
  scheduledVisitCountsByWeekday,
  slotCounts,
  createBookedVisit,
  recordVisitPhoto,
  visitPhotoPaths,
  signPhotoUpload,
  signPhotoDownload,
  uploadPhoto,
  QUOTE_PHOTO_RE,
  PHOTO_BUCKET,
};
