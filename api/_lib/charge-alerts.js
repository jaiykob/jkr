/**
 * The "payment needed" alert for the owner (Discord ping + OPS_EMAIL), shared by
 * the charge call (api/visit-update.js) and the webhook, which may both see the
 * same decline. Fail-soft: an error is logged, never thrown. The caller decides
 * WHETHER to alert (it dedupes on the visit's payment_status).
 */
const email = require('./email');

const SITE_ORIGIN = (process.env.SITE_ORIGIN || require('./site').SITE_URL).replace(/\/+$/, '');

function money(cents) { return `$${(Number(cents) / 100).toFixed(2)}`; }

/** visit: the row with its customer. kind: 'final_charge' | 'late_fee'. */
async function alertPaymentNeeded(visit, { cents, kind, invoiceUrl, reason, sendEmail } = {}) {
  const cust = (visit && visit.customers) || {};
  const name = [cust.first_name, cust.last_name].filter(Boolean).join(' ') || cust.name || '';
  const what = kind === 'late_fee' ? 'late cancel fee' : 'final charge';
  const url = process.env.OPS_WEBHOOK_URL;
  if (url) {
    const fields = [
      { name: 'What', value: what, inline: true },
      cents != null ? { name: 'Amount', value: money(cents), inline: true } : null,
      name ? { name: 'Name', value: name, inline: true } : null,
      cust.phone ? { name: 'Phone', value: cust.phone, inline: true } : null,
      cust.email ? { name: 'Email', value: cust.email, inline: true } : null,
      reason ? { name: 'Reason', value: String(reason).slice(0, 300), inline: false } : null,
      { name: 'Links', value: [`[Open CRM](${SITE_ORIGIN}/jkr/)`, invoiceUrl ? `[Invoice](${invoiceUrl})` : null].filter(Boolean).join('  ·  '), inline: false },
    ].filter(Boolean);
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Brand Name', embeds: [{ title: '⚠️ Payment needed', color: 0xC0392B, fields, timestamp: new Date().toISOString() }] }),
      });
      if (!r.ok) console.error('[charge-alerts] ops notify non-2xx:', r.status);
    } catch (e) { console.error('[charge-alerts] ops notify failed:', e.message); }
  }
  const to = process.env.OPS_EMAIL;
  if (to) {
    const rows = [`Customer: ${name}`, `Phone: ${cust.phone || ''}`, `Email: ${cust.email || ''}`, `What: ${what}`, cents != null ? `Amount: ${money(cents)}` : '', invoiceUrl ? `Invoice: ${invoiceUrl}` : '', `Dashboard: ${SITE_ORIGIN}/jkr/`].filter(Boolean);
    try {
      await (sendEmail || email.sendEmail)({
        to, kind: 'transactional', idempotencyKey: `visit:${visit && visit.id}:${kind}:owner-payment-needed`,
        subject: `Payment needed: ${cents != null ? money(cents) : ''} ${what}${name ? ', ' + name : ''}`.replace(/\s+/g, ' '),
        html: `<p>${rows.map((r) => r.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>')}</p>`,
        text: rows.join('\n'),
      });
    } catch (e) { console.error('[charge-alerts] owner email failed:', e.message); }
  }
}

module.exports = { alertPaymentNeeded, money };
