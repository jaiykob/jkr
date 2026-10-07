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
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ZIP_ZONES, ZONES, GUESS, PRICES, ONE_TIME_COL, fmt } from '../pricing.config.mjs';
import site from '../api/_lib/site.js';

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
/** FAQPage JSON-LD from the same question list the page shows, so the two cannot disagree. */
const faqPage = (url, items) => ({
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
  const faq = section('FAQ');
  for (const m of faq.matchAll(/^Q:[ \t]*(.+)\n(?:[ \t]*\n)*A:[ \t]*([\s\S]+?)(?=\n[ \t]*\n[ \t]*Q:|\s*$)/gm)) {
    t.faqs.push({ q: m[1].trim(), a: m[2].replace(/\s*\n\s*/g, ' ').trim() });
  }
  if (!t.name) fail('no "name:" line');
  if (!/^(OR|WA)$/.test(t.state)) fail(`state is "${t.state}", want OR or WA`);
  if (!/^[a-z0-9-]+$/.test(slug)) fail('file name must be lowercase words joined by hyphens');
  if (!t.zips.length) fail('no "zips:" line');
  for (const z of t.zips) if (!ZIP_ZONES[z]) fail(`ZIP ${z} is not in any travel zone (pricing.config.mjs)`);
  if (!t.lede) fail('no "lede:" line');
  if (!t.local.length) fail('no "## Local" paragraphs');
  if (t.faqs.length < 2) fail(`${t.faqs.length} questions under "## FAQ" (want 2 or more, as Q: and A: lines)`);
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

const fee = (cents) => (cents ? `${fmt(cents)} per visit` : 'no travel charge');
const feeHtml = (cents, guess) => (guess ? `<span class="guess">${fee(cents)}</span>` : fee(cents));
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/* ── the four regions ──────────────────────────────────────────────────── */
function head(t, travel, items) {
  const where = `${t.name}, ${t.state}`;
  const one = travel.length === 1 ? travel[0] : null;
  const travelPhrase = one ? (one.cents ? `${one.label} travel` : 'no travel charge') : 'travel by ZIP';
  const title = `Junk Removal in ${where} | Brand Name`;
  const desc = `Junk removal in ${where}. Snap or tap what is going, see your price with ${travelPhrase}, and we haul it away. Based in Gresham.`;
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
        '@id': `${SITE}/${t.slug}.html#service`,
        serviceType: 'Junk removal',
        url: `${SITE}/${t.slug}.html`,
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
      faqPage(`${SITE}/${t.slug}.html`, items),
    ],
  };
  return [
    `  <!-- GENERATED by scripts/build-towns.mjs from content/towns/${t.slug}.md and index.html. Do not edit this page: change those and run npm run build. -->`,
    `  <title>${esc(title)}</title>`,
    `  <meta name="description" content="${esc(desc)}" />`,
    `  <link rel="canonical" href="${SITE}/${t.slug}.html" />`,
    `  <meta property="og:title" content="${esc(title)}" />`,
    `  <meta property="og:description" content="${esc(desc)}" />`,
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:url" content="${SITE}/${t.slug}.html" />`,
    '  <meta name="theme-color" content="#15171A" />',
    '  <script type="application/ld+json">',
    JSON.stringify(ld, null, 2).replace(/^/gm, '  '),
    '  </script>',
  ].join('\n');
}

function hero(t) {
  return [
    `      <p class="h-eyebrow">Junk removal in ${esc(t.name)}, ${t.state}</p>`,
    `      <h1 class="h-title" id="hero-title">${esc(t.name)} junk removal.<span>See your price.</span></h1>`,
    `      <p class="h-lede">${inline(t.lede)}</p>`,
  ].join('\n');
}

function local(t, travel, towns, guess) {
  const zoneItems = travel.map((z) => [
    '          <li>',
    `            <span class="tz-name">${esc(z.label)}: ${feeHtml(z.cents, guess)}</span>`,
    `            <span class="tz-zips">ZIP ${list(z.zips)}, ${z.miles[0] === z.miles[1] ? `${z.miles[0]}` : `${z.miles[0]} to ${z.miles[1]}`} road miles from Gresham</span>`,
    '          </li>',
  ].join('\n'));
  const areas = t.areas.length ? [
    `      <h3 class="town-h3">Where we haul in ${esc(t.name)}</h3>`,
    '      <ul class="town-areas">',
    ...t.areas.map((a) => `        <li>${inline(a)}</li>`),
    '      </ul>',
  ] : [];
  // Up to six other towns in the town's nearest zone: a way across the area.
  const zone = travel[0].key;
  const near = towns.filter((x) => x.slug !== t.slug && townTravel(x)[0].key === zone).slice(0, 6);
  const nearby = near.length ? [
    `      <nav class="town-nearby" aria-label="Other towns in the ${esc(travel[0].label.toLowerCase())}">`,
    `        <h3 class="town-h3">Also in the ${esc(travel[0].label.toLowerCase())}</h3>`,
    '        <ul>',
    ...near.map((x) => `          <li><a href="${x.slug}.html">${esc(x.name)}</a></li>`),
    '          <li><a href="service-areas.html">Every town we serve</a></li>',
    '        </ul>',
    '      </nav>',
  ] : [];
  return [
    '<section class="band is-card town-local" aria-labelledby="local-title">',
    '  <div class="wrap">',
    '    <div class="section-head">',
    `      <p class="h-eyebrow dark">${esc(t.name)}, ${t.state === 'OR' ? 'Oregon' : 'Washington'}</p>`,
    `      <h2 class="section-title" id="local-title">Junk removal in ${esc(t.name)}</h2>`,
    '    </div>',
    '    <div class="town-grid">',
    '      <div class="prose">',
    ...t.local.map((p) => `        <p>${inline(p)}</p>`),
    '      </div>',
    `      <aside class="town-zones" aria-label="Travel to ${esc(t.name)}">`,
    `        <h3 class="town-h3">Travel to ${esc(t.name)}</h3>`,
    '        <ul>',
    ...zoneItems,
    '        </ul>',
    '        <p class="tz-note">Added to the load price for each visit. Your ZIP sets it when you get your price.</p>',
    '      </aside>',
    '    </div>',
    ...areas,
    ...nearby,
    '  </div>',
    '</section>',
  ].join('\n');
}

/** The town's questions: its own, then two answered from the zone table. */
function faqItems(t, travel, guess) {
  const where = t.name;
  const travelA = travel.length === 1
    ? (travel[0].cents
      ? `Yes. ${where} is in our ${travel[0].label.toLowerCase()}, so travel adds ${feeHtml(travel[0].cents, guess)} to the load price. It is shown in your price before you book.`
      : `No. ${where} is in our home zone, close to our base in Gresham, so there is ${feeHtml(0, guess)}.`)
    : `It depends on your ZIP. ${list(travel.map((z) => `${z.label.toLowerCase().startsWith('home') ? 'the home zone' : z.label} (${list(z.zips)}): ${feeHtml(z.cents, guess)}`))}. Your price shows it before you book.`;
  const items = [
    ...t.faqs.map((f) => ({ q: inline(f.q), a: inline(f.a) })),
    { q: `Is there a travel charge to ${esc(where)}?`, a: travelA },
    { q: `Which ${esc(where)} ZIP codes do you cover?`, a: `All of these: ${list(t.zips)}. Type yours in the quote and the price includes travel.` },
  ];
  return items;
}

function faq(t, items) {
  const where = t.name;
  return [
    '<section class="band is-card" aria-labelledby="faq">',
    '  <div class="wrap-text">',
    '    <div class="section-head center">',
    `      <p class="h-eyebrow dark">${esc(where)} questions</p>`,
    '      <h2 class="section-title" id="faq">Good to know</h2>',
    '    </div>',
    '    <div class="faq">',
    ...items.map((i) => `      <details><summary>${i.q}</summary><p>${i.a}</p></details>`),
    '    </div>',
    '    <p class="faq-more"><a href="faq.html">More questions and answers</a></p>',
    '  </div>',
    '</section>',
  ].join('\n');
}

/** Swap each named region of index.html for its body. */
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

/** index.html with the town's four regions swapped in. */
export function buildPage(index, t, towns, guess = GUESS.zones) {
  const travel = townTravel(t);
  const items = faqItems(t, travel, guess);
  return swapRegions(index, { head: head(t, travel, items), hero: hero(t), local: local(t, travel, towns, guess), faq: faq(t, items) });
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

/** service-areas.html: the homepage with every town, zone by zone. */
export function buildHub(index, towns, guess = GUESS.zones) {
  const title = 'Service Areas: Portland Metro and Vancouver | Brand Name';
  const desc = 'Every town we haul from, by travel zone: Gresham and East County, Portland, the west side and Clark County. Type your ZIP to see your zone and travel.';
  const hubItems = [
    { q: 'My town is not listed. Do you come to me?', a: 'Maybe. Every ZIP inside our travel zones books online, listed town or not. Type yours on this page or in the quote. If it is past our last zone, call or text and we will quote it by hand.' },
    { q: 'How is the travel charge set?', a: `By the road miles from our base in Gresham to the center of your ZIP code, in ${ZONES.length} rings. The closest ring has ${guessed(zoneFeeText(zoneCents(ZONES[0])).toLowerCase(), guess)}; each ring farther out adds a flat amount per visit.` },
    { q: 'Do you work in Washington?', a: 'Yes. We serve Vancouver and the Clark County towns across the I-205 and I-5 bridges, priced the same way as Oregon jobs, by load size plus travel.' },
    { q: 'Is travel added to monthly pickups too?', a: 'Yes. Travel is part of every visit, so a monthly pickup includes it each month, and the quarterly prepay includes it at the same 10% off.' },
  ];
  const headR = [
    '  <!-- GENERATED by scripts/build-towns.mjs from content/towns/ and index.html. Do not edit this page: change those and run npm run build. -->',
    `  <title>${esc(title)}</title>`,
    `  <meta name="description" content="${esc(desc)}" />`,
    `  <link rel="canonical" href="${SITE}/service-areas.html" />`,
    `  <meta property="og:title" content="${esc(title)}" />`,
    `  <meta property="og:description" content="${esc(desc)}" />`,
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:url" content="${SITE}/service-areas.html" />`,
    '  <meta name="theme-color" content="#15171A" />',
    '  <script type="application/ld+json">',
    JSON.stringify({ '@context': 'https://schema.org', '@graph': [faqPage(`${SITE}/service-areas.html`, hubItems)] }, null, 2).replace(/^/gm, '  '),
    '  </script>',
  ].join('\n');
  const heroR = [
    '      <p class="h-eyebrow">Where we haul</p>',
    '      <h1 class="h-title" id="hero-title">Every town we serve.<span>See your price.</span></h1>',
    `      <p class="h-lede">From our base in Gresham across the Portland metro and over the river to Clark County. Find your town below, or type your ZIP to see your zone and travel.</p>`,
  ].join('\n');
  const zones = ZONES.map((z, i) => {
    const inZone = townsIn(z.key, towns);
    if (!inZone.length) return '';
    return [
      `    <section class="hub-zone" id="zone-${z.key}" aria-labelledby="zone-${z.key}-title">`,
      `      <h3 class="town-h3" id="zone-${z.key}-title">${esc(z.label)}: ${guessed(zoneFeeText(zoneCents(z)).toLowerCase().replace(/^\+/, '+'), guess)}</h3>`,
      `      <p class="hub-miles">${guessed(zoneMiles(z, i), guess)}. ${inZone.length} ${inZone.length === 1 ? 'town' : 'towns'}.</p>`,
      '      <ul class="hub-towns">',
      ...inZone.map((t) => `        <li><a href="${t.slug}.html">${esc(t.name)}<span class="hub-state">${t.state}</span></a></li>`),
      '      </ul>',
      '    </section>',
    ].join('\n');
  }).filter(Boolean);
  const localR = [
    '<section class="band is-card town-local" aria-labelledby="local-title">',
    '  <div class="wrap">',
    '    <div class="section-head">',
    '      <p class="h-eyebrow dark">Service areas</p>',
    '      <h2 class="section-title" id="local-title">Towns by travel zone</h2>',
    '    </div>',
    '    <div class="prose">',
    `      <p>We serve ${towns.length} towns in Oregon and Washington. Travel is set by your ZIP code in rings of road miles from our base in Gresham, and it is added to the load price for each visit. A town that spans two zones is listed in both; your ZIP decides which applies to you.</p>`,
    '    </div>',
    ...zones,
    '    <p class="hub-not-listed">Not on the list? Your ZIP may still be inside a zone. <a href="#area">Type it here</a>, or call or text <a href="tel:+19254086053">(925) 408-6053</a>.</p>',
    '  </div>',
    '</section>',
  ].join('\n');
  const faqR = [
    '<section class="band is-card" aria-labelledby="faq">',
    '  <div class="wrap-text">',
    '    <div class="section-head center">',
    '      <p class="h-eyebrow dark">Service area questions</p>',
    '      <h2 class="section-title" id="faq">Good to know</h2>',
    '    </div>',
    '    <div class="faq">',
    ...hubItems.map((i) => `      <details><summary>${i.q}</summary><p>${i.a}</p></details>`),
    '    </div>',
    '    <p class="faq-more"><a href="faq.html">More questions and answers</a></p>',
    '  </div>',
    '</section>',
  ].join('\n');
  return swapRegions(index, { head: headR, hero: heroR, local: localR, faq: faqR });
}

/** index.html with its BUILD:home-area block (the zone list) rewritten. */
function withHomeArea(index, towns) {
  const s = eol(index);
  const open = '<!-- BUILD:home-area -->', close = '<!-- /BUILD:home-area -->';
  const a = s.indexOf(open), b = s.indexOf(close);
  if (a < 0 || b < 0) throw new Error('index.html: BUILD:home-area markers not found');
  const indent = (s.slice(0, a).match(/[ \t]*$/) || [''])[0];
  return s.slice(0, a + open.length) + '\n' + homeArea(towns) + '\n' + indent + s.slice(b);
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
    else { fs.writeFileSync(file, out); written.push(rel); }
  };
  // The homepage zone list first, since every page below is a copy of index.html.
  const homeBefore = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const index = withHomeArea(homeBefore, towns);
  if (eol(homeBefore) !== index) {
    if (check) stale.push('index.html (zone list)');
    else { fs.writeFileSync(path.join(ROOT, 'index.html'), homeBefore.includes('\r\n') ? index.replace(/\n/g, '\r\n') : index); written.push('index.html'); }
  }
  for (const t of towns) put(`${t.slug}.html`, buildPage(index, t, towns, GUESS.zones));
  put('service-areas.html', buildHub(index, towns, GUESS.zones));
  // A page whose town file is gone would linger with stale prices: flag it.
  const orphans = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && /GENERATED by scripts\/build-towns\.mjs from content\/towns\//.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))
    && !towns.some((t) => `${t.slug}.html` === f) && f !== 'service-areas.html');
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
