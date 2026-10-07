/**
 * Brand Name: email templates.
 *
 * Each template is a pure function: ctx in, { subject, html, text } out. No
 * sending here (that's email.js), no data fetching — callers pass a plain ctx
 * so templates stay testable and the wiring site decides where data comes from.
 *
 * Two classes, matching the transactional/marketing split:
 *   TRANSACTIONAL (no unsubscribe, sent off a customer action):
 *     1. bookingConfirmation   2. paymentFailed   3. serviceComplete
 *   MARKETING (CAN-SPAM: physical address + unsubscribe required):
 *     4. reviewRequest   5. leadRecapture   6. visitReminder   7. winBack
 *   TO THE OWNER (OPS_EMAIL, transactional):
 *     8. ownerBooking
 *
 *   visitReminder is operational but we treat its footer as marketing-grade
 *   (address + unsubscribe) so it's safe to route through the marketing domain
 *   alongside SMS once A2P clears.
 */

/**
 * SUBJECT LINES — house rules, because these are the only part of an email most
 * people ever read:
 *   1. Never repeat the brand. The From name is already "Brand Name"; spending
 *      the ~35 characters a phone shows on saying it twice buys nothing.
 *   2. No emoji. Every subject here used to carry a 🐾 or 🌿, which reads as
 *      marketing on a booking confirmation and costs inbox placement on the
 *      transactional ones that must arrive.
 *   3. Lead with the specific fact — the day, the amount, the thing that
 *      happened — not a category label. "We're hauling Tuesday" beats
 *      "Reminder: Brand Name visits".
 * Keep them under ~45 characters so nothing truncates on a phone.
 */

const site = require('./site');

const BRAND = {
  name:    'Brand Name',
  green:   '#15171A',
  deep:    '#15171A',
  tan:     '#FFD23F',
  page:    '#F5F2EA',
  card:    '#FFFFFF',
  text:    '#15171A',
  muted:   'rgba(21,23,26,.65)',
  border:  'rgba(21,23,26,.12)',
  // Dedicated email asset — NOT images/logo.png. That file is 1402x1122 and
  // ~972KB, and the header rendered it into a 44x44 box, so every email pulled
  // a megabyte to show a squashed, wrong-aspect thumbnail. This one is 144x96
  // (2x of the 72x48 display box), matches the mark's real 3:2 aspect, and is
  // 5.6KB. Regenerate from images/logo-mark.png if the mark ever changes.
  logo:    `${site.SITE_URL}/images/email-logo.png`,
  site:    site.SITE_URL,
  phone:   '(925) 408-6053',
  email:   site.EMAIL,
  // CAN-SPAM requires a valid physical postal address in marketing email.
  // TODO before first marketing send: set EMAIL_MAILING_ADDRESS to a PO box or
  // the DBA/registered-agent address — do NOT leak a home address.
  address: () => process.env.EMAIL_MAILING_ADDRESS || 'Gresham, OR',
};

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function button(label, url) {
  if (!url) return '';
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
    <tr><td style="border-radius:10px;background:${BRAND.green};">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font-family:'DM Sans',Arial,sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

/**
 * Shared HTML shell. Marketing variant adds the CAN-SPAM footer block.
 * @param {{preheader?:string, heading:string, bodyHtml:string, marketing?:boolean, unsubscribeUrl?:string}} o
 */
function layout({ preheader = '', heading, bodyHtml, marketing = false, unsubscribeUrl, title }) {
  // The shell shipped without a <title>, which is what clients use for the
  // browser tab on "view in browser" and what some webmail shows above the
  // message — so it was falling back to junk. Defaults to the heading, which
  // is always a real sentence.
  const docTitle = escapeHtml(title || heading || BRAND.name);
  const footerLegal = marketing
    ? `<p style="margin:8px 0;color:${BRAND.muted};font-size:12px;line-height:1.6;">
         You're getting this because you contacted ${BRAND.name} about junk removal.<br/>
         ${escapeHtml(BRAND.address())}<br/>
         ${unsubscribeUrl ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe</a>` : 'Reply STOP to opt out.'}
       </p>`
    : `<p style="margin:8px 0;color:${BRAND.muted};font-size:12px;line-height:1.6;">
         ${BRAND.name} · Gresham, OR · <a href="tel:+19254086053" style="color:${BRAND.muted};">${BRAND.phone}</a>
       </p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${docTitle} · ${BRAND.name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light"/>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.page};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
        <!-- Brand band. The logo mark is CREAM — it's drawn for the site's dark
             green nav — so it has to sit on ${BRAND.deep} here too. It spent its
             first run on the white card, where a cream silhouette on #FFFFFF was
             invisible in every client.
             The wordmark beside it is live text, not part of the image, so the
             header still reads as Brand Name when a client blocks images (Outlook
             blocks by default) instead of rendering an empty white box. -->
        <tr><td style="background:${BRAND.deep};padding:20px 32px;">
          <table role="presentation" cellspacing="0" cellpadding="0"><tr>
            <td style="padding-right:12px;">
              <img src="${BRAND.logo}" width="72" height="48" alt="" style="display:block;border:0;width:72px;height:48px;"/>
            </td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:-.01em;color:${BRAND.tan};white-space:nowrap;">
              ${BRAND.name}
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;font-family:'DM Sans',Arial,sans-serif;">
          <h1 style="margin:0;font-size:22px;line-height:1.3;color:${BRAND.deep};font-weight:700;">${escapeHtml(heading)}</h1>
        </td></tr>
        <tr><td style="padding:0 32px 8px;font-family:'DM Sans',Arial,sans-serif;font-size:16px;line-height:1.6;color:${BRAND.text};">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid ${BRAND.border};font-family:'DM Sans',Arial,sans-serif;">
          ${footerLegal}
        </td></tr>
      </table>
      <p style="max-width:560px;margin:16px auto 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:${BRAND.muted};text-align:center;">
        © ${new Date().getFullYear()} ${BRAND.name} · <a href="${BRAND.site}" style="color:${BRAND.muted};">${site.DOMAIN}</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

// Small helper for a labeled detail row inside the card.
function detail(label, value) {
  if (value == null || value === '') return '';
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:${BRAND.muted};width:120px;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:15px;color:${BRAND.text};font-weight:600;">${escapeHtml(value)}</td>
  </tr>`;
}

/* ─────────────────────────  TRANSACTIONAL  ───────────────────────── */

// 1. Booking confirmation: fires once the money lands (the webhook).
function bookingConfirmation(ctx = {}) {
  const { name, plan, amount, frequency, pickupDay, address, load, travel } = ctx;
  // heading is passed raw: layout() escapes it (escaping here would double-encode).
  const heading = `You're booked${name ? ', ' + name : ''}!`;
  const rows = [
    detail('Plan', plan),
    detail('Frequency', frequency),
    detail('Day', pickupDay),
    detail('Address', address),
    detail('Load', load),
    detail('Travel', travel),
    detail('Charged', amount),
  ].join('');
  const bodyHtml = `
    <p style="margin:0 0 12px;">Thanks for booking with ${BRAND.name}. Your haul is confirmed, and here are the details:</p>
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="margin:12px 0;">${rows}</table>
    <p style="margin:12px 0;">On the day we will text you an arrival window. We do all the lifting and loading. Anything still usable goes to donation, metal and electronics go to recycling, and the rest goes to the transfer station.</p>
    <p style="margin:12px 0;">If there is more on the day than your photos or taps showed, we show you the new price before we load anything, and you decide.</p>
    <p style="margin:12px 0;">Questions? Reply to this email or call <a href="tel:+19254086053" style="color:${BRAND.green};">${BRAND.phone}</a>.</p>`;
  return {
    subject: pickupDay ? `You're booked for ${pickupDay}` : "You're booked",
    html: layout({ preheader: 'Your haul is confirmed. Here are the details.', heading, bodyHtml }),
    text: `You're booked${name ? ', ' + name : ''}!\n\nPlan: ${plan || ''}\nFrequency: ${frequency || ''}\nDay: ${pickupDay || ''}\nAddress: ${address || ''}${load ? `\nLoad: ${load}` : ''}${travel ? `\nTravel: ${travel}` : ''}\nCharged: ${amount || ''}\n\nWe will text you an arrival window, then do all the lifting and hauling.\nQuestions? Reply here or call ${BRAND.phone}.\n${BRAND.name}`,
  };
}

// 2. Payment failed: fires off invoice.payment_failed (renewals only).
function paymentFailed(ctx = {}) {
  const { name, amount, updateUrl } = ctx;
  const heading = 'Your payment did not go through';
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi${name ? ' ' + escapeHtml(name) : ''}, we could not process your most recent payment${amount ? ` of <strong>${escapeHtml(amount)}</strong>` : ''}.</p>
    <p style="margin:12px 0;">Your pickups are safe. We only need a working card on file to keep them going, and it takes a minute:</p>
    ${button('Update my card', updateUrl)}
    <p style="margin:12px 0;">If you think this is a mistake, or you would rather sort it out by phone, reply here or call <a href="tel:+19254086053" style="color:${BRAND.green};">${BRAND.phone}</a>.</p>`;
  return {
    subject: amount ? `Your ${amount} payment did not go through` : 'Your payment did not go through',
    html: layout({ preheader: 'We could not process your last payment. Here is the fix.', heading, bodyHtml }),
    text: `Hi${name ? ' ' + name : ''}, we could not process your last payment${amount ? ` of ${amount}` : ''}.\nUpdate your card to keep your pickups going: ${updateUrl || BRAND.site}\nQuestions? Reply here or call ${BRAND.phone}.\n${BRAND.name}`,
  };
}

// 3. Service complete: fires when a visit is marked done (visit-tracking trigger).
//
// The "cleared" line is conditional on afterPhotoUrl: this email only claims
// what a photo backs up. Same rule Scoops Co. used for its gate photo.
function serviceComplete(ctx = {}) {
  const { name, visitDate, nextVisitDate, photoUrl, beforePhotoUrl, address } = ctx;
  const heading = 'All done, your space is clear';
  const photo = (url, alt, caption) => url
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="100%" style="display:block;border:0;border-radius:12px;margin:12px 0 4px;max-width:496px;"/>
       ${caption ? `<p style="margin:0 0 12px;font-size:13px;color:${BRAND.muted};">${escapeHtml(caption)}</p>` : ''}`
    : '';
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi${name ? ' ' + escapeHtml(name) : ''}, we just finished${visitDate ? ` your ${escapeHtml(visitDate)} job` : ' your job'}${address ? ` at ${escapeHtml(address)}` : ''}. Everything is loaded and on its way out.</p>
    ${photo(beforePhotoUrl, 'Before we started', 'Before.')}
    ${photo(photoUrl, 'The space after we cleared it', 'After.')}
    ${nextVisitDate ? `<p style="margin:12px 0;">Your next pickup is scheduled for <strong>${escapeHtml(nextVisitDate)}</strong>.</p>` : ''}
    <p style="margin:12px 0;">See anything we missed? Reply to this email and we will make it right.</p>`;
  return {
    subject: nextVisitDate ? `All done, back ${nextVisitDate}` : 'All done, your space is clear',
    html: layout({ preheader: 'Job complete. Everything is loaded and hauled away.', heading, bodyHtml }),
    text: `Hi${name ? ' ' + name : ''}, we finished${visitDate ? ` your ${visitDate} job` : ' your job'}. Everything is loaded and hauled away.${nextVisitDate ? `\nNext pickup: ${nextVisitDate}.` : ''}\nMissed something? Reply here.\n${BRAND.name}`,
  };
}

/* ─────────────────────────  MARKETING  ───────────────────────── */

// 4. Review request: after a finished job; Google reviews are the biggest growth lever.
function reviewRequest(ctx = {}) {
  const { name, reviewUrl, unsubscribeUrl } = ctx;
  const heading = 'How did we do?';
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi${name ? ' ' + escapeHtml(name) : ''}, thanks again for choosing us for your haul.</p>
    <p style="margin:12px 0;">If you have 30 seconds, a short Google review helps other people nearby find us more than anything else we could do.</p>
    ${button('Leave a review', reviewUrl)}
    <p style="margin:12px 0;">And if anything was less than right, reply here first. We would rather fix it.</p>`;
  return {
    subject: 'How did we do?',
    html: layout({ preheader: 'A 30 second Google review helps more than anything.', heading, bodyHtml, marketing: true, unsubscribeUrl }),
    text: `Hi${name ? ' ' + name : ''}, thanks for choosing us.\nA short Google review helps other people nearby find us: ${reviewUrl || BRAND.site}\nAnything less than right? Reply here first.\n${BRAND.name}`,
  };
}

// 5. Lead recapture: quoted but never booked. Sent by the follow-up helpers.
function leadRecapture(ctx = {}) {
  const { name, quoteUrl, quotedPrice, unsubscribeUrl } = ctx;
  const heading = 'Your price is still here';
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi${name ? ' ' + escapeHtml(name) : ''}, you got a price from us${quotedPrice ? ` (${escapeHtml(quotedPrice)}, travel included)` : ''} but did not finish booking. No rush.</p>
    <p style="margin:12px 0;">When you are ready, pick a day and we will do all the lifting and hauling. If there is more on the day than you showed us, you see the new price before we load anything.</p>
    ${button('Pick up where you left off', quoteUrl)}
    <p style="margin:12px 0;">Have a question first? Reply to this email or call <a href="tel:+19254086053" style="color:${BRAND.green};">${BRAND.phone}</a>.</p>`;
  return {
    subject: quotedPrice ? `Your ${quotedPrice} price is still here` : 'Your price is still here',
    html: layout({ preheader: 'Pick a day when you are ready. We do the lifting.', heading, bodyHtml, marketing: true, unsubscribeUrl }),
    text: `Hi${name ? ' ' + name : ''}, you got a price from us${quotedPrice ? ` (${quotedPrice}, travel included)` : ''} but did not finish booking.\nWhen you are ready: ${quoteUrl || BRAND.site}\nQuestions? ${BRAND.phone}.\n${BRAND.name}`,
  };
}

// 6. Visit reminder: the day before (email until SMS clears A2P).
function visitReminder(ctx = {}) {
  const { name, visitDate, pickupDay, unsubscribeUrl } = ctx;
  const heading = 'We are coming by soon';
  const when = visitDate || pickupDay || 'your next scheduled day';
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi${name ? ' ' + escapeHtml(name) : ''}, this is a reminder that ${BRAND.name} is scheduled to come on <strong>${escapeHtml(when)}</strong>.</p>
    <p style="margin:12px 0;">To help us get in and out: please make sure the items are easy to reach and there is room for the truck to park. We will text you an arrival window.</p>
    <p style="margin:12px 0;">Need a different day? Reply here or call <a href="tel:+19254086053" style="color:${BRAND.green};">${BRAND.phone}</a>.</p>`;
  return {
    subject: `We're hauling ${when}`,
    html: layout({ preheader: 'Please make sure the items are easy to reach.', heading, bodyHtml, marketing: true, unsubscribeUrl }),
    text: `Hi${name ? ' ' + name : ''}, a reminder: ${BRAND.name} comes ${when}.\nPlease make sure the items are easy to reach and there is room to park.\nNeed a different day? Reply or call ${BRAND.phone}.\n${BRAND.name}`,
  };
}

// 7. Win-back: reach out to a customer whose monthly pickups ended.
function winBack(ctx = {}) {
  const { name, reactivateUrl, offer, unsubscribeUrl } = ctx;
  const heading = 'We would be glad to help again';
  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi${name ? ' ' + escapeHtml(name) : ''}, it has been a while since your last ${BRAND.name} pickup, and we would be glad to help again.</p>
    <p style="margin:12px 0;">Starting again is easy: the same crew and the same up front pricing, travel included.${offer ? ` <strong>${escapeHtml(offer)}</strong>` : ''}</p>
    ${button('Start my pickups again', reactivateUrl)}
    <p style="margin:12px 0;">Or reply and tell us what day works, and we will handle the rest.</p>`;
  return {
    subject: 'Ready to start your pickups again?',
    html: layout({ preheader: 'The same crew, the same up front pricing.', heading, bodyHtml, marketing: true, unsubscribeUrl }),
    text: `Hi${name ? ' ' + name : ''}, it has been a while, and we would be glad to help again.${offer ? ' ' + offer : ''}\nStart again: ${reactivateUrl || BRAND.site}\nOr reply with a day that works.\n${BRAND.name}`,
  };
}

/* ─────────────────────────  TO THE OWNER  ───────────────────────── */

// 8. Owner booking: to OPS_EMAIL on every new booking, beside the Discord
// ping, so the two alerts fail independently (a dead Discord webhook used to
// mean no alert at all; Scoops Co. punch list). Plain and scannable.
function ownerBooking(ctx = {}) {
  const { name, phone, email, amount, plan, load, travel, address, pickupDay, items, photoCount, dashboardUrl, stripeUrl } = ctx;
  const heading = `New booking: ${load || 'a haul'}${pickupDay ? `, ${pickupDay}` : ''}`;
  const rows = [
    detail('Customer', name),
    detail('Phone', phone),
    detail('Email', email),
    detail('Address', address),
    detail('Day', pickupDay),
    detail('Plan', plan),
    detail('Load', load),
    detail('Travel', travel),
    detail('Items', items),
    detail('Photos', photoCount ? `${photoCount} sent with the quote (open the dashboard to see them)` : null),
    detail('Charged', amount),
  ].join('');
  const bodyHtml = `
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="margin:4px 0 12px;">${rows}</table>
    ${button('Open the dashboard', dashboardUrl)}
    ${stripeUrl ? `<p style="margin:12px 0;"><a href="${escapeHtml(stripeUrl)}" style="color:${BRAND.green};">The customer in Stripe</a></p>` : ''}`;
  return {
    subject: `New booking: ${amount || 'paid'}, ${load || 'haul'}${pickupDay ? `, ${pickupDay}` : ''}`,
    html: layout({ preheader: `${name || 'A customer'} booked ${load || 'a haul'}.`, heading, bodyHtml }),
    text: `New booking\n\nCustomer: ${name || ''}\nPhone: ${phone || ''}\nEmail: ${email || ''}\nAddress: ${address || ''}\nDay: ${pickupDay || ''}\nPlan: ${plan || ''}\nLoad: ${load || ''}\nTravel: ${travel || ''}\nItems: ${items || ''}\nPhotos: ${photoCount || 0}\nCharged: ${amount || ''}\n\nDashboard: ${dashboardUrl || ''}`,
  };
}

module.exports = {
  BRAND,
  escapeHtml,
  layout,
  // transactional
  bookingConfirmation,
  paymentFailed,
  serviceComplete,
  // marketing
  reviewRequest,
  leadRecapture,
  visitReminder,
  winBack,
  // to the owner
  ownerBooking,
};
