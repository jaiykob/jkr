/**
 * npm run score -- --round 1     score the build against the round's checks
 * npm run score -- --round 1 --json
 *
 * The fitness function for the import (docs/superpowers/evolution.md). Every
 * check tests something real: the test suite, the generated files, and the
 * pages themselves, loaded in headless Chrome at phone width. Points add up to
 * 100, and a round is done only at 100. Exits 0 at 100, 1 below.
 *
 * Pages are served by a throwaway local server that adds two things the site
 * does not have:
 *   ?__probe=1        injects a script that, after the page settles, writes
 *                     { sw, vw, small } to <html data-probe>: page width,
 *                     window width, and any text under 16px inside the
 *                     elements this round added.
 *   /__seed.html      writes sessionStorage keys, then opens the real page,
 *                     so checkout and thanks can be checked with a booking
 *                     in progress.
 */
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openBrowser } from './lib/browser.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const ROUND = Number(args[args.indexOf('--round') + 1]) || 1;
const JSON_OUT = args.includes('--json');

const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return null; } };
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const text = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const fmt = (c) => `$${(c / 100).toFixed(2)}`;
/** The element with this id: its opening tag, inner HTML and text. Counts
 *  nested tags of the same name, so a <div> full of <div> rows comes back whole. */
function byId(dom, id) {
  const s = String(dom || '');
  const open = s.match(new RegExp(`<([a-z0-9]+)[^>]*\\sid="${id}"[^>]*>`, 'i'));
  if (!open) return null;
  const tag = open[1].toLowerCase();
  const start = open.index + open[0].length;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 1, m, end = s.length;
  while ((m = re.exec(s))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) { end = m.index; break; }
  }
  const inner = s.slice(start, end);
  return { tag: open[0], inner, text: text(inner) };
}
function run(cmd, cmdArgs, opts = {}) {
  // node runs as itself; npm needs a shell on Windows, so it gets one command string.
  const r = cmd === 'node'
    ? spawnSync(process.execPath, cmdArgs, { cwd: ROOT, encoding: 'utf8', timeout: 300000, ...opts })
    : spawnSync([cmd, ...cmdArgs].join(' '), { cwd: ROOT, encoding: 'utf8', shell: true, timeout: 300000, ...opts });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/* ── config (may be half built in early generations) ─────────────────────── */
let C = {};
try { C = await import(pathToFileURL(path.join(ROOT, 'pricing.config.mjs')).href + `?t=${Date.now()}`); } catch (e) { C = { error: e.message }; }
const zipsIn = C.ZIP_ZONES ? Object.keys(C.ZIP_ZONES) : [];
const Z2 = zipsIn.find((z) => C.ZIP_ZONES[z].cents > 0 && C.ZIP_ZONES[z].zone === (C.ZONES && C.ZONES[1] && C.ZONES[1].key));
let FAR = '98601';
try {
  const M = (await import(pathToFileURL(path.join(ROOT, 'data/zip-miles.mjs')).href)).default;
  FAR = Object.keys(M.zips).find((z) => !C.ZIP_ZONES || !C.ZIP_ZONES[z]) || FAR;
} catch { /* no data yet */ }
const LOAD_ROW = 2;
const LOAD_CENTS = C.PRICES ? C.PRICES[LOAD_ROW][C.ONE_TIME_COL] : 0;
const T2 = Z2 ? C.ZIP_ZONES[Z2] : null;
const TOTAL = T2 ? LOAD_CENTS + T2.cents : 0;

/* ── local server + headless Chrome ───────────────────────────────────────── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
const PROBE = `<script>(function(){setTimeout(function(){try{
var sel=['.lb-travel','.lb-unit','#h-zip','#pick-sum','#zoneList','#sum-rows','#zipOut'];var small=[];
sel.forEach(function(s){document.querySelectorAll(s).forEach(function(n){[n].concat([].slice.call(n.querySelectorAll('*'))).forEach(function(e){
var t=(e.childNodes.length&&[].some.call(e.childNodes,function(c){return c.nodeType===3&&c.textContent.trim();}));
var r=e.getBoundingClientRect();if(!t||!r.width||!r.height)return;var fs=parseFloat(getComputedStyle(e).fontSize);
if(fs<16)small.push(s+' '+e.tagName.toLowerCase()+'.'+e.className+' '+fs+'px');});});});
document.documentElement.setAttribute('data-probe',JSON.stringify({sw:document.documentElement.scrollWidth,vw:window.innerWidth,small:small}));
}catch(e){document.documentElement.setAttribute('data-probe',JSON.stringify({error:String(e)}));}},1500);})();</script>`;
const SEED = `<!doctype html><meta charset="utf-8"><script>
var q=new URLSearchParams(location.search);var s=JSON.parse(q.get('s')||'{}');
Object.keys(s).forEach(function(k){sessionStorage.setItem(k,typeof s[k]==='string'?s[k]:JSON.stringify(s[k]));});location.replace(q.get('to'));</script>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__seed.html') { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); return res.end(SEED); }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  let body = fs.readFileSync(file);
  const ext = path.extname(file);
  if (ext === '.html' && u.searchParams.has('__probe')) body = Buffer.from(body.toString('utf8').replace(/<\/body>/i, PROBE + '</body>'));
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// Pages load in a real phone viewport through device emulation
// (scripts/lib/browser.mjs). A plain --window-size can't go below ~526px.
const browser = await openBrowser();
const CHROME = !!browser;
const dumps = new Map();
function dump(url, width = 360) {
  const key = `${width} ${url}`;
  if (!dumps.has(key)) dumps.set(key, (async () => {
    if (!browser) return '';
    const p = await browser.page({ width });
    try { await p.goto(ORIGIN + url); return await p.html(); } finally { await p.close(); }
  })());
  return dumps.get(key);
}
const seeded = (to, s) => `/__seed.html?${new URLSearchParams({ s: JSON.stringify(s), to })}`;
function probeOf(dom) {
  const m = String(dom).match(/data-probe="([^"]*)"/);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')); } catch { return null; }
}

/* ── the checks ───────────────────────────────────────────────────────────── */
const SAMPLE_CONTACT = { name: 'Score Probe', email: 'probe@example.com', phone: '(503) 555-0100', addr: '1 Probe St', items: 'Couch' };
const QUOTE_URL = () => `/book/quote.html?load=${LOAD_ROW}&freq=${C.ONE_TIME_COL}&edit=contact&zip=${Z2}&__probe=1`;
const CHECKOUT_URL = () => seeded(`/book/checkout.html?${new URLSearchParams({ fi: String(C.ONE_TIME_COL), load: String(LOAD_ROW), cents: String(TOTAL), zip: Z2, freq: 'One-time haul', __probe: '1' })}`,
  { quoteContact: { ...SAMPLE_CONTACT, zip: Z2 } });

const ROUNDS = {
  1: [
    { id: 'tests', pts: 12, desc: 'npm test passes', run() {
      const r = run('npm', ['test']);
      fs.writeFileSync(path.join(os.tmpdir(), 'jkr-score-npm-test.log'), r.out);
      return r.code === 0 || `npm test failed: ${r.out.split('\n').filter((l) => /FAIL|Error|STALE/.test(l)).slice(0, 3).join(' | ')}`;
    } },
    { id: 'data', pts: 5, desc: 'data/zip-miles.mjs: 100+ ZIPs, OR and WA, miles, base matches', async run() {
      if (!exists('data/zip-miles.mjs')) return 'data/zip-miles.mjs missing';
      const M = (await import(pathToFileURL(path.join(ROOT, 'data/zip-miles.mjs')).href)).default;
      const z = Object.values(M.zips || {});
      if (z.length < 100) return `only ${z.length} ZIPs`;
      if (!z.some((r) => r.state === 'OR') || !z.some((r) => r.state === 'WA')) return 'needs OR and WA';
      if (!z.every((r) => typeof r.miles === 'number' && r.miles >= 0)) return 'a ZIP has no miles';
      if (!C.BASE || M.base.lat !== C.BASE.lat || M.base.lon !== C.BASE.lon) return 'measured from a different base than BASE';
      return true;
    } },
    { id: 'module', pts: 10, desc: 'travel module: two identical copies that agree with the config', run() {
      const a = read('api/_lib/travel.js'), b = read('js/travel.js');
      if (!a || !b) return 'api/_lib/travel.js or js/travel.js missing';
      if (a !== b) return 'the two copies differ';
      if (!C.travelFor) return 'config has no travelFor';
      delete require.cache[require.resolve(path.join(ROOT, 'api/_lib/travel.js'))];
      const T = require(path.join(ROOT, 'api/_lib/travel.js'));
      for (const z of zipsIn) if (JSON.stringify(T.travelFor(z)) !== JSON.stringify(C.travelFor(z))) return `disagrees on ${z}`;
      for (const z of ['90210', '', '9720', null]) if (T.travelFor(z) !== null) return `accepted ${z}`;
      return true;
    } },
    { id: 'server', pts: 10, desc: 'booking API charges load plus travel (test-booking travel section)', run() {
      const r = run('node', ['scripts/test-booking.mjs']);
      if (!/== travel ==/.test(r.out)) return 'test-booking has no travel section';
      return r.code === 0 || 'test-booking fails';
    } },
    { id: 'quote-zone', pts: 10, desc: 'quote page: zone and travel in the ZIP answer and the load summary', async run() {
      if (!Z2) return 'no zone 2 ZIP in the config';
      const dom = await dump(QUOTE_URL());
      const hint = byId(dom, 'h-zip'), sum = byId(dom, 'pick-sum');
      if (!hint || !hint.text.includes(T2.label) || !hint.text.includes('+$')) return `ZIP answer is "${hint && hint.text}"`;
      if (!sum || !sum.text.includes(fmt(TOTAL))) return `load summary is "${sum && sum.text}", want ${fmt(TOTAL)}`;
      return true;
    } },
    { id: 'quote-far', pts: 5, desc: 'quote page: a ZIP past the last zone asks them to call and offers a call back', async run() {
      const dom = await dump(`/book/quote.html?load=${LOAD_ROW}&freq=0&edit=contact&zip=${FAR}`);
      const err = byId(dom, 'e-zip'), wl = byId(dom, 'waitlist');
      if (!err || !/call/i.test(err.text)) return `ZIP error is "${err && err.text}"`;
      if (!wl || /\shidden/.test(wl.tag)) return 'no call back offer';
      return true;
    } },
    { id: 'home', pts: 8, desc: 'homepage: truck says "+ travel" with no ZIP; one zone row per zone', async run() {
      const dom = await dump('/index.html?__probe=1');
      const unit = (String(dom).match(/class="lb-unit[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
      const list = byId(dom, 'zoneList');
      if (!list) return 'no #zoneList';
      const rows = (list.inner.match(/data-zone=/g) || []).length;
      if (!C.ZONES || rows !== C.ZONES.length) return `${rows} zone rows`;
      // The unit only shows once a size is picked; the empty truck shows nothing, which is fine.
      if (unit && text(unit) && !/\+ travel/.test(text(unit))) return `price unit is "${text(unit)}"`;
      const js = read('js/load-builder.js') || '';
      if (!/\+ travel/.test(js)) return 'load builder never says "+ travel"';
      return true;
    } },
    { id: 'checkout', pts: 10, desc: 'checkout: a Travel row, and the headline is load plus travel', async run() {
      if (!Z2) return 'no zone 2 ZIP';
      const dom = await dump(CHECKOUT_URL());
      const rows = byId(dom, 'sum-rows'), big = byId(dom, 'sum-big');
      if (!rows || !/Travel/.test(rows.text)) return `summary rows: "${rows && rows.text.slice(0, 120)}"`;
      if (!big || !big.text.includes(fmt(TOTAL))) return `headline "${big && big.text}", want ${fmt(TOTAL)}`;
      return true;
    } },
    { id: 'thanks', pts: 5, desc: 'thanks page: a Travel row', async run() {
      const dom = await dump(seeded('/book/thanks.html', { bookingSummary: { plan: 'One-time haul', amountCents: TOTAL || 37400, travel: 'Zone 2: $25.00', address: '1 Probe St' } }));
      const rows = byId(dom, 'summary-rows');
      return (rows && /Travel/.test(rows.text)) || `summary rows: "${rows && rows.text}"`;
    } },
    { id: 'ops', pts: 5, desc: 'Discord ping and confirmation email carry travel (test-ops)', run() {
      if (!exists('scripts/test-ops.mjs')) return 'scripts/test-ops.mjs missing';
      return run('node', ['scripts/test-ops.mjs']).code === 0 || 'test-ops fails';
    } },
    { id: 'dashboard', pts: 5, desc: 'schema, db writer and dashboard carry the travel zone', run() {
      const s = read('db/schema.sql') || '', d = read('api/_lib/db.js') || '', j = read('jkr/index.html') || '';
      if (!/travel_zone/.test(s) || !/travel_cents/.test(s)) return 'schema has no travel columns';
      if (!/travel_zone/.test(d) || !/travel_cents/.test(d)) return 'db.js does not write travel';
      return /travel_zone/.test(j) || 'dashboard does not show travel_zone';
    } },
    { id: 'guesses', pts: 5, desc: 'guesses red with an asterisk, linked everywhere, listed', run() {
      const css = read('css/guess.css') || '';
      if (!/color:\s*#C62828/i.test(css) || !/content:\s*"\*"/.test(css)) return 'css/guess.css missing red or asterisk';
      for (const f of ['index.html', 'book/quote.html', 'book/checkout.html', 'book/thanks.html']) if (!/guess\.css/.test(read(f) || '')) return `${f} does not link guess.css`;
      if (C.GUESS && C.GUESS.prices && !/class="tier-price guess"/.test(read('index.html') || '')) return 'homepage prices are not marked';
      return run('node', ['scripts/list-guesses.mjs', '--check']).code === 0 || 'npm run guesses --check fails';
    } },
    { id: 'mobile', pts: 5, desc: 'no sideways scroll at 360px and no new text under 16px (home, quote, checkout)', async run() {
      if (!CHROME) return 'no Chrome to measure with';
      for (const [name, url] of [['home', '/index.html?__probe=1'], ['quote', QUOTE_URL()], ['checkout', CHECKOUT_URL()]]) {
        const p = probeOf(await dump(url));
        if (!p) return `${name}: page did not report`;
        if (p.error) return `${name}: ${p.error}`;
        if (p.vw !== 360) return `${name}: measured at ${p.vw}px, not 360px`;
        if (p.sw > p.vw) return `${name}: ${p.sw}px wide in a ${p.vw}px window`;
        if (p.small.length) return `${name}: small text ${p.small.slice(0, 2).join('; ')}`;
      }
      return true;
    } },
    { id: 'photo', pts: 3, desc: 'photo prompt says Portland metro', run() {
      const s = read('api/photo-quote.js') || '';
      return (/Portland metro/.test(s) && !/Gresham, Oregon/.test(s)) || 'prompt still says Gresham, Oregon';
    } },
    { id: 'docs', pts: 2, desc: 'CLAUDE.md has a Travel pricing section', run() {
      return /^## Travel pricing/m.test(read('CLAUDE.md') || '') || 'no "## Travel pricing" in CLAUDE.md';
    } },
  ],
};

const checks = ROUNDS[ROUND];
if (!checks) { console.error(`No checks for round ${ROUND}`); process.exit(2); }
const total = checks.reduce((s, c) => s + c.pts, 0);
if (total !== 100) { console.error(`Round ${ROUND} checks add up to ${total}, not 100`); process.exit(2); }

const results = [];
for (const c of checks) {
  let r;
  try { r = await c.run(); } catch (e) { r = `threw: ${e.message}`; }
  results.push({ id: c.id, pts: c.pts, got: r === true ? c.pts : 0, desc: c.desc, why: r === true ? '' : String(r) });
}
server.close();
if (browser) await browser.close();

const score = results.reduce((s, r) => s + r.got, 0);
if (JSON_OUT) console.log(JSON.stringify({ round: ROUND, score, checks: results }, null, 2));
else {
  console.log(`Round ${ROUND} score: ${score}/100\n`);
  for (const r of results) console.log(`${r.got ? 'PASS' : 'FAIL'}  ${String(r.got).padStart(2)}/${String(r.pts).padEnd(2)}  ${r.id.padEnd(11)} ${r.desc}${r.why ? `\n                         ↳ ${r.why}` : ''}`);
}
process.exit(score === 100 ? 0 : 1);
