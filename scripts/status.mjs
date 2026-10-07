#!/usr/bin/env node
/**
 * Launch status: what is actually done, checked rather than remembered.
 *
 *   npm run status
 *
 * Carried over from Scoops Co.'s prober, which stopped LAUNCH-DAY.md's
 * checkmarks from drifting from the truth. Two halves:
 *
 *   Local (always): placeholders still in the code, the three booking gates,
 *   the guess flags, the not-booking-yet banner.
 *   Live (once there is a domain): the site and its www redirect, the API is
 *   deployed and guarded, the sitemap and robots answer, and the Resend DNS
 *   records resolve.
 *
 * With no domain yet it says so and reports the local half. Exit code is
 * always 0: this is a report, not a gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveTxt } from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import site from '../api/_lib/site.js';
import { GUESS } from '../pricing.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };
const OK = '\x1b[32m', BAD = '\x1b[31m', WARN = '\x1b[33m', DIM = '\x1b[90m', R = '\x1b[0m';
const line = (state, label, detail) => console.log(`${state === 'done' ? `${OK}[done]${R}` : state === 'warn' ? `${WARN}[part]${R}` : `${BAD}[todo]${R}`} ${label.padEnd(26)} ${DIM}${detail}${R}`);

console.log(`\nLocal (the code in this folder)\n`);
const placeholders = [
  ['"Brand Name"', site.NAME === 'Brand Name', 'api/_lib/site.js, then npm run build'],
  ['the domain', !site.HAS_DOMAIN, 'node scripts/set-domain.mjs <domain>'],
  ['Stripe publishable key', /pk_test_REPLACE_ME/.test(read('book/checkout.html')), 'book/checkout.html'],
  ['Google Analytics ID', /G-XXXXXXXXXX/.test(read('js/analytics.js')), 'js/analytics.js and the three booking pages'],
  ['Supabase project', /YOUR-PROJECT\.supabase\.co/.test(read('js/leads.js')), 'js/leads.js'],
];
for (const [label, still, where] of placeholders) line(still ? 'todo' : 'done', label, still ? `placeholder: ${where}` : 'set');
const guesses = Object.entries(GUESS).filter(([, on]) => on).map(([k]) => k);
line(guesses.length ? 'todo' : 'done', 'Guesses', guesses.length ? `still guesses: ${guesses.join(', ')} (GUESSES.md)` : 'none');
const gate1 = /const BOOKINGS_OPEN_SERVER = true/.test(read('api/create-booking.js'));
const gate3 = /const BOOKINGS_OPEN_CLIENT = true/.test(read('book/checkout.html'));
line(gate1 && gate3 ? 'done' : gate1 || gate3 ? 'warn' : 'todo', 'Booking gates (code)', `server ${gate1 ? 'open' : 'closed'}, checkout ${gate3 ? 'open' : 'closed'}; the third is BOOKINGS_OPEN in Vercel`);
const banner = /var SHOW = true/.test(read('js/maintenance-banner.js'));
line(banner ? 'todo' : 'done', 'Not-booking-yet banner', banner ? 'showing (set SHOW = false at launch)' : 'off');

console.log(`\nLive (${site.SITE_URL})\n`);
if (!site.HAS_DOMAIN) {
  console.log(`No domain yet (${site.DOMAIN}): nothing live to check. Run node scripts/set-domain.mjs <domain> first.\n`);
  process.exit(0);
}
const get = async (url, opts = {}) => {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 8000);
  try { return await fetch(url, { redirect: 'manual', ...opts, signal: ac.signal }); }
  catch (e) { return { status: 0, headers: new Headers(), _err: e.message }; }
  finally { clearTimeout(t); }
};
const txt = async (name) => { try { return (await resolveTxt(name)).flat().join(' '); } catch { return null; } };

const home = await get(`${site.SITE_URL}/`);
line(home.status === 200 ? 'done' : 'todo', 'Site answers', `${site.SITE_URL}/: HTTP ${home.status || home._err}`);
const apex = await get(`https://${site.DOMAIN}/`);
const toWww = apex.status >= 300 && apex.status < 400 && (apex.headers.get('location') || '').startsWith(site.SITE_URL);
line(toWww ? 'done' : 'todo', 'Bare domain to www', `https://${site.DOMAIN}/: HTTP ${apex.status || apex._err} ${apex.headers.get('location') || ''}`);
const booking = await get(`${site.SITE_URL}/api/create-booking`);
line(booking.status === 405 ? 'done' : 'todo', 'API deployed', `GET /api/create-booking: HTTP ${booking.status} (405 means deployed)`);
const hook = await get(`${site.SITE_URL}/api/stripe-webhook`);
line(hook.status === 405 ? 'done' : 'todo', 'Stripe webhook route', `GET /api/stripe-webhook: HTTP ${hook.status} (405 means deployed; register it in Stripe)`);
const admin = await get(`${site.SITE_URL}/api/admin-data`);
line(admin.status === 401 ? 'done' : 'todo', 'Dashboard guarded', `GET /api/admin-data without a token: HTTP ${admin.status} (want 401)`);
const sm = await get(`${site.SITE_URL}/sitemap.xml`), rb = await get(`${site.SITE_URL}/robots.txt`);
line(sm.status === 200 && rb.status === 200 ? 'done' : 'todo', 'Sitemap and robots', `sitemap ${sm.status}, robots ${rb.status}`);
const [dkim, dmarc, spf] = await Promise.all([txt(`resend._domainkey.${site.DOMAIN}`), txt(`_dmarc.${site.DOMAIN}`), txt(`send.${site.DOMAIN}`)]);
line(dkim && dmarc && spf ? 'done' : 'todo', 'Resend DNS', dkim && dmarc && spf ? 'DKIM, DMARC and SPF resolve' : `missing: ${[!dkim && 'DKIM', !dmarc && 'DMARC', !spf && 'SPF'].filter(Boolean).join(', ')}`);
console.log('');
