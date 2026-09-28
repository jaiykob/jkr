# jkr: junk removal site (working notes for Claude)

A skeleton built from the Scoops Co. stack (`C:\Users\chris\scoopco`) on
2026-09-27: static pages, Vercel serverless API, Stripe, Supabase.
**Not live, no name, no domain yet.** Pages carry titles and placeholder
pictures only; the founder will write the copy.

Placeholders to replace: "Brand Name", "example.com", "(000) 000-0000",
`pk_test_REPLACE_ME`, `G-XXXXXXXXXX`, `YOUR-PROJECT.supabase.co`,
`images/placeholder.svg`, and every `TODO` (`grep -rn TODO`).

The founder is finishing a degree. Keep sessions focused and small.

## Folder map

```
index.html             homepage
book/                  the booking flow
  quote.html             step 1: load size, one-time or monthly, ZIP + contact
  checkout.html          step 2: price, day, payment (Stripe)
  thanks.html            step 3: confirmation
admin/index.html       admin dashboard, served at /admin/
api/                   Vercel serverless functions
  create-booking.js      charges the card (authoritative price + ZIP check)
  stripe-webhook.js      after payment: database rows, email, Discord ping
  day-capacity.js        which days are full
  cron-visits.js         daily: next recurring jobs + reminders
  admin-data.js          dashboard data
  visit-update.js        dashboard job actions (start, done, skip)
  visit-photo.js         dashboard before/after photos
  _lib/                  shared: db, email, email templates, schedule math
css/ js/ fonts/ images/  design system, scripts, fonts, pictures
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

Never hardcode a column index; derive it (`ONE_TIME_COL`, `BILLING_BY_COL`).
Adding a column means a matching `CADENCE` entry in `api/_lib/schedule.js`
(`npm test` fails if they disagree). Money is integer cents, printed with
`toFixed(2)`.

## The booking gates (all CLOSED until launch)

1. `BOOKINGS_OPEN_SERVER` in `api/create-booking.js`
2. `BOOKINGS_OPEN=true` env var in Vercel
3. `BOOKINGS_OPEN_CLIENT` in `book/checkout.html` (UI only)

Only live mode (`sk_live`) is gated. Emergency brake: flip #1 to `false`.

## Admin dashboard (`/admin/`)

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
`EMAIL_FROM`, `OPS_WEBHOOK_URL` (Discord), `SITE_ORIGIN`, `CRON_SECRET`,
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

`npm test`: schedule math, booking API against a fake Stripe, admin auth,
generated prices in sync, titles and descriptions.
