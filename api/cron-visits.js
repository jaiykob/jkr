/**
 * Vercel Serverless Function — cron-visits (scheduled daily)
 *
 * Two idempotent jobs, run once a day by Vercel Cron (see vercel.json):
 *   1. Reminders — email each customer the day before their visit (visitReminder),
 *      stamping reminder_sent_at so it never double-sends.
 *   2. Backfill  — ensure every active recurring subscription has a future
 *      scheduled visit (self-heals if a completion didn't queue the next one).
 *
 * AUTH: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET
 * is set. We require it when present; if unset we still run (so it works before
 * you add the secret) but log a warning. A `?token=` fallback is also accepted.
 *
 * Required env vars: SUPABASE_SERVICE_ROLE_KEY (+ RESEND_API_KEY for live emails).
 * Recommended: CRON_SECRET.
 */

const db = require('./_lib/db');
const { sendEmail } = require('./_lib/email');
const tpl = require('./_lib/email-templates');
const ORDER = require('./_lib/order-config');
const { nextVisitDate, firstVisitDate, toDateStr } = require('./_lib/schedule');

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.warn('[cron-visits] CRON_SECRET not set — endpoint is unauthenticated. Set one.'); return true; }
  const auth = req.headers['authorization'] || '';
  if (auth === `Bearer ${secret}`) return true;
  try { if (new URL(req.url, 'http://x').searchParams.get('token') === secret) return true; } catch { /* ignore */ }
  return false;
}

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(`${String(d).slice(0, 10)}T12:00:00Z`);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function addDaysUTC(date, n) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

module.exports = async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });

  const today    = new Date();
  const tomorrow = toDateStr(addDaysUTC(today, 1));
  const todayStr = toDateStr(today);

  const summary = { date: todayStr, reminders: 0, backfilled: 0, errors: 0 };

  // ── 1. Day-before reminders ────────────────────────────────────────────────
  try {
    const due = await db.visitsDueForReminder(tomorrow);
    for (const v of due) {
      const cust = v.customers || {};
      if (!cust.email) continue;
      const msg = tpl.visitReminder({
        name:      cust.first_name,
        visitDate: fmtDate(v.scheduled_date),
        pickupDay: (v.subscriptions && v.subscriptions.pickup_day) || null,
        windowLabel: (ORDER.SCHEDULE.windows.find((w) => w.key === v.window_key) || {}).label || null,
      });
      const r = await sendEmail({ to: cust.email, kind: 'transactional', idempotencyKey: `visit:${v.id}:reminder`, ...msg });
      // Dry-run (no RESEND_API_KEY / EMAIL_DISABLED=1): don't stamp reminder_sent_at,
      // or the real reminder is suppressed forever once email goes live. Not an error.
      if (r && r.skipped) continue;
      if (r && r.ok) { await db.updateVisit(v.id, { reminder_sent_at: new Date().toISOString() }); summary.reminders++; }
      else summary.errors++;
    }
  } catch (e) { console.error('[cron-visits] reminders failed:', e.message); summary.errors++; }

  // ── 2. Backfill the next visit for active recurring subscriptions ───────────
  try {
    const subs = await db.activeSubscriptionsWithVisits();
    for (const s of subs) {
      const visits = s.visits || [];
      // Already has an upcoming scheduled visit? Nothing to do.
      const hasFuture = visits.some((x) => x.status === 'scheduled' && x.scheduled_date >= todayStr);
      if (hasFuture) continue;

      // Find the latest visit date to anchor the next one; else schedule fresh.
      const latest = visits.map((x) => x.scheduled_date).filter(Boolean).sort().pop();
      const date = latest
        ? nextVisitDate({ freqIdx: s.freq_idx, afterDate: latest })
        : firstVisitDate({ freqIdx: s.freq_idx, weekday: null });
      if (!date) continue; // one-time / non-recurring

      const created = await db.createVisit({ customerId: s.customer_id, subscriptionId: s.id, scheduledDate: date });
      if (created) summary.backfilled++;
    }
  } catch (e) { console.error('[cron-visits] backfill failed:', e.message); summary.errors++; }

  console.log('[cron-visits]', JSON.stringify(summary));
  return res.status(200).json({ ok: true, ...summary });
};
