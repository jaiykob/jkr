/**
 * Vercel Serverless Function — day-capacity (public, read-only)
 *
 * Tells the booking picker which route weekdays are full so it can grey them
 * out. Returns ONLY aggregate counts — no customer data ever leaves here, so it's
 * safe to call unauthenticated from the checkout page.
 *
 *   GET /api/day-capacity
 *   → { cap: 12, counts: { Monday: 3, Thursday: 12 }, full: ["Thursday"] }
 *
 * FAIL-OPEN: if the DB/schema is unreachable, returns empty counts / no full
 * days — a capacity read must never block a sale.
 */

const db = require('./_lib/db');
const { DAILY_CAP, WEEKDAYS } = require('./_lib/schedule');

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const ALLOWED = ['https://example.com', 'https://www.example.com', 'http://localhost:3000', 'http://localhost:5173'];
  if (ALLOWED.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Never cache — capacity changes with every booking.
  res.setHeader('Cache-Control', 'no-store');

  let counts = {};
  try {
    counts = await db.scheduledVisitCountsByWeekday();
  } catch (e) {
    console.warn('[day-capacity] count failed, failing open:', e.message);
  }

  const full = WEEKDAYS.filter((d) => (counts[d] || 0) >= DAILY_CAP);
  return res.status(200).json({ cap: DAILY_CAP, counts, full });
};
