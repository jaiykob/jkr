# Round 9: SEO Pass and Service Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eight Portland service pages built from plain text files, a "Before we come" page, the FAQ page as a help center by topic, menus that name tasks, a breadcrumb on every page below the homepage, and a technical SEO audit that `npm test` runs.

**Architecture:** A new generator, `scripts/build-services.mjs`, turns `content/services/portland/<slug>.md` into `portland/<slug>.html` on the blog's template (the shared header and footer filled by `build-chrome`), with prices from the order module. A shared helper, `scripts/lib/crumbs.mjs`, writes the visible breadcrumb and its BreadcrumbList for every generator and, through `build-chrome`, for the hand written pages. A new check, `scripts/check-seo-audit.mjs`, reads every indexable page. Nothing already built moves (the child plan in `evolution.md`).

**Tech Stack:** static HTML, CSS, vanilla ES5 in the browser; Node ESM build scripts; the scorecard in Node over headless Chrome (`scripts/lib/browser.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-12-seo-pass-design.md`

## Global Constraints

- Mobile: text 16px+, taps 48×48+, no sideways scroll at 360px; that includes the breadcrumb links and the help topic buttons.
- Copy: "we / us / our", plain, no slang, **no dashes as punctuation**, no Disney words (magic, guest, cast member, onstage, backstage), no TODO in what visitors read.
- **No price typed** in a service file, the Before we come page or a post: prices come from `pricing.config.mjs` through the build.
- **Guesses are red**: `[[...]]` in content files; `class="guess"` in hand written HTML; `npm run guesses` after.
- Generated pages are never edited by hand; each generator has `--check`, run by `npm test`.
- The site address only from `api/_lib/site.js`; never typed into a script.
- Service slugs never equal a town slug; services live in `portland/`, towns stay at the root (`portland.html` is the Portland town page and stays).
- Rounds 1 to 8 stay at 100: a check that reads something this round renames is walked to the new name with a ruling in `evolution.md`, never loosened.
- Spanish: every new phrase on `index.html` needs its Spanish in `i18n/es.json` (build-es stops otherwise); Spanish writes with tú.

## Review Focus

1. **A service file naming a size, town or post that does not exist**: the build stops and names the file and the bad value (no page with a dead link or a $NaN price).
2. **Spanish pages linking a service page**: the link reaches the English page (`../portland/<slug>.html` from `es/`), never a missing `es/portland/` page; the language switch on a service page points at the Spanish homepage.
3. **The breadcrumb on a 360px phone**: a long trail (a blog post title) wraps without sideways scroll and every link stays 48px tall.
4. **The old post's addresses** (`/blog/getting-ready-for-a-pickup.html`, `/es/blog/getting-ready-for-a-pickup.html`): 301 to the Before we come page in its language; no page on the site still links them; the sitemap no longer lists them.
5. **The help topic buttons with the maintenance banner up**: a jump lands with the topic heading visible below the sticky header, not under it.

---

### Task 0: the round 9 scorecard (generation 0)

**Files:** `scripts/score.mjs` (`ROUNDS[9]`, `PROBE_SETS[9]`), `docs/superpowers/evolution.md` (gen 0 row).

Eleven checks, 100 points, exactly the spec's table:

| id | pts | passes when |
| --- | --- | --- |
| `tests` | 8 | `npm test` exits 0 |
| `earlier` | 5 | `--round N --json --no-earlier` gives 100 for N = 1 to 8 (the round 8 pattern, timeout 1500000 each) |
| `services` | 15 | eight files in `content/services/portland/` (the spec's eight slugs); each `portland/<slug>.html` exists, `build-services --check` passes; H1 contains the service name and "Portland"; 400+ words in `main .svc-own` (the service's own copy); a `.svc-price` whose text holds the config price of the file's first size (red `.guess` while `GUESS.prices`); `.size-card` links to `book/quote.html?size=<key>` for each listed size; 5+ links to town pages that exist; 1+ link to a post that exists; 3+ `.faq-list details` |
| `unique` | 8 | `sentences()` (8+ words) of each service's own copy appear in no other service and no town's local copy |
| `schema` | 10 | `check-schema` passes; each service page carries Service (provider, `areaServed` cities, AggregateOffer), BreadcrumbList and FAQPage; `check-seo-audit` passes its breadcrumb rule |
| `before` | 8 | `before-we-come.html` and `es/before-we-come.html` exist with the seven section ids (`set-out`, `path`, `parking`, `pets`, `not-home`, `cant-take`, `on-the-day`); linked from `book/thanks.html`, the `bookedConfirmation` and `visitReminder` emails (rendered), `faq.html`, the header nav and the footer; no file links `getting-ready-for-a-pickup`; `vercel.json` 301s both old addresses to the page in their language; `content/blog/en/piano-removal.md` and its es twin; 12 posts in each language |
| `help` | 8 | `faq.html`: H1 "How can we help?"; a `.help-topics` list of six links, each to an id on the page or `before-we-come.html`, each topic group 3+ questions; `tel:`, `sms:`, `https://wa.me/`, `mailto:` in `.help-contact`; `es/faq.html` has the same ids and counts; in Chrome at 360px with the maintenance banner up, a tap on "Paying and changes" leaves its heading fully below the sticky header |
| `menus` | 8 | the homepage nav links, in order, Services (`service-areas.html#services`), Prices (`index.html#pricing` or `#pricing`), Where we go (`service-areas.html`), Before we come, Help (`faq.html`) and the Get my price button; the footer has four `.foot-col` headings Book, Services, Where we go, Help, the eight service links in Services; `build-chrome --check` passes |
| `audit` | 15 | `check-seo-audit` exits 0; in Chrome at 360px the layout shift total is under 0.1 on `index.html`, `gresham.html`, `portland/garage-cleanout.html`, `faq.html`; the largest contentful paint element is not `loading="lazy"` on those pages; no `<script src>` in a `<head>` without `defer` or `async` |
| `mobile` | 8 | `portland/garage-cleanout.html`, `service-areas.html`, `before-we-come.html`, `faq.html`, `es/faq.html` and the blog post with the longest title (its breadcrumb wraps) at 360px: no sideways scroll, text 16px+, taps 48px+ (`PROBE_SETS[9]` names `.crumbs`, `.svc-*`, `.help-*`, `.bwc-*`); at 1280px no sideways scroll |
| `copy` | 7 | `copyProblem()` and the Disney words on the service files, the Before we come pages, the help pages and the piano posts; no `$` followed by a digit in `content/services/`; `list-guesses --check` passes |

- [ ] Write the checks. Reuse `read`, `run`, `text`, `words`, `sentences`, `towns()`, `postSlugs()`, `copyProblem()`, `jsonLd()`, `ldOf()`, `withPage()`, `dump()`, `probeOf()`. Layout shift: inject a `PerformanceObserver({ type: 'layout-shift', buffered: true })` summing `value` where `!hadRecentInput`, read after the page settles; LCP the same with `largest-contentful-paint`, taking the last entry's `element`.
- [ ] Run `node scripts/score.mjs --round 9 --no-earlier`; expect only `tests` (and maybe `earlier`, `audit` parts) to pass. Log gen 0 in `evolution.md` under round 9's "Build generations" table; commit "Round 9 gen 0: the SEO pass scorecard".

### Task 1: the service page generator and its first page

**Files:**
- Create: `scripts/build-services.mjs`, `scripts/test-services.mjs`, `content/services/README.md`, `content/services/portland/garage-cleanout.md`, `scripts/lib/crumbs.mjs`, `css/services.css`
- Modify: `package.json` (`build` runs `build-services` right after `build-pricing`, so the footer block it writes into `index.html` (Task 3) reaches the town pages, and before `build-chrome`, which fills the service pages' header and footer; `test` runs `test-services` and `build-services --check`), `scripts/check-schema.mjs` (no change expected: it walks every html file; confirm it reads `portland/`), `scripts/build-og-cards.mjs` (a service card: kicker "Junk removal in Portland", title the service name, the "From $X plus travel" line red while guessed), `vercel.json` (`/portland/` and `/portland/index.html` 301 to `/service-areas.html`)

**Interfaces:**
- Produces `scripts/lib/crumbs.mjs`:
  - `crumbs(trail, { rel, lang = 'en' })` → `{ html, ld }`. `trail` is `[{ name, href? }]` from the root, the last item without `href` (the page itself). `rel` is the page's path from the root (`portland/garage-cleanout.html`), used to make relative hrefs. `html` is `<nav class="crumbs" aria-label="Breadcrumb"><ol>…<li><a href="…">Home</a></li>…<li aria-current="page">Garage cleanout</li></ol></nav>`; Spanish uses `aria-label="Ruta"` and "Inicio". `ld` is a BreadcrumbList object with absolute `item` URLs from `site.SITE_URL` (the last item's URL is the page's canonical).
  - `HUB = { en: { name: 'Portland metro', href: 'service-areas.html' }, es: { name: 'Área de Portland', href: 'es/service-areas.html' } }`.
- Produces `scripts/build-services.mjs`:
  - `parseService(text, file)` → `{ slug, metro: 'portland', name, h1, description, lede, sizes: string[], towns: [{ slug, why }], posts: string[], take, goes, free, how: string[] (paragraph or list HTML), faqs: [{ q, a }] }`; throws `content/services/portland/<file>: <what>` on: a missing field, a size key not in `ORDER.SIZES`, a town slug with no `content/towns/<slug>.md`, a post slug with no `content/blog/en/<slug>.md`, fewer than 5 towns, fewer than 3 FAQs, a `$` before a digit.
  - `loadServices()` → every parsed service, sorted by the order in `content/services/portland/ORDER` (a plain list of slugs, priority order).
  - `buildService(s, all)` → the page HTML string.
  - `serviceLinks(lang = 'en')` → `[{ name, href }]` for the hub, footer and homepage (relative to the root: `portland/<slug>.html`).
- The file format (`content/services/README.md` documents it):

```
name: Garage cleanout
h1: Garage cleanouts across the Portland metro
description: 100 to 160 characters, naming Portland, no price.
lede: One or two sentences under the headline.
sizes: half, three, full
towns:
- gresham: Detached garages on big lots, often a whole one at a time.
- beaverton: ...
posts: garage-cleanout-in-a-weekend, where-hauled-junk-goes

## What we take
Paragraphs, or lines starting "- " for a list.

## Where it goes
...

## Free options
...

## How the job goes
...

## FAQ
Q: A question in the customer's words?
A: The plain answer first, then what to do next.
```

- The page, top to bottom: the shared header (`<!-- BUILD:site-header -->` markers, filled by `build-chrome`), the breadcrumb (Home › Portland metro › name), H1 and lede in a hero with the "Get my price" button (`book/quote.html`) and "Send a photo" (`book/quote.html#photos`), the price block `.svc-price` ("From $X plus travel", X the first size's one time price from `ORDER.SIZES`, red with `class="guess"` while `GUESS.prices`; then one `.size-card` per listed size: label, note, price, link `book/quote.html?size=<key>`), `main .svc-own` wrapping the four own sections (h2 each) and the towns list (h2 "Where we do this most", each town linked `../<slug>.html` with its reason), the FAQ (`.faq-list` of `details`), related posts (`../blog/<slug>.html`, titles from the posts), "Before we come" link, a dark closer with Get my price, the shared footer and sticky button markers.
- Head: title `${name} in Portland, OR | ${site.NAME}` (the audit holds it to 65 characters), the description, canonical `${SITE}/portland/<slug>.html`, og and twitter tags (card `images/og/portland-<slug>.png`), the language switch to `es/index.html` (no twin), CSS `../css/site.css`, `../css/guess.css`, `../css/services.css`, and one JSON-LD `@graph`: Service (`name`, `serviceType`, `provider` `{ '@type': 'LocalBusiness', name, telephone, url }`, `areaServed` the listed towns as `{ '@type': 'City', name: 'Gresham, OR' }`, `offers` AggregateOffer `priceCurrency` USD, `lowPrice` first size's price, `highPrice` last size's price plus the largest fee among the listed towns' zones), the BreadcrumbList from `crumbs()`, FAQPage from the visible questions (the `faqPage` shape in `build-towns.mjs`).

- [ ] **Step 1: write `scripts/test-services.mjs` failing**: parse a sample service string with a bad size (`sizes: huge`) and expect the throw to name `huge`; a bad town and a bad post likewise; a good sample parses to 5 towns and 3 FAQs; `buildService()` of the sample has one `<h1>`, a `.svc-price` with the config price of its first size, a `book/quote.html?size=` link per size, every town link `../<slug>.html`, BreadcrumbList with three items, and the `[[guess]]` text as `<span class="guess">`; `crumbs()` from `portland/x.html` gives `../index.html` for Home and `../service-areas.html` for the hub, and absolute `item` URLs starting with `site.SITE_URL`. Run `node scripts/test-services.mjs`: FAIL (module missing).
- [ ] **Step 2: build `scripts/lib/crumbs.mjs` and `scripts/build-services.mjs`** (writes `portland/<slug>.html` for every file; `--check` exits 1 naming a stale or extra page; removes a page whose file is gone). Add `.crumbs` and `.svc-*` styles in `css/services.css` (crumbs: 16px, links `display:inline-flex; min-height:48px; align-items:center`, `›` separators `aria-hidden`, wrapping). Write `content/services/portland/garage-cleanout.md` (450+ own words, red guesses where the spec says) and `ORDER` with all eight slugs in the spec's order (the build skips a slug with no file yet, so Task 2 adds files only).
- [ ] **Step 3: run** `node scripts/test-services.mjs` (PASS), `npm run build`, `npm test` (PASS, including `check-schema` reading the new page and `build-sitemap --check` listing it), `node scripts/score.mjs --round 9 --no-earlier` (`services` still fails: one of eight). Screenshot `portland/garage-cleanout.html` at 360 and 1280 (`scripts/lib/browser.mjs`) and look at it.
- [ ] **Step 4: commit** "Round 9: the service page generator, the breadcrumb helper, garage cleanout".

### Task 2: the other seven service pages

**Files:** Create `content/services/portland/{furniture-removal,estate-cleanout,hot-tub-removal,mattress-removal,appliance-removal,yard-debris-removal,hoarder-cleanout}.md`.

Sizes (guesses the founder will adjust): furniture `single, quarter, half`; estate `three, full`; hot tub `half, three`; mattress `single, quarter`; appliance `single, quarter`; yard debris `quarter, half, full`; hoarder `full`. Each file 400+ own words, 5 to 8 towns with a reason that is true of that town (read its `content/towns/<slug>.md`), related posts that exist, 3 to 5 FAQs in the customer's words with the answer first. Red (`[[...]]`) for anything not known: the transfer station or donation partner a load goes to (Metro Central, Metro South, Clark County's transfer stations, Habitat ReStore are real places; that we use them is the guess), a hot tub's power disconnected by an electrician before we come and how it is cut up, a hoarder job excluding biohazard cleaning and how quietly the truck comes, the appliance page's refrigerant handling, e-waste through Oregon E-Cycles and Washington's E-Cycle (a free option line on the appliance page).

- [ ] **Step 1:** run `node scripts/score.mjs --round 9 --no-earlier`: `services` and `unique` FAIL.
- [ ] **Step 2:** write the seven files; link each service page from its related English posts (`garage-cleanout-in-a-weekend` → garage cleanout, `estate-cleanout` → estate cleanout, `mattress-disposal` → mattress removal, `fridge-and-freezer-disposal` → appliance removal, `yard-debris-after-a-storm` → yard debris removal; a sentence in the post's own voice with the link `/portland/<slug>.html`); `npm run build`; `npm test`.
- [ ] **Step 3:** the score's `services`, `unique` and `copy` PASS. Commit "Round 9: seven more Portland service pages".

### Task 3: menus that name tasks, and the links in

**Files:** `index.html` (nav, footer, the "What we take" blocks), `i18n/es.json`, `scripts/build-towns.mjs` (the hub's Services section `id="services"`, a "Jobs we do here" line in each town's CITY:local listing the services that name that town, breadcrumbs in CITY:hero and BreadcrumbList in CITY:head for town pages and the hub), `scripts/build-chrome.mjs` (no change expected), `scripts/score.mjs` (walk any earlier check that reads a renamed label, with a ruling).

- Header nav, in order: Services → `service-areas.html#services`, Prices → `#pricing`, Where we go → `service-areas.html`, Before we come → `before-we-come.html`, Help → `faq.html`; Text us and WhatsApp stay as phone menu items; the Get my price button stays.
- Footer: Book (Get my price, Send a photo, Before we come, Property managers), Services (the eight, from `serviceLinks()`, written by `build-services` into a `<!-- BUILD:foot-services -->` block in `index.html`, the way `build-towns` writes `foot-towns`), Where we go (unchanged: the hub and six towns), Help (Help and FAQ → `faq.html`, Blog, Terms, Privacy).
- The "What we take" blocks become links to their pages: Furniture → furniture removal, Appliances → appliance removal, Mattresses → mattress removal, Garage and basement → garage cleanout, Yard debris → yard debris removal, Estate cleanouts → estate cleanout (the whole block is the link, its focus ring visible; Move outs and Electronics stay plain).
- Build order: `build-services` already runs right after `build-pricing` (Task 1), so the `foot-services` block it writes into `index.html` reaches every town page and the Spanish homepage; it reads the town files, never their pages.
- Spanish: `es/index.html` and every Spanish page link a service as `../portland/<slug>.html` (no Spanish twin); add a `test-services` assertion that the Spanish homepage's footer links each service that way and that the target file exists.

- [ ] **Step 1:** score `menus` FAIL.
- [ ] **Step 2:** build it; `npm run build`; the Spanish phrases into `i18n/es.json` ("Servicios", "Precios", "Dónde trabajamos", "Antes de que lleguemos", "Ayuda", the service names); `npm test`.
- [ ] **Step 3:** `menus` PASS; rounds 2 and 7 (`chrome`, `footer`, `mobile`) still 100 (`node scripts/score.mjs --round 2 --no-earlier`, then 7). Commit "Round 9: menus that name tasks; services linked from the hub, towns, homepage and footer".

### Task 4: Before we come, the piano post, the old post retired

**Files:** Create `before-we-come.html`, `es/before-we-come.html`, `content/blog/en/piano-removal.md`, `content/blog/es/piano-removal.md`. Delete `content/blog/en/getting-ready-for-a-pickup.md`, `content/blog/es/getting-ready-for-a-pickup.md` (their generated pages go with the next build). Modify `vercel.json` (two 301s), `book/thanks.html` (a "Before we come" link in What happens next), `api/_lib/email-templates.js` (`bookedConfirmation` and `visitReminder`: a "How to get ready" line linking `${BRAND.site}/before-we-come.html`), `scripts/test-ops.mjs` (assert the link in both emails), `scripts/lib/twins.mjs` (the new pair), `scripts/build-og-cards.mjs` (fixed cards for both pages), any post or page that linked the old post (now the page). Also `scripts/build-pricing.mjs`: add `{ file: 'before-we-come.html', blocks: [], policy: true }` and its `es/` twin to `TARGETS`, so the cancel and late fee spans on both pages (`<span class="guess" data-policy="cancel|late|refusal">`, the only way a fee appears there) stay current with the config (the round 9 `copy` check requires both).

- The page: hand written like `faq.html` (shared header, footer, sticky markers; `css/site.css`), a breadcrumb Home › Help › Before we come (through `build-chrome`, Task 6 owns the helper call; until then hand write the same markup), H1 "Before we come", a lede, the seven sections with those ids, each an h2 and short plain paragraphs or a list, the old post's words moved in and tightened, the cancel and late fee rule through `data-policy` spans (never typed), "Get my price" closer. Title "Before We Come: Getting Ready for Junk Removal | Brand Name" trimmed to 65 characters, a description naming Portland.
- The Spanish page the same in Spanish with tú.
- Piano post (both languages): 400+ words, the description 100 to 160 characters, links `/book/quote.html` and a town, no price, what makes a piano different (weight, stairs, a crew of [[three]], donation first), red where unknown.

- [ ] **Step 1:** score `before` FAIL; add the email assertions to `test-ops.mjs`: FAIL.
- [ ] **Step 2:** build it; `npm run build`; `npm test` PASS.
- [ ] **Step 3:** `before` PASS; round 5 (`blog`, `spanish-pages`) still 100. Commit "Round 9: the Before we come page, the piano post, the old checklist post moved into the page".

### Task 5: the help center

**Files:** `faq.html`, `es/faq.html`, `css/site.css` (or a small `css/help.css` both pages load), `scripts/build-faq-jsonld.mjs` (no change expected: it reads the visible questions), `scripts/build-og-cards.mjs` (the FAQ cards' title).

- H1 "How can we help?" (Spanish "¿Cómo te ayudamos?"); a `.help-topics` list of six buttons-as-links: Getting a price `#g-price`, Before we come `before-we-come.html`, On the day `#g-day`, What we take `#g-take`, Paying and changes `#g-pay`, Where we go `#g-where` (a new group: travel, the area, the ZIP list, moved from Getting a price); `.help-contact` beside the topics on a desktop and under them on a phone: Call, Text, WhatsApp, Email (`mailto:` the owner email placeholder `hello@example.com` until the domain, red).
- Questions reworded into the customer's words where they read like ours ("Do you come to my area?" stays; "What is the travel charge?" → "Why is there a travel charge?"), each answer starting with the plain answer. 3+ per group. `scroll-margin-top` on the group headings so a jump clears the sticky header and the banner.
- Title "Junk Removal Help and FAQ | Brand Name"; `es/faq.html` kept in step (the same ids and counts).

- [ ] **Step 1:** score `help` FAIL.
- [ ] **Step 2:** build it; `npm run build`; `npm test` (`build-faq-jsonld --check`, `check-schema` FAQ counts) PASS.
- [ ] **Step 3:** `help` PASS; round 2 `standalone` (FAQ 14+ questions) still passes. Commit "Round 9: the FAQ page as a help center by topic".

### Task 6: breadcrumbs everywhere and the technical audit

**Files:** Create `scripts/check-seo-audit.mjs`. Modify `package.json` (`test` runs it), `scripts/build-blog.mjs` (crumbs on the index and every post: Home › Blog › title), `scripts/build-chrome.mjs` (a `CRUMBS` table for the hand written pages: `faq.html` Help; `before-we-come.html` Help › Before we come; `privacy.html` Privacy policy; `terms.html` Terms of service; `book/commercial.html` Property managers; the es twins in Spanish; it writes the trail between `<!-- BUILD:crumbs -->` markers in the body and the BreadcrumbList between `<!-- BUILD:crumbs-ld -->` markers in the head), the pages that need the markers, and whatever the audit finds (titles, descriptions, image sizes).

`check-seo-audit.mjs` reads every page `build-sitemap.mjs`'s `pages()` returns and fails, naming the page, on:

1. not exactly one `<h1>`;
2. a title over 65 characters, or one shared with another page; a town page whose title lacks the town's name; a service page, the hub or a homepage whose title lacks "Portland";
3. a description outside 100 to 160 characters, or shared;
4. a canonical that is not the page's own address, a missing `og:image` or `twitter:card`;
5. on every page but `index.html`, `es/index.html` and `book/quote.html`: no BreadcrumbList, or one whose names and URLs differ from the visible `.crumbs` trail;
6. an internal link or `src` that does not resolve to a file (anchors to an id on the target page too);
7. a sitemap page not reachable from `index.html` in 3 clicks or fewer (following internal links in both languages);
8. an `<img>` without `alt`, or without both `width` and `height` attributes.

- [ ] **Step 1:** write the audit; run it: expect FAILs (breadcrumbs missing, likely some titles and descriptions). Score `audit` and `schema` FAIL.
- [ ] **Step 2:** add the crumbs to the blog and hand written pages, fix what the audit names (one commit per kind of fix if many), `npm run build`, `npm test` PASS.
- [ ] **Step 3:** `audit`, `schema`, `mobile` PASS (the breadcrumb at 360px). Commit "Round 9: a breadcrumb on every page below the homepage; the SEO audit in npm test".

### Task 7: earlier rounds, review, finish

- [ ] Run rounds 1 to 8 one at a time (`--round N --no-earlier`), fix anything this round broke by walking the check (a ruling per change in `evolution.md`).
- [ ] Screenshots at 360 and 1280: a service page, the hub, Before we come, the help page, a town page with its "Jobs we do here" line; look at each.
- [ ] A fresh reviewer over the branch (`superpowers:requesting-code-review`), fixes failing first, then green.
- [ ] `npm run score -- --round 9` with each earlier round scored on its own (memory); log the generations; CLAUDE.md (folder map: `content/services/`, `portland/`, `before-we-come.html`, `scripts/lib/crumbs.mjs`, `check-seo-audit`; "Add a service" under Pages are generated; the round 9 progress line); `GUESSES.md` current; merge to `main` and push.
