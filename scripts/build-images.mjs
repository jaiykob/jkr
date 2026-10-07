/**
 * Turns real photos into the sizes the site serves.
 *
 *   node scripts/build-images.mjs          # make sizes for any new or changed photo
 *   node scripts/build-images.mjs --check  # verify only, non-zero if a photo has no sizes (npm test)
 *   (--src <dir> --out <dir> for tests)
 *
 * Put a photo in images/src/ (a phone photo is fine: a garage before and
 * after, the truck, a loaded haul). The build writes images/photos/<name>-480,
 * -960 and -1440 as WebP and JPEG (never larger than the original), for use
 * with <img srcset>. Carried over from Scoops Co.'s image pipeline, so real
 * photos can replace images/placeholder.svg without a 4000 pixel, 5 MB file
 * landing on a phone.
 *
 * Drawn in headless Chrome (scripts/lib/browser.mjs) rather than an image
 * library: no new dependency. images/photos/manifest.json fingerprints each
 * source, so --check knows a photo is new or changed without decoding it.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openBrowser } from './lib/browser.mjs';
import { serve } from './lib/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? path.resolve(args[args.indexOf(k) + 1]) : d);
const SRC = arg('--src', path.join(ROOT, 'images/src'));
const OUT = arg('--out', path.join(ROOT, 'images/photos'));
const MANIFEST = path.join(OUT, 'manifest.json');
const check = args.includes('--check');
const WIDTHS = [480, 960, 1440];
const PHOTO = /\.(jpe?g|png|webp|svg)$/i;

const sources = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((f) => PHOTO.test(f)).sort() : [];
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const nameOf = (f) => path.basename(f, path.extname(f)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const hashOf = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(SRC, f))).digest('hex').slice(0, 16);
const outputsOf = (name, sizes) => sizes.flatMap((w) => [`${name}-${w}.webp`, `${name}-${w}.jpg`]);

const stale = sources.filter((f) => {
  const m = manifest[nameOf(f)];
  return !m || m.hash !== hashOf(f) || !outputsOf(nameOf(f), m.sizes).every((o) => fs.existsSync(path.join(OUT, o)));
});
const gone = Object.keys(manifest).filter((n) => !sources.some((f) => nameOf(f) === n));

if (check) {
  if (stale.length || gone.length) {
    console.error(`build-images --check: run npm run build:images.${stale.length ? `\n  new or changed: ${stale.join(', ')}` : ''}${gone.length ? `\n  source gone: ${gone.join(', ')}` : ''}`);
    process.exit(1);
  }
  console.log(`build-images --check: OK, ${sources.length} photo(s) have every size`);
  process.exit(0);
}

if (stale.length) {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve({ '/__resize.html': () => '<!doctype html><meta charset="utf-8"><body></body>' }, SRC);
  const browser = await openBrowser();
  if (!browser) { srv.close(); console.error('build-images: Chrome not found; the pipeline needs it to resize'); process.exit(1); }
  try {
    for (const f of stale) {
      const p = await browser.page({ width: 800, height: 600 });
      await p.goto(`${srv.origin}/__resize.html`, 100);
      const res = await p.evaluate(`(async () => {
        const img = new Image();
        img.src = ${JSON.stringify('/' + encodeURIComponent(f))};
        await img.decode();
        const W = img.naturalWidth, H = img.naturalHeight, out = [];
        for (const w of ${JSON.stringify(WIDTHS)}.filter((w, i) => w <= W || i === 0)) {
          const width = Math.min(w, W), height = Math.round(H * width / W);
          const c = document.createElement('canvas'); c.width = width; c.height = height;
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
          g.fillStyle = '#fff'; g.fillRect(0, 0, width, height);   // JPEG has no transparency
          g.drawImage(img, 0, 0, width, height);
          out.push({ w, webp: c.toDataURL('image/webp', 0.8), jpg: c.toDataURL('image/jpeg', 0.82) });
        }
        return { W, H, out };
      })()`);
      const name = nameOf(f);
      for (const o of res.out) {
        fs.writeFileSync(path.join(OUT, `${name}-${o.w}.webp`), Buffer.from(o.webp.split(',')[1], 'base64'));
        fs.writeFileSync(path.join(OUT, `${name}-${o.w}.jpg`), Buffer.from(o.jpg.split(',')[1], 'base64'));
      }
      manifest[name] = { source: f, hash: hashOf(f), width: res.W, height: res.H, sizes: res.out.map((o) => o.w) };
      await p.close();
    }
  } finally { await browser.close(); srv.close(); }
}
for (const n of gone) {
  for (const o of outputsOf(n, manifest[n].sizes)) fs.rmSync(path.join(OUT, o), { force: true });
  delete manifest[n];
}
if (stale.length || gone.length || !fs.existsSync(MANIFEST)) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + '\n');
}
console.log(stale.length ? `build-images: made sizes for ${stale.join(', ')}` : `build-images: ${sources.length} photo(s) already current`);
