/**
 * Draws the share card (og:image) for every indexable page: the picture that
 * shows when someone texts or posts a link to the site.
 *
 *   node scripts/build-og-cards.mjs          # draw any card that is missing or out of date
 *   node scripts/build-og-cards.mjs --check  # verify only, non-zero if missing/stale (npm test)
 *
 * Carried over from Scoops Co., where thirteen pages shared to a blank
 * preview. A drawn card beats stock photos: every one is different, and what
 * it says is a fact (the town, its travel zone and fee), not a guess at what
 * a stranger's photo shows.
 *
 * Drawn in headless Chrome (scripts/lib/browser.mjs) with the site's own
 * fonts, 1200 by 630, into images/og/<slug>.png. images/og/manifest.json
 * keeps a fingerprint of what each card says, so --check knows a card is
 * stale (a fee changed, a town was renamed) without drawing anything, and the
 * build only redraws the cards that changed. While the zone fees are guesses,
 * a card shows its fee red with an asterisk, like the site does.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import site from '../api/_lib/site.js';
import { GUESS, fmt } from '../pricing.config.mjs';
import { pages } from './build-sitemap.mjs';
import { loadTowns, townTravel } from './build-towns.mjs';
import { loadPosts, T as BLOG } from './build-blog.mjs';
import { loadServices, sizesOf } from './build-services.mjs';
import { openBrowser } from './lib/browser.mjs';
import { serve } from './lib/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'images/og');
const MANIFEST = path.join(OUT, 'manifest.json');
const check = process.argv.includes('--check');
const VERSION = 1;   // bump when the card design changes, so every card redraws

/** The card's file name for a page: home, faq, portland, es-portland, blog-x, es-blog-x, portland-x (a service), quote, commercial. */
export function cardSlug(rel) {
  if (rel === 'index.html') return 'home';
  if (rel === 'es/index.html') return 'es-home';
  return rel.replace(/\/index\.html$/, '').replace(/^book\//, '').replace(/\.html$/, '').replace(/\//g, '-');
}

const townList = loadTowns();
// Every town page, English and Spanish: rel → [town, lang].
const towns = new Map(townList.flatMap((t) => [[`${t.slug}.html`, [t, 'en']], ...(t.es ? [[`es/${t.slug}.html`, [t, 'es']]] : [])]));
const posts = new Map(['en', 'es'].flatMap((l) => loadPosts(l).map((p) => [`${BLOG[l].dir}/${p.slug}.html`, p])));
// Every service page (round 9): rel → service.
const services = new Map(loadServices().map((s) => [`${s.metro}/${s.slug}.html`, s]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const zoneEs = (label) => String(label).replace(/^Home zone$/, 'Zona base').replace(/^Zone /, 'Zona ');

/** What a page's card says. */
function cardFor(rel) {
  const hit = towns.get(rel);
  if (hit) {
    const [t, lang] = hit;
    const tr = townTravel(t);
    if (lang === 'es') {
      const fee = tr.length > 1 ? 'Viaje según tu código postal' : tr[0].cents ? `${zoneEs(tr[0].label)}: viaje +${fmt(tr[0].cents)}` : 'Sin cargo de viaje';
      return { kicker: 'Retiro de basura', title: `${t.name}, ${t.state}`, sub: 'Toma una foto, ve tu precio y nos lo llevamos.', fee, guess: GUESS.zones };
    }
    const fee = tr.length > 1 ? 'Travel set by your ZIP' : tr[0].cents ? `${tr[0].label}: travel +${fmt(tr[0].cents)}` : 'No travel charge';
    return { kicker: 'Junk removal', title: `${t.name}, ${t.state}`, sub: 'Snap a photo, see your price, we haul it away.', fee, guess: GUESS.zones };
  }
  const svc = services.get(rel);
  if (svc) return { kicker: 'Junk removal in Portland', title: svc.name, sub: 'Pick a size or send a photo. We do the lifting.', fee: `From ${fmt(sizesOf(svc)[0].cents)} plus travel`, guess: GUESS.prices };
  const post = posts.get(rel);
  if (post) return { kicker: post.lang === 'es' ? 'Del blog' : 'From the blog', title: post.title, sub: post.summary, fee: null, guess: false, small: true };
  const fixed = {
    'index.html': { kicker: 'Junk removal across the Portland metro', title: 'Pick your size. See your price.', sub: 'Pick a size or send a photo. We do the lifting.' },
    'es/index.html': { kicker: 'Retiro de basura en el área de Portland', title: 'Elige tu tamaño. Ve tu precio.', sub: 'Elige un tamaño o manda una foto. Nosotros cargamos.' },
    'es/faq.html': { kicker: 'Ayuda', title: '¿Cómo te ayudamos?', sub: 'Precios, fotos, viaje, el día y lo que llevamos.' },
    'book/quote.html': { kicker: 'Get a price', title: 'Snap a photo. See your price.', sub: 'Travel for your ZIP included. Book online in a minute.' },
    'blog/index.html': { kicker: 'From the blog', title: 'Junk removal, plainly explained', sub: 'Costs, what can go, and where it ends up.' },
    'es/blog/index.html': { kicker: 'Del blog', title: 'Retiro de basura, explicado claro', sub: 'Precios, qué se puede llevar y a dónde va.' },
    'faq.html': { kicker: 'Help', title: 'How can we help?', sub: 'Prices, photos, travel, the day, and what we take.' },
    'before-we-come.html': { kicker: 'Before we come', title: 'Getting ready for your pickup', sub: 'What to set out, the path, parking and pets.' },
    'es/before-we-come.html': { kicker: 'Antes de que lleguemos', title: 'Cómo prepararte para tu retiro', sub: 'Qué sacar, el camino, dónde estacionarnos y las mascotas.' },
    'privacy.html': { kicker: site.NAME, title: 'Privacy policy', sub: 'What we collect, and what we do with it.' },
    'terms.html': { kicker: site.NAME, title: 'Terms of service', sub: 'Prices, travel, changes on the day, and refunds.' },
  }[rel];
  if (fixed) return { ...fixed, fee: null, guess: false };
  const title = ((fs.readFileSync(path.join(ROOT, rel), 'utf8').match(/<title>([^<|]+)/) || [])[1] || site.NAME).trim();
  return { kicker: site.NAME, title, sub: 'Junk removal across the Portland metro.', fee: null, guess: false };
}

const fingerprint = (c) => crypto.createHash('sha256').update(JSON.stringify({ VERSION, name: site.NAME, phone: site.PHONE, domain: site.DOMAIN, ...c })).digest('hex').slice(0, 16);

function cardHtml(c) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Bricolage Grotesque';src:url(/fonts/bricolage.woff2) format('woff2');font-weight:500 800}
@font-face{font-family:'DM Sans';src:url(/fonts/dm-sans.woff2) format('woff2');font-weight:300 700}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:#15171A;color:#F5F2EA;font-family:'DM Sans',Arial,sans-serif;position:relative}
body:before{content:'';position:absolute;inset:0;background:radial-gradient(60% 70% at 88% 12%,rgba(255,210,63,.20),transparent 70%),repeating-linear-gradient(135deg,rgba(255,255,255,.035) 0 2px,transparent 2px 24px)}
.bar{position:absolute;left:0;top:0;bottom:0;width:22px;background:#FFD23F}
.brand{position:absolute;left:84px;top:58px;font:800 42px 'Bricolage Grotesque',Arial,sans-serif;color:#FFD23F;letter-spacing:-.01em}
.kicker{position:absolute;left:84px;top:178px;font:800 26px 'DM Sans',Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#FFD23F}
h1{position:absolute;left:84px;right:84px;top:226px;margin:0;font:800 88px/1.02 'Bricolage Grotesque',Arial,sans-serif;letter-spacing:-.035em;color:#fff}
h1.small{font-size:64px;line-height:1.05}
.fee{position:absolute;left:84px;bottom:168px;font:800 36px 'DM Sans',Arial,sans-serif;color:#FFD23F}
.fee.guess{color:#FF8A80}.fee.guess:after{content:'*'}
.sub{position:absolute;left:84px;right:84px;bottom:112px;font:600 32px 'DM Sans',Arial,sans-serif;color:#F5F2EA}
.foot{position:absolute;left:84px;bottom:52px;font:600 28px 'DM Sans',Arial,sans-serif;color:rgba(245,242,234,.72)}
</style></head><body><div class="bar"></div><div class="brand">${esc(site.NAME)}</div>
<div class="kicker">${esc(c.kicker)}</div><h1${c.small ? ' class="small"' : ''}>${esc(c.title)}</h1>
${c.fee ? `<div class="fee${c.guess ? ' guess' : ''}">${esc(c.fee)}</div>` : ''}
<div class="sub">${esc(c.sub)}</div><div class="foot">${esc(site.PHONE)} · ${esc(site.DOMAIN)}</div></body></html>`;
}

const pngSize = (file) => { try { const b = fs.readFileSync(file); return b.readUInt32BE(0) === 0x89504e47 ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; } catch { return null; } };

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const want = pages().map((rel) => { const c = cardFor(rel); return { rel, slug: cardSlug(rel), card: c, fp: fingerprint(c) }; });
const stale = want.filter((w) => {
  const sz = pngSize(path.join(OUT, `${w.slug}.png`));
  return manifest[w.slug] !== w.fp || !sz || sz[0] !== 1200 || sz[1] !== 630;
});

if (check) {
  if (stale.length) { console.error(`build-og-cards --check: ${stale.length} card(s) missing or stale, run npm run build:og:\n  ${stale.slice(0, 10).map((w) => w.slug).join(', ')}`); process.exit(1); }
  console.log(`build-og-cards --check: OK, ${want.length} cards current`);
  process.exit(0);
}

if (stale.length) {
  fs.mkdirSync(OUT, { recursive: true });
  const cards = new Map(stale.map((w) => [w.slug, w.card]));
  const srv = await serve({ '/__card.html': (u) => cardHtml(cards.get(u.searchParams.get('slug'))) });
  const browser = await openBrowser();
  if (!browser) { srv.close(); console.error('build-og-cards: Chrome not found; cards need it to draw'); process.exit(1); }
  try {
    for (const w of stale) {
      const p = await browser.page({ width: 1200, height: 630 });
      await p.goto(`${srv.origin}/__card.html?slug=${encodeURIComponent(w.slug)}`, 400);
      await p.evaluate('document.fonts.ready.then(() => true)');
      await p.screenshot(path.join(OUT, `${w.slug}.png`), { full: false });
      await p.close();
      manifest[w.slug] = w.fp;
    }
  } finally { await browser.close(); srv.close(); }
}
// Drop cards for pages that are gone.
for (const slug of Object.keys(manifest)) {
  if (!want.some((w) => w.slug === slug)) { delete manifest[slug]; fs.rmSync(path.join(OUT, `${slug}.png`), { force: true }); }
}
fs.writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + '\n');
console.log(stale.length ? `build-og-cards: drew ${stale.length} card(s)` : `build-og-cards: ${want.length} cards already current`);
