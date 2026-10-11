# Accounts and dashboards

Every system the business runs on, where to log in, and what it is for.
Own every account with the business email (GUESS* hello@example.com until
there is a domain), not a personal one, and turn on two factor sign in
everywhere. Setting them up is `LAUNCH-DAY.md`.

## The stack

| System | Dashboard | What it does | Status |
| --- | --- | --- | --- |
| **Vercel** | vercel.com/dashboard | Hosts the site and every `/api` function; deploys on every merge to `main`. The environment variables live here. | not set up |
| **Supabase** | supabase.com/dashboard | The database (leads, customers, subscriptions, visits, photos) and the private `visit-photos` bucket. | not set up |
| **Stripe** | dashboard.stripe.com | Takes the money: the booking payment, the difference after the job, refunds, payouts. | not set up |
| **Resend** | resend.com | Sends the customer emails and the owner booking email. | not set up |
| **Discord** | your server, Integrations, Webhooks | The booking ping, with photos and a link to the dashboard. | not set up |
| **Anthropic** | console.anthropic.com | Counts the items in quote photos (Claude). | not set up |
| **Google Analytics** | analytics.google.com | Visits and quote steps (`G-XXXXXXXXXX` until set). | not set up |
| **Google Business Profile** | business.google.com | The listing in Maps and local search; reviews. | not set up |
| **GitHub** | this repo | The code; runs the Supabase keep-alive every day. | live |
| **Domain registrar** | GUESS* not bought yet | DNS for the site and Resend's email records. | not set up |

## Your dashboards

| Dashboard | Where | Shows you |
| --- | --- | --- |
| **The jkr dashboard** | `https://www.<domain>/jkr/` | Clients, leads, schedule, bookings with travel zones, and job actions (start, photos, done, skip). Log in with `ADMIN_DASHBOARD_TOKEN`; the page asks for it and keeps it for the tab. There is no `?token=` link, on purpose. |
| **Stripe** | dashboard.stripe.com | Charges, failed payments, refunds, payouts. |
| **Discord** | your server | A ping per booking or failed payment. |
| **Your inbox** | `OPS_EMAIL` | The owner booking email, a second alert beside Discord. |

## The environment variables (Vercel, Production)

| Variable | What it is |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_` while testing, `sk_live_` at launch |
| `STRIPE_PRODUCT_ID` | the one "Junk removal" product (nothing reads it since round 6: a booking is a plain payment) |
| `STRIPE_WEBHOOK_SECRET` | the signing secret of the webhook endpoint |
| `BOOKINGS_OPEN` | `true` only on launch day (gate 2 of 3) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | the database, server side only |
| `RESEND_API_KEY`, `EMAIL_FROM` | email; without the key every send dry runs |
| `OPS_WEBHOOK_URL` | the Discord webhook |
| `OPS_EMAIL` | where the owner booking email goes |
| `ANTHROPIC_API_KEY` | photo quotes; without it the page asks for the closest size |
| `SITE_ORIGIN` | `https://www.<domain>`, for links in emails and pings |
| `CRON_SECRET` | protects the daily job route |
| `ADMIN_DASHBOARD_TOKEN` | the dashboard password: a long random string |

GitHub repository secrets: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the
keep-alive).

## Money

| | Where |
| --- | --- |
| Payouts | Stripe, to the business bank account (GUESS* not opened yet) |
| Card fees | about 2.9% plus 30 cents a charge (Stripe standard pricing) |
| Disposal fees | paid at the transfer station per load (GUESS* card on file at Metro) |
