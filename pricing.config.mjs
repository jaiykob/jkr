/**
 * The one editable price table. Every price on the site comes from here.
 *
 * Money is integer cents. Format it with fmt(), which uses toFixed(2), so a
 * price with cents is never printed rounded ("$24" against a $24.13 charge was
 * a real bug at Scoops Co.).
 *
 * Junk removal is priced by how much of the truck a job fills. The server
 * (api/quote-request.js) imports this file directly and the quote page asks
 * the server for the price, so there is no second copy of the table to drift.
 *
 * TODO: the numbers below are placeholders. Set real prices before launch.
 */

export const LOADS = [
  { key: 'single',  label: 'Single item',     hint: 'A couch, a mattress, an appliance', cents: 9900 },
  { key: 'quarter', label: '1/4 truck',       hint: 'A room corner or a few pieces',     cents: 19900 },
  { key: 'half',    label: '1/2 truck',       hint: 'A small room or a garage corner',   cents: 34900 },
  { key: 'three',   label: '3/4 truck',       hint: 'A full room or a small garage',     cents: 47900 },
  { key: 'full',    label: 'Full truck',      hint: 'A garage, basement or estate',      cents: 59900 },
];

/* Items that cost the business extra at the dump or recycler. Per item. */
export const SURCHARGES = [
  { key: 'mattress',  label: 'Mattress or box spring', cents: 2500 },
  { key: 'appliance', label: 'Appliance with refrigerant', cents: 4000 },
  { key: 'tire',      label: 'Tire', cents: 1000 },
];

/* ZIP gate: only these ZIPs can request a quote. TODO: set the real area. */
export const SERVICE_ZIPS = ['97030', '97080', '97060', '97024'];

export const fmt = (cents) => '$' + (cents / 100).toFixed(2);

export function quote({ load, surcharges = {} }) {
  const l = LOADS.find((x) => x.key === load);
  if (!l) return null;
  let total = l.cents;
  for (const s of SURCHARGES) {
    const n = Math.max(0, Math.min(20, parseInt(surcharges[s.key], 10) || 0));
    total += n * s.cents;
  }
  return total;
}
