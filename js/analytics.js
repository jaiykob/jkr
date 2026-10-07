/**
 * GA4 for every public page that doesn't carry its own inline snippet: the
 * homepage, the town pages, the hub, the FAQ and the legal pages. The quote,
 * checkout and thanks pages keep their inline snippet (they fire their own
 * events). Carried over from Scoops Co., where the town pages sent nothing
 * until this file existed.
 *
 * Loaded with `defer`. Any element with data-track="event_name" (and an
 * optional data-service) fires a GA4 event when tapped.
 *
 * TODO: the real measurement ID, here and in the three booking pages.
 */
(function () {
  if (typeof window.gtag === 'function') return;   // page already has GA4 inline

  var ID = 'G-XXXXXXXXXX';
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', ID);

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-track]') : null;
    if (!el) return;
    try {
      window.gtag('event', el.getAttribute('data-track'), {
        service: el.getAttribute('data-service') || '',
        cta: (el.textContent || '').trim().slice(0, 40),
      });
    } catch (err) { /* analytics must never break a page */ }
  });
})();
