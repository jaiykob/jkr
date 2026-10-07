# Evolution log

How the import (Part 1 of the plan) is built, at the founder's request
(2026-10-07): every round starts with two competing plans. Each is scored,
and a child plan takes the best of both. The child is built. The build is
scored by `npm run score` (a script that tests real things, so the number is
not an opinion), and every generation's score is compared with every earlier
one. A round is done at **100**.

- **Plan score**: ten criteria, 10 points each, written down below before
  scoring.
- **Build score**: `node scripts/score.mjs --round N`. Every check is listed
  with its points. Generation 0 is `main` before the round starts.

## Plan rubric (10 points each)

1. **Coverage**: every bullet of the round in the spec maps to a task.
2. **Server authority**: the server recomputes everything that costs money and
   trusts nothing from the page.
3. **One source**: every number lives in `pricing.config.mjs` and
   `check:pricing` catches drift.
4. **Few copies**: the fewest places the same data is written (page weight,
   drift points).
5. **Testable**: each task starts from a failing test or check.
6. **House style**: fits the repo's patterns (BUILD markers, CommonJS API, no
   bundler, plain JS in the browser).
7. **Clear to the customer**: travel is its own line everywhere a price shows.
8. **Guesses marked**: every guessed value shows red with an asterisk and can
   be listed in one command.
9. **Failure handling**: unknown ZIP, too far, stale quote, missing data each
   have a defined, tested behavior.
10. **Small steps**: low blast radius, each task mergeable on its own.

---

## Round 1: service area and travel pricing

### Plan A: inline everything

Follow the existing pattern to the letter. `build-pricing` writes the full
ZIP to zone table into every BUILD block that needs it: the server
(`create-booking.js`), the quote page (twice: `quote-zips` and the
`LOAD_BUILDER` data), the checkout page and the homepage. Each page has its
own small lookup function. Guessed prices get a `guess` class where they are
generated.

| # | Criterion | Score | Why |
| --- | --- | --- | --- |
| 1 | Coverage | 10 | Every spec bullet has a task. |
| 2 | Server authority | 10 | Server looks the ZIP up in its own copy. |
| 3 | One source | 9 | All generated, but five lookup functions written by hand can disagree. |
| 4 | Few copies | 4 | About 160 ZIPs written five times; the homepage and quote carry it twice. |
| 5 | Testable | 7 | The server copy is testable; the four page copies are not. |
| 6 | House style | 10 | Exactly the current pattern. |
| 7 | Clear to the customer | 9 | Travel line on every surface. |
| 8 | Guesses marked | 6 | Marked where generated; JS-rendered prices are missed. |
| 9 | Failure handling | 8 | Too far and stale covered; page copies untested. |
| 10 | Small steps | 9 | Each surface is its own task. |
| | **Total** | **82** | |

### Plan B: one generated travel module

`build-pricing` writes two whole files instead of blocks: `api/_lib/travel.js`
(server, CommonJS) and `js/travel.js` (browser). Both hold the ZIP table and
the same `travelFor(zip)` function, emitted from one template. Every page and
every server file asks those modules. A `GUESS` flag set in the config drives
a red `.guess` style everywhere, including prices drawn by JavaScript.

| # | Criterion | Score | Why |
| --- | --- | --- | --- |
| 1 | Coverage | 9 | Misses the homepage area list and JSON-LD `areaServed`. |
| 2 | Server authority | 10 | Server uses its module; the page module is display only. |
| 3 | One source | 10 | One template, one function, two emitted copies checked to agree. |
| 4 | Few copies | 9 | Two copies of the table; the browser one is cached across pages. |
| 5 | Testable | 9 | Both modules load in Node; a test proves they agree for every ZIP. |
| 6 | House style | 7 | Whole generated files are new here; pages need one more script tag. |
| 7 | Clear to the customer | 9 | Travel line on every surface. |
| 8 | Guesses marked | 9 | Flag driven, so JS-drawn prices are marked too. |
| 9 | Failure handling | 9 | One tested lookup covers every caller. |
| 10 | Small steps | 7 | The module lands before anything uses it; a bigger first step. |
| | **Total** | **88** | |

### Child 1 (A × B)

From B: the two generated modules, one template, the agreement test, flag
driven guess marking. From A: keep BUILD blocks for per-page data (prices,
labels, the homepage area list, JSON-LD), and one task per surface, so each
step is small and reviewable. New in the child: the scorecard is written
first (the fitness function before the code), and `npm run guesses` lists
every guess for later.

| # | Criterion | Score | Why |
| --- | --- | --- | --- |
| 1 | Coverage | 10 | Every spec bullet, plus area list and JSON-LD from A. |
| 2 | Server authority | 10 | Server module only. |
| 3 | One source | 10 | From B. |
| 4 | Few copies | 9 | From B. |
| 5 | Testable | 10 | Scorecard first, unit tests for both modules, headless page checks. |
| 6 | House style | 10 | Modules sit beside BUILD blocks; `api/_lib/` already holds shared code. |
| 7 | Clear to the customer | 10 | Travel line everywhere, and the price waits for a ZIP instead of guessing it. |
| 8 | Guesses marked | 10 | Flag driven red asterisk plus `npm run guesses`. |
| 9 | Failure handling | 10 | Far ZIP, unknown ZIP, stale quote, ZIP+4, bad override: each tested. |
| 10 | Small steps | 10 | Module task is small because the scorecard and config come first. |
| | **Total** | **100** | |

Child 1 reaches 100 on the plan rubric, so it is the plan:
`docs/superpowers/plans/2026-10-07-round-1-travel-pricing.md`.

```mermaid
graph TD
  A["Plan A · inline everything · 82"] --> C1["Child 1 · 100"]
  B["Plan B · generated module · 88"] --> C1
  C1 --> G0["Build gen 0 · main before round 1"]
```

### Build generations

| Gen | Parent | What changed | Score | Best so far |
| --- | --- | --- | --- | --- |
| 0 | main (e702c16) | nothing yet: the scorecard alone | 12 | 12 |
| 1 | gen 0 | measured ZIP miles (Task 2) | 17 | 17 |
| 2 | gen 1 | zones, travel module (Task 3); guess marking (Task 4) | 32 | 32 |
| 3 | gen 2 | truck "+ travel", homepage zones and metro copy (Task 6); score moved to real 360px emulation | 50 | 50 |
| 4 | gen 3 | quote page prices travel, far ZIP call back, 16px and 48px fixes (Task 7) | 70 | 70 |
| 5 | gen 4 | checkout and thanks travel lines (Task 8) | 80 | 80 |
| 6 | gen 5 | scorecard reads nested tags (the thanks page was right, the reader was not) | 85 | 85 |
| 7 | gen 6 | Discord, email, database, dashboard (Task 9) | 95 | 95 |
| 8 | gen 7 | photo prompt and CLAUDE.md (Task 10); GUESSES.md picked up CLAUDE.md's description of the marker | 83 | 95 |
| 9 | gen 8 | CLAUDE.md excluded from the guess scan (it documents the convention) | **100** | **100** |

Every generation scored against the same 15 checks; the only regression
(gen 8, 95 → 83) was one stale generated list, fixed in gen 9.

```mermaid
graph LR
  G0["gen 0 · 12"] --> G1["gen 1 · 17"] --> G2["gen 2 · 32"] --> G3["gen 3 · 50"] --> G4["gen 4 · 70"]
  G4 --> G5["gen 5 · 80"] --> G6["gen 6 · 85"] --> G7["gen 7 · 95"] --> G8["gen 8 · 83"] --> G9["gen 9 · 100"]
```

---

## Round 2: pages and site parts

Rubric for this round (10 points each): **coverage** of the spec's round 2;
**one source** (each repeated part written once); **doorway defence** (real,
different local copy per town); **drift protection** (every generated page
checked); **testable**; **house style**; **founder can edit** (copy in one
obvious, plain place); **guesses marked**; **mobile and copy rules** (16px,
48px, no dashes); **small steps**.

### Plan A: port the Scoops Co. builders as they are

`build-chrome.mjs` and `build-home-layout.mjs` copied over. Each town page is
bootstrapped once from a template and its copy is then edited on the page,
between `CITY:` markers. The town list lives in the script.

| Coverage | One source | Doorway | Drift | Testable | House | Editable | Guesses | Rules | Steps | **Total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9 | 7 | 7 | 10 | 8 | 10 | 6 | 8 | 9 | 8 | **82** |

Weak spots: 40 pages bootstrapped from one template are near copies until
someone rewrites each; ZIPs typed again in the script; the founder edits 40
HTML files.

### Plan B: data driven town pages

A `towns.config.mjs` holds every town (ZIPs and all copy). Town pages are
generated whole from `index.html` plus that data; the hub too. Standalone
pages (FAQ, legal, 404) are written by hand with chrome markers.

| Coverage | One source | Doorway | Drift | Testable | House | Editable | Guesses | Rules | Steps | **Total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10 | 9 | 10 | 10 | 7 | 7 | 9 | 9 | 7 | **88** |

Weak spots: 40 towns of copy inside one JavaScript file is easy to break with
a stray quote; one big generator lands in one step.

### Child 1 (A × B)

From B: data driven, generated whole, uniqueness tested. From A: the chrome
builder ported nearly verbatim, and `CITY:` markers placed in `index.html`
itself so the homepage declares what a town page swaps. Built in small steps
(chrome, standalone pages, generator on three towns, then all forty, then the
hub).

| Coverage | One source | Doorway | Drift | Testable | House | Editable | Guesses | Rules | Steps | **Total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10 | 10 | 10 | 10 | 10 | 8 | 9 | 9 | 10 | **96** |

Still short: copy in a JS file (editable 8), and guesses in copy need a
simpler mark than an HTML span (guesses 9), and nothing yet checks text size
on the new pages (rules 9).

### Child 2 (child 1 + one mutation)

One plain text file per town, `content/towns/<slug>.md`: a few `key: value`
lines (name, state, ZIPs, the one line under the headline, neighborhoods),
then `## Local` paragraphs and `## FAQ` with `Q:` and `A:` lines. The folder
is the town list. `[[double brackets]]` mark a guess and print red with an
asterisk. The scorecard probes text size and tap size on every new page type.

| Coverage | One source | Doorway | Drift | Testable | House | Editable | Guesses | Rules | Steps | **Total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | **100** |

```mermaid
graph TD
  A2["Plan A · Scoops port · 82"] --> C21["Child 1 · 96"]
  B2["Plan B · data driven · 88"] --> C21
  C21 -->|"copy in plain text files, [[guess]] mark, size probes"| C22["Child 2 · 100"]
```

Plan: `docs/superpowers/plans/2026-10-07-round-2-pages.md`.

### Build generations

| Gen | Parent | What changed | Score | Best so far |
| --- | --- | --- | --- | --- |
| 0 | main (e2133dd) | nothing yet: the round 2 scorecard alone | 15 | 15 |
| 1 | gen 0 | chrome, analytics, banner (Task 2); FAQ, privacy, terms, 404 (Task 3) | 25 | 25 |
| 2 | gen 1 | town generator and all forty towns (Tasks 4 and 5) | 75 | 75 |
| 3 | gen 2 | hub page, zone list linking towns, 16px labels (Task 6); docs (Task 7) | **100** | **100** |

Round 1 re-scored at 100 after round 2: nothing it checks regressed.

```mermaid
graph LR
  R0["gen 0 · 15"] --> R1["gen 1 · 25"] --> R2["gen 2 · 75"] --> R3["gen 3 · 100"]
```

---

## Round 3: business docs and follow-up

Rubric (10 points each): **coverage**; **one source** (prices, zones and
towns in the docs come from the config, not retyped); **accuracy** (no
leftover dog or Scoops Co. facts, no claims we can't back, guesses marked);
**safety** (helpers draft by default, never auto post, quiet hours, opt out);
**testable**; **house style**; **founder can use it** (plain checklists);
**guesses marked**; **copy rules**; **small steps**.

### Plan A: port the Scoops Co. docs and helpers, swap the words

| Coverage | One source | Accuracy | Safety | Testable | House | Usable | Guesses | Rules | Steps | **Total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9 | 5 | 6 | 10 | 6 | 9 | 8 | 7 | 7 | 8 | **75** |

Fast, and the helpers' safety rules carry over intact. But every price and
ZIP is retyped (they drifted at Scoops Co. twice), and a word swap leaves
dog facts hiding in the details.

### Plan B: write fresh, numbers generated

| Coverage | One source | Accuracy | Safety | Testable | House | Usable | Guesses | Rules | Steps | **Total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10 | 9 | 8 | 8 | 7 | 8 | 8 | 9 | 7 | **84** |

Accurate and drift proof, but rewriting the helpers' guardrails from scratch
risks losing hard won rules (quiet hours, dedupe, the A2P gate).

### Child (A × B)

From B: a `build-docs` step writes the price table, zones and town count into
the docs and the helpers' shared context between BUILD markers, checked in
`npm test`; everything else written fresh for junk removal. From A: the
helpers' guardrails carried over word for word where they are not about dogs
(MODE draft, quiet hours, dedupe, the SMS gate, never auto post). Added: the
customer emails the helpers send are cleaned to the copy rules and tested by
rendering them; the owner booking email is test first.

| Coverage | One source | Accuracy | Safety | Testable | House | Usable | Guesses | Rules | Steps | **Total** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | **100** |

```mermaid
graph TD
  A3["Plan A · port and swap · 75"] --> C3["Child · 100"]
  B3["Plan B · fresh, generated · 84"] --> C3
```

Plan: `docs/superpowers/plans/2026-10-07-round-3-business.md`.

### Build generations

| Gen | Parent | What changed | Score | Best so far |
| --- | --- | --- | --- | --- |
| 0 | main (ddb27df) | nothing yet: the round 3 scorecard alone | 10 | 10 |
| 1 | gen 0 | build-docs and the helpers' shared context (Task 2); not scored on its own | n/a | 10 |
| 2 | gen 1 | business plan, launch checklist, accounts, progress, punch list (Task 3) | 35 | 35 |
| 3 | gen 2 | marketing (Task 4); the copy check then caught the old business name | 55 | 55 |
| 4 | gen 3 | owner email, customer emails cleaned (Task 5); helpers (Task 6) | 95 | 95 |
| 5 | gen 4 | Supabase keep-alive, CLAUDE.md (Task 7) | **100** | **100** |

Rounds 1 and 2 re-scored at 100 after round 3.

```mermaid
graph LR
  Q0["gen 0 · 10"] --> Q1["gen 1 · not scored"] --> Q2["gen 2 · 35"] --> Q3["gen 3 · 55"] --> Q4["gen 4 · 95"] --> Q5["gen 5 · 100"]
```
