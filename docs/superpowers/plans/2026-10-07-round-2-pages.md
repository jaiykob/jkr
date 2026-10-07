# Round 2: Pages and Site Parts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared header and footer on every page, a generated page for
each of the 40 towns in the travel zones plus a hub, and FAQ, privacy, terms
and 404 pages, all in the jkr look with drafted copy and red guesses.

**Architecture:** `index.html` marks the four regions a town page swaps
(`CITY:head`, `CITY:hero`, `CITY:local`, `CITY:faq`). `scripts/build-towns.mjs`
reads one plain text file per town (`content/towns/<slug>.md`), writes
`<slug>.html` (the homepage with that town's regions) and `service-areas.html`
(the hub), and the homepage zone list with town links. `scripts/build-chrome.mjs`
(ported from Scoops Co.) copies the homepage `<nav>`, `<footer>` and sticky
button into hand written pages between `BUILD:site-*` markers. `npm run build`
runs pricing, towns, chrome in that order; `npm test` runs every `--check`.

**Tech Stack:** Node ESM scripts, static HTML on `css/site.css`, plain JS.

**Spec:** `docs/superpowers/specs/2026-10-07-scoops-import-design.md`
(Round 2). Evolution log: `docs/superpowers/evolution.md`.

## Global Constraints

- Copy: "we / us / our", plain, no slang, **no dashes as punctuation** (no em or en dash in visible text).
- Mobile: text at least 16px, tap targets at least 48×48, no sideways scroll at 360px.
- Guesses (founder, 2026-10-07): anything not known is guessed and shown red with an asterisk; `[[text]]` in a town file, `class="guess"` in HTML, `GUESS*` in code; `GUESSES.md` lists them.
- Keep the jkr look (charcoal, hi-vis yellow, Bricolage Grotesque, DM Sans).
- The quote and checkout keep their slim header (no site menu between quote and payment).
- Placeholders stay: "Brand Name", "example.com", `G-XXXXXXXXXX`.
- Branch, then merge to `main`.

## Review Focus

1. **A town file with a ZIP outside every zone**: the build fails and names the
   file, instead of publishing a page that can't book. Test in Task 4.
2. **Two towns sharing a sentence** (copy pasted between files): the uniqueness
   test fails and names both towns. Test in Task 4.
3. **Hand edits to a generated page**: `build-towns --check` fails. Task 4.
4. **The 404 page opened at a deep URL** (`/blog/x/missing`): its links still
   work, because they are root relative. Score check in Task 3.
5. **A town spanning two zones** (Portland, Vancouver, Beaverton): its page
   shows each zone and fee with the ZIPs in it, not one wrong fee. Task 4.

---

### Task 1: Round 2 scorecard, generation 0

**Files:** Modify `scripts/score.mjs` (add `ROUNDS[2]`).

Checks (points): `tests` 10 · `chrome` 10 (build-chrome --check; standalone,
hub and town pages carry the homepage nav, which links Service areas and FAQ;
footer links Privacy and Terms) · `towns` 10 (35+ town files, every ZIP in a
zone, OR and WA, one page per file) · `town-pages` 15 (build-towns --check;
title and H1 name the town; canonical; outside the CITY regions identical to
`index.html`; local copy 120+ words) · `unique` 10 (no 8+ word sentence of
local copy shared by two towns; 2+ own FAQ questions each) · `town-travel` 5
(each page shows its zones and fees from `ZIP_ZONES`) · `hub` 5 (hub links
every town by zone; homepage zone list links towns) · `standalone` 10 (FAQ 14+
questions covering travel, photos, more than the photos, what we take and
don't, being home, payment, cancelling; terms and privacy sections; 404 root
relative links) · `copy` 10 (no em or en dash, banned words, or leftover dog or
Scoops words in visible text of every new page) · `links` 5 (every relative
link and anchor on new pages resolves) · `mobile` 5 (360px on FAQ, terms, an
OR town, a WA town, hub: no sideways scroll, main text 16px+, nav and footer
taps 48px+) · `site-js` 5 (analytics on every public page; maintenance banner
loaded; checkout reads `SITE_REOPEN_TEXT`).

- [ ] Write the checks, run on `main` for generation 0, log it, commit.

### Task 2: Shared chrome, analytics and the banner

**Files:** Create `scripts/build-chrome.mjs` (port of Scoops Co.'s, English
only for now, `/` root links for `404.html`), `js/analytics.js`,
`js/maintenance-banner.js`. Modify `index.html` (nav: How it works, What we
take, Pricing, Service areas → `service-areas.html`, FAQ → `faq.html`; footer:
links row and 16px text; load analytics and banner), `css/site.css` (footer
16px, footer links 48px tall), `book/checkout.html` (`SCOOPS_REOPEN_TEXT` →
`SITE_REOPEN_TEXT`), `package.json` (`build:chrome`, `build`, `--check` in test).

- [ ] Port the builder; run `--check` on a page with markers (fails before the
  splice, passes after); commit.

### Task 3: FAQ, privacy, terms, 404

**Files:** Create `faq.html`, `privacy.html`, `terms.html`, `404.html` on
`css/site.css` with chrome markers, drafted from the Scoops Co. pages for junk
removal, travel zones and the photo quote; unknown facts in red.

- [ ] Write the pages, run `build:chrome`, `check-meta`, score `standalone`,
  `copy`, `links`, `mobile`; commit.

### Task 4: The town generator, on three towns

**Files:** Create `scripts/build-towns.mjs`, `scripts/test-towns.mjs`,
`content/towns/{gresham,portland,vancouver}.md`, `content/towns/README.md`
(the format, for the founder). Modify `index.html` (CITY markers; an empty
local region), `package.json`.

Town file format:

```
name: Lake Oswego
state: OR
zips: 97034, 97035
lede: One or two sentences under the headline.
areas: Lake Grove, First Addition, Westlake, Mountain Park

## Local
A paragraph about hauling here. [[A fact we have not checked]] prints red.

Another paragraph.

## FAQ
Q: A question people here ask?
A: The answer.
```

`test-towns.mjs` (written first, fails first): parses every file; every ZIP is
in a zone (a bad ZIP fails naming the file); no 8+ word sentence of `## Local`
is shared by two towns; each town has 2+ FAQs; the generator's page for a
two zone town lists both zones; a hand edit to a generated page is caught by
`--check`.

- [ ] Test, generator, three towns, `--check`, commit.

### Task 5: All forty towns

**Files:** Create the other 37 `content/towns/*.md` (Oregon: Troutdale,
Fairview, Wood Village, Happy Valley, Damascus, Boring, Clackamas, Milwaukie,
Gladstone, Oregon City, West Linn, Lake Oswego, Tigard, Tualatin, Beaverton,
Aloha, Hillsboro, Sherwood, Wilsonville, King City, Sandy, Estacada, Canby,
Corbett, Scappoose, Molalla, Welches, Newberg, Aurora; Washington: Camas,
Washougal, Battle Ground, Ridgefield, Brush Prairie, La Center, Woodland,
Yacolt).

- [ ] Write, build, `test-towns`, score `towns`, `town-pages`, `unique`,
  `town-travel`; commit.

### Task 6: The hub and the homepage zone list

**Files:** `build-towns.mjs` writes `service-areas.html` (towns by zone with
fees) and the homepage `BUILD:home-area` block (moved from `build-pricing.mjs`,
now linking towns); each town page links up to six other towns in its zone.

- [ ] Build, score `hub`, `links`, `mobile`; commit.

### Task 7: Docs and 100

**Files:** `CLAUDE.md` (folder map, how to add a town, the build order),
`docs/superpowers/evolution.md`.

- [ ] Score to 100, screenshots at 360px and desktop, final review, merge.
