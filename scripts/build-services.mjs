/**
 * Builds a page for every Portland service (round 9), from one plain text
 * file per service, the way the towns and the blog are built.
 *
 *   node scripts/build-services.mjs          # write portland/<slug>.html for every service file
 *   node scripts/build-services.mjs --check  # verify only, non-zero naming a stale or extra page (npm test)
 *
 * Each service is content/services/portland/<slug>.md (the format is in
 * content/services/README.md), listed in content/services/portland/ORDER in
 * priority order; a slug with no file yet is skipped. The page lives at
 * portland/<slug>.html, so the address names the metro and round 11's
 * sacramento/<slug>.html is its sibling. /portland/ itself 301s to the hub
 * (vercel.json).
 *
 * Prices are never typed: "From $X plus travel" is the first listed size's
 * one time price and the size cards are the listed sizes, both read from the
 * order module (api/_lib/order-config.js, written by npm run build:pricing),
 * red while GUESS.prices. The build stops on a size the config does not have,
 * a town with no town file, a post with no post, or a $ before a digit.
 *
 * The page gets the shared header, footer and sticky button from
 * scripts/build-chrome.mjs (the BUILD:site-* markers), which also points its
 * language switch at the Spanish homepage (no Spanish twin this round). Its
 * JSON-LD is one @graph: the Service (the listed towns as areaServed, an
 * AggregateOffer from the listed sizes plus the largest real travel fee
 * among those towns; check-schema proves both), the BreadcrumbList from
 * scripts/lib/crumbs.mjs and the FAQPage from the questions it shows.
 * scripts/test-services.mjs fails if a service shares a sentence with a town
 * or another service.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import site from '../api/_lib/site.js';
import { fmt } from '../pricing.config.mjs';
import { parseTown, townTravel, inline, faqPage } from './build-towns.mjs';
import { parsePost, renderMd } from './build-blog.mjs';
import { crumbs, HUB } from './lib/crumbs.mjs';

const require = createRequire(import.meta.url);
const ORDER = require('../api/_lib/order-config.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METRO = 'portland';
const SVC_DIR = path.join(ROOT, 'content/services', METRO);
const SITE = site.SITE_URL;
const SECTIONS = [['take', 'What we take'], ['goes', 'Where it goes'], ['free', 'Free options'], ['how', 'How the job goes']];
const eol = (s) => s.replace(/\r\n/g, '\n');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const idOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The pages live one folder down (portland/<slug>.html), so a link written from the site root
// (/book/quote.html) is rewritten to ../book/quote.html, the way the blog rewrites its own.
const UP = '../'.repeat(`${METRO}/x.html`.split('/').length - 1);
const HEAD_FIELDS = ['name', 'h1', 'description', 'lede', 'sizes', 'towns', 'posts', 'photo'];   // photo is optional

/** Paragraphs and "- " lists to HTML blocks, written like a post (build-blog's renderMd): escaped,
 *  [[guesses]] red, **bold**, and [links](/from/the/site/root.html). A "- " line right under a
 *  paragraph line starts its own list. */
function blocks(text) {
  const out = [];
  for (const b of text.split(/\n\s*\n/)) {
    let run = [], isList = false;
    const flush = () => { if (run.length) out.push(renderMd(run.join('\n'), UP)); run = []; };
    for (const raw of b.split('\n')) {
      const l = raw.trim();
      if (!l) continue;
      if (l.startsWith('- ') !== isList) { flush(); isList = l.startsWith('- '); }
      run.push(l);
    }
    flush();
  }
  return out;
}

const townCache = new Map();
/** A town file, parsed (build-towns' own parser, so a bad town file fails the same way). */
function townOf(slug) {
  if (!townCache.has(slug)) townCache.set(slug, parseTown(fs.readFileSync(path.join(ROOT, 'content/towns', `${slug}.md`), 'utf8'), `${slug}.md`));
  return townCache.get(slug);
}
const postOf = (slug) => parsePost(fs.readFileSync(path.join(ROOT, 'content/blog/en', `${slug}.md`), 'utf8'), `${slug}.md`, 'en');

/** One service file → { slug, metro, name, h1, description, lede, sizes, towns, posts, take, goes, free, how, faqs }. Throws naming the file. */
export function parseService(text, file) {
  const base = path.basename(file);
  const slug = base.replace(/\.md$/, '');
  const fail = (msg) => { throw new Error(`content/services/${METRO}/${base}: ${msg}`); };
  const s = eol(text);
  const typed = s.match(/\$\s*\d/);
  if (typed) fail(`a price is typed in ("${s.slice(Math.max(0, typed.index - 20), typed.index + 8).replace(/\s+/g, ' ')}"); prices come from pricing.config.mjs through the build`);
  if (!/^[a-z0-9-]+$/.test(slug)) fail('the file name must be lowercase words joined by hyphens');
  const head = s.split(/^## /m)[0];
  const field = (k) => ((head.match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm')) || [])[1] || '').trim();
  const section = (name) => ((s.split(new RegExp(`^## ${name}[ \\t]*$`, 'm'))[1] || '').split(/^## /m)[0]).trim();

  // Nothing may vanish silently: every "## " heading is a known section, used once.
  const known = [...SECTIONS.map(([, title]) => title), 'FAQ'];
  const seen = new Set();
  for (const [, h] of s.matchAll(/^## (.*)$/gm)) {
    const title = h.trim();
    if (!known.includes(title)) fail(`"## ${title}" is not a section; the sections are ${known.map((t) => `"## ${t}"`).join(', ')}`);
    if (seen.has(title)) fail(`"## ${title}" is used twice; write all of it under one heading`);
    seen.add(title);
  }

  // The header, line by line: each field once, on one line, and the town lines together under
  // "towns:" (blank lines between them are fine). Anything else would silently never print.
  const lines = head.split('\n');
  const at = lines.findIndex((l) => /^towns:/.test(l));
  if (at < 0) fail('no "towns:" line');
  if (lines[at].replace(/^towns:/, '').trim()) fail('towns go one per line under "towns:", as "- <town>: <why>"');
  const townAt = [];
  for (let i = at + 1; i < lines.length && (/^- /.test(lines[i]) || !lines[i].trim()); i++) if (lines[i].trim()) townAt.push(i);
  const townLines = townAt.map((i) => lines[i]);
  const fields = new Set();
  for (const [i, l] of lines.entries()) {
    if (!l.trim() || townAt.includes(i)) continue;
    if (/^- /.test(l)) fail(`the town line "${l}" is not under "towns:"; keep every town line together, right under it`);
    const k = (l.match(/^([a-z0-9_]+):/) || [])[1];
    if (!k || !HEAD_FIELDS.includes(k)) fail(`the line "${l}" is not a field (${HEAD_FIELDS.join(', ')}); each field is one line, as "<field>: <value>"`);
    if (fields.has(k)) fail(`"${k}:" is given twice`);
    fields.add(k);
  }

  for (const k of ['name', 'h1', 'description', 'lede', 'sizes', 'posts']) if (!field(k)) fail(`no "${k}:" line`);
  const name = field('name'), h1 = field('h1'), description = field('description');
  for (const [k, v] of [['name', name], ['h1', h1], ['description', description]]) if (v.includes('[[')) fail(`no [[guess]] in "${k}:" (it prints where it cannot be red)`);
  if (!h1.toLowerCase().includes(name.toLowerCase()) || !/\bPortland\b/.test(h1)) fail(`the h1 "${h1}" must name the service ("${name}") and Portland`);
  const n = [...description].length;
  if (n < 100 || n > 160) fail(`the description is ${n} characters, want 100 to 160`);
  if (!/\bPortland\b/.test(description)) fail('the description must name Portland');

  const keys = ORDER.SIZES.map((z) => z.key);
  const sizes = field('sizes').split(/[,\s]+/).filter(Boolean);
  for (const k of sizes) if (!keys.includes(k)) fail(`size "${k}" is not a size key (${keys.join(', ')})`);
  const rows = sizes.map((k) => keys.indexOf(k));
  if (rows.some((r, i) => i && r <= rows[i - 1])) fail(`sizes go smallest first, each once (${keys.join(', ')})`);

  const towns = [];
  for (const line of townLines) {
    const m = line.match(/^- ([a-z0-9-]+):[ \t]*(.*)$/);
    if (!m) fail(`the town line "${line}" is not "- <town>: <why>"`);
    if (!fs.existsSync(path.join(ROOT, 'content/towns', `${m[1]}.md`))) fail(`town "${m[1]}" has no content/towns/${m[1]}.md`);
    if (!m[2].trim()) fail(`town "${m[1]}" has no reason after its colon`);
    if (towns.some((t) => t.slug === m[1])) fail(`town "${m[1]}" is listed twice`);
    towns.push({ slug: m[1], why: m[2].trim() });
  }
  if (towns.length < 5 || towns.length > 8) fail(`${towns.length} towns under "towns:" (want 5 to 8)`);

  const posts = field('posts').split(/[,\s]+/).filter(Boolean);
  for (const p of posts) if (!fs.existsSync(path.join(ROOT, 'content/blog/en', `${p}.md`))) fail(`post "${p}" has no content/blog/en/${p}.md`);

  const own = {};
  for (const [k, title] of SECTIONS) {
    own[k] = blocks(section(title));
    if (!own[k].length) fail(`no "## ${title}" section`);
  }
  const faqs = [];
  for (const chunk of section('FAQ').split(/\n(?=Q:)/).map((c) => c.trim()).filter(Boolean)) {
    const m = chunk.match(/^Q:[ \t]*(.+)\n\s*A:[ \t]*([\s\S]+)$/);
    if (!m) fail(`a question with no "A:" answer under it: "${chunk.split('\n')[0]}"`);
    faqs.push({ q: m[1].trim(), a: m[2].replace(/\s*\n\s*/g, ' ').trim() });
  }
  if (faqs.length < 3 || faqs.length > 5) fail(`${faqs.length} questions under "## FAQ" (want 3 to 5, as Q: and A: lines)`);

  // The header photo: images/src/svc-<slug>.jpg through the image pipeline, its alt text in "photo:".
  const photo = field('photo');
  if (photo && !fs.existsSync(path.join(ROOT, 'images/photos', `svc-${slug}-960.jpg`))) {
    fail(`"photo:" is set but images/photos/svc-${slug}-960.jpg does not exist (put svc-${slug}.jpg in images/src/ and run npm run build)`);
  }
  return { slug, metro: METRO, name, h1, description, lede: field('lede'), sizes, towns, posts, photo, ...own, faqs };
}

/** Every service, in the order content/services/portland/ORDER gives (priority first). */
export function loadServices(dir = SVC_DIR) {
  if (!fs.existsSync(dir)) return [];
  const orderFile = path.join(dir, 'ORDER');
  const order = fs.existsSync(orderFile)
    ? eol(fs.readFileSync(orderFile, 'utf8')).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
  const dup = order.find((x, i) => order.indexOf(x) !== i);
  if (dup) throw new Error(`content/services/${METRO}/ORDER: "${dup}" is listed twice`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  for (const f of files) if (!order.includes(f.slice(0, -3))) throw new Error(`content/services/${METRO}/${f}: not listed in content/services/${METRO}/ORDER (add its slug there, in priority order)`);
  return order.filter((slug) => files.includes(`${slug}.md`)).map((slug) => parseService(fs.readFileSync(path.join(dir, `${slug}.md`), 'utf8'), `${slug}.md`));
}

/** The order module's sizes a service lists, smallest first. */
export const sizesOf = (s) => s.sizes.map((k) => ORDER.SIZES.find((z) => z.key === k));

/** Links to every service page, from the site root, for the hub, the footer and the homepage. The
 *  service pages are English only this round, so the Spanish pages link the same English pages. */
export function serviceLinks(lang = 'en') {
  return loadServices().map((s) => ({ name: s.name, href: `${s.metro}/${s.slug}.html` }));
}

/* ── the page ──────────────────────────────────────────────────────────── */
const money = (cents) => (ORDER.GUESS.prices ? `<span class="guess">${fmt(cents)}</span>` : fmt(cents));
const PHONE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';
const indent = (html, pad) => html.split('\n').map((l) => (l ? pad + l : l)).join('\n');

/** A pipeline photo (images/photos/<name>-480|960 .webp|.jpg) as a framed hero picture. */
const heroPhoto = (name, alt, pad) => [
  '<picture class="h-photo svc-hero-photo">',
  `  <source type="image/webp" srcset="/images/photos/${name}-480.webp 480w, /images/photos/${name}-960.webp 960w" sizes="(min-width: 960px) 480px, calc(100vw - 32px)">`,
  `  <img src="/images/photos/${name}-960.jpg" srcset="/images/photos/${name}-480.jpg 480w, /images/photos/${name}-960.jpg 960w" sizes="(min-width: 960px) 480px, calc(100vw - 32px)" alt="${esc(alt)}" width="960" height="640" fetchpriority="high" decoding="async">`,
  '</picture>',
].map((l) => pad + l).join('\n');

/** The page for one service. `all` is every service, for the "Other jobs we do" links. */
export function buildService(s, all = [s]) {
  const rel = `${s.metro}/${s.slug}.html`;
  const url = `${SITE}/${rel}`;
  const up = '../'.repeat(rel.split('/').length - 1);
  const sizes = sizesOf(s);
  const towns = s.towns.map((t) => ({ ...t, town: townOf(t.slug) }));
  // The highest price is the largest listed size plus the largest fee of any zone those towns reach.
  const maxFee = Math.max(...towns.map((t) => Math.max(...townTravel(t.town).map((z) => z.cents))));
  const items = s.faqs.map((f) => ({ q: inline(f.q), a: inline(f.a) }));
  const trail = crumbs([HUB.en, { name: s.name }], { rel });
  const posts = s.posts.map(postOf);
  const others = all.filter((x) => x.slug !== s.slug);
  const before = fs.existsSync(path.join(ROOT, 'before-we-come.html'));   // the link appears once the page exists
  const title = `${s.name} in Portland, OR | ${site.NAME}`;
  const card = rel.replace(/\.html$/, '').replace(/\//g, '-');
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${url}#service`,
        name: s.name,
        serviceType: s.name,
        description: s.description,
        url,
        provider: { '@type': 'LocalBusiness', '@id': `${SITE}/#business`, name: site.NAME, telephone: site.PHONE_TEL, url: `${SITE}/` },
        areaServed: towns.map((t) => ({ '@type': 'City', name: `${t.town.name}, ${t.town.state}` })),
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'USD',
          lowPrice: (sizes[0].cents / 100).toFixed(2),
          highPrice: ((sizes[sizes.length - 1].cents + maxFee) / 100).toFixed(2),
          offerCount: String(sizes.length),
        },
      },
      trail.ld,
      faqPage(url, items),
    ],
  };
  const sizeCard = (z) => [
    `<a class="size-card" data-size="${z.row}" href="${up}book/quote.html?size=${z.row}">`,
    `  <img class="size-photo" src="${z.photo}"${/-480\.jpg$/.test(z.photo) ? ` srcset="${z.photo.replace(/-480\.jpg$/, '-480.webp')} 480w, ${z.photo.replace(/-480\.jpg$/, '-960.webp')} 960w" sizes="(min-width: 900px) 240px, 68px"` : ''} alt="" width="800" height="500" loading="lazy" decoding="async">`,
    '  <span class="size-body">',
    `    <span class="size-name">${esc(z.label)}</span>`,
    `    <span class="size-note">${esc(z.note)}</span>`,
    `    <span class="size-cost"><span class="size-price${ORDER.GUESS.prices ? ' guess' : ''}">${fmt(z.cents)}</span> <span class="size-travel">+ travel</span></span>`,
    '  </span>',
    '</a>',
  ].join('\n');
  const section = ([k, heading]) => [
    `<section class="svc-sec" aria-labelledby="${idOf(heading)}">`,
    `  <h2 id="${idOf(heading)}">${heading}</h2>`,
    '  <div class="prose">',
    indent(s[k].join('\n'), '    '),
    '  </div>',
    '</section>',
  ].join('\n');

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    `  <!-- GENERATED by scripts/build-services.mjs from content/services/${s.metro}/${s.slug}.md. Do not edit: change that file and run npm run build. -->`,
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${esc(title)}</title>`,
    `  <meta name="description" content="${esc(s.description)}" />`,
    `  <link rel="canonical" href="${url}" />`,
    `  <meta property="og:title" content="${esc(title)}" />`,
    `  <meta property="og:description" content="${esc(s.description)}" />`,
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:url" content="${url}" />`,
    `  <meta property="og:image" content="${SITE}/images/og/${card}.png" />`,
    '  <meta property="og:image:width" content="1200" />',
    '  <meta property="og:image:height" content="630" />',
    '  <meta name="twitter:card" content="summary_large_image" />',
    '  <meta name="theme-color" content="#15171A" />',
    '  <script type="application/ld+json">',
    JSON.stringify(ld, null, 2).replace(/^/gm, '  '),
    '  </script>',
    '  <style>',
    `    @font-face { font-family: 'DM Sans'; font-style: normal; font-weight: 300 700; font-display: swap; src: url(${up}fonts/dm-sans.woff2) format('woff2'); }`,
    `    @font-face { font-family: 'Bricolage Grotesque'; font-style: normal; font-weight: 500 800; font-display: swap; src: url(${up}fonts/bricolage.woff2) format('woff2'); }`,
    '  </style>',
    `  <link rel="stylesheet" href="${up}css/site.css">`,
    // The homepage's own look: the hero, the eyebrows, the size cards, the closer.
    `  <link rel="stylesheet" href="${up}css/home.css">`,
    `  <link rel="stylesheet" href="${up}css/guess.css">`,
    `  <link rel="stylesheet" href="${up}css/services.css">`,
    `  <script src="${up}js/site.js" defer></script>`,
    `  <script src="${up}js/analytics.js" defer></script>`,
    `  <script src="${up}js/maintenance-banner.js" defer></script>`,
    '</head>',
    '<body>',
    '<!-- BUILD:site-header -->',
    '<!-- /BUILD:site-header -->',
    '',
    '<main id="main">',
    '',
    '<section class="h-hero svc-hero" aria-labelledby="hero-title">',
    '  <div class="svc-hero-in">',
    `    ${trail.html}`,
    '    <div class="svc-hero-grid">',
    '      <div class="svc-hero-copy">',
    '        <p class="h-eyebrow">Portland junk removal</p>',
    `        <h1 class="h-title" id="hero-title">${esc(s.h1)}</h1>`,
    `        <p class="h-lede">${inline(s.lede)}</p>`,
    '        <div class="h-actions" data-hides-sticky>',
    `          <a class="h-cta" href="${up}book/quote.html">Get my price</a>`,
    `          <a class="svc-photo" href="${up}book/quote.html#photos">Send a photo</a>`,
    '        </div>',
    '      </div>',
    ...(s.photo ? [heroPhoto(`svc-${s.slug}`, s.photo, '      ')] : []),
    '    </div>',
    '  </div>',
    '</section>',
    '',
    '<section class="band is-dark svc-sizes-band" aria-labelledby="prices-title">',
    '  <div class="wrap">',
    '    <div class="sizes-head">',
    '      <div>',
    '        <p class="h-eyebrow">Prices</p>',
    `        <h2 class="section-title" id="prices-title">${esc(s.name)} prices</h2>`,
    `        <p class="svc-price">From <strong>${money(sizes[0].cents)}</strong> plus travel</p>`,
    '      </div>',
    `      <p class="section-sub">${sizes.length > 1 ? 'Most jobs like this fit one of these sizes.' : 'Most jobs like this fit this size.'} One flat price per load, plus travel by zone. Labor, loading and the haul are all in it.</p>`,
    '    </div>',
    '    <div class="size-list h-sizes svc-sizes" data-hides-sticky>',
    indent(sizes.map(sizeCard).join('\n'), '      '),
    '    </div>',
    `    <p class="svc-alt">Not sure which size? <a href="${up}book/quote.html#photos">Send us a photo</a> and we pick it for you. More than a full truck? Call or text <a href="tel:${site.PHONE_TEL}">${esc(site.PHONE)}</a>.</p>`,
    '  </div>',
    '</section>',
    '',
    '<div class="svc-own">',
    '<div class="band svc-copy">',
    '  <div class="wrap-text">',
    indent(SECTIONS.map(section).join('\n'), '    '),
    '  </div>',
    '</div>',
    '<section class="band is-card svc-towns-band" aria-labelledby="where-we-do-this">',
    '  <div class="wrap">',
    '    <h2 class="section-title" id="where-we-do-this">Where we do this most</h2>',
    '    <ul class="svc-towns">',
    ...towns.map((t) => `      <li><a href="${up}${t.slug}.html">${esc(t.town.name)}</a><p>${inline(t.why)}</p></li>`),
    '    </ul>',
    '  </div>',
    '</section>',
    '</div>',
    '',
    '<section class="band is-surf svc-faq" aria-labelledby="faq">',
    '  <div class="wrap-text">',
    `    <h2 class="section-title" id="faq">${esc(s.name)} questions</h2>`,
    '    <div class="faq-list">',
    ...items.map((i) => `      <details><summary>${i.q}</summary><div class="faq-answer"><p>${i.a}</p></div></details>`),
    '    </div>',
    `    <p class="svc-faq-more"><a href="${up}faq.html">More questions and answers</a></p>`,
    '  </div>',
    '</section>',
    '',
    '<section class="band svc-more" aria-labelledby="more-title">',
    '  <div class="wrap-text">',
    '    <h2 class="section-title" id="more-title">Good to read first</h2>',
    '    <ul class="svc-posts">',
    ...posts.map((p) => `      <li><a href="${up}blog/${p.slug}.html"><span class="svc-post-title">${esc(p.title)}</span><span class="svc-post-sum">${esc(p.summary)}</span></a></li>`),
    '    </ul>',
    ...(before ? [`    <p class="svc-before"><a href="${up}before-we-come.html">Before we come: how to get ready for the day</a></p>`] : []),
    ...(others.length ? [
      '    <h3 class="svc-others-title">Other jobs we do</h3>',
      '    <ul class="svc-others">',
      ...others.map((x) => `      <li><a href="${x.slug}.html">${esc(x.name)}</a></li>`),
      '    </ul>',
    ] : []),
    '  </div>',
    '</section>',
    '',
    '<section class="closer" aria-label="Get a price">',
    '  <div class="closer-in" data-hides-sticky>',
    '    <h2>Ready when your junk is.</h2>',
    '    <p class="closer-line">See your price now and pick a day that works for you.</p>',
    '    <div class="closer-actions">',
    `      <a class="cta-btn is-yellow" href="${up}book/quote.html">Get my price</a>`,
    `      <a class="cta-ghost" href="tel:${site.PHONE_TEL}">${PHONE_SVG}${esc(site.PHONE)}</a>`,
    '    </div>',
    '  </div>',
    '</section>',
    '',
    '</main>',
    '',
    '<!-- BUILD:site-sticky -->',
    '<!-- /BUILD:site-sticky -->',
    '<!-- BUILD:site-footer -->',
    '<!-- /BUILD:site-footer -->',
    `<script src="${up}js/preview-nav.js" defer></script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/* ── main ──────────────────────────────────────────────────────────────── */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const all = loadServices();
  const pages = all.map((s) => [`${s.metro}/${s.slug}.html`, buildService(s, all)]);
  // The chrome blocks are filled by build-chrome; compare everything else.
  const strip = (x) => eol(x).replace(/(<!-- BUILD:(site-[a-z]+) -->)[\s\S]*?(<!-- \/BUILD:\2 -->)/g, '$1$3');
  const stale = [], written = [];
  for (const [rel, html] of pages) {
    const abs = path.join(ROOT, rel);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    if (strip(before) === strip(html)) continue;
    if (check) { stale.push(rel); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, html);
    written.push(rel);
  }
  // A page whose service file is gone would linger with stale prices: flag it, or remove it.
  const made = new Set(pages.map(([rel]) => rel));
  const dir = path.join(ROOT, METRO);
  const orphans = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => f.endsWith('.html')).map((f) => `${METRO}/${f}`)
    .filter((rel) => !made.has(rel) && /GENERATED by scripts\/build-services\.mjs/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
  if (check) {
    if (stale.length || orphans.length) {
      console.error(`build-services --check: run \`npm run build\`.${stale.length ? `\n  stale: ${stale.join(', ')}` : ''}${orphans.length ? `\n  no service file: ${orphans.join(', ')}` : ''}`);
      process.exit(1);
    }
    console.log(`build-services --check: OK, ${pages.length} service page(s) match their files`);
  } else {
    for (const rel of orphans) { fs.rmSync(path.join(ROOT, rel)); console.log(`build-services: removed ${rel} (its service file is gone)`); }
    console.log(written.length ? `build-services: wrote ${written.join(', ')}` : `build-services: ${pages.length} page(s) already up to date`);
  }
}
