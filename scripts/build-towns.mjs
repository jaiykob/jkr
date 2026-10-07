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
import { ZIP_ZONES, ZONES, GUESS, fmt } from '../pricing.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOWN_DIR = path.join(ROOT, 'content/towns');
const SITE = 'https://www.example.com';
const eol = (s) => s.replace(/\r\n/g, '\n');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Plain text to HTML: escaped, with [[a guess]] shown red with an asterisk. */
export const inline = (s) => esc(s).replace(/\[\[([\s\S]+?)\]\]/g, '<span class="guess">$1</span>');
const plain = (s) => String(s).replace(/\[\[|\]\]/g, '');

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
function head(t, travel) {
  const where = `${t.name}, ${t.state}`;
  const one = travel.length === 1 ? travel[0] : null;
  const travelPhrase = one ? (one.cents ? `${one.label} travel` : 'no travel charge') : 'travel by ZIP';
  const title = `Junk Removal in ${where} | Brand Name`;
  const desc = `Junk removal in ${where}. Snap or tap what is going, see your price with ${travelPhrase}, and we haul it away. Based in Gresham.`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${SITE}/${t.slug}.html#service`,
    serviceType: 'Junk removal',
    url: `${SITE}/${t.slug}.html`,
    provider: { '@type': 'LocalBusiness', '@id': `${SITE}/#business`, name: 'Brand Name', telephone: '+19254086053' },
    areaServed: { '@type': 'City', name: where },
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

function faq(t, travel, guess) {
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

/** index.html with the town's four regions swapped in. */
export function buildPage(index, t, towns, guess = GUESS.zones) {
  const travel = townTravel(t);
  const regions = { head: head(t, travel), hero: hero(t), local: local(t, travel, towns, guess), faq: faq(t, travel, guess) };
  let out = eol(index);
  for (const [name, body] of Object.entries(regions)) {
    const open = `<!-- CITY:${name} -->`, close = `<!-- /CITY:${name} -->`;
    const a = out.indexOf(open), b = out.indexOf(close);
    if (a < 0 || b < 0) throw new Error(`index.html: CITY:${name} markers not found`);
    out = out.slice(0, a + open.length) + '\n' + body + '\n' + out.slice(b);
  }
  return out;
}

/* ── main ──────────────────────────────────────────────────────────────── */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const towns = loadTowns();
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const stale = [], written = [];
  for (const t of towns) {
    const file = path.join(ROOT, `${t.slug}.html`);
    const out = buildPage(index, t, towns, GUESS.zones);
    const before = fs.existsSync(file) ? eol(fs.readFileSync(file, 'utf8')) : '';
    if (before === out) continue;
    if (check) stale.push(`${t.slug}.html`);
    else { fs.writeFileSync(file, out); written.push(`${t.slug}.html`); }
  }
  // A page whose town file is gone would linger with stale prices: flag it.
  const orphans = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && /GENERATED by scripts\/build-towns\.mjs from content\/towns\//.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))
    && !towns.some((t) => `${t.slug}.html` === f));
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
