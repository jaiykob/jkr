/* The prices page calculator (prices.html), laid out like Novah's: the load size
   on a slider and the travel zone (from the ZIP, or picked by hand) on the left,
   the total on the right, live. Sizes and prices come from window.ORDER
   (js/order-config.js) and the zones from window.TRAVEL (js/travel.js): the same
   generated modules the order page and the server price from, so the calculator
   never shows a number the booking would not charge. "Book this load" opens the
   order page with the size and the ZIP filled in; the photos tab opens the
   photo quote. A ZIP typed here is kept for the rest of the site (quoteZip). */
(function () {
  'use strict';
  var ORDER = window.ORDER, TRAVEL = window.TRAVEL;
  var $ = function (id) { return document.getElementById(id); };
  var range = $('sizeRange');
  if (!ORDER || !TRAVEL || !range) return;

  var SIZES = ORDER.SIZES, ZONES = TRAVEL.ZONES;
  var GUESSED = !!(ORDER.GUESS.prices || TRAVEL.GUESS);
  var zipIn = $('zipIn'), zipOut = $('zipOut'), num = $('totalNum'), total = $('total');
  var zoneBtns = [].slice.call(document.querySelectorAll('.p-zone'));
  var ticks = [].slice.call(document.querySelectorAll('#sizeTicks li'));
  var tabs = [].slice.call(document.querySelectorAll('.p-tab'));
  var ZIP_HINT = zipOut.textContent;
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var state = { size: +range.value, zone: 0, zip: '', tab: 'size' };

  function money(c) { return '$' + (c / 100).toFixed(2); }
  function big(c) { var s = money(c), i = s.indexOf('.'); return s.slice(0, i) + '<small>' + s.slice(i) + '</small>'; }
  // "1/2 truck" -> big "1/2", small "truck", as Novah sets "60 m²".
  function split(label) { var i = label.lastIndexOf(' '); return i < 0 ? [label, ''] : [label.slice(0, i), label.slice(i + 1)]; }

  // The total counts up or down to its new value, as Novah's does.
  var shown = null, frame = 0;
  function showTotal(cents) {
    cancelAnimationFrame(frame);
    if (shown === null || calm) { shown = cents; num.innerHTML = big(cents); return; }
    var from = shown, t0 = performance.now();
    shown = cents;
    (function step(t) {
      var k = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - k, 3);
      num.innerHTML = big(k < 1 ? Math.round((from + (cents - from) * e) / 100) * 100 : cents);
      if (k < 1) frame = requestAnimationFrame(step);
    })(t0);
  }

  function render() {
    var s = SIZES[state.size], z = ZONES[state.zone], photos = state.tab === 'photos';
    var parts = split(s.label);
    $('sizeMain').textContent = parts[0];
    $('sizeUnit').textContent = parts[1];
    $('sizeNote').textContent = s.note;
    range.value = state.size;
    range.style.setProperty('--fill', (state.size / (SIZES.length - 1)) * 100 + '%');
    range.setAttribute('aria-valuetext', s.label);
    ticks.forEach(function (t, i) { t.classList.toggle('is-on', i === state.size); });
    zoneBtns.forEach(function (b, i) {
      b.setAttribute('aria-checked', String(i === state.zone));
      b.tabIndex = i === state.zone ? 0 : -1;
    });

    total.classList.toggle('is-photos', photos);
    num.className = GUESSED ? 'guess' : '';
    var zipPart = state.zip ? 'zip=' + state.zip : '';
    if (photos) {
      // From photos: the lowest price until the photos pick the size.
      $('totalK').textContent = 'From';
      showTotal(SIZES[0].cents + z.cents);
      $('totalSum').textContent = SIZES[0].label + (z.cents ? ' + travel ' + money(z.cents) : ', no travel charge') + '. Your photos pick the size.';
      $('bookLabel').textContent = 'Get a price from photos';
      $('bookBtn').href = 'book/quote.html' + (zipPart ? '?' + zipPart : '') + '#photos';
      $('totalSay').textContent = 'From ' + money(SIZES[0].cents + z.cents);
      return;
    }
    $('totalK').textContent = 'Total';
    showTotal(s.cents + z.cents);
    $('totalSum').textContent = s.label + ' ' + money(s.cents) + (z.cents ? ' + travel ' + money(z.cents) : ', no travel charge');
    $('fillBar').style.width = s.fits + '%';
    $('fillText').textContent = s.fits >= 100 ? 'The whole truck' : 'Up to ' + s.fits + '%';
    $('lineLoadK').textContent = 'Load, ' + s.label;
    $('lineLoad').textContent = money(s.cents);
    $('lineTravelK').textContent = 'Travel, ' + z.label;
    $('lineTravel').textContent = z.cents ? money(z.cents) : 'No charge';
    $('bookLabel').textContent = 'Book this load';
    $('bookBtn').href = 'book/quote.html?size=' + s.row + (zipPart ? '&' + zipPart : '');
    $('totalSay').textContent = 'Total ' + money(s.cents + z.cents);
  }

  range.addEventListener('input', function () { state.size = +range.value; render(); });

  /* ── the ZIP picks the zone ── */
  function onZip() {
    var v = zipIn.value.replace(/\D/g, '').slice(0, 5);
    if (v !== zipIn.value) zipIn.value = v;
    zipOut.classList.remove('is-bad');
    state.zip = '';
    if (v.length < 5) { zipOut.textContent = ZIP_HINT; render(); return; }
    var t = TRAVEL.travelFor(v);
    if (!t) {
      zipOut.classList.add('is-bad');
      zipOut.innerHTML = 'We do not have ' + v + ' in our zones. Call or text <a href="tel:+19254086053">(925) 408-6053</a> and we price it for you.';
      render();
      return;
    }
    state.zip = v;
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].key === t.zone) state.zone = i;
    zipOut.textContent = t.place + ', ' + t.state + ': about ' + Math.round(t.miles) + ' road miles from Gresham, ' + t.label + '.';
    try { sessionStorage.setItem('quoteZip', v); } catch (e) { /* private mode */ }
    render();
  }
  zipIn.addEventListener('input', onZip);

  /* ── or a zone picked by hand (clears a ZIP that says otherwise) ── */
  function pickZone(i) {
    state.zone = i;
    if (state.zip) { state.zip = ''; zipIn.value = ''; zipOut.classList.remove('is-bad'); zipOut.textContent = ZIP_HINT; }
    render();
  }
  zoneBtns.forEach(function (b, i) {
    b.addEventListener('click', function () { pickZone(i); });
    b.addEventListener('keydown', function (e) {
      var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      var n = (i + d + zoneBtns.length) % zoneBtns.length;
      pickZone(n);
      zoneBtns[n].focus();
    });
  });

  /* ── the two tabs: pick a size, or from photos ── */
  function pickTab(i, focus) {
    tabs.forEach(function (t, j) {
      t.setAttribute('aria-selected', String(j === i));
      t.tabIndex = j === i ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = j !== i;
    });
    state.tab = tabs[i].id === 'tab-photos' ? 'photos' : 'size';
    if (focus) tabs[i].focus();
    render();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { pickTab(i); });
    t.addEventListener('keydown', function (e) {
      var d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); pickTab((i + d + tabs.length) % tabs.length, true); }
    });
  });

  // A ZIP typed earlier on the site starts the calculator in its zone.
  var saved = '';
  try { saved = sessionStorage.getItem('quoteZip') || ''; } catch (e) { /* private mode */ }
  if (/^\d{5}$/.test(saved)) { zipIn.value = saved; onZip(); } else render();
})();
