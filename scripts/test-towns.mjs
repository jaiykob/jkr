// Town pages: the town file format, the ZIP gate, local copy that is each
// town's own, two zone towns, and that a hand edit to a generated page is
// caught. No network.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ZIP_ZONES, ZONES } from '../pricing.config.mjs';
import { parseTown, loadTowns, buildPage, townTravel, inline } from './build-towns.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

console.log('== the town file format ==');
const z2 = Object.keys(ZIP_ZONES).find((z) => ZIP_ZONES[z].zone === ZONES[1].key);
const home = Object.keys(ZIP_ZONES).find((z) => ZIP_ZONES[z].zone === ZONES[0].key);
const sample = `name: Sample Town
state: OR
zips: ${home}, ${z2}
lede: The line under the headline.
areas: North End, Old Town

## Local
First paragraph about hauling here, with [[a guess]] in it.

Second paragraph.

## FAQ
Q: First question?
A: First answer.

Q: Second question?
A: Second answer.
`;
const t = parseTown(sample, 'sample-town.md');
ok(t.slug === 'sample-town' && t.name === 'Sample Town' && t.state === 'OR', `header fields: ${JSON.stringify([t.slug, t.name, t.state])}`);
ok(t.zips.length === 2 && t.zips[0] === home, `zips: ${t.zips}`);
ok(t.areas.length === 2 && t.local.length === 2 && t.faqs.length === 2, 'areas, paragraphs or FAQs miscounted');
ok(inline('a [[guess]] & <b>') === 'a <span class="guess">guess</span> &amp; &lt;b&gt;', `inline: ${inline('a [[guess]] & <b>')}`);
ok(/ZIP 90210.*bad-zip\.md|bad-zip\.md.*90210/.test(throws(() => parseTown(sample.replace(home, '90210'), 'bad-zip.md')) || ''), 'a ZIP outside every zone did not fail naming the file');
ok(/no-faq\.md/.test(throws(() => parseTown(sample.split('## FAQ')[0], 'no-faq.md')) || ''), 'a town with no FAQ did not fail naming the file');
ok(/no-name\.md/.test(throws(() => parseTown(sample.replace('name: Sample Town\n', ''), 'no-name.md')) || ''), 'a town with no name did not fail');

console.log('== travel for a town ==');
const tr = townTravel(t);
ok(tr.length === 2 && tr[0].label === ZONES[0].label && tr[1].label === ZONES[1].label, `two zones, nearest first: ${JSON.stringify(tr.map((x) => x.label))}`);
ok(tr[1].zips.includes(z2) && tr[1].cents === ZIP_ZONES[z2].cents, 'zone 2 lost its ZIP or fee');

console.log('== a page ==');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const page = buildPage(index, t, [t]);
ok(page.includes('<title>Junk Removal in Sample Town, OR | Brand Name</title>'), 'title does not name the town');
ok(/<h1[^>]*>[^<]*Sample Town/.test(page), 'H1 does not name the town');
ok(page.includes('href="https://www.example.com/sample-town.html"'), 'canonical missing');
ok(page.includes(ZONES[0].label) && page.includes(ZONES[1].label), 'a two zone town does not show both zones');
ok(page.includes('<span class="guess">a guess</span>'), 'a [[guess]] is not red');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/(<!-- CITY:([a-z-]+) -->)[\s\S]*?(<!-- \/CITY:\2 -->)/g, '$1$3');
ok(strip(page) === strip(index), 'the page differs from the homepage outside its CITY regions');

console.log('== the real towns ==');
const towns = loadTowns();
ok(towns.length >= 3, `${towns.length} towns`);
const seen = new Map();
for (const x of towns) {
  ok(x.faqs.length >= 2, `${x.slug}: ${x.faqs.length} FAQs`);
  for (const s of x.local.join(' ').toLowerCase().replace(/\[\[|\]\]/g, '').split(/[.!?]+\s/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 8)) {
    ok(!seen.has(s) || seen.get(s) === x.slug, `"${s.slice(0, 50)}..." is in ${seen.get(s)} and ${x.slug}`);
    seen.set(s, x.slug);
  }
}

console.log('== a hand edit is caught ==');
const first = towns[0] && path.join(ROOT, `${towns[0].slug}.html`);
if (first && fs.existsSync(first)) {
  const before = fs.readFileSync(first, 'utf8');
  fs.writeFileSync(first, before.replace('</main>', '<p>hand edit</p></main>'));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-towns.mjs'), '--check'], { encoding: 'utf8' });
  fs.writeFileSync(first, before);
  ok(r.status === 1 && r.stderr.includes(`${towns[0].slug}.html`), 'build-towns --check missed a hand edit');
} else ok(false, 'no generated town page to edit');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
