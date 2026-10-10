/**
 * npm run score -- --round 1     score the build against the round's checks
 * npm run score -- --round 1 --json
 *
 * The fitness function for the import (docs/superpowers/evolution.md). Every
 * check tests something real: the test suite, the generated files, and the
 * pages themselves, loaded in headless Chrome at phone width. Points add up to
 * 100, and a round is done only at 100. Exits 0 at 100, 1 below.
 *
 * Round 6 also serves the real API handlers (POST /api/create-booking, GET
 * /api/day-capacity) against the shared fake Stripe and no Supabase, a Stripe.js
 * stub (?__fakepay=1), BOOKINGS_OPEN_CLIENT = true (?__open=1), and &__sticky=1 to
 * keep both flags for the pages that follow.
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
import { installFakeStripe } from './lib/fake-stripe.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const ROUND = Number(args[args.indexOf('--round') + 1]) || 1;
const JSON_OUT = args.includes('--json');
// --no-earlier skips any round's own "earlier rounds still score 100" check: round 6 runs
// rounds 1 to 5 itself, so each would otherwise repeat the rounds before it.
const NO_EARLIER = args.includes('--no-earlier');

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
// ?__probe=<round>: which parts of the page each round measures for small
// text, and (from round 2) which links and buttons must be 48px tall.
const PROBE_SETS = {
  1: { text: ['.lb-travel', '.lb-unit', '#h-zip', '#pick-sum', '#zoneList', '#sum-rows', '#zipOut'], taps: [] },
  2: { text: ['main .prose', 'main .faq-list', '.town-local', '.town-zones', '#zoneList', 'footer', '#maint-banner'],
       taps: ['.site-nav a', '.site-nav button', 'footer a', '.town-nearby a', '.hub-towns a'] },
  5: { text: ['.article p', '.article li', '.article h2', '.post-meta', '.lb-travel', '#zipOut', '.commercial-form label', '.commercial-form input', '.commercial-form textarea', 'footer'],
       taps: ['.site-nav a', '.site-nav button', 'footer a', '.article .trail a', '.commercial-form button', '.post-list a', '.lang-switch'] },
};
PROBE_SETS[6] = { text: ['.size-card', '#order label', '#order input', '#o-bar', '#o-summary', '.o-total', '.o-travel', 'footer'],
  taps: ['.size-card', '#order button', '#o-bar a', '#o-bar button', '#o-summary a', '#o-summary button', '.site-nav a', '.site-nav button'] };
const PROBE = `<script>(function(){setTimeout(function(){try{
var SETS=${JSON.stringify(PROBE_SETS)};var set=SETS[new URLSearchParams(location.search).get('__probe')]||SETS[1];
var small=[],taps=[];
set.text.forEach(function(s){document.querySelectorAll(s).forEach(function(n){[n].concat([].slice.call(n.querySelectorAll('*'))).forEach(function(e){
var t=(e.childNodes.length&&[].some.call(e.childNodes,function(c){return c.nodeType===3&&c.textContent.trim();}));
var r=e.getBoundingClientRect();if(!t||!r.width||!r.height)return;var fs=parseFloat(getComputedStyle(e).fontSize);
if(fs<16)small.push(s+' '+e.tagName.toLowerCase()+'.'+e.className+' '+fs+'px');});});});
set.taps.forEach(function(s){document.querySelectorAll(s).forEach(function(e){var r=e.getBoundingClientRect();
if(!r.width||!r.height||getComputedStyle(e).visibility==='hidden')return;if(r.height<47.5||r.width<47.5)taps.push(s+' "'+(e.textContent||'').trim().slice(0,20)+'" '+Math.round(r.width)+'x'+Math.round(r.height));});});
document.documentElement.setAttribute('data-probe',JSON.stringify({sw:document.documentElement.scrollWidth,vw:window.innerWidth,small:small,taps:taps}));
}catch(e){document.documentElement.setAttribute('data-probe',JSON.stringify({error:String(e)}));}},1500);})();</script>`;
const SEED = `<!doctype html><meta charset="utf-8"><script>
var q=new URLSearchParams(location.search);var s=JSON.parse(q.get('s')||'{}');
Object.keys(s).forEach(function(k){sessionStorage.setItem(k,typeof s[k]==='string'?s[k]:JSON.stringify(s[k]));});location.replace(q.get('to'));</script>`;

/* Stripe.js stub (?__fakepay=1): the surface the order page uses, nothing more. */
const STRIPE_STUB = `<script>(function(){
window.Stripe=function(){return{
elements:function(){return{
create:function(type){var h={};var el={
mount:function(sel){var host=typeof sel==='string'?document.querySelector(sel):sel;if(!host)return;
if(type==='expressCheckout'){host.innerHTML='<button type="button" class="fake-wallet" style="min-height:48px;min-width:48px">Pay with wallet</button>';
host.querySelector('button').addEventListener('click',function(){
(h.click||[]).forEach(function(f){f({resolve:function(){}});});
var d={billingDetails:{name:'Wallet Payer',email:'wallet@example.com',phone:'+15035550100'},
shippingAddress:{name:'Wallet Payer',address:{line1:'1 Probe St',city:'Gresham',state:'OR',postal_code:'97030',country:'US'}},expressPaymentType:'google_pay'};
(h.confirm||[]).forEach(function(f){f(d);});});}
else host.innerHTML='<input class="fake-card" aria-label="Card number" placeholder="Card number" autocomplete="cc-number" style="min-height:48px;font-size:16px"><input class="fake-card" aria-label="Expiry" placeholder="MM / YY" style="min-height:48px;font-size:16px"><input class="fake-card" aria-label="CVC" placeholder="CVC" style="min-height:48px;font-size:16px">';},
on:function(e,f){(h[e]=h[e]||[]).push(f);return el;},update:function(){return el;},unmount:function(){},destroy:function(){},collapse:function(){}};
return el;},
submit:function(){return Promise.resolve({});},update:function(){},getElement:function(){return null;}};},
confirmSetup:function(){return Promise.resolve({setupIntent:{status:'succeeded'}});},
confirmPayment:function(){return Promise.resolve({paymentIntent:{status:'succeeded'}});}};};})();</script>`;

/* The real API handlers, run in this process against the fake Stripe and no Supabase. */
const fakeStripe = installFakeStripe();
const STATE = { bookingHits: 0, full: false, stale: false };
const resetState = () => { STATE.bookingHits = 0; STATE.full = false; STATE.stale = false; fakeStripe.calls.length = 0; };
async function callHandler(file, { method = 'GET', url = '/', headers = {}, body, env = {} } = {}) {
  const keep = {};
  const set = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRODUCT_ID: 'prod_x', BOOKINGS_OPEN: '', ADMIN_DASHBOARD_TOKEN: 'score-admin-token', ...env };
  for (const k of [...Object.keys(set), 'SUPABASE_URL']) keep[k] = process.env[k];
  Object.assign(process.env, set);
  delete process.env.SUPABASE_URL;
  try {
    const handler = require(path.join(ROOT, file));
    const u = new URL(url, 'http://x');
    let status = 200, json = null;
    const out = {};
    const res = { setHeader(k, v) { out[k] = v; }, status(c) { status = c; return this; }, json(j) { json = j; return this; }, end() { return this; } };
    await handler({ method, url, headers, body, query: Object.fromEntries(u.searchParams) }, res);
    return { status, json, headers: out };
  } finally {
    for (const k of Object.keys(keep)) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
  }
}
/** day-capacity as the page sees it; STATE.full fills the first window of the first day. */
async function dayCapacity(url) {
  if (!STATE.full) return callHandler('api/day-capacity.js', { url });
  const first = await callHandler('api/day-capacity.js', { url });
  const d = first.json && first.json.days && first.json.days[0];
  if (!d) return first;
  const db = require(path.join(ROOT, 'api/_lib/db.js'));
  const orig = db.slotCounts;
  const cap = (C.SCHEDULE && C.SCHEDULE.windows[0].cap) || 2;
  db.slotCounts = async () => ({ [d.date]: { total: cap, [d.windows[0].key]: cap } });
  try { return await callHandler('api/day-capacity.js', { url }); } finally { db.slotCounts = orig; }
}
const readBody = (req) => new Promise((res) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => { try { res(JSON.parse(Buffer.concat(b).toString('utf8') || '{}')); } catch { res({}); } }); });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  if (u.pathname === '/__seed.html') { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); return res.end(SEED); }
  if (u.pathname === '/api/create-booking' || u.pathname === '/api/day-capacity') {
    try {
      if (u.pathname === '/api/day-capacity') { const r = await dayCapacity(req.url); return send(r.status, r.json); }
      if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
      STATE.bookingHits++;
      const body = await readBody(req);
      if (STATE.stale && typeof body.quotedCents === 'number') body.quotedCents += 100;
      const r = await callHandler('api/create-booking.js', { method: 'POST', body, headers: { origin: ORIGIN } });
      return send(r.status, r.json);
    } catch (e) { return send(500, { error: `score server: ${e.message}` }); }
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  let body = fs.readFileSync(file);
  const ext = path.extname(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' };
  if (ext === '.html') {
    const sticky = /(?:^|;\s*)jkr_flags=([a-z,]*)/.exec(req.headers.cookie || '');
    const flags = new Set((sticky ? sticky[1] : '').split(',').filter(Boolean));
    if (u.searchParams.has('__fakepay')) flags.add('fakepay');
    if (u.searchParams.has('__open')) flags.add('open');
    if (u.searchParams.has('__sticky')) headers['Set-Cookie'] = `jkr_flags=${[...flags].join(',')}; Path=/`;
    if (u.searchParams.has('__probe') || flags.size) {
      let html = body.toString('utf8');
      if (u.searchParams.has('__probe')) html = html.replace(/<\/body>/i, PROBE + '</body>');
      if (flags.has('fakepay')) html = html.replace(/<script[^>]*js\.stripe\.com[^>]*><\/script>/gi, '').replace(/<head[^>]*>/i, (m) => m + STRIPE_STUB);
      if (flags.has('open')) html = html.replace(/(BOOKINGS_OPEN_CLIENT\s*=\s*)false/g, '$1true');
      body = Buffer.from(html);
    }
  }
  res.writeHead(200, headers);
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

/* ── round 2 helpers: towns, pages, visible text, links ───────────────────── */
const TOWN_DIR = 'content/towns';
function townFiles() {
  try { return fs.readdirSync(path.join(ROOT, TOWN_DIR)).filter((f) => f.endsWith('.md') && f !== 'README.md').sort(); } catch { return []; }
}
/** Just enough of a town file for scoring: header fields, Local and FAQ. */
function townLite(file) {
  const s = (read(`${TOWN_DIR}/${file}`) || '').replace(/\r\n/g, '\n');
  const head = s.split(/^## /m)[0];
  const field = (k) => ((head.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1] || '').trim();
  const section = (name) => ((s.split(new RegExp(`^## ${name}\\s*$`, 'm'))[1] || '').split(/^## /m)[0]).trim();
  return {
    slug: file.replace(/\.md$/, ''), name: field('name'), state: field('state'),
    zips: field('zips').split(/[,\s]+/).filter(Boolean), local: section('Local'),
    faqs: (section('FAQ').match(/^Q:/gm) || []).length,
  };
}
const towns = () => townFiles().map(townLite);
const STANDALONE = ['faq.html', 'privacy.html', 'terms.html', '404.html'];
const round2Pages = () => [...STANDALONE, 'service-areas.html', 'index.html', ...towns().map((t) => `${t.slug}.html`)].filter(exists);
/** What a visitor reads: no head, scripts, styles, comments or tags. */
function visibleText(html) {
  return text(String(html || '').replace(/<head>[\s\S]*?<\/head>/i, '').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' '));
}
/** The content of <!-- CITY:name --> regions, or the page with them emptied. */
const cityRegion = (html, name) => ((String(html).match(new RegExp(`<!-- CITY:${name} -->([\\s\\S]*?)<!-- /CITY:${name} -->`)) || [])[1] || '');
const withoutCity = (html) => String(html).replace(/\r\n/g, '\n').replace(/(<!-- CITY:([a-z-]+) -->)[\s\S]*?(<!-- \/CITY:\2 -->)/g, '$1$3');
const words = (s) => text(s).split(/\s+/).filter(Boolean).length;
const sentences = (s) => text(s).toLowerCase().replace(/\[\[|\]\]/g, '').split(/[.!?]+\s/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 8);

/* ── round 3 helpers: docs, marketing, helpers, emails ───────────────────── */
const mdText = (f) => (read(f) || '').replace(/\r\n/g, '\n');
const headings = (f) => [...mdText(f).matchAll(/^#{1,3} (.+)$/gm)].map((m) => m[1].toLowerCase()).join(' | ');
const SLANG = /\b(okay|gonna|honestly|a lot of|figure (it )?out|totally|super easy|no biggie)\b/i;
const DOGWORDS = /\b(dogs?|poop|pooper|scoop(s|ed|ing|er)?|Scoops|yard secured)\b/i;
const MARKETING = ['marketing/ad-copy/README.md', 'marketing/ad-copy/flyer-door-hanger.md', 'marketing/ad-copy/facebook-group-posts.md',
  'marketing/ad-copy/short-form.md', 'marketing/facebook-groups.md', 'marketing/gbp-optimization.md'];
const HELPERS = ['speed-to-lead', 'quote-followup', 'review-request', 'lead-research-briefing'].map((h) => `agent/skills/${h}/SKILL.md`);
const SHARED = 'agent/skills/_shared/jkr-context.md';
/** Text inside ``` fences: the messages a helper actually sends. */
const fenced = (s) => [...String(s).matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
function copyProblem(label, s) {
  const t = String(s);
  const m = t.match(/[—–]/) || t.match(SLANG) || t.match(DOGWORDS) || t.match(/\bTODO\b/);
  return m ? `${label}: "${t.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ')}"` : null;
}

/* ── round 4 helpers: JSON-LD, sitemap, PNG size ─────────────────────────── */
function jsonLd(html) {
  return [...String(html || '').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
    try { return JSON.parse(m[1]); } catch { return { __bad: true }; }
  });
}
const ldTypes = (html) => jsonLd(html).flatMap((b) => [b, ...(b['@graph'] || [])]).map((b) => b['@type']);
const ldOf = (html, type) => jsonLd(html).flatMap((b) => [b, ...(b['@graph'] || [])]).find((b) => b['@type'] === type);
function pngSize(file) {
  try {
    const b = fs.readFileSync(path.join(ROOT, file));
    if (b.readUInt32BE(0) !== 0x89504e47) return null;
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  } catch { return null; }
}
/** Every page Google should index: public HTML without a noindex meta. */
function indexable() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!['node_modules', '.git', '.superpowers', '.vercel', '.claude', '.agents', 'jkr', 'docs', 'api', 'scripts', 'content', 'agent', 'marketing', 'data', 'db', 'tmpchk'].includes(e.name)) walk(rel); continue; }
      if (!e.name.endsWith('.html')) continue;
      if (/<meta name="robots" content="noindex/.test(read(rel) || '')) continue;
      out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

/* ── round 5 helpers: posts, Spanish twins, links ─────────────────────────── */
const postSlugs = (lang) => { try { return fs.readdirSync(path.join(ROOT, `content/blog/${lang}`)).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort(); } catch { return []; } };
/** Every relative link and #anchor on these pages that does not resolve. */
function brokenLinks(files) {
  const idsOf = new Map();
  const ids = (f) => { if (!idsOf.has(f)) idsOf.set(f, new Set([...(read(f) || '').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))); return idsOf.get(f); };
  for (const f of files) {
    for (const m of (read(f) || '').matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      const u = m[1].replace(/&amp;/g, '&');
      if (/^(https?:|tel:|mailto:|data:|javascript:)/.test(u) || u.startsWith('/_vercel/') || u.startsWith('/api/') || u.includes('${')) continue;
      const [p0, hash] = u.split('#');
      const p = p0.split('?')[0];
      const target = !p ? f : p.startsWith('/') ? p.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(f), p));
      if (p && !exists(target)) return `${f}: ${u} not found`;
      if (hash && target.endsWith('.html') && !ids(target).has(hash)) return `${f}: #${hash} not on ${target}`;
    }
  }
  return null;
}
const altOf = (html, lang) => ((String(html).match(new RegExp(`<link rel="alternate" hreflang="${lang}" href="([^"]+)"`)) || [])[1] || null);
const ENGLISH_WORDS = /\b(the|and|your|with|you|our|we|for|of|to)\b/gi;

/* ── round 6 helpers: the order flow ──────────────────────────────────────── */
const R6_ROWS = C.PRICES ? C.PRICES.map((r) => r[C.ONE_TIME_COL]) : [];
const ORDER_URL = (q = '') => `/book/quote.html?size=${LOAD_ROW}${q ? `&${q}` : ''}`;
/** The order page with a ZIP already known (the page reads quoteZip from sessionStorage). */
const ORDER_WITH_ZIP = (q = '', zip = Z2) => seeded(ORDER_URL(q), { quoteZip: zip });
async function withPage(width, fn) {
  if (!browser) return 'no Chrome to measure with';
  const p = await browser.page({ width });
  try { return await fn(p); } finally { await p.close(); }
}
/** Everything the in-page checks ask for, as one evaluated expression. */
const rectOf = (sel) => `(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var r=e.getBoundingClientRect(),c=getComputedStyle(e);
return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,w:r.width,h:r.height,display:c.display,visibility:c.visibility,opacity:c.opacity,position:c.position};})()`;
const shown = (r) => !!r && r.display !== 'none' && r.visibility !== 'hidden' && r.w > 0 && r.h > 0;
/** Walk the order page's sections the way a customer does. Returns null, or the step that failed. */
async function fillOrder(p, { wallet = false, zip = Z2, contact = true, picked = {} } = {}) {
  const step = async (name, fn) => { try { await fn(); return null; } catch (e) { return `${name}: ${e.message}`; } };
  let bad = null;
  bad = bad || await step('ZIP', () => p.type('#o-zip input', zip));
  const DAY = '#o-when [data-date]:not([disabled]):not([aria-disabled="true"])', WIN = '#o-when [data-window]:not([disabled]):not([aria-disabled="true"]):not(.full)';
  const attr = (sel, a) => p.evaluate(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return e?e.getAttribute(${JSON.stringify(a)}):null;})()`);
  picked.date = await attr(DAY, 'data-date');
  bad = bad || await step('day chip', () => p.click(DAY));
  picked.window = await attr(WIN, 'data-window');
  bad = bad || await step('window', () => p.click(WIN));
  if (contact) {
    bad = bad || await step('name', () => p.type('#o-you input[autocomplete="name"]', SAMPLE_CONTACT.name));
    bad = bad || await step('phone', () => p.type('#o-you input[autocomplete="tel"]', SAMPLE_CONTACT.phone));
    bad = bad || await step('email', () => p.type('#o-you input[autocomplete="email"]', SAMPLE_CONTACT.email));
    bad = bad || await step('street', () => p.type('#o-you input[autocomplete="street-address"]', SAMPLE_CONTACT.addr));
  }
  if (!wallet) {
    bad = bad || await step('card', () => p.type('#o-pay .fake-card', '4242424242424242'));
    bad = bad || await step('consent', () => p.click('#o-pay input[type="checkbox"]'));
  }
  return bad;
}
/** Homepage card to thanks.html. Returns { taps, hits } or a reason. */
async function bookingJourney(width, wallet) {
  resetState();
  return withPage(width, async (p) => {
    try {
    await p.goto(`${ORIGIN}/index.html?__fakepay=1&__open=1&__sticky=1`, 1200);
    const tagged = await p.evaluate(`(function(){var cs=[].slice.call(document.querySelectorAll('.size-card'));
var c=cs.filter(function(e){return (e.querySelector('.size-price')||e).textContent.indexOf(${JSON.stringify(fmt(LOAD_CENTS).replace(/\.00$/, ''))})>-1;})[0];
if(!c)return false;c.setAttribute('data-score-pick','1');return true;})()`);
    if (!tagged) return 'no homepage size card shows the half truck price';
      await p.click('[data-score-pick]', 1800);
      let bad = await fillOrder(p, { wallet });
      if (bad) return `could not fill the order page, ${bad}`;
      await p.click(wallet ? '.fake-wallet' : '#o-book', 1800);
      for (let i = 0; i < 30 && !/thanks\.html/.test(await p.evaluate('location.pathname')); i++) await new Promise((r) => setTimeout(r, 200));
      if (!/thanks\.html/.test(await p.evaluate('location.pathname'))) return `did not reach thanks.html (at ${await p.evaluate('location.pathname')})`;
      // One autofill pick fills name, phone, email and street: it counts as one tap, typing as none.
      return { taps: p.taps() + (wallet ? 0 : 1), hits: STATE.bookingHits };
    } catch (e) { return `journey stopped: ${e.message}`; }
    finally { await p.evaluate(`document.cookie='jkr_flags=; Path=/; Max-Age=0'`).catch(() => {}); }
  });
}
const SCAN_DIRS = ['.', 'book', 'es', 'es/blog', 'blog', 'jkr', 'js', 'css'];
const scanFiles = () => [
  ...SCAN_DIRS.flatMap((d) => { try { return fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.(html|js|css)$/.test(f)).map((f) => (d === '.' ? f : `${d}/${f}`)); } catch { return []; } }),
  'i18n/es.json'].filter(exists);
const mdFiles = () => ['content/towns', 'content/blog/en', 'content/blog/es'].flatMap((d) => { try { return fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.md')).map((f) => `${d}/${f}`); } catch { return []; } });

const ROUNDS = {
  6: [
    { id: 'tests', pts: 6, desc: 'npm test passes', run() {
      const r = run('npm', ['test']);
      return r.code === 0 || `npm test failed: ${r.out.split('\n').filter((l) => /FAIL|Error|STALE|stale/.test(l)).slice(0, 3).join(' | ')}`;
    } },
    { id: 'no-truck', pts: 6, desc: 'no page, script, style or Spanish phrase names the load builder or tells people to tap items into a truck', run() {
      if (exists('js/load-builder.js')) return 'js/load-builder.js is still there';
      const bad = /load-builder|LoadBuilder|LOAD_BUILDER|\blb-|tap (the )?items?\b|tap what you|fill(s|ing)? (up )?(the|your) truck|truck fills|watch the truck/i;
      for (const f of [...scanFiles(), ...mdFiles()]) {
        const m = (read(f) || '').match(bad);
        if (m) return `${f} mentions "${m[0]}"`;
      }
      return true;
    } },
    { id: 'one-source', pts: 4, desc: 'both order module copies identical and match the config; no price, window or fee literal in the page scripts or APIs', run() {
      const a = read('api/_lib/order-config.js'), b = read('js/order-config.js');
      if (!a || !b) return 'api/_lib/order-config.js or js/order-config.js missing';
      if (a !== b) return 'the two order module copies differ';
      delete require.cache[require.resolve(path.join(ROOT, 'api/_lib/order-config.js'))];
      const O = require(path.join(ROOT, 'api/_lib/order-config.js'));
      if (!O.SIZES || O.SIZES.length !== R6_ROWS.length) return 'ORDER.SIZES does not list every size';
      for (const [i, s] of O.SIZES.entries()) if (s.cents !== R6_ROWS[i]) return `size ${i} is ${s.cents}, config says ${R6_ROWS[i]}`;
      if (!C.SCHEDULE || JSON.stringify(O.SCHEDULE) !== JSON.stringify(C.SCHEDULE)) return 'ORDER.SCHEDULE differs from the config';
      if (!C.POLICY || O.POLICY.cancelHours !== C.POLICY.cancelHours || O.POLICY.lateFeeCents !== C.POLICY.lateFee * 100) return 'ORDER.POLICY differs from the config';
      const files = ['js/order.js', 'js/size-cards.js', 'api/create-booking.js', 'api/day-capacity.js', 'api/visit-update.js', 'api/stripe-webhook.js'];
      for (const f of files) {
        const s = read(f);
        if (s === null) return `${f} missing`;
        const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        const prices = R6_ROWS.flatMap((c) => [String(c), `$${c / 100}`]);
        for (const lit of prices) if (code.includes(lit)) return `${f} types the price ${lit}`;
        for (const w of C.SCHEDULE.windows) if (code.includes(`'${w.key}'`) || code.includes(w.label)) return `${f} types the window ${w.key}`;
        if (new RegExp(`\\b(lateFee|cancelHours|refusalFee)\\s*[:=]\\s*\\d`).test(code)) return `${f} types a fee or cancel hours`;
      }
      return true;
    } },
    { id: 'sizes', pts: 5, desc: 'five size cards on the homepage, order page, a town page and an es/ page, each at its config price, red while guessed', async run() {
      if (!CHROME) return 'no Chrome to measure with';
      const town = towns().find((t) => t.slug !== 'gresham') || towns()[0];
      const pages = ['/index.html', '/book/quote.html', `/${town.slug}.html`, '/es/index.html'];
      for (const url of pages) {
        const dom = await dump(url);
        const cards = [...String(dom).matchAll(/<(?:a|button|div|li|article)\b[^>]*class="[^"]*\bsize-card\b[^"]*"[^>]*>([\s\S]*?)(?=<(?:a|button|div|li|article)\b[^>]*class="[^"]*\bsize-card\b|$)/g)];
        if (cards.length !== R6_ROWS.length) return `${url}: ${cards.length} size cards, want ${R6_ROWS.length}`;
        for (const [i, m] of cards.entries()) {
          const price = (m[1].match(/class="[^"]*size-price[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/) || [])[1];
          const want = `$${R6_ROWS[i] / 100}`;
          if (!price || !text(price).replace(/,/g, '').includes(want)) return `${url}: card ${i + 1} price is "${price && text(price)}", want ${want}`;
          if (C.GUESS && C.GUESS.prices && !/class="[^"]*\bguess\b/.test(m[0].slice(0, m[0].indexOf(price) + price.length))) return `${url}: card ${i + 1} price is not red`;
        }
      }
      return true;
    } },
    { id: 'phone', pts: 9, desc: 'order page at 360px: cards stacked, bar shows the total and Book carries the amount, bar hides while typing, no sideways scroll, text 16px+, taps 48px+', async run() {
      if (!Z2) return 'no zone 2 ZIP in the config';
      return withPage(360, async (p) => {
        await p.goto(ORIGIN + ORDER_WITH_ZIP('__probe=6'));
        const probe = probeOf(await p.html());
        if (!probe) return 'order page did not report (no #order page yet?)';
        if (probe.error) return probe.error;
        if (probe.vw !== 360) return `measured at ${probe.vw}px`;
        if (probe.sw > probe.vw) return `${probe.sw}px wide in a ${probe.vw}px window`;
        if (probe.small.length) return `small text ${probe.small.slice(0, 2).join('; ')}`;
        if (probe.taps.length) return `small taps ${probe.taps.slice(0, 2).join('; ')}`;
        const cards = await p.evaluate(`[].map.call(document.querySelectorAll('#o-size .size-card'),function(e){var r=e.getBoundingClientRect();return [r.left,r.top,r.width];})`);
        if (!cards || cards.length !== R6_ROWS.length) return `${cards ? cards.length : 0} size cards on the order page`;
        for (let i = 1; i < cards.length; i++) if (cards[i][1] <= cards[i - 1][1] || Math.abs(cards[i][0] - cards[0][0]) > 2) return 'size cards are not stacked in one column';
        const bar = await p.evaluate(rectOf('#o-bar'));
        if (!shown(bar) || bar.position !== 'fixed') return 'no fixed bottom bar (#o-bar)';
        const barText = await p.evaluate(`document.querySelector('#o-bar').textContent`);
        if (!barText.includes(fmt(TOTAL).replace(/\.00$/, ''))) return `bar does not show the total ${fmt(TOTAL)}: "${text(barText).slice(0, 80)}"`;
        const book = await p.evaluate(`(document.querySelector('#o-book')||{}).textContent`);
        if (!book || !book.includes(fmt(TOTAL).replace(/\.00$/, ''))) return `Book button reads "${text(book)}", want the amount`;
        await p.evaluate(`(function(){var i=document.querySelector('#o-you input');if(i){i.scrollIntoView({block:'center'});i.focus();}})()`);
        await new Promise((r) => setTimeout(r, 500));
        const hid = await p.evaluate(rectOf('#o-bar'));
        if (shown(hid) && hid.opacity !== '0' && hid.top < 900) return 'the bar stays over the field being typed in';
        return true;
      });
    } },
    { id: 'desktop', pts: 7, desc: 'order page at 1280px: two columns, summary in view at the pay step, no bottom bar; homepage cards in one row; no sideways scroll', async run() {
      if (!Z2) return 'no zone 2 ZIP in the config';
      const order = await withPage(1280, async (p) => {
        await p.goto(ORIGIN + ORDER_WITH_ZIP('__probe=6'));
        const probe = probeOf(await p.html());
        if (!probe) return 'order page did not report (no #order page yet?)';
        if (probe.sw > probe.vw) return `order page ${probe.sw}px wide in a ${probe.vw}px window`;
        const size = await p.evaluate(rectOf('#o-size')), sum = await p.evaluate(rectOf('#o-summary'));
        if (!shown(size) || !shown(sum)) return 'no #o-size and #o-summary to measure';
        if (sum.left < size.right - 2) return 'the summary is not in a second column';
        const bar = await p.evaluate(rectOf('#o-bar'));
        if (shown(bar)) return 'the bottom bar still shows at 1280px';
        await p.evaluate(`document.querySelector('#o-pay').scrollIntoView({block:'center'})`);
        await new Promise((r) => setTimeout(r, 400));
        const after = await p.evaluate(rectOf('#o-summary'));
        if (!shown(after) || after.bottom < 0 || after.top > 800) return 'the summary scrolled out of view at the pay step';
        return true;
      });
      if (order !== true) return order;
      return withPage(1280, async (p) => {
        await p.goto(ORIGIN + '/index.html?__probe=6');
        const probe = probeOf(await p.html());
        if (probe && probe.sw > probe.vw) return `homepage ${probe.sw}px wide in a ${probe.vw}px window`;
        const tops = await p.evaluate(`[].map.call(document.querySelectorAll('.size-card'),function(e){return Math.round(e.getBoundingClientRect().top);})`);
        if (!tops || tops.length !== R6_ROWS.length) return `${tops ? tops.length : 0} size cards on the homepage`;
        return tops.every((t) => Math.abs(t - tops[0]) <= 4) || 'homepage cards are not in one row at 1280px';
      });
    } },
    { id: 'taps', pts: 10, desc: 'scripted booking, homepage card to thanks.html, against the real API: card 10 taps or fewer at 360 and 1280, wallet 8 or fewer, one create-booking call each', async run() {
      if (!Z2) return 'no zone 2 ZIP in the config';
      for (const [width, wallet, max] of [[360, false, 10], [1280, false, 10], [360, true, 8]]) {
        const r = await bookingJourney(width, wallet);
        const label = `${wallet ? 'wallet' : 'card'} at ${width}px`;
        if (typeof r === 'string') return `${label}: ${r}`;
        if (r.taps > max) return `${label}: ${r.taps} taps, want ${max} or fewer`;
        if (r.hits !== 1) return `${label}: ${r.hits} create-booking calls, want exactly 1`;
      }
      return true;
    } },
    { id: 'clear', pts: 6, desc: '"+ travel" before a ZIP, then the total and a Travel line; the rule beside Book, on thanks.html and in the confirmation email', async run() {
      if (!Z2) return 'no zone 2 ZIP in the config';
      const bare = await dump(ORDER_URL());
      if (!/\+ travel/.test(text(bare))) return 'the order page never says "+ travel" before a ZIP';
      const dom = await dump(ORDER_WITH_ZIP());
      const total = (byId(dom, 'o-summary') || byId(dom, 'o-bar') || { text: '' }).text;
      if (!total.includes(fmt(TOTAL).replace(/\.00$/, ''))) return `with a ZIP the total reads "${total.slice(0, 80)}", want ${fmt(TOTAL)}`;
      if (!/Travel/.test(total)) return 'no Travel line once the ZIP is known';
      const pay = byId(dom, 'o-pay');
      if (!pay || !/charged after the job/i.test(pay.text) || !/24 hours|Free to cancel/i.test(pay.text)) return 'the pay step does not state the rule beside Book';
      const th = await dump(seeded('/book/thanks.html', { bookingSummary: { plan: '1/2 truck', amountCents: TOTAL, travel: 'Zone 2', address: '1 Probe St' } }));
      if (!/charged after the job/i.test(text(th))) return 'thanks.html does not say the card is charged after the job';
      if (!/charged after the job/i.test(read('api/_lib/email-templates.js') || '')) return 'the confirmation email does not say the card is charged after the job';
      return true;
    } },
    { id: 'server', pts: 10, desc: 'test-booking passes: SetupIntent, never a PaymentIntent; stale quote, full window, outside the area, closed day and no consent refused with no Stripe object', run() {
      const src = read('scripts/test-booking.mjs') || '';
      for (const k of ['setupIntents', 'stale_quote', 'window_full', 'outside_area', 'closed_day', 'consent_required']) if (!src.includes(k)) return `test-booking does not cover ${k}`;
      return run('node', ['scripts/test-booking.mjs']).code === 0 || 'test-booking fails';
    } },
    { id: 'final-charge', pts: 10, desc: 'test-charge passes', run() {
      if (!exists('scripts/test-charge.mjs')) return 'scripts/test-charge.mjs missing';
      return run('node', ['scripts/test-charge.mjs']).code === 0 || 'test-charge fails';
    } },
    { id: 'webhook', pts: 6, desc: 'test-ops sections "booked" and "final charge" pass', run() {
      const r = run('node', ['scripts/test-ops.mjs']);
      for (const k of ['== booked ==', '== final charge ==']) if (!r.out.includes(k)) return `test-ops has no ${k} section`;
      return r.code === 0 || 'test-ops fails';
    } },
    { id: 'windows', pts: 4, desc: 'day-capacity returns dates and windows per market, full windows flagged, fail open', async run() {
      resetState();
      const r = await callHandler('api/day-capacity.js', { url: '/api/day-capacity?market=portland' });
      const days = r.json && r.json.days;
      if (r.status !== 200 || !Array.isArray(days) || !days.length) return `day-capacity answered ${r.status} ${JSON.stringify(r.json).slice(0, 80)}`;
      const d = days[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || typeof d.label !== 'string' || typeof d.full !== 'boolean') return 'a day has no date, label or full flag';
      if (!Array.isArray(d.windows) || d.windows.length !== C.SCHEDULE.windows.length || !d.windows.every((w) => w.key && w.label && typeof w.full === 'boolean')) return 'a day does not list every window with a full flag';
      if (days.some((x) => x.full || x.windows.some((w) => w.full))) return 'nothing should be full when the database cannot be read (fail open)';
      STATE.full = true;
      const f = await dayCapacity('/api/day-capacity?market=portland');
      STATE.full = false;
      const fd = f.json && f.json.days && f.json.days[0];
      if (!fd || !fd.windows[0].full) return 'a window at its cap is not flagged full';
      if (fd.windows.slice(1).some((w) => w.full && fd.windows.length > 1 && !fd.full)) return 'a window under its cap is flagged full';
      return true;
    } },
    { id: 'failures-ui', pts: 4, desc: 'far ZIP lead; a full window greyed and labelled "Full"; the stale quote message; gates closed saves a reservation lead and calls no Stripe', async run() {
      if (!Z2) return 'no zone 2 ZIP in the config';
      const far = byId(await dump(ORDER_WITH_ZIP('', FAR)), 'o-zip');
      if (!far) return 'no #o-zip section on the order page';
      if (!/type="email"/i.test(far.inner) || !/call/i.test(far.text) || !/price/i.test(far.text)) return 'a ZIP past the last zone shows no call-us message with an email-a-price form inside #o-zip';
      resetState();
      STATE.full = true;
      const full = await withPage(360, async (p) => {
        await p.goto(ORIGIN + ORDER_WITH_ZIP('__fakepay=1'));
        const ok = await p.evaluate(`[].some.call(document.querySelectorAll('#o-when [data-window]'),function(e){return /Full/.test(e.textContent)&&(e.disabled||e.getAttribute('aria-disabled')==='true'||/\\bfull\\b/.test(e.className));})`);
        return ok || 'a full window is not greyed and labelled "Full"';
      });
      resetState();
      if (full !== true) return full;
      STATE.stale = true;
      const stale = await withPage(360, async (p) => {
        await p.goto(`${ORIGIN}${ORDER_WITH_ZIP('__fakepay=1&__open=1')}`);
        const bad = await fillOrder(p, { zip: Z2 });
        if (bad) return `could not fill the order page, ${bad}`;
        await p.click('#o-book', 1500);
        const t = await p.evaluate('document.body.innerText');
        return /price (has )?changed|out of date|new total|updated the price/i.test(t) || 'a stale quote shows no message';
      });
      resetState();
      if (stale !== true) return stale;
      return withPage(360, async (p) => {
        await p.goto(ORIGIN + ORDER_WITH_ZIP('__fakepay=1'));
        await p.evaluate(`window.__leads=[];if(window.SiteLeads)window.SiteLeads.capture=function(a){window.__leads.push(a);return Promise.resolve({});};`);
        const picked = {};
        const bad = await fillOrder(p, { zip: Z2, picked });
        if (bad) return `could not fill the order page, ${bad}`;
        if (!picked.date || !picked.window) return 'the day or window chip has no data-date or data-window to check';
        await p.click('#o-book', 1500);
        const leads = JSON.stringify(await p.evaluate('window.__leads'));
        if (!leads || leads === '[]') return 'with the gates closed Book saved no reservation lead';
        const sizeLabel = Object.values(C.LOADS)[LOAD_ROW].label;
        const has = (v) => leads.toLowerCase().includes(String(v).toLowerCase());
        const wanted = [['ZIP', Z2], ['date', picked.date], ['window', picked.window], ['phone', SAMPLE_CONTACT.phone.replace(/\D/g, '').slice(-7)], ['email', SAMPLE_CONTACT.email], ['name', SAMPLE_CONTACT.name], ['street', SAMPLE_CONTACT.addr]];
        for (const [what, v] of wanted) if (!has(v) && !(what === 'phone' && /555.?0100/.test(leads))) return `the reservation lead has no ${what} (${v})`;
        if (!has(sizeLabel) && !new RegExp(`"size"\\s*:\\s*"?${LOAD_ROW}\\b`).test(leads)) return `the reservation lead has no size (${sizeLabel} or row ${LOAD_ROW})`;
        return (STATE.bookingHits === 0 && fakeStripe.calls.length === 0) || 'a closed-gate Book still reached create-booking or Stripe';
      });
    } },
    { id: 'dashboard', pts: 3, desc: 'the four job actions show on a job; each refuses a missing token and the ?token= form', async run() {
      const j = read('jkr/index.html') || '';
      for (const k of ['On my way', 'Finish', 'Late cancel fee', 'Customer said no']) if (!j.includes(k)) return `the dashboard has no "${k}" action`;
      for (const action of ['finish', 'declined', 'late-fee', 'en-route']) {
        const none = await callHandler('api/visit-update.js', { method: 'POST', body: { action, visitId: 'v1' }, headers: {}, env: { SUPABASE_SERVICE_ROLE_KEY: 'score-service-key' } });
        if (![401, 403].includes(none.status)) return `${action} without a token answered ${none.status}`;
        const q = await callHandler('api/visit-update.js', { method: 'POST', url: '/api/visit-update?token=score-admin-token', body: { action, visitId: 'v1' }, headers: {}, env: { SUPABASE_SERVICE_ROLE_KEY: 'score-service-key' } });
        if (![401, 403].includes(q.status)) return `${action} with ?token= answered ${q.status}`;
      }
      return true;
    } },
    { id: 'contact', pts: 2, desc: 'call, text and WhatsApp in the header, the bar and under the homepage cards; the WhatsApp text names the size and ZIP once picked', async run() {
      if (!Z2) return 'no zone 2 ZIP in the config';
      const has = (s) => /href="tel:/.test(s) && /href="sms:/.test(s) && /href="https:\/\/wa\.me\//.test(s);
      const home = read('index.html') || '';
      const header = (home.match(/<header[\s\S]*?<\/header>/i) || [''])[0];
      if (!has(header)) return 'the homepage header lacks call, text and WhatsApp';
      const last = home.lastIndexOf('size-card');
      if (last < 0 || !has(home.slice(last, last + 4000))) return 'no call, text and WhatsApp under the homepage size cards';
      const dom = await dump(ORDER_WITH_ZIP());
      const bar = byId(dom, 'o-bar');
      if (!bar || !has(bar.inner)) return 'the order page bar lacks call, text and WhatsApp';
      const wa = [...String(dom).matchAll(/href="(https:\/\/wa\.me\/[^"]*)"/g)].map((m) => decodeURIComponent(m[1].replace(/&amp;/g, '&')));
      if (!wa.some((u) => u.includes(Z2) && /1\/2 truck/i.test(u))) return 'the WhatsApp message does not name the size and ZIP once picked';
      return true;
    } },
    { id: 'redirect', pts: 2, desc: '/book/checkout.html sends to /book/quote.html keeping its query (vercel.json and a noindex meta refresh)', run() {
      const v = read('vercel.json') || '';
      let cfg = {}; try { cfg = JSON.parse(v); } catch { return 'vercel.json is not JSON'; }
      const rd = (cfg.redirects || []).find((r) => /\/book\/checkout/.test(r.source));
      if (!rd || !/\/book\/quote\.html/.test(rd.destination)) return 'vercel.json has no checkout to quote redirect';
      const c = read('book/checkout.html') || '';
      if (!/<meta[^>]+name="robots"[^>]+noindex/i.test(c)) return 'checkout.html is not noindex';
      if (!/http-equiv="refresh"[^>]+quote\.html/i.test(c)) return 'checkout.html has no meta refresh to quote.html';
      return /location\.search/.test(c) || 'checkout.html does not carry its query to quote.html';
    } },
    { id: 'guesses', pts: 2, desc: 'windows, caps, days ahead, late fee, cancel hours, refusal fee and the WhatsApp number are red and listed; GUESSES.md current', async run() {
      if (!C.GUESS || !C.GUESS.schedule || !C.GUESS.policy) return 'GUESS has no schedule and policy flags';
      const g = (read('GUESSES.md') || '').toLowerCase();
      for (const k of ['window', 'cap', 'days ahead', 'late fee', 'cancel hours', 'refusal fee', 'whatsapp']) if (!g.includes(k)) return `GUESSES.md does not list ${k}`;
      const dom = await dump(ORDER_WITH_ZIP());
      const pay = byId(dom, 'o-pay'), when = byId(dom, 'o-when');
      if (!pay || !/class="[^"]*\bguess\b/.test(pay.inner)) return 'the pay step prints no red guess (late fee, cancel hours)';
      if (!when || !/class="[^"]*\bguess\b/.test(when.inner)) return 'the day and window step prints no red guess (windows, caps)';
      return run('node', ['scripts/list-guesses.mjs', '--check']).code === 0 || 'GUESSES.md is stale';
    } },
    { id: 'earlier', pts: 4, desc: 'rounds 1 to 5 each still score 100', run() {
      for (const n of [1, 2, 3, 4, 5]) {
        const r = run('node', ['scripts/score.mjs', '--round', String(n), '--json', '--no-earlier'], { timeout: 1500000 });
        let j = null; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { /* not json */ }
        if (!j || j.score !== 100) return `round ${n} scores ${j ? j.score : '?'}: ${j ? j.checks.filter((c) => !c.got).map((c) => c.id).join(', ') : r.out.slice(0, 80)}`;
      }
      return true;
    } },
  ],
  5: [
    { id: 'tests', pts: 10, desc: 'npm test passes', run() {
      const r = run('npm', ['test']);
      return r.code === 0 || `npm test failed: ${r.out.split('\n').filter((l) => /FAIL|Error|STALE|stale/.test(l)).slice(0, 3).join(' | ')}`;
    } },
    { id: 'blog', pts: 15, desc: '12+ posts: generated, linked from the index, 400+ words, BlogPosting schema, links to the quote and a town, no shared sentences', run() {
      if (!exists('scripts/build-blog.mjs')) return 'scripts/build-blog.mjs missing';
      if (run('node', ['scripts/build-blog.mjs', '--check']).code !== 0) return 'build-blog --check fails';
      const posts = postSlugs('en');
      if (posts.length < 12) return `${posts.length} posts`;
      const idx = read('blog/index.html') || '';
      const seen = new Map();
      for (const p of posts) {
        if (!idx.includes(`href="${p}.html"`)) return `blog index does not link ${p}`;
        const s = read(`blog/${p}.html`) || '';
        const body = (s.match(/<article[^>]*>([\s\S]*?)<\/article>/) || [])[1] || '';
        if (words(body) < 400) return `${p}: ${words(body)} words`;
        if (!ldOf(s, 'BlogPosting')) return `${p}: no BlogPosting`;
        if (!/href="\.\.\/book\/quote\.html"/.test(body)) return `${p}: no link to the quote`;
        if (!towns().some((t) => body.includes(`href="../${t.slug}.html"`))) return `${p}: links no town page`;
        // A heading or list item ends a sentence even without a period.
        for (const x of sentences(body.replace(/<\/(h[1-6]|p|li|div)>/gi, '. '))) { if (seen.has(x) && seen.get(x) !== p) return `"${x.slice(0, 40)}..." in ${seen.get(x)} and ${p}`; seen.set(x, p); }
      }
      return true;
    } },
    { id: 'blog-copy', pts: 5, desc: 'posts follow the copy rules', run() {
      for (const lang of ['en', 'es']) for (const p of postSlugs(lang)) {
        const f = lang === 'en' ? `blog/${p}.html` : `es/blog/${p}.html`;
        const body = (read(f) || '').match(/<article[^>]*>([\s\S]*?)<\/article>/);
        const prob = copyProblem(f, visibleText(body ? body[1] : ''));
        if (prob) return prob;
      }
      return postSlugs('en').length > 0 || 'no posts';
    } },
    { id: 'spanish-pages', pts: 15, desc: 'Spanish homepage, every town, hub, FAQ and blog: lang="es", canonical, hreflang both ways', run() {
      if (!exists('scripts/build-es.mjs')) return 'scripts/build-es.mjs missing';
      if (run('node', ['scripts/build-es.mjs', '--check']).code !== 0) return 'build-es --check fails (stale page or untranslated phrase)';
      const pairs = [['index.html', 'es/index.html'], ['service-areas.html', 'es/service-areas.html'], ['faq.html', 'es/faq.html'],
        ...towns().map((t) => [`${t.slug}.html`, `es/${t.slug}.html`]), ['blog/index.html', 'es/blog/index.html'],
        ...postSlugs('es').map((p) => [`blog/${p}.html`, `es/blog/${p}.html`])];
      if (postSlugs('es').length < postSlugs('en').length) return `${postSlugs('es').length} Spanish posts for ${postSlugs('en').length} English`;
      const url = (f) => `https://www.example.com/${f === 'index.html' ? '' : f.replace(/(^|\/)index\.html$/, '$1')}`;
      for (const [en, es] of pairs) {
        const e = read(en), s = read(es);
        if (!e || !s) return `${s ? en : es} missing`;
        if (!/<html lang="es"/.test(s)) return `${es}: not lang="es"`;
        if (!s.includes(`<link rel="canonical" href="${url(es)}"`)) return `${es}: canonical is not itself`;
        if (altOf(s, 'en') !== url(en) || altOf(e, 'es') !== url(es)) return `${en} and ${es} do not point at each other`;
        if (!altOf(e, 'x-default') || !altOf(s, 'x-default')) return `${en}: no x-default`;
      }
      return true;
    } },
    { id: 'spanish-text', pts: 10, desc: 'Spanish pages read in Spanish (tú, no leftover English, copy rules)', run() {
      const files = ['es/index.html', 'es/service-areas.html', 'es/faq.html', ...towns().map((t) => `es/${t.slug}.html`)].filter(exists);
      if (files.length < 3) return 'Spanish pages missing';
      for (const f of files) {
        const main = (read(f).match(/<main[^>]*>([\s\S]*?)<\/main>/) || [])[1] || '';
        const t = visibleText(main);
        const en = (t.match(ENGLISH_WORDS) || []);
        if (en.length > 3) return `${f}: English left: "${en.slice(0, 6).join(' ')}"`;
        if (/\busted(es)?\b/i.test(t)) return `${f}: says "usted"; write to the reader with tú`;
        const p = copyProblem(f, t.replace(/\b(yard debris)\b/gi, '')); if (p) return p;
      }
      return true;
    } },
    { id: 'spanish-js', pts: 5, desc: 'the truck and the ZIP check speak Spanish on Spanish pages', async run() {
      if (!CHROME) return 'no Chrome';
      if (!exists('es/index.html')) return 'es/index.html missing';
      const dom = await dump(seeded('/es/index.html', { quoteZip: '97211', loadBuild: ['couch', 'mattress'] }));
      const tl = text((String(dom).match(/class="lb-travel"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '');
      const zo = byId(dom, 'zipOut');
      if (!/viaje/i.test(tl)) return `truck travel line: "${tl}"`;
      if (!zo || !/vamos/i.test(zo.text)) return `ZIP answer: "${zo && zo.text}"`;
      return true;
    } },
    { id: 'commercial', pts: 10, desc: 'commercial request form and API, tested (validation, honeypot, owner email, lead), linked from the site', run() {
      if (!exists('book/commercial.html') || !exists('api/commercial-lead.js')) return 'form or API missing';
      const r = run('node', ['scripts/test-commercial.mjs']);
      if (r.code !== 0 || !/== honeypot ==/.test(r.out)) return `test-commercial: ${r.out.split('\n').filter((l) => /FAIL/.test(l)).slice(0, 2).join(' | ') || 'missing'}`;
      if (!/href="book\/commercial\.html"/.test(read('index.html') || '')) return 'the homepage does not link the commercial form';
      return true;
    } },
    { id: 'founding', pts: 10, desc: 'founding offer ported, off, computed on the server, tested', run() {
      const f = read('api/_lib/founding.js') || '';
      if (!/open:\s*false/.test(f)) return 'api/_lib/founding.js missing or not off';
      if (!exists('api/founding-spots.js')) return 'api/founding-spots.js missing';
      const r = run('node', ['scripts/test-founding.mjs']);
      return (r.code === 0 && /== booking with the offer ==/.test(r.out)) || `test-founding: ${r.out.split('\n').filter((l) => /FAIL/.test(l)).slice(0, 2).join(' | ') || 'missing'}`;
    } },
    { id: 'mobile', pts: 5, desc: '360px on the Spanish homepage, a post and the commercial form: no sideways scroll, text 16px+, taps 48px+', async run() {
      if (!CHROME) return 'no Chrome';
      const post = postSlugs('en')[0];
      for (const f of ['es/index.html', `blog/${post}.html`, 'book/commercial.html']) {
        if (!exists(f)) return `${f} missing`;
        const p = probeOf(await dump(`/${f}?__probe=5`));
        if (!p || p.error) return `${f}: ${p ? p.error : 'did not report'}`;
        if (p.vw !== 360) return `${f}: measured at ${p.vw}px`;
        if (p.sw > p.vw) return `${f}: ${p.sw}px wide`;
        if (p.small.length) return `${f}: small text ${p.small.slice(0, 2).join('; ')}`;
        if (p.taps.length) return `${f}: small taps ${p.taps.slice(0, 2).join('; ')}`;
      }
      return true;
    } },
    { id: 'seo', pts: 10, desc: 'schema, sitemap, indexability, share cards, titles and every link on the new pages', run() {
      for (const [cmd, a] of [['check-schema', []], ['build-sitemap', ['--check']], ['check-indexability', ['--local']], ['build-og-cards', ['--check']], ['check-meta', []]]) {
        if (run('node', [`scripts/${cmd}.mjs`, ...a]).code !== 0) return `${cmd} fails`;
      }
      const files = ['blog/index.html', ...postSlugs('en').map((p) => `blog/${p}.html`), 'es/index.html', 'es/faq.html', 'es/service-areas.html',
        'es/blog/index.html', ...postSlugs('es').map((p) => `es/blog/${p}.html`), ...towns().map((t) => `es/${t.slug}.html`), 'book/commercial.html'].filter(exists);
      return brokenLinks(files) || true;
    } },
    { id: 'earlier', pts: 5, desc: 'rounds 1 to 4 still score 100', run() {
      for (const n of [1, 2, 3, 4]) {
        const r = run('node', ['scripts/score.mjs', '--round', String(n), '--json'], { timeout: 1500000 });
        let j = null; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { /* not json */ }
        if (!j || j.score !== 100) return `round ${n} scores ${j ? j.score : '?'}: ${j ? j.checks.filter((c) => !c.got).map((c) => c.id).join(', ') : r.out.slice(0, 80)}`;
      }
      return true;
    } },
  ],
  4: [
    { id: 'tests', pts: 10, desc: 'npm test passes', run() {
      const r = run('npm', ['test']);
      return r.code === 0 || `npm test failed: ${r.out.split('\n').filter((l) => /FAIL|Error|STALE|stale/.test(l)).slice(0, 3).join(' | ')}`;
    } },
    { id: 'one-source', pts: 5, desc: 'the site address lives in one file; no script, API or browser file types it', run() {
      if (!exists('api/_lib/site.js')) return 'api/_lib/site.js missing';
      const files = [...fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.mjs') && !/^(test-|score)/.test(f)).map((f) => `scripts/${f}`),
        ...['api', 'api/_lib', 'js'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))]
        .filter((f) => f !== 'api/_lib/site.js' && f !== 'js/travel.js' && f !== 'api/_lib/travel.js');
      for (const f of files) {
        // Comments may name the placeholder; code may not type it.
        const hit = (read(f) || '').split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
          .find((l) => /example\.com/.test(l.replace(/[\w.+-]+@example\.com/g, '')));
        if (hit) return `${f}: ${hit.trim().slice(0, 80)}`;
      }
      return true;
    } },
    { id: 'domain', pts: 10, desc: 'one host everywhere; a dry run domain swap leaves nothing behind', run() {
      if (!exists('scripts/set-domain.mjs')) return 'scripts/set-domain.mjs missing';
      if (run('node', ['scripts/set-domain.mjs', '--check']).code !== 0) return 'set-domain --check finds mixed hosts';
      const r = run('node', ['scripts/set-domain.mjs', '--dry-run', 'junk-test.example.org']);
      const m = r.out.match(/(\d+) files?, (\d+) left/);
      if (r.code !== 0 || !m) return `dry run said: ${r.out.trim().slice(0, 120)}`;
      return (+m[1] > 40 && +m[2] === 0) || `dry run: ${m[0]}`;
    } },
    { id: 'jsonld', pts: 15, desc: 'schema parses and is true: towns carry Service with offers and FAQPage, FAQ and homepage carry FAQPage', run() {
      if (!exists('scripts/check-schema.mjs')) return 'scripts/check-schema.mjs missing';
      const r = run('node', ['scripts/check-schema.mjs']);
      if (r.code !== 0) return `check-schema: ${r.out.split('\n').filter((l) => /FAIL/.test(l)).slice(0, 2).join(' | ')}`;
      for (const x of towns()) {
        const s = read(`${x.slug}.html`);
        const svc = ldOf(s, 'Service'), faq = ldOf(s, 'FAQPage');
        if (!svc || !svc.offers || !svc.areaServed) return `${x.slug}: no Service with offers and areaServed`;
        const visible = (cityRegion(s, 'faq').match(/<details>/g) || []).length;
        if (!faq || faq.mainEntity.length !== visible) return `${x.slug}: FAQPage has ${faq ? faq.mainEntity.length : 0} of ${visible} questions`;
      }
      const f = read('faq.html'), h = read('index.html');
      const fq = ldOf(f, 'FAQPage');
      if (!fq || fq.mainEntity.length !== (f.match(/<summary/g) || []).length) return 'faq.html FAQPage does not match its questions';
      if (!ldTypes(h).includes('LocalBusiness') || !ldOf(h, 'FAQPage')) return 'homepage needs LocalBusiness and FAQPage';
      return towns().length > 0 || 'no towns';
    } },
    { id: 'sitemap', pts: 10, desc: 'sitemap lists exactly the indexable pages on the site address', run() {
      if (!exists('scripts/build-sitemap.mjs')) return 'scripts/build-sitemap.mjs missing';
      if (run('node', ['scripts/build-sitemap.mjs', '--check']).code !== 0) return 'build-sitemap --check fails';
      const sm = read('sitemap.xml') || '';
      const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      // A folder's index.html is listed as the folder (/, /blog/, /es/), like its canonical.
      const want = indexable().map((f) => `https://www.example.com/${f.replace(/(^|\/)index\.html$/, '$1')}`);
      const missing = want.filter((u) => !locs.includes(u)), extra = locs.filter((u) => !want.includes(u));
      if (missing.length) return `sitemap misses ${missing.slice(0, 3).join(', ')}`;
      if (extra.length) return `sitemap has ${extra.slice(0, 3).join(', ')}`;
      return true;
    } },
    { id: 'robots-llms', pts: 5, desc: 'robots.txt points at the sitemap and hides the dashboard and API; llms.txt describes the business', run() {
      const r = read('robots.txt') || '';
      if (!/Sitemap: https:\/\/www\.example\.com\/sitemap\.xml/.test(r) || !/Disallow: \/api\//.test(r) || !/Disallow: \/jkr\//.test(r)) return 'robots.txt incomplete';
      const l = read('llms.txt') || '';
      if (!/Portland/.test(l) || !/408-6053/.test(l) || !/quote\.html/.test(l) || !/service-areas\.html/.test(l)) return 'llms.txt incomplete';
      return copyProblem('llms.txt', l) || true;
    } },
    { id: 'indexability', pts: 10, desc: 'local indexability check: sitemap, files and canonicals agree, nothing noindexed is listed', run() {
      if (!exists('scripts/check-indexability.mjs')) return 'scripts/check-indexability.mjs missing';
      const r = run('node', ['scripts/check-indexability.mjs', '--local']);
      return (r.code === 0 && /local/i.test(r.out)) || `check-indexability --local: ${r.out.split('\n').filter((l) => /FAIL|✗/.test(l)).slice(0, 2).join(' | ') || r.out.slice(0, 120)}`;
    } },
    { id: 'og', pts: 10, desc: 'every indexable page has a 1200x630 share card that exists and is current', run() {
      if (!exists('scripts/build-og-cards.mjs')) return 'scripts/build-og-cards.mjs missing';
      if (run('node', ['scripts/build-og-cards.mjs', '--check']).code !== 0) return 'build-og-cards --check fails';
      for (const f of indexable()) {
        const img = ((read(f) || '').match(/<meta property="og:image" content="https:\/\/www\.example\.com\/([^"]+)"/) || [])[1];
        if (!img) return `${f}: no og:image`;
        const sz = pngSize(img);
        if (!sz || sz[0] !== 1200 || sz[1] !== 630) return `${f}: ${img} is ${sz ? sz.join('x') : 'missing'}`;
      }
      return true;
    } },
    { id: 'images', pts: 10, desc: 'image pipeline: makes the sizes from a source photo (test-seo) and the repo is current', run() {
      if (!exists('scripts/build-images.mjs')) return 'scripts/build-images.mjs missing';
      if (run('node', ['scripts/build-images.mjs', '--check']).code !== 0) return 'build-images --check fails';
      const r = run('node', ['scripts/test-seo.mjs']);
      return (r.code === 0 && /== images ==/.test(r.out)) || 'test-seo images section fails';
    } },
    { id: 'tools', pts: 10, desc: 'status, IndexNow and the Search Console token run safely today', run() {
      const st = run('node', ['scripts/status.mjs']);
      if (st.code !== 0 || !/no domain/i.test(st.out)) return `status: ${st.out.slice(0, 100)}`;
      const ix = run('node', ['scripts/indexnow.mjs', '--dry-run']);
      if (ix.code !== 0 || (ix.out.match(/^https?:\/\//gm) || []).length < 40) return 'indexnow --dry-run does not list the sitemap';
      const key = ((read('scripts/indexnow.mjs') || '').match(/KEY = '([0-9a-f]{32})'/) || [])[1];
      if (!key || (read(`${key}.txt`) || '').trim() !== key) return 'IndexNow key file missing';
      return run('node', ['scripts/set-gsc-token.mjs', '--show']).code === 0 || 'set-gsc-token --show fails';
    } },
    { id: 'earlier', pts: 5, desc: 'rounds 1 to 3 still score 100', run() {
      for (const n of [1, 2, 3]) {
        const r = run('node', ['scripts/score.mjs', '--round', String(n), '--json'], { timeout: 900000 });
        let j = null; try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { /* not json */ }
        if (!j || j.score !== 100) return `round ${n} scores ${j ? j.score : '?'}: ${j ? j.checks.filter((c) => !c.got).map((c) => c.id).join(', ') : r.out.slice(0, 80)}`;
      }
      return true;
    } },
  ],
  3: [
    { id: 'tests', pts: 10, desc: 'npm test passes', run() {
      const r = run('npm', ['test']);
      return r.code === 0 || `npm test failed: ${r.out.split('\n').filter((l) => /FAIL|Error|STALE|stale/.test(l)).slice(0, 3).join(' | ')}`;
    } },
    { id: 'docs', pts: 10, desc: 'business plan, launch checklist, accounts, progress and punch list, with their sections', run() {
      const bp = headings('BUSINESS_PLAN.md');
      for (const k of ['summary', 'services', 'pricing', 'service area', 'market', 'competition', 'operations', 'marketing', 'money', 'risks']) if (!bp.includes(k)) return `BUSINESS_PLAN.md has no "${k}" section`;
      if (!/launch/i.test(headings('LAUNCH-DAY.md'))) return 'LAUNCH-DAY.md missing';
      const acc = mdText('ACCOUNTS.md');
      for (const k of ['Stripe', 'Supabase', 'Resend', 'Vercel', 'Discord', 'Anthropic', 'Google']) if (!acc.includes(k)) return `ACCOUNTS.md does not list ${k}`;
      const pr = headings('PROGRESS.md');
      if (!pr.includes('status') || !pr.includes('change log')) return 'PROGRESS.md needs Status and Change log';
      if ((mdText('PUNCHLIST.md').match(/^- \[ \]/gm) || []).length < 5) return 'PUNCHLIST.md has fewer than 5 open items';
      return true;
    } },
    { id: 'numbers', pts: 10, desc: 'prices, zones and area in the docs are generated and in sync; no Scoops Co. prices', run() {
      if (!exists('scripts/build-docs.mjs')) return 'scripts/build-docs.mjs missing';
      if (run('node', ['scripts/build-docs.mjs', '--check']).code !== 0) return 'build-docs --check fails';
      const md = ['BUSINESS_PLAN.md', SHARED, 'marketing/ad-copy/README.md'];
      for (const f of md) if (!/BUILD:docs-prices/.test(mdText(f))) return `${f} has no generated price table`;
      for (const f of [...md, 'LAUNCH-DAY.md', ...MARKETING, ...HELPERS]) if (/\$(24\.13|79\.99|67\.93|36\.20|117\.99)/.test(mdText(f))) return `${f} still has a Scoops Co. price`;
      return true;
    } },
    { id: 'launch', pts: 10, desc: 'launch checklist covers env vars, gates, webhook host, schema, Washington, base, radius, guesses, analytics, domain', run() {
      const s = mdText('LAUNCH-DAY.md');
      const need = ['STRIPE_SECRET_KEY', 'STRIPE_PRODUCT_ID', 'STRIPE_WEBHOOK_SECRET', 'BOOKINGS_OPEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
        'RESEND_API_KEY', 'EMAIL_FROM', 'OPS_WEBHOOK_URL', 'OPS_EMAIL', 'ANTHROPIC_API_KEY', 'SITE_ORIGIN', 'CRON_SECRET', 'ADMIN_DASHBOARD_TOKEN',
        'BOOKINGS_OPEN_SERVER', 'BOOKINGS_OPEN_CLIENT', 'webhook', 'db/schema.sql', 'db/migrations', 'Washington', 'BASE', '24', 'GUESSES.md', 'G-XXXXXXXXXX', 'example.com'];
      const miss = need.filter((k) => !s.includes(k));
      return !miss.length || `LAUNCH-DAY.md never mentions ${miss.slice(0, 4).join(', ')}`;
    } },
    { id: 'marketing', pts: 10, desc: 'six marketing files, each with real pieces, the phone number and travel', run() {
      for (const f of MARKETING) {
        const s = mdText(f);
        if (!s) return `${f} missing`;
        if ((s.match(/^## /gm) || []).length < 3) return `${f} has fewer than 3 sections or pieces`;
        if (!/408-6053/.test(s)) return `${f} never gives the phone number`;
        if (!/travel|zone/i.test(s)) return `${f} never mentions travel`;
      }
      return true;
    } },
    { id: 'helpers', pts: 15, desc: 'four helpers and the shared context: draft mode, quiet hours, dedupe, STOP, no auto posting, zone gate, real columns, generated prices', run() {
      const ctx = mdText(SHARED);
      if (!ctx) return `${SHARED} missing`;
      if (!/BUILD:docs-prices/.test(ctx) || !/BUILD:docs-zones/.test(ctx)) return 'shared context has no generated prices and zones';
      const schema = mdText('db/schema.sql');
      const leads = ((schema.match(/create table if not exists public\.leads \(([\s\S]*?)\);/) || [])[1] || '').match(/^\s+([a-z_]+)\s/gm) || [];
      for (const c of leads.map((x) => x.trim())) if (!ctx.includes(`\`${c}\``)) return `shared context does not name the leads column \`${c}\``;
      if (!/never auto[- ]?post/i.test(ctx)) return 'shared context lacks the never auto post rule';
      for (const f of HELPERS) {
        const s = mdText(f);
        if (!/^---\nname: [a-z-]+\ndescription: .+\n---/m.test(s)) return `${f}: no frontmatter`;
        if (!/MODE/.test(s) || !/draft/.test(s)) return `${f}: no draft mode`;
        if (!s.includes('_shared/jkr-context.md')) return `${f}: does not point to the shared context`;
        if (!/quiet hours/i.test(s)) return `${f}: no quiet hours`;
        if (!/dedupe|already (booked|contacted|processed)/i.test(s)) return `${f}: no dedupe rule`;
        if (!/STOP/.test(s) && f !== HELPERS[3]) return `${f}: no STOP opt out`;
        if (!/travel ?zone|travelFor|past (our|the) last zone/i.test(s)) return `${f}: no zone gate`;
      }
      return true;
    } },
    { id: 'owner-email', pts: 15, desc: 'owner email on every booking, independent of Discord, once per event (test-ops)', run() {
      const r = run('node', ['scripts/test-ops.mjs']);
      if (!/== owner email ==/.test(r.out)) return 'test-ops has no owner email section';
      return r.code === 0 || `test-ops fails: ${r.out.split('\n').filter((l) => /FAIL/.test(l)).slice(0, 2).join(' | ')}`;
    } },
    { id: 'keepalive', pts: 5, desc: 'Supabase keep-alive: daily, secrets only, skips cleanly until set up', run() {
      const s = mdText('.github/workflows/supabase-keepalive.yml');
      if (!s) return 'workflow missing';
      if (!/cron:/.test(s) || !/secrets\.SUPABASE_URL/.test(s) || !/secrets\.SUPABASE_ANON_KEY/.test(s)) return 'needs a cron and both secrets';
      if (/eyJ[A-Za-z0-9_-]{10,}/.test(s)) return 'a key is written into the workflow';
      return /-z "\$\{?SUPABASE_URL/.test(s) || 'does not skip when the secrets are missing';
    } },
    { id: 'copy', pts: 10, desc: 'marketing, helper messages and every customer email: no dashes, slang, dog words or TODO', run() {
      for (const f of MARKETING) { const p = copyProblem(f, mdText(f).replace(/^#.*$/gm, '')); if (p) return p; }
      for (const f of HELPERS) { const p = copyProblem(`${f} message`, fenced(mdText(f))); if (p) return p; }
      try {
        delete require.cache[require.resolve(path.join(ROOT, 'api/_lib/email-templates.js'))];
        const tpl = require(path.join(ROOT, 'api/_lib/email-templates.js'));
        const ctx = { name: 'Jane', plan: 'One-time haul', amount: '$374.00', frequency: 'One-time haul', pickupDay: 'Tuesday', address: '1 Oak St',
          load: '1/2 truck', travel: 'Zone 2: $25.00', quoteUrl: 'https://www.example.com/book/quote.html', quotedPrice: '$374.00', reviewUrl: 'https://g.page/r/x',
          visitDate: 'Tue, Oct 14', updateUrl: 'https://pay.example.com', unsubscribeUrl: 'https://www.example.com/u', photos: [] };
        for (const [k, fn] of Object.entries(tpl)) {
          if (typeof fn !== 'function' || /^(layout|button|detail|escape)/i.test(k)) continue;
          let out; try { out = fn(ctx); } catch { continue; }
          if (!out || !out.html) continue;
          const p = copyProblem(`email ${k}`, `${out.subject}\n${visibleText(out.html)}\n${out.text || ''}`);
          if (p) return p;
        }
      } catch (e) { return `email templates did not load: ${e.message}`; }
      return true;
    } },
    { id: 'guesses', pts: 5, desc: 'GUESSES.md current, with the docs\' guesses marked (10+)', run() {
      if (run('node', ['scripts/list-guesses.mjs', '--check']).code !== 0) return 'GUESSES.md is stale';
      const g = mdText('GUESSES.md');
      const marked = (g.split('## Marked in the source')[1] || '').split('## Red on the pages')[0].match(/^- \[ \]/gm) || [];
      return marked.length >= 10 || `${marked.length} guesses marked in the docs`;
    } },
  ],
  2: [
    { id: 'tests', pts: 10, desc: 'npm test passes', run() {
      const r = run('npm', ['test']);
      return r.code === 0 || `npm test failed: ${r.out.split('\n').filter((l) => /FAIL|Error|STALE|stale/.test(l)).slice(0, 3).join(' | ')}`;
    } },
    { id: 'chrome', pts: 10, desc: 'one header and footer: build-chrome --check, nav links Service areas and FAQ, footer links Privacy and Terms', run() {
      if (!exists('scripts/build-chrome.mjs')) return 'scripts/build-chrome.mjs missing';
      if (run('node', ['scripts/build-chrome.mjs', '--check']).code !== 0) return 'build-chrome --check fails';
      const home = read('index.html') || '';
      const nav = (home.match(/<nav class="site-nav">[\s\S]*?<\/nav>/) || [''])[0];
      if (!/href="service-areas\.html"/.test(nav) || !/href="faq\.html"/.test(nav)) return 'homepage nav does not link service-areas.html and faq.html';
      const foot = (home.match(/<footer>[\s\S]*?<\/footer>/) || [''])[0];
      if (!/href="privacy\.html"/.test(foot) || !/href="terms\.html"/.test(foot)) return 'footer does not link privacy.html and terms.html';
      for (const f of [...STANDALONE, 'service-areas.html']) {
        const s = read(f);
        if (!s) return `${f} missing`;
        if (!/<nav class="site-nav">/.test(s) || !/<footer>/.test(s)) return `${f} has no shared header or footer`;
      }
      return true;
    } },
    { id: 'towns', pts: 10, desc: '35+ town files, every ZIP in a zone, Oregon and Washington, one page each', run() {
      const t = towns();
      if (t.length < 35) return `${t.length} town files`;
      for (const x of t) {
        if (!x.name || !x.zips.length) return `${x.slug}: no name or ZIPs`;
        const bad = x.zips.filter((z) => !C.ZIP_ZONES || !C.ZIP_ZONES[z]);
        if (bad.length) return `${x.slug}: ${bad.join(', ')} not in a zone`;
        if (!exists(`${x.slug}.html`)) return `${x.slug}.html missing`;
      }
      if (!t.some((x) => x.state === 'OR') || !t.some((x) => x.state === 'WA')) return 'needs Oregon and Washington towns';
      return true;
    } },
    { id: 'town-pages', pts: 15, desc: 'town pages: build-towns --check, title and H1 name the town, canonical, the rest identical to the homepage, 120+ words of local copy', run() {
      if (!exists('scripts/build-towns.mjs')) return 'scripts/build-towns.mjs missing';
      if (run('node', ['scripts/build-towns.mjs', '--check']).code !== 0) return 'build-towns --check fails';
      // The language switch is each page's own (it goes to that page's Spanish twin), so it is left out of the comparison.
      const noSwitch = (s) => s.replace(/<a class="lang-switch"[\s\S]*?<\/a>/, '');
      const home = noSwitch(withoutCity(read('index.html')));
      const t = towns();
      if (!t.length) return 'no towns';
      for (const x of t) {
        const s = read(`${x.slug}.html`) || '';
        const title = (s.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
        const h1 = text((s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
        if (!title.includes(x.name) || !h1.includes(x.name)) return `${x.slug}: title or H1 does not name ${x.name}`;
        if (!s.includes(`<link rel="canonical" href="https://www.example.com/${x.slug}.html"`)) return `${x.slug}: canonical missing`;
        if (noSwitch(withoutCity(s)) !== home) return `${x.slug}: differs from the homepage outside its CITY regions`;
        if (words(cityRegion(s, 'local')) < 120) return `${x.slug}: ${words(cityRegion(s, 'local'))} words of local copy`;
      }
      return true;
    } },
    { id: 'unique', pts: 10, desc: 'no 8+ word sentence of local copy shared by two towns; 2+ own FAQs each', run() {
      const seen = new Map();
      for (const x of towns()) {
        if (x.faqs < 2) return `${x.slug}: ${x.faqs} FAQs`;
        for (const s of sentences(x.local)) {
          if (seen.has(s) && seen.get(s) !== x.slug) return `"${s.slice(0, 50)}..." in ${seen.get(s)} and ${x.slug}`;
          seen.set(s, x.slug);
        }
      }
      return towns().length > 0 || 'no towns';
    } },
    { id: 'town-travel', pts: 5, desc: 'each town page shows its zones and fees from the config', run() {
      if (!towns().length) return 'no towns';
      for (const x of towns()) {
        const local = text(cityRegion(read(`${x.slug}.html`), 'local'));
        for (const z of new Set(x.zips.map((zip) => C.ZIP_ZONES[zip]).filter(Boolean).map((r) => `${r.label}|${r.cents}`))) {
          const [label, cents] = z.split('|');
          const fee = +cents ? fmt(+cents) : 'no travel charge';
          if (!local.includes(label) || !local.toLowerCase().includes(fee.toLowerCase())) return `${x.slug}: no "${label}" with "${fee}"`;
        }
      }
      return true;
    } },
    { id: 'hub', pts: 5, desc: 'hub links every town by zone; homepage zone list links towns', run() {
      const hub = read('service-areas.html');
      if (!hub) return 'service-areas.html missing';
      for (const x of towns()) if (!hub.includes(`href="${x.slug}.html"`)) return `hub does not link ${x.slug}`;
      const list = byId(read('index.html'), 'zoneList');
      if (!list || !/href="[a-z-]+\.html"/.test(list.inner)) return 'homepage zone list has no town links';
      return towns().length > 0 || 'no towns';
    } },
    { id: 'standalone', pts: 10, desc: 'FAQ 14+ questions on the topics people ask; terms and privacy sections; 404 links work from any depth', run() {
      const faq = read('faq.html'), terms = read('terms.html'), priv = read('privacy.html'), nf = read('404.html');
      if (!faq || !terms || !priv || !nf) return 'a standalone page is missing';
      const q = (faq.match(/<summary/g) || []).length;
      if (q < 14) return `FAQ has ${q} questions`;
      const ft = visibleText(faq).toLowerCase();
      for (const k of ['travel', 'zone', 'photo', 'more than', "can't take", 'home', 'pay', 'cancel']) if (!ft.includes(k)) return `FAQ never says "${k}"`;
      const th = [...terms.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1]).toLowerCase()).join(' | ');
      for (const k of ['who we are', 'where we work', 'prices', 'paying', 'cancel', 'refund', 'responsible', 'messages']) if (!th.includes(k)) return `terms has no "${k}" section (${th.slice(0, 80)})`;
      const ph = [...priv.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1]).toLowerCase()).join(' | ');
      for (const k of ['what we collect', 'photos', 'how we use', 'who we share', 'your choices', 'questions']) if (!ph.includes(k)) return `privacy has no "${k}" section`;
      const rel = [...nf.matchAll(/\shref="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|tel:|mailto:|#)/.test(u));
      if (rel.some((u) => !u.startsWith('/'))) return `404 has relative links: ${rel.filter((u) => !u.startsWith('/')).slice(0, 3).join(', ')}`;
      return run('node', ['scripts/check-meta.mjs']).code === 0 || 'check-meta fails';
    } },
    { id: 'copy', pts: 10, desc: 'no dashes as punctuation, slang, or leftover dog or Scoops words in what visitors read', run() {
      for (const f of round2Pages()) {
        const t = visibleText(read(f));
        const m = t.match(/[—–]/) || t.match(/\b(okay|gonna|honestly|a lot of|figure (it )?out)\b/i) || t.match(/\b(dogs?|poop|pooper|scoop(s|ed|ing|er)?|Scoops)\b/i);
        if (m) return `${f}: "${t.slice(Math.max(0, m.index - 30), m.index + 30)}"`;
      }
      return round2Pages().length > 6 || 'pages missing';
    } },
    { id: 'links', pts: 5, desc: 'every relative link and anchor on the new pages resolves', run() {
      const idsOf = new Map();
      const ids = (f) => { if (!idsOf.has(f)) idsOf.set(f, new Set([...(read(f) || '').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))); return idsOf.get(f); };
      for (const f of round2Pages()) {
        for (const m of (read(f) || '').matchAll(/\s(?:href|src)="([^"]+)"/g)) {
          const u = m[1].replace(/&amp;/g, '&');
          if (/^(https?:|tel:|mailto:|data:|javascript:)/.test(u) || u.startsWith('/_vercel/') || u.startsWith('/api/') || u.includes('${')) continue;
          const [p0, hash] = u.split('#');
          const p = p0.split('?')[0];
          const target = !p ? f : p.startsWith('/') ? p.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(f), p));
          if (p && !exists(target)) return `${f}: ${u} not found`;
          if (hash && target.endsWith('.html') && !ids(target).has(hash)) return `${f}: #${hash} not on ${target}`;
        }
      }
      return true;
    } },
    { id: 'mobile', pts: 5, desc: '360px on FAQ, terms, an Oregon town, a Washington town, the hub: no sideways scroll, text 16px+, taps 48px+', async run() {
      if (!CHROME) return 'no Chrome to measure with';
      const t = towns();
      const or = t.find((x) => x.state === 'OR' && x.slug !== 'gresham'), wa = t.find((x) => x.state === 'WA');
      if (!or || !wa) return 'needs an Oregon and a Washington town';
      for (const f of ['faq.html', 'terms.html', `${or.slug}.html`, `${wa.slug}.html`, 'service-areas.html']) {
        if (!exists(f)) return `${f} missing`;
        const p = probeOf(await dump(`/${f}?__probe=2`));
        if (!p) return `${f}: page did not report`;
        if (p.error) return `${f}: ${p.error}`;
        if (p.vw !== 360) return `${f}: measured at ${p.vw}px`;
        if (p.sw > p.vw) return `${f}: ${p.sw}px wide in a ${p.vw}px window`;
        if (p.small.length) return `${f}: small text ${p.small.slice(0, 2).join('; ')}`;
        if (p.taps.length) return `${f}: small taps ${p.taps.slice(0, 2).join('; ')}`;
      }
      return true;
    } },
    { id: 'site-js', pts: 5, desc: 'analytics on every public page, the maintenance banner loaded, checkout reads SITE_REOPEN_TEXT', run() {
      if (!/G-XXXXXXXXXX/.test(read('js/analytics.js') || '')) return 'js/analytics.js missing';
      if (!exists('js/maintenance-banner.js')) return 'js/maintenance-banner.js missing';
      for (const f of round2Pages()) {
        const s = read(f);
        if (!/analytics\.js/.test(s) && !/gtag\/js\?id=/.test(s)) return `${f} has no analytics`;
        if (f !== '404.html' && !/maintenance-banner\.js/.test(s)) return `${f} does not load the banner`;
      }
      const co = read('book/checkout.html') || '';
      return (/SITE_REOPEN_TEXT/.test(co) && !/SCOOPS_REOPEN_TEXT/.test(co)) || 'checkout still reads SCOOPS_REOPEN_TEXT';
    } },
  ],
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
  try { r = NO_EARLIER && c.id === 'earlier' ? true : await c.run(); } catch (e) { r = `threw: ${e.message}`; }
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
