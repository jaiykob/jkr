// Verifies api/_lib/schedule.js — the visit-cadence math that decides when a
// customer actually gets served. Not covered by `npm run check:pricing`
// (that only checks generated price/ZIP blocks) and not exercisable without a
// live charge, so it gets asserted directly.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const s = require(path.join(ROOT, 'api/_lib/schedule.js'));
const cfg = await import(new URL('../pricing.config.mjs', import.meta.url));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };
const WD = s.WEEKDAYS;

console.log('== 1. Column indexes: schedule.js CADENCE vs pricing.config COLUMNS ==');
ok(cfg.COLUMNS.length === s.CADENCE.length,
   `column count mismatch: config ${cfg.COLUMNS.length} vs CADENCE ${s.CADENCE.length}`);
// recurring-ness must agree column for column
cfg.COLUMNS.forEach((name, i) => {
  const cfgRecurring = Boolean(cfg.BILLING[name].stripe);
  ok(cfgRecurring === s.isRecurring(i), `col ${i} (${name}): config recurring=${cfgRecurring} vs schedule=${s.isRecurring(i)}`);
});

console.log('== 2. firstVisitDate lands on the chosen weekday with >=2 days lead ==');
for (const from of ['2026-08-14', '2026-08-15', '2026-08-16', '2026-12-30']) {
  for (let fi = 0; fi < cfg.COLUMNS.length; fi++) {
    for (const wd of WD) {
      const d = s.firstVisitDate({ freqIdx: fi, weekday: wd, from: new Date(`${from}T12:00:00Z`) });
      const got = WD[s.parseDateStr(d).getUTCDay()];
      ok(got === wd, `fi=${fi} from ${from} want ${wd} got ${got} (${d})`);
      const lead = (s.parseDateStr(d) - s.parseDateStr(from)) / 86400000;
      ok(lead >= 2, `fi=${fi} ${wd} from ${from}: lead only ${lead}d (${d})`);
      ok(lead <= 8, `fi=${fi} ${wd} from ${from}: lead ${lead}d is more than a week out (${d})`);
    }
  }
}

// Columns are read from the config, never hardcoded: an index literal is how
// Scoops Co. once sent a weekly customer to the one-time plan.
const RECURRING_COLS = cfg.COLUMNS.map((_, i) => i).filter((i) => s.isRecurring(i));
const ONE_TIME_COLS  = cfg.COLUMNS.map((_, i) => i).filter((i) => !s.isRecurring(i));

console.log('== 3. Recurrence keeps the customer on their weekday ==');
for (const fi of RECURRING_COLS) {
  for (const wd of WD) {
    let d = s.firstVisitDate({ freqIdx: fi, weekday: wd, from: new Date('2026-01-05T12:00:00Z') });
    for (let n = 0; n < 26; n++) {
      d = s.nextVisitDate({ freqIdx: fi, afterDate: d });
      const got = WD[s.parseDateStr(d).getUTCDay()];
      ok(got === wd, `fi=${fi} drifted off ${wd} to ${got} at step ${n} (${d})`);
    }
  }
}

console.log('== 4. Visit count per year matches invoice count per year ==');
// visits a year = 52 / weeks per period (monthly -> 12, by the 4-4-5 rule)
for (const fi of RECURRING_COLS) {
  for (const wd of ['Monday', 'Wednesday', 'Saturday']) {
    for (const yr of [2026, 2027]) {
      let d = s.firstVisitDate({ freqIdx: fi, weekday: wd, from: new Date(`${yr - 1}-12-20T12:00:00Z`) });
      // advance into the target year
      while (s.parseDateStr(d).getUTCFullYear() < yr) d = s.nextVisitDate({ freqIdx: fi, afterDate: d });
      let count = 0;
      const months = new Map();
      while (s.parseDateStr(d).getUTCFullYear() === yr) {
        count++;
        const mo = s.parseDateStr(d).getUTCMonth();
        months.set(mo, (months.get(mo) || 0) + 1);
        d = s.nextVisitDate({ freqIdx: fi, afterDate: d });
      }
      const want = Math.round(52 / cfg.BILLING_BY_COL[fi].weeks);
      ok(Math.abs(count - want) <= 1, `fi=${fi} ${wd} ${yr}: ${count} visits, expected ~${want}`);
      if (cfg.BILLING_BY_COL[fi].stripe.interval === 'month') {
        const bad = [...months.entries()].filter(([, c]) => c !== 1);
        ok(bad.length === 0, `fi=${fi} (monthly) ${wd} ${yr}: months with != 1 visit: ${JSON.stringify(bad)}`);
      }
    }
  }
}

console.log('== 5. One-time never recurs ==');
ok(ONE_TIME_COLS.includes(cfg.ONE_TIME_COL), 'ONE_TIME_COL is not a one-time column in schedule.js');
for (const fi of ONE_TIME_COLS) {
  ok(s.nextVisitDate({ freqIdx: fi, afterDate: '2026-08-20' }) === null, `one-time col ${fi} produced a next visit`);
}

console.log('== 6. Quarterly prepay math: config vs server formula ==');
const WEEKS_PER_QUARTER = 13, DISC = 0.10;
for (let row = 0; row < cfg.PRICES.length; row++) {
  for (let col = 0; col < cfg.PRICES[0].length; col++) {
    const weeks = cfg.BILLING_BY_COL[col].weeks;
    if (!weeks) continue;
    const server = Math.round((cfg.PRICES[row][col] / weeks) * WEEKS_PER_QUARTER * (1 - DISC));
    ok(server === cfg.quarterlyCents(row, col),
       `quarter mismatch row ${row} col ${col}: server ${server} vs config ${cfg.quarterlyCents(row, col)}`);
    // a quarter must never cost more than paying per period for 13 weeks
    const undiscounted = (cfg.PRICES[row][col] / weeks) * WEEKS_PER_QUARTER;
    ok(server < undiscounted, `quarter row ${row} col ${col} not actually discounted`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
