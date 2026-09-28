# Junk removal: working notes for Claude

A skeleton built on 2026-09-27 from the Scoops Co. stack
(`C:\Users\chris\scoopco`): static pages + Vercel serverless API + Stripe +
Supabase. The booking flow is Scoops Co.'s, file for file, with dogs replaced
by load size. **Not live, no name, no domain yet.** Placeholders: "Brand Name",
"example.com", "(000) 000-0000", `pk_test_REPLACE_ME`, `G-XXXXXXXXXX`,
`YOUR-PROJECT.supabase.co`, and every `TODO` (`grep -rn TODO`).

The founder is finishing a degree. Keep sessions focused and small.

## Flow map (same shape as Scoops Co.)

```
index.html → onboarding/junk.html        → onboarding/schedule-junk.html      → onboarding/thanks.html
             (3 steps: load size,          (quote summary, day picker,
              one-time or recurring,        "Continue to payment" → Stripe)
              ZIP + contact → "View quote")
                                                  ↓
                                   POST /api/create-subscription
                                     ↓                      ↓
                          one-time PaymentIntent     recurring subscription
                                                  ↓
                                   Stripe → /api/stripe-webhook
                                                  ↓
                          Supabase spine + confirmation email + Discord ping
```

Contact details travel in sessionStorage (`quoteContact`), never in the URL.
The webhook, not the checkout, writes customers/subscriptions/visits and sends
the confirmation. `/api/cron-visits` (daily) schedules recurring visits and
sends reminders. `/api/day-capacity` greys out full days (`DAILY_CAP`).

## Pricing is generated — never hand-edit the copies

Edit **`pricing.config.mjs`** (rows = load sizes, columns = one-time haul /
monthly pickup, integer cents after rounding), then run
**`npm run build:pricing`**. It rewrites the blocks between `BUILD:` markers in
`api/create-subscription.js` (authoritative), `onboarding/junk.html`,
`onboarding/schedule-junk.html` and `index.html`. The server recomputes every
booking and refuses one that doesn't match ("Quote is out of date").

Never hardcode a column index; derive it (`ONE_TIME_COL`, `BILLING_BY_COL`).
Adding a column means a matching `CADENCE` entry in `api/_lib/schedule.js`
(`npm test` fails if they disagree).

## The booking gates (all CLOSED until launch)

1. `BOOKINGS_OPEN_SERVER` in `api/create-subscription.js`
2. `BOOKINGS_OPEN=true` env var in Vercel
3. `BOOKINGS_OPEN_CLIENT` in `onboarding/schedule-junk.html` (UI only)

Only live mode (`sk_live`) is gated. Emergency brake: flip #1 to `false`.

## Deliberately not carried over from Scoops Co.

- Founding-member offer (server half). The checkout math is still there,
  dormant (`foundingOffer` stays null).
- Gresham/Portland shared-ZIP street lookup (`service-address.js`).
- $0 free-booking path, commercial intake form, Spanish build,
  generated header/footer, city pages, blog, sitemap.

## Admin dashboard: `jkr.html`

Copied from Scoops Co.'s `admin.html`: clients and leads, schedule, bookings,
and job actions (start, before and after photos, mark done, skip). Marking a
job done emails the customer the "all done" note with the photos and queues
the next recurring pickup. APIs: `/api/admin-data`, `/api/visit-update`,
`/api/visit-photo`. Every Discord booking alert links to it.

- **Auth is the `ADMIN_DASHBOARD_TOKEN` env var**, sent in the
  `x-admin-token` header only. Never add a `?token=` URL form (it leaks into
  history, Referer and logs; `npm test` checks it is refused).
- The file name keeps it out of sight; the token is what keeps it locked.
- Photos need a PRIVATE Supabase storage bucket named `visit-photos`.

## Setup before launch

Env vars: `STRIPE_SECRET_KEY`, `STRIPE_PRODUCT_ID`, `STRIPE_WEBHOOK_SECRET`,
`BOOKINGS_OPEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`EMAIL_FROM`, `OPS_WEBHOOK_URL` (Discord), `SITE_ORIGIN`, `CRON_SECRET`,
`ADMIN_DASHBOARD_TOKEN` (a long random string).
Apply `db/schema.sql` in Supabase (it includes the `leads` table). Put the
publishable key in `schedule-junk.html` and the anon key in `js/leads.js`.
The Stripe webhook URL must use the host that does NOT redirect.

## Rules carried over

- Branch, then merge to `main`, once this deploys from `main`.
- Money is integer cents, printed with `toFixed(2)`.
- Fail-soft on the spine (a db or email error never loses a booking);
  fail-open on capacity.
- Secrets: `.gitignore` covers `.env*`, keys, `.vercel`. Never commit one.
- Mobile: text at least 16px, tap targets at least 48×48, no sideways scroll.
- Copy: "we / us / our", plain, no slang, **no dashes as punctuation**.

## Tests

`npm test`: schedule math, booking API against a fake Stripe (validation,
price cross-check, ZIP gate, closed live gate, both payment paths), generated
price blocks in sync, titles and descriptions.
