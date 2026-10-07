/**
 * npm run build:pricing   rewrite every BUILD: block from pricing.config.mjs
 * npm run check:pricing   fail if any block has drifted from it (runs in npm test)
 *
 * Same job as Scoops Co.'s scripts/build-pricing.mjs. Targets, each delimited
 * by BUILD: markers in its own file:
 *
 *   api/create-booking.js     server-prices                (authoritative)
 *   book/quote.html           quote-jsonld, quote-prices
 *   book/checkout.html  checkout-billing
 *   index.html                     home-prices, home-builder
 *   api/photo-quote.js              server-items
 *   book/quote.html                 (also) quote-builder
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRICES, COLUMNS, COLUMN_LABELS, BILLING, BILLING_BY_COL, ONE_TIME_COL, LOAD_OPTIONS,
  ZIP_ZONES, ALL_ZIPS, ZONE_LIST, PLACES_BY_ZONE, GUESS, BASE, ITEMS, WEEKS_PER_QUARTER, QUARTERLY_DISCOUNT, STARTING_AT, fmt,
} from '../pricing.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const J = (v) => JSON.stringify(v);
/* Labels that start with a slash ("/visit") are escaped so Google does not read
   them as links inside a script and crawl /visit (a real 404 at Scoops Co.). */
const Jslash = (v) => J(v).replace(/\//g, '\\u002F');
const planKey = (c) => (c === 'oneTime' ? 'one_time' : c);
const pad = (n) => String(n).padStart(6);
/* A value that is still a placeholder prints red with an asterisk (css/guess.css). */
const guessed = (html, on) => (on ? `<span class="guess">${html}</span>` : html);

/* Every place with a ZIP in a zone, once each, nearest first ("Vancouver, WA"). */
const AREA_SERVED = [...new Set(ALL_ZIPS.map((z) => `${ZIP_ZONES[z].place}, ${ZIP_ZONES[z].state}`))];

/* ── server ───────────────────────────────────────────────────────────── */
const serverPrices = [
  'const PRICES = [',
  ...PRICES.map((r, i) => `  /* ${LOAD_OPTIONS[i].label.padEnd(12)} */ [${r.map(pad).join(',')}],`),
  '];',
  '// How each column bills. `stripe` goes straight to price_data.recurring;',
  '// null marks a one-time column (PaymentIntent, not a subscription).',
  'const BILLING_BY_COL = [',
  ...COLUMNS.map((c) => `  /* ${COLUMN_LABELS[c].padEnd(16)} */ ${J({ weeks: BILLING[c].weeks, stripe: BILLING[c].stripe })},`),
  '];',
  '// Column key by index: what goes in Stripe/db metadata as the plan name.',
  `const PLAN_KEYS = ${J(COLUMNS.map(planKey))};`,
  '// Load size by row index, for metadata and the confirmation email.',
  `const LOAD_LABELS = ${J(LOAD_OPTIONS.map((o) => o.label))};`,
].join('\n');


/* ── estimator ────────────────────────────────────────────────────────── */
const quotePrices = [
  '    const PRICES = [',
  ...PRICES.map((r, i) => `      /* ${LOAD_OPTIONS[i].label.padEnd(12)} */ [${r.map(pad).join(',')}],`),
  '    ];',
  `    const LOAD_LABELS  = ${J(LOAD_OPTIONS.map((o) => o.label))};`,
  `    const LOAD_NOTES   = ${J(LOAD_OPTIONS.map((o) => o.note))};`,
  `    const FREQ_LABELS  = ${J(COLUMNS.map((c) => COLUMN_LABELS[c]))};`,
  `    const FREQ_UNITS   = ${Jslash(COLUMNS.map((c) => BILLING[c].unit))};`,
  `    const FREQ_EVERY   = ${J(COLUMNS.map((c) => BILLING[c].every))};`,
  `    const ONE_TIME_COL = ${ONE_TIME_COL};`,
].join('\n');


const offers = [];
LOAD_OPTIONS.forEach((o, r) => COLUMNS.forEach((c, k) => offers.push({
  '@type': 'Offer',
  name: `${o.label}, ${COLUMN_LABELS[c].toLowerCase()}`,
  priceCurrency: 'USD',
  price: (PRICES[r][k] / 100).toFixed(2),
})));
const all = PRICES.flat();
const jsonld = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': 'https://www.example.com/book/quote.html#service',
  serviceType: 'Junk removal',
  url: 'https://www.example.com/book/quote.html',
  provider: { '@type': 'LocalBusiness', '@id': 'https://www.example.com/#business', name: 'Brand Name' },
  areaServed: AREA_SERVED.map((name) => ({ '@type': 'City', name })),
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: (Math.min(...all) / 100).toFixed(2),
    highPrice: (Math.max(...all) / 100).toFixed(2),
    offerCount: String(offers.length),
    offers,
  },
};
const quoteJsonld = `<script type="application/ld+json">\n${JSON.stringify(jsonld, null, 2)}\n</script>`;

/* ── checkout ─────────────────────────────────────────────────────────── */
const checkoutBilling = [
  `  const FREQ_LABELS  = ${J(COLUMNS.map((c) => COLUMN_LABELS[c]))};`,
  `  const FREQ_EVERY   = ${J(COLUMNS.map((c) => BILLING[c].every))};`,
  '  // Period length in weeks; null for a one-time column.',
  `  const FREQ_WEEKS   = ${J(BILLING_BY_COL.map((b) => (b.weeks ? +b.weeks.toFixed(6) : null)))};`,
  `  const ONE_TIME_COL = ${ONE_TIME_COL};`,
  '  // Recurrence per column, in Stripe\'s vocabulary (Apple Pay uses the same).',
  `  const FREQ_STRIPE  = ${J(BILLING_BY_COL.map((b) => b.stripe))};`,
  `  const LOAD_LABELS  = ${J(LOAD_OPTIONS.map((o) => o.label))};`,
  '  // A quarter is 13 weeks of service at 10% off, recurring plans only.',
  `  const WEEKS_PER_QUARTER   = ${WEEKS_PER_QUARTER};`,
  `  const QUARTERLY_DISCOUNT  = ${QUARTERLY_DISCOUNT};`,
  '  // true while the load prices are placeholders: shown red with an asterisk.',
  `  const PRICE_GUESS = ${GUESS.prices ? 'true' : 'false'};`,
].join('\n');

/* ── homepage ─────────────────────────────────────────────────────────── */
const recurringCol = COLUMNS.findIndex((c) => BILLING[c].stripe);
const homePrices = LOAD_OPTIONS.map((o, r) => [
  `      <a class="tier" href="book/quote.html?load=${r}&amp;freq=${ONE_TIME_COL}" style="--fill:${o.fits}%">`,
  `        <span class="tier-truck" aria-hidden="true"><span class="tier-load"></span></span>`,
  `        <span class="tier-name">${o.label}</span>`,
  `        <span class="tier-note">${o.note}</span>`,
  `        <span class="tier-price${GUESS.prices ? ' guess' : ''}">${fmt(PRICES[r][ONE_TIME_COL])}</span>`,
  ...(recurringCol >= 0 ? [`        <span class="tier-sub">${guessed(fmt(PRICES[r][recurringCol]), GUESS.prices)} ${COLUMN_LABELS[COLUMNS[recurringCol]].toLowerCase()}</span>`] : []),
  '      </a>',
].join('\n')).join('\n');

/* The load builder's data (js/load-builder.js), for the homepage and quote. */
const builderData = {
  prices: PRICES,
  loads: LOAD_OPTIONS.map((o) => ({ label: o.label, note: o.note, fits: o.fits })),
  items: ITEMS,
  freqLabels: COLUMNS.map((c) => COLUMN_LABELS[c]),
  freqUnits: COLUMNS.map((c) => BILLING[c].unit),
  oneTimeCol: ONE_TIME_COL,
  // Which numbers are placeholders: the builder prints them red with an asterisk.
  guess: { prices: GUESS.prices },
};
const builderBlock = (indent) => `${indent}window.LOAD_BUILDER = ${Jslash(builderData)};`;

/* The homepage's business card for search engines, with the whole service area. */
const homeJsonld = [
  '  <script type="application/ld+json">',
  JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': 'https://www.example.com/#business',
    name: 'Brand Name',
    url: 'https://www.example.com/',
    telephone: '+19254086053',
    areaServed: AREA_SERVED,
  }, null, 2).replace(/^/gm, '  '),
  '  </script>',
].join('\n');

/* The zone list in "Where we go": one card per zone, nearest places first.
   Bands and fees print red with an asterisk while GUESS.zones is on. */
const zoneMiles = (z, i) => (i === 0 ? `Up to ${z.upToMiles} road miles from ${BASE.label}` : `${ZONE_LIST[i - 1].upToMiles} to ${z.upToMiles} road miles`);
const zoneFee = (z) => (z.cents ? `+${fmt(z.cents)} per visit` : 'No travel charge');
const zonePlaces = (key) => {
  const p = PLACES_BY_ZONE[key];
  return p.length > 8 ? `${p.slice(0, 8).join(', ')} and ${p.length - 8} more` : p.join(', ');
};
const homeArea = [
  '    <ol class="zones" id="zoneList">',
  ...ZONE_LIST.map((z, i) => [
    `      <li data-zone="${z.key}">`,
    `        <span class="zone-top"><span class="zone-name">${z.label}</span><span class="zone-fee">${guessed(zoneFee(z), GUESS.zones)}</span></span>`,
    `        <span class="zone-miles">${guessed(zoneMiles(z, i), GUESS.zones)}</span>`,
    `        <span class="zone-places">${zonePlaces(z.key)}</span>`,
    '      </li>',
  ].join('\n')),
  '    </ol>',
].join('\n');

/* Under the price tiers: what travel adds, from the zone table. */
const first = ZONE_LIST[0], last = ZONE_LIST[ZONE_LIST.length - 1];
const homeTravelNote = `    <p class="tiers-travel">Travel is added by zone: ${guessed(first.cents ? `+${fmt(first.cents)}` : 'no charge', GUESS.zones)} within ${guessed(`${first.upToMiles} road miles`, GUESS.zones)} of ${BASE.label}, up to ${guessed(`+${fmt(last.cents)}`, GUESS.zones)} at ${guessed(`${last.upToMiles} miles`, GUESS.zones)}. <a href="#area">Find your zone</a></p>`;

/* The photo reader's item list (api/photo-quote.js): keys and labels only. */
const serverItems = [
  'const ITEMS = [',
  ...ITEMS.map((i) => `  ${J({ key: i.key, label: i.label })},`),
  '];',
].join('\n');

/* ── the travel module: api/_lib/travel.js and js/travel.js, byte identical ── */
/* One template, so the server and the pages run the same lookup. ES5 with no
   dependencies: Vercel requires it as CommonJS, pages get window.TRAVEL. */
const travelModule = [
  '/**',
  ' * GENERATED by `npm run build:pricing` from pricing.config.mjs (ZONES,',
  ' * ZONE_OVERRIDES) and data/zip-miles.mjs. Do not edit: change the config and',
  ' * rebuild. Written twice, byte for byte: api/_lib/travel.js for the server and',
  ' * js/travel.js for the pages (window.TRAVEL), so both price travel the same way.',
  ' *',
  " *   travelFor('97206') -> { zip, zone, label, cents, miles, place, state }",
  " *   travelFor('98601') -> null (outside every zone: we quote it by phone)",
  ' */',
  '(function (root) {',
  "  'use strict';",
  '  // Zones, nearest first. cents: the travel fee per visit, added to the load.',
  '  var ZONES = [',
  ...ZONE_LIST.map((z) => `    ${J(z)},`),
  '  ];',
  '  // true while the zone fees are placeholders: pages print them red with an asterisk.',
  `  var GUESS = ${GUESS.zones ? 'true' : 'false'};`,
  '  // ZIP: [zone key, road miles from the base, place, state], nearest first.',
  '  var ZIPS = {',
  ...ALL_ZIPS.map((z) => `    ${J(z)}: [${J(ZIP_ZONES[z].zone)}, ${ZIP_ZONES[z].miles}, ${J(ZIP_ZONES[z].place)}, ${J(ZIP_ZONES[z].state)}],`),
  '  };',
  '',
  '  function travelFor(zip) {',
  "    var z = String(zip == null ? '' : zip).trim();",
  '    if (!/^\\d{5}$/.test(z) || !Object.prototype.hasOwnProperty.call(ZIPS, z)) return null;',
  '    var r = ZIPS[z], zone = null;',
  '    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].key === r[0]) zone = ZONES[i];',
  '    return { zip: z, zone: zone.key, label: zone.label, cents: zone.cents, miles: r[1], place: r[2], state: r[3] };',
  '  }',
  '',
  '  var api = { ZONES: ZONES, GUESS: GUESS, travelFor: travelFor, zips: function () { return Object.keys(ZIPS); } };',
  "  if (typeof module === 'object' && module.exports) module.exports = api;",
  '  else root.TRAVEL = api;',
  '})(this);',
  '',
].join('\n');
const WHOLE = ['api/_lib/travel.js', 'js/travel.js'];

/* ── splice ───────────────────────────────────────────────────────────── */
function splice(src, name, body, comment, file) {
  const open  = comment ? `/* BUILD:${name} */`  : `<!-- BUILD:${name} -->`;
  const close = comment ? `/* /BUILD:${name} */` : `<!-- /BUILD:${name} -->`;
  const a = src.indexOf(open);
  const b = src.indexOf(close);
  if (a < 0 || b < 0) throw new Error(`marker BUILD:${name} not found in ${file}`);
  const indent = (src.slice(0, a).match(/[ \t]*$/) || [''])[0];
  return src.slice(0, a + open.length) + '\n' + body + '\n' + indent + src.slice(b);
}

const TARGETS = [
  { file: 'api/create-booking.js', blocks: [
    { name: 'server-prices', body: serverPrices, comment: true },
  ] },
  { file: 'api/photo-quote.js', blocks: [
    { name: 'server-items', body: serverItems, comment: true },
  ] },
  { file: 'book/quote.html', blocks: [
    { name: 'quote-jsonld', body: quoteJsonld, comment: false },
    { name: 'quote-prices', body: quotePrices, comment: true },
    { name: 'quote-builder', body: builderBlock('    '), comment: true },
  ] },
  { file: 'book/checkout.html', blocks: [
    { name: 'checkout-billing', body: checkoutBilling, comment: true },
  ] },
  { file: 'index.html', blocks: [
    { name: 'home-jsonld', body: homeJsonld, comment: false },
    { name: 'home-prices', body: homePrices, comment: false },
    { name: 'home-travel-note', body: homeTravelNote, comment: false },
    { name: 'home-area', body: homeArea, comment: false },
    { name: 'home-builder', body: builderBlock('  '), comment: true },
  ] },
];

const eol = (s) => s.replace(/\r\n/g, '\n');
const stale = [];
const written = [];
for (const t of TARGETS) {
  const abs = path.join(ROOT, t.file);
  const before = fs.readFileSync(abs, 'utf8');
  let out = before;
  for (const b of t.blocks) out = splice(out, b.name, b.body, b.comment, t.file);
  if (eol(out) === eol(before)) continue;
  if (check) { stale.push(t.file); continue; }
  fs.writeFileSync(abs, out, 'utf8');
  written.push(t.file);
}

for (const f of WHOLE) {
  const abs = path.join(ROOT, f);
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  // eol(): git on Windows checks files out with CRLF; that is not drift.
  if (eol(before) === eol(travelModule)) continue;
  if (check) { stale.push(f); continue; }
  fs.writeFileSync(abs, travelModule, 'utf8');
  written.push(f);
}

if (check) {
  if (stale.length) {
    console.error(`STALE: ${stale.join(', ')} ${stale.length > 1 ? 'do' : 'does'} not match pricing.config.mjs.\nRun: npm run build:pricing`);
    process.exit(1);
  }
  console.log(`check-pricing: in sync (${[...TARGETS.map((t) => t.file), ...WHOLE].join(', ')})`);
  process.exit(0);
}
console.log(written.length ? `build-pricing: wrote ${written.join(', ')}` : 'build-pricing: already up to date');
console.log(`  headline     from ${STARTING_AT}`);
console.log(`  matrix       ${PRICES.length} loads × ${COLUMNS.length} plans (cents)`);
console.log(`  service area ${ALL_ZIPS.length} ZIPs: ${ZONE_LIST.map((z) => `${z.label} ${PLACES_BY_ZONE[z.key].length} places`).join(', ')}`);
