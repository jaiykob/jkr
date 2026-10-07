/**
 * Everything Google checks before it will index a page, checked from here.
 *
 *   node scripts/check-indexability.mjs --local     # the built site on disk (npm test)
 *   node scripts/check-indexability.mjs             # live: https://www.<domain>
 *   node scripts/check-indexability.mjs --host https://www.brandhaul.com
 *
 * Carried over from Scoops Co. Search Console reports problems weeks late, in
 * words that rarely name the cause ("Crawled, currently not indexed"). Almost
 * all of it can be checked in seconds:
 *
 *   - robots.txt allows crawling and points at the sitemap
 *   - every sitemap URL is a real page (live: answers 200, not a redirect)
 *   - no sitemap page carries noindex (live: in the meta or X-Robots-Tag)
 *   - every page's canonical is itself, on the www host
 *   - every indexable page is in the sitemap
 *
 * With no domain yet (the placeholder in api/_lib/site.js), the live check has nothing to ask, so it
 * says so and runs the local check instead. Non-zero exit if anything would
 * block indexing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../api/_lib/site.js';
import { pages, urlOf } from './build-sitemap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const hostArg = args.includes('--host') ? args[args.indexOf('--host') + 1] : null;
const noDomain = !site.HAS_DOMAIN;
const local = args.includes('--local') || (noDomain && !hostArg);
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const canonicalOf = (html) => (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
const robotsOk = (txt, base) => /User-agent: \*/.test(txt) && !/^Disallow: \/\s*$/m.test(txt) && txt.includes(`Sitemap: ${base}/sitemap.xml`);

if (local) {
  if (noDomain && !args.includes('--local')) console.log(`No domain yet (${site.DOMAIN}): nothing live to check, so checking the built site instead.`);
  ok(robotsOk(read('robots.txt'), site.SITE_URL), `robots.txt must allow crawling and name ${site.SITE_URL}/sitemap.xml`);
  const sm = read('sitemap.xml');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const want = pages();
  for (const rel of want) ok(locs.includes(urlOf(rel)), `${rel} is indexable but not in the sitemap`);
  for (const loc of locs) {
    const rel = loc === `${site.SITE_URL}/` ? 'index.html' : loc.slice(site.SITE_URL.length + 1);
    if (!ok(loc.startsWith(`${site.SITE_URL}/`) && fs.existsSync(path.join(ROOT, rel)), `${loc}: no such page`)) continue;
    const html = read(rel);
    ok(!/<meta name="robots" content="noindex/.test(html), `${loc}: in the sitemap but marked noindex`);
    ok(canonicalOf(html) === loc, `${loc}: canonical is ${canonicalOf(html) || 'missing'}`);
  }
  if (fails.length) { console.error(`check-indexability (local): ✗ ${fails.length}\n  ✗ ${fails.slice(0, 15).join('\n  ✗ ')}`); process.exit(1); }
  console.log(`check-indexability (local): OK, ${locs.length} sitemap pages exist, are indexable and canonical to themselves`);
  process.exit(0);
}

// ── live ────────────────────────────────────────────────────────────────
const base = (hostArg || site.SITE_URL).replace(/\/+$/, '');
const get = async (url) => {
  try { const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'jkr-indexability-check' } }); return { status: r.status, headers: r.headers, text: r.status === 200 ? await r.text() : '' }; }
  catch (e) { return { status: 0, error: e.message, headers: new Headers(), text: '' }; }
};
const robots = await get(`${base}/robots.txt`);
ok(robots.status === 200 && robotsOk(robots.text, base), `${base}/robots.txt: ${robots.status || robots.error}, must allow crawling and name the sitemap`);
const sm = await get(`${base}/sitemap.xml`);
const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
ok(locs.length > 0, `${base}/sitemap.xml: ${sm.status || sm.error}, no URLs`);
for (const loc of locs) {
  const r = await get(loc);
  if (!ok(r.status === 200, `${loc}: HTTP ${r.status || r.error}${r.status >= 300 && r.status < 400 ? ` to ${r.headers.get('location')}` : ''}`)) continue;
  ok(!/noindex/i.test(r.headers.get('x-robots-tag') || ''), `${loc}: X-Robots-Tag noindex`);
  ok(!/<meta name="robots" content="noindex/.test(r.text), `${loc}: meta noindex`);
  ok(canonicalOf(r.text) === loc, `${loc}: canonical is ${canonicalOf(r.text) || 'missing'}`);
}
if (fails.length) { console.error(`check-indexability (${base}): ✗ ${fails.length}\n  ✗ ${fails.slice(0, 20).join('\n  ✗ ')}`); process.exit(1); }
console.log(`check-indexability (${base}): OK, ${locs.length} URLs answer 200, indexable, canonical to themselves`);
