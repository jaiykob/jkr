/**
 * The technical SEO audit (round 9), over every page the sitemap lists.
 *
 *   node scripts/check-seo-audit.mjs     # non-zero, naming each page and problem (npm test)
 *
 * A page fails on:
 *   1. not exactly one <h1>;
 *   2. a title over 65 characters or shared with another page; a town page whose title lacks
 *      its town, or a service page, the hub or a homepage whose title lacks "Portland";
 *   3. a description outside 100 to 160 characters, or shared;
 *   4. a canonical that is not its own address; no og:image or twitter:card;
 *   5. below the homepages and the order page: no BreadcrumbList, or one whose names and
 *      addresses differ from the visible .crumbs trail;
 *   6. an internal link or src that does not resolve to a file (or to an id on that page);
 *   7. not reachable from index.html in 3 clicks or fewer;
 *   8. an <img> without alt, width and height.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../api/_lib/site.js';
import { pages } from './build-sitemap.mjs';
import { loadTowns } from './build-towns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const decode = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const meta = (html, re) => decode((html.match(re) || [])[1] || '');
// A folder's index.html is the folder, as the canonicals write it.
const urlOf = (rel) => `${site.SITE_URL}/${rel.replace(/(^|\/)index\.html$/, '$1')}`;
const NO_CRUMBS = new Set(['index.html', 'es/index.html', 'book/quote.html']);
const HUBS = new Set(['index.html', 'es/index.html', 'service-areas.html', 'es/service-areas.html']);
const towns = new Map(loadTowns().flatMap((t) => [[`${t.slug}.html`, t.name], [`es/${t.slug}.html`, t.name]]));

const list = pages();
const problems = [];
const bad = (rel, what) => problems.push(`${rel}: ${what}`);
const html = new Map(list.map((rel) => [rel, read(rel)]));

/** Every internal link on a page, as [file from the root, hash]. */
function linksOf(rel, src) {
  const out = [];
  const body = src.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of body.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const u = m[1];
    if (!u || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u)) continue;      // https:, tel:, mailto:, sms:
    const [p, hash = ''] = u.split('#');
    const file = p.split('?')[0];
    let target = file ? (file.startsWith('/') ? file.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(rel), file))) : rel;
    if (target === '' || target.endsWith('/')) target += 'index.html';
    out.push([target, hash]);
  }
  return out;
}
const idsCache = new Map();
const hasId = (rel, id) => {
  if (!idsCache.has(rel)) idsCache.set(rel, new Set([...read(rel).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsCache.get(rel).has(id);
};

const titles = new Map(), descs = new Map();
for (const rel of list) {
  const src = html.get(rel);
  const h1s = (src.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) bad(rel, `${h1s} <h1>, want exactly 1`);

  const title = meta(src, /<title>([\s\S]*?)<\/title>/);
  if (title.length > 65) bad(rel, `title is ${title.length} characters, want 65 or fewer: "${title}"`);
  const lang = rel.startsWith('es/') ? 'es' : 'en';
  const tk = `${lang}|${title}`;
  if (titles.has(tk)) bad(rel, `title "${title}" is also on ${titles.get(tk)}`); else titles.set(tk, rel);
  if (towns.has(rel) && !title.includes(towns.get(rel))) bad(rel, `title does not name ${towns.get(rel)}`);
  if ((HUBS.has(rel) || rel.startsWith('portland/')) && !/Portland/.test(title)) bad(rel, 'title does not name Portland');

  const desc = meta(src, /<meta name="description" content="([^"]*)"/);
  if (desc.length < 100 || desc.length > 160) bad(rel, `description is ${desc.length} characters, want 100 to 160`);
  if (descs.has(desc)) bad(rel, `description is also on ${descs.get(desc)}`); else descs.set(desc, rel);

  const canon = (src.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  if (canon !== urlOf(rel)) bad(rel, `canonical ${canon || '(none)'} is not ${urlOf(rel)}`);
  if (!/<meta property="og:image" content="[^"]+"/.test(src)) bad(rel, 'no og:image');
  if (!/<meta name="twitter:card" content="[^"]+"/.test(src)) bad(rel, 'no twitter:card');

  if (!NO_CRUMBS.has(rel)) {
    const lds = [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
      try { const j = JSON.parse(m[1]); return [j, ...(j['@graph'] || [])]; } catch { return []; }
    });
    const bl = lds.find((j) => j['@type'] === 'BreadcrumbList');
    const nav = (src.match(/<nav class="crumbs"[^>]*>([\s\S]*?)<\/nav>/) || [])[1];
    if (!bl) bad(rel, 'no BreadcrumbList');
    else if (!nav) bad(rel, 'a BreadcrumbList but no visible .crumbs trail');
    else {
      const seen = [...nav.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => {
        const a = m[1].match(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
        if (!a) return { name: decode(m[1]), url: urlOf(rel) };
        const [target] = linksOf(rel, ` href="${a[1]}"`)[0] || [rel];
        return { name: decode(a[2]), url: urlOf(target) };
      });
      const items = (bl.itemListElement || []).map((i) => ({ name: i.name, url: i.item }));
      const same = seen.length === items.length && seen.every((s, i) => s.name === items[i].name && s.url === items[i].url);
      if (!same) bad(rel, `breadcrumb trail ${JSON.stringify(seen.map((s) => s.name))} does not match its BreadcrumbList ${JSON.stringify(items.map((s) => s.name))}`);
    }
  }

  for (const [target, hash] of linksOf(rel, src)) {
    if (!fs.existsSync(path.join(ROOT, target))) { bad(rel, `links ${target}, which does not exist`); continue; }
    if (hash && target.endsWith('.html') && !hasId(target, decodeURIComponent(hash))) bad(rel, `links ${target}#${hash}, which has no such id`);
  }

  for (const m of src.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\salt="/.test(tag)) bad(rel, `an <img> without alt: ${tag.slice(0, 80)}`);
    if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) bad(rel, `an <img> without width and height: ${tag.slice(0, 80)}`);
  }
}

// 7. Three clicks from the homepage.
const depth = new Map([['index.html', 0]]);
let frontier = ['index.html'];
for (let d = 1; d <= 3; d++) {
  const next = [];
  for (const rel of frontier) {
    const src = html.get(rel) || (fs.existsSync(path.join(ROOT, rel)) ? read(rel) : '');
    for (const [target] of linksOf(rel, src)) {
      if (!target.endsWith('.html') || depth.has(target)) continue;
      depth.set(target, d);
      next.push(target);
    }
  }
  frontier = next;
}
for (const rel of list) if (!depth.has(rel)) bad(rel, 'not reachable from index.html in 3 clicks');

if (problems.length) {
  console.error(`check-seo-audit: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-seo-audit: OK, ${list.length} pages (one h1, titles, descriptions, canonicals, breadcrumbs, links, 3 clicks, images)`);
