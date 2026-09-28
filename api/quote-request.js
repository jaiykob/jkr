/**
 * POST /api/quote-request
 *
 * Takes a quote request from onboarding/quote.html, recomputes the price from
 * pricing.config.mjs (the client's number is never trusted), and records the
 * lead. No card is charged here: junk removal is confirmed on site, so payment
 * comes after the job is sized in person.
 *
 * TODO: deliver the lead. At Scoops Co. this was three channels (database row,
 * Discord ping, email), fail-soft, with the lead logged in full if all three
 * failed so nothing is ever lost.
 */
import { quote, fmt, SERVICE_ZIPS } from '../pricing.config.mjs';

const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const b = req.body || {};
  const lead = {
    name: clean(b.name),
    phone: clean(b.phone, 40),
    email: clean(b.email),
    zip: clean(b.zip, 5),
    load: clean(b.load, 20),
    notes: clean(b.notes, 2000),
  };

  for (const f of ['name', 'phone', 'zip', 'load']) {
    if (!lead[f]) return res.status(400).json({ error: `Missing ${f}` });
  }
  if (!SERVICE_ZIPS.includes(lead.zip)) {
    return res.status(400).json({ error: 'Outside the service area', outside: true });
  }

  const cents = quote({ load: lead.load, surcharges: b.surcharges });
  if (cents === null) return res.status(400).json({ error: 'Unknown load size' });

  // TODO: save + notify. Until then the lead lands in the Vercel function log.
  console.log('[quote-request]', JSON.stringify({ ...lead, cents }));

  return res.status(200).json({ ok: true, cents, price: fmt(cents) });
}
