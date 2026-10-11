/**
 * Builds the Spanish homepage, es/index.html, from index.html and the phrase
 * list in i18n/es.json.
 *
 *   node scripts/build-es.mjs          # write es/index.html
 *   node scripts/build-es.mjs --check  # verify only, non-zero if stale or a phrase has no Spanish (npm test)
 *
 * Carried over from Scoops Co. (i18n/home.es.json there). The English page is
 * the one source: every visible piece of text (and the labels screen readers
 * hear, the title and the description) is looked up in the phrase list and
 * swapped for its Spanish. Numbers are slots, so "Up to 10 road miles" and
 * "Up to 12 road miles" are one phrase ("Up to {0} road miles") and a price
 * or zone change never needs new Spanish. An English phrase with no Spanish
 * stops the build and is listed, so the two pages never drift apart.
 *
 * Not translated: scripts, styles, comments, drawings, place names and the
 * brand. The scripts take their own words from <html lang> (js/home.js,
 * js/founding.js).
 *
 * Links: a page with a Spanish twin is linked inside /es/ (scripts/lib/twins.mjs);
 * everything else (styles, scripts, the quote, privacy, terms) is one level up.
 * The quote and checkout stay English.
 *
 * Town pages use toSpanish() too (build-towns), with their Spanish sections.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import site from '../api/_lib/site.js';
import { ZIP_ZONES } from '../pricing.config.mjs';
import { faqBlock } from './build-faq-jsonld.mjs';
import { hasEsTwin, hreflang, absUrl, langSwitch, townNames } from './lib/twins.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_FILE = path.join(ROOT, 'i18n/es.json');
const eol = (s) => s.replace(/\r\n/g, '\n');
const NUM = /\d+(?:[.,]\d+)*/g;

/** The phrase list's key for a piece of text: spacing collapsed, numbers as {0}, {1}... */
export function phraseKey(s) {
  let i = 0;
  return String(s).replace(/\s+/g, ' ').trim().replace(NUM, () => `{${i++}}`);
}

export const loadMap = () => JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')).phrases;

/** Place names (towns and every ZIP's place) and the brand are never phrases. */
let placeCache = null;
export function places() {
  if (!placeCache) placeCache = [...new Set([...townNames(), ...Object.values(ZIP_ZONES).map((z) => z.place)])];
  return placeCache;
}

/**
 * Translates the text of an HTML string through a phrase map.
 * → { html, missing: [keys with no Spanish], used: Set of keys }
 */
export function translateHtml(html, map, { places: placeList = [], brand = site.NAME } = {}) {
  const missing = [], used = new Set();
  const placeSet = new Set(placeList);
  const wordy = (core) => {
    const rest = core.replace(/&[a-z]+;|&#\d+;/gi, ' ').split(brand).join(' ').replace(NUM, ' ');
    return /[A-Za-z]/.test(rest) && !placeSet.has(core.replace(/\s+/g, ' '));
  };
  const tr = (text) => {
    const core = text.trim();
    if (!core || !wordy(core)) return text;
    const key = phraseKey(core);
    if (!Object.prototype.hasOwnProperty.call(map, key)) { if (!missing.includes(key)) missing.push(key); return text; }
    used.add(key);
    const nums = core.match(NUM) || [];
    const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
    return lead + map[key].replace(/\{(\d+)\}/g, (m, n) => nums[+n]) + trail;
  };
  const attrs = (tag) => {
    let t = tag.replace(/(\s(?:aria-label|alt|title|placeholder)=")([^"]*)"/g, (m, a, v) => `${a}${tr(v)}"`);
    if (/^<meta\b/.test(t) && /\s(?:name="description"|property="og:(?:title|description)")/.test(t)) t = t.replace(/(\scontent=")([^"]*)"/, (m, a, v) => `${a}${tr(v)}"`);
    return t;
  };
  const out = eol(html).replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<svg\b[\s\S]*?<\/svg>|<[^>]+>|[^<]+/g, (tok) => {
    if (/^<(!--|script\b|style\b|svg\b)/.test(tok)) return tok;
    if (tok.startsWith('<')) return attrs(tok);
    return tr(tok);
  });
  return { html: out, missing, used };
}

/** A link written for a page at the site root, re-pointed for a page in /es/. */
export function esHref(u) {
  if (!u || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(u)) return u;
  const p = u.split(/[?#]/)[0];
  return hasEsTwin(p) ? u : `../${u}`;
}
const relinkEs = (html) => html
  .replace(/(\s(?:href|src)=")([^"]*)"/g, (m, a, u) => `${a}${esHref(u)}"`)
  .replace(/url\((?!['"]?(?:[a-z]+:|\/|#))(['"]?)/gi, 'url($1../');

/**
 * index.html (or a page built from it, at `rel` in the English site) in Spanish.
 * → { html, missing, used }
 */
export function toSpanish(enHtml, { rel = 'index.html', map = loadMap() } = {}) {
  const esRel = `es/${rel}`;
  const opts = { places: places() };
  const missing = [], used = new Set();
  const take = (r) => { r.missing.forEach((k) => { if (!missing.includes(k)) missing.push(k); }); r.used.forEach((k) => used.add(k)); return r.html; };
  // The language switch is not a phrase: it is set aside and rewritten for the Spanish page.
  let s = eol(enHtml).replace(/<a class="lang-switch"[\s\S]*?<\/a>/, '<!-- lang-switch -->');
  s = take(translateHtml(s, map, opts));
  s = s.replace('<html lang="en">', '<html lang="es">');
  s = s.replace(/(<link rel="canonical" href=")[^"]*(" \/>)/, `$1${absUrl(esRel)}$2`);
  s = s.replace(/(<meta property="og:url" content=")[^"]*(" \/>)/, `$1${absUrl(esRel)}$2`);
  s = s.replace(/(<meta property="og:image" content="[^"]*\/images\/og\/)([^"/]+\.png)"/, (m, a, f) => `${a}es-${f}"`);
  s = s.replace(/\n[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>/g, '');
  const hl = hreflang(esRel);
  if (hl) s = s.replace(/(\n[ \t]*<link rel="canonical" href="[^"]*" \/>)/, `$1\n${hl}`);
  s = relinkEs(s);
  // The FAQ schema is rebuilt from the Spanish questions, at the Spanish address.
  const open = '<!-- BUILD:faq-jsonld -->', close = '<!-- /BUILD:faq-jsonld -->';
  const a = s.indexOf(open), b = s.indexOf(close);
  if (a >= 0 && b > a) {
    const indent = (s.slice(0, a).match(/[ \t]*$/) || [''])[0];
    s = s.slice(0, a + open.length) + '\n' + faqBlock(esRel, s) + '\n' + indent + s.slice(b);
  }
  s = s.replace('<!-- lang-switch -->', langSwitch(esRel));
  return { html: s, missing, used };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const map = loadMap();
  const r = toSpanish(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), { map });
  if (r.missing.length) {
    console.error(`build-es: ${r.missing.length} English phrase(s) on index.html have no Spanish in i18n/es.json:\n  ${r.missing.join('\n  ')}`);
    process.exit(1);
  }
  const out = path.join(ROOT, 'es/index.html');
  const before = fs.existsSync(out) ? eol(fs.readFileSync(out, 'utf8')) : '';
  if (check) {
    if (before !== r.html) { console.error('build-es --check: es/index.html is stale, run npm run build'); process.exit(1); }
    console.log(`build-es --check: OK, es/index.html matches index.html (${r.used.size} phrases)`);
  } else {
    if (before !== r.html) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, r.html); console.log('build-es: wrote es/index.html'); }
    else console.log('build-es: es/index.html already up to date');
  }
}
