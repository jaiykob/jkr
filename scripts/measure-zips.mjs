/**
 * node scripts/measure-zips.mjs
 *
 * Measures road miles from BASE (pricing.config.mjs) to every Oregon and
 * Washington ZIP near the Portland metro, and writes data/zip-miles.mjs.
 * Run it once, and again only if BASE moves. Nothing at booking time calls a
 * map service: the zones are read from the file this writes.
 *
 * Sources:
 *   ZIP centers   GeoNames US postal codes, download.geonames.org/export/zip
 *                 (CC BY 4.0). One point per ZIP: where its post office area
 *                 centers, not every street in it.
 *   Road miles    the OSRM public routing server (router.project-osrm.org),
 *                 driving distance from BASE to each ZIP center.
 *
 * Kept: ZIPs within STRAIGHT_MAX straight line miles, then within ROAD_MAX
 * road miles. ROAD_MAX is past the last zone on purpose, so widening a zone
 * in the config needs no re-run. A ZIP the router can't reach gets straight
 * line miles × 1.3 and `est: true`.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BASE } from '../pricing.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/zip-miles.mjs');
const STATES = ['OR', 'WA'];
const STRAIGHT_MAX = 50;
const ROAD_MAX = 45;
const BATCH = 80;
const M_PER_MILE = 1609.344;

function haversineMiles(a, b) {
  const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The bytes of one file inside a zip, read through the central directory. */
function unzipEntry(buf, name) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entry = buf.toString('utf8', p + 46, p + 46 + nLen);
    if (entry === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nLen + xLen + cLen;
  }
  throw new Error(`${name} not in zip`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function roadMiles(points) {
  const coords = [`${BASE.lon},${BASE.lat}`, ...points.map((p) => `${p.lon},${p.lat}`)].join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': 'jkr-measure-zips (one-time build script)' } });
    if (r.ok) {
      const j = await r.json();
      if (j.code !== 'Ok') throw new Error(`OSRM: ${j.code} ${j.message || ''}`);
      return j.distances[0].slice(1).map((m) => (m == null ? null : m / M_PER_MILE));
    }
    await sleep(2000 * attempt);
  }
  throw new Error('OSRM did not answer');
}

const zipRes = await fetch('https://download.geonames.org/export/zip/US.zip');
if (!zipRes.ok) throw new Error(`GeoNames: HTTP ${zipRes.status}`);
const rows = unzipEntry(Buffer.from(await zipRes.arrayBuffer()), 'US.txt').toString('utf8').split('\n');

const near = [];
for (const line of rows) {
  const f = line.split('\t');
  if (f.length < 11 || !STATES.includes(f[4])) continue;
  const p = { zip: f[1], place: f[2], state: f[4], county: f[5].replace(/ County$/, ''), lat: +f[9], lon: +f[10] };
  if (!/^\d{5}$/.test(p.zip) || !Number.isFinite(p.lat)) continue;
  p.straight = haversineMiles(BASE, p);
  if (p.straight <= STRAIGHT_MAX) near.push(p);
}
console.log(`measure-zips: ${near.length} ZIPs within ${STRAIGHT_MAX} straight line miles; asking the router`);

for (let i = 0; i < near.length; i += BATCH) {
  const batch = near.slice(i, i + BATCH);
  const miles = await roadMiles(batch);
  batch.forEach((p, k) => {
    if (miles[k] == null) { p.miles = p.straight * 1.3; p.est = true; } else p.miles = miles[k];
  });
  await sleep(1100);   // the public router asks for one request a second
}

const kept = near.filter((p) => p.miles <= ROAD_MAX).sort((a, b) => a.miles - b.miles || a.zip.localeCompare(b.zip));
const day = new Date().toISOString().slice(0, 10);
const body = kept.map((p) => `    ${JSON.stringify(p.zip)}: ${JSON.stringify({
  place: p.place, state: p.state, county: p.county, miles: Math.round(p.miles * 10) / 10, ...(p.est ? { est: true } : {}),
})},`).join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `/**
 * GENERATED by \`node scripts/measure-zips.mjs\` on ${day}. Do not edit by hand:
 * to move one ZIP to another zone, use ZONE_OVERRIDES in pricing.config.mjs.
 *
 * Road miles from BASE to the center of each ZIP, nearest first.
 * ZIP centers: GeoNames (CC BY 4.0). Road miles: OSRM public router.
 * est: true means the router could not reach it (straight line × 1.3).
 */
export default {
  base: ${JSON.stringify(BASE)},
  source: 'GeoNames US postal codes; OSRM driving distance',
  measuredAt: '${day}',
  zips: {
${body}
  },
};
`);
const by = (s) => kept.filter((p) => p.state === s).length;
console.log(`measure-zips: wrote ${kept.length} ZIPs (OR ${by('OR')}, WA ${by('WA')}) within ${ROAD_MAX} road miles to data/zip-miles.mjs`);
