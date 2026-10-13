// Service pages (round 9): the service file format and what it refuses, the
// page a file becomes, the breadcrumb helper, the real files (their order and
// copy that is their own), and that a hand edit to a generated page is caught.
// No network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import site from '../api/_lib/site.js';
import { parseService, loadServices, buildService, serviceLinks } from './build-services.mjs';
import { crumbs } from './lib/crumbs.mjs';
import { loadTowns, townTravel } from './build-towns.mjs';
import { twinOf } from './lib/twins.mjs';

const require = createRequire(import.meta.url);
const O = require('../api/_lib/order-config.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const graph = (html) => ldBlocks(html).flatMap((b) => [b, ...(b['@graph'] || [])]);
const fmt = (c) => `$${(c / 100).toFixed(2)}`;

console.log('== the service file format ==');
const sample = `name: Sample cleanout
h1: Sample cleanouts across the Portland metro
description: A sample service for the test, in Portland, Gresham and Vancouver, long enough for a search result line.
lede: The line under the headline, with [[a guess]] in it.
sizes: half, full
towns:
- gresham: Home base, so this one is close.
- portland: Narrow driveways and detached garages.
- troutdale: Garages cleared before a sale.
- happy-valley: Three car garages that fill up.
- vancouver: Roomy garages across the river.
posts: garage-cleanout-in-a-weekend, where-hauled-junk-goes

## What we take
A first paragraph about what we take.

- Bikes and toys
- Old shelving

## Where it goes
Where the load goes, [[a place we guess at]].

## Free options
What you can do for free.

## How the job goes
How the day goes.

## FAQ
Q: First question?
A: First answer.

Q: Second question?
A: Second answer.

Q: Third question?
A: Third answer.
`;
const bad = (from, to, file) => throws(() => parseService(sample.replace(from, to), file)) || '';
{
  const e = bad('sizes: half, full', 'sizes: half, huge', 'bad-size.md');
  ok(/huge/.test(e) && e.startsWith('content/services/portland/bad-size.md:'), `a size not in ORDER.SIZES did not fail naming it and the file: ${e}`);
}
{
  const e = bad('- vancouver:', '- nowhere-town:', 'bad-town.md');
  ok(/nowhere-town/.test(e) && e.startsWith('content/services/portland/bad-town.md:'), `a town with no town file did not fail naming it: ${e}`);
}
{
  const e = bad('where-hauled-junk-goes', 'no-such-post', 'bad-post.md');
  ok(/no-such-post/.test(e) && e.startsWith('content/services/portland/bad-post.md:'), `a post with no post file did not fail naming it: ${e}`);
}
ok(/4 towns/.test(bad('- vancouver: Roomy garages across the river.\n', '', 'few-towns.md')), 'fewer than 5 towns did not fail');
ok(/2 questions/.test(bad('Q: Third question?\nA: Third answer.\n', '', 'few-faqs.md')), 'fewer than 3 FAQs did not fail');
ok(/price/.test(bad('A first paragraph', 'For $99 a first paragraph', 'typed-price.md')), 'a typed price ($ and a digit) did not fail');
ok(/price/.test(bad('A first paragraph', 'For $ 99 a first paragraph', 'typed-price-space.md')), 'a typed price with a space ($ 99) did not fail');
ok(/name/.test(bad('name: Sample cleanout\n', '', 'no-name.md')), 'a file with no name: did not fail');
ok(/Free options/.test(bad('## Free options\nWhat you can do for free.\n\n', '', 'no-free.md')), 'a file with no "## Free options" did not fail');
ok(/smallest first/.test(bad('sizes: half, full', 'sizes: full, half', 'backwards.md')), 'sizes out of order did not fail');
ok(/Portland/.test(bad('h1: Sample cleanouts across the Portland metro', 'h1: Sample cleanouts near you', 'no-portland.md')), 'an H1 that does not name Portland did not fail');
// Nothing in a file may vanish silently: an unknown or repeated heading, a town line cut off by a
// blank line or set apart from the list, or a header line that is not a field all fail, naming it.
{
  const e = bad('## FAQ', '## Notes\nA paragraph that would never print.\n\n## FAQ', 'unknown-heading.md');
  ok(/"## Notes"/.test(e) && e.startsWith('content/services/portland/unknown-heading.md:'), `an unknown "## " heading did not fail naming it and the file: ${e}`);
  const d = bad('## FAQ', '## Free options\nA second copy that would never print.\n\n## FAQ', 'twice-heading.md');
  ok(/"## Free options"/.test(d) && /twice/.test(d), `a heading used twice did not fail naming it: ${d}`);
}
{
  const gap = throws(() => parseService(sample.replace('- troutdale:', '\n- troutdale:'), 'town-gap.md'));
  const g = gap ? null : parseService(sample.replace('- troutdale:', '\n- troutdale:'), 'town-gap.md');
  ok(g && g.towns.length === 5 && g.towns[2].slug === 'troutdale', `a blank line inside "towns:" ended the list: ${gap || (g && g.towns.map((t) => t.slug))}`);
  const e = bad('posts: garage-cleanout-in-a-weekend, where-hauled-junk-goes', 'posts: garage-cleanout-in-a-weekend, where-hauled-junk-goes\n- camas: Hilly streets above the river.', 'town-after.md');
  ok(/camas/.test(e) && e.startsWith('content/services/portland/town-after.md:'), `a "- town:" line after another field did not fail naming it: ${e}`);
  const w = bad('lede: The line under the headline, with [[a guess]] in it.', 'lede: The line under the headline, with [[a guess]] in it,\nwrapped onto a second line.', 'wrapped.md');
  ok(/wrapped onto a second line/.test(w) && w.startsWith('content/services/portland/wrapped.md:'), `a header line that is not a field did not fail naming it: ${w}`);
}
{
  // The four sections read like a post: links from the site root point up out of portland/, and **bold**.
  const l = parseService(sample.replace('A first paragraph about what we take.', 'A first paragraph with [the order page](/book/quote.html), [Gresham](/gresham.html) and **bold** words.'), 'links.md');
  ok(l.take[0] === '<p>A first paragraph with <a href="../book/quote.html">the order page</a>, <a href="../gresham.html">Gresham</a> and <strong>bold</strong> words.</p>', `a section link or bold did not render: ${l.take[0]}`);
  const m = parseService(sample.replace('- Bikes and toys', '- [[Bikes]] and [toys](/blog/x.html)'), 'list-links.md');
  ok(m.take[1].includes('<li><span class="guess">Bikes</span> and <a href="../blog/x.html">toys</a></li>'), `a list item's guess or link did not render: ${m.take[1]}`);
  const mixed = parseService(sample.replace('A first paragraph about what we take.\n\n- Bikes', 'A first paragraph about what we take.\n- Bikes'), 'mixed.md');
  ok(mixed.take.length === 2 && mixed.take[0].startsWith('<p>') && mixed.take[1].startsWith('<ul>'), `a list right under a paragraph line is not its own list: ${JSON.stringify(mixed.take)}`);
}

const s = parseService(sample, 'sample-cleanout.md');
ok(s.slug === 'sample-cleanout' && s.metro === 'portland' && s.name === 'Sample cleanout', `header fields: ${JSON.stringify([s.slug, s.metro, s.name])}`);
ok(s.towns.length === 5 && s.towns[0].slug === 'gresham' && /Home base/.test(s.towns[0].why), `towns: ${JSON.stringify(s.towns)}`);
ok(s.faqs.length === 3 && s.faqs[0].q === 'First question?' && s.faqs[2].a === 'Third answer.', `faqs: ${JSON.stringify(s.faqs)}`);
ok(JSON.stringify(s.sizes) === '["half","full"]' && JSON.stringify(s.posts) === '["garage-cleanout-in-a-weekend","where-hauled-junk-goes"]', 'sizes or posts misread');
ok(s.take.length === 2 && s.take[0].startsWith('<p>') && /^<ul>[\s\S]*<li>Bikes and toys<\/li>/.test(s.take[1]), `take blocks: ${JSON.stringify(s.take)}`);
ok(s.goes.length === 1 && s.free.length === 1 && s.how.length === 1, 'goes, free or how misread');

console.log('== a page ==');
const page = buildService(s, [s]);
const first = O.SIZES.find((z) => z.key === 'half'), last = O.SIZES.find((z) => z.key === 'full');
ok((page.match(/<h1\b/g) || []).length === 1, 'not exactly one <h1>');
ok(/<h1\b[^>]*>Sample cleanouts across the Portland metro<\/h1>/.test(page), 'the H1 is not the file\'s h1:');
ok(page.includes(`<title>Sample cleanout in Portland, OR | ${site.NAME}</title>`), 'title');
ok(page.includes(`<link rel="canonical" href="${site.SITE_URL}/portland/sample-cleanout.html" />`), 'canonical');
ok(page.includes(`content="${site.SITE_URL}/images/og/portland-sample-cleanout.png"`), 'the share card is not images/og/portland-<slug>.png');
ok(!/hreflang/.test(page.split('</head>')[0]), 'a service page has no Spanish twin, so no hreflang');
const price = (page.match(/<p class="svc-price">([\s\S]*?)<\/p>/) || [])[1] || '';
ok(price.includes(fmt(first.cents)) && /plus travel/.test(price), `.svc-price does not read From ${fmt(first.cents)} plus travel: ${price}`);
ok(!O.GUESS.prices || price.includes(`<span class="guess">${fmt(first.cents)}</span>`), 'the price is not red while GUESS.prices');
const cards = [...page.matchAll(/<a class="size-card" data-size="(\d+)" href="([^"]+)">([\s\S]*?)<\/a>/g)];
ok(cards.length === 2, `${cards.length} size cards, want 2`);
for (const z of [first, last]) {
  const c = cards.find((m) => m[1] === String(z.row));
  ok(c && c[2] === `../book/quote.html?size=${z.row}` && c[3].includes(z.label) && c[3].includes(fmt(z.cents)), `no size card for ${z.label} linking ../book/quote.html?size=${z.row}`);
}
for (const t of s.towns) ok(page.includes(`<a href="../${t.slug}.html">`), `${t.slug} is not linked as ../${t.slug}.html`);
ok(page.includes('href="../blog/garage-cleanout-in-a-weekend.html"') && page.includes('A garage cleanout in one weekend'), 'a related post is not linked by its title');
ok(page.includes('href="../book/quote.html#photos"') && page.includes('href="../book/quote.html"'), 'no Get my price or Send a photo');
ok(page.includes('<span class="guess">a guess</span>') && page.includes('<span class="guess">a place we guess at</span>'), 'a [[guess]] is not red');
const main = (page.match(/<main\b[^>]*>([\s\S]*?)<\/main>/) || [])[1] || '';
ok(/class="svc-own"/.test(main) && /class="faq-list"/.test(main), 'no .svc-own or .faq-list in main');
ok((main.match(/<details>/g) || []).length === 3, 'the FAQ does not show three questions');
ok(/<!-- BUILD:site-header -->[\s\S]*<!-- BUILD:site-sticky -->[\s\S]*<!-- BUILD:site-footer -->/.test(page), 'the shared header, sticky and footer markers are missing');
const g = graph(page);
const svc = g.find((n) => n['@type'] === 'Service'), bl = g.find((n) => n['@type'] === 'BreadcrumbList'), fq = g.find((n) => n['@type'] === 'FAQPage');
ok(ldBlocks(page).length === 1 && svc && bl && fq, 'want one JSON-LD block with Service, BreadcrumbList and FAQPage');
const maxFee = Math.max(...s.towns.map((t) => Math.max(...townTravel(loadTowns().find((x) => x.slug === t.slug)).map((z) => z.cents))));
ok(svc && svc.offers['@type'] === 'AggregateOffer' && svc.offers.priceCurrency === 'USD' && svc.offers.lowPrice === (first.cents / 100).toFixed(2) && svc.offers.highPrice === ((last.cents + maxFee) / 100).toFixed(2), `offers: ${svc && JSON.stringify(svc.offers)}`);
ok(svc && svc.areaServed.length === 5 && svc.areaServed.every((a) => a['@type'] === 'City') && svc.areaServed[0].name === 'Gresham, OR', `areaServed: ${svc && JSON.stringify(svc.areaServed)}`);
ok(svc && svc.provider['@type'] === 'LocalBusiness' && svc.provider.telephone === site.PHONE_TEL && svc.provider.name === site.NAME && svc.provider.url, 'provider');
ok(bl && bl.itemListElement.length === 2 && bl.itemListElement[1].name === 'Sample cleanout', `BreadcrumbList: ${bl && JSON.stringify(bl.itemListElement)}`);
ok(fq && fq.mainEntity.length === 3 && fq.mainEntity[0].name === 'First question?', 'FAQPage does not match the questions');
ok(/<nav class="crumbs" aria-label="Breadcrumb">/.test(main), 'no breadcrumb trail in main');

console.log('== the breadcrumb helper ==');
{
  const c = crumbs([{ name: 'Middle', href: 'middle.html' }, { name: 'X & Y' }], { rel: 'portland/x.html' });
  ok(c.html.startsWith('<nav class="crumbs" aria-label="Breadcrumb"><ol>'), `html: ${c.html}`);
  ok(c.html.includes('<a href="../index.html">Home</a>'), 'Home is not ../index.html from portland/');
  ok(c.html.includes('<a href="../middle.html">Middle</a>'), 'a middle step is not ../middle.html from portland/');
  ok(c.html.includes('<li aria-current="page">X &amp; Y</li>'), 'the page itself is not the last, unlinked, escaped item');
  ok((c.html.match(/<span[^>]*aria-hidden="true"[^>]*>›<\/span>/g) || []).length === 2, 'want two › separators hidden from screen readers');
  const items = c.ld.itemListElement;
  ok(c.ld['@type'] === 'BreadcrumbList' && items.length === 3 && items.every((it, i) => it['@type'] === 'ListItem' && it.position === i + 1), 'BreadcrumbList shape');
  ok(items.every((it) => String(it.item).startsWith(site.SITE_URL)), 'an item URL is not absolute on site.SITE_URL');
  ok(items[0].item === `${site.SITE_URL}/` && items[1].item === `${site.SITE_URL}/middle.html` && items[2].item === `${site.SITE_URL}/portland/x.html`, `items: ${JSON.stringify(items)}`);
  ok(items[2].name === 'X & Y', 'the BreadcrumbList name is not plain text');
  const es = crumbs([{ name: 'Medio', href: 'es/medio.html' }, { name: 'X' }], { rel: 'es/x.html', lang: 'es' });
  ok(es.html.startsWith('<nav class="crumbs" aria-label="Ruta">') && es.html.includes('<a href="index.html">Inicio</a>') && es.html.includes('<a href="medio.html">Medio</a>'), `Spanish: ${es.html}`);
  ok(es.ld.itemListElement[0].item === `${site.SITE_URL}/es/` && es.ld.itemListElement[0].name === 'Inicio', 'the Spanish home item');
  const blog = crumbs([{ name: 'Blog', href: 'blog/index.html' }, { name: 'A post' }], { rel: 'blog/a-post.html' });
  ok(blog.html.includes('<a href="index.html">Blog</a>') && blog.html.includes('<a href="../index.html">Home</a>'), `a page beside its folder index: ${blog.html}`);
  ok(blog.ld.itemListElement[1].item === `${site.SITE_URL}/blog/`, 'a folder index is listed as the folder');
  const own = crumbs([{ name: 'Home', href: 'index.html' }, { name: 'FAQ' }], { rel: 'faq.html' });
  ok(own.ld.itemListElement.length === 2 && (own.html.match(/>Home</g) || []).length === 1, 'a trail that starts at Home gets Home twice');
}

console.log('== loading in ORDER ==');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jkr-svc-'));
  try {
    fs.writeFileSync(path.join(dir, 'b-job.md'), sample.replace('name: Sample cleanout', 'name: B job').replace('h1: Sample cleanouts', 'h1: B job'));
    fs.writeFileSync(path.join(dir, 'a-job.md'), sample.replace('name: Sample cleanout', 'name: A job').replace('h1: Sample cleanouts', 'h1: A job'));
    fs.writeFileSync(path.join(dir, 'ORDER'), '# priority order\nb-job\nnot-written-yet\na-job\n');
    const got = loadServices(dir);
    ok(got.map((x) => x.slug).join(',') === 'b-job,a-job', `ORDER sets the order and skips a slug with no file: ${got.map((x) => x.slug)}`);
    fs.writeFileSync(path.join(dir, 'c-job.md'), sample);
    ok(/c-job/.test(throws(() => loadServices(dir)) || ''), 'a file not listed in ORDER did not fail');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log('== the real services ==');
const all = loadServices();
const order = fs.readFileSync(path.join(ROOT, 'content/services/portland/ORDER'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
ok(order.join(',') === 'garage-cleanout,furniture-removal,estate-cleanout,hot-tub-removal,mattress-removal,appliance-removal,yard-debris-removal,hoarder-cleanout', `ORDER: ${order}`);
ok(all.length >= 1 && all[0].slug === 'garage-cleanout', `services: ${all.map((x) => x.slug)}`);
const links = serviceLinks();
ok(links.length === all.length && links[0].name === 'Garage cleanout' && links[0].href === 'portland/garage-cleanout.html', `serviceLinks: ${JSON.stringify(links)}`);
ok(JSON.stringify(serviceLinks('es')) === JSON.stringify(links), 'the Spanish pages link the English service pages');
const sentences = (s) => String(s).replace(/<[^>]+>/g, ' ').toLowerCase().replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').split(/[.!?]+\s/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 8);
const seen = new Map();
for (const t of loadTowns()) for (const x of sentences(t.local.join(' '))) if (!seen.has(x)) seen.set(x, `the town ${t.slug}`);
for (const x of all) {
  const own = [...x.take, ...x.goes, ...x.free, ...x.how].join(' ') + ' ' + x.towns.map((t) => t.why).join(' ');
  for (const y of sentences(own.replace(/<\/(p|li)>/g, '. '))) {
    ok(!seen.has(y) || seen.get(y) === x.slug, `"${y.slice(0, 50)}..." is in ${seen.get(y)} and ${x.slug}`);
    seen.set(y, x.slug);
  }
}
ok(twinOf('portland/garage-cleanout.html') === null, 'a service page must not invent an es/portland/ twin');

console.log('== the built page ==');
const built = path.join(ROOT, 'portland/garage-cleanout.html');
if (fs.existsSync(built)) {
  const before = fs.readFileSync(built, 'utf8');
  ok(/<a class="lang-switch" href="\.\.\/es\/index\.html"/.test(before), 'the language switch does not go to the Spanish homepage');
  fs.writeFileSync(built, before.replace('</main>', '<p>hand edit</p></main>'));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-services.mjs'), '--check'], { encoding: 'utf8' });
  fs.writeFileSync(built, before);
  ok(r.status === 1 && r.stderr.includes('portland/garage-cleanout.html'), 'build-services --check missed a hand edit');
} else ok(false, 'portland/garage-cleanout.html is not built (npm run build)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
