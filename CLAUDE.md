# jkr: junk removal site (working notes for Claude)

A skeleton built from the Scoops Co. stack (`C:\Users\chris\scoopco`) on
2026-09-27: static pages, Vercel serverless API, Stripe, Supabase.
**Not live, no name, no domain yet.** Pages carry titles and placeholder
pictures only; the founder will write the copy.

Redesigned 2026-09-28: charcoal and hi-vis yellow, Bricolage Grotesque for
display type, and a "load builder" (tap items, the truck fills, the price is
live) as the homepage hero and quote step 1. Phone (925) 408-6053 comes from
Scoops Co. Since 2026-10-07 the service area is the whole Portland metro
(Clark County, WA included) with a travel fee by zone: see Travel pricing.

**Guesses are red.** The founder's rule (2026-10-07): guess anything not yet
known, show it red with an asterisk (`css/guess.css`, `class="guess"`), and
keep the list in `GUESSES.md` (`npm run guesses`; `npm test` fails if stale).
Whole tables are flagged in `GUESS` in `pricing.config.mjs`; anything else
gets a `GUESS*` marker comment.

Placeholders to replace: "Brand Name", "example.com",
`pk_test_REPLACE_ME`, `G-XXXXXXXXXX`, `YOUR-PROJECT.supabase.co`,
`images/placeholder.svg`, and every `TODO` (`grep -rn TODO`).

The founder is finishing a degree. Keep sessions focused and small.

## The plan (agreed 2026-10-07, a starting point the founder will adjust)

Spec: `docs/superpowers/specs/2026-10-07-scoops-import-design.md`. Read it
before starting any of this work. Three parts, in order:

1. **Import**, in five rounds, each its own branch and its own step by step
   plan written when the round starts:
   1. Service area and travel pricing: the whole Portland metro (Clark County,
      WA included), price = load + a travel fee by zone, zone set by ZIP in
      road miles from a Gresham base. **Done 2026-10-07** (see Travel
      pricing below).
   2. Pages and site parts: shared chrome, a page for every town in the area,
      FAQ, privacy, terms, 404. Copy drafted from Scoops Co.
   3. Business docs and follow-up helpers, owner booking email.
   4. SEO tools.
   5. Blog, Spanish, commercial form, founding offer (off).
2. **Walkthrough** of the whole site with the founder.
3. **Photo first quote with an on site adjustment**: charge more when the job
   is bigger than the photos showed. Its own spec.

How each round is built (founder, 2026-10-07): two competing plans, scored,
then a child plan that takes the best of both; the build is scored by
`npm run score -- --round N` (real checks, including the pages in headless
Chrome at 360px) and a round is done at 100. Every generation's score is in
`docs/superpowers/evolution.md`.

Progress: rounds 1 (travel pricing), 2 (pages) and 3 (business docs and
follow-up) done and merged, each scored 100. Round 4 (SEO tools) IN PROGRESS on
branch feat/seo: plan docs/superpowers/plans/2026-10-07-round-4-seo.md; tasks
1 (scorecard, gen 0 = 15) and 2 (api/_lib/site.js, set-domain) committed; next
is task 3 (JSON-LD). Resume: git checkout feat/seo; npm run score -- --round 4.

**Pending founder decision (2026-10-07):** "30 miles might be too far for
junk removal ... a good radius is between 22 and 24 miles max", with travel
priced to cover the drive. Apply at the pricing review: set the last zone's
`upToMiles` in `pricing.config.mjs`, re-price the fees, and delete the town
files `npm run build` names (about 19 of 40 at 24 miles).

## Folder map

```
index.html             homepage; marks the CITY:head/hero/local/faq regions town pages swap
<town>.html            40 town pages + service-areas.html (hub): GENERATED, never edit
content/towns/*.md     one plain text file per town (format: content/towns/README.md)
faq.html privacy.html terms.html 404.html   hand written, shared header/footer via build-chrome
book/                  the booking flow
  quote.html             step 1: photos or taps fill the truck + one-time or monthly
                         step 2: ZIP + contact
  checkout.html          step 2: price, day, payment (Stripe)
  thanks.html            step 3: confirmation
jkr/index.html       admin dashboard, served at /jkr/
api/                   Vercel serverless functions
  create-booking.js      charges the card (authoritative price, ZIP and travel)
  photo-quote.js         customer photos → Claude counts the items → the truck
  stripe-webhook.js      after payment: database rows, email, Discord ping
  day-capacity.js        which days are full
  cron-visits.js         daily: next recurring jobs + reminders
  admin-data.js          dashboard data
  visit-update.js        dashboard job actions (start, done, skip)
  visit-photo.js         dashboard before/after photos
  _lib/                  shared: db, email, email templates, schedule math,
                         travel.js (GENERATED: ZIP → zone and fee)
css/ js/ fonts/ images/  design system, scripts, fonts, pictures
  js/load-builder.js     the truck: items → load size → price (home + quote)
  js/home.js, css/home.css  homepage only: scroll road, tilt cards, ZIP check
  js/travel.js           GENERATED, the same file as api/_lib/travel.js
  css/guess.css          red with an asterisk: placeholder guesses
data/zip-miles.mjs     road miles from the base to every metro ZIP (measured once)
db/schema.sql          Supabase tables (apply once); db/migrations/ for older ones
pricing.config.mjs     THE price table, travel zones and guess flags
GUESSES.md             every placeholder guess (GENERATED by npm run guesses)
scripts/               build-pricing, build-towns, build-chrome, measure-zips, list-guesses, score, tests
  lib/browser.mjs        headless Chrome at a real 360px (score, screenshots)
vercel.json            headers, daily cron
BUSINESS_PLAN.md LAUNCH-DAY.md ACCOUNTS.md PROGRESS.md PUNCHLIST.md   the business side;
                       prices, zones and towns in them are generated (build-docs)
marketing/             ad copy (no prices in ads), Facebook groups, Google profile
agent/skills/          follow-up helpers (draft only) + _shared/jkr-context.md
.github/workflows/     Supabase keep-alive (secrets only; skips until set up)
```

## How a booking flows

```
book/quote.html → book/checkout.html → POST /api/create-booking → Stripe
                                          one-time: PaymentIntent
                                          monthly:  subscription
Stripe → /api/stripe-webhook → Supabase rows + confirmation email + Discord
                               + owner email (OPS_EMAIL, new bookings only)
book/thanks.html shows the summary
```

Contact details travel in sessionStorage (`quoteContact`), never in the URL.
The webhook, not the checkout, writes customers/subscriptions/visits and sends
the confirmation. In the database a job is a `visit`.

## Travel pricing (2026-10-07)

The service area is every ZIP inside the travel zones: the Portland metro,
Clark County, WA included. Price per visit = **load price + the zone's travel
fee**, for one-time hauls, monthly pickups and the quarterly prepay alike.

- **`BASE`** in `pricing.config.mjs`: where miles are measured from (Gresham
  city center, a guess until the real yard is set).
- **`ZONES`**: rings of road miles with a fee each (0 to 10 free, then +$25,
  +$50, +$75 to 40 miles; all guesses). An edge belongs to the inner ring.
  Past the last ring is "call us": the quote page offers a price by email and
  keeps the lead, and the server refuses the booking.
- **`ZONE_OVERRIDES`**: pin one ZIP to a zone by hand.
- **`data/zip-miles.mjs`**: road miles from `BASE` to each ZIP's center
  (GeoNames centers, OSRM road distance), measured once by
  `node scripts/measure-zips.mjs`. Re-run it only if `BASE` moves. Nothing
  calls a map service at booking time. Place names are USPS city names, so
  Tigard and Milwaukie read "Portland".
- **`npm run build:pricing`** writes `api/_lib/travel.js` and `js/travel.js`
  (byte identical; `travelFor(zip)` → zone, fee, miles, place, or null) and
  the homepage zone list. `npm test` proves both copies agree with the config
  for every ZIP.
- Until the page knows the ZIP the truck says "+ travel"; the last ZIP typed
  anywhere is kept in sessionStorage (`quoteZip`). Travel is its own line on
  the quote, checkout, thanks page, confirmation email, Discord ping and
  dashboard, and rides in Stripe metadata (`zip`, `zone`, `zone_label`,
  `travel_cents`, `miles`, `load_cents`) into `subscriptions.travel_*`.

## Pages are generated: `npm run build`

`npm run build` runs, in order: `build-pricing` (prices, travel module),
`build-towns` (the homepage zone list, then every town page and the hub,
each a copy of `index.html` with its CITY regions swapped), `build-chrome`
(the homepage header, footer and sticky button into the FAQ, legal and 404
pages), `build-docs` (prices, zones and towns into the Markdown docs between
`BUILD:docs-*` markers), `list-guesses` (`GUESSES.md`). `npm test` runs every `--check`, so a
hand edit to a generated page, or a homepage change not rebuilt, fails.

- **Add a town:** write `content/towns/<slug>.md`, run `npm run build`. Every
  ZIP must be in a zone; two towns may not share a sentence (`test-towns`).
- **Change the header or footer:** edit `index.html`, run `npm run build`.
- `[[double brackets]]` in a town file print red with an asterisk (a guess).
- `js/maintenance-banner.js` (`SHOW = true` while bookings are closed) and
  `js/analytics.js` (`G-XXXXXXXXXX`) load on every public page.

## Pricing is generated: never hand-edit the copies

Edit **`pricing.config.mjs`** (rows = load sizes, columns = one-time haul and
monthly pickup), then run **`npm run build:pricing`**. It rewrites the blocks
between `BUILD:` markers in `api/create-booking.js` (authoritative),
`book/quote.html`, `book/checkout.html` and `index.html`, and writes the two
travel modules whole. The server
recomputes every booking and refuses one that doesn't match ("Quote is out of
date").

**Photo quotes:** the customer sends up to 4 photos; `api/photo-quote.js`
asks Claude (`claude-opus-5`, structured output limited to the `ITEMS` keys)
to count them, and the page drops the count into the truck for them to fix.
Claude only counts; prices never come from it. The photos are kept in the
private `visit-photos` bucket under `quotes/`, ride with the booking as
`metadata.photos` (the server keeps only paths it named, `QUOTE_PHOTO_RE`),
become `visit_photos` rows of kind `quote`, and show up in the Discord ping
and on the dashboard job. No `ANTHROPIC_API_KEY` → 503 and the page falls
back to tapping.

`ITEMS` (units out of 100 per truck) and each load's `fits` ceiling drive the
load builder: the smallest load whose `fits` holds the tapped units is the
size. Items only pick a size; the server still prices the size.

Never hardcode a column index; derive it (`ONE_TIME_COL`, `BILLING_BY_COL`).
Adding a column means a matching `CADENCE` entry in `api/_lib/schedule.js`
(`npm test` fails if they disagree). Money is integer cents, printed with
`toFixed(2)`.

## The booking gates (all CLOSED until launch)

1. `BOOKINGS_OPEN_SERVER` in `api/create-booking.js`
2. `BOOKINGS_OPEN=true` env var in Vercel
3. `BOOKINGS_OPEN_CLIENT` in `book/checkout.html` (UI only)

Only live mode (`sk_live`) is gated. Emergency brake: flip #1 to `false`.

## Admin dashboard: `jkr/` (served at `/jkr/`)

Clients and leads, schedule, bookings, and job actions (start, before and
after photos, mark done, skip). Marking a job done emails the customer the
"all done" note with the photos and queues the next recurring pickup. Every
Discord booking alert links to it.

- **Auth is the `ADMIN_DASHBOARD_TOKEN` env var**, sent in the
  `x-admin-token` header only. Never add a `?token=` URL form (it leaks into
  history, Referer and logs; `npm test` checks it is refused).
- Photos need a PRIVATE Supabase storage bucket named `visit-photos`.

## Setup before launch

Env vars: `STRIPE_SECRET_KEY`, `STRIPE_PRODUCT_ID`, `STRIPE_WEBHOOK_SECRET`,
`BOOKINGS_OPEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`EMAIL_FROM`, `OPS_WEBHOOK_URL` (Discord), `OPS_EMAIL` (owner booking email), `ANTHROPIC_API_KEY` (photo quotes), `SITE_ORIGIN`, `CRON_SECRET`,
`ADMIN_DASHBOARD_TOKEN` (a long random string).
Apply `db/schema.sql` in Supabase (it includes the `leads` table). Put the
publishable key in `book/checkout.html` and the anon key in `js/leads.js`.
The Stripe webhook URL must use the host that does NOT redirect.

## Not carried over from Scoops Co.

Founding-member offer (the checkout math is there, dormant), the
Gresham/Portland street lookup, the $0 booking path, commercial intake form,
Spanish pages, generated header/footer, city pages, blog, sitemap.

## Rules

- Branch, then merge to `main`.
- Fail-soft on the database (an error never loses a booking); fail-open on
  capacity.
- Secrets: `.gitignore` covers `.env*`, keys, `.vercel`. Never commit one.
- Mobile: text at least 16px, tap targets at least 48×48, no sideways scroll.
- Copy: "we / us / our", plain, no slang, **no dashes as punctuation**.

## Tests

`npm test`: schedule math, travel zones (band edges, overrides, both travel
modules agree), booking API against a fake Stripe (travel included), photo
quotes against a fake Claude API, Discord/email/database travel lines, admin
auth, generated prices in sync, titles and descriptions, GUESSES.md current.

`npm run score -- --round N`: the round's scorecard (0 to 100), including the
pages in headless Chrome at a real 360px. Generations are logged in
`docs/superpowers/evolution.md`.
