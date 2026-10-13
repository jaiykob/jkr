/**
 * Builds the blog from plain text posts.
 *
 *   node scripts/build-blog.mjs          # write blog/ and es/blog/
 *   node scripts/build-blog.mjs --check  # verify only, non-zero if stale (npm test)
 *
 * Each post is content/blog/en/<slug>.md (and its Spanish twin, if any,
 * content/blog/es/<slug>.md, the same slug):
 *
 *   title: What junk removal costs in the Portland metro
 *   description: One sentence for search results, 100 to 160 characters.
 *   summary: One line for the blog index.
 *   date: 2026-10-07
 *
 *   Opening paragraph.
 *
 *   ## A heading
 *   A paragraph with a [link](/book/quote.html), **bold**, and [[a guess]].
 *
 *   - a list item
 *
 * Links written from the site root (/book/quote.html, /portland.html) are
 * rewritten for the page's folder. [[double brackets]] print red with an
 * asterisk, like everywhere else. Prices are never typed into a post: link to
 * the price list (/index.html#pricing) so a post cannot go stale.
 *
 * Every post gets the shared header and footer (scripts/build-chrome.mjs),
 * BlogPosting JSON-LD, a share card (scripts/build-og-cards.mjs), and a
 * place in the sitemap. Carried over from Scoops Co.'s blog, rebuilt from
 * plain text so the founder can write a post without touching HTML.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import site from '../api/_lib/site.js';
import { crumbs } from './lib/crumbs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eol = (s) => s.replace(/\r\n/g, '\n');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const T = {
  en: {
    lang: 'en', dir: 'blog', home: 'Home', blog: 'Blog', blogTitle: 'Junk removal guides and answers',
    blogLede: 'Plain answers about clearing out a home, a garage or a rental in the Portland metro: what things cost, what can go, and where it ends up.',
    indexTitle: 'Junk Removal Blog: Guides and Answers | Haulmighty',
    indexDesc: 'Plain guides to junk removal in the Portland metro: costs, what haulers can and cannot take, mattresses, fridges, garage and estate cleanouts.',
    read: (n) => `${n} minute read`, ctaTitle: 'Ready when your junk is', ctaText: 'Snap a photo. See your price, travel included. We do the lifting.',
    ctaQuote: 'Get my price', ctaAreas: 'Where we haul', back: 'All posts', dateFmt: 'en-US',
  },
  es: {
    lang: 'es', dir: 'es/blog', home: 'Inicio', blog: 'Blog', blogTitle: 'Guías y respuestas sobre el retiro de basura',
    blogLede: 'Respuestas claras para vaciar una casa, un garaje o una vivienda de renta en el área de Portland: cuánto cuesta, qué se puede llevar y a dónde va.',
    indexTitle: 'Blog de Retiro de Basura: Guías | Haulmighty',
    indexDesc: 'Guías claras sobre el retiro de basura en el área de Portland: precios, qué se puede llevar, colchones, refrigeradores y limpieza de garajes y casas.',
    read: (n) => `${n} minutos de lectura`, ctaTitle: 'Listos cuando tú lo estés', ctaText: 'Toma una foto. Ve tu precio con el viaje incluido. Nosotros cargamos.',
    ctaQuote: 'Ver mi precio', ctaAreas: 'Dónde trabajamos', back: 'Todas las publicaciones', dateFmt: 'es-US',
  },
};

/** One post file → { slug, lang, title, description, summary, date, body (markdown) }. */
export function parsePost(text, file, lang) {
  const s = eol(text);
  const slug = path.basename(file, '.md');
  const fail = (m) => { throw new Error(`content/blog/${lang}/${slug}.md: ${m}`); };
  const lines = s.split('\n');
  const meta = {};
  let i = 0;
  for (; i < lines.length && /^[a-z]+:\s/.test(lines[i]); i++) { const [k, ...v] = lines[i].split(':'); meta[k.trim()] = v.join(':').trim(); }
  const body = lines.slice(i).join('\n').trim();
  for (const k of ['title', 'description', 'summary', 'date']) if (!meta[k]) fail(`no "${k}:" line`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) fail('date must be YYYY-MM-DD');
  if (/\$\d/.test(body)) fail('a price is typed into the post; link to /index.html#pricing instead');
  return { slug, lang, title: meta.title, description: meta.description, summary: meta.summary, date: meta.date, body };
}

export function loadPosts(lang) {
  const dir = path.join(ROOT, 'content/blog', lang);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => parsePost(fs.readFileSync(path.join(dir, f), 'utf8'), f, lang))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/** The markdown subset posts use, to HTML. `up` re-points site root links. */
function inlineMd(s, up) {
  return esc(s)
    .replace(/\[\[([\s\S]+?)\]\]/g, '<span class="guess">$1</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${u.startsWith('/') ? up + u.slice(1) : u}">${t}</a>`);
}
export function renderMd(md, up) {
  const out = [];
  for (const block of md.split(/\n\s*\n/)) {
    const b = block.trim();
    if (!b) continue;
    if (b.startsWith('### ')) out.push(`<h3>${inlineMd(b.slice(4), up)}</h3>`);
    else if (b.startsWith('## ')) { const h = b.slice(3); out.push(`<h2 id="${h.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/g, '-').replace(/^-|-$/g, '')}">${inlineMd(h, up)}</h2>`); }
    else if (/^- /m.test(b) && b.split('\n').every((l) => /^- /.test(l.trim()))) out.push(`<ul>\n${b.split('\n').map((l) => `  <li>${inlineMd(l.trim().slice(2), up)}</li>`).join('\n')}\n</ul>`);
    else out.push(`<p>${inlineMd(b.replace(/\s*\n\s*/g, ' '), up)}</p>`);
  }
  return out.join('\n');
}

const words = (md) => md.replace(/[#*[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
const absUrl = (rel) => `${site.SITE_URL}/${rel.replace(/(^|\/)index\.html$/, '$1')}`;
const fmtDate = (d, loc) => new Date(`${d}T12:00:00Z`).toLocaleDateString(loc, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

function head({ title, desc, rel, lang, enRel, esRel, card, ld, crumbLd = null }) {
  const up = '../'.repeat(rel.split('/').length - 1);
  return [
    '<!DOCTYPE html>',
    `<html lang="${lang}">`,
    '<head>',
    `  <!-- GENERATED by scripts/build-blog.mjs from content/blog/. Do not edit: change the post and run npm run build. -->`,
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${esc(title)}</title>`,
    `  <meta name="description" content="${esc(desc)}" />`,
    `  <link rel="canonical" href="${absUrl(rel)}" />`,
    ...(enRel && esRel ? [
      `  <link rel="alternate" hreflang="en" href="${absUrl(enRel)}" />`,
      `  <link rel="alternate" hreflang="es" href="${absUrl(esRel)}" />`,
      `  <link rel="alternate" hreflang="x-default" href="${absUrl(enRel)}" />`,
    ] : []),
    `  <meta property="og:title" content="${esc(title)}" />`,
    `  <meta property="og:description" content="${esc(desc)}" />`,
    `  <meta property="og:type" content="${ld ? 'article' : 'website'}" />`,
    `  <meta property="og:url" content="${absUrl(rel)}" />`,
    `  <meta property="og:image" content="${site.SITE_URL}/images/og/${card}.png" />`,
    '  <meta property="og:image:width" content="1200" />',
    '  <meta property="og:image:height" content="630" />',
    '  <meta name="twitter:card" content="summary_large_image" />',
    '  <meta name="theme-color" content="#15171A" />',
    ...(ld ? ['  <script type="application/ld+json">', JSON.stringify(ld, null, 2).replace(/^/gm, '  '), '  </script>'] : []),
    ...(crumbLd ? ['  <script type="application/ld+json">', JSON.stringify(crumbLd, null, 2).replace(/^/gm, '  '), '  </script>'] : []),
    '  <style>',
    `    @font-face { font-family: 'Google Sans'; font-style: normal; font-weight: 400 700; font-display: swap; src: url(${up}fonts/google-sans.woff2) format('woff2'); }`,
    '  </style>',
    `  <link rel="stylesheet" href="${up}css/site.css">`,
    `  <link rel="stylesheet" href="${up}css/article.css">`,
    `  <link rel="stylesheet" href="${up}css/guess.css">`,
    `  <script src="${up}js/site.js" defer></script>`,
    `  <script src="${up}js/analytics.js" defer></script>`,
    `  <script src="${up}js/maintenance-banner.js" defer></script>`,
    '</head>',
    '<body>',
    '<!-- BUILD:site-header -->',
    '<!-- /BUILD:site-header -->',
    '',
    '<main id="main">',
  ].join('\n');
}
const foot = (up) => ['</main>', '', '<!-- BUILD:site-sticky -->', '<!-- /BUILD:site-sticky -->', '<!-- BUILD:site-footer -->', '<!-- /BUILD:site-footer -->',
  `<script src="${up}js/preview-nav.js" defer></script>`, '</body>', '</html>', ''].join('\n');

/** The page for one post. `twin` is the other language's post, if there is one. */
export function postPage(p, twin) {
  const t = T[p.lang];
  const rel = `${t.dir}/${p.slug}.html`;
  const up = '../'.repeat(rel.split('/').length - 1);
  const enRel = p.lang === 'en' ? rel : twin ? `blog/${p.slug}.html` : null;
  const esRel = p.lang === 'es' ? rel : twin ? `es/blog/${p.slug}.html` : null;
  const card = rel.replace(/\.html$/, '').replace(/\//g, '-');
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${absUrl(rel)}#post`,
    headline: p.title,
    description: p.description,
    datePublished: p.date,
    dateModified: p.date,
    inLanguage: p.lang === 'es' ? 'es-US' : 'en-US',
    mainEntityOfPage: absUrl(rel),
    image: `${site.SITE_URL}/images/og/${card}.png`,
    author: { '@type': 'Organization', '@id': `${site.SITE_URL}/#business`, name: site.NAME },
    publisher: { '@type': 'Organization', '@id': `${site.SITE_URL}/#business`, name: site.NAME },
  };
  const trail = crumbs([{ name: t.blog, href: `${t.dir}/index.html` }, { name: p.title }], { rel, lang: p.lang });
  return [
    head({ title: `${p.title} | ${site.NAME}`, desc: p.description, rel, lang: p.lang, enRel, esRel, card, ld, crumbLd: trail.ld }),
    '  <article class="article post">',
    `    ${trail.html}`,
    `    <h1>${esc(p.title)}</h1>`,
    `    <p class="post-meta"><time datetime="${p.date}">${fmtDate(p.date, t.dateFmt)}</time> · ${t.read(Math.max(2, Math.round(words(p.body) / 220)))}</p>`,
    renderMd(p.body, up).replace(/^/gm, '    '),
    `    <section class="a-cta" aria-labelledby="cta-${p.slug}">`,
    `      <h2 id="cta-${p.slug}">${t.ctaTitle}</h2>`,
    `      <p>${t.ctaText}</p>`,
    '      <div class="actions">',
    `        <a class="btn-primary" href="${up}book/quote.html">${t.ctaQuote}</a>`,
    `        <a class="btn-ghost" href="${p.lang === 'es' ? `${up}es/service-areas.html` : `${up}service-areas.html`}">${t.ctaAreas}</a>`,
    '      </div>',
    '    </section>',
    `    <p class="post-back"><a href="index.html">${t.back}</a></p>`,
    '  </article>',
    foot(up),
  ].join('\n');
}

/** The blog index for one language. */
export function indexPage(lang, posts, hasTwin) {
  const t = T[lang];
  const rel = `${t.dir}/index.html`;
  const up = '../'.repeat(rel.split('/').length - 1);
  const card = lang === 'es' ? 'es-blog' : 'blog';
  return [
    head({ title: t.indexTitle.replace('Haulmighty', site.NAME), desc: t.indexDesc, rel, lang, enRel: hasTwin ? 'blog/index.html' : null, esRel: hasTwin ? 'es/blog/index.html' : null, card, ld: null, crumbLd: crumbs([{ name: t.blog }], { rel, lang }).ld }),
    '  <article class="article">',
    `    ${crumbs([{ name: t.blog }], { rel, lang }).html}`,
    `    <h1>${t.blogTitle}</h1>`,
    `    <p class="a-lede">${t.blogLede}</p>`,
    '    <ul class="post-list">',
    ...posts.map((p) => `      <li><a href="${p.slug}.html"><span class="pl-title">${esc(p.title)}</span><span class="pl-sum">${esc(p.summary)}</span></a></li>`),
    '    </ul>',
    '  </article>',
    foot(up),
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const en = loadPosts('en'), es = loadPosts('es');
  const twinOf = (p, list) => list.find((x) => x.slug === p.slug) || null;
  const pages = [
    ...en.map((p) => [`blog/${p.slug}.html`, postPage(p, twinOf(p, es))]),
    ...es.map((p) => [`es/blog/${p.slug}.html`, postPage(p, twinOf(p, en))]),
    ...(en.length ? [['blog/index.html', indexPage('en', en, es.length > 0)]] : []),
    ...(es.length ? [['es/blog/index.html', indexPage('es', es, true)]] : []),
  ];
  const stale = [];
  for (const [rel, html] of pages) {
    const abs = path.join(ROOT, rel);
    // The chrome blocks are filled by build-chrome; compare everything else.
    const strip = (s) => eol(s).replace(/(<!-- BUILD:(site-[a-z]+) -->)[\s\S]*?(<!-- \/BUILD:\2 -->)/g, '$1$3');
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    if (strip(before) === strip(html)) continue;
    if (check) { stale.push(rel); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, html);
  }
  // A post whose markdown was deleted leaves its page behind: flag it, or remove it.
  const made = new Set(pages.map(([rel]) => rel));
  for (const dir of ['blog', 'es/blog']) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter((x) => x.endsWith('.html'))) {
      const rel = `${dir}/${f}`;
      if (made.has(rel)) continue;
      if (check) stale.push(`${rel} (no markdown)`); else fs.rmSync(path.join(ROOT, rel));
    }
  }
  if (check) {
    if (stale.length) { console.error(`build-blog --check: stale, run npm run build:\n  ${stale.join('\n  ')}`); process.exit(1); }
    console.log(`build-blog --check: OK, ${en.length} posts${es.length ? ` and ${es.length} in Spanish` : ''}`);
  } else console.log(`build-blog: ${pages.length} pages (${en.length} posts${es.length ? `, ${es.length} in Spanish` : ''})`);
}
