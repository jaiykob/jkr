import { createRequire } from 'node:module';
import fs from 'node:fs';
import { PRICES, ONE_TIME_COL, LOADS, SCHEDULE, POLICY } from '../pricing.config.mjs';
const require = createRequire(import.meta.url);
const O = require('../api/_lib/order-config.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

console.log('== copies ==');
ok(fs.readFileSync('api/_lib/order-config.js', 'utf8') === fs.readFileSync('js/order-config.js', 'utf8'), 'the two copies differ');
ok(O.SIZES.length === PRICES.length && O.SIZES.every((s, i) => s.cents === PRICES[i][ONE_TIME_COL]), 'size prices drift from PRICES');

console.log('== sizes ==');
for (const s of O.SIZES) { ok(O.sizeForUnits(s.fits) === s.row, `fits edge ${s.fits}`); }
ok(O.sizeForUnits(101) === null, 'over a full truck must be quoted by hand');
ok(O.totalFor(2, 2500) === PRICES[2][ONE_TIME_COL] + 2500, 'totalFor');

console.log('== days ==');
// 2026-10-13 23:30 UTC is Tue 16:30 PDT; 2026-10-14 06:30 UTC is still Tue 23:30 PDT
ok(O.todayPacific(Date.UTC(2026, 9, 14, 6, 30)) === '2026-10-13', 'UTC rolled the Pacific day over');
const days = O.openDays(Date.UTC(2026, 9, 14, 6, 30));   // Pacific today is 2026-10-13
const want = [];
for (let i = 0; i < SCHEDULE.daysAhead; i++) {
  const d = new Date(Date.UTC(2026, 9, 13 + SCHEDULE.leadDays + i));
  if (!SCHEDULE.closedWeekdays.includes(d.getUTCDay())) want.push(d.toISOString().slice(0, 10));
}
ok(JSON.stringify(days.map((d) => d.date)) === JSON.stringify(want), `open days ${days.map((d) => d.date)}`);
ok(!days.some((d) => SCHEDULE.closedWeekdays.includes(d.weekday)), 'a closed weekday is offered');
ok(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}$/.test(days[0].label), `label ${days[0].label}`);

console.log('== windows and DST ==');
// 8 am PDT on 2026-10-31 is 15:00 UTC; 8 am PST on 2026-11-02 is 16:00 UTC (DST ends 2026-11-01)
ok(O.windowStartMs('2026-10-31', 'w08') === Date.UTC(2026, 9, 31, 15, 0), 'PDT window start');
ok(O.windowStartMs('2026-11-02', 'w08') === Date.UTC(2026, 10, 2, 16, 0), 'PST window start');
ok(!O.isBookable('2026-10-14', 'w99', Date.UTC(2026, 9, 13, 12)), 'unknown window bookable');

console.log('== late cancel ==');
const start = O.windowStartMs('2026-10-20', 'w10');
ok(!O.isLateCancel('2026-10-20', 'w10', start - POLICY.cancelHours * 3600000 - 1), 'early cancel charged');
ok(O.isLateCancel('2026-10-20', 'w10', start - POLICY.cancelHours * 3600000), 'late cancel free');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
