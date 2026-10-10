/**
 * Brand Name — visit scheduling math (pure functions, no I/O).
 *
 * Turns a booking's cadence (freq_idx + chosen weekday) into concrete visit
 * dates. Every recurring plan is anchored on the customer's pickup weekday,
 * so no cadence here is allowed to drift a customer off the day they were
 * promised. (One time hauls book a date and a window on the order page;
 * capacity is per window: SCHEDULE in pricing.config.mjs.)
 *
 * freq_idx columns (mirror COLUMNS in pricing.config.mjs and PRICES in
 * create-booking.js):
 *   0 = one-time haul, 1 = monthly pickup
 * Add a column there and a matching CADENCE entry here, in the same position.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Cadence by freq_idx. `days` steps a fixed number of days; `months` steps a
 * calendar month and then snaps back onto the customer's route weekday.
 *
 * Monthly is a CALENDAR month, not 28 days, deliberately: Stripe bills it on a
 * monthly interval, and a 28-day visit cycle would deliver 13 visits a year
 * against 12 charges — an ~8% margin leak that nobody would notice for a year.
 * Stepping the calendar and snapping to the nearest matching weekday keeps the
 * visit count and the invoice count equal while preserving the route day.
 */
const CADENCE = [
  null,            // 0 one-time haul, no recurrence
  { months: 1 },   // 1 monthly pickup
];

// Nominal days between visits, for lead-time estimates only. Real recurrence
// goes through nextVisitDate, which handles the calendar-month case exactly.
function intervalDays(freqIdx) {
  const c = CADENCE[Number(freqIdx)];
  if (!c) return 0;
  return c.days || Math.round(c.months * 30);
}

function isRecurring(freqIdx) {
  return Boolean(CADENCE[Number(freqIdx)]);
}

// YYYY-MM-DD in UTC (visits.scheduled_date is a DATE; keep it tz-stable).
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function parseDateStr(s) {
  // Treat a bare YYYY-MM-DD as a UTC midnight date.
  return new Date(`${s}T00:00:00.000Z`);
}

function weekdayIndex(name) {
  if (name == null) return -1;
  const i = WEEKDAYS.findIndex((w) => w.toLowerCase() === String(name).trim().toLowerCase());
  return i;
}

/**
 * First visit date for a new booking. Next occurrence of the chosen weekday at
 * least `minLeadDays` out (default 2) so there's buffer to plan a route. Falls
 * back to today + interval (or today + 3) when no usable weekday is given.
 *
 * @returns {string|null} YYYY-MM-DD, or null for one-time with no weekday.
 */
function firstVisitDate({ freqIdx, weekday, from = new Date(), minLeadDays = 2 }) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const wIdx = weekdayIndex(weekday);

  if (wIdx >= 0) {
    const d = new Date(start);
    // advance to the chosen weekday, ensuring at least minLeadDays of lead time
    do { d.setUTCDate(d.getUTCDate() + 1); }
    while (d.getUTCDay() !== wIdx || (d - start) / 86400000 < minLeadDays);
    return toDateStr(d);
  }

  // No weekday (e.g. one-time picked without a day, or odd data): give lead time.
  const fallback = new Date(start);
  const lead = isRecurring(freqIdx) ? Math.max(minLeadDays, intervalDays(freqIdx)) : minLeadDays + 1;
  fallback.setUTCDate(fallback.getUTCDate() + lead);
  return toDateStr(fallback);
}

/** Months since year 0 — lets two dates be compared by month across a year wrap. */
function monthIndex(d) {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/**
 * Next recurring visit date after a given date. Returns null for one-time.
 *
 * `afterDate` is the previous visit, which already sits on the customer's route
 * weekday — so the weekday is read back off it rather than threaded through
 * every caller (api/cron-visits.js has no other way to know it).
 *
 * MONTHLY is the interesting case. It must satisfy three things at once:
 * stay on the customer's weekday, land exactly once per calendar month, and
 * therefore total 12 visits a year to match 12 monthly invoices. Same-weekday
 * dates are 7 days apart and a month averages 30.44, so no fixed step can do
 * it: 28 days gives 13 visits a year (an ~8% margin leak) and 35 gives ~10.4
 * (under-delivering). Stepping a calendar month and snapping to the nearest
 * weekday fails too — the residual rounds the same direction every time and
 * drifts a full visit over a year.
 *
 * The rule that works: step 4 weeks, and if that lands back in the month we
 * started in, step 5 instead. That yields a 4-4-5-week cycle, one visit per
 * calendar month, always on the same weekday, 12 a year.
 */
function nextVisitDate({ freqIdx, afterDate }) {
  const c = CADENCE[Number(freqIdx)];
  if (!c || !afterDate) return null;

  const d = parseDateStr(afterDate);
  if (c.days) {
    d.setUTCDate(d.getUTCDate() + c.days);
    return toDateStr(d);
  }

  const startMonth = monthIndex(d);
  d.setUTCDate(d.getUTCDate() + 28);
  if (monthIndex(d) === startMonth) d.setUTCDate(d.getUTCDate() + 7);
  return toDateStr(d);
}

module.exports = {
  WEEKDAYS,
  CADENCE,
  intervalDays,
  isRecurring,
  toDateStr,
  parseDateStr,
  weekdayIndex,
  firstVisitDate,
  nextVisitDate,
};
