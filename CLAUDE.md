# jkr: junk removal site (working notes for Claude)

A skeleton built from the Scoops Co. stack (`C:\Users\chris\scoopco`) on
2026-09-27: static pages, Vercel serverless API, Stripe, Supabase.
**Not live, no name, no domain yet.** Pages carry titles and placeholder
pictures only; the founder will write the copy.

Redesigned 2026-09-28: charcoal and hi-vis yellow, Bricolage Grotesque for
display type. Since round 6 (2026-10-11) there is no truck and no game, and
booking is one order page, paid when the customer books; since 2026-10-13 it
shows one entry per page (Size, Where, When, Name, Phone, Email, Address,
Pay) under a progress bar, the tap and number pages moving on by themselves,
the typed ones with Next. Since round 7
(2026-10-11, founder: "use loadup as inspo") the homepage follows LoadUp's
landing page layout in our colors: a cream hero with one big button and a
pile of junk drawn in blocks with a price ticket, the five size cards in a
charcoal band, four promises, a yellow price band, a metro map of every ZIP
we serve, FAQ cards, a dark closer and a column footer. Phone
(925) 408-6053 comes from Scoops Co. Since 2026-10-07 the service area is the
whole Portland metro (Clark County, WA included) with a travel fee by zone:
see Travel pricing.

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

1. **Import** of every Scoops Co. system in five rounds, each its own branch:
   travel pricing; pages (shared chrome, 40 towns, FAQ, legal, 404);
   business docs, follow-up helpers and the owner email; SEO tools; blog,
   Spanish, commercial form and founding offer (off).
2. **Walkthrough** of the whole site with the founder.
3. **Photo first quote with an on site adjustment**: charge more when the job
   is bigger than the photos showed. Its own spec.

How each round is built (founder, 2026-10-12: "remove all process that are
slowing down product development", "take whats good and leave the bad"):
a short plan only when the work is big; build directly (one build agent for
a big chunk at most); `npm test` green; ONE review at the end of the round,
aimed at customer facing copy and money or booking logic (where reviews
caught real problems), with one fix pass and no re-review loop; screenshots
for the founder; then merge and push. Dropped: competing plans, per round
specs and scorecards, re-scoring earlier rounds, a review per task,
re-reviews, generation logs. The old scorecards (`npm run score -- --round
N`, rounds 1 to 9) and `docs/superpowers/evolution.md` stay as history and
can be run by hand; they are not a gate.

Progress: **Part 1 is done** (rounds 1 to 5, 2026-10-07, each scored 100).
**Round 6 is done** (2026-10-11, scored 100, merged from `feat/order-flow` at
the end of its Task 11): the one page order flow, pay at booking, and the
truck, the Junk Toss game and the homepage's driving truck gone everywhere
(spec `docs/superpowers/specs/2026-10-10-order-flow-design.md`). It also
built the money half of Part 3: a different size charged or refunded after
the job. **Round 7 is done** (2026-10-11, scored 100, `feat/landing-page`):
the LoadUp style landing page above, and Disneyland's customer service in
junk removal words (`docs/service-standard.md`, the `complaint-reply`
helper; research `docs/superpowers/research/2026-10-11-disneyland-practices.md`,
founder: "check disney land customer service and seo practices and copy them
just dont copy the magical langiage"). Spec
`docs/superpowers/specs/2026-10-11-landing-page-design.md`. **Round 8 is
done** (2026-10-12, `feat/order-steps`): the order page one step per page with
a progress bar, 5 taps from a homepage card (founder picked "4 pages, 5 taps";
spec `docs/superpowers/specs/2026-10-12-order-steps-design.md`). **One entry
per page** (2026-10-13, `feat/one-question`; founder: "make sure the booking
flow takes one piece of info per page and have progress bar on top", "each
data entry needs to be spread out between pages to reduce cognitive fatigue",
"i just want minimal clicks", Scoops Co. "in the loosest way"): Book split
into Name, Phone, Email, Address and Pay, 8 pages in all; the Pay page reads
every answer back with a Change link each.

**Round 9 is done** (2026-10-13, `feat/seo-pass`; spec
`docs/superpowers/specs/2026-10-12-seo-pass-design.md`): eight Portland service
pages in `portland/` from `content/services/portland/*.md`, "Before we come"
(replaced the getting-ready post; a piano post keeps the blog at 12), the FAQ as
a help center by topic, menus that name tasks (Services, Prices, Where we go,
Before we come, Help) and a Services footer column, a breadcrumb on every page
below the homepage, and `scripts/check-seo-audit.mjs` in `npm test`.

**Photos done** (2026-10-13, `feat/photos`; founder: "good pictures like the
one from loadup that show people moving furniture in the right spots"): a crew
carrying furniture in the homepage and town page hero (the drawn pile is gone),
on the five size cards (homepage, order page, service pages) and in each service
page's header (`photo:` in its file). Founder's focus: the landing page, the
order flow and SEO. **On hold (founder, 2026-10-12: "we dont need kpi dashboard or
sacremneto build just yet hold off"):** CRM and KPIs
(`docs/superpowers/specs/2026-10-10-crm-kpis-design.md`) and the Sacramento
metro; build neither until the founder asks. Part 2, the
walkthrough with the founder, is still to come (add a reviews block once
there are real Google reviews; never invent one).

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
                       (faq.html is the help center: topics, then the questions by topic)
before-we-come.html    hand written checklist for a booked job (es/ twin; fees via data-policy spans)
content/services/portland/*.md   one plain text file per service (format: content/services/README.md;
                       ORDER lists them) → portland/<slug>.html, GENERATED by build-services
es/                    the Spanish site: index.html, <town>.html, service-areas.html and blog/
                       are GENERATED; es/faq.html is hand written (keep it in step with faq.html)
i18n/es.json           every phrase of index.html in Spanish (build-es stops on a missing one)
blog/                  GENERATED from content/blog/en/*.md (es/blog/ from content/blog/es/)
content/blog/en|es/    one plain text post per file, same slug in both languages
book/
  quote.html             THE order page, eight step pages, one entry each (#size #where
                         #when #name #phone #email #address #book): the last reads it back, then pays
  checkout.html          a redirect to quote.html (vercel.json answers first)
  thanks.html            confirmation (bookingSummary from sessionStorage)
  commercial.html        property managers, realtors, contractors (api/commercial-lead.js)
jkr/index.html         admin dashboard, served at /jkr/
api/                   Vercel serverless functions
  create-booking.js      the booking PaymentIntent (authoritative price, ZIP, window, consent)
  photo-quote.js         customer photos → Claude counts the items (the page picks the size)
  stripe-webhook.js      after payment: database rows, email, Discord ping
  day-capacity.js        which days and windows are full, per market (fails open)
  cron-visits.js         daily: next recurring jobs + reminders
  admin-data.js          dashboard data
  visit-update.js        dashboard job actions and the money after the job
  visit-photo.js         dashboard before/after photos
  _lib/                  shared: db, email, templates, schedule math, charge-alerts (payment
                         needed), order-config.js and travel.js (GENERATED, see Pricing)
css/ js/ fonts/ images/  design system, scripts, fonts, pictures
  js/order.js, css/order.css   the order page; js/photo-quote.js its photo picker
  js/order-config.js     GENERATED window.ORDER, the same file as api/_lib/order-config.js
  js/size-cards.js       the five size cards (order page: pick one; homepage: links)
  js/home.js, css/home.css  homepage only (LoadUp layout): the cards' and the hero ticket's travel
                         line, the ZIP check lighting its zone card and its map dot
  js/travel.js           GENERATED, the same file as api/_lib/travel.js
  css/guess.css          red with an asterisk: placeholder guesses
data/zip-miles.mjs     road miles from the base to every metro ZIP (measured once)
data/zip-points.mjs    each ZIP's center for the homepage map (measure-zips --points, no routing)
db/schema.sql          Supabase tables (apply once); db/migrations/ for older ones
pricing.config.mjs     THE price table, travel zones, SCHEDULE, POLICY and guess flags
GUESSES.md             every placeholder guess (GENERATED by npm run guesses)
scripts/               build-pricing, build-towns, build-es, build-blog, build-chrome, measure-zips, list-guesses, score, tests
  lib/browser.mjs        headless Chrome at a real 360px (score, screenshots)
  lib/fake-stripe.mjs    the fake Stripe the booking and money tests run against
  lib/twins.mjs          which pages have a Spanish twin, hreflang, the language switch
vercel.json            headers, daily cron, the checkout redirect
api/_lib/site.js       THE site address, name, phone and WhatsApp number (every generator and API reads it)
sitemap.xml robots.txt llms.txt   for search and AI engines (sitemap GENERATED)
images/og/             share cards, one per page (GENERATED by build-og-cards)
images/src/ images/photos/   drop real photos in src/; the build writes the sizes
                       stock photos for now (founder, 2026-10-12: like LoadUp's, people carrying
                       furniture): hero, size cards, service page headers; credited in
                       images/src/CREDITS.md; swap in real job photos under the same names
<key>.txt              the IndexNow key file (must stay deployed)
BUSINESS_PLAN.md LAUNCH-DAY.md ACCOUNTS.md PROGRESS.md PUNCHLIST.md   the business side;
                       prices, zones and towns in them are generated (build-docs)
marketing/             ad copy (no prices in ads), Facebook groups, Google profile
agent/skills/          follow-up helpers (draft only) + _shared/jkr-context.md; complaint-reply
                       drafts answers to unhappy customers (never sends)
docs/service-standard.md   how we treat customers (Disneyland's practice in our words): the
                       four priorities, at the door, the end of the job, when it goes wrong
.github/workflows/     Supabase keep-alive (secrets only; skips until set up)
```

## How a booking flows

```
book/quote.html → POST /api/create-booking → PaymentIntent for the quoted total
                  (setup_future_usage off_session) → confirmPayment → thanks.html
Stripe payment_intent.succeeded (own metadata.kind 'booking') → /api/stripe-webhook
       → Supabase customer + visit (paid), confirmation email, Discord, OPS_EMAIL
After the job: /jkr/ Finish → charge (kind 'difference') or refund the difference
```

The order page (English only) shows one entry per page (round 8, founder:
"minimize clicks at all costs"; 2026-10-13: "each data entry needs to be
spread out between pages"): Size, Where, When (day and arrival window: the
soonest day is picked already, so it is one tap), Name, Phone, Email,
Address (street, an optional unit and notes) and Book (the answers read back,
each with Change, then the agree box and pay), each with its hash, under a
sticky progress bar (phones: Back, the page's name, "Step N of 8" and eight
segments; from 900px the eight steps by name, done ones tappable), with a bar
fixed to the bottom on phones and a summary card on desktop. A page moves on
by itself where it can (a size tap, the fifth digit of a ZIP we serve, an
arrival time, the last digit of a phone number, each said first where it is
typed); Name, Email and Address have Next (Enter or Go too). Steps already
done are skipped (`?size=`, a ZIP kept in `quoteZip`, details kept in this
tab); the cursor waits in each page's box. A page slides in from the side it
is on (none with reduced motion). `#photos` opens the photo picker on Size.
Taps from a homepage card, typing everything, gates closed: card, time, three
Nexts, Reserve (6); open: plus the agree box and Book. With the gates closed, Book saves a
reservation lead (size, ZIP, day, window, contact) and no card form shows.
The server reprices (size plus travel) and refuses a stale quote, a closed
day, a full window, a ZIP outside the zones, or no consent (`consent.agreed`
and the current `POLICY.consentVersion`), all before any Stripe call. Contact
details stay in sessionStorage (`orderState`, `bookingSummary`), never in the
URL. The webhook, not the page, writes customers and visits (a job is a
`visit`) and sends the confirmation; it branches on the event object's own
`metadata.kind`, never the customer metadata.

Every Book makes a new PaymentIntent (the server stamps a fresh consent
time), so the page guards against a second charge itself: it keeps the last
PaymentIntent it tried (`lastPay` in `js/order.js`) and asks Stripe about it
before paying again; any change to the order forgets it. Customer facing copy
never says "you can say no" (founder, 2026-10-11): the rule is that the crew
checks the size and charges a bigger load only if the customer agrees, and
the refusal fee line prints only while `POLICY.refusalFee` is above $0.

## Travel pricing (2026-10-07)

The service area is every ZIP inside the travel zones: the Portland metro,
Clark County, WA included. Price = **load price + the zone's travel fee**.

- **`BASE`** in `pricing.config.mjs`: where miles are measured from (Gresham
  city center, a guess until the real yard is set).
- **`ZONES`**: rings of road miles with a fee each (0 to 10 free, then +$25,
  +$50, +$75 to 40 miles; all guesses). An edge belongs to the inner ring.
  Past the last ring is "call us": the order page offers a price by email and
  keeps the lead, and the server refuses the booking.
- **`ZONE_OVERRIDES`**: pin one ZIP to a zone by hand.
- **`data/zip-miles.mjs`**: road miles from `BASE` to each ZIP's center
  (GeoNames, OSRM), measured once by `node scripts/measure-zips.mjs`; re-run
  it only if `BASE` moves, then `--points` for the homepage map's ZIP centers
  (`data/zip-points.mjs`; the map centers itself on `BASE`). Place names are USPS city names (Tigard reads
  "Portland").
- **`npm run build:pricing`** writes `api/_lib/travel.js` and `js/travel.js`
  (byte identical; `travelFor(zip)` → zone, fee, miles, place, market, or
  null; `market` is `portland` until Sacramento, and window caps count per
  market). `npm test` proves both copies agree with the config for every ZIP.
- Until the page knows the ZIP the size cards say "+ travel"; the last ZIP
  typed anywhere is kept in sessionStorage (`quoteZip`). Travel is its own
  line on every surface (order page, thanks, email, Discord, dashboard) and
  rides in the PaymentIntent's metadata into `visits.travel_cents`.

## Pages are generated: `npm run build`

`npm run build` runs, in order: `build-pricing` (prices, the order and travel
modules, WhatsApp links, the hero's price ticket), `build-faq-jsonld`,
`build-towns` (the homepage's zone list, map, town chips and footer towns,
then every town page and the hub, each a copy of `index.html` or the
Spanish homepage with its CITY regions swapped), `build-es`, `build-blog`,
`build-chrome` (the homepage header and footer into the other hand written
pages), `build-docs` (the `BUILD:docs-*` blocks in the Markdown docs), the
sitemap, share cards and images, and `list-guesses`. `npm test` runs every
`--check`, so a hand edit to a generated page, or a homepage change not
rebuilt, fails.

- **Add a service:** write `content/services/portland/<slug>.md`, add the slug
  to `content/services/portland/ORDER`, run `npm run build`. It reaches the hub,
  the footer, every town page's "Jobs we do in" list and its own page; no prices
  typed (the build stops on one), no 8+ word sentence shared with another service
  or a town.
- **Breadcrumbs:** `scripts/lib/crumbs.mjs` writes the trail and its
  BreadcrumbList; builders call it, and `build-chrome` writes it into the hand
  written pages from its `CRUMBS` table (add a new hand written page there).
- **Add a town:** write `content/towns/<slug>.md`, run `npm run build`. Every
  ZIP must be in a zone; two towns may not share a sentence (`test-towns`).
- **Change the header or footer:** edit `index.html`, run `npm run build`.
- **Change homepage text:** edit `index.html`, run `npm run build`. If the
  text is new, the build stops and lists it: add its Spanish to
  `i18n/es.json` (numbers are `{0}` slots, so price changes need nothing).
- **Write a post:** `content/blog/en/<slug>.md` (title, description 100 to
  160 characters, summary, date, then the body; no prices typed in, link
  `/book/quote.html` and a town). Its Spanish is `content/blog/es/<slug>.md`.
- **Spanish for a town:** `lede_es:`, `## Local (es)`, `## FAQ (es)` in its
  file (content/towns/README.md). Spanish writes to the reader with tú; the
  order page stays English.
- `[[double brackets]]` in a town file print red with an asterisk (a guess).
- `js/maintenance-banner.js` (`SHOW = true` while bookings are closed; off
  the day they open) and `js/analytics.js` (`G-XXXXXXXXXX`) load on every
  public page.

## Pricing is generated: never hand-edit the copies

Edit **`pricing.config.mjs`** (rows = load sizes, columns = one-time haul and
monthly pickup; only the one time column is sold online), then run **`npm run
build:pricing`**. It rewrites the `BUILD:` blocks in `book/quote.html` and
`index.html` (size cards, tiers, JSON-LD), the `data-policy` spans in the
terms and FAQ pages, every `https://wa.me/` link (`WHATSAPP` in
`api/_lib/site.js`, a guess) and `ITEMS` in `api/photo-quote.js`, and writes
the order module and the two travel modules whole.

- **`SCHEDULE`** (guesses): days shown, `leadDays`, closed weekdays, the 2
  hour windows with a cap each, a daily cap; all Pacific time (Vercel runs
  in UTC). **`POLICY`** (guesses): cancel hours, late fee, refusal fee, and
  `consentVersion` (change it whenever the consent wording or rule changes).
- **The order module**, `api/_lib/order-config.js` and `js/order-config.js`
  (byte identical, `window.ORDER`): `SIZES` (one time prices), `ITEMS`,
  `SCHEDULE`, `POLICY` (cents), `GUESS`, and `sizeForUnits`, `totalFor`,
  `openDays`, `isBookable`, `windowStartMs`, `isLateCancel`. Server and pages
  read prices, windows and fees only from it.

**Photo quotes:** up to 4 photos from the order page; `api/photo-quote.js`
asks Claude (`claude-opus-5`, structured output limited to the `ITEMS` keys)
to count them, and the page picks the smallest size whose `fits` holds the
items' units (`ORDER.sizeForUnits`; past a full truck, call us) and says
"From your photos: 1/2 truck. Tap it to go on, or pick the size that looks right." Claude only
counts; prices never come from it. The photos are kept in the private
`visit-photos` bucket under `quotes/`, ride with the booking as
`metadata.photos` (the server keeps only paths it named, `QUOTE_PHOTO_RE`),
become `visit_photos` rows of kind `quote`, and show up in the Discord ping
and on the dashboard job. No `ANTHROPIC_API_KEY` → 503 and the page asks for
the closest size.

Never hardcode a column index; derive it (`ONE_TIME_COL`, `BILLING_BY_COL`).
Adding a column means a matching `CADENCE` entry in `api/_lib/schedule.js`
(`npm test` fails if they disagree). Money is integer cents, printed with
`toFixed(2)`.

## The booking gates (all CLOSED until launch)

1. `BOOKINGS_OPEN_SERVER` in `api/create-booking.js`
2. `BOOKINGS_OPEN=true` env var in Vercel
3. `BOOKINGS_OPEN_CLIENT` in `book/quote.html` (UI only: closed shows the
   reservation path)

Only live mode (`sk_live`) is gated (503). Emergency brake: flip #1 to `false`.

## Admin dashboard: `jkr/` (served at `/jkr/`)

Clients and leads, schedule, bookings, and job actions. An order flow job
has **On my way** (a text from the owner's phone), **Finish** (the final
size; the server prices it, the booked size at its quoted cents, travel as
stored, and charges a bigger difference to the saved card with the "customer
agreed" box or refunds a smaller one; a declined difference still completes
the job, with a hosted invoice and an alert; then the "all done" email),
**Cancel and refund** (in full before `POLICY.cancelHours`, less the late fee
after) and **Customer said no** (refund less the refusal fee). Money steps
are keyed per visit, ask in the page (never alert or confirm) and lock while
in flight. Older recurring visits keep Start, Mark done and Skip.

- **Auth is the `ADMIN_DASHBOARD_TOKEN` env var**, sent in the
  `x-admin-token` header only. Never add a `?token=` URL form (it leaks into
  history, Referer and logs; `npm test` checks it is refused).
- Photos need a PRIVATE Supabase storage bucket named `visit-photos`.

## Setup before launch

Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BOOKINGS_OPEN`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`,
`OPS_WEBHOOK_URL` (Discord), `OPS_EMAIL` (owner booking email),
`ANTHROPIC_API_KEY` (photo quotes), `SITE_ORIGIN`, `CRON_SECRET`,
`ADMIN_DASHBOARD_TOKEN` (a long random string).
Apply `db/schema.sql` in Supabase (it includes the `leads` table). Put the
publishable key in `book/quote.html` and the anon key in `js/leads.js`. The
Stripe webhook URL must use the host that does NOT redirect; its events and
its pinned API version (`2024-06-20`) are in `LAUNCH-DAY.md` step 2.

## Not carried over from Scoops Co.

The Gresham/Portland street lookup and the $0 booking path. (Round 5
brought over the founding member offer, off in `api/_lib/founding.js`;
the commercial form; Spanish; the blog.)

## Rules

- Branch, then merge to `main`.
- Fail-soft on the database (an error never loses a booking); fail-open on
  capacity.
- Secrets: `.gitignore` covers `.env*`, keys, `.vercel`. Never commit one.
- Mobile: text at least 16px, tap targets at least 48×48, no sideways scroll.
- Copy: "we / us / our", plain, no slang, **no dashes as punctuation**.

## SEO (round 4)

- **The site address lives in `api/_lib/site.js`.** Moving to the real
  domain is one command: `node scripts/set-domain.mjs brandhaul.com` (it
  keeps placeholder emails like you@example.com, then rebuilds). Never type
  the domain into a script; `npm run score -- --round 4` fails if one does.
- **Structured data is generated and checked.** Town and hub pages get a
  Service with a true price range and a FAQPage (`build-towns`); the homepage
  and FAQ page get FAQPage from their visible questions (`build-faq-jsonld`).
  `check-schema` fails on a price that is not a load plus a real fee, a place
  we do not serve, or a FAQ that does not match the page.
- `build-sitemap` (every indexable page, git dates), `check-indexability`
  (`--local` now; live once there is a domain), `build-og-cards` and
  `build-images` (both draw in headless Chrome: no image library).
- Founder commands: `npm run status` (what is left before launch),
  `npm run indexnow` (tell Bing after a deploy), `npm run gsc:token`.

## Tests

`npm test`: schedule math; travel zones (band edges, overrides, both modules
agree); the order module (`test-order-config`: copies agree, days and windows
in Pacific time across DST, late cancel); the booking API against a fake
Stripe (`test-booking`: refusals before any Stripe call, the PaymentIntent
that saves the card, the gate, idempotency); the money after the job
(`test-charge`: charge or refund, agreement, founding, a decline to an
invoice, cancel and refund, said no, never charged twice); the webhook
(`test-ops`: emails, Discord, rows, window counts, announced once, a
difference paid); the dashboard (`test-admin`: header only auth, the job
actions, money buttons that ask in the page, a safe `sms:` link); photo
quotes against a fake Claude API; founding (`test-founding`), commercial
(`test-commercial`), Spanish (`test-es`: phrases, twins, hreflang, the
switch), towns, SEO (`test-seo`); and every generated file current (each
build's `--check`, GUESSES.md, titles, the domain on one host, schema true,
FAQ JSON-LD, sitemap, indexability, share cards, photo sizes).

`npm run score -- --round N`: the round's scorecard (0 to 100), including the
pages in headless Chrome at a real 360px (round 8 walks every order step and
books from a homepage card in 5 taps or fewer, measured on the 4 page version
before one entry per page; round 7 also measures contrast and
the first screen; round 6 also at 1280px, and books
on the order page by script in 10 taps or fewer). History, not a gate since
2026-10-12 (see How each round is built); generations up to round 9 are in
`docs/superpowers/evolution.md`.
