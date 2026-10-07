# Round 1: Service Area and Travel Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the whole Portland metro (Clark County, WA included) and price
every job as load size plus a travel fee set by the customer's ZIP, in road
mile zones from a Gresham base, on every surface from the quote to the
dashboard.

**Architecture:** Real road miles per ZIP are measured once
(`scripts/measure-zips.mjs` → `data/zip-miles.mjs`). `pricing.config.mjs`
turns miles into zones (`ZONES`, `ZONE_OVERRIDES`, `BASE`) and
`npm run build:pricing` emits one travel module, byte identical, to
`api/_lib/travel.js` (server) and `js/travel.js` (browser). Pages and server
code call `travelFor(zip)`; per-page data stays in BUILD blocks. Guessed
values are flagged in `GUESS` and render red with an asterisk.

**Tech Stack:** Node 24 ESM scripts, CommonJS Vercel functions, plain browser
JS, Stripe, headless Chrome for page checks. Data: GeoNames US postal codes
(CC BY 4.0) and the OSRM public routing server, used once at measure time.

**Spec:** `docs/superpowers/specs/2026-10-07-scoops-import-design.md`
(Round 1). Evolution log: `docs/superpowers/evolution.md`.

## Global Constraints

- Copy: "we / us / our", plain, no slang, **no dashes as punctuation**.
- Mobile: text at least 16px, tap targets at least 48×48, no sideways scroll at 360px.
- Money is integer cents, printed with `toFixed(2)`.
- Never hardcode a column index; derive it (`ONE_TIME_COL`, `BILLING_BY_COL`).
- The server recomputes every booking and refuses a mismatch ("Quote is out of date").
- Booking gates stay closed (`BOOKINGS_OPEN_SERVER = false`).
- Fail soft on the database; fail open on capacity.
- No secrets committed. No `?token=` admin URLs.
- Guesses (founder, 2026-10-07): "just guess everything for now and put it in red text with asterisk to store for later".
- Branch, then merge to `main`.

## Review Focus

1. **ZIP+4 in the address** ("123 Oak St, Portland 97206-1234"): the ZIP
   is read as 97206 and the booking goes through. Test in Task 5.
2. **Travel fee changes between quote and payment**: the server refuses the
   old total with "Quote is out of date". Test in Task 5.
3. **Price before a ZIP is known**: the truck shows the load price with
   "+ travel", never a total that leaves travel out. Score check in Task 1,
   built in Task 6.
4. **A ZIP past the last zone**: refused by the server, and the quote page
   offers a call back and keeps the lead. Tests in Tasks 5 and 7.
5. **An override naming a zone that doesn't exist**: `build:pricing` fails
   loudly instead of shipping a ZIP with no fee. Test in Task 3.

---

### Task 1: The scorecard (fitness function first)

**Files:**
- Create: `scripts/score.mjs`
- Modify: `package.json` (add `"score": "node scripts/score.mjs"`)

**Interfaces:**
- Produces: `node scripts/score.mjs --round 1` prints each check with points
  and exits 0 only at 100. `--json` prints `{ round, score, checks: [...] }`.
- The probe: a local static server on a free port that serves the repo, and,
  for `?__probe=1`, injects a script before `</body>` that waits 1.5s and
  writes `JSON.stringify({ sw: scrollWidth, vw: innerWidth, small: [...] })`
  to `document.documentElement.dataset.probe`. `/__seed.html?key=..&val=..&to=..`
  writes sessionStorage keys and `location.replace`s to `to`.
- Headless Chrome: `chrome --headless=new --disable-gpu --window-size=360,900
  --virtual-time-budget=8000 --dump-dom URL`.

- [ ] **Step 1: Write `scripts/score.mjs`** with the checks below (points sum
  to 100). Each check returns `true` or a string saying what failed.

| id | pts | check |
| --- | --- | --- |
| tests | 12 | `npm test` exits 0 |
| data | 5 | `data/zip-miles.mjs`: at least 100 ZIPs, OR and WA both present, every entry has numeric `miles`, base equals config `BASE` |
| module | 10 | `api/_lib/travel.js` and `js/travel.js` exist, are byte identical, and `travelFor` agrees with the config for every ZIP and returns `null` for `90210`, `''`, `9720`, `null` |
| server | 10 | `node scripts/test-booking.mjs` passes and prints `== travel ==` |
| quote-zone | 10 | headless quote page `?load=2&freq=0&edit=contact&zip=<a zone 2 ZIP>` shows the zone label and `+$` in `#h-zip`, and `#pick-sum` shows load plus travel |
| quote-far | 5 | same with a ZIP past the last zone: the page says to call and the waitlist shows |
| home | 8 | headless homepage: builder price unit reads `+ travel` with no ZIP; `#zoneList` has one row per zone |
| checkout | 10 | headless checkout seeded with `quoteContact`: summary rows include `Travel` and the headline equals load plus travel |
| thanks | 5 | headless thanks seeded with `bookingSummary` containing `travel`: a `Travel` row shows |
| ops | 5 | webhook `buildDiscordEmbed` has a `Travel` field and `bookingConfirmation` html contains `Travel` |
| dashboard | 5 | `db/schema.sql` has `travel_zone`, `travel_cents`; `api/_lib/db.js` writes them; `jkr/index.html` shows `travel_zone` |
| guesses | 5 | `css/guess.css` sets a red color and `content: "*"`; home, quote, checkout, thanks link it; homepage tier prices carry `class="guess"` while `GUESS.prices`; `npm run guesses -- --check` exits 0 |
| mobile | 5 | probe at 360px: `sw <= vw` and no visible text under 16px inside the new travel elements, on home, quote and checkout |
| photo | 3 | `api/photo-quote.js` prompt says `Portland metro` and not `Gresham, Oregon` |
| docs | 2 | `CLAUDE.md` has a `## Travel pricing` section |

- [ ] **Step 2: Run it on `main` to record generation 0**

Run: `node scripts/score.mjs --round 1`
Expected: a low score (most checks fail); `tests` and some others pass. Record
it in `docs/superpowers/evolution.md` under "Build generations".

- [ ] **Step 3: Commit**

```bash
git add scripts/score.mjs package.json docs/superpowers/evolution.md
git commit -m "Score: round 1 scorecard, generation 0"
```

---

### Task 2: Measure every metro ZIP

**Files:**
- Create: `scripts/measure-zips.mjs`, `data/zip-miles.mjs`
- Modify: `pricing.config.mjs` (add `BASE` only)

**Interfaces:**
- Produces: `data/zip-miles.mjs` default export
  `{ base: { label, lat, lon }, source, measuredAt, zips: { [zip]: { place, state, county, miles } } }`,
  ZIPs sorted by miles, miles rounded to one decimal.
- Consumes: `BASE` from `pricing.config.mjs`.

- [ ] **Step 1: Add `BASE` to `pricing.config.mjs`**

```js
/**
 * Where every travel distance is measured from. GUESS*: Gresham city center,
 * not the real yard. Moving it means re-running `node scripts/measure-zips.mjs`.
 */
export const BASE = { label: 'Gresham', lat: 45.4982, lon: -122.4316 };
```

- [ ] **Step 2: Write `scripts/measure-zips.mjs`**: downloads
  `https://download.geonames.org/export/zip/US.zip`, reads `US.txt` out of the
  zip with `zlib.inflateRawSync` (one local file header walk, no dependency),
  keeps OR and WA rows within 50 straight line miles of `BASE` (haversine),
  asks OSRM `table/v1/driving/{base};{batch}?sources=0&annotations=distance`
  in batches of 80, converts meters to miles, keeps ZIPs at or under 45 road
  miles (a margin past the last zone, so widening a zone needs no re-run), and
  writes `data/zip-miles.mjs` with a header naming the sources and the date.
  A ZIP OSRM cannot route gets straight line miles × 1.3 and `est: true`.

- [ ] **Step 3: Run it**

Run: `node scripts/measure-zips.mjs`
Expected: `measure-zips: wrote N ZIPs (OR a, WA b)`, N above 100.

- [ ] **Step 4: Commit**

```bash
git add scripts/measure-zips.mjs data/zip-miles.mjs pricing.config.mjs
git commit -m "Measure road miles from Gresham to every metro ZIP"
```

---

### Task 3: Zones in the config, and the travel module

**Files:**
- Modify: `pricing.config.mjs`, `scripts/build-pricing.mjs`, `package.json`
- Create: `scripts/test-zones.mjs`, generated `api/_lib/travel.js`, `js/travel.js`

**Interfaces:**
- Produces (config): `ZONES` (`{ key, label, upToMiles, fee }`),
  `ZONE_OVERRIDES` (`{ [zip]: zoneKey }`), `GUESS` (`{ prices, zones, base }`),
  `zoneForMiles(miles) → zoneKey | null`, `buildZipZones(miles, overrides) →
  { [zip]: { zone, label, cents, miles, place, state } }` (throws on an
  unknown override key), `ZIP_ZONES`, `ALL_ZIPS`, `ZONE_LIST` (`{ key,
  label, upToMiles, cents }`), `travelFor(zip) → { zip, zone, label, cents,
  miles, place, state } | null`, `PLACES_BY_ZONE` (`{ [zoneKey]: [place, ...] }`).
  `SERVICE_AREA` is removed.
- Produces (module): `api/_lib/travel.js` and `js/travel.js`, identical UMD
  files exposing `{ ZONES, GUESS, travelFor, zips }` (Node: `module.exports`;
  browser: `window.TRAVEL`).

- [ ] **Step 1: Write the failing test `scripts/test-zones.mjs`**

```js
// Zones: every ZIP has one zone and a fee, the band edges, overrides, and the
// two emitted travel modules agree with the config for every ZIP.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ZONES, ZIP_ZONES, ALL_ZIPS, zoneForMiles, buildZipZones, travelFor,
} from '../pricing.config.mjs';
import MILES from '../data/zip-miles.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

console.log('== zones ==');
const last = ZONES[ZONES.length - 1];
ok(zoneForMiles(0) === ZONES[0].key, '0 miles is not the first zone');
ok(zoneForMiles(ZONES[0].upToMiles) === ZONES[0].key, 'a band edge belongs to the inner zone');
ok(zoneForMiles(ZONES[0].upToMiles + 0.1) === ZONES[1].key, 'just past the first edge is not zone 2');
ok(zoneForMiles(last.upToMiles) === last.key, 'the outer edge is not in the last zone');
ok(zoneForMiles(last.upToMiles + 0.1) === null, 'past the last zone is still in the area');
ok(ALL_ZIPS.length >= 100, `only ${ALL_ZIPS.length} ZIPs in the area`);
ok(ALL_ZIPS.some((z) => ZIP_ZONES[z].state === 'WA'), 'no Washington ZIPs');
for (const z of ALL_ZIPS) {
  const r = ZIP_ZONES[z];
  ok(ZONES.some((x) => x.key === r.zone), `${z} has unknown zone ${r.zone}`);
  ok(Number.isInteger(r.cents) && r.cents >= 0, `${z} fee is not whole cents`);
}

console.log('== overrides ==');
const one = Object.keys(MILES.zips)[0];
const pinned = buildZipZones(MILES.zips, { [one]: last.key });
ok(pinned[one].zone === last.key, 'an override did not win over the miles');
let threw = false;
try { buildZipZones(MILES.zips, { [one]: 'nope' }); } catch { threw = true; }
ok(threw, 'an override naming an unknown zone did not fail the build');

console.log('== travel modules ==');
const a = fs.readFileSync(path.join(ROOT, 'api/_lib/travel.js'), 'utf8');
const b = fs.readFileSync(path.join(ROOT, 'js/travel.js'), 'utf8');
ok(a === b, 'api/_lib/travel.js and js/travel.js differ');
const T = require(path.join(ROOT, 'api/_lib/travel.js'));
for (const z of ALL_ZIPS) ok(JSON.stringify(T.travelFor(z)) === JSON.stringify(travelFor(z)), `module disagrees on ${z}`);
for (const z of ['90210', '', '9720', null, undefined, '972066']) ok(T.travelFor(z) === null, `module accepted ${z}`);
ok(T.travelFor(` ${ALL_ZIPS[0]} `) !== null, 'module refused a padded ZIP');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node scripts/test-zones.mjs`
Expected: FAIL, `ZONES` is not exported.

- [ ] **Step 3: Add zones to `pricing.config.mjs`**, replacing `SERVICE_AREA`

```js
import ZIP_MILES from './data/zip-miles.mjs';

/** Which placeholder values are guesses. Guessed values render red with an
 *  asterisk (css/guess.css) and `npm run guesses` lists them. Set a flag to
 *  false once the real numbers are in. */
export const GUESS = {
  prices: true,   // PRICE_TABLE: placeholder prices
  zones:  true,   // ZONES: bands and fees
  base:   true,   // BASE: Gresham city center, not the real yard
};

/** Travel zones: rings of ROAD miles from BASE, smallest first. A ZIP's zone
 *  is the first ring whose upToMiles holds its miles (an edge belongs to the
 *  inner ring). Past the last ring is "call us". fee is dollars per visit. */
export const ZONES = [
  { key: 'home', label: 'Home zone', upToMiles: 10, fee:  0 },
  { key: 'z2',   label: 'Zone 2',    upToMiles: 20, fee: 25 },
  { key: 'z3',   label: 'Zone 3',    upToMiles: 30, fee: 50 },
  { key: 'z4',   label: 'Zone 4',    upToMiles: 40, fee: 75 },
];

/** Pin a ZIP to a zone by hand, whatever its miles: { '97229': 'z3' }. */
export const ZONE_OVERRIDES = {};

export function zoneForMiles(miles) {
  const z = ZONES.find((x) => miles <= x.upToMiles);
  return z ? z.key : null;
}

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
```

plus, after the sanity check: `ZIP_ZONES = buildZipZones(ZIP_MILES.zips, ZONE_OVERRIDES)`,
`ALL_ZIPS = Object.keys(ZIP_ZONES)`, `ZONE_LIST`, `PLACES_BY_ZONE` (unique
places per zone, nearest first), and `travelFor`:

```js
export function travelFor(zip) {
  const z = String(zip == null ? '' : zip).trim();
  const r = /^\d{5}$/.test(z) ? ZIP_ZONES[z] : null;
  return r ? { zip: z, zone: r.zone, label: r.label, cents: r.cents, miles: r.miles, place: r.place, state: r.state } : null;
}
```

`assertSane` gains: zones ascending in `upToMiles` and `fee`, fees whole
cents, keys unique.

- [ ] **Step 4: Emit the module from `scripts/build-pricing.mjs`**: a
  `travelModule()` string (header "GENERATED by npm run build:pricing", the
  `ZONES` with cents, the ZIP table as `{"97030":["home",3.1,"Gresham","OR"]}`,
  `GUESS = GUESS.zones`, the same `travelFor` logic in ES5, a UMD footer).
  Written whole to both paths; `--check` compares both. Replace every use of
  `SERVICE_AREA` (JSON-LD `areaServed` becomes the unique places plus the two
  states; the builder's `zips` map and checkout's `ZIP_CITY` go away, pages
  use `TRAVEL`). Delete the `server-zips`, `quote-zips`, `checkout-zips`
  blocks and their markers.

- [ ] **Step 5: Wire the test**: add `node scripts/test-zones.mjs` to `npm test`.

- [ ] **Step 6: Run** `npm run build:pricing && node scripts/test-zones.mjs`
  Expected: PASS.

- [ ] **Step 7: Commit** `git commit -m "Travel zones in the config, one generated travel module"`

---

### Task 4: Guess marking

**Files:**
- Create: `css/guess.css`, `scripts/list-guesses.mjs`, `GUESSES.md` (generated)
- Modify: `index.html`, `book/quote.html`, `book/checkout.html`,
  `book/thanks.html` (link `guess.css`), `scripts/build-pricing.mjs`
  (homepage tier prices wrapped when `GUESS.prices`; `LOAD_BUILDER.guess`),
  `js/preview-nav.js` (a "Red* = guess" note, localhost only), `package.json`.

**Interfaces:**
- Produces: `.guess` class (red, `::after { content: "*" }`, dark variant
  for `.is-dark`, `.lb-readout`, `.h-hero` backgrounds). `npm run guesses`
  writes `GUESSES.md` (every `GUESS` flag that is true and what it covers,
  every `class="guess"` file, every `GUESS*` comment); `--check` fails if
  `GUESSES.md` is stale.

```css
/* Placeholder guesses (founder, 2026-10-07): red with an asterisk until the
   real value is in. `npm run guesses` lists them. */
.guess { color: #C62828; }
.guess::after { content: "*"; font-weight: 700; margin-left: 1px; }
.band.is-dark .guess, .is-dark .guess, .h-hero .guess, .lb-readout .guess { color: #FF8A80; }
```

- [ ] Steps: write the CSS, link it, wrap generated prices, write the list
  script, run `npm run guesses`, add `--check` to `npm test`, commit
  `"Guesses show red with an asterisk; npm run guesses lists them"`.

---

### Task 5: The server charges load plus travel

**Files:**
- Modify: `api/create-booking.js`, `scripts/test-booking.mjs`

**Interfaces:**
- Consumes: `require('./_lib/travel').travelFor(zip)`.
- Produces: Stripe metadata (PaymentIntent, customer, subscription) gains
  `zip`, `zone`, `zone_label`, `travel_cents`, `miles`, `load_cents`; the
  charged amount is `(PRICES[row][fi] + travel.cents)` with any coupon
  applied to the whole.

- [ ] **Step 1: Add the failing tests** (a `== travel ==` section in
  `scripts/test-booking.mjs`):

```js
console.log('== travel ==');
const z2 = ALL_ZIPS.find((z) => ZIP_ZONES[z].cents > 0);
const t2 = ZIP_ZONES[z2].cents;
const far = good({ zip: z2, quotedCents: PRICES[2][ONE_TIME_COL] + t2,
  metadata: { address: `9 Elm St, Portland ${z2}-1234`, pickup_weekday: 'Tuesday' } });
const tr = await call(far);
const trPi = calls.find((c) => c[0] === 'pi');
ok(tr.status === 200, `zone 2 booking refused: ${JSON.stringify(tr.json)}`);
ok(trPi && trPi[1].amount === PRICES[2][ONE_TIME_COL] + t2, 'travel not added to the charge');
ok(trPi && trPi[1].metadata.zone === ZIP_ZONES[z2].zone && trPi[1].metadata.travel_cents === String(t2), 'travel metadata missing');
const loadOnly = await call({ ...far, quotedCents: PRICES[2][ONE_TIME_COL] });
ok(loadOnly.status === 400 && /out of date/.test(loadOnly.json.error), 'a total without travel was accepted');
ok((await call(good({ zip: '98601', metadata: { address: '1 Main St 98601' } }))).status === 400, 'a ZIP past the last zone was accepted');
const subT = await call({ ...far, freqIdx: RECUR, quotedCents: PRICES[2][RECUR] + t2 });
const subC = calls.find((c) => c[0] === 'sub');
ok(subT.status === 200 && subC[1].items[0].price_data.unit_amount === PRICES[2][RECUR] + t2, 'subscription left travel out');
```

(`98601` is Amboy, WA, about 50 miles out; the test asserts first that it is
not in `ZIP_ZONES`.) Existing tests that use `ALL_ZIPS[0]` (the home zone,
fee 0) keep passing unchanged.

- [ ] **Step 2: Run** `node scripts/test-booking.mjs`: FAIL on the travel section.
- [ ] **Step 3: Implement**: `const travel = require('./_lib/travel');`,
  replace the `VALID_ZIPS` gate with `const t = travel.travelFor(zip); if (!t) …`,
  `const loadCents = PRICES[row][fi]; const baseCents = loadCents + t.cents;`,
  add the six metadata fields to `serverMeta`, PaymentIntent description
  names the zone.
- [ ] **Step 4: Run** `npm test`: PASS.
- [ ] **Step 5: Commit** `"Server charges load plus travel and refuses a stale travel fee"`

---

### Task 6: The truck shows "+ travel" until it knows the ZIP

**Files:**
- Modify: `js/load-builder.js`, `css/load-builder.css`, `js/home.js`, `index.html`

**Interfaces:**
- Produces: `LoadBuilder.mount(el, { ..., travel })` where `travel` is a
  `travelFor` result or null; returned API gains `setTravel(t)`. With no
  travel the unit reads ` + travel`; with travel the price is the total and a
  `.lb-travel` line reads `Includes $25.00 travel, Zone 2` (or `No travel
  charge in the home zone`). Price gets `.guess` when `D.guess.prices`; the
  travel line when `TRAVEL.GUESS`.
- `sessionStorage.quoteZip`: the last ZIP the visitor typed anywhere (home
  ZIP check, quote step 2); the builder reads it on mount.
- Homepage area section becomes a generated `BUILD:home-area` block:
  `<ol id="zoneList">` with one `<li data-zone>` per zone (label, mile band,
  fee, nearest places). The ZIP check answers `Yes, we come to {place}.
  {label}: travel +$X.` and lights up the zone row; it saves `quoteZip` and
  calls the hero builder's `setTravel`.

- [ ] Steps: implement, `npm run build:pricing`, run the score (`home`,
  `mobile` checks), commit `"Truck shows + travel until the ZIP is known; homepage zones"`.

---

### Task 7: The quote page prices travel

**Files:**
- Modify: `book/quote.html`

**Interfaces:**
- Consumes: `window.TRAVEL` (`<script src="../js/travel.js">` before the page script).
- ZIP check: `TRAVEL.travelFor(v)` → hint `✓ {place}, {label}: travel +$X`
  (`No travel charge` for 0); null → error `That's farther than we price
  online. Call or text us and we'll quote it.` and the waitlist block, reworded
  as a call back request, saves a lead (`notes: FAR ZIP CALLBACK`).
- `#pick-sum`: `{load}, {total}{unit}` with `incl. $X travel` once the ZIP is
  known; `cents` sent to checkout = load + travel; the lead's `quoted_price`
  and `notes` include the zone.

- [ ] Steps: implement, run the score (`quote-zone`, `quote-far`), commit
  `"Quote page prices travel by ZIP; far ZIPs get a call back"`.

---

### Task 8: Checkout and thanks show the travel line

**Files:**
- Modify: `book/checkout.html`, `book/thanks.html`, `js/preview-nav.js`

**Interfaces:**
- Checkout: `<script src="../js/travel.js">`; `const trip =
  TRAVEL.travelFor(formData.zip)`; summary rows `Load` (`quotedCents -
  trip.cents`) and `Travel, {label}` (`trip.cents`); a missing `trip` sends the
  visitor back to the quote's contact step; `bookingSummary.travel =
  "{label}: $X"`. Preview bar's sample checkout uses `PRICES + travelFor(zip).cents`.
- Thanks: `if (s.travel) rows.push({ l: 'Travel', v: s.travel })`.

- [ ] Steps: implement, run the score (`checkout`, `thanks`), commit
  `"Checkout and thanks show the travel line"`.

---

### Task 9: Emails, Discord, database and dashboard carry travel

**Files:**
- Modify: `api/stripe-webhook.js` (export `buildDiscordEmbed`; `Travel` field;
  pass travel to the email and the database), `api/_lib/email-templates.js`
  (`detail('Travel', travel)` in `bookingConfirmation`, html and text),
  `api/_lib/db.js` (`travelZone`, `travelCents`, `travelMiles` →
  `travel_zone`, `travel_cents`, `travel_miles`), `db/schema.sql` (columns),
  `jkr/index.html` (zone in the bookings table and detail)
- Create: `db/migrations/2026-10-07-travel.sql`, `scripts/test-ops.mjs`

- [ ] **Step 1: Failing test `scripts/test-ops.mjs`**

```js
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.STRIPE_SECRET_KEY ||= 'sk_test_x';
const { buildDiscordEmbed } = require('../api/stripe-webhook.js');
const tpl = require('../api/_lib/email-templates.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('  FAIL: ' + m); } };
const m = { plan: 'one_time', load: '1/2 truck', zone_label: 'Zone 2', travel_cents: '2500', miles: '16.8' };
const e = buildDiscordEmbed({ metadata: m }, { kind: 'signup_or_payment', amount: 37400 });
const f = e.embeds[0].fields.find((x) => x.name === 'Travel');
ok(f && /Zone 2/.test(f.value) && /\$25\.00/.test(f.value) && /16\.8 mi/.test(f.value), 'Discord ping has no travel line');
const mail = tpl.bookingConfirmation({ name: 'Jane', load: '1/2 truck', travel: 'Zone 2: $25.00', amount: '$374.00' });
ok(/Travel/.test(mail.html) && /Zone 2: \$25\.00/.test(mail.text), 'confirmation email has no travel line');
console.log(fail ? `${fail} failed` : 'ops: travel in Discord and email');
process.exit(fail ? 1 : 0);
```

- [ ] Steps: run (FAIL), implement, add to `npm test`, run (PASS), commit
  `"Travel in the Discord ping, confirmation email, database and dashboard"`.

---

### Task 10: Photo prompt, docs, and the round's finish

**Files:**
- Modify: `api/photo-quote.js` (prompt: "a junk removal company based in
  Gresham that serves the Portland metro"), `CLAUDE.md` (`## Travel pricing`
  section; service area and folder map updated; progress line), spec status,
  `docs/superpowers/evolution.md` (every generation's score)

- [ ] Steps: implement, `npm test`, `node scripts/score.mjs --round 1` until
  **100**, logging each generation; look at home, quote and checkout in
  headless Chrome screenshots at 360px and desktop; merge to `main`.
