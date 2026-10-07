# Bring the Scoops Co. systems over to jkr, metro wide with travel pricing

Date: 2026-10-07. Status: approved in chat as a starting point ("good for now
will change later"), awaiting review of this file.

## What the founder asked for

> "import all systems over from scoops co, all business systems copy and design
> and then we are going to go thru everything and go from there. i really want
> automatic quote estimator tool where you send picture you get quote and then
> you book, with the caveat of charging more if job is under represented"

> "for service area its going to be entire portland metro and the distance
> needs to be calculated in job price base is in gresham make sure this
> calculus is considered across entire system"

That is three parts, done in this order:

1. **Import** (this spec): travel pricing across the Portland metro, then every
   Scoops Co. system, rewritten for junk removal.
2. **Walkthrough**: go through the whole site together, page by page.
3. **Photo first quote with an on site adjustment**: photo, price, book; if the
   job turns out bigger than the photos showed, the price goes up. Its own spec,
   with its own questions (when and how the extra is charged, what the customer
   agrees to at checkout).

## Decisions (founder answers, 2026-10-07)

| Question | Answer |
| --- | --- |
| "Design" means | **Keep the jkr look** (charcoal, hi-vis yellow, Bricolage Grotesque, load builder). Bring over Scoops Co.'s pages and parts, restyled to match. |
| Copy | **Draft it from Scoops Co.** Real sentences on every page in the same voice, for the founder to edit. Supersedes the 2026-09-27 "titles only" rule. |
| Scope | **All four groups**: pages and site parts; business docs and follow-up; SEO tools; blog, Spanish and extras. |
| How pages are built | **Port the Scoops Co. builders.** Header, footer, prices and homepage sections are written once; city and Spanish pages are generated; tests fail on drift. |
| Service area | **The whole Portland metro, Washington side included** (Clark County: Vancouver, Camas, Washougal, Battle Ground, Ridgefield). |
| Distance into money | **Zones**: rings of road miles around a base in Gresham, a flat travel charge per ring. |
| What sets the zone | **The customer's ZIP**, measured once to the ZIP's center and kept in a table the founder can edit. |
| City pages | **Every town in the area** (about 30 to 35, the exact list being the towns inside the zones), in English and Spanish. |

## Assumptions (not stated by the founder; correct any of these)

- Still no name or domain: "Brand Name", "example.com" and the other
  placeholders in CLAUDE.md stay, and every new page uses them.
- Phone (925) 408-6053 stays.
- The base point is Gresham city center until the founder sets the real yard
  address (`TODO`).
- Zone bands and amounts are placeholders (`TODO`): 0 to 10 road miles $0,
  10 to 20 +$25, 20 to 30 +$50, 30 to 40 +$75, beyond that "call us".
- Copy voice is the CLAUDE.md voice: we / us / our, plain, no slang, no dashes
  as punctuation, text at least 16px.
- Facts that cannot be checked from here (market size, competitor prices, dump
  and transfer station fees, local disposal rules, Washington licensing and
  tax) are written as `TODO`, never invented.
- The follow-up helpers keep the Scoops Co. safety default: they draft messages
  for the founder to approve and send nothing on their own.
- The quote and checkout pages stay English only and keep their slim header
  (no menu between the quote and the payment), as on Scoops Co.

## Still left out

| Scoops Co. piece | Why |
| --- | --- |
| Portland street lookup (`service-address.js`, `check-address`) | The zone comes from the ZIP alone; no street check. |
| $0 booking path | Nothing in junk removal is free. |
| `yard-cleanup.html` and anything about dogs | Dog specific. Junk service pages (garage cleanouts and so on) can come up in the walkthrough. |
| Scoops Co.'s `plans/` and `review/` folders | Records of Scoops Co.'s own audits, not systems. |
| Grouping a day's jobs by area | Walkthrough item. Until then a day has a job limit, as today. |

## The five rounds

Each round is its own branch, merged to `main` only after `npm test` passes and
the founder has looked at it in the browser. Rounds can be separate sessions.
Each round gets its own step by step implementation plan, written when that
round starts, so later plans can take in what changed during the earlier ones.

### Round 1: service area and travel pricing

Everything about distance lives in `pricing.config.mjs`, generated into the
other copies by `npm run build:pricing` like the price table is today.

- **`BASE`**: the base point (latitude, longitude, label). Gresham city center
  for now, `TODO`.
- **`ZONES`**: ordered rings, each `{ key, label, upToMiles, fee }` in road
  miles and dollars. Beyond the last ring is "call us".
- **`data/zip-miles.json`**: every ZIP near the metro with its place name,
  state and road miles from `BASE`. Written once by
  `scripts/measure-zips.mjs` from the Census ZIP centers (ZCTA gazetteer) and
  road miles from a routing service, then committed. No map service is called
  at booking time; the script only runs again if `BASE` moves.
- **`ZIP_ZONES`** (derived in `pricing.config.mjs`): each ZIP's zone comes from
  its miles and the `ZONES` bands, so changing a band re-zones every ZIP at
  once. **`ZONE_OVERRIDES`** (`{ '97229': 'z3' }`) lets the founder pin any
  ZIP to a zone by hand, and wins over the miles. ZIPs past the last band are
  out of the area. Replaces `SERVICE_AREA`'s six city list; `ALL_ZIPS`
  becomes the ZIPs in `ZIP_ZONES`.
- **The price per visit is the load price plus the zone's travel fee.** Monthly
  pickups pay travel on every visit; the quarterly prepay (13 weeks, 10% off)
  is figured on that whole per-visit price. Money stays integer cents.
- **Shown as its own line** ("Travel, Zone 2: +$25") on the quote, checkout and
  thanks pages, in the confirmation and reminder emails, in Stripe metadata
  (`zip`, `zone`, `travel_cents`, `miles`), in the Discord ping and on the
  dashboard job.
- **The load builder** shows "$349 + travel" until a ZIP is known; with one it
  shows the full price. The homepage ZIP check answers with the zone and fee.
  "Starting at" stays the cheapest load in the home zone.
- **`api/create-booking.js` stays the authority**: it takes the ZIP from the
  address, looks up the zone in its generated copy of `ZIP_ZONES`, recomputes
  load plus travel and refuses a mismatch ("Quote is out of date") or a ZIP
  outside the zones.
- **Too far**: a ZIP outside the zones gets a "call us" message on the quote
  page and is still saved as a lead.
- **`api/photo-quote.js`**: the prompt says Portland metro instead of Gresham.
- **Copy and docs** say "Portland metro, based in Gresham"; CLAUDE.md gets a
  travel pricing section.
- **Tests**: every ZIP has exactly one zone and a fee; zone math at the band
  edges; the server refuses a wrong travel amount and an out of area ZIP;
  subscriptions and the quarterly prepay include travel; the generated copies
  match the config (`check:pricing`). The booking gates stay closed.

### Round 2: pages and site parts

- **Shared chrome** (`scripts/build-chrome.mjs`): the homepage's `<nav>`,
  `<footer>` and a sticky "Get a price" button are copied into every page
  between `BUILD:site-header`, `BUILD:site-footer`, `BUILD:site-sticky`
  markers, links re-pointed for the page's folder. `book/` pages are left out
  on purpose.
- **City pages** (`scripts/build-home-layout.mjs`): one page per town inside
  the zones (Portland, Gresham, Beaverton, Hillsboro, Tigard, Lake Oswego,
  Tualatin, West Linn, Oregon City, Milwaukie, Happy Valley, Clackamas,
  Troutdale, Fairview, Wood Village, Boring, Damascus, Sandy, Vancouver,
  Camas and the rest), plus the hub `service-areas.html`. The founder confirms
  the list before copy is written. Each is the homepage with its own
  `CITY:head`, `CITY:hero`, `CITY:local` and `CITY:faq` blocks; the local block
  is real local copy (the doorway page defence) and shows the travel charge
  for the town's ZIPs (a range when a town spans two zones, as Portland
  does), generated from `ZIP_ZONES` so it can't drift. The load
  builder, junk toss and ZIP check must work on these pages.
- **Standalone pages** on `css/site.css`: `faq.html`, `privacy.html`,
  `terms.html`, `404.html`. The FAQ and terms explain travel zones and carry a
  draft line for the adjustment rule ("if there is more than your photos
  showed, we show you the new price before we load anything"); part 3 makes it
  binding.
- **Analytics** (`js/analytics.js`, `G-XXXXXXXXXX`) and the **maintenance
  banner** (`js/maintenance-banner.js`).
- Homepage nav, footer and FAQ link to the new pages; the area section shows
  the zones.
- `npm test` gains `build-chrome --check` and `build-home-layout --check`;
  `check-meta` covers every new page.

### Round 3: business docs and follow-up

- `BUSINESS_PLAN.md`, `LAUNCH-DAY.md`, `ACCOUNTS.md`, `PROGRESS.md`,
  `PUNCHLIST.md`: rewritten for metro junk removal with travel zones. The
  launch checklist includes the Washington `TODO` (registration, tax, dump
  rules) and setting the real base point and zone amounts.
- `marketing/`: flyer and door hanger, Facebook group posts, short ads,
  `facebook-groups.md`, `gbp-optimization.md`.
- `agent/skills/`: `_shared/jkr-context.md`, `speed-to-lead`,
  `quote-followup`, `review-request`, `lead-research-briefing`, rewritten for
  the jkr `leads` table, load sizes, travel zones and booking URLs. Draft mode
  by default.
- **Owner booking email** (new; Scoops Co. listed it but never built it): the
  webhook emails the founder (`OPS_EMAIL`) alongside the Discord ping, so the
  two alerts fail independently. Covered by a test.
- `.github/workflows/supabase-keepalive.yml`.

### Round 4: SEO tools

- `build-sitemap` (lastmod from git), `build-regions` (LocalBusiness and
  service area JSON-LD, now metro wide with the Washington side),
  `build-faq-jsonld`, `check-schema`, `check-indexability`, `build-og-cards`
  (share cards), `set-canonical-host`, `status`, `indexnow`, `set-gsc-token`,
  `robots.txt`, `llms.txt`.
- `build-images` and `build-photos`, so real photos can replace
  `images/placeholder.svg` later.
- All on `example.com`; swapping the domain is one command.
- `npm run build:seo` runs every builder; `npm test` runs every `--check`.

### Round 5: blog, Spanish, extras

- **Blog**: `blog/index.html` and 12 new junk removal posts (cost in the
  Portland metro, what haulers cannot take, mattress disposal, fridge and
  appliance disposal, where hauled junk goes, getting ready for a pickup,
  garage cleanouts, estate cleanouts, yard debris, junk removal or a dumpster,
  choosing a junk removal company, a property manager post). Local disposal
  facts are `TODO`.
- **Spanish**: `es/index.html`, every `es/` city page, `es/service-areas.html`,
  `es/faq.html`, `es/blog/`, translated through `i18n/home.es.json` (the build
  lists any English phrase without Spanish). Spanish addresses the reader with
  "tú". `js/load-builder.js` and `js/junk-toss.js` take their words from
  `<html lang>`.
- **Commercial request form**: `book/commercial.html` and
  `api/commercial-lead.js` (property managers, realtors, contractors), emailing
  `OPS_EMAIL` and writing a lead. Tested.
- **Founding member offer**: `api/_lib/founding.js`, `api/founding-spots.js`,
  `js/founding.js`, wired into checkout (taken off the whole per-visit price,
  travel included), **switched off** (`open: false`) as on Scoops Co. Tested.

## Testing

- Every round: `npm test` passes, including the new `--check` scripts, then the
  pages are opened in a browser at 360px and desktop width (no sideways
  scroll, tap targets at least 48px, the load builder works).
- Round 1 is the only round that changes pricing. `npm run check:pricing` must
  pass after it and after any later round that touches a generated block. The
  booking gates stay closed throughout.

## Risks

- **Travel is wrong at the edges.** A ZIP's center can sit in one zone while a
  street at its edge belongs in the next. The founder can move any ZIP by hand;
  part 3's on site adjustment is the backstop.
- **Copy volume.** Roughly 30 to 35 city pages plus the standalone pages and 12
  posts, doubled by Spanish. The phrase list keeps Spanish in step, but every
  English edit means Spanish work.
- **Homepage weight.** City pages copy the homepage, scripts and all, and the
  ZIP table rides along in the load builder. Keep the homepage budget in mind.
- **Washington.** Taking jobs in Clark County before the registration, tax and
  dump rules are checked. The launch checklist carries it.
- **Wrong facts.** Drafted copy can sound sure about things that are not
  checked. Every unchecked fact is a `TODO` so `grep -rn TODO` finds it.
