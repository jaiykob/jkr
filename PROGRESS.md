# Progress

Where jkr stands. Git history is the full record; this is the summary. Update
it in the same commit as the change it describes.

## Status

- **Stage:** not live. No name, no domain. All three booking gates closed; the
  site says "We open for booking soon" (`js/maintenance-banner.js`).
- **The plan:** `docs/superpowers/specs/2026-10-07-scoops-import-design.md`.
  Part 1 (bring over every Scoops Co. system) runs in five rounds, each scored
  to 100 by `npm run score -- --round N`
  (`docs/superpowers/evolution.md`). Then a walkthrough with the founder, then
  the photo first quote with an on site price change.
- **Rounds:** 1 travel pricing ✅ · 2 pages ✅ · 3 business docs and follow-up ✅ · 4 SEO tools ✅ · 5 blog, Spanish, extras ✅ (Part 1 done; next, the walkthrough)
- **Open founder decisions:** `LAUNCH-DAY.md` step 0 (name, domain, base, a
  22 to 24 mile radius, prices, Washington, insurance) and every red guess in
  `GUESSES.md`.
- **Launch steps:** `LAUNCH-DAY.md`. **Accounts:** `ACCOUNTS.md`. **Small
  fixes waiting:** `PUNCHLIST.md`.

## What exists

- Homepage with the load builder (tap or snap; the truck fills; the price is live with travel).
- Quote, checkout (Stripe), thanks; the server reprices every booking.
- Photo quotes (Claude counts the items).
- Travel zones by ZIP from Gresham, 135 ZIPs in Oregon and Washington.
- 40 town pages and a hub, FAQ, privacy, terms, 404, shared header and footer.
- Stripe webhook: database rows, customer email, owner email, Discord ping.
- `/jkr/` dashboard with job actions and photos.
- Follow-up helpers (drafts only) and their shared context.
- SEO: one site address, structured data, sitemap, robots, llms.txt, share
  cards for every page, the photo pipeline, IndexNow and Search Console tools.
- A blog of twelve posts, and the whole site in Spanish: homepage, 40 towns,
  the hub, the FAQ and the blog (`es/`), with a language switch on every page.
- A commercial request form for property managers, realtors and contractors.
- The founding member offer, ported and switched off.

## Change log

- **2026-10-07:** Round 5: twelve blog posts, the Spanish site (phrase list,
  Spanish towns, hub, FAQ, blog, language switch, hreflang), the commercial
  request form, the founding offer (off). Scored 100. Part 1 done.
- **2026-10-07:** Round 4: SEO tools (site address, schema, sitemap,
  indexability, share cards, photo pipeline, IndexNow). Scored 100.

- **2026-10-07:** Round 3: business plan, launch checklist, accounts,
  progress, punch list, marketing, follow-up helpers, owner booking email,
  Supabase keep-alive. Founder note: max radius 22 to 24 road miles.
- **2026-10-07:** Round 2: shared header and footer, FAQ, privacy, terms,
  404, 40 town pages and the hub, analytics, the "not booking yet" banner.
  Scored 100.
- **2026-10-07:** Round 1: the whole Portland metro with travel zones by ZIP
  from a Gresham base; travel on every surface; guesses shown red. Scored 100.
- **2026-10-07:** The plan agreed: bring over every Scoops Co. system, then
  a walkthrough, then the photo first quote with on site price changes.
- **2026-09-28:** Redesign (charcoal and hi-vis yellow, the load builder);
  photo quotes.
- **2026-09-27:** Skeleton built from the Scoops Co. stack.
