# Launch day checklist

Everything between today and taking a real card, in order. Work it top to
bottom; tick a box with a commit. Carried over from Scoops Co.'s runbook and
rewritten for jkr (2026-10-07; the order flow and pay at booking 2026-10-11).
Accounts and logins are in `ACCOUNTS.md`.

Nothing here is urgent until step 0 is decided: the site, the order page,
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
- [ ] **Hours and the cancel rules.** `SCHEDULE` in `pricing.config.mjs` (days
      shown, the earliest day, closed days, the 2 hour windows and their caps,
      the daily cap) and `POLICY` (cancel hours, late fee, refusal fee). Set
      `GUESS.schedule` and `GUESS.policy` to false, `npm run build`.
- [ ] **The consent wording and the terms.** Stripe asks for the customer's
      consent before a saved card is charged later. Read and approve, word
      for word, the box on `book/quote.html`: "I agree to the terms, and to
      this card being charged or refunded the difference if the crew finds a
      different size." and the rule above it: "You pay (the total) now.
      Before loading, the crew checks the size. If your load is bigger, we
      show you the new price first and charge the difference to this card
      only if you agree. If it is smaller, we refund the difference. Free to
      move your day, or to cancel with a full refund, until 24 hours before
      your arrival window. After that, a cancel keeps the $50.00 late fee and
      we refund the rest." If you set a refusal fee above $0, one more line
      shows: "If you decide not to go ahead once the crew is there, we keep a
      (fee) refusal fee and refund the rest." We suggest a box that also
      says the card is kept on file: "I agree to the terms, and to my card
      being kept on file to charge or refund the difference if the crew finds
      a different size." Then read `terms.html` (and set its "Last updated"
      date). If you change the wording or the rule, set a new
      `POLICY.consentVersion` and `npm run build`: every booking records the
      version it agreed to.
- [ ] **Washington.** Before taking a job in Clark County: a Washington
      business registration, how Washington sales tax applies to junk removal,
      and Clark County disposal rules. Until then, decide whether WA ZIPs stay
      bookable.
- [ ] **Insurance.** General liability before the first job.
- [ ] **Everything red.** Work through `GUESSES.md`: each guess is either
      confirmed (take the red off) or replaced. The WhatsApp number is one:
      `WHATSAPP` in `api/_lib/site.js` (the business phone until you name one).

## Step 1: Supabase (database and photos)

- [ ] Create the project. Put its URL in `js/leads.js` (replacing
      `YOUR-PROJECT.supabase.co`) with the anon key.
- [ ] Apply `db/schema.sql` in the SQL editor (it includes the `leads` table,
      the travel columns and the order flow columns: window, quote, payment,
      consent). A database made from an older `db/schema.sql` also needs
      `db/migrations/2026-10-10-order-flow.sql` (safe to run twice).
- [ ] Create a **private** storage bucket named `visit-photos`.
- [ ] GitHub repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`, so the daily
      keep-alive (`.github/workflows/supabase-keepalive.yml`) starts pinging.

## Step 2: Stripe (money)

The customer pays the quoted total when booking and the card is saved; after
the job a bigger size is charged the difference and a smaller one refunded.

- [ ] The publishable key into `book/quote.html` (replacing `pk_test_REPLACE_ME`).
- [ ] The webhook endpoint at `https://www.<domain>/api/stripe-webhook`, on the
      host that does **not** redirect (Stripe does not follow redirects; an
      endpoint on a redirecting host fails every delivery silently). Its
      signing secret is `STRIPE_WEBHOOK_SECRET`. Events:
      - `payment_intent.succeeded`: the booking payment (`metadata.kind`
        `booking`) books the job; a `difference` payment marks it paid.
      - `payment_intent.payment_failed`: a declined card at booking, or a
        declined difference after the job.
      - `invoice.paid`: the hosted invoice for a declined difference.

      Not `setup_intent.succeeded`: nothing books on it. The code still reads
      the old monthly events (`invoice.payment_succeeded`,
      `invoice.payment_failed`, `customer.subscription.created`,
      `customer.subscription.deleted`); nothing creates a subscription now, so
      add them only if monthly pickups come back to the site.
- [ ] **Pin the endpoint's API version to `2024-06-20`**, the version the code
      uses (`apiVersion` in `api/stripe-webhook.js`). Events arrive in the
      endpoint's version; a newer one moves `invoice.payment_intent` and the
      PaymentIntent's `invoice`, and a paid invoice would silently stop
      marking the job paid.
- [ ] **Payment methods** (Settings, Payment methods): cards, Apple Pay and
      Google Pay on. Every delayed method OFF: ACH and other bank debits, and
      anything else that settles days later. The webhook books a job only when
      the payment succeeds, but the order page says "paid" while a payment is
      still processing, so a bank debit would show a booking that never gets
      made.
- [ ] Settings, Payment method domains: add `www.<domain>` (and the preview
      host for step 6). Apple Pay does not show on a domain Stripe does not know.
- [ ] `STRIPE_PRODUCT_ID` (one product, "Junk removal") is optional now:
      nothing reads it since the booking became a plain payment. Make it only
      if monthly pickups come back.
- [ ] Bank account for payouts.

## Step 3: Email, alerts and photo quotes

- [ ] Resend: add the domain, put its DNS records at the registrar, then
      `RESEND_API_KEY` and `EMAIL_FROM` (an address on that domain).
- [ ] Discord: a channel webhook, `OPS_WEBHOOK_URL`.
- [ ] `OPS_EMAIL`: where the owner booking email goes (a second alert that
      works when Discord does not).
- [ ] Anthropic: an API key for photo quotes, `ANTHROPIC_API_KEY`. Without it
      the photo button asks the customer to pick the closest size.

## Step 4: Vercel

- [ ] Import the repo; production deploys from `main`.
- [ ] Environment variables (Production): `STRIPE_SECRET_KEY`,
      `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `RESEND_API_KEY`, `EMAIL_FROM`, `OPS_WEBHOOK_URL`, `OPS_EMAIL`,
      `ANTHROPIC_API_KEY`, `SITE_ORIGIN` (`https://www.<domain>`),
      `CRON_SECRET` and `ADMIN_DASHBOARD_TOKEN` (two long random strings).
      Leave `BOOKINGS_OPEN` unset for now.
- [ ] Domain: add `www.<domain>` as primary; the bare domain redirects to it.
- [ ] Move the site to it in one command: `node scripts/set-domain.mjs <domain>`
      (rewrites `api/_lib/site.js` and every page, then rebuilds). Commit, merge.
- [ ] `npm run status`: the live half checks the site, the www redirect, the
      API, the sitemap and the Resend DNS records.

## Step 5: placeholders

- [ ] `G-XXXXXXXXXX`: the GA4 measurement ID in `js/analytics.js` and the
      inline snippets in `book/quote.html` and `book/thanks.html`.
- [ ] `images/placeholder.svg`: real photos of real loads (the five size cards
      read `photo` in `LOADS`).
- [ ] Every `TODO` (`grep -rn TODO`).
- [ ] `npm test` and `npm run score -- --round N` for rounds 1 to 6 still pass.

## Step 6: a full run in Stripe test mode

With `sk_test` keys (the server gates only block live mode). The card form
shows only with gate 3 open, so run this on a preview deploy of a branch with
`BOOKINGS_OPEN_CLIENT = true`; do not merge it before step 7.

- [ ] A booking in the home zone, card 4242 4242 4242 4242: the thanks page,
      the confirmation email (paid today, the day and window), the Discord
      ping and the owner email, each once; the job on `/jkr/` shows its day,
      window and paid.
- [ ] A booking in a far zone: the travel line on the order page, thanks page,
      email, Discord ping and dashboard.
- [ ] Apple Pay or Google Pay on a real phone: the booking goes through, and
      the payment in Stripe carries the name, email and phone from the
      contact step (the page passes them as billing details at confirm).
- [ ] A card that asks the bank (4000 0025 0000 3155): the bank's page, then
      the thanks page with the summary.
- [ ] A declined card (4000 0000 0000 0002): the page says so, nothing is
      booked, and Discord shows the decline.
- [ ] Finish on `/jkr/` with the same size: no charge; the "all done" email.
- [ ] Finish with a bigger size and the "customer agreed" box: the difference
      is charged to the saved card; the receipt shows paid, adjusted and final.
- [ ] Finish with a bigger size on a booking made with 4000 0027 6000 3184
      (it asks the bank every time, so the charge after the job fails): the
      job still completes, the visit shows payment needed, the customer gets
      an invoice link, Discord and the owner email say so. Pay the invoice:
      the visit turns paid.
- [ ] Finish with a smaller size: the difference is refunded on the booking
      payment.
- [ ] Cancel and refund more than 24 hours before the window: a full refund.
      Inside the 24 hours: the late fee kept, the rest refunded.
- [ ] Customer said no: a refund less the refusal fee.
- [ ] On my way: a text to the customer opens on your phone.
- [ ] A photo quote with real photos picks a size.
- [ ] **Only if you turn the founding offer on** (`api/_lib/founding.js`): a
      booking shows and charges the discounted amount on the card form and on
      Apple Pay or Google Pay (the page updates the amount between checking
      the form and paying, which no test proves), and Finish takes the same
      percent off the final total.

## Step 7: open (same sitting, in this order)

- [ ] `BOOKINGS_OPEN_SERVER = true` in `api/create-booking.js`, merge to `main`.
- [ ] `BOOKINGS_OPEN=true` in Vercel, redeploy.
- [ ] `BOOKINGS_OPEN_CLIENT = true` in `book/quote.html`, merge.
- [ ] `SHOW = false` in `js/maintenance-banner.js`, merge, in the same sitting:
      the banner says "No card needed, nothing charged until we haul", which
      stops being true the moment customers pay when they book.
- [ ] Live keys (`sk_live`, live publishable key, live webhook secret; the
      live endpoint pinned to `2024-06-20` with the same events).
- [ ] One real booking on your own card, check every surface, then Cancel and
      refund it on `/jkr/`.
- [ ] **Emergency brake:** `BOOKINGS_OPEN_SERVER = false` and merge. It stands alone.

## After launch

- [ ] `node scripts/check-indexability.mjs` against the live site: every
      sitemap page answers 200, indexable, canonical to itself.
- [ ] Google Search Console: a Domain property verified by DNS (or
      `npm run gsc:token <token>` for a URL prefix property); submit the sitemap.
- [ ] `npm run indexnow` after every deploy that adds or changes pages (Bing,
      and so ChatGPT Search and Copilot).
- [ ] Google Business Profile (`marketing/gbp-optimization.md`).
- [ ] A review request after every job.
- [ ] Turn the follow-up helpers to `MODE: auto` after their two week ramp.
