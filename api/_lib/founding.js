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
 * WHAT THE OFFER IS NOW: the card is saved at booking and charged once after
 * the job, so nothing is discounted at booking. create-booking records the
 * offer (founding, founding_discount_cents) for the final charge.
 *
 * WHERE THE COUNT LIVES: in Stripe, on the customer. A booking that gets the
 * offer stamps founding: 'true' in its customer's metadata, counted with
 * customers.search (SetupIntents cannot be searched). A spot is claimed at
 * booking. To give a spot back (a test booking, a cancellation), change that
 * customer's founding metadata to 'released' in the Stripe dashboard. The
 * count can overshoot by one in a race for the last spot; it never refuses
 * someone who was shown the offer unless the server can prove the spots are
 * gone.
 */

const FOUNDING = {
  open:       false,   // OFF until the founder runs a launch offer
  spots:      10,
  percentOff: 25,
};

// A quarter is three months; kept for the discount math (tested).
const MONTHS_PER_QUARTER = 3;

/**
 * Cents taken off for the founding offer, given what would otherwise be
 * charged. Rounded once here and recorded in cents, so the page, the receipt
 * and the final charge agree to the cent.
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

/**
 * Founding bookings so far. Throws if Stripe can't be read. A booking saves a
 * card (a SetupIntent, which Stripe cannot search), so the customer carries the
 * stamp: create-booking sets founding: 'true' in the customer's metadata.
 */
async function claimedSpots(stripe) {
  return countSearch(stripe.customers, "metadata['founding']:'true'", () => true);
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

function _resetCache() { cache = { at: 0, left: null }; }

module.exports = {
  FOUNDING,
  firstMonthDiscountCents,
  claimedSpots,
  spotsLeft,
  _resetCache,
};
