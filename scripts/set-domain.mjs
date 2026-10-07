/**
 * Moves the whole site to its real domain in one command.
 *
 *   node scripts/set-domain.mjs brandhaul.com            # rewrite, then npm run build
 *   node scripts/set-domain.mjs --dry-run brandhaul.com  # count only, change nothing
 *   node scripts/set-domain.mjs --check                  # non-zero if hosts are mixed (npm test)
 *
 * The address lives in api/_lib/site.js, which every generator and API file
 * reads. This rewrites that file and every static file that names the domain
 * (pages, sitemap, robots, llms.txt, marketing, the helpers' context), then
 * rebuilds, so the generated pages pick it up from the source rather than a
 * search and replace.
 *
 * Kept as they are on purpose:
 *   - placeholder emails in forms and samples (you@example.com,
 *     sample@example.com): example.com is the reserved example domain, the
 *     right thing for a placeholder. Only hello@ and news@, the business's own
 *     addresses, move.
 *   - CLAUDE.md, LAUNCH-DAY.md, PROGRESS.md, PUNCHLIST.md, GUESSES.md, the
 *     plans and specs: they talk ABOUT the placeholder.
 *
 * After it runs: add www.<domain> in Vercel (primary) with the bare domain
 * redirecting to it, set SITE_ORIGIN, and point the Stripe webhook at
 * https://www.<domain>/api/stripe-webhook (LAUNCH-DAY.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import site from '../api/_lib/site.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', '.superpowers', '.claude', '.agents', 'docs', 'scripts', 'db', 'data']);
const SKIP_FILES = new Set(['CLAUDE.md', 'LAUNCH-DAY.md', 'PROGRESS.md', 'PUNCHLIST.md', 'GUESSES.md', 'content/towns/README.md']);
const OLD = site.DOMAIN;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The files that name the site's own domain. */
function files() {
  const out = ['api/_lib/site.js'];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && rel !== 'api') walk(rel); continue; }
      if (!/\.(html|xml|txt|md)$/.test(e.name) || SKIP_FILES.has(rel)) continue;
      out.push(rel);
    }
  };
  walk('');
  return out;
}

/** The business's own emails and every site URL move; placeholder emails stay. */
export function swapDomain(text, from, to) {
  const d = esc(from);
  return text
    .replace(new RegExp(`\\b([a-z0-9._%+-]+)@${d}\\b`, 'gi'), (m, local) => (/^(hello|news)$/i.test(local) ? `${local}@${to}` : m))
    .replace(new RegExp(`(?<![@\\w.-])((?:www\\.)?)${d}\\b`, 'g'), (m, www) => `${www}${to}`);
}
/** How many times the old domain is still named, placeholder emails aside. */
const left = (text, from) => (text.replace(new RegExp(`\\b[a-z0-9._%+-]+@${esc(from)}\\b`, 'gi'), '').match(new RegExp(`\\b${esc(from)}\\b`, 'g')) || []).length;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

function main() {
if (args[0] === '--check') {
  // Every self URL in what browsers and crawlers read must be https://www.<domain>.
  const bad = [];
  for (const f of files().filter((x) => /\.(html|xml|txt)$/.test(x))) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(new RegExp(`(https?)://(www\\.)?${esc(OLD)}\\b`, 'g'))) {
      if (m[1] !== 'https' || !m[2]) bad.push(`${f}: ${m[0]}`);
    }
  }
  if (bad.length) { console.error(`set-domain --check: ${bad.length} self URL(s) not on https://www.${OLD}:\n  ${bad.slice(0, 10).join('\n  ')}`); process.exit(1); }
  console.log(`set-domain --check: OK, every self URL is https://www.${OLD}`);
  process.exit(0);
}

const dry = args[0] === '--dry-run';
const to = (dry ? args[1] : args[0] || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(to)) {
  console.error('Usage: node scripts/set-domain.mjs [--dry-run] <domain>   e.g. brandhaul.com');
  process.exit(2);
}
if (to === OLD) { console.log(`set-domain: the site is already on ${OLD}`); process.exit(0); }

let changed = 0, remaining = 0;
for (const f of files()) {
  const abs = path.join(ROOT, f);
  const before = fs.readFileSync(abs, 'utf8');
  const after = swapDomain(before, OLD, to);
  remaining += left(after, OLD);
  if (after === before) continue;
  changed++;
  if (!dry) fs.writeFileSync(abs, after);
}
console.log(`set-domain${dry ? ' (dry run)' : ''}: ${OLD} -> ${to}: ${changed} files, ${remaining} left`);
if (dry) process.exit(remaining ? 1 : 0);

// Generated pages, the sitemap and the cards come from the source: rebuild.
const r = spawnSync('npm run build', { cwd: ROOT, stdio: 'inherit', shell: true });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`\nNext: add www.${to} in Vercel (primary, the bare domain redirecting to it), set SITE_ORIGIN=https://www.${to},\nand point the Stripe webhook at https://www.${to}/api/stripe-webhook (LAUNCH-DAY.md).`);
}
