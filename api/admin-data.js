/**
 * Vercel Serverless Function — admin-data
 *
 * Founder-only data feed for admin/index.html (the admin dashboard, served at /admin/). Returns every customer + their
 * subscriptions/visits, plus all quote-stage and commercial leads.
 *
 * SECURITY:
 *   - Uses the Supabase SERVICE_ROLE key (bypasses RLS) — this is why it lives
 *     server-side and is NEVER exposed to the browser. The page sends a separate
 *     admin token; the service_role key never leaves the server.
 *   - Gated by ADMIN_DASHBOARD_TOKEN (constant-time compared).
 *
 * Required env vars in Vercel:
 *   SUPABASE_URL               = https://YOUR-PROJECT.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  = (Project Settings → API → service_role secret)
 *   ADMIN_DASHBOARD_TOKEN      = a long random string you choose
 */

const crypto = require('crypto');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // Compare against a fixed-length digest so length never leaks via timing.
  const ha = crypto.createHash('sha256').update(ab).digest();
  const hb = crypto.createHash('sha256').update(bb).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN       = process.env.ADMIN_DASHBOARD_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!TOKEN)       return res.status(500).json({ error: 'ADMIN_DASHBOARD_TOKEN not configured' });
  if (!SUPABASE_URL) return res.status(500).json({ error: 'SUPABASE_URL not configured' });
  if (!SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });

  // ── Auth ──────────────────────────────────────────────────
  // HEADER ONLY. There used to be a `?token=` query fallback here; it had no
  // callers (the dashboard has always sent the header — it prompts and holds the
  // token in sessionStorage) and it quietly contradicted the design ACCOUNTS.md
  // states outright: "there is no `?token=` URL form". A token in a URL leaks
  // into browser history, Referer headers, and access logs — and every booking's
  // Discord ping links to the dashboard, so such a URL would sit in a chat log
  // forever. Removed 2026-08-14. Don't reintroduce it for convenience.
  const provided = req.headers['x-admin-token'];
  if (!provided || !safeEqual(provided, TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Query helper (PostgREST). Tolerates a table that doesn't exist yet. ──
  async function q(path) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      });
      if (!r.ok) return null;          // 404 = table not created yet; degrade gracefully
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  const [customers, leads] = await Promise.all([
    q('customers?select=*,subscriptions(*),visits(id,scheduled_date,status,route_date,route_seq,completed_at,visit_photos(kind))&order=created_at.desc'),
    q('leads?select=*&order=created_at.desc'),
  ]);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    customers:   customers || [],
    leads:       leads || [],
    spineReady:  customers !== null,   // false until db/schema.sql is applied
    generatedAt: new Date().toISOString(),
  });
};
