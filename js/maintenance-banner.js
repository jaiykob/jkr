/**
 * Site-wide "not booking yet" banner. Carried over from Scoops Co.
 *
 * Bookings are CLOSED until launch (the three gates in CLAUDE.md). This banner
 * is the public explanation; it gates nothing on its own. While the gates are
 * closed, the order page reserves a day without taking a card, and this says so.
 *
 * TO TURN OFF AT LAUNCH: set SHOW = false below, in the same sitting as
 * opening the booking gates. One edit, every page.
 *
 * NAMING A DATE IS OPTIONAL and off by default. Scoops Co. published a date
 * and missed it twice; a promise the site can't keep costs more trust than a
 * vague one. To publish one, set REOPEN_TEXT ("October 20"). The order page's
 * closed note reads it from window.SITE_REOPEN_TEXT (js/order.js), so the date
 * lives here and nowhere else. If you set one, move it the day it slips.
 */
(function () {
  var SHOW = false;         // off (founder 2026-10-13: "remove banner at top"); the order page says what it needs to
  var REOPEN_TEXT = null;   // null = no date named anywhere on the site

  // Published so the order page's closed note shows the same date.
  window.SITE_REOPEN_TEXT = REOPEN_TEXT;

  if (!SHOW) return;

  function mount() {
    if (document.getElementById('maint-banner')) return;

    var css = document.createElement('style');
    css.textContent = [
      '#maint-banner{',
      '  background:#FFD23F;color:#15171A;font-family:"DM Sans",system-ui,sans-serif;',
      '  text-align:center;padding:12px 18px;line-height:1.45;font-size:16px;',
      '  border-bottom:2px solid #15171A;position:relative;z-index:200;}',
      '#maint-banner b{font-weight:800;}',
      '#maint-banner .mb-sep{opacity:.5;margin:0 8px;}',
      '@media(max-width:620px){',
      '  #maint-banner{padding:10px 14px;}',
      '  #maint-banner .mb-sep{display:block;height:0;margin:2px 0;overflow:hidden;}}',
    ].join('');
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'maint-banner';
    bar.setAttribute('role', 'status');
    // Early access, not a closed door: the facts are the same either way (no
    // bookings and no cards until we open), stated as something to do now.
    // Spanish pages (es/) get it in Spanish; REOPEN_TEXT is then written in English.
    var es = document.documentElement.lang === 'es';
    var lead = es
      ? (REOPEN_TEXT ? '<b>Empezamos el ' + REOPEN_TEXT + '</b>, y ya estamos apartando días.' : '<b>Muy pronto abrimos las reservas</b>, y ya estamos apartando días.')
      : (REOPEN_TEXT ? '<b>We start hauling ' + REOPEN_TEXT + '</b>, and we are reserving days now.' : '<b>We open for booking soon</b>, and we are reserving days now.');
    bar.innerHTML = lead + '<span class="mb-sep">·</span>' + (es
      ? 'Ve tu precio y aparta un día. Sin tarjeta, no cobramos nada hasta el retiro.'
      : 'Get your price and claim a day. No card needed, nothing charged until we haul.');

    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
