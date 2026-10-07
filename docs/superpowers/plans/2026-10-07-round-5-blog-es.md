# Round 5: Blog, Spanish and Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A blog of twelve junk removal posts, the site in Spanish (homepage,
every town, the hub, the FAQ, the blog), a commercial request form, and the
founding member offer ported and switched off.

**Architecture:** Posts are plain text (`content/blog/en|es/<slug>.md`) built
by `scripts/build-blog.mjs` into `blog/` and `es/blog/` with BlogPosting
JSON-LD. Spanish pages that share the homepage template are the English
template run through a phrase map (`i18n/es.json`) by `scripts/build-es.mjs`
(the homepage) and `build-towns` (towns and hub, from each town file's
Spanish sections). The load builder, junk toss and ZIP check take their words
from `<html lang>`. hreflang pairs and a language switch on every page that
has a twin. `api/_lib/founding.js`, `api/founding-spots.js` and checkout carry
the founding offer, off. `book/commercial.html` and `api/commercial-lead.js`
take commercial requests.

**Spec:** `docs/superpowers/specs/2026-10-07-scoops-import-design.md` (Round 5).

## Global Constraints

- Spanish addresses the reader with "tú". The quote and checkout stay English.
- Copy rules in both languages: plain, no slang, no dashes as punctuation.
- Prices and fees never typed into a post; posts link to the price list.
- The founding offer is computed on the server and is off (`open: false`).
- Everything generated is checked by `--check` in `npm test`.

## Review Focus

1. **The homepage changes and the Spanish twin is not rebuilt:** `build-es --check` fails.
2. **A new English phrase with no Spanish:** the build fails and lists it.
3. **The founding offer shown but the last spot just went:** the server refuses with `founding_closed` and the page reprices (test).
4. **A Spanish visitor on a town page:** the language switch lands on that town's Spanish page, not the Spanish homepage.
5. **The commercial form's honeypot filled by a bot:** it answers 200 and stores nothing (test).

## Tasks

1. Round 5 scorecard, generation 0.
2. Founding offer, test first (`scripts/test-founding.mjs`).
3. Commercial form, test first (`scripts/test-commercial.mjs`).
4. Blog: generator, twelve English posts, index, JSON-LD, cards, sitemap.
5. Spanish template: `i18n/es.json`, `build-es`, JS strings, hreflang and the language switch, `es/faq.html`.
6. Spanish towns and hub: Spanish sections in every town file.
7. Spanish blog.
8. Docs, score to 100, review, merge.
