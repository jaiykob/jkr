# Launch day checklist

Everything between today and taking a real card, in order. Work it top to
bottom; tick a box with a commit. Carried over from Scoops Co.'s runbook and
rewritten for jkr (2026-10-07). Accounts and logins are in `ACCOUNTS.md`.

Nothing here is urgent until step 0 is decided: the site, booking flow,
dashboard, emails and alerts are built and tested, and all three booking
gates are closed.

## Step 0: decide the open questions (founder)

- [ ] **Name and domain.** Replace "Brand Name" and `example.com` everywhere
      (`grep -rn "Brand Name\|example.com"`): canonical tags, JSON-LD, the CORS
      list in `api/create-booking.js`, email templates, the town pages (rebuild).
- [ ] **The base point.** Set `BASE` in `pricing.config.mjs` to the real yard,
      then run `node scripts/measure-zips.mjs` and `npm run build`.
- [ ] **The radius and the zone fees.** Founder note: a max of 22 to 24 road
      miles, with every fee covering its drive. Set the last zone's
      `upToMiles` to 24 (or less) and the fees in `ZONES`, run `npm run build`,
      and delete the town files it names (about 19 of 40 at 24 miles). Set
      `GUESS.zones` and `GUESS.base` to false.
- [ ] **Prices.** Set `PRICE_TABLE`, set `GUESS.prices` to false, `npm run build`.
- [ ] **Washington.** Before taking a job in Clark County: a Washington
      business registration, how Washington sales tax applies to junk removal,
      and Clark County disposal rules. Until then, decide whether WA ZIPs stay
      bookable.
- [ ] **Insurance.** General liability before the first job.
- [ ] **Everything red.** Work through `GUESSES.md`: each guess is either
      confirmed (take the red off) or replaced.

## Step 1: Supabase (database and photos)

- [ ] Create the project. Put its URL in `js/leads.js` (replacing
      `YOUR-PROJECT.supabase.co`) with the anon key.
- [ ] Apply `db/schema.sql` in the SQL editor (it includes the `leads` table
      and the travel columns). `db/migrations/` is only for a database made
      from an older `db/schema.sql`.
- [ ] Create a **private** storage bucket named `visit-photos`.
- [ ] GitHub repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`, so the daily
      keep-alive (`.github/workflows/supabase-keepalive.yml`) starts pinging.

## Step 2: Stripe (money)

- [ ] One product, "Junk removal": its id is `STRIPE_PRODUCT_ID`.
- [ ] The publishable key into `book/checkout.html` (replacing `pk_test_REPLACE_ME`).
- [ ] The webhook endpoint at `https://www.<domain>/api/stripe-webhook`, on the
      host that does **not** redirect (Stripe does not follow redirects; an
      endpoint on a redirecting host fails every delivery silently). Events:
      `payment_intent.succeeded`, `payment_intent.payment_failed`,
      `invoice.payment_succeeded`, `invoice.payment_failed`,
      `customer.subscription.created`, `customer.subscription.deleted`.
      Its signing secret is `STRIPE_WEBHOOK_SECRET`.
- [ ] Bank account for payouts.

## Step 3: Email, alerts and photo quotes

- [ ] Resend: add the domain, put its DNS records at the registrar, then
      `RESEND_API_KEY` and `EMAIL_FROM` (an address on that domain).
- [ ] Discord: a channel webhook, `OPS_WEBHOOK_URL`.
- [ ] `OPS_EMAIL`: where the owner booking email goes (a second alert that
      works when Discord does not).
- [ ] Anthropic: an API key for photo quotes, `ANTHROPIC_API_KEY`. Without it
      the photo button falls back to tapping.

## Step 4: Vercel

- [ ] Import the repo; production deploys from `main`.
- [ ] Environment variables (Production): `STRIPE_SECRET_KEY`,
      `STRIPE_PRODUCT_ID`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`,
      `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`,
      `OPS_WEBHOOK_URL`, `OPS_EMAIL`, `ANTHROPIC_API_KEY`, `SITE_ORIGIN`
      (`https://www.<domain>`), `CRON_SECRET` and `ADMIN_DASHBOARD_TOKEN`
      (two long random strings). Leave `BOOKINGS_OPEN` unset for now.
- [ ] Domain: add `www.<domain>` as primary; the bare domain redirects to it.
- [ ] Move the site to it in one command: `node scripts/set-domain.mjs <domain>`
      (rewrites `api/_lib/site.js` and every page, then rebuilds). Commit, merge.
- [ ] `npm run status`: the live half checks the site, the www redirect, the
      API, the sitemap and the Resend DNS records.

## Step 5: placeholders

- [ ] `G-XXXXXXXXXX`: the GA4 measurement ID in `js/analytics.js` and the
      inline snippets in `book/quote.html`, `book/checkout.html` and
      `book/thanks.html`.
- [ ] `images/placeholder.svg`: real photos of real loads.
- [ ] Every `TODO` (`grep -rn TODO`).
- [ ] `npm test` and `npm run score -- --round 1` (and 2, 3) still pass.

## Step 6: a full run in Stripe test mode

With `sk_test` keys (the gates only block live mode):

- [ ] A one-time haul in the home zone, card 4242 4242 4242 4242.
- [ ] A one-time haul in a far zone: the travel line is on the quote,
      checkout, thanks page, email, Discord ping and dashboard.
- [ ] A monthly pickup, and a quarterly prepay.
- [ ] A photo quote with real photos.
- [ ] The owner email and the Discord ping both arrive.
- [ ] Mark the job done on `/jkr/`; the customer gets the "all done" email.

## Step 7: open (same sitting, in this order)

- [ ] `BOOKINGS_OPEN_SERVER = true` in `api/create-booking.js`, merge to `main`.
- [ ] `BOOKINGS_OPEN=true` in Vercel, redeploy.
- [ ] `BOOKINGS_OPEN_CLIENT = true` in `book/checkout.html`, merge.
- [ ] `SHOW = false` in `js/maintenance-banner.js`, merge.
- [ ] Live keys (`sk_live`, live publishable key, live webhook secret).
- [ ] One real booking on your own card, check every surface, refund it.
- [ ] **Emergency brake:** `BOOKINGS_OPEN_SERVER = false` and merge. It stands alone.

## After launch

- [ ] `node scripts/check-indexability.mjs` against the live site: every
      sitemap page answers 200, indexable, canonical to itself.
- [ ] Google Search Console: a Domain property verified by DNS (or
      `npm run gsc:token <token>` for a URL prefix property); submit the sitemap.
- [ ] `npm run indexnow` after every deploy that adds or changes pages (Bing,
      and so ChatGPT Search and Copilot).
- [ ] Prove the monthly interval: one real monthly pickup, check the first two charges.
- [ ] Google Business Profile (`marketing/gbp-optimization.md`).
- [ ] A review request after every job.
- [ ] Turn the follow-up helpers to `MODE: auto` after their two week ramp.
