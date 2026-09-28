/**
 * Vercel Serverless Function — visit-photo
 *
 * Before/after photo proof for a job. The dashboard never ships the image
 * bytes through this function (Vercel body limits + cost); instead it asks for a
 * one-time signed upload URL, PUTs the file straight to the private Supabase
 * `visit-photos` bucket, then confirms so the path is recorded.
 *
 * AUTH: admin token (same as admin-data.js / visit-update.js).
 *
 * POST body:
 *   { action: 'sign-upload', visitId, kind }   → { uploadUrl, token, path }
 *   { action: 'confirm',     visitId, kind, path } → { ok, photo }
 *
 * kind = before | after. The "after" photo goes in the job-done email.
 *
 * Required env vars: ADMIN_DASHBOARD_TOKEN, SUPABASE_SERVICE_ROLE_KEY
 * Storage prereq (run once): create a PRIVATE bucket named `visit-photos`
 * (see db/schema.sql storage note).
 */

const crypto = require('crypto');
const db = require('./_lib/db');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(Buffer.from(String(a))).digest();
  const hb = crypto.createHash('sha256').update(Buffer.from(String(b))).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const KINDS = new Set(['before', 'after']);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.ADMIN_DASHBOARD_TOKEN;
  if (!TOKEN)                                 return res.status(500).json({ error: 'ADMIN_DASHBOARD_TOKEN not configured' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });

  const provided = req.headers['x-admin-token'];
  if (!provided || !safeEqual(provided, TOKEN)) return res.status(401).json({ error: 'Unauthorized' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  body = body || {};
  const { action, visitId, kind } = body;

  if (!visitId || !KINDS.has(kind)) return res.status(400).json({ error: 'visitId and kind (before|after) required' });

  const visit = await db.getVisit(visitId);
  if (!visit) return res.status(404).json({ error: 'Visit not found (or schema not applied)' });

  try {
    if (action === 'sign-upload') {
      // Deterministic-ish object path under the owning customer for tidy RLS scoping.
      const stamp = Date.now();
      const path  = `${visit.customer_id}/${visitId}/${kind}-${stamp}.jpg`;
      const signed = await db.signPhotoUpload(path);
      if (!signed) return res.status(502).json({ error: 'Could not sign upload (is the visit-photos bucket created?)' });
      return res.status(200).json(signed);
    }

    if (action === 'confirm') {
      const { path } = body;
      if (!path) return res.status(400).json({ error: 'path required' });
      const photo = await db.recordVisitPhoto({
        visitId, customerId: visit.customer_id, kind, storagePath: path,
      });
      // Stamp the visit so the dashboard reflects field progress.
      if (kind === 'before' && !visit.started_at) {
        await db.updateVisit(visitId, { status: 'in_progress', started_at: new Date().toISOString() });
      }
      return res.status(200).json({ ok: !!photo, photo });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error('[visit-photo] failed:', e.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
