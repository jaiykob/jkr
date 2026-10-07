/**
 * Validates the structured data every page ships to Google and AI search.
 *
 *   node scripts/check-schema.mjs        # non-zero on any FAIL (npm test)
 *
 * Carried over from Scoops Co., where each check caught a real production
 * bug (2026-08-16):
 *
 *   1. PARSE   every application/ld+json block is valid JSON. A block that
 *              does not parse is invisible to Google, and nothing on screen
 *              changes, so only a check like this notices.
 *   2. PRICES  every price, lowPrice and highPrice is a real price: a load
 *              price from pricing.config.mjs plus a real travel fee (or none).
 *              Scoops Co. shipped schema advertising rates it no longer had.
 *   3. AREA    every City in areaServed is a place we serve: a town with a
 *              page (content/towns) or a ZIP place inside the travel zones.
 *   4. FAQ     every FAQPage has as many questions as the page shows.
 *   5. NAP     every telephone is the business phone (api/_lib/site.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICES, ZONES, ZIP_ZONES, ALL_ZIPS } from '../pricing.config.mjs';
import { loadTowns } from './build-towns.mjs';
import site from '../api/_lib/site.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', '.vercel', '.superpowers', '.claude', '.agents', 'docs', 'scripts', 'api', 'data', 'db']);

// Every price a page may honestly state: any load, any column, plus any zone fee.
const fees = [0, ...ZONES.map((z) => Math.round(z.fee * 100))];
const OK_PRICES = new Set(PRICES.flat().flatMap((c) => fees.map((f) => ((c + f) / 100).toFixed(2))));
const towns = loadTowns();
const OK_PLACES = new Set([
  ...towns.map((t) => `${t.name}, ${t.state}`),
  ...ALL_ZIPS.map((z) => `${ZIP_ZONES[z].place}, ${ZIP_ZONES[z].state}`),
]);

function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) htmlFiles(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
  }
  return out;
}
function* nodes(x) {
  if (Array.isArray(x)) { for (const y of x) yield* nodes(y); return; }
  if (!x || typeof x !== 'object') return;
  yield x;
  for (const v of Object.values(x)) if (v && typeof v === 'object') yield* nodes(v);
}

const fails = [];
let blocks = 0;
for (const abs of htmlFiles()) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  const html = fs.readFileSync(abs, 'utf8');
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    blocks++;
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { fails.push(`${rel}: JSON-LD does not parse (${e.message})`); continue; }
    for (const n of nodes(data)) {
      for (const k of ['price', 'lowPrice', 'highPrice']) {
        if (n[k] != null && !OK_PRICES.has(Number(n[k]).toFixed(2))) fails.push(`${rel}: ${k} ${n[k]} is not a load price plus a travel fee`);
      }
      if (n['@type'] === 'City' && !OK_PLACES.has(n.name)) fails.push(`${rel}: areaServed "${n.name}" is not a place we serve`);
      if (typeof n.areaServed === 'string' && !OK_PLACES.has(n.areaServed)) fails.push(`${rel}: areaServed "${n.areaServed}" is not a place we serve`);
      if (n.telephone && n.telephone !== site.PHONE_TEL) fails.push(`${rel}: telephone ${n.telephone} is not ${site.PHONE_TEL}`);
      if (n['@type'] === 'FAQPage') {
        const region = (html.match(/<!-- CITY:faq -->([\s\S]*?)<!-- \/CITY:faq -->/) || [])[1] || (html.match(/<main[^>]*>([\s\S]*?)<\/main>/) || [])[1] || '';
        const shown = (region.match(/<details[^>]*>\s*<summary/g) || []).length;
        if ((n.mainEntity || []).length !== shown) fails.push(`${rel}: FAQPage has ${(n.mainEntity || []).length} questions, the page shows ${shown}`);
      }
    }
    // Arrays of plain strings ("Gresham, OR") count as places too.
    for (const n of nodes(data)) if (Array.isArray(n.areaServed)) for (const a of n.areaServed) if (typeof a === 'string' && !OK_PLACES.has(a)) fails.push(`${rel}: areaServed "${a}" is not a place we serve`);
  }
}

if (fails.length) {
  console.error(`check-schema: ${fails.length} FAIL\n  FAIL ${fails.slice(0, 20).join('\n  FAIL ')}`);
  process.exit(1);
}
console.log(`check-schema: OK, ${blocks} JSON-LD blocks parse, every price, place, phone and FAQ is true`);
