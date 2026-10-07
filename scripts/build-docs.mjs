/**
 * Writes the facts that change (prices, travel zones, the towns we serve)
 * into the Markdown docs, so no doc ever quotes a stale number.
 *
 *   node scripts/build-docs.mjs          # write
 *   node scripts/build-docs.mjs --check  # verify only, non-zero if stale (npm test)
 *
 * Any .md file can carry these blocks; the build fills them in:
 *
 *   <!-- BUILD:docs-prices --> <!-- /BUILD:docs-prices -->   the price table
 *   <!-- BUILD:docs-zones -->  <!-- /BUILD:docs-zones -->    zones, miles, fees, towns
 *   <!-- BUILD:docs-area -->   <!-- /BUILD:docs-area -->     the service area in a paragraph
 *
 * Scoops Co. retyped its prices into the business plan and the agent context,
 * and both went stale when the price table changed. Here they can't: change
 * pricing.config.mjs or a town file, run `npm run build`, and every doc
 * follows. The blocks say "guess" while the numbers are still guesses.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICES, LOAD_OPTIONS, COLUMNS, COLUMN_LABELS, BILLING, ZONES, GUESS, BASE, ALL_ZIPS, ZIP_ZONES, fmt } from '../pricing.config.mjs';
import { loadTowns } from './build-towns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const SKIP = new Set(['node_modules', '.git', '.vercel', '.superpowers', '.claude', '.agents', 'superpowers']);
const MARK = 'GUESS' + '*';   // split so list-guesses does not list this file
const eol = (s) => s.replace(/\r\n/g, '\n');

const towns = loadTowns();
const guessNote = (on, sentence) => (on ? `\n${MARK} ${sentence} (\`GUESS\` in \`pricing.config.mjs\`).` : '');

const prices = [
  `| Load size | ${COLUMNS.map((c) => COLUMN_LABELS[c]).join(' | ')} |`,
  `| --- | ${COLUMNS.map(() => '---').join(' | ')} |`,
  ...LOAD_OPTIONS.map((o, r) => `| ${o.label} (${o.note.toLowerCase()}) | ${PRICES[r].map((c, k) => `${fmt(c)}${BILLING[COLUMNS[k]].stripe ? ' a visit' : ''}`).join(' | ')} |`),
  '',
  'Travel for the customer\'s zone is added to every visit. More than a full truck is quoted by hand.',
].join('\n') + guessNote(GUESS.prices, 'These prices are placeholder guesses');

const townsIn = (key) => towns.filter((t) => t.zips.some((z) => ZIP_ZONES[z].zone === key)).map((t) => t.name);
const zones = [
  '| Zone | Road miles from the base | Travel per visit | Towns |',
  '| --- | --- | --- | --- |',
  ...ZONES.map((z, i) => `| ${z.label} | ${i ? ZONES[i - 1].upToMiles : 0} to ${z.upToMiles} | ${z.fee ? fmt(Math.round(z.fee * 100)) : 'none'} | ${townsIn(z.key).join(', ') || 'none'} |`),
  '',
  `Past ${ZONES[ZONES.length - 1].upToMiles} road miles: no online price; quoted by hand.`,
].join('\n') + guessNote(GUESS.zones, 'The mile bands and fees are placeholder guesses') + guessNote(GUESS.base, `The base point (${BASE.label} city center) is a placeholder guess`);

const or = towns.filter((t) => t.state === 'OR').length, wa = towns.filter((t) => t.state === 'WA').length;
const area = `We serve ${ALL_ZIPS.length} ZIP codes and ${towns.length} towns (${or} in Oregon, ${wa} in Clark County, Washington), out to ${ZONES[ZONES.length - 1].upToMiles} road miles from our base in ${BASE.label}. Every town has its own page (\`content/towns/\`); the hub is \`service-areas.html\`.`;

const BLOCKS = { 'docs-prices': prices, 'docs-zones': zones, 'docs-area': area };

function mdFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) mdFiles(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.md')) out.push(path.join(dir, e.name));
  }
  return out;
}

const stale = [], written = [];
for (const abs of mdFiles()) {
  const before = fs.readFileSync(abs, 'utf8');
  if (!/<!-- BUILD:docs-/.test(before)) continue;
  let out = eol(before);
  for (const [name, body] of Object.entries(BLOCKS)) {
    const open = `<!-- BUILD:${name} -->`, close = `<!-- /BUILD:${name} -->`;
    let from = 0;
    for (;;) {
      const a = out.indexOf(open, from);
      if (a < 0) break;
      const b = out.indexOf(close, a);
      if (b < 0) throw new Error(`${path.relative(ROOT, abs)}: ${open} has no ${close}`);
      out = out.slice(0, a + open.length) + '\n' + body + '\n' + out.slice(b);
      from = out.indexOf(close, a) + close.length;
    }
  }
  if (out === eol(before)) continue;
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  if (check) stale.push(rel);
  else { fs.writeFileSync(abs, out); written.push(rel); }
}

if (check) {
  if (stale.length) { console.error(`build-docs --check: stale, run \`npm run build\`:\n  ${stale.join('\n  ')}`); process.exit(1); }
  console.log('build-docs --check: OK, every doc quotes the current prices, zones and towns');
} else console.log(written.length ? `build-docs: wrote ${written.join(', ')}` : 'build-docs: docs already up to date');
