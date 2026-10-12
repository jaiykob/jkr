# Round 8: Order Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The order page shows one step per page (Size, Where, When, Book) with a sticky progress bar, moving on by itself when a step is complete, so a homepage card books in 5 taps.

**Architecture:** `book/quote.html` keeps its sections; each gets `data-step` (the details and pay sections share `book`). `js/order.js` gains a `step` value and `go(step, how)`: it shows the step's sections, sets the hash (`pushState`, `replaceState` on load), the tab title, the progress bar, scrolls to the top and focuses the heading. `popstate` follows Back. The three completing actions (size pick, valid fifth ZIP digit, window tap) call `go` to the next step still to do. Everything else (state, render, Book, pay, refusals) stays, with `guide` and `showFailure` going to the step they name.

**Tech Stack:** static HTML, CSS, vanilla ES5 JS; the scorecard in Node over headless Chrome (`scripts/lib/browser.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-12-order-steps-design.md`

## Global Constraints

- No Next or Continue button: a step completes by its own choice.
- Text 16px+, taps 48px+, no sideways scroll at 360px; the progress bar's step buttons 48px tall.
- No price, window or fee typed in the page or script (round 6 `one-source` still holds).
- Copy rules: we/us/our, no dashes as punctuation; new words few (the step names Size, Where, When, Book; "Step N of 4"; "Back"; "Change").
- Stripe's card form mounts once and is only hidden between steps.
- Rounds 1 to 7 stay at 100; checks are walked to their step, never loosened.

## Review Focus

1. **Back after Book refused**: a window that fills while on Book goes to When; Back from there returns to Book with the contact kept.
2. **Deep links**: `#book` typed by hand with nothing chosen opens Size, not an empty Book page.
3. **A ZIP edited on Where after reaching Book**: the day list reloads for the new market and the old window is dropped if it is not free.
4. **Reduced motion**: step changes jump with no smooth scroll.
5. **Keyboard**: Tab order on each step starts at the progress bar, then the heading's content; the hidden steps take no focus.

---

### Task 0: the round 8 scorecard (generation 0)

**Files:** `scripts/score.mjs` (`ROUNDS[8]`, `PROBE_SETS[8]`, a `fillMin()` journey with no day tap), `docs/superpowers/evolution.md`.

- [ ] Write the eleven checks from the spec; run `node scripts/score.mjs --round 8 --no-earlier`; expect only `tests` (and `mobile` if the one page passes it) to pass; log gen 0; commit.

### Task 1: the step pages and the progress bar

**Files:** `book/quote.html` (the `o-steps` nav at the top of the form column; `data-step` on the five sections; the When page's place line with Change; section heads without the numbers and "Pick a size first" waits), `css/order.css` (the sticky bar, hidden steps, the place line), `js/order.js` (`STEPS`, `step`, `go`, `reachable`, `firstToDo`, hash and history, titles, focus).

- [ ] Run `one-step`, `skip`, `back`, `a11y`: expect FAIL.
- [ ] Build; run them: PASS. `npm test`. Commit.

### Task 2: moving on by itself

**Files:** `js/order.js` (`setSize` tap, `setZip` typed fifth digit, the window click call `go(next)`; the Book button only on Book; `guide` and `showFailure` go to their step), `book/quote.html` (none).

- [ ] Run `advance`, `taps`, `refusal`: expect FAIL.
- [ ] Build; run them: PASS. `npm test`. Commit.

### Task 3: earlier rounds walked to their step

**Files:** `scripts/score.mjs` (round 6 `phone` and `desktop` measure the size step and the form column; `fillOrder` waits for the When page after typing a ZIP; round 1 checks as needed).

- [ ] Run rounds 1 to 7; fix each check that measured the one page by walking it to its step (ledger a ruling per change); all 100.

### Task 4: finish

- [ ] Screenshots of each step at 360 and 1280; fresh review; fixes RED to GREEN; full scorecard; CLAUDE.md; merge.
