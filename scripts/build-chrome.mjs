/**
 * Writes the shared header, footer and sticky "Get my price" button into
 * every hand written page that carries the markers.
 *
 *   node scripts/build-chrome.mjs          # write
 *   node scripts/build-chrome.mjs --check  # verify only, non-zero if stale (npm test)
 *
 * Ported from Scoops Co. (2026-10-07). The homepage is the one place the
 * header and footer are written: this copies its <nav>,
 * <footer> and sticky button out of index.html and splices them between
 *
 *   <!-- BUILD:site-header -->  <!-- BUILD:site-footer -->  <!-- BUILD:site-sticky -->
 *
 * on every page that has them (the FAQ, legal pages, 404, and later the blog).
 * Change the homepage menu or footer, run this, and every page follows.
 * Pages in es/ take theirs from es/index.html, the Spanish homepage that
 * scripts/build-es.mjs makes from index.html, so they read in Spanish. On
 * every page the language switch is pointed at that page's own twin
 * (scripts/lib/twins.mjs), or the other language's homepage.
 * Town pages and the hub don't need it: they are built from index.html whole
 * (scripts/build-towns.mjs). The quote and checkout keep their slim header on
 * purpose, with no menu to wander off through before paying.
 *
 * Links are re-pointed for the page they land on: "#pricing" becomes
 * "index.html#pricing", and relative paths get the page's depth. 404.html is
 * served at any URL (/blog/x/missing), so its links are root relative
 * ("/faq.html") and work from anywhere.
 *
 * The header and footer CSS already lives in css/site.css, which every one of
 * these pages loads; there is no CSS to copy (Scoops Co. had to).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setLangSwitch } from './lib/twins.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', '.agents', '.superpowers', '.claude']);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const eol = (s) => s.replace(/\r\n/g, '\n');

/** One element's outer HTML, found by its opening tag. */
function grab(src, open, close, file) {
  const a = src.indexOf(open);
  const b = a < 0 ? -1 : src.indexOf(close, a);
  if (a < 0 || b < 0) throw new Error(`${file}: ${open} not found`);
  return src.slice(a, b + close.length);
}

const bare = (s) => s.replace(/[ \t]*<!--[\s\S]*?-->\n?/g, '').replace(/\n[ \t]*\n/g, '\n');
/** The header, footer and sticky button of a homepage. */
function chromeOf(file) {
  const src = read(file);
  return {
    page: 'index.html',
    skip: grab(src, '<a class="skip-link"', '</a>', file),
    nav: bare(grab(src, '<nav class="site-nav">', '</nav>', file)),
    footer: bare(grab(src, '<footer>', '</footer>', file)),
    sticky: grab(src, '<a class="sticky-cta"', '</a>', file),
  };
}
const HOME = chromeOf('index.html');
const HOME_ES = fs.existsSync(path.join(ROOT, 'es/index.html')) ? chromeOf('es/index.html') : null;

function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) htmlFiles(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
  }
  return out;
}

/** Re-point one URL from the homepage it was written for to this page. */
function repoint(up, u) {
  if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(u)) return u;        // tel:, https:, root relative
  if (u === '#') return up + 'index.html';                   // the logo
  if (u.startsWith('#')) return up + 'index.html' + u;       // homepage sections
  return up + path.posix.normalize(u);
}
const relink = (up, html) => html.replace(/(\s(?:href|src)=")([^"]*)"/g, (m, a, u) => `${a}${repoint(up, u)}"`);

function splice(text, name, body, file) {
  const open = `<!-- BUILD:${name} -->`;
  const close = `<!-- /BUILD:${name} -->`;
  const a = text.indexOf(open);
  const b = text.indexOf(close);
  if (a < 0 || b < 0) throw new Error(`marker BUILD:${name} not found in ${file}`);
  const indent = (text.slice(0, a).match(/[ \t]*$/) || [''])[0];
  return text.slice(0, a + open.length) + '\n' + body + '\n' + indent + text.slice(b);
}

const stale = [];
let n = 0;
for (const abs of htmlFiles()) {
  const before = fs.readFileSync(abs, 'utf8');
  if (!before.includes('<!-- BUILD:site-header -->')) continue;
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  // A Spanish page takes the Spanish chrome, whose links are written from es/.
  const es = rel.startsWith('es/');
  const home = es ? HOME_ES : HOME;
  if (!home) throw new Error(`${rel}: es/index.html is missing, run npm run build (build-es) first`);
  // The 404 page answers at any depth, so its links start at the site root.
  const up = rel === '404.html' ? '/' : '../'.repeat(rel.split('/').length - (es ? 2 : 1));
  let out = splice(eol(before), 'site-header', `${home.skip}\n${relink(up, home.nav)}`, rel);
  out = splice(out, 'site-footer', relink(up, home.footer), rel);
  // Optional: a page whose own button is the call to action leaves it out.
  if (out.includes('<!-- BUILD:site-sticky -->')) out = splice(out, 'site-sticky', relink(up, home.sticky), rel);
  // The language switch goes to this page's twin (404's stays root relative).
  if (rel !== '404.html') out = setLangSwitch(out, rel);
  n++;
  if (out === eol(before)) continue;
  if (check) stale.push(rel);
  else { fs.writeFileSync(abs, out); console.log(`build-chrome: wrote ${rel}`); }
}

if (check) {
  if (stale.length) {
    console.error(`build-chrome --check: ${stale.length} page(s) stale, run \`npm run build:chrome\`:\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`build-chrome --check: OK, ${n} pages share the homepage header and footer`);
} else if (!n) console.log('build-chrome: no pages carry the markers yet');
