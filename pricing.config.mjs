/**
 * SINGLE SOURCE OF TRUTH for public pricing, travel zones and service area.
 * Same shape as Scoops Co.'s pricing.config.mjs.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  EDIT THE TABLES BELOW, THEN RUN:  npm run build:pricing            │
 * │  That one command rewrites every other copy of these numbers.       │
 * │  Verify at any time with:          npm run check:pricing            │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Nothing here is read by the browser at runtime. `npm run build:pricing`
 * regenerates, in place, everything between BUILD: markers in:
 *
 *   index.html                 the crawlable price list, the zone list
 *   book/quote.html            the order page's size cards, JSON-LD offers
 *
 * and writes two modules whole, twice each: the travel module,
 * api/_lib/travel.js (server) and js/travel.js (pages), and the order module,
 * api/_lib/order-config.js (create-booking reads it, authoritative) and
 * js/order-config.js (pages). Each pair is byte identical; every ZIP check and
 * travel fee on the site comes from them.
 *
 * WHY THIS MATTERS: the server recomputes each booking's price from its own
 * matrix and rejects any quote that doesn't match ("Quote is out of date").
 * If the client and server copies drift, every booking 400s.
 *
 * TODO: every price below is a placeholder (GUESS.prices). Set real ones
 * before launch.
 */

import ZIP_MILES from './data/zip-miles.mjs';

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
  single:  { label: 'Single item',  note: 'A couch, a mattress, an appliance', fits: 15, photo: '/images/placeholder.svg' },
  quarter: { label: '1/4 truck',    note: 'A few pieces or a room corner',     fits: 25, photo: '/images/placeholder.svg' },
  half:    { label: '1/2 truck',    note: 'A small room or a garage corner',   fits: 50, photo: '/images/placeholder.svg' },
  three:   { label: '3/4 truck',    note: 'A full room or a small garage',     fits: 75, photo: '/images/placeholder.svg' },
  full:    { label: 'Full truck',   note: 'A garage, basement or estate',      fits: 100, photo: '/images/placeholder.svg' },
};

/**
 * What the photo quote counts (api/photo-quote.js asks Claude for these keys).
 * The order page adds up the units and picks the smallest load size that holds
 * them (ORDER.sizeForUnits). A full truck is 100 units (about 15 cubic yards,
 * so one unit is roughly 0.15 cubic yards).
 *
 *   units   space the item takes, out of 100
 *   color   unused since round 6 (it colored the old on screen truck)
 *
 * `fits` above is each load size's ceiling in the same units. "Single item" is
 * one item of 15 units or less; anything over 100 is quoted by hand.
 * These numbers only pick a size; the server prices the size, never the items.
 */
export const ITEMS = [
  { key: 'couch',    label: 'Couch',                units: 12, color: '#E4572E' },
  { key: 'mattress', label: 'Mattress and box spring', units: 10, color: '#4C8BF5' },
  { key: 'fridge',   label: 'Fridge or freezer',    units: 8,  color: '#9AA5B1' },
  { key: 'washer',   label: 'Washer or dryer',      units: 6,  color: '#C3CBD3' },
  { key: 'chair',    label: 'Chair or recliner',    units: 6,  color: '#A0522D' },
  { key: 'dresser',  label: 'Dresser or cabinet',   units: 7,  color: '#8B5A2B' },
  { key: 'table',    label: 'Table',                units: 7,  color: '#C68B59' },
  { key: 'tv',       label: 'TV or electronics',    units: 2,  color: '#2E3440' },
  { key: 'boxes',    label: '5 boxes or bags',      units: 4,  color: '#D9B26F' },
  { key: 'yard',     label: 'Yard debris pile',     units: 20, color: '#3FA34D' },
  { key: 'carpet',   label: 'Carpet, one room',     units: 8,  color: '#8E6CCF' },
  { key: 'misc',     label: 'Something else',       units: 5,  color: '#F2A541' },
];

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
    if (!(LOADS[row.load]?.fits > (i ? LOADS[keys[i - 1]].fits : 0))) fail(`${row.load}: fits must grow with each load size`);
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
 * Where every travel distance is measured from (GUESS.base below).
 * Moving it means re-running `node scripts/measure-zips.mjs`.
 */
export const BASE = { label: 'Gresham', lat: 45.4982, lon: -122.4316 };

/**
 * Which values are guesses (founder, 2026-10-07: "just guess everything for
 * now and put it in red text with asterisk to store for later"). A guessed
 * value shows red with an asterisk (css/guess.css) wherever a page prints it,
 * and `npm run guesses` lists every one in GUESSES.md. Set a flag to false
 * once the real numbers are in, then run npm run build:pricing.
 */
export const GUESS = {
  prices: true,   // PRICE_TABLE: placeholder prices
  zones:  true,   // ZONES: the mile bands and the travel fees
  base:   true,   // BASE: Gresham city center, not the real yard
  schedule: true, // SCHEDULE: the hours, windows and caps
  policy:   true, // POLICY: the cancel window and the fees
};

/**
 * GUESS* the hours, windows and caps (GUESS.schedule): the founder sets the
 * real ones before launch. Every date is Pacific time (timeZone), never the
 * host's clock. Window `start` is 24 hour HH:MM; `cap` is jobs per window;
 * `dailyCap` is jobs per day across all windows.
 */
export const SCHEDULE = {
  timeZone: 'America/Los_Angeles',
  daysAhead: 14,            // day chips shown
  leadDays: 1,              // earliest bookable day = today (Pacific) + leadDays
  closedWeekdays: [0],      // 0 = Sunday
  windows: [
    { key: 'w08', label: '8 to 10 am',     start: '08:00', cap: 2 },
    { key: 'w10', label: '10 am to 12 pm', start: '10:00', cap: 2 },
    { key: 'w12', label: '12 to 2 pm',     start: '12:00', cap: 2 },
    { key: 'w14', label: '2 to 4 pm',      start: '14:00', cap: 2 },
  ],
  dailyCap: 6,
};

/** GUESS* the cancel window and fees (GUESS.policy). Dollars here, cents in the module. */
export const POLICY = {
  cancelHours: 24,          // free to cancel or move until this many hours before the window starts
  lateFee: 50,              // dollars, kept from the refund when the dashboard's Cancel and refund runs inside cancelHours
  refusalFee: 0,            // dollars, kept from the refund when the customer says no on site
  consentVersion: '2026-10-11', // 2026-10-10b: pay at booking, the difference charged or refunded after the job; 2026-10-11: the rule reworded (the crew checks the size, a bigger load charged only if the customer agrees)
};

/** Fails the build on a schedule that would misbook a day. */
function assertSchedule(sc) {
  const fail = (msg) => { throw new Error(`pricing.config.mjs: ${msg}
Fix SCHEDULE, then re-run npm run build:pricing.`); };
  const keys = new Set();
  let biggest = 0;
  for (const w of sc.windows) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start)) fail(`window ${w.key}: start "${w.start}" is not HH:MM`);
    if (keys.has(w.key)) fail(`window key "${w.key}" is used twice`);
    keys.add(w.key);
    if (!(Number.isInteger(w.cap) && w.cap >= 1)) fail(`window ${w.key}: cap must be a whole number, 1 or more`);
    biggest = Math.max(biggest, w.cap);
  }
  if (!(Number.isInteger(sc.dailyCap) && sc.dailyCap >= 1)) fail('dailyCap must be 1 or more');
  if (sc.dailyCap < biggest) fail(`dailyCap ${sc.dailyCap} is under the largest window cap ${biggest}`);
  return sc;
}
assertSchedule(SCHEDULE);

/**
 * ┌─── TRAVEL ZONES: the second table you edit ─────────────────────────┐
 * │  Rings of ROAD miles from BASE, nearest first. fee is dollars per   │
 * │  visit, added to the load price. Past the last ring is "call us".   │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * A ZIP's zone is the first ring whose upToMiles holds the road miles to the
 * ZIP's center (data/zip-miles.mjs); an edge belongs to the inner ring, so
 * exactly 10.0 miles is the home zone. Change a band and every ZIP moves with
 * it on the next build:pricing. The server charges load + fee and refuses a
 * quote that left the fee out.
 */
export const ZONES = [
  { key: 'home', label: 'Home zone', upToMiles: 10, fee:  0 },
  { key: 'z2',   label: 'Zone 2',    upToMiles: 20, fee: 25 },
  { key: 'z3',   label: 'Zone 3',    upToMiles: 30, fee: 50 },
  { key: 'z4',   label: 'Zone 4',    upToMiles: 40, fee: 75 },
];

/**
 * Pin a ZIP to a zone by hand, whatever its miles: { '97229': 'z3' }. Wins
 * over the miles. Use it when a ZIP's center sits in one zone but most of its
 * streets belong in another.
 */
export const ZONE_OVERRIDES = {};

/** Fails the build on a zone table that would misprice a ZIP. */
function assertZones(zones) {
  const fail = (msg) => { throw new Error(`pricing.config.mjs: ${msg}\nFix ZONES, then re-run npm run build:pricing.`); };
  const keys = new Set();
  zones.forEach((z, i) => {
    if (keys.has(z.key)) fail(`zone key "${z.key}" is used twice`);
    keys.add(z.key);
    if (!(z.upToMiles > (i ? zones[i - 1].upToMiles : 0))) fail(`${z.label}: upToMiles must grow with each zone`);
    if (typeof z.fee !== 'number' || !(z.fee >= 0) || Math.abs(z.fee * 100 - Math.round(z.fee * 100)) > 1e-6) fail(`${z.label}: fee must be dollars and cents, zero or more`);
    if (i > 0 && z.fee < zones[i - 1].fee) fail(`${z.label} costs less than ${zones[i - 1].label}`);
  });
  return zones;
}
assertZones(ZONES);

/** The zone key for a distance in road miles, or null past the last ring. */
export function zoneForMiles(miles) {
  const z = ZONES.find((x) => miles <= x.upToMiles);
  return z ? z.key : null;
}

/** Every ZIP that lands in a zone, with its zone, fee in cents and place. */
export function buildZipZones(zips, overrides) {
  for (const [zip, key] of Object.entries(overrides)) {
    if (!ZONES.some((x) => x.key === key)) throw new Error(`pricing.config.mjs: ZONE_OVERRIDES ${zip} names unknown zone "${key}"`);
  }
  const out = {};
  for (const [zip, r] of Object.entries(zips)) {
    const key = overrides[zip] || zoneForMiles(r.miles);
    if (!key) continue;
    const z = ZONES.find((x) => x.key === key);
    out[zip] = { zone: key, label: z.label, cents: Math.round(z.fee * 100), miles: r.miles, place: r.place, state: r.state };
  }
  return out;
}

/** The service area: every ZIP in a zone. Feeds the generated travel module. */
export const ZIP_ZONES = buildZipZones(ZIP_MILES.zips, ZONE_OVERRIDES);
// Nearest first. Object keys that look like numbers come back in numeric
// order, not the file's order, so sort by miles explicitly.
export const ALL_ZIPS = Object.keys(ZIP_ZONES).sort((a, b) => ZIP_ZONES[a].miles - ZIP_ZONES[b].miles || a.localeCompare(b));

/** The zones with their fees in integer cents, for the generated files. */
export const ZONE_LIST = ZONES.map((z) => ({ key: z.key, label: z.label, upToMiles: z.upToMiles, cents: Math.round(z.fee * 100) }));

/** Place names per zone, nearest first, each once ("Portland" can be in two). */
export const PLACES_BY_ZONE = Object.fromEntries(ZONES.map((z) => [z.key,
  [...new Set(ALL_ZIPS.filter((zip) => ZIP_ZONES[zip].zone === z.key).map((zip) => ZIP_ZONES[zip].place))]]));

/** Travel for one ZIP, or null when it is outside every zone. */
export function travelFor(zip) {
  const z = String(zip == null ? '' : zip).trim();
  const r = /^\d{5}$/.test(z) ? ZIP_ZONES[z] : null;
  return r ? { zip: z, zone: r.zone, label: r.label, cents: r.cents, miles: r.miles, place: r.place, state: r.state, market: 'portland' } : null;
}

/** The headline number: the cheapest one-time haul. */
export const STARTING_AT = fmt(PRICES[0][ONE_TIME_COL]);
