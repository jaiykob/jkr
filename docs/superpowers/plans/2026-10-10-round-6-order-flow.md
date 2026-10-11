# Round 6: The Order Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the truck load builder and the three page checkout with a
one page order flow (five size cards, ZIP, day and 2 hour window, contact,
card saved), booked in about 10 taps on a phone or a desktop, with the card
charged once after the job for the size the crew finds.

**Architecture:** The child of Plan A (rebuild in place) and Plan B (new
order module), scored in `docs/superpowers/evolution.md`. One generated order
module, written twice byte identical like `travel.js`
(`api/_lib/order-config.js` for the server, `js/order-config.js` for pages as
`window.ORDER`), holds sizes, windows, open days, the late cancel rule and
the consent version. The server is rebuilt in place: `api/create-booking.js`
makes a Stripe SetupIntent, `api/day-capacity.js` answers dates and windows,
`api/visit-update.js` gains the after job actions, `api/stripe-webhook.js`
branches on each event object's own `metadata.kind`. `book/quote.html` hosts
the page, with its logic in `js/order.js`, `js/size-cards.js` and
`css/order.css`. Function count stays at 10.

**Tech Stack:** static HTML, plain browser JS (no bundler), Vercel serverless
functions in CommonJS, Stripe (SetupIntent, Payment Element, Express Checkout
Element, off session PaymentIntents, hosted invoices), Supabase, headless
Chrome for the scorecard (`scripts/lib/browser.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-10-order-flow-design.md`

## Global Constraints

- Copy: "we / us / our", plain, no slang, **no dashes as punctuation**. The
  founder writes the final copy; ours is a starting point.
- Mobile: text at least 16px, tap targets at least 48×48, no sideways scroll
  at 360px. Desktop checked at 1280px.
- Money is integer cents, printed with `toFixed(2)`. Never hardcode a column
  index (`ONE_TIME_COL`).
- Every guessed value prints red with an asterisk (`class="guess"`) and is
  listed by `npm run guesses`; whole tables flagged in `GUESS`.
- Generated files are never hand edited: edit `pricing.config.mjs` or
  `index.html` and run `npm run build`. `npm test` runs every `--check`.
- Admin auth is the `x-admin-token` header only; `?token=` is refused.
- Fail soft on the database (an error never loses a booking); fail open on
  capacity.
- The three booking gates stay CLOSED. With them closed, Book saves a
  reservation lead and makes no Stripe call.
- The quote page stays English; Spanish pages address the reader with "tú".
- Pacific time (`America/Los_Angeles`) for every date and window; Vercel runs
  in UTC.
- Each task leaves `npm test` green and `npm run score -- --round N` at 100
  for N = 1 to 5. An older check the task breaks is generalised to the new
  page in the same task, never loosened.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Finish and charge tapped twice, or retried with another size after a
   decline:** one charge only (idempotency key per visit and size, and a paid
   visit refuses a second charge). Test in Task 6.
2. **A final charge read as a new booking:** the webhook merges customer
   metadata into its context, so it must branch on the event object's own
   `metadata.kind`; a `final_charge` creates no visit and no "New booking"
   ping. Test in Tasks 5 and 6.
3. **Pacific dates:** from 5 pm to midnight in Portland it is already
   tomorrow in UTC; DST ends Sunday 2026-11-01; the late fee clock runs from
   the window's start. One function covers it, tested at fixed instants.
   Test in Task 2.
4. **Prices change between booking and the job:** the booked size is charged
   the cents quoted at booking; a different size is today's price; travel is
   always the travel stored at booking. Test in Task 6.
5. **Consent for later charges:** the server refuses a booking without
   `consent.agreed === true` and the current `consentVersion`, and stamps the
   time itself, on the card path and the wallet path alike. Tests in Tasks 4
   and 9.

---

## File map

| File | Job | Task |
| --- | --- | --- |
| `scripts/score.mjs` | `ROUNDS[6]`, 1280px pages, real APIs on the score server | 1 |
| `scripts/lib/fake-stripe.mjs` (new) | one fake Stripe for tests and the score server | 1 |
| `scripts/lib/browser.mjs` | `click`, `type`, `focus`, a tap counter, script intercept | 1 |
| `pricing.config.mjs` | `SCHEDULE`, `POLICY`, card photos, `GUESS.schedule`, `GUESS.policy` | 2 |
| `scripts/build-pricing.mjs` | writes the order module twice; `market` in the travel module | 2 |
| `api/_lib/order-config.js`, `js/order-config.js` (generated) | the order module | 2 |
| `scripts/test-order-config.mjs` (new) | the module against the config | 2 |
| `db/schema.sql`, `db/migrations/2026-10-10-order-flow.sql` | visit columns | 3 |
| `api/_lib/db.js` | `slotCounts`, `createBookedVisit`, `getVisit` | 3 |
| `api/day-capacity.js` | dates and windows, per market | 3 |
| `api/create-booking.js` | SetupIntent, refusals | 4 |
| `api/_lib/founding.js` | counts founding customers, not PaymentIntents | 4 |
| `api/stripe-webhook.js` | `setup_intent.succeeded`, final charge branches | 5, 6 |
| `api/_lib/email-templates.js` | confirmation with window and rule; receipt; payment needed; late fee | 5, 6 |
| `api/visit-update.js` | `finish`, `declined`, `late-fee`, `en-route` | 6 |
| `scripts/test-charge.mjs` (new) | the after job charge | 6 |
| `jkr/index.html` | job card and actions | 7 |
| `book/quote.html`, `js/order.js`, `js/size-cards.js`, `css/order.css` | the order page | 8, 9 |
| `book/thanks.html`, `book/checkout.html`, `vercel.json` | confirmation, redirect | 9 |
| `index.html`, `js/home.js`, `css/home.css`, `i18n/es.json`, `api/_lib/site.js` | homepage cards, contact buttons | 10 |
| `js/load-builder.js` and its CSS | deleted | 10 |
| `content/towns/*.md`, `content/blog/*/*.md`, `terms.html`, `faq.html`, `es/faq.html` | wording that says "tap items", the policy | 10 |
| `CLAUDE.md`, `LAUNCH-DAY.md`, `docs/superpowers/evolution.md` | docs | 11 |

## Shared interfaces (every task uses these names)

**Config added to `pricing.config.mjs`** (all values guesses):

```js
/** GUESS* every value: the founder sets real hours and caps before launch. */
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
/** GUESS* the cancel window and fees. */
export const POLICY = {
  cancelHours: 24,          // free to cancel or move until this many hours before the window starts
  lateFee: 50,              // dollars, charged by the dashboard's Late cancel fee action
  refusalFee: 0,            // dollars, when the customer says no on site
  consentVersion: '2026-10-10',
};
```

`LOADS` rows gain `photo: '/images/placeholder.svg'` (a guess until real
photos). `GUESS` gains `schedule: true, policy: true`.

**The order module** (`window.ORDER` in pages, `module.exports` in node; the
same file text twice, like `travel.js`):

```js
ORDER.SIZES            // [{ row, key, label, note, fits, cents, photo }], one time column only
ORDER.ITEMS            // [{ key, label, units }]
ORDER.SCHEDULE         // as in the config
ORDER.POLICY           // { cancelHours, lateFeeCents, refusalFeeCents, consentVersion }
ORDER.GUESS            // { prices, schedule, policy }
ORDER.sizeForUnits(units)              // -> smallest row whose fits >= units, or null over 100
ORDER.totalFor(row, travelCents)       // -> SIZES[row].cents + travelCents
ORDER.todayPacific(nowMs)              // -> 'YYYY-MM-DD'
ORDER.openDays(nowMs)                  // -> [{ date: 'YYYY-MM-DD', label: 'Tue Oct 14', weekday: 2 }]
ORDER.isBookable(date, windowKey, nowMs)   // -> date in openDays(nowMs) and the window exists
ORDER.windowStartMs(date, windowKey)   // -> epoch ms of the window start in Pacific time (DST aware)
ORDER.isLateCancel(date, windowKey, nowMs) // -> nowMs >= windowStartMs - cancelHours * 3600000
```

**Travel module:** `travelFor(zip)` gains `market: 'portland'` (round 8 adds
`sacramento`).

**Visit columns** (Task 3): `window_key text`, `market text`,
`quoted_load_idx int`, `quoted_load_cents int`, `quoted_cents int`,
`travel_cents int`, `final_load_idx int`, `final_cents int`,
`payment_status text` (`card_saved` | `paid` | `payment_needed` |
`no_charge` | `late_fee_paid`), `stripe_setup_intent_id text unique`,
`stripe_payment_method_id text`, `stripe_payment_intent_id text`,
`invoice_url text`, `consent_at timestamptz`, `consent_version text`,
`en_route_at timestamptz`.

**`db.js`:** `slotCounts({ market, from, to })` returns
`{ 'YYYY-MM-DD': { total, w08, w10, ... } }` counting visits not canceled;
`createBookedVisit(fields)` is idempotent on `stripe_setup_intent_id` and
returns the visit; `getVisit(id)` returns one visit with its customer.

**`GET /api/day-capacity?market=portland`:** `{ days: [{ date, label, full,
windows: [{ key, label, full }] }] }`, fail open (nothing full when the
database cannot be read).

**`POST /api/create-booking`** body:

```js
{ email, name, phone, size /* row */, zip, date /* YYYY-MM-DD */, window /* key */,
  quotedCents, consent: { agreed: true, version }, attemptId,
  metadata: { address, unit, notes, photos } }
// 200 { customerId, setupIntentClientSecret, totalCents, loadCents, travelCents }
// 400 { code: 'stale_quote', totalCents } | 'outside_area' | 'closed_day' | 'consent_required' | 'bad_request'
// 409 { code: 'window_full' }
// 503 when a live mode gate is closed
```

**SetupIntent metadata** (server stamped after the page's metadata):
`kind: 'booking'`, `size`, `load_idx`, `load_cents`, `travel_cents`,
`total_cents`, `zip`, `zone`, `zone_label`, `miles`, `market`, `date`,
`window`, `consent_at`, `consent_version`, `photos`, `founding`.

**`POST /api/visit-update`** (admin token) new actions:

```js
{ action: 'finish', visitId, finalLoad, agreed, dryRun }   // -> { cents, loadCents, travelCents, charged, paymentStatus }
{ action: 'declined', visitId }                            // customer said no: no Stripe call
{ action: 'late-fee', visitId }                            // only when ORDER.isLateCancel
{ action: 'en-route', visitId }                            // stamps en_route_at
```

Final charge PaymentIntent metadata: `kind: 'final_charge'` (or
`'late_fee'`), `visit_id`, `final_load_idx`. Idempotency key
`visit:<id>:final:<finalLoad>` and `visit:<id>:late-fee`.

---

### Task 1: The round 6 scorecard, generation 0

**Files:**
- Create: `scripts/lib/fake-stripe.mjs`
- Modify: `scripts/score.mjs` (add `ROUNDS[6]`, `PROBE_SETS[6]`, 1280px dumps, real API routes), `scripts/lib/browser.mjs`, `scripts/test-booking.mjs` and `scripts/test-founding.mjs` (use the shared fake), `docs/superpowers/evolution.md`

**Interfaces:**
- Produces: `installFakeStripe(opts)` returning `{ calls, state }`; supports
  `customers.create/update/retrieve/search`, `setupIntents.create/retrieve`,
  `paymentIntents.create` (`opts.decline: 'card_declined' | 'authentication_required'`
  makes an `off_session` create throw a `StripeCardError` with that code),
  `invoiceItems.create`, `invoices.create/finalizeInvoice/sendInvoice`,
  `subscriptions.create`. Browser helpers `page.click(sel)`,
  `page.type(sel, text)`, `page.taps()` (count of clicks since load),
  `page.interceptScript(urlPrefix, body)`.
- The score server routes `POST /api/create-booking` and
  `GET /api/day-capacity` to the real handlers with the fake Stripe and no
  Supabase; `?__fakepay=1` serves a Stripe.js stub (`window.Stripe` whose
  `elements().create()` mounts plain inputs and whose `confirmSetup` resolves);
  `?__open=1` serves the page with `BOOKINGS_OPEN_CLIENT = true`.

- [ ] **Step 1:** Move the fake Stripe out of `scripts/test-booking.mjs` into
  `scripts/lib/fake-stripe.mjs` (installed via `Module._load`, as today) and
  point `test-booking.mjs` and `test-founding.mjs` at it. Run `npm test`:
  expected PASS (no behaviour change).
- [ ] **Step 2:** Add the browser helpers and a 1280px option to `dump()`.
- [ ] **Step 3:** Add `ROUNDS[6]` with these checks (points sum to 100; each
  `run()` returns `true` or a reason string, like rounds 1 to 5):

| id | pts | passes when |
| --- | --- | --- |
| tests | 6 | `npm test` exits 0 |
| no-truck | 6 | no page, script, style or `i18n/es.json` phrase names `load-builder`, `LoadBuilder`, `LOAD_BUILDER`, `lb-` or tells people to tap items into a truck; `js/load-builder.js` is gone |
| one-source | 4 | both order module copies are byte identical and match the config; no price, window or fee literal in `js/order.js`, `js/size-cards.js` or the APIs |
| sizes | 5 | five cards on the homepage, the order page, a town page and an `es/` page; each price equals `PRICES[row][ONE_TIME_COL]`; red while `GUESS.prices` |
| phone | 9 | order page at 360px: cards stacked; bar shows the total and Book carries the amount; bar hidden while a field has focus; no sideways scroll; text 16px+; taps 48px+ |
| desktop | 7 | order page at 1280px: two columns, summary in view after scrolling to the pay step, no bottom bar; homepage cards in one row; no sideways scroll |
| taps | 10 | scripted booking from the homepage card to `thanks.html` against the score server: card with autofill 10 taps or fewer at 360 and 1280; wallet 8 or fewer; exactly one `create-booking` call. A tap is a click; typing costs nothing; one autofill pick fills name, phone, email and street |
| clear | 6 | "+ travel" before a ZIP; then the total and a Travel line; the rule beside Book, on `thanks.html` and in the confirmation email template |
| server | 10 | `test-booking` passes: SetupIntent, never a PaymentIntent; stale quote, full window, outside the area, closed day and no consent refused with no Stripe object |
| final-charge | 10 | `test-charge` passes |
| webhook | 6 | `test-ops` sections `booked` and `final charge` pass |
| windows | 4 | `day-capacity` returns dates and windows per market, full windows flagged, fail open |
| failures-ui | 4 | far ZIP lead; a full window greyed and labelled "Full"; the stale quote message; with gates closed, a reservation lead with size, ZIP, date, window and contact and no Stripe call |
| dashboard | 3 | the four actions show on a job; each refuses a missing token and the `?token=` form |
| contact | 2 | call, text and WhatsApp in the header, the bar and under the homepage cards; the WhatsApp link's text names the size and ZIP once picked |
| redirect | 2 | `/book/checkout.html` sends to `/book/quote.html` keeping its query (`vercel.json` and a noindex meta refresh) |
| guesses | 2 | windows, caps, days ahead, late fee, cancel hours, refusal fee and the WhatsApp number red; `GUESSES.md` current |
| earlier | 4 | rounds 1 to 5 each score 100 (round 5's own `earlier` check skipped with `--no-earlier`) |

- [ ] **Step 4:** Run `npm run score -- --round 6`. Expected: a low score
  (about 10: `tests` and `earlier` pass). Run rounds 1 to 5: all 100.
- [ ] **Step 5:** Log generation 0 in `evolution.md` under "Round 6 · Build
  generations". Commit: `Round 6 scorecard, generation 0`.

### Task 2: The schedule and policy config, and the order module

**Files:**
- Modify: `pricing.config.mjs`, `scripts/build-pricing.mjs`, `scripts/list-guesses.mjs` (new flags), `package.json` (`test-order-config` in `npm test`)
- Create (generated): `api/_lib/order-config.js`, `js/order-config.js`
- Test: `scripts/test-order-config.mjs`

**Interfaces:** Produces the order module and the `market` field (see
Shared interfaces).

- [ ] **Step 1: Write the failing test** `scripts/test-order-config.mjs`:

```js
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { PRICES, ONE_TIME_COL, LOADS, SCHEDULE, POLICY } from '../pricing.config.mjs';
const require = createRequire(import.meta.url);
const O = require('../api/_lib/order-config.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

console.log('== copies ==');
ok(fs.readFileSync('api/_lib/order-config.js', 'utf8') === fs.readFileSync('js/order-config.js', 'utf8'), 'the two copies differ');
ok(O.SIZES.length === PRICES.length && O.SIZES.every((s, i) => s.cents === PRICES[i][ONE_TIME_COL]), 'size prices drift from PRICES');

console.log('== sizes ==');
for (const s of O.SIZES) { ok(O.sizeForUnits(s.fits) === s.row, `fits edge ${s.fits}`); }
ok(O.sizeForUnits(101) === null, 'over a full truck must be quoted by hand');
ok(O.totalFor(2, 2500) === PRICES[2][ONE_TIME_COL] + 2500, 'totalFor');

console.log('== days ==');
// 2026-10-13 23:30 UTC is Tue 16:30 PDT; 2026-10-14 06:30 UTC is still Tue 23:30 PDT
ok(O.todayPacific(Date.UTC(2026, 9, 14, 6, 30)) === '2026-10-13', 'UTC rolled the Pacific day over');
const days = O.openDays(Date.UTC(2026, 9, 14, 6, 30));   // Pacific today is 2026-10-13
const want = [];
for (let i = 0; i < SCHEDULE.daysAhead; i++) {
  const d = new Date(Date.UTC(2026, 9, 13 + SCHEDULE.leadDays + i));
  if (!SCHEDULE.closedWeekdays.includes(d.getUTCDay())) want.push(d.toISOString().slice(0, 10));
}
ok(JSON.stringify(days.map((d) => d.date)) === JSON.stringify(want), `open days ${days.map((d) => d.date)}`);
ok(!days.some((d) => SCHEDULE.closedWeekdays.includes(d.weekday)), 'a closed weekday is offered');
ok(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}$/.test(days[0].label), `label ${days[0].label}`);

console.log('== windows and DST ==');
// 8 am PDT on 2026-10-31 is 15:00 UTC; 8 am PST on 2026-11-02 is 16:00 UTC (DST ends 2026-11-01)
ok(O.windowStartMs('2026-10-31', 'w08') === Date.UTC(2026, 9, 31, 15, 0), 'PDT window start');
ok(O.windowStartMs('2026-11-02', 'w08') === Date.UTC(2026, 10, 2, 16, 0), 'PST window start');
ok(!O.isBookable('2026-10-14', 'w99', Date.UTC(2026, 9, 13, 12)), 'unknown window bookable');

console.log('== late cancel ==');
const start = O.windowStartMs('2026-10-20', 'w10');
ok(!O.isLateCancel('2026-10-20', 'w10', start - POLICY.cancelHours * 3600000 - 1), 'early cancel charged');
ok(O.isLateCancel('2026-10-20', 'w10', start - POLICY.cancelHours * 3600000), 'late cancel free');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2:** Run `node scripts/test-order-config.mjs`. Expected: FAIL,
  `Cannot find module '../api/_lib/order-config.js'`.
- [ ] **Step 3:** Add `SCHEDULE`, `POLICY`, `photo` on each `LOADS` row and
  the `GUESS` flags to `pricing.config.mjs`, with an `assertSchedule()` that
  throws on a window `start` not `HH:MM`, a duplicate key, a cap under 1 or a
  `dailyCap` under the largest window cap.
- [ ] **Step 4:** In `build-pricing.mjs`, write the order module whole into
  both files with the same text (the `WHOLE` pattern used for `travel.js`;
  `--check` compares both). Dates use `Intl.DateTimeFormat('en-US',
  { timeZone })` parts, never the host clock's zone; `windowStartMs` finds the
  UTC instant whose Pacific wall time is the window start (try the PDT and PST
  offsets, keep the one that round trips). Add `market: 'portland'` to every
  `travelFor` result.
- [ ] **Step 5:** Run `npm run build:pricing`, then
  `node scripts/test-order-config.mjs`: PASS. Add it to `npm test`; run
  `npm test` and `npm run guesses`: PASS and `GUESSES.md` lists the new flags.
- [ ] **Step 6:** Score round 6 and rounds 1 to 5; log the generation. Commit:
  `Order module: sizes, windows, open days, late cancel rule (generated twice)`.

### Task 3: Windows in the database and the capacity API

**Files:**
- Create: `db/migrations/2026-10-10-order-flow.sql`
- Modify: `db/schema.sql`, `api/_lib/db.js`, `api/day-capacity.js`, `api/_lib/schedule.js` (remove `DAILY_CAP` and weekday counting once nothing reads them)
- Test: `scripts/test-ops.mjs` (new section `== slots ==`)

**Interfaces:**
- Consumes: `ORDER.openDays`, `ORDER.SCHEDULE`.
- Produces: `db.slotCounts`, `db.createBookedVisit`, `db.getVisit`, the
  `day-capacity` response (Shared interfaces).

- [ ] **Step 1: Write the failing test** in `scripts/test-ops.mjs`:

```js
console.log('== slots ==');
// fake db rows: two visits in w08 on the first open day, cap 2 -> w08 full
const first = ORDER.openDays(NOW)[0].date;
fakeVisits([{ scheduled_date: first, window_key: 'w08', market: 'portland', status: 'scheduled' },
            { scheduled_date: first, window_key: 'w08', market: 'portland', status: 'scheduled' },
            { scheduled_date: first, window_key: 'w08', market: 'portland', status: 'canceled' }]);
const cap = await callCapacity('?market=portland');
const d0 = cap.json.days.find((d) => d.date === first);
ok(d0.windows.find((w) => w.key === 'w08').full === false, 'a canceled visit counted');
fakeVisits([...threeScheduledIn('w08')]);
ok((await callCapacity('?market=portland')).json.days[0].windows[0].full === true, 'full window not flagged');
dbDown();
ok((await callCapacity('?market=portland')).json.days.every((d) => !d.full), 'capacity must fail open');
```

(Use the fake Supabase the file already has; add `fakeVisits`, `dbDown`,
`callCapacity` helpers next to the existing ones.)

- [ ] **Step 2:** Run `node scripts/test-ops.mjs`: FAIL on `== slots ==`.
- [ ] **Step 3:** Write the migration (the visit columns in Shared
  interfaces, `alter table ... add column if not exists`, a unique index on
  `stripe_setup_intent_id`, an index on `(market, scheduled_date, window_key)`)
  and fold it into `schema.sql`. Add the three `db.js` functions; rewrite
  `day-capacity.js` to answer per market from `slotCounts` and
  `ORDER.openDays(Date.now())`, a day being full when its `total` reaches
  `dailyCap` or every window is full.
- [ ] **Step 4:** Run `npm test`: PASS. Score; log. Commit:
  `Windows: visit columns, slot counts, capacity by date and window`.

### Task 4: Booking saves the card (SetupIntent)

**Files:**
- Modify: `api/create-booking.js`, `api/_lib/founding.js`
- Test: `scripts/test-booking.mjs` (rewritten), `scripts/test-founding.mjs`

**Interfaces:**
- Consumes: `ORDER`, `travelFor`, `db.slotCounts`.
- Produces: the `create-booking` contract and SetupIntent metadata (Shared
  interfaces).

- [ ] **Step 1: Write the failing tests** (replace the PaymentIntent and
  subscription sections of `test-booking.mjs`):

```js
const day = ORDER.openDays(Date.now())[0].date;
const good = (over = {}) => ({
  email: 'a@b.co', name: 'Jane Smith', phone: '5035550100', size: 2, zip, date: day, window: 'w10',
  quotedCents: ORDER.totalFor(2, travelFor(zip).cents), consent: { agreed: true, version: ORDER.POLICY.consentVersion },
  attemptId: 'att_1', metadata: { address: `1 Oak Ln, Gresham ${zip}` }, ...over,
});
console.log('== refusals ==');
const stale = await call(good({ quotedCents: 1 }));
ok(stale.status === 400 && stale.json.code === 'stale_quote' && stale.json.totalCents === good().quotedCents, 'stale quote');
ok((await call(good({ zip: '90210' }))).json.code === 'outside_area', 'outside area');
ok((await call(good({ date: '2020-01-01' }))).json.code === 'closed_day', 'past day');
ok((await call(good({ consent: { agreed: false } }))).json.code === 'consent_required', 'no consent');
ok((await call(good({ consent: { agreed: true, version: 'old' } }))).json.code === 'consent_required', 'old consent version');
fakeFullWindow(day, 'w10');
ok((await call(good())).status === 409, 'full window');
ok(calls.length === 0, 'a Stripe object was created on a refused booking');
console.log('== setup intent ==');
const r = await call(good());
ok(r.status === 200 && r.json.setupIntentClientSecret, 'no client secret');
ok(calls.some(([k]) => k === 'setupIntent') && !calls.some(([k]) => k === 'pi' || k === 'sub'), 'a charge was created at booking');
const si = calls.find(([k]) => k === 'setupIntent')[1];
ok(si.usage === 'off_session' && si.metadata.kind === 'booking' && si.metadata.window === 'w10', 'setup intent metadata');
ok(Math.abs(Date.parse(si.metadata.consent_at) - Date.now()) < 60000, 'consent time not stamped by the server');
ok((await call(good({ metadata: { address: '1 Oak', kind: 'final_charge', total_cents: '1' } }))).status === 200
   && lastSetupIntent().metadata.kind === 'booking' && lastSetupIntent().metadata.total_cents === String(good().quotedCents),
   'the page overwrote server metadata');
```

Keep the existing gate tests (live mode closed returns 503).

- [ ] **Step 2:** Run `node scripts/test-booking.mjs`: FAIL.
- [ ] **Step 3:** Rewrite `create-booking.js`: parse, recompute
  `ORDER.totalFor(size, trip.cents)`, refuse in the order of the test, check
  capacity (fail open), create the customer (idempotency key from
  `attemptId`), create the SetupIntent (`customer`, `usage: 'off_session'`,
  `automatic_payment_methods: { enabled: true }`, metadata as in Shared
  interfaces, server fields spread last). Remove the PaymentIntent,
  subscription, quarterly and coupon paths. In `founding.js`, count founding
  customers with `customers.search({ query: "metadata['founding']:'true'" })`
  and stamp `founding` on the customer.
- [ ] **Step 4:** Run `npm test`: PASS. Score; log. Commit:
  `Booking saves the card: SetupIntent, no charge at booking`.

### Task 5: The webhook books the job

**Files:**
- Modify: `api/stripe-webhook.js`, `api/_lib/email-templates.js`, `api/_lib/email.js` if needed
- Test: `scripts/test-ops.mjs` (new section `== booked ==`)

**Interfaces:**
- Consumes: SetupIntent metadata, `db.createBookedVisit`.
- Produces: a visit with `payment_status: 'card_saved'`; the confirmation
  email shows the day, the window, the total with the travel line and the
  rule ("Nothing is charged today...").

- [ ] **Step 1: Write the failing test:**

```js
console.log('== booked ==');
const ev = setupIntentSucceeded({ kind: 'booking', date: day, window: 'w10', total_cents: '37400', travel_cents: '2500', load_idx: '2' });
await deliver(ev);
ok(createdVisits().length === 1 && createdVisits()[0].window_key === 'w10' && createdVisits()[0].payment_status === 'card_saved', 'visit not written');
ok(sentEmails().some((e) => /Nothing is charged today/.test(e.html) && /10 am to 12 pm/.test(e.html)), 'confirmation lacks the window or the rule');
ok(discordPings().length === 1, 'no Discord ping');
await deliver(ev);
ok(createdVisits().length === 1, 'a redelivered event wrote a second visit');
await deliver(setupIntentSucceeded({ kind: 'something_else' }));
ok(createdVisits().length === 1, 'a setup intent that is not a booking wrote a visit');
dbDown(); await deliver(setupIntentSucceeded({ kind: 'booking', date: day, window: 'w12' }));
ok(sentEmails().length >= 2, 'a database error lost the confirmation (fail soft)');
```

- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Handle `setup_intent.succeeded` when the SetupIntent's own
  `metadata.kind === 'booking'`: set the customer's default payment method,
  write the customer and the visit, keep quote photos (as today), send the
  confirmation, Discord ping and owner email. Branch on `event.data.object.metadata.kind`,
  never on merged customer metadata. Reminder emails show the window.
- [ ] **Step 4:** `npm test`: PASS. Score; log. Commit:
  `Webhook: a saved card books the job (visit with date and window)`.

### Task 6: The after job charge

**Files:**
- Modify: `api/visit-update.js`, `api/stripe-webhook.js`, `api/_lib/email-templates.js`
- Create: `scripts/test-charge.mjs` (add to `npm test`)

**Interfaces:**
- Consumes: `db.getVisit`, `ORDER`, `installFakeStripe({ decline })`.
- Produces: the four actions (Shared interfaces); webhook marks paid on
  `payment_intent.succeeded` and `invoice.paid` for `final_charge` and
  `late_fee`.

- [ ] **Step 1: Write the failing test** `scripts/test-charge.mjs`:

```js
// visit booked at 1/2 truck for 34900 + 2500 travel
const v = fakeVisit({ quoted_load_idx: 2, quoted_load_cents: 34900, travel_cents: 2500, payment_status: 'card_saved' });
console.log('== price ==');
let r = await act({ action: 'finish', visitId: v.id, finalLoad: 2, dryRun: true });
ok(r.json.cents === 37400 && calls.length === 0, 'dry run charged or mispriced');
setPrice(2, 39900);   // the table changed after booking
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 2, dryRun: true })).json.cents === 37400, 'booked size not charged its quoted cents');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 3, dryRun: true })).json.cents === ORDER.SIZES[3].cents + 2500, 'new size not today\'s price plus booked travel');
console.log('== agreement ==');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 3 })).status === 400 && calls.length === 0, 'bigger size charged without agreement');
console.log('== charge once ==');
r = await act({ action: 'finish', visitId: v.id, finalLoad: 3, agreed: true });
ok(r.status === 200 && piCalls().length === 1 && piCalls()[0].off_session === true && piCalls()[0].metadata.kind === 'final_charge', 'final charge');
ok((await act({ action: 'finish', visitId: v.id, finalLoad: 3, agreed: true })).status === 409 && piCalls().length === 1, 'charged twice');
console.log('== decline ==');
const v2 = fakeVisit({ quoted_load_idx: 1, quoted_load_cents: 19900, travel_cents: 0, payment_status: 'card_saved' });
installDecline('authentication_required');
r = await act({ action: 'finish', visitId: v2.id, finalLoad: 1 });
ok(r.json.paymentStatus === 'payment_needed' && invoiceSent() && alerts().length === 1, 'decline not handled');
console.log('== said no and late fee ==');
const v3 = fakeVisit({ payment_status: 'card_saved' });
ok((await act({ action: 'declined', visitId: v3.id })).status === 200 && calls.length === 0, 'said no touched Stripe');
const early = fakeVisit({ scheduled_date: farDay, window_key: 'w10', payment_status: 'card_saved' });
ok((await act({ action: 'late-fee', visitId: early.id })).status === 400, 'late fee outside the window');
const late = fakeVisit({ scheduled_date: tomorrow, window_key: 'w08', payment_status: 'card_saved' });
ok((await act({ action: 'late-fee', visitId: late.id })).status === 200 && piCalls().at(-1).amount === ORDER.POLICY.lateFeeCents, 'late fee');
console.log('== auth ==');
ok((await act({ action: 'finish', visitId: v.id }, { token: null })).status === 401, 'no token accepted');
ok((await act({ action: 'finish', visitId: v.id }, { queryToken: true })).status === 401, '?token= accepted');
```

Add a `== final charge ==` section to `test-ops.mjs`: a
`payment_intent.succeeded` with `metadata.kind: 'final_charge'` marks the
visit paid, sends the receipt, writes no visit and sends no "New booking"
ping.

- [ ] **Step 2:** Run: FAIL.
- [ ] **Step 3:** Implement the actions in `visit-update.js` (price from
  `ORDER.SIZES` or the stored quoted cents, plus stored travel; founding off
  the final charge if the visit was stamped; refuse when `payment_status` is
  `paid`; off session PaymentIntent with the idempotency key; on
  `StripeCardError` create and send a hosted invoice, store `invoice_url`, set
  `payment_needed`, alert Discord and the owner email once). `finish` then
  runs today's `complete` path (all done email with photos). Webhook branches
  and the receipt, payment needed and late fee templates.
- [ ] **Step 4:** `npm test`: PASS. Score; log. Commit:
  `After job charge: final size priced on the server, one charge, invoice on decline`.

### Task 7: The dashboard job card

**Files:**
- Modify: `jkr/index.html`
- Test: `scripts/test-admin.mjs`, the scorecard's `dashboard` check

- [ ] **Step 1:** Add to `test-admin.mjs` a check that `jkr/index.html` holds
  the four actions (`data-action="finish"`, `declined`, `late-fee`,
  `en-route`) and that each posts with the `x-admin-token` header. Run: FAIL.
- [ ] **Step 2:** On each job: size booked, quoted total, day and window,
  payment status. **On my way** opens `sms:<phone>?&body=On our way, about 20 minutes`
  and posts `en-route`. **Finish and charge** asks the final size (default the
  booked one), shows the dry run price, shows the agreement box when the size
  is bigger, then charges. **Late cancel fee** shows only when the server says
  it is late. **Customer said no** confirms in the page (no browser dialog).
  48px buttons; works at 360px.
- [ ] **Step 3:** `npm test`: PASS. Score; log. Commit:
  `Dashboard: size, window, payment status and the four job actions`.

### Task 8: The order page, without the card

**Files:**
- Modify: `book/quote.html` (rewritten body; head, canonical, share card and `BUILD:quote-jsonld` kept, JSON-LD one time only), `scripts/build-pricing.mjs` (a `BUILD:order-sizes` block of card HTML), `scripts/score.mjs` (generalise round 1 `quote-zone`, `quote-far`, `mobile` and round 2 checks that read the old quote page)
- Create: `js/order.js`, `js/size-cards.js`, `css/order.css`

**Interfaces:**
- Consumes: `window.ORDER`, `window.TRAVEL`, `GET /api/day-capacity`,
  `window.SiteLeads.capture`, `api/photo-quote.js` (unchanged).
- Produces: `#order` with sections `#o-size`, `#o-zip`, `#o-when`, `#o-you`,
  `#o-pay`; the bar `#o-bar` (phone) and the summary `#o-summary` (desktop),
  both showing `.o-total`, `.o-travel`, and `#o-book` whose label carries the
  amount; `?size=<row>` and the old `?load=<row>` pick a size; `quoteZip`
  prefills the ZIP.

- [ ] **Step 1:** Run the round 6 `phone`, `desktop`, `failures-ui` and
  `sizes` checks: FAIL.
- [ ] **Step 2:** Generate the five cards (photo, name, what fits, price with
  "+ travel" until the ZIP) into `BUILD:order-sizes` from `LOADS` and
  `PRICES`, red while `GUESS.prices`. `js/size-cards.js` makes them pickable
  (shared with the homepage in Task 10).
- [ ] **Step 3:** `js/order.js`: one state object `{ size, zip, trip, date,
  window, contact }`; sections open when the one above is done (no Continue
  buttons); the photo quote's counts go through `ORDER.sizeForUnits` and the
  page says "From your photos: 1/2 truck. Change it if that looks wrong.";
  far ZIP shows the existing email a price lead; day chips from
  `day-capacity`, full ones greyed and labelled "Full"; contact fields with
  `autocomplete="name" "tel" "email" "street-address" "address-line2"`,
  `type="tel"`, `inputmode="numeric"` on the ZIP, the phone reason text, and
  an "Anything we should know?" link that opens notes. With the gates closed,
  Book saves the reservation lead (size, ZIP, date, window, contact) and shows
  the reserved state.
- [ ] **Step 4:** `css/order.css`: under 900px one column and the fixed bar
  (hidden while an input has focus); 900px and up two columns, the summary
  `position: sticky`, cards two or three to a row.
- [ ] **Step 5:** Generalise the round 1 and round 2 checks that read the old
  quote page to the new elements. `npm test` and rounds 1 to 5: 100. Score;
  log. Commit: `Order page: sizes, ZIP, day and window, contact; reservation while closed`.

### Task 9: Pay, thanks and the old checkout

**Files:**
- Modify: `js/order.js`, `css/order.css`, `book/quote.html`, `book/thanks.html`, `book/checkout.html` (becomes a noindex redirect), `vercel.json`, `scripts/score.mjs` (generalise round 1 `checkout`, `guesses`, `mobile`)

- [ ] **Step 1:** Run the round 6 `taps`, `clear` and `redirect` checks: FAIL.
- [ ] **Step 2:** Pay section: `stripe.elements({ mode: 'setup', currency: 'usd' })`,
  the Express Checkout Element (Apple Pay and Google Pay, `emailRequired`,
  `phoneNumberRequired`) above the Payment Element (`fields.billingDetails`
  name, email and phone `never`; pass them at confirm). The rule above one
  checkbox, "I agree to the terms, and to this card being charged after the
  job." On Book: `elements.submit()`, `POST /api/create-booking` with
  `consent: { agreed: true, version: ORDER.POLICY.consentVersion }`, then
  `stripe.confirmSetup({ elements, clientSecret, redirect: 'if_required' })`,
  then `thanks.html`. A `stale_quote` reprices and says so; a `window_full`
  reloads the windows and asks for another.
- [ ] **Step 3:** `thanks.html` shows size, total with the travel line, day
  and window, "charged after the job" and what happens next.
- [ ] **Step 4:** `checkout.html` becomes a redirect keeping the query
  (`vercel.json` redirect plus a noindex meta refresh for local preview);
  remove it from the sitemap.
- [ ] **Step 5:** `npm test` and rounds 1 to 5: 100. Score; log. Commit:
  `Pay with a saved card: Express Checkout and Payment Element, consent, thanks`.

### Task 9b: Pay at booking (founder change, 2026-10-10)

The founder: "payments have to be accepted at time of bookings so i can pay
hauler". The spec's money section is rewritten (read it: "The money", "Pay",
"After booking", "The dashboard"). This task switches the server, the page,
the thanks page and the dashboard from "card saved, charged after the job" to
"the quoted total paid at booking, card saved, the difference charged or
refunded after the job", in one consistent change.

**Files:**
- Modify: `api/create-booking.js`, `api/stripe-webhook.js`, `api/visit-update.js`, `api/_lib/email-templates.js`, `api/_lib/db.js` (if columns change), `db/migrations/2026-10-10-order-flow.sql` and `db/schema.sql` (unapplied, edit in place), `pricing.config.mjs` (`POLICY.consentVersion` to `'2026-10-10b'`) then `npm run build:pricing`, `js/order.js`, `book/quote.html`, `book/thanks.html`, `jkr/index.html`, `scripts/lib/fake-stripe.mjs` (`refunds.create`; the Ruling R2 stub gains `stripe.confirmPayment()` → `{ paymentIntent: { status: 'succeeded' } }`), `scripts/score.mjs`, `scripts/test-booking.mjs`, `scripts/test-charge.mjs`, `scripts/test-ops.mjs`, `scripts/test-admin.mjs`

**Interfaces (replace the SetupIntent ones):**

```js
// POST /api/create-booking: same body and refusals as Task 4; 200 now:
{ customerId, paymentIntentClientSecret, totalCents, loadCents, travelCents }
// The booking PaymentIntent: amount = total less any founding discount,
// currency 'usd', customer, setup_future_usage: 'off_session',
// automatic_payment_methods: { enabled: true }, metadata: the Task 4 keys with kind: 'booking'.
// No SetupIntent at booking. Idempotency as Ruling R10.

// Visit columns added: paid_cents int, refunded_cents int.
// payment_status: 'paid' | 'payment_needed' | 'refunded' | 'late_fee_kept'

// POST /api/visit-update (admin token):
{ action: 'finish', visitId, finalLoad, agreed, dryRun }
//  -> { cents /* final total */, paidCents, differenceCents /* >0 charge, <0 refund */,
//       charged, refunded, paymentStatus }
//  bigger: needs agreed === true; off session PaymentIntent for the difference,
//    metadata kind 'difference', key visit:<id>:diff:<finalLoad>, allow_redirects 'never' (R14)
//  smaller: stripe.refunds.create({ payment_intent: visit.stripe_payment_intent_id,
//    amount: -differenceCents }), key visit:<id>:refund:<finalLoad>
//  same: no Stripe call. Then today's complete path (R13: a declined difference
//    still completes the job; invoice for the difference, payment_needed).
{ action: 'cancel-refund', visitId }  // replaces 'late-fee': full refund before
//    ORDER.isLateCancel, else refund paid less POLICY.lateFeeCents; status canceled
{ action: 'declined', visitId }       // refund paid less POLICY.refusalFeeCents; status declined
{ action: 'en-route', visitId }       // unchanged
```

- The webhook books on `payment_intent.succeeded` whose own `metadata.kind`
  is `'booking'`: sets the customer's default payment method, writes the visit
  with `payment_status: 'paid'`, `paid_cents` (the PaymentIntent amount),
  `stripe_payment_intent_id`, `stripe_payment_method_id`, and keeps the
  `booking_notified_at` dedupe (Ruling R11; email keys from the PaymentIntent
  id). `kind: 'difference'` succeeded marks the difference paid and sends the
  receipt; its failure marks `payment_needed` (deduped as in Task 6). The
  `setup_intent.succeeded` booking path is removed. Founding (R12) is read
  from the booking PaymentIntent's metadata and applied at booking.
- The page: `stripe.elements({ mode: 'payment', amount: totalCents,
  currency: 'usd', setupFutureUsage: 'off_session' })`, `elements.update({
  amount })` whenever the total changes, `stripe.confirmPayment({ elements,
  clientSecret, confirmParams: { return_url: <origin>/book/thanks.html,
  payment_method_data: { billing_details } }, redirect: 'if_required' })`.
  Consent text: "I agree to the terms, and to this card being charged or
  refunded the difference if the crew finds a different size." The rule above
  it and the copy on the button, the thanks page and the confirmation email
  say what is paid now and that a different size is charged or refunded
  (spec "Pay"); "Nothing is charged today" leaves the order page, the thanks
  page and the emails (the pre-launch banner's "no card needed" while closed
  stays true and stays).
- The dashboard: Finish shows "Charge $X more", "Refund $X" or "No change"
  from the dry run (agreement box only when charging more); "Cancel and
  refund" shows the refund (full, or less the late fee when late); "Customer
  said no" shows its refund.
- The scorecard: `server` proves exactly one PaymentIntent with
  `setup_future_usage: 'off_session'` and no SetupIntent at booking, refusals
  with no Stripe object; `final-charge` runs test-charge (charge more, refund
  less, same, decline to invoice, cancel refunds, said no refund); `clear`
  looks for the pay now rule; `dashboard` names `finish`, `declined`,
  `cancel-refund`, `en-route`. Points unchanged.

- [ ] **Step 1:** Rewrite the tests first (test-booking, test-charge,
  test-ops `booked` and `final charge` sections, test-admin) to the new
  contract; run them: FAIL.
- [ ] **Step 2:** Server: create-booking, webhook, visit-update, templates,
  columns. Run the server tests: PASS.
- [ ] **Step 3:** Page, thanks and dashboard; scorecard checks. Screenshots
  of the pay step and thanks page at 360 and 1280.
- [ ] **Step 4:** `npm test`; round 6 and rounds 1 to 5 at 100 where they
  were; log the generation. Commit: `Pay at booking: the quoted total charged when booked, the difference charged or refunded after the job`.

### Task 10: The homepage, towns and Spanish lose the truck

**Files:**
- Modify: `index.html` (hero cards in `BUILD:home-sizes`, "Send us a photo", call, text and WhatsApp, "Need regular pickups?" to `/book/commercial.html`), `js/home.js`, `css/home.css`, `api/_lib/site.js` (`WHATSAPP`, a `GUESS*`), `i18n/es.json`, `scripts/build-es.mjs`, `scripts/build-towns.mjs` if it names the builder, the town files and post that say to tap items, `terms.html`, `faq.html`, `es/faq.html` (paying after the job, cancel and late fee from `POLICY`), `scripts/score.mjs` (generalise round 1 `home` and round 5 `spanish-js` to `.size-price` and `.size-travel`), `scripts/test-es.mjs`
- Delete: `js/load-builder.js` and its CSS blocks

- [ ] **Step 1:** Run the round 6 `no-truck`, `contact` and `sizes` checks:
  FAIL.
- [ ] **Step 2:** Make the changes; `npm run build`; add the Spanish for every
  new phrase to `i18n/es.json` (the build lists the missing ones). The scroll
  road truck and Junk Toss stay (not the load builder) unless the founder
  says otherwise.
- [ ] **Step 3:** `npm test` and rounds 1 to 5: 100. Score; log. Commit:
  `The truck leaves: size cards on every page, contact buttons, Spanish`.

### Task 11: Docs, 100, review, merge

- [ ] **Step 1:** Update `CLAUDE.md` (the booking flow, gates, schedule and
  policy config, the order module, the dashboard actions, the tests, the
  folder map), `LAUNCH-DAY.md` (webhook events `setup_intent.succeeded`,
  `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.paid`;
  read the consent wording), `PROGRESS.md`.
- [ ] **Step 2:** `npm run score -- --round 6` = 100 and rounds 1 to 5 = 100;
  screenshots at 360 and 1280 for the founder.
- [ ] **Step 3:** Review with the plugins: `design:accessibility-review` and
  `design:ux-copy` on the order page, `code-review` on the branch; fix what
  holds up.
- [ ] **Step 4:** Log the final generation; merge `feat/order-flow` to `main`;
  push.
