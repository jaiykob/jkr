/**
 * SINGLE SOURCE OF TRUTH for public pricing and service area.
 * Same shape as Scoops Co.'s pricing.config.mjs.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  EDIT THE TABLE BELOW, THEN RUN:   npm run build:pricing            │
 * │  That one command rewrites every other copy of these numbers.       │
 * │  Verify at any time with:          npm run check:pricing            │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Nothing here is read by the browser at runtime. `npm run build:pricing`
 * regenerates, in place, everything between BUILD: markers in:
 *
 *   index.html                      the crawlable price list
 *   book/quote.html            the estimator's PRICES matrix, ZIP gate, JSON-LD offers
 *   book/checkout.html   the checkout billing table and ZIP gate
 *   api/create-booking.js      the server PRICES matrix and ZIP gate (authoritative)
 *
 * WHY THIS MATTERS: the server recomputes each booking's price from its own
 * matrix and rejects any quote that doesn't match ("Quote is out of date").
 * If the client and server copies drift, every checkout 400s.
 *
 * TODO: every price below is a placeholder. Set real ones before launch.
 */

/**
 * ┌─── THE PRICE TABLE — this is the one you edit ──────────────────────┐
 * │  One row per load size, smallest first. Dollars and cents.          │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Columns:
 *   oneTime   a single haul, charged once (PaymentIntent)
 *   monthly   a recurring monthly pickup, for landlords and businesses
 *             (Stripe subscription, billed every month)
 *
 * The number quoted IS the number charged, per visit.
 */
export const PRICE_TABLE = [
  //  load           one-time   monthly
  { load: 'single',  oneTime:  99.00, monthly:  89.00 },
  { load: 'quarter', oneTime: 199.00, monthly: 179.00 },
  { load: 'half',    oneTime: 349.00, monthly: 319.00 },
  { load: 'three',   oneTime: 479.00, monthly: 439.00 },
  { load: 'full',    oneTime: 599.00, monthly: 549.00 },
];

/**
 * Row labels, in PRICE_TABLE order. The estimator shows one tile per row, and
 * a last "More than a truck" tile that is quoted by hand (like Scoops Co.'s
 * "6+ dogs").
 */
export const LOADS = {
  single:  { label: 'Single item',  note: 'A couch, a mattress, an appliance' },
  quarter: { label: '1/4 truck',    note: 'A few pieces or a room corner' },
  half:    { label: '1/2 truck',    note: 'A small room or a garage corner' },
  three:   { label: '3/4 truck',    note: 'A full room or a small garage' },
  full:    { label: 'Full truck',   note: 'A garage, basement or estate' },
};

/**
 * Column order. The generated matrices are positional: every freq_idx in the
 * database and in Stripe metadata indexes into them by number, so reordering
 * this array silently reprices existing customers. Add new columns at the end.
 */
export const COLUMNS = ['oneTime', 'monthly'];

export const COLUMN_LABELS = {
  oneTime: 'One-time haul',
  monthly: 'Monthly pickup',
};

/**
 * How each column bills.
 *   weeks    one billing period in weeks (null = not recurring)
 *   stripe   the `recurring` object for Stripe's price_data; null = one-time
 *   unit     the suffix shown next to the price
 *   every    how the charge repeats, in words
 */
export const BILLING = {
  oneTime: { weeks: null,    stripe: null,                  unit: ' flat',   every: 'charged once' },
  monthly: { weeks: 52 / 12, stripe: { interval: 'month' }, unit: '/visit', every: 'every month' },
};

export const RECURRING = COLUMNS.filter((c) => BILLING[c].stripe);

/** Catches a pricing typo at build time rather than in checkout. */
function assertSane(table) {
  const fail = (msg) => { throw new Error(`pricing.config.mjs: ${msg}\nFix the PRICE_TABLE, then re-run npm run build:pricing.`); };
  const keys = Object.keys(LOADS);
  table.forEach((row, i) => {
    if (row.load !== keys[i]) fail(`row ${i + 1} is "${row.load}"; rows must follow LOADS order (${keys.join(', ')})`);
    for (const c of COLUMNS) {
      const v = row[c];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(`${row.load} / ${c} is "${v}"; every price must be a number, zero or more`);
      if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) fail(`${row.load} / ${c} is ${v}; two decimal places max`);
      if (i > 0 && v < table[i - 1][c]) fail(`${COLUMN_LABELS[c]}: ${row.load} is cheaper than ${table[i - 1].load}`);
    }
  });
  return table;
}

const SANE = assertSane(PRICE_TABLE);

/** The positional matrix every generated file is built from. INTEGER CENTS. */
export const PRICES = SANE.map((row) => COLUMNS.map((c) => Math.round(row[c] * 100)));

/** `9900` → `"$99.00"`. The one place cents become a string. */
export const fmt = (cents) => `$${(cents / 100).toFixed(2)}`;

export const ONE_TIME_COL = COLUMNS.indexOf('oneTime');
export const BILLING_BY_COL = COLUMNS.map((c) => BILLING[c]);
export const LOAD_OPTIONS = SANE.map((row, i) => ({ key: row.load, row: i, ...LOADS[row.load] }));

/** Quarterly prepay for recurring plans: 13 weeks up front, 10% off. */
export const QUARTERLY_DISCOUNT = 0.10;
export const WEEKS_PER_QUARTER = 13;

/** Cents charged up front for a quarter of `col`, discount applied. Null for one-time. */
export function quarterlyCents(row, col) {
  const weeks = BILLING_BY_COL[col].weeks;
  if (!weeks) return null;
  return Math.round((PRICES[row][col] / weeks) * WEEKS_PER_QUARTER * (1 - QUARTERLY_DISCOUNT));
}

/**
 * Service area. TODO: set the real one. Feeds three generated gates
 * (server, estimator, checkout), so it can only be changed here.
 */
export const SERVICE_AREA = [
  { city: 'Gresham',   region: 'OR', zips: ['97030', '97080'] },
  { city: 'Troutdale', region: 'OR', zips: ['97060'] },
  { city: 'Fairview',  region: 'OR', zips: ['97024'] },
];

export const ALL_ZIPS = SERVICE_AREA.flatMap((a) => a.zips);

/** The headline number: the cheapest one-time haul. */
export const STARTING_AT = fmt(PRICES[0][ONE_TIME_COL]);
