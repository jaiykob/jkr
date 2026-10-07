/**
 * Founding member offer: 25% off the first month (or the whole one-time
 * haul) for the first 10 bookings. Carried over from Scoops Co. (2026-10-07).
 *
 * OFF (`open: false`). Founder decision pending: the site sells at its real
 * price until the founder chooses to run a launch offer. Turning it on is one
 * flag; everything below is tested (scripts/test-founding.mjs).
 *
 * THIS FILE IS THE ONLY COPY of the terms. Pages read them from
 * GET /api/founding-spots, so the banner, the checkout breakdown and the
 * charge cannot disagree. The discount is taken off the whole per visit
 * price, travel included, and create-booking re-counts the spots live before
 * any charge: a page that showed the offer after the last spot went gets
 * `founding_closed` and the regular price to review.
 *
 * WHAT "FIRST MONTH" MEANS
 *   monthly pickup  a Stripe coupon, duration repeating, 1 month
 *   quarterly       a third of the first quarterly charge
 *   one-time haul   off the single charge
 *
 * WHERE THE COUNT LIVES: in Stripe. A booking that gets the discount is
 * stamped `founding: true` in its metadata, and a spot is claimed once that
 * booking has paid; a declined card never uses one. To give a spot back
 * (a test booking, a refund), change that booking's `founding` metadata to
 * `released` in the Stripe dashboard. The count can overshoot by one in a
 * race for the last spot; it never charges someone who was shown the
 * discount without it unless the server can prove the spots are gone.
 */

const FOUNDING = {
  open:       false,   // OFF until the founder runs a launch offer
  spots:      10,
  percentOff: 25,
};

// A quarter is 13 weeks of service; a month is 4.333 weeks: exactly a third.
const MONTHS_PER_QUARTER = 3;

/**
 * Cents taken off for the founding offer, given what would otherwise be
 * charged. Rounded once here, and the coupon is created with this exact
 * `amount_off`, so the page, the invoice and the receipt agree to the cent —
 * a percent-off coupon would leave the half-cent rounding to Stripe.
 *
 * @param chargeCents  per-period charge before the offer (quarterly: the
 *                     whole quarter, 10% already off)
 * @param quarterly    true when chargeCents covers a quarter
 */
function firstMonthDiscountCents(chargeCents, { quarterly = false } = {}) {
  const cents = Number(chargeCents);
  if (!(cents > 0)) return 0;
  const monthCents = quarterly ? cents / MONTHS_PER_QUARTER : cents;
  return Math.round(monthCents * FOUNDING.percentOff / 100);
}

// Statuses that mean the subscription's first invoice was paid. `canceled`
// counts: a member who paid and then left still claimed their spot.
const CLAIMED_SUB_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'canceled']);

async function countSearch(resource, query, keep) {
  let n = 0;
  let page = null;
  do {
    const r = await resource.search({ query, limit: 100, ...(page ? { page } : {}) });
    n += (r.data || []).filter(keep).length;
    page = r.has_more ? r.next_page : null;
  } while (page);
  return n;
}

/** Paid founding bookings so far. Throws if Stripe can't be read. */
async function claimedSpots(stripe) {
  const [subs, oneTimes] = await Promise.all([
    countSearch(stripe.subscriptions, "metadata['founding']:'true'", (s) => CLAIMED_SUB_STATUSES.has(s.status)),
    countSearch(stripe.paymentIntents, "metadata['founding']:'true' AND status:'succeeded'", () => true),
  ]);
  return subs + oneTimes;
}

// The public counter is read on every homepage view; a short in-memory cache
// on the warm function keeps that off Stripe's search rate limit. Checkout
// passes { fresh: true } and always reads the live count.
const CACHE_MS = 30 * 1000;
let cache = { at: 0, left: null };

/** Spots still open (0 when the offer is off). Throws if Stripe can't be read. */
async function spotsLeft(stripe, { fresh = false } = {}) {
  if (!FOUNDING.open) return 0;
  if (!fresh && cache.left !== null && Date.now() - cache.at < CACHE_MS) return cache.left;
  const left = Math.max(0, FOUNDING.spots - await claimedSpots(stripe));
  cache = { at: Date.now(), left };
  return left;
}

/**
 * The Stripe coupon for a given discount, created on first use. The id is
 * derived from the amount, so every weekly 1-dog member shares one coupon
 * rather than each booking minting its own.
 */
async function ensureCoupon(stripe, discountCents) {
  const id = `founding-${FOUNDING.percentOff}pct-first-month-${discountCents}c`;
  try {
    await stripe.coupons.retrieve(id);
    return id;
  } catch (e) {
    if (e.code !== 'resource_missing') throw e;
  }
  try {
    await stripe.coupons.create({
      id,
      amount_off:         discountCents,
      currency:           'usd',
      duration:           'repeating',
      duration_in_months: 1,
      name:               `Founding member: ${FOUNDING.percentOff}% off first month`,
      metadata:           { founding: 'true' },
    });
  } catch (e) {
    // Two checkouts minting the same coupon at once: the other one won.
    if (e.code !== 'resource_already_exists') throw e;
  }
  return id;
}

function _resetCache() { cache = { at: 0, left: null }; }

module.exports = {
  FOUNDING,
  firstMonthDiscountCents,
  claimedSpots,
  spotsLeft,
  ensureCoupon,
  _resetCache,
};
