/**
 * npm test: every page has a title of at most 62 characters, a description of
 * 100 to 160, og tags that match them, no dashes, and nothing duplicated.
 * Carried over from Scoops Co., where these rules caught real mistakes.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const SKIP = new Set(['node_modules', '.git', '.vercel', 'api', 'scripts']);

function pages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? pages(p) : e.name.endsWith('.html') ? [p] : [];
  });
}

const attr = (h, re) => (h.match(re) || [])[1] ?? null;
const problems = [];
const seenT = new Map(), seenD = new Map();

for (const file of pages(ROOT)) {
  const f = path.relative(ROOT, file);
  const h = fs.readFileSync(file, 'utf8');
  // Pages Google is told to skip (checkout, thanks) never show a snippet.
  if (/<meta name="robots" content="noindex/.test(h)) continue;
  const t = attr(h, /<title>([^<]*)<\/title>/);
  const d = attr(h, /<meta name="description" content="([^"]*)"/);
  const ot = attr(h, /<meta property="og:title" content="([^"]*)"/);
  const od = attr(h, /<meta property="og:description" content="([^"]*)"/);
  if (!t) { problems.push(`${f}: no <title>`); continue; }
  if (!d) { problems.push(`${f}: no meta description`); continue; }
  if ([...t].length > 62) problems.push(`${f}: title is ${[...t].length} chars (max 62)`);
  const n = [...d].length;
  if (n < 100 || n > 160) problems.push(`${f}: description is ${n} chars (want 100 to 160)`);
  if (ot !== null && ot !== t) problems.push(`${f}: og:title differs from <title>`);
  if (od !== null && od !== d) problems.push(`${f}: og:description differs from the description`);
  if (/[—–]/.test(t + d)) problems.push(`${f}: dash in title or description`);
  if (seenT.has(t)) problems.push(`${f}: same title as ${seenT.get(t)}`); else seenT.set(t, f);
  if (seenD.has(d)) problems.push(`${f}: same description as ${seenD.get(d)}`); else seenD.set(d, f);
}

if (problems.length) {
  console.error(`check-meta: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('check-meta: OK');
