# Round 7: Landing Page and Service Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the homepage (and so the 40 town pages and the Spanish site) in LoadUp's landing page layout and order in our colors, and write the Disneyland based service standard and complaint helper.

**Architecture:** `index.html` stays the one source: edited section by section, ids, classes, phrases and `CITY:` regions kept, so `build-towns`, `build-es` and `build-chrome` carry it everywhere. Two new `BUILD:` blocks from `build-pricing` (the hero price ticket with the "Starting at" line, and the metro map); the tiers block goes. `css/home.css` is rewritten in four pieces. The scorecard gains `ROUNDS[7]`.

**Tech Stack:** static HTML and CSS, vanilla JS, Node build scripts (no dependencies), headless Chrome over CDP (`scripts/lib/browser.mjs`) for the scorecard.

**Spec:** `docs/superpowers/specs/2026-10-11-landing-page-design.md`

## Global Constraints

- Colors only from the `:root` tokens in `css/site.css` (charcoal `--rg`, yellow `--tan`, cream `--page`, white `--card`) plus the take swatches already in `index.html`.
- Type: Bricolage Grotesque for display, DM Sans for text. Text at least 16px, taps at least 48×48, no sideways scroll at 360px.
- Copy: "we / us / our", plain, no slang, no dashes as punctuation; no Disney words (magic, magical, guest, cast member, onstage, backstage); never "you can say no".
- Prices, fees, miles and places only from `pricing.config.mjs` through `build-pricing`; red with an asterisk while guessed.
- Every new English phrase on the homepage gets its Spanish (tú) in `i18n/es.json`; unused phrases are removed.
- Never edit generated pages (towns, `es/`, `blog/`); run `npm run build`.
- No invented reviews, ratings or counts.
- Motion off under `prefers-reduced-motion`.

## Review Focus

1. **Spanish lines run longer**: the hero button row, the check line and the pill must wrap without overlapping the block pile at 1280px and without sideways scroll at 360px on `es/index.html` (the `mobile` check covers it).
2. **Town headlines run longer** ("Junk removal in Happy Valley"): the light hero must hold them at 360px (the `mobile` check measures a town page).
3. **No JavaScript**: the ticket, the size cards and the town chips are plain links; the ZIP form posts to `book/quote.html?zip=` when the script never runs (Task 5 step).
4. **A saved ZIP** (`quoteZip` in sessionStorage): the size cards and the ticket add the ZIP to their links and the travel to their lines (Task 1 step).
5. **320px phones**: the button and its check line stack instead of squeezing (Task 1 CSS, the `mobile` check runs at 360px; screenshots at 320px in Task 8).

---

### Task 0: the round 7 scorecard (generation 0)

**Files:**
- Modify: `scripts/score.mjs` (add `ROUNDS[7]`, `PROBE_SETS[7]`; repair round 1 `guesses` to read `.size-price` once the tiers go)
- Modify: `docs/superpowers/evolution.md` (generation 0 row)

**Interfaces:**
- Produces: the check ids `tests, earlier, order, hero, contrast, steps, sizes, map, promises, footer, mobile, service, copy` (points as in the spec, total 100).
- Consumes: `withPage`, `dump`, `probeOf`, `rectOf`, `shown`, `byId`, `read`, `text`, `visibleText`, `run`, `C` (the config), `R6_ROWS`, `towns()` already in `score.mjs`.

- [ ] **Step 1:** Add `ROUNDS[7]` with the thirteen checks. The DOM order check reads ids in `index.html`: `hero-title` section, `.ticker`, `how-it-works`, `pricing`, `what-we-take`, `promises`, `price-band`, `area`, `faq`, `.closer`, `<footer>`; and fails while `BUILD:home-prices` or `class="tier"` remains. The contrast check computes WCAG ratios in the page for `.h-title`, `.h-title span`, `.h-cta`, `.h-check`, `.h-pill`, `.band.is-dark .section-title`, `.band.is-dark .section-sub`, `.price-band h2`, `.price-band .cta-btn`, `.closer h2`, walking up to the first opaque background.
- [ ] **Step 2:** Repair round 1 `guesses`: accept `class="size-price guess"` (the five cards) as the homepage price mark (the tiers that carried `tier-price guess` leave in Task 3).
- [ ] **Step 3:** Run `node scripts/score.mjs --round 7 --no-earlier`; expected: only `tests`, `mobile` (the page already passes) and `copy` pass; the rest fail with a reason naming what is missing.
- [ ] **Step 4:** Log generation 0 in `evolution.md`; commit "Round 7 gen 0: the scorecard".

### Task 1: the hero (light, the block pile and the price ticket)

**Files:**
- Modify: `index.html` (hero section), `css/home.css` (hero part), `js/home.js` (the ticket follows the ZIP), `scripts/build-pricing.mjs` (new `BUILD:home-ticket`), `i18n/es.json`

**Interfaces:**
- Produces: `BUILD:home-ticket` writes `<a class="h-ticket" data-size="2" href="book/quote.html?size=2">` with `.size-name`, `.size-price` (guess class), `.size-travel` ("+ travel"), and `<p class="h-from">Starting at <span class="guess">$99.00</span> for a single item</p>` is written by `BUILD:home-from` in the sizes band (Task 3) from the same helper `fromLine()`.
- Consumes: `sizeCard` helpers and `guessed()` in `build-pricing.mjs`; `SizeCards.mount` in `js/size-cards.js` (the ticket is mounted as a one card list so `setTravel` covers it).

- [ ] **Step 1:** Run the round 7 `hero` check; expected FAIL "no .h-cta".
- [ ] **Step 2:** In `build-pricing.mjs` add `homeTicket` (row `LOAD_ROW_TICKET = 2`, derived from `LOAD_OPTIONS.findIndex(o => /1\/2/.test(o.label))` falling back to the middle row) and register `{ name: 'home-ticket', body: homeTicket, comment: false }`.
- [ ] **Step 3:** Rewrite the hero markup: `.h-hero` > `.h-hero-in` > `.h-hero-copy` (pill eyebrow inside `CITY:hero`, title, lede, founding line, `.h-actions` with `a.h-cta` "Get my price" and `p.h-check`, `hr.h-rule`, `a.h-pill` tel link) and `.h-art` (`.h-pile` of eight `span.h-block` with `--sw` colors, `aria-hidden`, plus the ticket block). The size cards leave the hero (moved in Task 3, same commit if needed to keep `npm test` green).
- [ ] **Step 4:** Hero CSS: cream background, two columns from 960px (`1.05fr .95fr`), the title 2.6rem to 5.2rem, `span` with `background: linear-gradient(transparent 58%, var(--tan) 58% 92%, transparent 92%)` and `box-decoration-break: clone`; `.h-cta` yellow, 2px charcoal border, `box-shadow: 6px 6px 0 var(--rg)`, pressed state moves into its shadow; `.h-check` with an SVG check; `.h-pill` white, 1px border, 48px tall; the pile absolutely placed blocks with 8px offset shadows, the ticket white card, 2px charcoal border, 8px offset shadow, rotated -3deg; under 960px the art sits under the copy at 240px tall; under 380px the actions stack.
- [ ] **Step 5:** `js/home.js`: mount the ticket with `SizeCards.mount(ticketWrap)` and include it in the ZIP updates (travel line and `&zip=` on its link).
- [ ] **Step 6:** Spanish for the new phrases ("Price before you book" exists; new: "Your price", "Book this size"); run `npm run build`; `npm test` green; the `hero` check passes.
- [ ] **Step 7:** Commit "Round 7: the light hero, the block pile and the price ticket".

### Task 2: how it works (joined circles)

**Files:** `index.html` (how it works), `css/home.css`

- [ ] **Step 1:** Run the `steps` check; expected FAIL.
- [ ] **Step 2:** Markup: section `band is-white`, `.section-head.center` with `p.pill` eyebrow, `h2`, new `p.section-sub` ("Pick a size, pick a day, and we do the rest."), `ol.steps.steps-line` keeping the three `li`.
- [ ] **Step 3:** CSS: `.steps-line` grid of three from 760px, each `li` centered, `::before` counter in a 64px circle (1 yellow, 2 white with charcoal ring, 3 charcoal), a 3px line behind the circles (`.steps-line::before` across at 760px and up, down the left edge under 760px with the text beside the circle).
- [ ] **Step 4:** Spanish for the new line; build; tests; check passes; commit.

### Task 3: the sizes band (one size set, the tiers go)

**Files:** `index.html`, `css/home.css`, `js/home.js` (tiers observer out), `scripts/build-pricing.mjs` (`home-prices` out, `home-from` in), `i18n/es.json`

- [ ] **Step 1:** Run `sizes` and `order`; expected FAIL.
- [ ] **Step 2:** Delete the tiers section and `homePrices` in `build-pricing.mjs`; add `BUILD:home-from`.
- [ ] **Step 3:** New section `band is-dark sizes-band` with `id="pricing"` (the section, so `#pricing` lands here), head in two columns (eyebrow pill, `h2` "Pick the size that looks like your pile.", the "One flat price per load size" line on the right), `BUILD:home-from`, `div.size-list.h-sizes#homeSizes` with `BUILD:home-sizes`, then `.sizes-after`: the photo link as an outlined button, `BUILD:home-travel-note`, the "More than a full truck?" line, the contact chips.
- [ ] **Step 4:** CSS: cards white on charcoal, five across from 960px with the photo on top, stacked rows under 960px; outlined yellow button; chips as before.
- [ ] **Step 5:** `js/home.js`: remove the tiers observer; keep the cards' travel and links.
- [ ] **Step 6:** Remove phrases left unused; build; tests; round 1, 6 and 7 `sizes`, `home`, `contact`, `desktop`, `taps` pass; commit.

### Task 4: what we take, promises, the price band

**Files:** `index.html`, `css/home.css`, `i18n/es.json`

- [ ] **Step 1:** Run `promises` and `order`; expected FAIL.
- [ ] **Step 2:** What we take: each `article.take` gets `span.take-icon` (a 48px charcoal square holding a 24px line icon in yellow: sofa, fridge, bed, box, leaf, boxes, screen, house), the colored block goes; four across from 960px, two from 520px.
- [ ] **Step 3:** Promises: `section.band.is-white#promises-band` with `aria-labelledby="promises"`, left `h2#promises` "What you can count on, every job." with "every job" highlighted, a line, a "Get my price" link; right four `article.promise` cards (icon square, `h3`, `p`): "Your price first", "A text before we arrive", "We do all the lifting", "We leave it clean". Text only claims what the system does (spec R7).
- [ ] **Step 4:** Price band: `section.price-band#price-band` yellow, small caps eyebrow, `h2` "See your price in seconds.", a line, `a.cta-btn` (charcoal), "or text (925) 408-6053".
- [ ] **Step 5:** Spanish; build; tests; checks pass; commit.

### Task 5: where we go (the metro map)

**Files:** `scripts/build-pricing.mjs` (`BUILD:home-map`), `index.html`, `css/home.css`, `js/home.js`, `i18n/es.json`

**Interfaces:**
- Produces: `BUILD:home-map` writes `<figure class="area-map">` with an inline `<svg viewBox>`: one `<circle data-zip data-zone>` per ZIP in `ZIP_ZONES`, filled by zone (`var(--z-home)`, `--z-z2`... set inline from a four step charcoal to yellow ramp), the base as a star, six town labels; and `<ul class="map-key">` with each zone's name and fee (guess red).
- Consumes: `data/zip-miles.mjs` (`base.lat/lon`, `zips[zip].lat/lon` if present; else the GeoNames centers measured there), `ZIP_ZONES`, `ZONES`, `GUESS`.

- [ ] **Step 1:** Run `map`; expected FAIL.
- [ ] **Step 2:** Generator: equirectangular projection around the base (`x = (lon - lon0) * cos(lat0)`, `y = lat0 - lat`), fit to a 600×460 box with 24px padding, radius 5; colors from a ramp of four (yellow, dark yellow, slate, charcoal outline); labels for the six biggest towns by ZIP count.
- [ ] **Step 3:** Section: two columns from 860px: map figure left; right the eyebrow pill, `h2#area`, the line, `ul.town-chips` (six towns plus "All service areas"), the ZIP form now `action="book/quote.html" method="get"` with `name="zip"` and a `button.zip-go` "Check" (with JS: the answer shows in place and submit does nothing more). Under both, `#zoneList` restyled light (four across from 960px).
- [ ] **Step 4:** `js/home.js`: the hit zone's dots get `.is-hit` (bigger, ringed).
- [ ] **Step 5:** Spanish; build; tests; check passes; commit.

### Task 6: FAQ cards, the closer, the column footer

**Files:** `index.html`, `css/home.css`, `css/site.css` (footer part of `BUILD:chrome-css`, if footer CSS lives there), `i18n/es.json`

- [ ] **Step 1:** Run `footer`; expected FAIL.
- [ ] **Step 2:** FAQ: light grey band, pill eyebrow, a line under the title, `details` as white cards, a round chevron (CSS only). Same questions (the JSON-LD stays true).
- [ ] **Step 3:** Closer: charcoal, big title, a line, `a.cta-btn.is-yellow` and `a.cta-ghost` (tel).
- [ ] **Step 4:** Footer: `div.foot-cols` with three `nav` columns (`h2.foot-h` "Book", "Where we go", "Help") and the brand column; links as in the spec; the legal line. `npm run build` copies it to every page; `build-chrome --check` green; round 2 `chrome` passes.
- [ ] **Step 5:** Spanish; build; tests; commit.

### Task 7: the service standard and the complaint helper

**Files:** Create `docs/service-standard.md`, `agent/skills/complaint-reply/SKILL.md`; Modify `agent/skills/_shared/jkr-context.md` (point to the standard), `CLAUDE.md` (folder map, progress, renumbered queue)

- [ ] **Step 1:** Run `service`; expected FAIL.
- [ ] **Step 2:** Write the standard (nine numbered parts, spec section "The service standard"), the on the spot limit as `[[$25]]` style red guess listed in `GUESSES.md` with a `GUESS*` marker.
- [ ] **Step 3:** Write the helper in the format of `agent/skills/quote-followup/SKILL.md` (draft only, quiet hours, copy rules, HEARD order, one fix within the limit, a "why" note for the founder).
- [ ] **Step 4:** `npm run guesses`; tests; `service` and `copy` pass; commit.

### Task 8: finish

- [ ] **Step 1:** `npm run build`, `npm test`, `npm run score -- --round N` for 1 to 7; fix until all 100.
- [ ] **Step 2:** Screenshots at 360, 320 and 1280 of the homepage, a town page and `es/`; look at them; fix what looks wrong.
- [ ] **Step 3:** Whole branch review (fresh reviewer on the most capable model); fix what it finds; rescore.
- [ ] **Step 4:** Log the generations; CLAUDE.md progress; merge to `main`, push.
