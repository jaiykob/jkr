/**
 * Builds a page for every town we serve, from one plain text file per town.
 *
 *   node scripts/build-towns.mjs          # write <slug>.html for every town
 *   node scripts/build-towns.mjs --check  # verify only, non-zero if stale (npm test)
 *
 * Each town is content/towns/<slug>.md (the format is in content/towns/README.md).
 * Its page is the homepage, index.html, with four regions swapped for the
 * town's own (marked in index.html):
 *
 *   CITY:head    title, description, canonical, share tags, JSON-LD
 *   CITY:hero    the eyebrow, the headline and the line under it
 *   CITY:local   the town's own section: its copy, its travel zones and fees,
 *                its neighborhoods (empty on the homepage)
 *   CITY:faq     the town's questions, plus two answered from the zone table
 *
 * Everything else is copied from index.html on every run, so a town page
 * cannot drift from the homepage: change index.html, run this, and all of
 * them follow. The generated pages are never edited by hand (--check fails).
 *
 * Founder call (2026-10-07): a page for every town in the travel zones, with
 * copy that is the town's own. The local copy is the doorway page defence:
 * without it a town page is the homepage with a different headline.
 * scripts/test-towns.mjs fails if two towns share a sentence.
 *
 * Spanish: a town file with "lede_es:", "## Local (es)" and "## FAQ (es)"
 * also gets es/<slug>.html, built the same way from the Spanish homepage
 * (scripts/build-es.mjs), and once any town has Spanish the hub gets
 * es/service-areas.html. The sentences this script writes itself (travel,
 * ZIP codes, headings) come in both languages from W and H below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ZIP_ZONES, ZONES, GUESS, PRICES, ONE_TIME_COL, fmt, BASE } from '../pricing.config.mjs';
import site from '../api/_lib/site.js';
import { setLangSwitch, hreflang, hasEsTwin } from './lib/twins.mjs';
import { toSpanish, loadMap } from './build-es.mjs';
import POINTS from '../data/zip-points.mjs';
import { loadServices } from './build-services.mjs';
import { crumbs } from './lib/crumbs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOWN_DIR = path.join(ROOT, 'content/towns');
const SITE = site.SITE_URL;   // api/_lib/site.js: the one place the address lives
const eol = (s) => s.replace(/\r\n/g, '\n');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Plain text to HTML: escaped, with [[a guess]] shown red with an asterisk. */
export const inline = (s) => esc(s).replace(/\[\[([\s\S]+?)\]\]/g, '<span class="guess">$1</span>');
const plain = (s) => String(s).replace(/\[\[|\]\]/g, '');
/** Visible HTML to the plain text structured data carries. */
const textOf = (html) => String(html).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
/** FAQPage JSON-LD from the same question list the page shows, so the two cannot disagree
 *  (the service pages use it too, scripts/build-services.mjs). */
export const faqPage = (url, items) => ({
  '@type': 'FAQPage',
  '@id': `${url}#faq`,
  mainEntity: items.map((i) => ({ '@type': 'Question', name: textOf(i.q), acceptedAnswer: { '@type': 'Answer', text: textOf(i.a) } })),
});

/** One town file → { slug, name, state, zips, lede, areas, local, faqs }. Throws naming the file. */
export function parseTown(text, file) {
  const slug = path.basename(file).replace(/\.md$/, '');
  const s = eol(text);
  const fail = (msg) => { throw new Error(`content/towns/${path.basename(file)}: ${msg}`); };
  const head = s.split(/^## /m)[0];
  const field = (k) => ((head.match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm')) || [])[1] || '').trim();
  const section = (name) => ((s.split(new RegExp(`^## ${name}[ \\t]*$`, 'm'))[1] || '').split(/^## /m)[0]).trim();

  const t = {
    slug, name: field('name'), state: field('state'),
    zips: field('zips').split(/[,\s]+/).filter(Boolean),
    lede: field('lede'),
    areas: field('areas').split(',').map((a) => a.trim()).filter(Boolean),
    local: section('Local').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean),
    faqs: [],
  };
  const qa = (text) => [...text.matchAll(/^Q:[ \t]*(.+)\n(?:[ \t]*\n)*A:[ \t]*([\s\S]+?)(?=\n[ \t]*\n[ \t]*Q:|\s*$)/gm)]
    .map((m) => ({ q: m[1].trim(), a: m[2].replace(/\s*\n\s*/g, ' ').trim() }));
  const paragraphs = (text) => text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  t.faqs = qa(section('FAQ'));
  if (!t.name) fail('no "name:" line');
  if (!/^(OR|WA)$/.test(t.state)) fail(`state is "${t.state}", want OR or WA`);
  if (!/^[a-z0-9-]+$/.test(slug)) fail('file name must be lowercase words joined by hyphens');
  if (!t.zips.length) fail('no "zips:" line');
  for (const z of t.zips) if (!ZIP_ZONES[z]) fail(`ZIP ${z} is not in any travel zone (pricing.config.mjs)`);
  if (!t.lede) fail('no "lede:" line');
  if (!t.local.length) fail('no "## Local" paragraphs');
  if (t.faqs.length < 2) fail(`${t.faqs.length} questions under "## FAQ" (want 2 or more, as Q: and A: lines)`);
  // Spanish: all three parts or none. Neighborhood names stay as they are
  // unless "areas_es:" gives them in Spanish.
  const ledeEs = field('lede_es'), localEs = section('Local \\(es\\)'), faqEs = section('FAQ \\(es\\)');
  t.es = null;
  if (ledeEs || localEs || faqEs) {
    if (!ledeEs) fail('has Spanish sections but no "lede_es:" line');
    const es = { lede: ledeEs, areas: field('areas_es') ? field('areas_es').split(',').map((a) => a.trim()).filter(Boolean) : t.areas, local: paragraphs(localEs), faqs: qa(faqEs) };
    if (!es.local.length) fail('no "## Local (es)" paragraphs');
    if (es.faqs.length < 2) fail(`${es.faqs.length} questions under "## FAQ (es)" (want 2 or more, as Q: and A: lines)`);
    t.es = es;
  }
  return t;
}

/** Every town, nearest first (by its nearest ZIP), then by name. */
export function loadTowns() {
  if (!fs.existsSync(TOWN_DIR)) return [];
  const towns = fs.readdirSync(TOWN_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => parseTown(fs.readFileSync(path.join(TOWN_DIR, f), 'utf8'), f));
  const near = (t) => Math.min(...t.zips.map((z) => ZIP_ZONES[z].miles));
  return towns.sort((a, b) => near(a) - near(b) || a.name.localeCompare(b.name));
}

/** The town's zones, nearest first: [{ key, label, cents, zips, miles: [min, max] }]. */
export function townTravel(t) {
  const by = new Map();
  for (const z of t.zips) {
    const r = ZIP_ZONES[z];
    if (!by.has(r.zone)) by.set(r.zone, { key: r.zone, label: r.label, cents: r.cents, zips: [], miles: [Infinity, 0] });
    const e = by.get(r.zone);
    e.zips.push(z);
    e.miles = [Math.min(e.miles[0], r.miles), Math.max(e.miles[1], r.miles)];
  }
  const order = ZONES.map((z) => z.key);
  return [...by.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/* ── words: every generated sentence, in English and Spanish ───────────── */
const listIn = (and) => (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);
/** js/travel.js and pricing.config.mjs name zones in English ("Home zone", "Zone 2"). */
const zoneEs = (label) => String(label).replace(/^Home zone$/, 'Zona base').replace(/^Zone /, 'Zona ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const W = {
  en: {
    list: listIn('and'),
    zone: (label) => label,
    fee: (cents) => (cents ? `${fmt(cents)} per visit` : 'no travel charge'),
    title: (where) => `Junk Removal in ${where} | Haulmighty`,
    desc: (where, one) => `Junk removal in ${where}. Pick a size or send a photo, see your price with ${one ? (one.cents ? `${one.label} travel` : 'no travel charge') : 'travel by ZIP'}, and we haul it away. Based in Gresham.`,
    serviceType: 'Junk removal',
    eyebrow: (t) => `Junk removal in ${esc(t.name)}, ${t.state}`,
    h1: (t) => `${esc(t.name)} junk removal. <span>See your price.</span>`,
    localTitle: (n) => `Junk removal in ${n}`,
    travelTo: (n) => `Travel to ${n}`,
    zips: (zips, [a, b]) => `ZIP ${listIn('and')(zips)}, ${a === b ? `${a}` : `${a} to ${b}`} road miles from Gresham`,
    tzNote: 'Added to the load price for each visit. Your ZIP sets it when you get your price.',
    whereIn: (n) => `Where we haul in ${n}`,
    otherIn: (z) => `Other towns in the ${z.toLowerCase()}`,
    alsoIn: (z) => `Also in the ${z.toLowerCase()}`,
    jobsIn: (n) => `Jobs we do in ${n}`,
    everyTown: 'Every town we serve',
    travelQ: (w) => `Is there a travel charge to ${w}?`,
    travelOne: (w, z, fee) => `Yes. ${w} is in our ${z.toLowerCase()}, so travel adds ${fee} to the load price. It is shown in your price before you book.`,
    travelHome: (w, fee) => `No. ${w} is in our home zone, close to our base in Gresham, so there is ${fee}.`,
    travelMany: (parts) => `It depends on your ZIP. ${cap(parts)}. Your price shows it before you book.`,
    zoneInList: (label) => (label.toLowerCase().startsWith('home') ? 'the home zone' : label),
    zipsQ: (w) => `Which ${w} ZIP codes do you cover?`,
    zipsA: (l) => `All of these: ${l}. Type yours in the quote and the price includes travel.`,
    faqEyebrow: (w) => `${w} questions`,
    goodToKnow: 'Good to know',
    moreFaq: 'More questions and answers',
  },
  es: {
    list: listIn('y'),
    zone: zoneEs,
    fee: (cents) => (cents ? `${fmt(cents)} por visita` : 'sin cargo de viaje'),
    title: (where) => `Retiro de Basura en ${where} | Haulmighty`,
    desc: (where, one) => `Retiro de basura en ${where}. Elige un tamaño o manda una foto y ve tu precio ${one ? (one.cents ? `con el viaje de la ${zoneEs(one.label).toLowerCase()}` : 'sin cargo de viaje') : 'con el viaje según tu código postal'}. Estamos en Gresham.`,
    serviceType: 'Retiro de basura',
    eyebrow: (t) => `Retiro de basura en ${esc(t.name)}, ${t.state}`,
    h1: (t) => `Retiro de basura en ${esc(t.name)}. <span>Ve tu precio.</span>`,
    localTitle: (n) => `Retiro de basura en ${n}`,
    travelTo: (n) => `Viaje a ${n}`,
    zips: (zips, [a, b]) => `${zips.length > 1 ? 'Códigos postales' : 'Código postal'} ${listIn('y')(zips)}, ${a === b ? `a ${a}` : `de ${a} a ${b}`} millas por carretera de Gresham`,
    tzNote: 'Se suma al precio de la carga en cada visita. Tu código postal lo fija cuando ves tu precio.',
    whereIn: (n) => `Dónde trabajamos en ${n}`,
    otherIn: (z) => `Otras ciudades en la ${zoneEs(z).toLowerCase()}`,
    alsoIn: (z) => `También en la ${zoneEs(z).toLowerCase()}`,
    jobsIn: (n) => `Trabajos que hacemos en ${n}`,
    everyTown: 'Todas las ciudades donde trabajamos',
    travelQ: (w) => `¿Hay cargo de viaje a ${w}?`,
    travelOne: (w, z, fee) => `Sí. ${w} está en nuestra ${zoneEs(z).toLowerCase()}, así que el viaje suma ${fee} al precio de la carga. Lo ves en tu precio antes de reservar.`,
    travelHome: (w, fee) => `No. ${w} está en nuestra zona base, cerca de Gresham, así que va ${fee}.`,
    travelMany: (parts) => `Depende de tu código postal. ${cap(parts)}. Tu precio lo muestra antes de reservar.`,
    zoneInList: (label) => (label.toLowerCase().startsWith('home') ? 'la zona base' : zoneEs(label)),
    zipsQ: (w) => `¿Qué códigos postales de ${w} cubren?`,
    zipsA: (l) => `Todos estos: ${l}. Escribe el tuyo en la cotización y el precio incluye el viaje.`,
    faqEyebrow: (w) => `Preguntas sobre ${w}`,
    goodToKnow: 'Lo que debes saber',
    moreFaq: 'Más preguntas y respuestas',
  },
};
const feeHtml = (cents, guess, lang = 'en') => (guess ? `<span class="guess">${W[lang].fee(cents)}</span>` : W[lang].fee(cents));
/** The page's own address: <slug>.html, or es/<slug>.html for the Spanish one. */
const pageRel = (slug, lang) => (lang === 'es' ? `es/${slug}` : slug);
/** A link from a generated region: inside es/ when the Spanish twin exists, else one level up. */
const hrefFor = (lang) => (rel) => (lang === 'es' && !hasEsTwin(rel) ? `../${rel}` : rel);
/** The town's copy in the page's language. */
const copyOf = (t, lang) => (lang === 'es' ? t.es : t);

/* The service pages (content/services/, scripts/build-services.mjs), English only for now:
   a Spanish page links the English page under the service's Spanish name (i18n/es.json). */
let svcCache = null;
const services = () => (svcCache ||= loadServices());
const svcName = (s, lang) => {
  if (lang !== 'es') return s.name;
  const es = loadMap()[s.name];
  if (!es) throw new Error(`i18n/es.json: no Spanish for the service name "${s.name}"`);
  return es;
};
/** The visible trail and its BreadcrumbList (without @context, for a page's @graph). */
function trailOf(steps, rel, lang) {
  const c = crumbs(steps, { rel, lang });
  const { '@context': _ctx, ...ld } = c.ld;
  return { html: c.html, ld };
}

/* ── the four regions ──────────────────────────────────────────────────── */
function head(t, travel, items, lang = 'en') {
  const w = W[lang];
  const rel = pageRel(`${t.slug}.html`, lang);
  const url = `${SITE}/${rel}`;
  const where = `${t.name}, ${t.state}`;
  const one = travel.length === 1 ? travel[0] : null;
  const title = w.title(where);
  const desc = w.desc(where, one);
  // The price range is true for this town: the smallest load plus its lowest
  // travel fee, up to a full truck plus its highest. check-schema proves every
  // number is a real load price plus a real fee.
  const fees = travel.map((z) => z.cents);
  const oneTime = (r) => PRICES[r][ONE_TIME_COL];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${url}#service`,
        serviceType: w.serviceType,
        url,
        provider: { '@type': 'LocalBusiness', '@id': `${SITE}/#business`, name: site.NAME, telephone: site.PHONE_TEL },
        areaServed: { '@type': 'City', name: where },
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'USD',
          lowPrice: ((oneTime(0) + Math.min(...fees)) / 100).toFixed(2),
          highPrice: ((oneTime(PRICES.length - 1) + Math.max(...fees)) / 100).toFixed(2),
          offerCount: String(PRICES.length),
        },
      },
      faqPage(url, items),
      trailOf([{ name: t.name }], rel, lang).ld,
    ],
  };
  const hl = hreflang(rel);
  return [
    `  <!-- GENERATED by scripts/build-towns.mjs from content/towns/${t.slug}.md and index.html. Do not edit this page: change those and run npm run build. -->`,
    `  <title>${esc(title)}</title>`,
    `  <meta name="description" content="${esc(desc)}" />`,
    `  <link rel="canonical" href="${url}" />`,
    ...(hl ? [hl] : []),
    `  <meta property="og:title" content="${esc(title)}" />`,
    `  <meta property="og:description" content="${esc(desc)}" />`,
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:url" content="${url}" />`,
    // The share card, drawn by scripts/build-og-cards.mjs.
    `  <meta property="og:image" content="${SITE}/images/og/${lang === 'es' ? 'es-' : ''}${t.slug}.png" />`,
    '  <meta property="og:image:width" content="1200" />',
    '  <meta property="og:image:height" content="630" />',
    '  <meta name="twitter:card" content="summary_large_image" />',
    '  <meta name="theme-color" content="#15171A" />',
    '  <script type="application/ld+json">',
    JSON.stringify(ld, null, 2).replace(/^/gm, '  '),
    '  </script>',
  ].join('\n');
}

function hero(t, lang = 'en') {
  const w = W[lang];
  return [
    `      ${trailOf([{ name: t.name }], pageRel(`${t.slug}.html`, lang), lang).html}`,
    `      <p class="h-eyebrow">${w.eyebrow(t)}</p>`,
    `      <h1 class="h-title" id="hero-title">${w.h1(t)}</h1>`,
    `      <p class="h-lede">${inline(copyOf(t, lang).lede)}</p>`,
  ].join('\n');
}

function local(t, travel, towns, guess, lang = 'en') {
  const w = W[lang], href = hrefFor(lang), c = copyOf(t, lang);
  const zoneItems = travel.map((z) => [
    '          <li>',
    `            <span class="tz-name">${esc(w.zone(z.label))}: ${feeHtml(z.cents, guess, lang)}</span>`,
    `            <span class="tz-zips">${w.zips(z.zips, z.miles)}</span>`,
    '          </li>',
  ].join('\n'));
  const areas = c.areas.length ? [
    `      <h3 class="town-h3">${w.whereIn(esc(t.name))}</h3>`,
    '      <ul class="town-areas">',
    ...c.areas.map((a) => `        <li>${inline(a)}</li>`),
    '      </ul>',
  ] : [];
  // The other towns in the town's nearest zone: a way across the area.
  const zone = travel[0].key;
  // Every other town in the zone (the hub page is gone, so this is how the towns link up).
  const near = towns.filter((x) => x.slug !== t.slug && townTravel(x)[0].key === zone);
  const nearby = near.length ? [
    `      <nav class="town-nearby" aria-label="${esc(w.otherIn(travel[0].label))}">`,
    `        <h3 class="town-h3">${esc(w.alsoIn(travel[0].label))}</h3>`,
    '        <ul>',
    ...near.map((x) => `          <li><a href="${href(`${x.slug}.html`)}">${esc(x.name)}</a></li>`),
    '        </ul>',
    '      </nav>',
  ] : [];
  // Every service, those that name this town first: the way from a town to the job.
  const named = (s) => Number(s.towns.some((x) => x.slug === t.slug));
  const svc = [...services()].sort((a, b) => named(b) - named(a));
  const jobs = svc.length ? [
    `      <nav class="town-nearby town-jobs" aria-label="${esc(w.jobsIn(t.name))}">`,
    `        <h3 class="town-h3">${esc(w.jobsIn(t.name))}</h3>`,
    '        <ul>',
    ...svc.map((s) => `          <li><a href="${href(`${s.metro}/${s.slug}.html`)}">${esc(svcName(s, lang))}</a></li>`),
    '        </ul>',
    '      </nav>',
  ] : [];
  return [
    '<section class="band is-card town-local" aria-labelledby="local-title">',
    '  <div class="wrap">',
    '    <div class="section-head">',
    `      <p class="h-eyebrow dark">${esc(t.name)}, ${t.state === 'OR' ? 'Oregon' : 'Washington'}</p>`,
    `      <h2 class="section-title" id="local-title">${w.localTitle(esc(t.name))}</h2>`,
    '    </div>',
    '    <div class="town-grid">',
    '      <div class="prose">',
    ...c.local.map((p) => `        <p>${inline(p)}</p>`),
    '      </div>',
    `      <aside class="town-zones" aria-label="${w.travelTo(esc(t.name))}">`,
    `        <h3 class="town-h3">${w.travelTo(esc(t.name))}</h3>`,
    '        <ul>',
    ...zoneItems,
    '        </ul>',
    `        <p class="tz-note">${w.tzNote}</p>`,
    '      </aside>',
    '    </div>',
    ...areas,
    ...jobs,
    ...nearby,
    '  </div>',
    '</section>',
  ].join('\n');
}

/** The town's questions: its own, then two answered from the zone table. */
function faqItems(t, travel, guess, lang = 'en') {
  const w = W[lang];
  const where = t.name;
  const travelA = travel.length === 1
    ? (travel[0].cents
      ? w.travelOne(where, travel[0].label, feeHtml(travel[0].cents, guess, lang))
      : w.travelHome(where, feeHtml(0, guess, lang)))
    : w.travelMany(w.list(travel.map((z) => `${w.zoneInList(z.label)} (${w.list(z.zips)}): ${feeHtml(z.cents, guess, lang)}`)));
  return [
    ...copyOf(t, lang).faqs.map((f) => ({ q: inline(f.q), a: inline(f.a) })),
    { q: w.travelQ(esc(where)), a: travelA },
    { q: w.zipsQ(esc(where)), a: w.zipsA(w.list(t.zips)) },
  ];
}

function faq(t, items, lang = 'en') {
  const w = W[lang];
  return [
    '<section class="band is-surf faq-band" aria-labelledby="faq">',
    '  <div class="wrap-text">',
    '    <div class="section-head center">',
    `      <p class="h-eyebrow dark">${w.faqEyebrow(esc(t.name))}</p>`,
    `      <h2 class="section-title" id="faq">${w.goodToKnow}</h2>`,
    '    </div>',
    '    <div class="faq">',
    ...items.map((i) => `      <details><summary>${i.q}</summary><p>${i.a}</p></details>`),
    '    </div>',
    `    <p class="faq-more"><a href="${hrefFor(lang)('faq.html')}">${w.moreFaq}</a></p>`,
    '  </div>',
    '</section>',
  ].join('\n');
}

function swapRegions(index, regions) {
  let out = eol(index);
  for (const [name, body] of Object.entries(regions)) {
    const open = `<!-- CITY:${name} -->`, close = `<!-- /CITY:${name} -->`;
    const a = out.indexOf(open), b = out.indexOf(close);
    if (a < 0 || b < 0) throw new Error(`index.html: CITY:${name} markers not found`);
    out = out.slice(0, a + open.length) + '\n' + body + '\n' + out.slice(b);
  }
  return out;
}

/**
 * The town's page: `index` with the town's four regions swapped in. For
 * lang 'es', `index` is the Spanish homepage (toSpanish) and the town's
 * Spanish sections fill the regions.
 */
export function buildPage(index, t, towns, guess = GUESS.zones, lang = 'en') {
  if (lang === 'es' && !t.es) throw new Error(`content/towns/${t.slug}.md has no Spanish sections`);
  const travel = townTravel(t);
  const items = faqItems(t, travel, guess, lang);
  return swapRegions(index, { head: head(t, travel, items, lang), hero: hero(t, lang), local: local(t, travel, towns, guess, lang), faq: faq(t, items, lang) });
}

/* ── the zone list on the homepage, and the hub page ───────────────────── */
const zoneMiles = (z, i) => (i === 0 ? `Up to ${z.upToMiles} road miles from Gresham` : `${ZONES[i - 1].upToMiles} to ${z.upToMiles} road miles`);
const zoneFeeText = (cents) => (cents ? `+${fmt(cents)} per visit` : 'No travel charge');
const zoneCents = (z) => Math.round(z.fee * 100);
const guessed = (html, on) => (on ? `<span class="guess">${html}</span>` : html);
/** Towns with a ZIP in this zone, nearest first. */
function townsIn(zoneKey, towns) {
  const near = (t) => Math.min(...t.zips.filter((z) => ZIP_ZONES[z].zone === zoneKey).map((z) => ZIP_ZONES[z].miles));
  return towns.filter((t) => t.zips.some((z) => ZIP_ZONES[z].zone === zoneKey)).sort((a, b) => near(a) - near(b) || a.name.localeCompare(b.name));
}

/** "Where we go" on the homepage (and so on every town page): a card per zone, linking its towns. */
export function homeArea(towns, guess = GUESS.zones) {
  return [
    '    <ol class="zones" id="zoneList">',
    ...ZONES.map((z, i) => {
      const inZone = townsIn(z.key, towns);
      const shown = inZone.slice(0, 8).map((t) => `<a href="${t.slug}.html">${esc(t.name)}</a>`);
      const more = inZone.length > 8 ? ` and <a href="service-areas.html#zone-${z.key}">${inZone.length - 8} more</a>` : '';
      return [
        `      <li data-zone="${z.key}">`,
        `        <span class="zone-top"><span class="zone-name">${esc(z.label)}</span><span class="zone-fee">${guessed(zoneFeeText(zoneCents(z)), guess)}</span></span>`,
        `        <span class="zone-miles">${guessed(zoneMiles(z, i), guess)}</span>`,
        `        <span class="zone-places">${shown.join(', ')}${more}</span>`,
        '      </li>',
      ].join('\n');
    }),
    '    </ol>',
  ].join('\n');
}

/* The hub's own words. */
const H = {
  en: {
    title: 'Service Areas: Portland Metro and Vancouver | Haulmighty',
    desc: 'Every town we haul from, by travel zone: Gresham and East County, Portland, the west side and Clark County. Type your ZIP to see your zone and travel.',
    items: (guess) => [
      { q: 'My town is not listed. Do you come to me?', a: 'Maybe. Every ZIP inside our travel zones books online, listed town or not. Type yours on this page or in the quote. If it is past our last zone, call or text and we will quote it by hand.' },
      { q: 'How is the travel charge set?', a: `By the road miles from our base in Gresham to the center of your ZIP code, in ${ZONES.length} rings. The closest ring has ${guessed(zoneFeeText(zoneCents(ZONES[0])).toLowerCase(), guess)}; each ring farther out adds a flat amount per visit.` },
      { q: 'Do you work in Washington?', a: 'Yes. We serve Vancouver and the Clark County towns across the I-205 and I-5 bridges, priced the same way as Oregon jobs, by load size plus travel.' },
      { q: 'Is travel added to monthly pickups too?', a: 'Yes. Travel is part of every visit, so a monthly pickup includes it each month, and the quarterly prepay includes it at the same 10% off.' },
    ],
    eyebrow: 'Where we haul',
    h1: 'Every town we serve. <span>See your price.</span>',
    lede: 'From our base in Gresham across the Portland metro and over the river to Clark County. Find your town below, or type your ZIP to see your zone and travel.',
    zoneHead: (z) => `${esc(z.label)}: `,
    zoneFee: (cents) => zoneFeeText(cents).toLowerCase(),
    miles: zoneMiles,
    count: (n) => `${n} ${n === 1 ? 'town' : 'towns'}`,
    localEyebrow: 'Service areas',
    localTitle: 'Towns by travel zone',
    servicesTitle: 'Jobs we do across the metro',
    intro: (n) => `We serve ${n} towns in Oregon and Washington. Travel is set by your ZIP code in rings of road miles from our base in Gresham, and it is added to the load price for each visit. A town that spans two zones is listed in both; your ZIP decides which applies to you.`,
    notListed: 'Not on the list? Your ZIP may still be inside a zone. <a href="book/quote.html">Type it in the quote</a>, or call or text <a href="tel:+19254086053">(925) 408-6053</a>.',
    faqEyebrow: 'Service area questions',
  },
  es: {
    title: 'Dónde Trabajamos: Portland y Vancouver | Haulmighty',
    desc: 'Todas las ciudades donde trabajamos, por zona de viaje: Gresham y el este, Portland, el lado oeste y el condado de Clark. Escribe tu código postal.',
    items: (guess) => [
      { q: 'Mi ciudad no está en la lista. ¿Llegan hasta mí?', a: 'Puede ser. Todo código postal dentro de nuestras zonas de viaje se reserva en línea, esté o no en la lista. Escribe el tuyo en esta página o en la cotización. Si queda después de nuestra última zona, llama o escribe y te damos el precio directamente.' },
      { q: '¿Cómo se calcula el cargo de viaje?', a: `Por las millas por carretera desde nuestra base en Gresham hasta el centro de tu código postal, en ${ZONES.length} anillos. El anillo más cercano va ${guessed('sin cargo de viaje', guess)}; cada anillo más lejos suma una cantidad fija por visita.` },
      { q: '¿Trabajan en Washington?', a: 'Sí. Vamos a Vancouver y a las ciudades del condado de Clark, cruzando los puentes de la I-205 y la I-5, con los mismos precios que en Oregon: por tamaño de carga más el viaje.' },
      { q: '¿El viaje se suma también a las recolecciones mensuales?', a: 'Sí. El viaje es parte de cada visita, así que la recolección mensual lo incluye cada mes, y el pago trimestral por adelantado lo incluye con el mismo 10% de descuento.' },
    ],
    eyebrow: 'Dónde trabajamos',
    h1: 'Todas nuestras ciudades. <span>Ve tu precio.</span>',
    lede: 'Desde nuestra base en Gresham por toda el área de Portland y cruzando el río hasta el condado de Clark. Busca tu ciudad abajo, o escribe tu código postal para ver tu zona y el viaje.',
    zoneHead: (z) => `${esc(zoneEs(z.label))}: `,
    zoneFee: (cents) => (cents ? `+${fmt(cents)} por visita` : 'sin cargo de viaje'),
    miles: (z, i) => (i === 0 ? `Hasta ${z.upToMiles} millas por carretera desde Gresham` : `De ${ZONES[i - 1].upToMiles} a ${z.upToMiles} millas por carretera`),
    count: (n) => `${n} ${n === 1 ? 'ciudad' : 'ciudades'}`,
    localEyebrow: 'Zonas de servicio',
    localTitle: 'Ciudades por zona de viaje',
    servicesTitle: 'Trabajos que hacemos en toda el área',
    intro: (n) => `Trabajamos en ${n} ciudades de Oregon y Washington. El viaje depende de tu código postal, en anillos de millas por carretera desde nuestra base en Gresham, y se suma al precio de la carga en cada visita. Una ciudad que abarca dos zonas aparece en las dos; tu código postal decide cuál te toca.`,
    notListed: '¿No está en la lista? Tu código postal puede estar dentro de una zona. <a href="../book/quote.html">Escríbelo en la cotización</a>, o llama o escribe al <a href="tel:+19254086053">(925) 408-6053</a>.',
    faqEyebrow: 'Preguntas sobre las zonas',
  },
};


/* ── the homepage map, town chips and footer towns (round 7) ─────────────── */
/* Zone colors, nearest to farthest: yellow, orange, slate, charcoal. A fifth
   zone needs a fifth color here (the build stops until it has one). */
const MAP_COLORS = ['#FFD23F', '#F2A541', '#9AA5B1', '#2E3440'];
const MAP_W = 600, MAP_PAD = 30;
/** The towns with the most ZIPs we serve, nearest first on a tie: the map labels, chips and footer. */
export function biggestTowns(towns, n = 6) {
  const near = (t) => Math.min(...t.zips.map((z) => ZIP_ZONES[z].miles));
  return [...towns].sort((a, b) => b.zips.length - a.zips.length || near(a) - near(b)).slice(0, n);
}
/** "Where we go": every ZIP in the zones as a dot at its real place, colored by its
 *  zone, the base marked, six towns named; the legend gives each zone's fee. */
export function homeMap(towns, guess = GUESS.zones, base = BASE) {
  if (ZONES.length > MAP_COLORS.length) throw new Error(`build-towns: ${ZONES.length} zones, but MAP_COLORS has ${MAP_COLORS.length} colors`);
  const color = Object.fromEntries(ZONES.map((z, i) => [z.key, MAP_COLORS[i]]));
  // Projected around the base in pricing.config.mjs, so moving BASE moves the marker.
  const lat0 = base.lat, lon0 = base.lon;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = ([lat, lon]) => [(lon - lon0) * k, lat0 - lat];
  const zips = Object.keys(ZIP_ZONES);
  for (const z of zips) if (!POINTS.zips[z]) throw new Error(`build-towns: no map point for ZIP ${z} (run node scripts/measure-zips.mjs --points)`);
  const raw = [[0, 0], ...zips.map((z) => xy(POINTS.zips[z]))];
  const minX = Math.min(...raw.map((p) => p[0])), maxX = Math.max(...raw.map((p) => p[0]));
  const minY = Math.min(...raw.map((p) => p[1])), maxY = Math.max(...raw.map((p) => p[1]));
  const s = (MAP_W - 2 * MAP_PAD) / (maxX - minX);
  const H = Math.round((maxY - minY) * s + 2 * MAP_PAD);
  const at = (p) => { const [x, y] = xy(p); return [Math.round((x - minX) * s + MAP_PAD), Math.round((y - minY) * s + MAP_PAD)]; };
  // Farthest zones first, so the nearer dots sit on top.
  const order = [...zips].sort((a, b) => ZONES.findIndex((z) => z.key === ZIP_ZONES[b].zone) - ZONES.findIndex((z) => z.key === ZIP_ZONES[a].zone) || a.localeCompare(b));
  const dots = order.map((z) => { const [x, y] = at(POINTS.zips[z]); return `<circle cx="${x}" cy="${y}" r="7" data-zip="${z}" data-zone="${ZIP_ZONES[z].zone}" fill="${color[ZIP_ZONES[z].zone]}"/>`; });
  // Each label over the middle of its town's ZIPs; one that would overlap a label
  // already placed moves down or up a line until it is clear (about 12px a letter at 21px).
  const placed = [];
  const clash = (b) => placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  const labels = biggestTowns(towns).map((t) => {
    const pts = t.zips.map((z) => at(POINTS.zips[z]));
    const x = Math.round(pts.reduce((m, p) => m + p[0], 0) / pts.length);
    const y0 = Math.round(pts.reduce((m, p) => m + p[1], 0) / pts.length) - 14;
    const half = (t.name.length * 12) / 2;
    let y = y0;
    for (const dy of [0, 24, -24, 48, -48, 72, -72]) {
      y = y0 + dy;
      if (!clash({ x0: x - half, x1: x + half, y0: y - 18, y1: y + 4 })) break;
    }
    placed.push({ x0: x - half, x1: x + half, y0: y - 18, y1: y + 4 });
    return `<text x="${x}" y="${y}">${esc(t.name)}</text>`;
  });
  const [bx, by] = at([base.lat, base.lon]);
  // The drawing is hidden from screen readers: the caption (the zones, their fees and the
  // note) says what it shows, in English and, through build-es, in Spanish.
  const key = ZONES.map((z, i) => [
    `          <li data-zone="${z.key}"><span class="key-dot" style="background:${color[z.key]}"></span>`,
    `<span class="key-name">${esc(z.label)}</span> <span class="key-fee">${guessed(zoneFeeText(zoneCents(z)), guess)}</span></li>`,
  ].join(''));
  return [
    '      <figure class="area-map">',
    `        <svg viewBox="0 0 ${MAP_W} ${H}" aria-hidden="true" focusable="false">`,
    `          <g class="map-dots" stroke="#15171A" stroke-width="1.5">${dots.join('')}</g>`,
    `          <g class="map-base" transform="translate(${bx} ${by})"><circle r="14" fill="#15171A"/><path d="M-7 1 0-6 7 1v7h-14z" fill="#FFD23F"/></g>`,
    `          <g class="map-labels" aria-hidden="true">${labels.join('')}</g>`,
    '        </svg>',
    '        <figcaption>',
    '          <ul class="map-key">',
    ...key,
    '          </ul>',
    `          <p class="map-note">Map: each dot is a ZIP code we serve, colored by its travel zone. Our base is in ${esc(base.label)}.</p>`,
    '        </figcaption>',
    '      </figure>',
  ].join('\n');
}
/** The biggest towns as chips beside the ZIP check, and every town at the end. */
export function homeChips(towns) {
  return [
    '        <ul class="town-chips">',
    ...biggestTowns(towns).map((t) => `          <li><a href="${t.slug}.html">${esc(t.name)}</a></li>`),
    '          <li><a class="is-all" href="service-areas.html">All service areas</a></li>',
    '        </ul>',
  ].join('\n');
}
/** The footer's "Where we go" column: the hub and the biggest towns. */
/** The footer's Services column: every service page, in the order of content/services/portland/ORDER. */
export function footServices() {
  return services().map((s) => `      <li><a href="${s.metro}/${s.slug}.html">${esc(s.name)}</a></li>`).join('\n');
}

export function footTowns(towns) {
  return [
    ...biggestTowns(towns).map((t) => `      <li><a href="${t.slug}.html">${esc(t.name)}</a></li>`),
  ].join('\n');
}

/** One BUILD block of a page rewritten, at the indent of its opening marker. */
function spliceBlock(s, name, body) {
  const open = `<!-- BUILD:${name} -->`, close = `<!-- /BUILD:${name} -->`;
  const a = s.indexOf(open), b = s.indexOf(close);
  if (a < 0 || b < 0) throw new Error(`index.html: BUILD:${name} markers not found`);
  const indent = (s.slice(0, a).match(/[ \t]*$/) || [''])[0];
  return s.slice(0, a + open.length) + '\n' + body + '\n' + indent + s.slice(b);
}
/** index.html with the blocks this builder owns rewritten: the zone list, the map,
 *  the town chips and the footer's towns. */
function withHomeArea(index, towns) {
  let s = eol(index);
  s = spliceBlock(s, 'foot-towns', footTowns(towns));
  s = spliceBlock(s, 'foot-services', footServices());
  return s;
}

/* ── main ──────────────────────────────────────────────────────────────── */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const towns = loadTowns();
  const stale = [], written = [];
  const put = (rel, out) => {
    const file = path.join(ROOT, rel);
    const before = fs.existsSync(file) ? eol(fs.readFileSync(file, 'utf8')) : '';
    if (before === out) return;
    if (check) stale.push(rel);
    else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, out); written.push(rel); }
  };
  // The homepage blocks this builder owns first (the zone list, the map, the town
  // chips, the footer towns), since every page below is a copy of index.html.
  const homeBefore = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const index = withHomeArea(homeBefore, towns);
  if (eol(homeBefore) !== index) {
    if (check) stale.push('index.html (zone list, map, town chips, footer towns)');
    else { fs.writeFileSync(path.join(ROOT, 'index.html'), homeBefore.includes('\r\n') ? index.replace(/\n/g, '\r\n') : index); written.push('index.html'); }
  }
  // The Spanish template: the homepage (with its new zone list) in Spanish.
  const es = towns.some((t) => t.es) ? toSpanish(index, { map: loadMap() }) : null;
  // Spanish is paused (founder 2026-10-13): a phrase with no Spanish stays in English.
  if (es && es.missing.length) console.warn(`build-towns: index.html has ${es.missing.length} phrase(s) with no Spanish yet, left in English (node scripts/build-es.mjs lists them)`);
  for (const t of towns) {
    put(`${t.slug}.html`, setLangSwitch(buildPage(index, t, towns, GUESS.zones), `${t.slug}.html`));
    if (t.es) put(`es/${t.slug}.html`, setLangSwitch(buildPage(es.html, t, towns, GUESS.zones, 'es'), `es/${t.slug}.html`));
  }
  // No hub page any more (founder 2026-10-13: "just nuke it"): service-areas.html and its
  // Spanish twin are removed below as orphans; vercel.json sends their old address home.
  // A page whose town file is gone would linger with stale prices: flag it.
  const generated = (dir) => (fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir)) : [])
    .filter((f) => f.endsWith('.html') && /GENERATED by scripts\/build-towns\.mjs from content\/towns\//.test(fs.readFileSync(path.join(ROOT, dir, f), 'utf8')))
    .map((f) => (dir === '.' ? f : `${dir}/${f}`));
  const orphans = [
    ...generated('.').filter((f) => !towns.some((t) => `${t.slug}.html` === f)),
    ...generated('es').filter((f) => !towns.some((t) => t.es && `es/${t.slug}.html` === f)),
  ];
  if (check) {
    if (stale.length || orphans.length) {
      console.error(`build-towns --check: run \`npm run build\`.${stale.length ? `\n  stale: ${stale.join(', ')}` : ''}${orphans.length ? `\n  no town file: ${orphans.join(', ')}` : ''}`);
      process.exit(1);
    }
    console.log(`build-towns --check: OK, ${towns.length} town pages match their files and index.html`);
  } else {
    for (const f of orphans) { fs.unlinkSync(path.join(ROOT, f)); console.log(`build-towns: removed ${f} (its town file is gone)`); }
    console.log(written.length ? `build-towns: wrote ${written.length} page(s): ${written.join(', ')}` : `build-towns: ${towns.length} pages already up to date`);
  }
}
