/**
 * Vercel Serverless Function: founding-spots (public, read only).
 *
 * How many founding member spots are left, and the offer's terms, for the
 * banners and checkout. An aggregate count only: no customer data leaves
 * here. Carried over from Scoops Co.
 *
 *   GET /api/founding-spots
 *   → { open: true, spots: 10, left: 7, percentOff: 25 }
 *
 * FAIL-CLOSED on display: if Stripe cannot be read, `open` is false and the
 * pages do not advertise the offer. This never decides a charge; the booking
 * API re-counts at booking time (api/_lib/founding.js).
 */

const Stripe = require('stripe');
const site = require('./_lib/site');
const { FOUNDING, spotsLeft } = require('./_lib/founding');

module.exports = async (req, res) => {
  const origin = (req.headers && req.headers.origin) || '';
  const ALLOWED = [`https://${site.DOMAIN}`, site.SITE_URL, 'http://localhost:3000', 'http://localhost:5173'];
  if (ALLOWED.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 'no-store');

  const terms = { spots: FOUNDING.spots, percentOff: FOUNDING.percentOff };
  const SECRET = process.env.STRIPE_SECRET_KEY;
  if (!SECRET || !FOUNDING.open) return res.status(200).json({ open: false, left: FOUNDING.open ? null : 0, ...terms });

  try {
    const left = await spotsLeft(new Stripe(SECRET, { apiVersion: '2024-06-20' }));
    return res.status(200).json({ open: left > 0, left, ...terms });
  } catch (e) {
    console.warn('[founding-spots] count failed, hiding the offer:', e.message);
    return res.status(200).json({ open: false, left: null, ...terms });
  }
};
