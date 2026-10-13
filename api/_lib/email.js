/**
 * Haulmighty — shared Resend email sender.
 *
 * One thin wrapper around the Resend HTTP API (plain fetch, no SDK — matches
 * the Discord webhook pattern in stripe-webhook.js). Every email in the system
 * goes through sendEmail() so retries, the transactional/marketing domain
 * split, and fail-safe behavior live in exactly one place.
 *
 * Required env var (production):
 *   RESEND_API_KEY        = re_...   (rotate any key ever pasted in plaintext)
 *
 * Optional env vars:
 *   EMAIL_FROM            = "Haulmighty <hello@example.com>"   transactional sender
 *   EMAIL_FROM_MARKETING  = "Haulmighty <news@example.com>"    marketing sender (separate
 *                           subdomain so a campaign complaint can't poison booking-
 *                           confirmation deliverability)
 *   EMAIL_REPLY_TO        = hello@example.com
 *   EMAIL_DISABLED        = "1"   force dry-run even when a key is present
 *
 * FAIL-SAFE: with no API key (or EMAIL_DISABLED=1) sendEmail logs and no-ops
 * instead of throwing — a missing env var can never break the Stripe webhook
 * or any caller. Same philosophy as the optional OPS_WEBHOOK_URL.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const site = require('./site');

/**
 * A usable Resend sender is either a bare address (`hello@example.com`) or a
 * display name with one in angle brackets (`Haulmighty <hello@example.com>`).
 * A bare display name — `Haulmighty` — is neither, and it is the exact thing
 * that has been sitting in the EMAIL_FROM env var: Resend rejects the send,
 * sendEmail swallows the error by design, and a paying customer silently gets
 * no confirmation. `||` doesn't catch it, because a wrong value is still truthy.
 *
 * So: validate, and fall back to the known-good default when it doesn't parse.
 * A slightly-wrong sender name is a cosmetic problem; no email at all after
 * someone's card is charged is not.
 */
function validFrom(value, fallback, varName) {
  const v = String(value || '').trim();
  if (!v) return fallback;
  // Accept `Name <a@b.tld>` or a bare `a@b.tld`. Deliberately loose on the
  // display-name half — it may contain dots, commas, apostrophes.
  const ok = /<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>\s*$/.test(v) ||
             /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v);
  if (ok) return v;
  console.warn(
    `[email] ${varName} is not a valid sender (${JSON.stringify(v)}) — ` +
    `expected "Display Name <address@domain>". Falling back to ${fallback}. Fix it in Vercel.`
  );
  return fallback;
}

function defaults() {
  return {
    transactional: validFrom(process.env.EMAIL_FROM,           `${site.NAME} <hello@${site.DOMAIN}>`, 'EMAIL_FROM'),
    marketing:     validFrom(process.env.EMAIL_FROM_MARKETING, `${site.NAME} <news@${site.DOMAIN}>`,  'EMAIL_FROM_MARKETING'),
    replyTo:       process.env.EMAIL_REPLY_TO       || site.EMAIL,
  };
}

/**
 * Send one email through Resend.
 *
 * @param {object}   opts
 * @param {string|string[]} opts.to          recipient(s)
 * @param {string}   opts.subject
 * @param {string}  [opts.html]              HTML body (html or text required)
 * @param {string}  [opts.text]              plaintext body
 * @param {'transactional'|'marketing'} [opts.kind='transactional']  picks the default from-address
 * @param {string}  [opts.from]              override sender
 * @param {string}  [opts.replyTo]
 * @param {string}  [opts.idempotencyKey]    dedupes retries (e.g. a webhook event id)
 * @param {Array<{name:string,value:string}>} [opts.tags]  Resend tags for filtering/analytics
 * @param {object}  [opts.headers]           extra headers (e.g. List-Unsubscribe)
 * @returns {Promise<{ok:boolean, id?:string, skipped?:boolean, error?:any}>}  never throws
 */
async function sendEmail({
  to, subject, html, text,
  kind = 'transactional',
  from, replyTo, idempotencyKey, tags, headers,
} = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const d = defaults();

  if (!apiKey || process.env.EMAIL_DISABLED === '1') {
    console.log('[email] dry-run (no RESEND_API_KEY or EMAIL_DISABLED=1):', { to, subject, kind });
    return { ok: true, skipped: true };
  }
  if (!to || !subject || (!html && !text)) {
    console.error('[email] missing required fields (to, subject, html|text)');
    return { ok: false, error: new Error('sendEmail requires to, subject, and html or text') };
  }

  const body = {
    from:     from || d[kind] || d.transactional,
    to:       Array.isArray(to) ? to : [to],
    subject,
    reply_to: replyTo || d.replyTo,
    ...(html    ? { html }    : {}),
    ...(text    ? { text }    : {}),
    ...(tags    ? { tags }    : {}),
    ...(headers ? { headers } : {}),
  };

  const reqHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  // Resend honors Idempotency-Key — pass an event id so a webhook redelivery
  // doesn't send the same confirmation twice.
  if (idempotencyKey) reqHeaders['Idempotency-Key'] = String(idempotencyKey);

  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method:  'POST',
      headers: reqHeaders,
      body:    JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[email] send non-2xx:', r.status, JSON.stringify(data).slice(0, 300));
      return { ok: false, error: data };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    console.error('[email] send failed:', e.message);
    return { ok: false, error: e };
  }
}

module.exports = { sendEmail };
