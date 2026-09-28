/**
 * Vercel Serverless Function — visit-update
 *
 * Founder-only visit actions for the admin dashboard. The operator's whole field
 * workflow runs through here: start a job, mark it done (which fires the
 * "all done" serviceComplete email + queues the next recurring visit), skip,
 * or cancel.
 *
 * AUTH: same admin token as admin-data.js (ADMIN_DASHBOARD_TOKEN, x-admin-token
 * header, constant-time compare). Writes go through the service_role key in
 * api/_lib/db.js — never the browser.
 *
 * POST body: { action: 'start'|'complete'|'skip'|'cancel', visitId, notes? }
 *
 * Required env vars: ADMIN_DASHBOARD_TOKEN, SUPABASE_SERVICE_ROLE_KEY
 * (+ RESEND_API_KEY for the serviceComplete email; dry-runs without it).
 */

const crypto = require('crypto');
const db = require('./_lib/db');
const { sendEmail } = require('./_lib/email');
const tpl = require('./_lib/email-templates');
const { nextVisitDate } = require('./_lib/schedule');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(Buffer.from(String(a))).digest();
  const hb = crypto.createHash('sha256').update(Buffer.from(String(b))).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(`${String(d).slice(0, 10)}T12:00:00Z`);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.ADMIN_DASHBOARD_TOKEN;
  if (!TOKEN)                                return res.status(500).json({ error: 'ADMIN_DASHBOARD_TOKEN not configured' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });

  const provided = req.headers['x-admin-token'];
  if (!provided || !safeEqual(provided, TOKEN)) return res.status(401).json({ error: 'Unauthorized' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  body = body || {};
  const { action, visitId, notes } = body;
  if (!visitId || !action) return res.status(400).json({ error: 'Missing visitId or action' });

  const now = new Date().toISOString();
  const notePatch = notes ? { operator_notes: String(notes).slice(0, 2000) } : {};

  try {
    if (action === 'start') {
      const v = await db.updateVisit(visitId, { status: 'in_progress', started_at: now, ...notePatch });
      return res.status(200).json({ ok: !!v, visit: v });
    }

    if (action === 'skip' || action === 'cancel') {
      const v = await db.updateVisit(visitId, { status: action === 'skip' ? 'skipped' : 'canceled', ...notePatch });
      return res.status(200).json({ ok: !!v, visit: v });
    }

    if (action === 'complete') {
      const ctx = await db.getVisitContext(visitId);
      if (!ctx) return res.status(404).json({ error: 'Visit not found (or schema not applied)' });

      const cust = ctx.customers || {};
      const sub  = ctx.subscriptions || {};

      // Sign the most recent "after" + "before" photos, if uploaded, for the
      // email. A missing photo isn't an error: the email just shows less.
      const latest = (kind) => (ctx.visit_photos || []).filter((p) => p.kind === kind)
        .sort((a, b) => new Date(b.taken_at || 0) - new Date(a.taken_at || 0))[0];
      const sign = async (p) => (p ? db.signPhotoDownload(p.storage_path) : null);
      const [photoUrl, beforePhotoUrl] = await Promise.all([
        sign(latest('after')), sign(latest('before')),
      ]);

      // Queue the next recurring visit (active recurring plans only).
      let nextDate = null;
      if (sub.status === 'active') {
        nextDate = nextVisitDate({ freqIdx: sub.freq_idx, afterDate: ctx.scheduled_date });
        if (nextDate) await db.createVisit({
          customerId: ctx.customer_id, subscriptionId: sub.id || null, scheduledDate: nextDate,
        });
      }

      const v = await db.updateVisit(visitId, {
        status: 'completed', completed_at: now, client_notified_at: now, ...notePatch,
      });

      if (cust.email) {
        const msg = tpl.serviceComplete({
          name:          cust.first_name,
          visitDate:     fmtDate(ctx.scheduled_date),
          nextVisitDate: fmtDate(nextDate),
          photoUrl,
          beforePhotoUrl,
          address:       cust.address,
        });
        await sendEmail({ to: cust.email, kind: 'transactional', idempotencyKey: `visit:${visitId}:complete`, ...msg });
      }

      return res.status(200).json({
        ok: !!v, visit: v, nextDate, emailed: !!cust.email, afterPhoto: !!photoUrl,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error('[visit-update] failed:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
