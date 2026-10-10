/**
 * Vercel Serverless Function — day-capacity (public, read-only)
 *
 * Tells the order page which days and 2 hour windows are full so it can grey
 * them out. Returns ONLY aggregate flags, never customer data, so it is safe to
 * call unauthenticated from the page.
 *
 *   GET /api/day-capacity?market=portland
 *   -> { days: [{ date, label, full, windows: [{ key, label, full }] }] }
 *
 * A window is full at its cap; a day is full when its visits reach the daily
 * cap or every window is full. Days are the open days (Pacific time).
 *
 * The market is required (each market has its own crew and caps): without
 * one the answer is 400.
 *
 * FAIL-OPEN: if the DB/schema is unreachable, nothing is full: a capacity read
 * must never block a sale.
 */

const db = require('./_lib/db');
const ORDER = require('./_lib/order-config');

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const site = require('./_lib/site');
  const ALLOWED = [`https://${site.DOMAIN}`, site.SITE_URL, 'http://localhost:3000', 'http://localhost:5173'];
  if (ALLOWED.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Never cache — capacity changes with every booking.
  res.setHeader('Cache-Control', 'no-store');

  const url = new URL(req.url || '/', 'http://x');
  const market = (req.query && req.query.market) || url.searchParams.get('market');
  if (!market || !/^[a-z-]{1,24}$/.test(market)) return res.status(400).json({ error: 'Unknown market' });

  const { windows, dailyCap } = ORDER.SCHEDULE;
  const open = ORDER.openDays(Date.now());
  let counts = {};
  if (open.length) {
    try {
      counts = (await db.slotCounts({ market, from: open[0].date, to: open[open.length - 1].date })) || {};
    } catch (e) {
      console.warn('[day-capacity] slot count failed, failing open:', e.message);
    }
  }
  const days = open.map((d) => {
    const c = counts[d.date] || {};
    const ws = windows.map((w) => ({ key: w.key, label: w.label, full: (c[w.key] || 0) >= w.cap }));
    return { date: d.date, label: d.label, full: (c.total || 0) >= dailyCap || ws.every((w) => w.full), windows: ws };
  });
  return res.status(200).json({ days });
};
