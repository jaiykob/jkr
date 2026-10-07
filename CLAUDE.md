# jkr: junk removal site (working notes for Claude)

A skeleton built from the Scoops Co. stack (`C:\Users\chris\scoopco`) on
2026-09-27: static pages, Vercel serverless API, Stripe, Supabase.
**Not live, no name, no domain yet.** Pages carry titles and placeholder
pictures only; the founder will write the copy.

Redesigned 2026-09-28: charcoal and hi-vis yellow, Bricolage Grotesque for
display type, and a "load builder" (tap items, the truck fills, the price is
live) as the homepage hero and quote step 1. Phone (925) 408-6053 and the six
city service area come from Scoops Co.

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
      road miles from a Gresham base. **Not built yet**: the code below still
      serves the six city area with no travel fee.
   2. Pages and site parts: shared chrome, a page for every town in the area,
      FAQ, privacy, terms, 404. Copy drafted from Scoops Co.
   3. Business docs and follow-up helpers, owner booking email.
   4. SEO tools.
   5. Blog, Spanish, commercial form, founding offer (off).
2. **Walkthrough** of the whole site with the founder.
3. **Photo first quote with an on site adjustment**: charge more when the job
   is bigger than the photos showed. Its own spec.

Progress: spec written; round 1 not started.

## Folder map

```
index.html             homepage
book/                  the booking flow
  quote.html             step 1: photos or taps fill the truck + one-time or monthly
                         step 2: ZIP + contact
  checkout.html          step 2: price, day, payment (Stripe)
  thanks.html            step 3: confirmation
jkr/index.html       admin dashboard, served at /jkr/
api/                   Vercel serverless functions
  create-booking.js      charges the card (authoritative price + ZIP check)
  photo-quote.js         customer photos → Claude counts the items → the truck
  stripe-webhook.js      after payment: database rows, email, Discord ping
  day-capacity.js        which days are full
  cron-visits.js         daily: next recurring jobs + reminders
  admin-data.js          dashboard data
  visit-update.js        dashboard job actions (start, done, skip)
  visit-photo.js         dashboard before/after photos
  _lib/                  shared: db, email, email templates, schedule math
css/ js/ fonts/ images/  design system, scripts, fonts, pictures
  js/load-builder.js     the truck: items → load size → price (home + quote)
  js/home.js, css/home.css  homepage only: scroll road, tilt cards, ZIP check
db/schema.sql          Supabase tables (apply once)
pricing.config.mjs     THE price table and service area
scripts/               build-pricing, tests, meta check
vercel.json            headers, daily cron
```

## How a booking flows

```
book/quote.html → book/checkout.html → POST /api/create-booking → Stripe
                                          one-time: PaymentIntent
                                          monthly:  subscription
Stripe → /api/stripe-webhook → Supabase rows + confirmation email + Discord
book/thanks.html shows the summary
```

Contact details travel in sessionStorage (`quoteContact`), never in the URL.
The webhook, not the checkout, writes customers/subscriptions/visits and sends
the confirmation. In the database a job is a `visit`.

## Pricing is generated: never hand-edit the copies

Edit **`pricing.config.mjs`** (rows = load sizes, columns = one-time haul and
monthly pickup), then run **`npm run build:pricing`**. It rewrites the blocks
between `BUILD:` markers in `api/create-booking.js` (authoritative),
`book/quote.html`, `book/checkout.html` and `index.html`. The server
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
`EMAIL_FROM`, `OPS_WEBHOOK_URL` (Discord), `ANTHROPIC_API_KEY` (photo quotes), `SITE_ORIGIN`, `CRON_SECRET`,
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

`npm test`: schedule math, booking API against a fake Stripe, photo quotes
against a fake Claude API, admin auth,
generated prices in sync, titles and descriptions.
