/**
 * Vercel Serverless Function — photo-quote
 *
 * The customer sends photos of their junk; Claude looks at them and counts
 * the items, and the page drops those items into the truck. The count only
 * picks a load size: prices still come from the table in pricing.config.mjs,
 * and create-booking.js still reprices the size on its own. The customer can
 * fix any count before they book.
 *
 * The photos are also saved to the private `visit-photos` bucket under
 * quotes/, and their paths ride along with the booking so the owner sees the
 * job before driving out (Discord ping, dashboard).
 *
 * POST body: { photos: [ "<base64 JPEG>", ... ] }   (1 to MAX_PHOTOS, the page
 *            downsizes them first)
 * → 200 { items: { couch: 1, ... }, notes, unsure, photos: [paths] }
 * → 503 when ANTHROPIC_API_KEY is not set: the page falls back to tapping.
 *
 * Env: ANTHROPIC_API_KEY (required), SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (optional: without them the photos are read but not kept).
 */

const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk').default;
const db = require('./_lib/db');

// ── ITEMS — GENERATED from pricing.config.mjs by `npm run build:pricing`.
/* BUILD:server-items */
const ITEMS = [
  {"key":"couch","label":"Couch"},
  {"key":"mattress","label":"Mattress and box spring"},
  {"key":"fridge","label":"Fridge or freezer"},
  {"key":"washer","label":"Washer or dryer"},
  {"key":"chair","label":"Chair or recliner"},
  {"key":"dresser","label":"Dresser or cabinet"},
  {"key":"table","label":"Table"},
  {"key":"tv","label":"TV or electronics"},
  {"key":"boxes","label":"5 boxes or bags"},
  {"key":"yard","label":"Yard debris pile"},
  {"key":"carpet","label":"Carpet, one room"},
  {"key":"misc","label":"Something else"},
];
/* /BUILD:server-items */

const MAX_PHOTOS = 4;
const MAX_BYTES  = 1.5 * 1024 * 1024;   // per photo, after the page downsizes it
const MAX_COUNT  = 30;                  // per item

// A small per-instance limit: it won't stop a determined abuser across cold
// starts, but it keeps one visitor from running up the bill by accident.
const WINDOW_MS = 10 * 60 * 1000, PER_WINDOW = 12;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > PER_WINDOW;
}

const SYSTEM = [
  'You help a junk removal company in Gresham, Oregon price jobs from photos.',
  'A customer photographed the things they want hauled away. Count what you see',
  'using only the item keys below, so the company can pick the right truck load.',
  '',
  'Items (key: what it covers):',
  ...ITEMS.map((i) => `- ${i.key}: ${i.label}`),
  '',
  'Counting rules:',
  '- One entry per key, with how many of that item are in the photos.',
  '- "boxes" counts groups of about five boxes or trash bags, rounded up.',
  '- "yard" counts piles of yard debris about the size of a pickup truck bed, rounded up.',
  '- "carpet" counts rooms of carpet.',
  '- Put any other bulky item in "misc", one per item.',
  '- Several photos may show the same things from different angles. Count each thing once.',
  '- Leave out anything that is clearly staying: built in cabinets, cars, the house itself.',
  '- If the photos are too dark or blurry to count, or show no junk, set unsure to true.',
  '',
  'notes: one or two short sentences to the customer about what you counted, written',
  'plainly with "we" for the company. Mention anything you were unsure about.',
  'Do not mention prices. Do not use dashes as punctuation.',
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key:   { type: 'string', enum: ITEMS.map((i) => i.key) },
          count: { type: 'integer' },
        },
        required: ['key', 'count'],
        additionalProperties: false,
      },
    },
    notes:  { type: 'string' },
    unsure: { type: 'boolean' },
  },
  required: ['items', 'notes', 'unsure'],
  additionalProperties: false,
};

// Clamp whatever came back to known keys and sane counts.
function tidy(parsed) {
  const known = new Set(ITEMS.map((i) => i.key));
  const items = {};
  for (const e of (parsed && Array.isArray(parsed.items) ? parsed.items : [])) {
    const n = Math.max(0, Math.min(MAX_COUNT, Math.round(Number(e && e.count) || 0)));
    if (known.has(e && e.key) && n > 0) items[e.key] = (items[e.key] || 0) + n;
  }
  for (const k of Object.keys(items)) items[k] = Math.min(MAX_COUNT, items[k]);
  return {
    items,
    notes:  String((parsed && parsed.notes) || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    unsure: !!(parsed && parsed.unsure),
  };
}

// Store one photo; fail-soft (a quote never waits on storage).
async function keep(buf) {
  const day  = new Date().toISOString().slice(0, 10);
  const path = `quotes/${day}/${crypto.randomBytes(12).toString('hex')}.jpg`;
  return db.uploadPhoto(path, buf);
}

async function readPhotos(client, buffers) {
  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // A live quote: keep it quick. Counting junk doesn't need deep thought.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        ...buffers.map((b) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b.toString('base64') } })),
        { type: 'text', text: `Here ${buffers.length === 1 ? 'is 1 photo' : `are ${buffers.length} photos`} of what I want hauled away.` },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') return { items: {}, notes: '', unsure: true };
  const text = response.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* treated as unsure below */ }
  return parsed ? tidy(parsed) : { items: {}, notes: '', unsure: true };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Photo quotes are not set up yet' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many photo quotes. Tap your items instead, or try again in a few minutes.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  const photos = body && Array.isArray(body.photos) ? body.photos : [];
  if (!photos.length || photos.length > MAX_PHOTOS) {
    return res.status(400).json({ error: `Send 1 to ${MAX_PHOTOS} photos.` });
  }
  const buffers = [];
  for (const p of photos) {
    const buf = Buffer.from(String(p || ''), 'base64');
    // JPEG only (the page re-encodes every photo), and not too big.
    if (buf.length < 100 || buf.length > MAX_BYTES || buf[0] !== 0xFF || buf[1] !== 0xD8) {
      return res.status(400).json({ error: 'One of the photos could not be read. Try a different one.' });
    }
    buffers.push(buf);
  }

  const client = new Anthropic();
  const [stored, read] = await Promise.allSettled([
    Promise.all(buffers.map(keep)),
    readPhotos(client, buffers),
  ]);
  const paths = stored.status === 'fulfilled' ? stored.value.filter(Boolean) : [];

  if (read.status === 'rejected') {
    const e = read.reason;
    if (e instanceof Anthropic.RateLimitError) console.error('[photo-quote] rate limited');
    else if (e instanceof Anthropic.APIError) console.error('[photo-quote] API error', e.status, e.message);
    else console.error('[photo-quote] failed:', e && e.message);
    // The photos may still have been kept; the page lets them tap instead.
    return res.status(502).json({ error: 'We could not read the photos right now. Tap your items instead.', photos: paths });
  }
  return res.status(200).json({ ...read.value, photos: paths });
};

module.exports.tidy = tidy;
