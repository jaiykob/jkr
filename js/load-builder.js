/* Load builder: tap what you have, watch it drop into the truck, see the price.
   Used by the homepage hero and step 1 of book/quote.html.

   Everything it knows comes from window.LOAD_BUILDER, which
   `npm run build:pricing` generates from pricing.config.mjs, so this file holds
   no prices. Items only pick a load size; the price is always the size's price
   plus the travel fee for the customer's ZIP (window.TRAVEL, js/travel.js),
   and the server reprices both on its own.

   Until it knows the ZIP the truck shows the load price with "+ travel", never
   a total that leaves travel out. The last ZIP typed anywhere on the site is
   kept in sessionStorage (quoteZip), so a ZIP checked on the homepage prices
   the truck there and on the quote.

   LoadBuilder.mount(el, { fi, freq: true|false, cta: {href}, persist, photos: {endpoint}, travel, onChange })
     → { setFreq(fi), setLoad(row), setTravel(trip|null), state }               */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var COLS = 10, ROWS = 10;                // 100 cells = one full truck
  var BED = { x: 22, y: 34, w: 250, h: 136 };
  var KEY = 'loadBuild';   // sessionStorage: the tapped items, in order
  // The last read back line of a photo quote, kept apart from the order page's.
  var NOTE_KEY = 'quotePhotoNote';
  // sessionStorage: the last ZIP typed on any page (a plain string).
  var ZIP_KEY = 'quoteZip';
  // The photo quote itself (shrink, upload, thumbnails, the stored photo paths)
  // lives in js/photo-quote.js, shared with the order page; it is loaded from
  // next to this file when a page asks for photos.
  var SELF = document.currentScript && document.currentScript.src;
  function withPhotoQuote(fn) {
    if (window.PhotoQuote) return fn(window.PhotoQuote);
    var s = document.createElement('script');
    s.src = SELF ? SELF.replace(/[^/]*$/, 'photo-quote.js') : '/js/photo-quote.js';
    s.onload = function () { if (window.PhotoQuote) fn(window.PhotoQuote); };
    document.head.appendChild(s);
  }

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Words, by <html lang>: the Spanish pages (es/) get Spanish. Item and load
     names come translated in window.LOAD_BUILDER (scripts/build-es.mjs). */
  var ES = document.documentElement.lang === 'es';
  var S = ES ? {
    truck: 'El camión, que se llena mientras agregas cosas', tap: 'Toca lo que tienes', often: '¿Cada cuánto?',
    book: 'Reservar esta carga', remove: 'Quitar uno: ', add: 'Agregar uno: ', over: 'Se pasa por ', more: 'Más de un camión',
    full: '% lleno', plusTravel: ' + viaje', callUs: 'Llámanos', moreLive: 'Más de un camión. Llámanos para darte un precio.',
    plusZip: ', más el viaje según el código postal', including: ', con ', travelAfter: ' de viaje',
    byZip: 'El viaje se suma según el código postal.', travelFee: ' de viaje', noTravel: 'Sin cargo de viaje', includes: 'Incluye ', inThe: ' en la ',
    snap: 'Toma una foto', sendUpTo: function (n) { return 'Manda hasta ' + n + ' fotos y nosotros las contamos'; }, or: 'o toca lo que tienes',
    getting: 'Preparando tus fotos…', cantOpen: 'No pudimos abrir esas fotos. Prueba con otras, o toca lo que tienes abajo.',
    looking: 'Revisando tus fotos…', tapBelow: 'Toca lo que tienes abajo y nosotros seguimos desde ahí.', weCount: 'Contamos: ',
    lookRight: ' ¿Está bien? Toca + o − para corregirlo.',
    cantRead: 'No pudimos leer las fotos en este momento. Toca lo que tienes abajo. Si las fotos llegaron, igual las vamos a ver.'
  } : {
    truck: 'The truck, filling up as you add items', tap: 'Tap what you have', often: 'How often',
    book: 'Book this load', remove: 'Remove one: ', add: 'Add one: ', over: 'Over by ', more: 'More than a truck',
    full: '% full', plusTravel: ' + travel', callUs: 'Call us', moreLive: 'More than a truck. Call us for a price.',
    plusZip: ', plus travel by ZIP code', including: ', including ', travelAfter: ' travel',
    byZip: 'Travel is added by ZIP code.', travelFee: ' travel', noTravel: 'No travel charge', includes: 'Includes ', inThe: ' in the ',
    snap: 'Snap your junk', sendUpTo: function (n) { return 'Send up to ' + n + ' photos and we count it for you'; }, or: 'or tap what you have',
    getting: 'Getting your photos ready…', cantOpen: 'We could not open those photos. Try different ones, or tap what you have below.',
    looking: 'Looking at your photos…', tapBelow: 'Tap what you have below and we will take it from there.', weCount: 'We count: ',
    lookRight: ' Look right? Tap + or − to fix it.',
    cantRead: 'We could not read the photos right now. Tap what you have below. If the photos came through, we will still see them.'
  };
  // The zone names come from js/travel.js in English ("Home zone", "Zone 2").
  function zoneName(l) { return ES ? String(l).replace(/^Home zone$/, 'Zona base').replace(/^Zone /, 'Zona ') : l; }

  function fmt(c) { return '$' + (c / 100).toFixed(2); }
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* The smallest load size that holds `units`. null for nothing, MORE for
     more than a truck. */
  function rowFor(D, units) {
    if (units <= 0) return null;
    for (var r = 0; r < D.loads.length; r++) if (units <= D.loads[r].fits) return r;
    return D.loads.length;
  }

  function truck(svg) {
    // cab
    el('path', { d: 'M284 78h62c8 0 14 3 19 9l26 32c4 5 6 10 6 16v35c0 5-4 9-9 9H284z', class: 'lb-cab' }, svg);
    el('path', { d: 'M296 90h46c4 0 7 2 9 4l19 24c2 3 0 6-3 6h-71z', class: 'lb-glass' }, svg);
    el('rect', { x: 380, y: 150, width: 17, height: 9, rx: 3, class: 'lb-lamp' }, svg);
    // cargo box, cut away so the load shows
    el('rect', { x: 10, y: 22, width: 274, height: 160, rx: 10, class: 'lb-box' }, svg);
    el('rect', { x: BED.x, y: BED.y, width: BED.w, height: BED.h, rx: 4, class: 'lb-bed' }, svg);
    // chassis and wheels
    el('rect', { x: 4, y: 180, width: 398, height: 12, rx: 6, class: 'lb-chassis' }, svg);
    [70, 214, 348].forEach(function (cx) {
      el('circle', { cx: cx, cy: 196, r: 22, class: 'lb-tire' }, svg);
      el('circle', { cx: cx, cy: 196, r: 9, class: 'lb-hub' }, svg);
    });
  }

  function mount(root, opts) {
    var D = window.LOAD_BUILDER;
    if (!root || !D) return null;
    opts = opts || {};
    var MORE = D.loads.length;
    var state = { counts: {}, seq: [], units: 0, row: null, fi: opts.fi != null ? opts.fi : D.oneTimeCol, manual: null };
    // Travel for the customer's ZIP, or null while we don't know it.
    var T = window.TRAVEL || null;
    var trip = opts.travel !== undefined ? opts.travel : savedTrip();
    function savedTrip() {
      if (!T) return null;
      try { return T.travelFor(sessionStorage.getItem(ZIP_KEY) || ''); } catch (e) { return null; }
    }

    // The host is the size container; the layout lives one level down,
    // because a container query can't restyle the container itself.
    root.innerHTML = '';
    root.classList.add('lb-host');
    var host = root;
    root = h('div', 'lb');
    host.appendChild(root);

    /* ── photos: snap the junk, Claude counts it (api/photo-quote.js) ───── */
    if (opts.photos) photoPanel();

    /* ── stage: truck + readout ─────────────────────────────────────────── */
    var stage = h('div', 'lb-stage');
    var svg = el('svg', { viewBox: '0 0 410 222', role: 'img', 'aria-label': S.truck });
    truck(svg);
    var cellsG = el('g', { class: 'lb-cells' }, svg);
    var cw = BED.w / COLS, ch = BED.h / ROWS, cells = [];
    for (var i = 0; i < COLS * ROWS; i++) {
      var c = i % COLS, r = Math.floor(i / COLS);
      cells.push(el('rect', {
        x: (BED.x + c * cw + 1).toFixed(2), y: (BED.y + BED.h - (r + 1) * ch + 1).toFixed(2),
        width: (cw - 2).toFixed(2), height: (ch - 2).toFixed(2), rx: 2, class: 'lb-cell',
      }, cellsG));
    }
    // a hatched fill for "I already know my size"
    var ghost = el('rect', { x: BED.x, width: BED.w, class: 'lb-ghost', y: BED.y + BED.h, height: 0 }, svg);
    // tier lines at each load size's ceiling
    D.loads.forEach(function (L, k) {
      if (L.fits >= 100 || k === 0) return;
      var y = BED.y + BED.h * (1 - L.fits / 100);
      el('line', { x1: BED.x, x2: BED.x + BED.w, y1: y, y2: y, class: 'lb-tierline' }, svg);
      var t = el('text', { x: BED.x + BED.w - 6, y: y - 4, class: 'lb-tiertext', 'text-anchor': 'end' }, svg);
      t.textContent = L.label;
    });
    var over = el('text', { x: 147, y: 16, class: 'lb-over', 'text-anchor': 'middle' }, svg);
    stage.appendChild(svg);

    var meter = h('div', 'lb-meter');
    var meterFill = h('span', 'lb-meter-fill');
    meter.appendChild(meterFill);
    stage.appendChild(meter);
    root.appendChild(stage);

    var read = h('div', 'lb-readout');
    var size = h('p', 'lb-size', S.tap);
    var priceRow = h('p', 'lb-price-row');
    var price = h('span', 'lb-price', '$0');
    var unit = h('span', 'lb-unit', '');
    priceRow.appendChild(price); priceRow.appendChild(unit);
    var tline = h('p', 'lb-travel'); tline.hidden = true;
    var live = h('p', 'lb-sr'); live.setAttribute('aria-live', 'polite');
    read.appendChild(size); read.appendChild(priceRow); read.appendChild(tline); read.appendChild(live);

    var freqBtns = [];
    if (opts.freq !== false && D.freqLabels.length > 1) {
      var seg = h('div', 'lb-seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', S.often);
      D.freqLabels.forEach(function (label, k) {
        var b = h('button', 'lb-seg-btn', label);
        b.type = 'button';
        b.addEventListener('click', function () { setFreq(k); emit(); });
        freqBtns.push(b); seg.appendChild(b);
      });
      read.appendChild(seg);
    }
    var cta = null;
    if (opts.cta) {
      cta = h('a', 'lb-cta', S.book);
      cta.href = opts.cta.href;
      cta.addEventListener('click', function (e) {
        if (state.row == null || state.row >= MORE) { e.preventDefault(); shake(); return; }
        var q = { load: String(state.row), freq: String(state.fi) };
        if (trip) q.zip = trip.zip;
        cta.href = opts.cta.href + '?' + new URLSearchParams(q);
        try {
          var k = 'quoteContact', prev = JSON.parse(sessionStorage.getItem(k) || '{}') || {};
          prev.items = describe();
          prev.photos = window.PhotoQuote ? window.PhotoQuote.photos() : [];
          sessionStorage.setItem(k, JSON.stringify(prev));
        } catch (err) { /* private mode: the items note is a nicety */ }
      });
      read.appendChild(cta);
    }
    root.appendChild(read);

    /* ── item list ──────────────────────────────────────────────────────── */
    var list = h('ul', 'lb-items');
    var outs = {};
    D.items.forEach(function (it) {
      var li = h('li', 'lb-item');
      li.style.setProperty('--sw', it.color);
      var sw = h('span', 'lb-sw'); sw.setAttribute('aria-hidden', 'true');
      var name = h('span', 'lb-name', it.label);
      var minus = h('button', 'lb-step lb-minus', '−');
      var out = h('output', 'lb-count', '0');
      var plus = h('button', 'lb-step lb-plus', '+');
      minus.type = plus.type = 'button';
      minus.setAttribute('aria-label', S.remove + it.label);
      plus.setAttribute('aria-label', S.add + it.label);
      minus.addEventListener('click', function () { change(it.key, -1); });
      plus.addEventListener('click', function () { change(it.key, 1); });
      // tapping the name adds one too: the whole row is the target on a phone
      name.addEventListener('click', function () { change(it.key, 1); });
      li.appendChild(sw); li.appendChild(name); li.appendChild(minus); li.appendChild(out); li.appendChild(plus);
      list.appendChild(li);
      outs[it.key] = { out: out, li: li, minus: minus };
    });
    root.appendChild(list);

    var byKey = {};
    D.items.forEach(function (it) { byKey[it.key] = it; });

    function describe() {
      return D.items.filter(function (it) { return state.counts[it.key]; })
        .map(function (it) { var n = state.counts[it.key]; return it.label + (n > 1 ? ' x' + n : ''); })
        .join(', ');
    }

    function change(key, d) {
      var n = (state.counts[key] || 0) + d;
      if (n < 0) return;
      state.manual = null;
      state.counts[key] = n;
      if (d > 0) state.seq.push(key);
      else state.seq.splice(state.seq.lastIndexOf(key), 1);
      render(d > 0);
      emit();
    }

    var shown = 0;
    function render(added) {
      var units = 0, colors = [];
      state.seq.forEach(function (k) {
        var it = byKey[k];
        units += it.units;
        for (var u = 0; u < it.units; u++) colors.push(it.color);
      });
      state.units = units;
      state.row = state.manual != null ? state.manual : rowFor(D, units);

      var n = Math.min(colors.length, cells.length);
      cells.forEach(function (cell, i) {
        if (i < n) {
          cell.style.fill = colors[i];
          cell.classList.add('on');
          if (added && i >= shown && !reduce) {
            cell.classList.remove('drop');
            cell.style.animationDelay = Math.min(i - shown, 20) * 12 + 'ms';
            requestAnimationFrame(function () { cell.classList.add('drop'); });
          }
        } else {
          cell.classList.remove('on', 'drop');
        }
      });
      shown = n;

      var ghostPct = state.manual != null ? D.loads[state.manual].fits : 0;
      ghost.setAttribute('height', (BED.h * ghostPct / 100).toFixed(2));
      ghost.setAttribute('y', (BED.y + BED.h * (1 - ghostPct / 100)).toFixed(2));

      var pct = state.manual != null ? ghostPct : units;
      meterFill.style.width = Math.min(100, pct) + '%';
      root.classList.toggle('is-over', state.row === MORE);
      over.textContent = state.row === MORE ? S.over + (units - 100) + '%' : '';

      Object.keys(outs).forEach(function (k) {
        var v = state.counts[k] || 0;
        outs[k].out.textContent = v;
        outs[k].li.classList.toggle('has', v > 0);
        outs[k].minus.disabled = v === 0;
      });
      readout();
    }

    var shownCents = 0, tween = 0;
    function readout() {
      var row = state.row, cents = 0;
      if (row == null) {
        size.textContent = S.tap;
        unit.textContent = '';
      } else if (row >= MORE) {
        size.textContent = S.more;
        unit.textContent = '';
      } else {
        // The load's price, plus travel once we know the ZIP.
        cents = D.prices[row][state.fi] + (trip ? trip.cents : 0);
        size.textContent = D.loads[row].label + (state.manual == null ? ' · ' + Math.min(100, state.units) + S.full : '');
        unit.textContent = D.freqUnits[state.fi] + (trip ? '' : S.plusTravel);
      }
      // Placeholder prices print red with an asterisk (css/guess.css).
      price.classList.toggle('guess', !!(D.guess && D.guess.prices) && row != null && row < MORE);
      travelLine(row);
      if (row >= MORE) { price.textContent = S.callUs; shownCents = 0; }
      else count(cents);
      live.textContent = row == null ? '' : row >= MORE ? S.moreLive
        : D.loads[row].label + ', ' + fmt(cents) + D.freqUnits[state.fi]
          + (!trip ? S.plusZip : trip.cents ? S.including + fmt(trip.cents) + S.travelAfter : '');
      freqBtns.forEach(function (b, k) { b.setAttribute('aria-pressed', String(k === state.fi)); });
      if (cta) cta.setAttribute('aria-disabled', String(row == null || row >= MORE));
    }
    // The line under the price: what travel adds, or that it depends on the ZIP.
    function travelLine(row) {
      tline.textContent = '';
      tline.hidden = row == null || row >= MORE;
      if (tline.hidden) return;
      if (!trip) { tline.textContent = S.byZip; return; }
      var fee = h('span', T && T.GUESS ? 'guess' : '', trip.cents ? fmt(trip.cents) + S.travelFee : S.noTravel);
      if (trip.cents) tline.appendChild(document.createTextNode(S.includes));
      tline.appendChild(fee);
      tline.appendChild(document.createTextNode((trip.cents ? ', ' + zoneName(trip.label) : S.inThe + zoneName(trip.label).toLowerCase()) + ' (' + trip.place + ')'));
    }
    function count(to) {
      cancelAnimationFrame(tween);
      var from = shownCents, t0 = performance.now(), dur = reduce ? 0 : 420;
      (function step(t) {
        // a frame's timestamp can land just before t0: clamp, or the eased
        // value overshoots below zero
        var p = dur ? Math.max(0, Math.min(1, (t - t0) / dur)) : 1;
        shownCents = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        price.textContent = to === 0 && p === 1 ? '$0' : fmt(shownCents);
        if (p < 1) tween = requestAnimationFrame(step);
      })(t0);
    }
    function shake() {
      if (reduce) return;
      root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
    }

    // Replace the load with counted items ({ key: n }), in list order, and
    // drop them in like taps.
    function setItems(counts) {
      state.manual = null; state.counts = {}; state.seq = [];
      D.items.forEach(function (it) {
        var n = Math.max(0, Math.min(30, counts[it.key] | 0));
        if (!n) return;
        state.counts[it.key] = n;
        for (var j = 0; j < n; j++) state.seq.push(it.key);
      });
      shown = 0;
      render(true);
      emit();
    }

    function photoPanel() {
      var wrap = h('div', 'lb-photo');
      root.appendChild(wrap);
      withPhotoQuote(function (PQ) {
        PQ.mount(wrap, {
          endpoint: opts.photos.endpoint, cls: 'lb', noteKey: NOTE_KEY,
          text: { snap: S.snap, sendUpTo: S.sendUpTo, getting: S.getting, cantOpen: S.cantOpen, looking: S.looking, cantRead: S.cantRead },
          onBusy: function (on) { host.classList.toggle('is-reading', on); },
          onResult: function (j) {
            var found = j.items || {};
            var names = D.items.filter(function (it) { return found[it.key]; })
              .map(function (it) { return it.label + (found[it.key] > 1 ? ' x' + found[it.key] : ''); });
            // Claude writes its note in English; a Spanish page uses its own words.
            var notes = ES ? '' : j.notes;
            if (!names.length || j.unsure) {
              if (names.length) setItems(found);
              return { text: (notes ? notes + ' ' : '') + S.tapBelow, kind: 'err' };
            }
            setItems(found);
            // Claude's own note already says what it saw; the bare list is
            // the fallback when it left none.
            return { text: (notes || S.weCount + names.join(', ') + '.') + S.lookRight, kind: 'done' };
          },
        });
        wrap.appendChild(h('p', 'lb-or', S.or));
      });
    }

    function setFreq(fi) { state.fi = fi; readout(); }
    function setTravel(t) { trip = t || null; readout(); }
    function setLoad(row) {
      state.manual = row == null || row >= MORE ? null : row;
      if (state.manual != null) { state.counts = {}; state.seq = []; }
      render(false);
      if (opts.persist) { try { sessionStorage.setItem(KEY, JSON.stringify(state.seq)); } catch (e) { /* private mode */ } }
    }
    function emit() {
      if (opts.persist) { try { sessionStorage.setItem(KEY, JSON.stringify(state.seq)); } catch (e) { /* private mode */ } }
      if (opts.onChange) opts.onChange({ row: state.row, fi: state.fi, items: describe(), units: state.units, manual: state.manual != null });
    }

    // Same tab, same load: what they tapped on the homepage is still in the
    // truck on the quote, and still there if they come back.
    var restored = false;
    if (opts.persist) {
      try {
        var saved = JSON.parse(sessionStorage.getItem(KEY) || '[]');
        if (Array.isArray(saved)) saved.forEach(function (k) {
          if (!byKey[k]) return;
          state.seq.push(k); state.counts[k] = (state.counts[k] || 0) + 1; restored = true;
        });
      } catch (e) { /* ignore */ }
    }
    render(restored);
    return { setFreq: setFreq, setLoad: setLoad, setItems: setItems, setTravel: setTravel, state: state, describe: describe };
  }

  window.LoadBuilder = { mount: mount, rowFor: rowFor };
})();
