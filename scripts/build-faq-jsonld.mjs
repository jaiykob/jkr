/**
 * Derives FAQPage JSON-LD from a page's own visible questions.
 *
 *   node scripts/build-faq-jsonld.mjs          # write
 *   node scripts/build-faq-jsonld.mjs --check  # verify only, non-zero if stale (npm test)
 *
 * Opt in by marker: any hand written page with
 *   <!-- BUILD:faq-jsonld --> <!-- /BUILD:faq-jsonld -->
 * in its <head> gets a FAQPage block built from the <details> on the page
 * (inside its CITY:faq region if it has one, else inside <main>). Today that
 * is the homepage (inside its CITY:head, so town pages never inherit it) and
 * faq.html. Town pages and the hub get theirs from build-towns, which builds
 * the visible FAQ and the JSON-LD from the same list.
 *
 * Carried over from Scoops Co., for the same two reasons: Google's policy
 * requires FAQ markup to match what the page shows, and a hand kept second
 * copy drifts the moment an answer is edited. FAQ rich results are gone from
 * Google (2026), but AI answer engines and Bing still read FAQPage as high
 * confidence questions and answers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../api/_lib/site.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const PAGES = ['index.html', 'faq.html'];
const eol = (s) => s.replace(/\r\n/g, '\n');
const textOf = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();

/** The visible questions and answers on a page. */
export function questions(html) {
  const faqRegion = (html.match(/<!-- CITY:faq -->([\s\S]*?)<!-- \/CITY:faq -->/) || [])[1];
  const scope = faqRegion || (html.match(/<main[^>]*>([\s\S]*?)<\/main>/) || [])[1] || '';
  return [...scope.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
    .map((m) => ({ q: textOf(m[1]), a: textOf(m[2]) }))
    .filter((x) => x.q && x.a);
}

function block(file, html) {
  const url = file === 'index.html' ? `${site.SITE_URL}/` : `${site.SITE_URL}/${file}`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: questions(html).map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
  };
  return ['  <script type="application/ld+json">', JSON.stringify(ld, null, 2).replace(/^/gm, '  '), '  </script>'].join('\n');
}

const stale = [];
for (const file of PAGES) {
  const abs = path.join(ROOT, file);
  const raw = fs.readFileSync(abs, 'utf8');
  const before = eol(raw);
  const open = '<!-- BUILD:faq-jsonld -->', close = '<!-- /BUILD:faq-jsonld -->';
  const a = before.indexOf(open), b = before.indexOf(close);
  if (a < 0 || b < 0) throw new Error(`${file}: BUILD:faq-jsonld markers not found`);
  const indent = (before.slice(0, a).match(/[ \t]*$/) || [''])[0];
  const out = before.slice(0, a + open.length) + '\n' + block(file, before) + '\n' + indent + before.slice(b);
  if (out === before) continue;
  if (check) stale.push(file);
  else { fs.writeFileSync(abs, raw.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out); console.log(`build-faq-jsonld: wrote ${file}`); }
}
if (check) {
  if (stale.length) { console.error(`build-faq-jsonld --check: stale, run npm run build:\n  ${stale.join('\n  ')}`); process.exit(1); }
  console.log(`build-faq-jsonld --check: OK, FAQPage matches the visible questions on ${PAGES.join(', ')}`);
}
