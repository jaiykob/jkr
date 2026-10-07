/**
 * Tells Bing (and every other IndexNow engine) that pages exist or changed,
 * so they are crawled now instead of whenever.
 *
 *   npm run indexnow                 # submit every URL in sitemap.xml
 *   npm run indexnow -- <url> ...    # submit only these
 *   node scripts/indexnow.mjs --dry-run   # list what would be sent, send nothing
 *
 * Carried over from Scoops Co., where Bing had indexed none of the site after
 * weeks, and ChatGPT Search, Copilot and DuckDuckGo all draw on Bing's index.
 * Run it after a deploy that adds or changes pages. Google does not use
 * IndexNow; use Search Console for Google.
 *
 * The key is public by design: IndexNow proves we own the site by fetching
 * https://www.<domain>/<key>.txt, so that file (in the repo root) must stay
 * deployed. Until there is a real domain there is nothing to submit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../api/_lib/site.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = '928d69ae4f796deed6ce17c84a937770';
const HOST = new URL(site.SITE_URL).host;

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const given = args.filter((a) => a !== '--dry-run');
const urls = given.length ? given : [...fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

if (dry) {
  console.log(`indexnow (dry run): would send ${urls.length} URLs for ${HOST} with key ${KEY}:`);
  console.log(urls.join('\n'));
  process.exit(0);
}
if (!site.HAS_DOMAIN) {
  console.log(`indexnow: no domain yet (${site.DOMAIN}), nothing to submit. Run node scripts/set-domain.mjs <domain> first.`);
  process.exit(0);
}
if (!fs.existsSync(path.join(ROOT, `${KEY}.txt`))) { console.error(`indexnow: ${KEY}.txt is missing from the repo root`); process.exit(1); }

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
console.log(`indexnow: ${res.status} ${res.statusText} for ${urls.length} URLs`);
// 200 and 202 both mean accepted; 403 means the key file is not live yet.
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
