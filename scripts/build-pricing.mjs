/**
 * npm run build:pricing   rewrite every BUILD: block from pricing.config.mjs
 * npm run check:pricing   fail if any block has drifted from it (runs in npm test)
 *
 * Same job as Scoops Co.'s scripts/build-pricing.mjs. Targets, each delimited
 * by BUILD: markers in its own file:
 *
 *   (api/create-booking.js reads api/_lib/order-config.js, written whole below)
 *   book/quote.html           quote-jsonld, order-sizes (the five size cards)
 *   index.html                     home-prices, home-builder
 *   api/photo-quote.js              server-items
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../api/_lib/site.js';
import {
  PRICES, COLUMNS, COLUMN_LABELS, BILLING, ONE_TIME_COL, LOAD_OPTIONS,
  ZIP_ZONES, ALL_ZIPS, ZONE_LIST, PLACES_BY_ZONE, GUESS, BASE, ITEMS, STARTING_AT, fmt, SCHEDULE, POLICY,
} from '../pricing.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const J = (v) => JSON.stringify(v);
/* Labels that start with a slash ("/visit") are escaped so Google does not read
   them as links inside a script and crawl /visit (a real 404 at Scoops Co.). */
const Jslash = (v) => J(v).replace(/\//g, '\\u002F');
const planKey = (c) => (c === 'oneTime' ? 'one_time' : c);
/* A value that is still a placeholder prints red with an asterisk (css/guess.css). */
const guessed = (html, on) => (on ? `<span class="guess">${html}</span>` : html);

/* Every place with a ZIP in a zone, once each, nearest first ("Vancouver, WA"). */
const AREA_SERVED = [...new Set(ALL_ZIPS.map((z) => `${ZIP_ZONES[z].place}, ${ZIP_ZONES[z].state}`))];

/* ── the order page: the five size cards (book/quote.html) ─────────────── */
/* One card per load size: photo, name, what fits, the one time price (red
   while GUESS.prices) and "+ travel" until the page knows the ZIP. The class
   names are shared with the homepage cards (round 6 ruling R1); js/size-cards.js
   makes them pickable and writes the travel line. */
const orderSizes = LOAD_OPTIONS.map((o, r) => [
  `<button type="button" class="size-card" data-size="${r}" aria-pressed="false">`,
  `  <img class="size-photo" src="${o.photo}" alt="" width="800" height="500" loading="lazy" decoding="async">`,
  '  <span class="size-body">',
  `    <span class="size-name">${o.label}</span>`,
  `    <span class="size-note">${o.note}</span>`,
  `    <span class="size-cost"><span class="size-price${GUESS.prices ? ' guess' : ''}">${fmt(PRICES[r][ONE_TIME_COL])}</span> <span class="size-travel">+ travel</span></span>`,
  '  </span>',
  '</button>',
].map((l) => `          ${l}`).join('\n')).join('\n');

/* The quote page's offers: the one time haul only (monthly pickups left the
   online flow in round 6; they go through the commercial form). */
const offers = LOAD_OPTIONS.map((o, r) => ({
  '@type': 'Offer',
  name: `${o.label}, ${COLUMN_LABELS[COLUMNS[ONE_TIME_COL]].toLowerCase()}`,
  priceCurrency: 'USD',
  price: (PRICES[r][ONE_TIME_COL] / 100).toFixed(2),
}));
const all = PRICES.map((r) => r[ONE_TIME_COL]);
const jsonld = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': `${site.SITE_URL}/book/quote.html#service`,
  serviceType: 'Junk removal',
  url: `${site.SITE_URL}/book/quote.html`,
  provider: { '@type': 'LocalBusiness', '@id': `${site.SITE_URL}/#business`, name: site.NAME },
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

/* The load builder's data (js/load-builder.js), for the homepage until round 6 Task 10. */
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
    '@id': `${site.SITE_URL}/#business`,
    name: site.NAME,
    url: `${site.SITE_URL}/`,
    telephone: site.PHONE_TEL,
    areaServed: AREA_SERVED,
  }, null, 2).replace(/^/gm, '  '),
  '  </script>',
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
  '    return { zip: z, zone: zone.key, label: zone.label, cents: zone.cents, miles: r[1], place: r[2], state: r[3], market: \'portland\' };',
  '  }',
  '',
  '  var api = { ZONES: ZONES, GUESS: GUESS, travelFor: travelFor, zips: function () { return Object.keys(ZIPS); } };',
  "  if (typeof module === 'object' && module.exports) module.exports = api;",
  '  else root.TRAVEL = api;',
  '})(this);',
  '',
].join('\n');
/* ── the order module: api/_lib/order-config.js and js/order-config.js ── */
/* Sizes, items, hours, policy and the Pacific date rules, in one file the
   server requires and the pages load (window.ORDER). Dates come from
   Intl.DateTimeFormat parts in SCHEDULE.timeZone, never the host's zone. */
const orderModule = [
  '/**',
  ' * GENERATED by `npm run build:pricing` from pricing.config.mjs (PRICES, LOADS,',
  ' * ITEMS, SCHEDULE, POLICY). Do not edit: change the config and rebuild.',
  ' * Written twice, byte for byte: api/_lib/order-config.js for the server and',
  ' * js/order-config.js for the pages (window.ORDER).',
  ' */',
  '(function (root) {',
  "  'use strict';",
  `  var SIZES = ${J(LOAD_OPTIONS.map((o, i) => ({ row: i, key: o.key, label: o.label, note: o.note, fits: o.fits, cents: PRICES[i][ONE_TIME_COL], photo: o.photo })))};`,
  `  var ITEMS = ${J(ITEMS.map((i) => ({ key: i.key, label: i.label, units: i.units })))};`,
  `  var SCHEDULE = ${J(SCHEDULE)};`,
  `  var POLICY = ${J({ cancelHours: POLICY.cancelHours, lateFeeCents: Math.round(POLICY.lateFee * 100), refusalFeeCents: Math.round(POLICY.refusalFee * 100), consentVersion: POLICY.consentVersion })};`,
  `  var GUESS = ${J({ prices: !!GUESS.prices, schedule: !!GUESS.schedule, policy: !!GUESS.policy })};`,
  '  var DAY = 86400000;',
  "  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];",
  "  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];",
  '',
  '  function sizeForUnits(units) {',
  '    for (var i = 0; i < SIZES.length; i++) if (units <= SIZES[i].fits) return SIZES[i].row;',
  '    return null;',
  '  }',
  '  function totalFor(row, travelCents) { return SIZES[row].cents + travelCents; }',
  '',
  '  // Wall clock parts of an instant in the schedule time zone.',
  '  function parts(ms) {',
  "    var f = new Intl.DateTimeFormat('en-US', { timeZone: SCHEDULE.timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });",
  '    var o = {}, p = f.formatToParts(new Date(ms));',
  "    for (var i = 0; i < p.length; i++) if (p[i].type !== 'literal') o[p[i].type] = parseInt(p[i].value, 10);",
  '    return o;',
  '  }',
  "  function pad(n) { return (n < 10 ? '0' : '') + n; }",
  '  function todayPacific(nowMs) {',
  '    var p = parts(nowMs);',
  "    return p.year + '-' + pad(p.month) + '-' + pad(p.day);",
  '  }',
  '  // Calendar math on dates as UTC midnights (a date has no zone).',
  "  function dateMs(date) { var a = date.split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]); }",
  '  function openDays(nowMs) {',
  '    var base = dateMs(todayPacific(nowMs)), out = [];',
  '    for (var i = 0; i < SCHEDULE.daysAhead; i++) {',
  '      var d = new Date(base + (SCHEDULE.leadDays + i) * DAY), wd = d.getUTCDay();',
  '      if (SCHEDULE.closedWeekdays.indexOf(wd) >= 0) continue;',
  "      out.push({ date: d.toISOString().slice(0, 10), label: WEEKDAYS[wd] + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate(), weekday: wd });",
  '    }',
  '    return out;',
  '  }',
  '  function windowFor(key) {',
  '    for (var i = 0; i < SCHEDULE.windows.length; i++) if (SCHEDULE.windows[i].key === key) return SCHEDULE.windows[i];',
  '    return null;',
  '  }',
  '  function isBookable(date, windowKey, nowMs) {',
  '    if (!windowFor(windowKey)) return false;',
  '    var days = openDays(nowMs);',
  '    for (var i = 0; i < days.length; i++) if (days[i].date === date) return true;',
  '    return false;',
  '  }',
  '  // The UTC instant whose Pacific wall time is the window start: try both offsets, keep the one that round trips.',
  '  function windowStartMs(date, windowKey) {',
  '    var w = windowFor(windowKey);',
  '    if (!w || !/^\\d{4}-\\d{2}-\\d{2}$/.test(String(date))) return null;',
  "    var hm = w.start.split(':'), wall = dateMs(date) + (+hm[0]) * 3600000 + (+hm[1]) * 60000;",
  '    var offsets = [7, 8];',
  '    for (var i = 0; i < offsets.length; i++) {',
  '      var ms = wall + offsets[i] * 3600000, p = parts(ms);',
  "      if (p.year + '-' + pad(p.month) + '-' + pad(p.day) === date && p.hour === +hm[0] && p.minute === +hm[1]) return ms;",
  '    }',
  '    return null;',
  '  }',
  '  function isLateCancel(date, windowKey, nowMs) {',
  '    var start = windowStartMs(date, windowKey);',
  '    return start !== null && nowMs >= start - POLICY.cancelHours * 3600000;',
  '  }',
  '',
  '  var api = { SIZES: SIZES, ITEMS: ITEMS, SCHEDULE: SCHEDULE, POLICY: POLICY, GUESS: GUESS,',
  '    sizeForUnits: sizeForUnits, totalFor: totalFor, todayPacific: todayPacific, openDays: openDays,',
  '    isBookable: isBookable, windowStartMs: windowStartMs, isLateCancel: isLateCancel };',
  "  if (typeof module === 'object' && module.exports) module.exports = api;",
  '  else root.ORDER = api;',
  '})(this);',
  '',
].join('\n');
const WHOLE = [
  { files: ['api/_lib/travel.js', 'js/travel.js'], text: travelModule },
  { files: ['api/_lib/order-config.js', 'js/order-config.js'], text: orderModule },
];

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
  { file: 'api/photo-quote.js', blocks: [
    { name: 'server-items', body: serverItems, comment: true },
  ] },
  { file: 'book/quote.html', blocks: [
    { name: 'quote-jsonld', body: quoteJsonld, comment: false },
    { name: 'order-sizes', body: orderSizes, comment: false },
  ] },
  { file: 'index.html', blocks: [
    { name: 'home-jsonld', body: homeJsonld, comment: false },
    { name: 'home-prices', body: homePrices, comment: false },
    { name: 'home-travel-note', body: homeTravelNote, comment: false },
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

for (const { files, text } of WHOLE) for (const f of files) {
  const abs = path.join(ROOT, f);
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  // eol(): git on Windows checks files out with CRLF; that is not drift.
  if (eol(before) === eol(text)) continue;
  if (check) { stale.push(f); continue; }
  fs.writeFileSync(abs, text, 'utf8');
  written.push(f);
}

if (check) {
  if (stale.length) {
    console.error(`STALE: ${stale.join(', ')} ${stale.length > 1 ? 'do' : 'does'} not match pricing.config.mjs.\nRun: npm run build:pricing`);
    process.exit(1);
  }
  console.log(`check-pricing: in sync (${[...TARGETS.map((t) => t.file), ...WHOLE.flatMap((w) => w.files)].join(', ')})`);
  process.exit(0);
}
console.log(written.length ? `build-pricing: wrote ${written.join(', ')}` : 'build-pricing: already up to date');
console.log(`  headline     from ${STARTING_AT}`);
console.log(`  matrix       ${PRICES.length} loads × ${COLUMNS.length} plans (cents)`);
console.log(`  service area ${ALL_ZIPS.length} ZIPs: ${ZONE_LIST.map((z) => `${z.label} ${PLACES_BY_ZONE[z.key].length} places`).join(', ')}`);
