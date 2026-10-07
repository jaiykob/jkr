# Punch list

Small things noticed while building, waiting for the walkthrough or a quiet
moment. Tick with the commit that fixes it. Bigger work lives in the plan
(`PROGRESS.md`).

## Promises the site makes that the code does not keep yet

- [ ] **Quote photos deleted after 90 days** (privacy page). Nothing deletes
      them yet: add it to the daily job (`api/cron-visits.js`) for `quotes/`
      photos with no booking.
- [ ] **"We follow up once on a quote you did not book"** (privacy page):
      true only once the follow-up helpers run.

## Copy and pages

- [ ] ZIP answers use the Postal Service's city name, so Tigard's 97223 reads
      "Portland". Prefer the town file's name when a town lists the ZIP.
- [ ] Checkout: the "One-time haul" label and the billing footnote are under
      16px.
- [ ] A single zone town page could show that town's travel in the truck
      before a ZIP is typed.
- [ ] Screen readers may read the red guess asterisk as "star".
- [ ] Homepage FAQ: "What if I guess the size wrong?" should match the on site
      rule word for word once Part 3 lands.
- [ ] Spanish: a native speaker reads `i18n/es.json`, `es/faq.html`, the town
  files' Spanish sections and `content/blog/es/` (drafted 2026-10-07, tú, "retiro de
  basura" for junk removal).
- [ ] Spanish pages: the photo quote ignores Claude's English note and shows its
  own count line; ask Claude for the note in Spanish (`api/photo-quote.js`).
- [ ] Spanish pages: the preview bar and the guess legend (`js/preview-nav.js`,
  owner tools) stay English.

## Logic to verify

- [ ] One real monthly pickup in Stripe test mode: the interval and the travel
      in each charge.
- [ ] A refund from the Stripe dashboard leaves the dashboard row right.
- [ ] Checkout with a hand edited `cents` in the URL shows a wrong load line
      (the server refuses the booking, so no harm; the display could check).

## From Scoops Co.'s list that still applies

- [ ] SMS consent wording on checkout once texts go live (A2P 10DLC).
- [ ] Decide which follow-up emails stay transactional and which need an
      unsubscribe link.
