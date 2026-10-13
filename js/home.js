/* Homepage (and the town pages built from it): the travel line on the size cards,
   and things fading up as they come into view. Each piece is optional; without JS
   the page is plain and every link still goes to the order page. */
(function () {
  'use strict';
  var T = window.TRAVEL;
  var ES = document.documentElement.lang === 'es';

  // The five size cards are links to the order page. Once a ZIP is known (typed
  // anywhere on the site, sessionStorage quoteZip) each says what travel adds
  // (js/size-cards.js) and carries the ZIP; until then "+ travel".
  var words = ES ? { none: 'Sin cargo de viaje', suffix: ' de viaje' } : null;
  var sizes = window.SizeCards ? SizeCards.mount(document.getElementById('homeSizes'), { words: words }) : null;
  var zip = '';
  try { zip = sessionStorage.getItem('quoteZip') || ''; } catch (e) { /* private mode */ }
  var trip = T && /^\d{5}$/.test(zip) ? T.travelFor(zip) : null;
  if (sizes && trip) {
    sizes.setTravel(trip, !!T.GUESS);
    [].forEach.call(document.querySelectorAll('#homeSizes a.size-card'), function (a) { a.setAttribute('href', a.getAttribute('href') + '&zip=' + trip.zip); });
  }

  // What we take (Novah's "what's included" box): a job picked in the list on the
  // left opens its card, closes the others and brings it into view; the list marks
  // the card opened last. Each card also opens and closes by itself (<details>).
  var scope = document.querySelector('.scope');
  if (scope) {
    var cards = [].slice.call(scope.querySelectorAll('.scope-card'));
    var picks = [].slice.call(scope.querySelectorAll('.scope-nav a'));
    var mark = function (key) {
      picks.forEach(function (a) {
        if (a.getAttribute('data-scope') === key) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    };
    picks.forEach(function (a) {
      a.addEventListener('click', function (e) {
        var card = document.getElementById('scope-' + a.getAttribute('data-scope'));
        if (!card) return;
        e.preventDefault();
        cards.forEach(function (c) { c.open = c === card; });
        mark(a.getAttribute('data-scope'));
        var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        card.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
        card.querySelector('summary').focus({ preventScroll: true });
      });
    });
    cards.forEach(function (c) {
      c.addEventListener('toggle', function () { if (c.open) mark(c.id.replace('scope-', '')); });
    });
  }

  // Fading up into view (Novah's): what is below the first screen starts low and
  // faint, and settles as it scrolls in. Never with reduced motion, and never
  // without IntersectionObserver (then everything simply shows).
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  var items = [].slice.call(document.querySelectorAll('.reveal'));
  if (!items.length) return;
  document.documentElement.classList.add('js-reveal');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  items.forEach(function (el) { io.observe(el); });
})();
