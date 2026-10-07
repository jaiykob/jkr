/**
 * Founding member offer: the live "X of 10 spots left" banners. Carried over
 * from Scoops Co. Off while FOUNDING.open is false (api/_lib/founding.js).
 *
 * Reads GET /api/founding-spots once per page and reveals every element marked
 * `data-founding` (they ship `hidden`, so a closed offer, a failed read or no
 * JS all show nothing). Inside one, these are filled from the live terms:
 *
 *   [data-founding-left]    spots still open       "7"
 *   [data-founding-spots]   total spots            "10"
 *   [data-founding-pct]     percent off            "25"
 *   [data-founding-noun]    "spot" / "spots", agreeing with the TOTAL: it's
 *                           "1 of 10 spots left", never "1 of 10 spot left"
 *   [data-founding-plural="singular|plural"]
 *                           either form, agreeing with left ("Queda 1" /
 *                           "Quedan 7"); add data-founding-agree="spots" to
 *                           agree with the total instead ("de 10 lugares")
 *
 * No numbers are hardcoded in the markup: the terms live in
 * api/_lib/founding.js only. Checkout reads the same result through
 * window.SiteFounding.ready to price the booking.
 */
(function () {
  var TIMEOUT_MS = 4000;
  var CLOSED = { open: false, left: null, spots: null, percentOff: null };

  var ready = new Promise(function (resolve) {
    var done = false;
    function finish(v) { if (!done) { done = true; resolve(v); } }
    setTimeout(function () { finish(CLOSED); }, TIMEOUT_MS);
    try {
      fetch('/api/founding-spots', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : CLOSED; })
        .then(function (d) {
          var ok = d && d.open === true && d.left > 0 && d.percentOff > 0;
          finish(ok ? d : CLOSED);
        })
        .catch(function () { finish(CLOSED); });
    } catch (e) { finish(CLOSED); }
  });

  function fill(d) {
    var nodes = document.querySelectorAll('[data-founding]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!d.open) { el.hidden = true; continue; }
      set(el, '[data-founding-left]', d.left);
      set(el, '[data-founding-spots]', d.spots);
      set(el, '[data-founding-pct]', d.percentOff);
      var es = document.documentElement.lang === 'es';
      set(el, '[data-founding-noun]', d.spots === 1 ? (es ? 'lugar' : 'spot') : (es ? 'lugares' : 'spots'));
      var forms = el.querySelectorAll('[data-founding-plural]');
      for (var j = 0; j < forms.length; j++) {
        var pair = forms[j].getAttribute('data-founding-plural').split('|');
        var n = forms[j].getAttribute('data-founding-agree') === 'spots' ? d.spots : d.left;
        forms[j].textContent = n === 1 ? pair[0] : (pair[1] || pair[0]);
      }
      el.hidden = false;
    }
  }
  function set(root, sel, v) {
    var list = root.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) list[i].textContent = String(v);
  }

  window.SiteFounding = {
    ready: ready,
    /** Re-apply a state to the banners, e.g. after checkout learns the last spot went. */
    render: fill,
  };

  ready.then(function (d) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { fill(d); });
    else fill(d);
  });
})();
