# jkr: junk removal site (working notes for Claude)

Built from the Scoops Co. stack (`C:\Users\chris\scoopco`): static pages,
Vercel serverless API, Stripe, Supabase. The business is **Haulmighty**. **Not live yet: no domain,
bookings closed.** Phone (925) 408-6053. Service area: the Portland metro,
Clark County, WA included, priced by travel zone.

## Working with the founder

- They are not a developer and think visually. Show, don't describe: run the
  site (`node` static server on localhost), open it in their browser,
  screenshot it. Show a change early, before building it all out.
- **Scoops Co. is the reference.** When in doubt about how something should
  look or flow (above all the booking flow), look at how Scoops Co. does it
  and match it in jkr's colors, adjusted only where junk removal really
  differs (sizes, photos, travel by ZIP, an arrival window).
- Their latest words beat anything written here. These notes describe the
  site; they are not design rules to defend.
- Keep process light: build, `npm test`, a quick check of customer wording
  and money logic, screenshots, merge and push. No specs, scorecards or
  review loops unless asked.
- On hold until they ask: CRM and KPI dashboard, the Sacramento metro.
- Pending: they think 22 to 24 road miles is the right max radius (zones go
  to 40 now); apply at the pricing review (`ZONES` in `pricing.config.mjs`,
  then delete the town files the build names).

## Guesses are red

The founder's rule: anything not yet known is guessed, shown red with an
asterisk (`class="guess"`, `css/guess.css`) and listed in `GUESSES.md`
(`npm run guesses`; `npm test` fails if stale). Whole tables are flagged in
`GUESS` in `pricing.config.mjs`; anything else gets a `GUESS*` comment.
Placeholders to replace: "example.com", `pk_test_REPLACE_ME`,
`G-XXXXXXXXXX`, `YOUR-PROJECT.supabase.co`, every `TODO`.

## Build and test

- `npm run build` regenerates everything generated (prices, town and service
  pages, Spanish, blog, shared header and footer, docs blocks, sitemap, share
  cards, image sizes, GUESSES.md). `npm test` runs the tests and every
  build's `--check`, so a hand edit to a generated file fails.
- Generated, never hand edit: the 40 town pages and `service-areas.html`
  (from `content/towns/*.md` + `index.html`), `portland/*.html` (from
  `content/services/portland/*.md`), `es/` except `es/faq.html`, `blog/`,
  `api/_lib/order-config.js` + `js/order-config.js`, `api/_lib/travel.js` +
  `js/travel.js`, `BUILD:` blocks in pages, `sitemap.xml`, `images/og/`.
- The Prices page (`prices.html`, menu "Prices") copies Novah's prices page:
  its prices are `BUILD:prices-*` blocks, its calculator (`js/prices.js`)
  reads the same order and travel modules as the booking.
- Homepage text changes: edit `index.html`, `npm run build`; new phrases need
  their Spanish in `i18n/es.json` (the build lists them).
- The header and footer come from `index.html` (build-chrome copies them).
- `scripts/lib/browser.mjs` drives headless Chrome for screenshots.
- `npm run score -- --round N` and `docs/superpowers/` are old history, not a gate.

## Prices: `pricing.config.mjs` only

Load sizes and prices, travel `ZONES` from `BASE` (Gresham, a guess),
`SCHEDULE` (days shown, 2 hour windows, caps; Pacific time), `POLICY`
(cancel hours, fees, `consentVersion`). Edit it, then `npm run build`. Server
and pages read prices only from the generated order module. Money is integer
cents. Price = load + the ZIP's travel fee; past the last zone is "call us"
(the page offers a price by email; the server refuses the booking).

## The booking (`book/quote.html`, `js/order.js`, `css/order.css`)

Copied from Scoops Co.'s flow (onboarding/waste.html, schedule-waste.html): one
centered column, a progress bar that fills and pulses, and at most 4 pages that
ask for something (founder 2026-10-13): Size, When (the day, then its times),
Contact information with the ZIP first (View quote), then Checkout (your price
and contact details with Edit, then the payment), then the booking page
(thanks.html). Back and Next under each page. Photo quotes: `api/photo-quote.js` has Claude
count items in up to 4 photos; the page picks the size; prices never come
from Claude.

```
book/quote.html → POST /api/create-booking (reprices; refuses a stale quote, a
   full window, a closed day, a ZIP outside the zones, no consent; all before
   Stripe) → PaymentIntent for the total, card saved → thanks.html
Stripe → /api/stripe-webhook (branches on the event's own metadata.kind) →
   Supabase customer + visit, emails, Discord
After the job: /jkr/ Finish → charge (with the customer's agreement) or refund
   the difference
```

- The page guards against a double charge (`lastPay`); keep that.
- Customer copy never says "you can say no": the crew checks the size and
  charges a bigger load only if the customer agrees.
- **Booking gates, all CLOSED until launch:** `BOOKINGS_OPEN_SERVER` in
  `api/create-booking.js`, the `BOOKINGS_OPEN` env var, `BOOKINGS_OPEN_CLIENT`
  in `book/quote.html`. Closed, Book saves a reservation lead, no card.
  `js/maintenance-banner.js` shows the "opening soon" banner while closed.

## Admin dashboard (`jkr/`, served at `/jkr/`)

Leads, schedule, bookings, job actions (On my way, Finish with the money
after the job, Cancel and refund, Customer said no). Auth is
`ADMIN_DASHBOARD_TOKEN` in the `x-admin-token` header only; never a
`?token=` URL. Photos live in a PRIVATE Supabase bucket `visit-photos`.

## Rules that protect money and data

- Branch, then merge to `main`.
- Fail soft on the database (never lose a booking); fail open on capacity.
- Never commit secrets (`.env*`, keys, `.vercel` are ignored).
- The site address lives in `api/_lib/site.js`; moving domains is
  `node scripts/set-domain.mjs <domain>`.
- Never invent reviews. Stock photos in `images/` are credited in
  `images/src/CREDITS.md`; swap in real job photos under the same names.

## Style

- Mobile first: text 16px or more, tap targets 48px or more, no sideways scroll.
- Copy: "we / us / our", plain words, no dashes as punctuation.
- Colors: black, yellow (#FFD23F, `--yellow`) and white (founder 2026-10-13); yellow
  fills buttons and marks things on black, never text on white.
- Look: Novah's design language (novah.fi, founder 2026-10-13): Google Sans
  (fonts/google-sans.woff2), black #0B0B0B and white with light grey bands, big
  tight headings, small spaced capitals over them, pill buttons
  with an arrow, big rounded photos. Tokens in css/site.css.
- Spanish is paused (founder 2026-10-13: "save that for later"): don't translate;
  a phrase with no Spanish stays in English and the build only warns.

## Setup before launch

Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BOOKINGS_OPEN`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`,
`OPS_WEBHOOK_URL`, `OPS_EMAIL`, `ANTHROPIC_API_KEY`, `SITE_ORIGIN`,
`CRON_SECRET`, `ADMIN_DASHBOARD_TOKEN`. Apply `db/schema.sql` in Supabase. Put
the publishable key in `book/quote.html` and the anon key in `js/leads.js`.
Full steps: `LAUNCH-DAY.md`; what is left: `npm run status`.
