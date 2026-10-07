// Travel zones: every ZIP has one zone and a fee, the band edges, overrides,
// and the two emitted travel modules agree with the config for every ZIP.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ZONES, ZIP_ZONES, ALL_ZIPS, zoneForMiles, buildZipZones, travelFor,
} from '../pricing.config.mjs';
import MILES from '../data/zip-miles.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

console.log('== zones ==');
const last = ZONES[ZONES.length - 1];
ok(zoneForMiles(0) === ZONES[0].key, '0 miles is not the first zone');
ok(zoneForMiles(ZONES[0].upToMiles) === ZONES[0].key, 'a band edge does not belong to the inner zone');
ok(zoneForMiles(ZONES[0].upToMiles + 0.1) === ZONES[1].key, 'just past the first edge is not the second zone');
ok(zoneForMiles(last.upToMiles) === last.key, 'the outer edge is not in the last zone');
ok(zoneForMiles(last.upToMiles + 0.1) === null, 'past the last zone is still in the area');
ok(ALL_ZIPS.length >= 100, `only ${ALL_ZIPS.length} ZIPs in the area`);
ok(ALL_ZIPS.some((z) => ZIP_ZONES[z].state === 'WA'), 'no Washington ZIPs');
ok(ALL_ZIPS.every((z) => ZIP_ZONES[z].miles <= last.upToMiles), 'a ZIP past the last zone is in the area');
for (const z of ALL_ZIPS) {
  const r = ZIP_ZONES[z];
  ok(ZONES.some((x) => x.key === r.zone), `${z} has unknown zone ${r.zone}`);
  ok(Number.isInteger(r.cents) && r.cents >= 0, `${z} fee is not whole cents`);
}

console.log('== overrides ==');
const one = Object.keys(MILES.zips)[0];
const pinned = buildZipZones(MILES.zips, { [one]: last.key });
ok(pinned[one].zone === last.key, 'an override did not win over the miles');
let threw = false;
try { buildZipZones(MILES.zips, { [one]: 'nope' }); } catch { threw = true; }
ok(threw, 'an override naming an unknown zone did not fail the build');

console.log('== travel modules ==');
const a = fs.readFileSync(path.join(ROOT, 'api/_lib/travel.js'), 'utf8');
const b = fs.readFileSync(path.join(ROOT, 'js/travel.js'), 'utf8');
ok(a === b, 'api/_lib/travel.js and js/travel.js differ');
const T = require(path.join(ROOT, 'api/_lib/travel.js'));
for (const z of ALL_ZIPS) ok(JSON.stringify(T.travelFor(z)) === JSON.stringify(travelFor(z)), `module disagrees on ${z}`);
for (const z of ['90210', '', '9720', null, undefined, '972066']) ok(T.travelFor(z) === null, `module accepted ${z}`);
ok(T.travelFor(` ${ALL_ZIPS[0]} `) !== null, 'module refused a padded ZIP');
ok(T.ZONES.length === ZONES.length && T.ZONES.every((z, i) => z.cents === Math.round(ZONES[i].fee * 100)), 'module zones differ from the config');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
