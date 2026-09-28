/**
 * npm run build:pricing   rewrite every BUILD: block from pricing.config.mjs
 * npm run check:pricing   fail if any block has drifted from it (runs in npm test)
 *
 * Same job as Scoops Co.'s scripts/build-pricing.mjs. Targets, each delimited
 * by BUILD: markers in its own file:
 *
 *   api/create-booking.js     server-prices, server-zips   (authoritative)
 *   book/quote.html           quote-jsonld, quote-zips, quote-prices
 *   book/checkout.html  checkout-billing, checkout-zips
 *   index.html                     home-prices
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRICES, COLUMNS, COLUMN_LABELS, BILLING, BILLING_BY_COL, ONE_TIME_COL, LOAD_OPTIONS,
  SERVICE_AREA, ALL_ZIPS, WEEKS_PER_QUARTER, QUARTERLY_DISCOUNT, STARTING_AT, fmt,
} from '../pricing.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const J = (v) => JSON.stringify(v);
/* Labels that start with a slash ("/visit") are escaped so Google does not read
   them as links inside a script and crawl /visit (a real 404 at Scoops Co.). */
const Jslash = (v) => J(v).replace(/\//g, '\\u002F');
const zipList = (zips) => zips.map((z) => `'${z}'`).join(',');
const planKey = (c) => (c === 'oneTime' ? 'one_time' : c);
const pad = (n) => String(n).padStart(6);

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

const serverZips = `const VALID_ZIPS = new Set([${zipList(ALL_ZIPS)}]);`;

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

const quoteZips = `    const VALID_ZIPS = new Set([${zipList(ALL_ZIPS)}]);`;

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
  areaServed: SERVICE_AREA.map((a) => ({ '@type': 'City', name: a.city })),
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
].join('\n');

const zipCity = Object.fromEntries(SERVICE_AREA.flatMap((a) => a.zips.map((z) => [z, a.city])));
const checkoutZips = [
  `  const VALID_ZIPS = new Set([${zipList(ALL_ZIPS)}]);`,
  `  const ZIP_CITY   = ${J(zipCity).replace(/"/g, "'")};`,
].join('\n');

/* ── homepage ─────────────────────────────────────────────────────────── */
const homePrices = LOAD_OPTIONS.map((o, r) =>
  `      <div class="card"><h3>${o.label}</h3><p class="pc-price">${fmt(PRICES[r][ONE_TIME_COL])}</p></div>`,
).join('\n');

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
    { name: 'server-zips',   body: serverZips,   comment: true },
  ] },
  { file: 'book/quote.html', blocks: [
    { name: 'quote-jsonld', body: quoteJsonld, comment: false },
    { name: 'quote-zips',   body: quoteZips,   comment: true },
    { name: 'quote-prices', body: quotePrices, comment: true },
  ] },
  { file: 'book/checkout.html', blocks: [
    { name: 'checkout-billing', body: checkoutBilling, comment: true },
    { name: 'checkout-zips',    body: checkoutZips,    comment: true },
  ] },
  { file: 'index.html', blocks: [
    { name: 'home-prices', body: homePrices, comment: false },
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

if (check) {
  if (stale.length) {
    console.error(`STALE: ${stale.join(', ')} ${stale.length > 1 ? 'do' : 'does'} not match pricing.config.mjs.\nRun: npm run build:pricing`);
    process.exit(1);
  }
  console.log(`check-pricing: in sync (${TARGETS.map((t) => t.file).join(', ')})`);
  process.exit(0);
}
console.log(written.length ? `build-pricing: wrote ${written.join(', ')}` : 'build-pricing: already up to date');
console.log(`  headline     from ${STARTING_AT}`);
console.log(`  matrix       ${PRICES.length} loads × ${COLUMNS.length} plans (cents)`);
console.log(`  service area ${SERVICE_AREA.map((a) => a.city).join(', ')} · ${ALL_ZIPS.length} ZIPs`);
