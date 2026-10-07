# Round 3: Business Docs and Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** jkr gets the business side Scoops Co. has: a business plan, launch
checklist, accounts list, progress log and punch list; marketing copy; four
lead follow-up helpers with a shared context; an owner email on every
booking; and the Supabase keep-alive, all for metro junk removal.

**Architecture:** Hand written Markdown, with the facts that change (prices,
zones, fees, town count, service area) generated into BUILD blocks by
`scripts/build-docs.mjs` from `pricing.config.mjs` and `content/towns/`, and
checked by `--check` in `npm test`. The owner email is a new template sent by
the Stripe webhook beside the Discord ping, each failing on its own.

**Tech Stack:** Markdown, Node scripts, CommonJS API, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-07-scoops-import-design.md` (Round 3).
Evolution log: `docs/superpowers/evolution.md`.

## Global Constraints

- Copy a customer reads (marketing, helper messages, emails): "we / us / our", plain, no slang, **no dashes as punctuation**.
- Guesses: unknown facts get a `GUESS*` marker (docs) or red (pages); `GUESSES.md` lists them.
- Helpers draft by default (`MODE: draft`); nothing posts to Facebook or Nextdoor on its own; SMS stays draft until A2P 10DLC.
- No secrets in the repo. The keep-alive reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from GitHub secrets only.
- Fail soft: an email or Discord failure never fails the webhook.

## Review Focus

1. **`OPS_EMAIL` unset**: the booking still goes through and Discord still pings; no owner email, no error. Test in Task 5.
2. **Discord down**: the owner email still sends. Test in Task 5.
3. **A webhook redelivery**: the owner email is keyed by event id, so it does not send twice. Test in Task 5.
4. **A lead from a ZIP past the last zone**: the helpers flag it for a hand quote and do not pitch an online price. Written into each helper's guardrails; score checks it.
5. **A price change in the config**: docs and the helpers' context follow on the next build; `--check` fails until they do. Task 2.

---

### Task 1: Round 3 scorecard, generation 0
Checks: `tests` 10 · `docs` 10 · `numbers` 10 (build-docs --check; no dog
prices) · `launch` 10 (every env var, the gates, webhook host, schema and
migration, Washington, base point, radius decision, GUESSES.md, analytics ID,
domain) · `marketing` 10 · `helpers` 15 (frontmatter, draft mode, quiet
hours, dedupe, STOP, never auto post, zone gate, columns match the leads table,
generated price table) · `owner-email` 15 (test-ops owner section) ·
`keepalive` 5 · `copy` 10 (marketing, helper templates and every rendered
email: no dashes, slang, dog words or TODO) · `guesses` 5.

### Task 2: build-docs and the shared context
`scripts/build-docs.mjs` writes `BUILD:docs-prices`, `BUILD:docs-zones`,
`BUILD:docs-area` blocks into any `.md` that carries them.
`agent/skills/_shared/jkr-context.md` is written with those blocks.

### Task 3: Business docs
`BUSINESS_PLAN.md`, `LAUNCH-DAY.md`, `ACCOUNTS.md`, `PROGRESS.md`, `PUNCHLIST.md`.

### Task 4: Marketing
`marketing/ad-copy/{README,flyer-door-hanger,facebook-group-posts,short-form}.md`,
`marketing/{facebook-groups,gbp-optimization}.md`.

### Task 5: Owner email, clean customer emails
Test first in `scripts/test-ops.mjs` (`== owner email ==`, `== customer emails ==`):
`ownerBooking` template; webhook sends it to `OPS_EMAIL` on a new booking,
keyed `${event.id}:owner`; every customer template renders without dashes,
slang or TODO.

### Task 6: Follow-up helpers
`agent/skills/{speed-to-lead,quote-followup,review-request,lead-research-briefing}/SKILL.md`.

### Task 7: Keep-alive, docs, 100
`.github/workflows/supabase-keepalive.yml`; `CLAUDE.md`; evolution log; score to 100; review; merge.
