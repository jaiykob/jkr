/**
 * Adds, replaces or removes the Google Search Console verification tag on
 * the homepage.
 *
 *   node scripts/set-gsc-token.mjs <token>   # set or replace
 *   node scripts/set-gsc-token.mjs --remove  # take it out
 *   node scripts/set-gsc-token.mjs --show    # print what is there now
 *
 * <token> is the content="..." value Google shows under "HTML tag"; pasting
 * the whole <meta> tag works too.
 *
 * Which verification to use (from Scoops Co.'s experience): a Domain property,
 * verified by a DNS TXT record at the registrar, covers www and the bare
 * domain in one place and is the better fit. Use this tag (a URL prefix
 * property on https://www.<domain>/) only if DNS verification is not
 * possible. The tag sits inside the homepage's CITY:head, so town pages do not
 * copy it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'index.html');
const arg = process.argv[2] || '';
const raw = fs.readFileSync(FILE, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
const TAG = /\n[ \t]*<meta name="google-site-verification" content="([^"]*)" \/>/;
const current = (s.match(TAG) || [])[1] || null;

if (arg === '--show' || !arg) {
  console.log(current ? `set-gsc-token: the homepage carries token ${current}` : 'set-gsc-token: no Search Console tag on the homepage');
  process.exit(0);
}
if (arg === '--remove') {
  s = s.replace(TAG, '');
} else {
  const token = (arg.match(/content="([^"]+)"/) || [])[1] || arg.trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) { console.error(`set-gsc-token: "${token}" does not look like a Search Console token`); process.exit(2); }
  const tag = `  <meta name="google-site-verification" content="${token}" />`;
  s = current ? s.replace(TAG, `\n${tag}`) : s.replace('  <meta name="theme-color" content="#15171A" />\n', `  <meta name="theme-color" content="#15171A" />\n${tag}\n`);
}
fs.writeFileSync(FILE, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log(arg === '--remove' ? 'set-gsc-token: removed' : 'set-gsc-token: set. Deploy, then press Verify in Search Console.');
