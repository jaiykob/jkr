/**
 * English and Spanish twins: which pages have a Spanish copy, where the
 * language switch on a page goes, and the hreflang lines that tie a pair
 * together.
 *
 *   index.html          ↔ es/index.html           always (scripts/build-es.mjs)
 *   faq.html            ↔ es/faq.html             once es/faq.html exists (hand written)
 *   before-we-come.html ↔ es/before-we-come.html  once es/before-we-come.html exists (hand written)
 *   <town>.html         ↔ es/<town>.html          once the town file has a "## Local (es)" section
 *   service-areas.html  ↔ es/service-areas.html   once any town has Spanish
 *   blog/index.html     ↔ es/blog/index.html      once any post has Spanish
 *   blog/<post>.html    ↔ es/blog/<post>.html     once content/blog/es/<post>.md exists
 *
 * The answers come from the sources (town files, posts), not from the built
 * pages, so a build step can ask before the Spanish page is written. A page
 * with no twin (privacy, terms, the quote, the commercial form) gets no
 * hreflang, and its language switch goes to the Spanish homepage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../../api/_lib/site.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const mdIn = (dir) => (exists(dir) ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) : []);

const townSlugs = () => mdIn('content/towns');
/** True when the town file carries its Spanish sections. */
export const townHasEs = (slug) => exists(`content/towns/${slug}.md`) && /^## Local \(es\)[ \t]*$/m.test(read(`content/towns/${slug}.md`).replace(/\r\n/g, '\n'));
const esPosts = () => mdIn('content/blog/es');

/** Town names as written in the town files ("Happy Valley"), for anything that must not be translated. */
export function townNames() {
  return townSlugs().map((s) => ((read(`content/towns/${s}.md`).match(/^name:\s*(.+)$/m) || [])[1] || '').trim()).filter(Boolean);
}

/** Does this English page have a Spanish twin? */
export function hasEsTwin(enRel) {
  if (enRel === 'index.html') return true;
  if (enRel === 'faq.html') return exists('es/faq.html');
  if (enRel === 'before-we-come.html') return exists('es/before-we-come.html');
  if (enRel === 'service-areas.html') return townSlugs().some(townHasEs);
  if (enRel === 'blog/index.html') return esPosts().length > 0;
  const post = enRel.match(/^blog\/([a-z0-9-]+)\.html$/);
  if (post) return esPosts().includes(post[1]);
  const town = enRel.match(/^([a-z0-9-]+)\.html$/);
  if (town && townSlugs().includes(town[1])) return townHasEs(town[1]);
  return false;
}

/** The other language's page, or null. */
export function twinOf(rel) {
  if (rel.startsWith('es/')) return hasEsTwin(rel.slice(3)) ? rel.slice(3) : null;
  return hasEsTwin(rel) ? `es/${rel}` : null;
}

/** The public address of a page: a folder's index.html is the folder. */
export const absUrl = (rel) => `${site.SITE_URL}/${rel.replace(/(^|\/)index\.html$/, '$1')}`;

/** A link from one page to another, relative, as the site writes them. */
export const relHref = (from, to) => path.posix.relative(path.posix.dirname(from), to) || path.posix.basename(to);

/** The three hreflang lines for a page with a twin, or '' without one. */
export function hreflang(rel, indent = '  ') {
  const twin = twinOf(rel);
  if (!twin) return '';
  const [en, es] = rel.startsWith('es/') ? [twin, rel] : [rel, twin];
  return [['en', en], ['es', es], ['x-default', en]]
    .map(([l, r]) => `${indent}<link rel="alternate" hreflang="${l}" href="${absUrl(r)}" />`).join('\n');
}

/** The language switch for a page: its twin, or the other language's homepage. */
export function langSwitch(rel) {
  const toEn = rel.startsWith('es/');
  const target = twinOf(rel) || (toEn ? 'index.html' : 'es/index.html');
  const href = relHref(rel, target);
  return toEn
    ? `<a class="lang-switch" href="${href}" hreflang="en" lang="en"><span class="lang-full">English</span><span class="lang-short" aria-hidden="true">EN</span></a>`
    : `<a class="lang-switch" href="${href}" hreflang="es" lang="es"><span class="lang-full">Español</span><span class="lang-short" aria-hidden="true">ES</span></a>`;
}

/** Point the language switch already in a page's header at this page's twin. */
export const setLangSwitch = (html, rel) => html.replace(/<a class="lang-switch"[\s\S]*?<\/a>/, () => langSwitch(rel));
