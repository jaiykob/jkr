// The image pipeline and the domain swap, on throwaway copies. Needs Chrome
// for the image half (it is how the pipeline resizes).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { swapDomain } from './set-domain.mjs';
import { CHROME } from './lib/browser.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const node = (...a) => spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8' });

console.log('== domain swap ==');
const before = 'you@example.com hello@example.com https://www.example.com/x https://example.com/y ok';
const after = swapDomain(before, 'example.com', 'brand.com');
ok(after.includes('you@example.com'), 'a placeholder email moved');
ok(after.includes('hello@brand.com') && after.includes('https://www.brand.com/x') && after.includes('https://brand.com/y'), `the site address did not move: ${after}`);
ok(swapDomain(after, 'example.com', 'brand.com') === after, 'swapping twice changed something');

console.log('== images ==');
if (!CHROME) { console.log('  skipped: no Chrome on this machine (the pipeline resizes in Chrome)'); console.log(`
${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jkr-img-'));
const src = path.join(tmp, 'src'), out = path.join(tmp, 'out');
fs.mkdirSync(src);
// A 1600 by 900 test photo (an SVG is enough: the pipeline draws whatever Chrome can show).
fs.writeFileSync(path.join(src, 'Garage Before.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#15171A"/><rect x="200" y="200" width="1200" height="500" fill="#FFD23F"/></svg>');
let r = node('scripts/build-images.mjs', '--src', src, '--out', out);
ok(r.status === 0, `build failed: ${r.stderr || r.stdout}`);
const files = fs.existsSync(out) ? fs.readdirSync(out).sort() : [];
for (const w of [480, 960, 1440]) for (const ext of ['webp', 'jpg']) ok(files.includes(`garage-before-${w}.${ext}`), `no garage-before-${w}.${ext}`);
const jpgWidth = (f) => { const b = fs.readFileSync(f); for (let i = 2; i < b.length - 9; i++) if (b[i] === 0xFF && (b[i + 1] === 0xC0 || b[i + 1] === 0xC2)) return b.readUInt16BE(i + 7); return 0; };
if (files.includes('garage-before-960.jpg')) ok(jpgWidth(path.join(out, 'garage-before-960.jpg')) === 960, 'the 960 JPEG is not 960 wide');
r = node('scripts/build-images.mjs', '--src', src, '--out', out, '--check');
ok(r.status === 0, 'a fresh build is not current');
fs.writeFileSync(path.join(src, 'Garage Before.svg'), fs.readFileSync(path.join(src, 'Garage Before.svg'), 'utf8').replace('#FFD23F', '#C62828'));
r = node('scripts/build-images.mjs', '--src', src, '--out', out, '--check');
ok(r.status === 1, 'a changed photo was not caught');
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
