/**
 * The site's own address, name and phone: the one place they are written.
 *
 * Every generator (scripts/*.mjs) and every API function reads them from
 * here, so the page builders, the JSON-LD, the sitemap, the email links and
 * the CORS list can never disagree about which host the site is on.
 *
 *   node scripts/set-domain.mjs brandhaul.com   # when the real domain exists
 *
 * rewrites DOMAIN below and every static page in one go, then rebuilds.
 * The site lives on www; the bare domain should redirect to it (Vercel), and
 * anything a third party POSTs to (the Stripe webhook) must use www.
 *
 * CommonJS so the Vercel functions can require it; ESM scripts import it too.
 */
const DOMAIN = 'example.com';   // TODO: the real domain (set-domain.mjs)
// The reserved example domain the site uses until it has a real one.
const PLACEHOLDER = 'example' + '.com';

module.exports = {
  DOMAIN,
  PLACEHOLDER,
  HAS_DOMAIN: DOMAIN !== PLACEHOLDER,
  SITE_URL: `https://www.${DOMAIN}`,
  NAME: 'Brand Name',             // TODO: the real name
  PHONE: '(925) 408-6053',
  PHONE_TEL: '+19254086053',
  EMAIL: `hello@${DOMAIN}`,
};
