/**
 * Vercel Serverless Function: commercial-lead
 *
 * Receives a request from book/commercial.html (property managers, realtors,
 * contractors, offices) and makes sure the founder finds out about it.
 * Carried over from Scoops Co. (2026-10-07), where the first version did its
 * work in the browser and its only alert was a WhatsApp popup the browser
 * usually blocked: a request worth thousands could show "received" and exist
 * nowhere. Here the server files it through three independent channels.
 *
 *   POST /api/commercial-lead  { first_name, last_name, title?, email, phone,
 *     company, address, zip?, property_type, how_often, size?, notes?, website (honeypot) }
 *   → 200 { ok: true, stored }    reached the founder somewhere
 *   → 400 { ok: false, error }    a required field is missing or wrong
 *   → 502 { ok: false, error }    reached no one: the page says to call
 *
 * Env (each optional, each fails on its own):
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   a row in `leads` (service 'commercial')
 *   OPS_WEBHOOK_URL                            a Discord ping
 *   OPS_EMAIL (+ RESEND_API_KEY)               an email to the founder, Reply-To the customer
 *
 * FAIL SOFT, WITH ONE HARD RULE: ok is true only if the request landed
 * somewhere the founder can reach it. A dry run email (no RESEND_API_KEY) is
 * not a delivery, because counting it is how a form ends up always claiming
 * to work.
 */

const { sendEmail } = require('./_lib/email');
const { escapeHtml } = require('./_lib/email-templates');
const site = require('./_lib/site');
const travel = require('./_lib/travel');

const SITE_ORIGIN = (process.env.SITE_ORIGIN || site.SITE_URL).replace(/\/+$/, '');

// Unauthenticated and fanned out to email and Discord: cap every field.
const CAP = { short: 200, notes: 2000 };
const clean = (v, max = CAP.short) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REQUIRED = ['first_name', 'last_name', 'email', 'phone', 'company', 'address', 'property_type', 'how_often'];

// A light per instance limit; the honeypot does most of the work.
const WINDOW_MS = 10 * 60 * 1000, PER_WINDOW = 8;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > PER_WINDOW;
}

function normalize(body) {
  const b = body && typeof body === 'object' ? body : {};
  return {
    first_name:    clean(b.first_name),
    last_name:     clean(b.last_name),
    title:         clean(b.title),
    email:         clean(b.email),
    phone:         clean(b.phone),
    company:       clean(b.company),
    address:       clean(b.address),
    zip:           clean(b.zip, 10),
    property_type: clean(b.property_type, 80),
    how_often:     clean(b.how_often, 80),
    size:          clean(b.size, 80),
    notes:         clean(b.notes, CAP.notes),
    source_url:    clean(b.source_url, 500),
    utm:           b.utm && typeof b.utm === 'object' ? b.utm : null,
  };
}

function validate(lead) {
  const missing = REQUIRED.filter((f) => !lead[f]);
  if (missing.length) return `Please fill in: ${missing.join(', ').replace(/_/g, ' ')}`;
  if (!EMAIL_RE.test(lead.email)) return 'That email address does not look right. Please check it.';
  if (lead.zip && !/^\d{5}$/.test(lead.zip)) return 'Please enter a 5 digit ZIP code.';
  return null;
}

/** The travel zone for the ZIP, or a note that it needs a hand quote. */
function zoneLine(zip) {
  if (!zip) return null;
  const t = travel.travelFor(zip);
  return t ? `${t.label}, ${t.miles} road miles (${t.place})` : `ZIP ${zip} is past our travel zones: quote by hand`;
}

/** Everything the founder needs to scope the work, in one line. */
function summary(lead) {
  return [
    `Commercial: ${lead.company}`,
    lead.property_type && `Type: ${lead.property_type}`,
    lead.how_often && `How often: ${lead.how_often}`,
    lead.size && `Size: ${lead.size}`,
    lead.title && `Title: ${lead.title}`,
    zoneLine(lead.zip),
    lead.notes && `Notes: ${lead.notes}`,
  ].filter(Boolean).join(' | ');
}

// ── Channel 1: the database row ─────────────────────────────────────────
async function insertLead(lead, req) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[commercial-lead] Supabase not configured: no row'); return false; }
  const row = {
    service:    'commercial',
    first_name: lead.first_name,
    last_name:  lead.last_name,
    email:      lead.email,
    phone:      lead.phone,
    zip:        lead.zip || null,
    address:    lead.address,
    frequency:  lead.how_often,
    notes:      summary(lead),
    source_url: lead.source_url || `${SITE_ORIGIN}/book/commercial.html`,
    user_agent: String((req.headers && req.headers['user-agent']) || '').slice(0, 500),
    utm:        lead.utm,
  };
  try {
    const r = await fetch(`${url}/rest/v1/leads`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    if (!r.ok) { console.error('[commercial-lead] Supabase insert non-2xx:', r.status, (await r.text().catch(() => '')).slice(0, 300)); return false; }
    return true;
  } catch (e) { console.error('[commercial-lead] Supabase insert failed:', e.message); return false; }
}

// ── Channel 2: the Discord ping ─────────────────────────────────────────
async function notifyDiscord(lead) {
  const url = process.env.OPS_WEBHOOK_URL;
  if (!url) return false;
  const fields = [
    { name: 'Company', value: lead.company, inline: false },
    { name: 'Type', value: lead.property_type, inline: true },
    { name: 'How often', value: lead.how_often, inline: true },
    lead.size && { name: 'Size', value: lead.size, inline: true },
    { name: 'Contact', value: `${lead.first_name} ${lead.last_name}${lead.title ? `, ${lead.title}` : ''}`, inline: false },
    { name: 'Email', value: lead.email, inline: true },
    { name: 'Phone', value: lead.phone, inline: true },
    { name: 'Address', value: `${lead.address}${lead.zip ? ` ${lead.zip}` : ''}`, inline: false },
    zoneLine(lead.zip) && { name: 'Travel', value: zoneLine(lead.zip), inline: false },
    lead.notes && { name: 'Notes', value: lead.notes.slice(0, 1000), inline: false },
    { name: 'Links', value: `[Open the dashboard](${SITE_ORIGIN}/jkr/)`, inline: false },
  ].filter(Boolean);
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: site.NAME, embeds: [{ title: 'New commercial request', color: 0xFFD23F, fields, timestamp: new Date().toISOString() }] }),
    });
    if (!r.ok) { console.error('[commercial-lead] Discord non-2xx:', r.status); return false; }
    return true;
  } catch (e) { console.error('[commercial-lead] Discord failed:', e.message); return false; }
}

// ── Channel 3: the founder email (Reply-To the customer) ─────────────────
async function notifyEmail(lead) {
  const to = process.env.OPS_EMAIL;
  if (!to) return false;
  const rows = [
    ['Company', lead.company], ['Type', lead.property_type], ['How often', lead.how_often], ['Size', lead.size],
    ['Contact', `${lead.first_name} ${lead.last_name}${lead.title ? `, ${lead.title}` : ''}`],
    ['Email', lead.email], ['Phone', lead.phone], ['Address', `${lead.address}${lead.zip ? ` ${lead.zip}` : ''}`],
    ['Travel', zoneLine(lead.zip)], ['Notes', lead.notes],
  ].filter(([, v]) => v);
  const html = `<h2 style="font-family:Arial,sans-serif;color:#15171A;">New commercial request</h2>`
    + `<table cellpadding="6" style="font-family:Arial,sans-serif;font-size:15px;border-collapse:collapse;">`
    + rows.map(([k, v]) => `<tr><td style="color:#7A5A00;font-weight:700;vertical-align:top;">${escapeHtml(k)}</td><td style="color:#15171A;">${escapeHtml(v)}</td></tr>`).join('')
    + `</table><p style="font-family:Arial,sans-serif;font-size:14px;"><a href="${SITE_ORIGIN}/jkr/">Open the dashboard</a>. Reply to this email to answer ${escapeHtml(lead.first_name)} directly.</p>`;
  const r = await sendEmail({
    to, kind: 'transactional',
    subject: `Commercial request: ${lead.company} (${lead.property_type})`,
    html, text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
    replyTo: lead.email,
  });
  return !!(r && r.ok === true && r.skipped !== true);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }

  // Honeypot: a field no person sees. Answer 200 so a bot learns nothing, and do no work.
  if (body && typeof body === 'object' && clean(body.website)) {
    console.log('[commercial-lead] honeypot tripped: dropped');
    return res.status(200).json({ ok: true });
  }

  const ip = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ ok: false, error: 'Too many requests. Please call or text us instead.' });

  const lead = normalize(body);
  const problem = validate(lead);
  if (problem) return res.status(400).json({ ok: false, error: problem });

  const [dbOk, discordOk, emailOk] = await Promise.all([
    insertLead(lead, req).catch(() => false),
    notifyDiscord(lead).catch(() => false),
    notifyEmail(lead).catch(() => false),
  ]);
  if (!dbOk && !discordOk && !emailOk) {
    // The last line of defense: the payload is in the logs, recoverable by hand.
    console.error('[commercial-lead] ALL CHANNELS FAILED, lead follows:', JSON.stringify(lead));
    return res.status(502).json({ ok: false, error: `We could not file your request just now. Please call or text us at ${site.PHONE} and we will take the details directly.` });
  }
  if (!dbOk || !discordOk || !emailOk) console.warn('[commercial-lead] partial delivery:', { dbOk, discordOk, emailOk });
  return res.status(200).json({ ok: true, stored: dbOk });
};

module.exports._internals = { normalize, validate, summary, zoneLine };
