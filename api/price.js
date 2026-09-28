/**
 * GET /api/price — the price table for the quote page, read from
 * pricing.config.mjs so the page never carries its own copy.
 */
import { LOADS, SURCHARGES, SERVICE_ZIPS } from '../pricing.config.mjs';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ loads: LOADS, surcharges: SURCHARGES, zips: SERVICE_ZIPS });
}
