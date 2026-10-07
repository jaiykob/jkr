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
  // sessionStorage: the stored photo paths (they ride with the booking), small
  // thumbnails to show again, and the last read-back line.
  var PHOTOS_KEY = 'quotePhotos', THUMBS_KEY = 'quoteThumbs', NOTE_KEY = 'quotePhotoNote';
  // sessionStorage: the last ZIP typed on any page (a plain string).
  var ZIP_KEY = 'quoteZip';
  var MAX_PHOTOS = 4;
  function readStore(k, d) { try { var v = JSON.parse(sessionStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function writeStore(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or private: the photos still went up */ } }

  /* A photo (File or data URL) redrawn as a JPEG no wider or taller than
     `max`, as a data URL. Phones shoot 4000px and several MB; the server only
     needs enough to count a couch. */
  function shrink(src, max, q) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = typeof src === 'string' ? src : URL.createObjectURL(src);
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        if (typeof src !== 'string') URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = function () { if (typeof src !== 'string') URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    var svg = el('svg', { viewBox: '0 0 410 222', role: 'img', 'aria-label': 'The truck, filling up as you add items' });
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
    var size = h('p', 'lb-size', 'Tap what you have');
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
      seg.setAttribute('aria-label', 'How often');
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
      cta = h('a', 'lb-cta', 'Book this load');
      cta.href = opts.cta.href;
      cta.addEventListener('click', function (e) {
        if (state.row == null || state.row >= MORE) { e.preventDefault(); shake(); return; }
        var q = { load: String(state.row), freq: String(state.fi) };
        if (trip) q.zip = trip.zip;
        cta.href = opts.cta.href + '?' + new URLSearchParams(q);
        try {
          var k = 'quoteContact', prev = JSON.parse(sessionStorage.getItem(k) || '{}') || {};
          prev.items = describe();
          prev.photos = readStore(PHOTOS_KEY, []);
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
      minus.setAttribute('aria-label', 'Remove one: ' + it.label);
      plus.setAttribute('aria-label', 'Add one: ' + it.label);
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
      over.textContent = state.row === MORE ? 'Over by ' + (units - 100) + '%' : '';

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
        size.textContent = 'Tap what you have';
        unit.textContent = '';
      } else if (row >= MORE) {
        size.textContent = 'More than a truck';
        unit.textContent = '';
      } else {
        // The load's price, plus travel once we know the ZIP.
        cents = D.prices[row][state.fi] + (trip ? trip.cents : 0);
        size.textContent = D.loads[row].label + (state.manual == null ? ' · ' + Math.min(100, state.units) + '% full' : '');
        unit.textContent = D.freqUnits[state.fi] + (trip ? '' : ' + travel');
      }
      // Placeholder prices print red with an asterisk (css/guess.css).
      price.classList.toggle('guess', !!(D.guess && D.guess.prices) && row != null && row < MORE);
      travelLine(row);
      if (row >= MORE) { price.textContent = 'Call us'; shownCents = 0; }
      else count(cents);
      live.textContent = row == null ? '' : row >= MORE ? 'More than a truck. Call us for a price.'
        : D.loads[row].label + ', ' + fmt(cents) + D.freqUnits[state.fi]
          + (!trip ? ', plus travel by ZIP code' : trip.cents ? ', including ' + fmt(trip.cents) + ' travel' : '');
      freqBtns.forEach(function (b, k) { b.setAttribute('aria-pressed', String(k === state.fi)); });
      if (cta) cta.setAttribute('aria-disabled', String(row == null || row >= MORE));
    }
    // The line under the price: what travel adds, or that it depends on the ZIP.
    function travelLine(row) {
      tline.textContent = '';
      tline.hidden = row == null || row >= MORE;
      if (tline.hidden) return;
      if (!trip) { tline.textContent = 'Travel is added by ZIP code.'; return; }
      var fee = h('span', T && T.GUESS ? 'guess' : '', trip.cents ? fmt(trip.cents) + ' travel' : 'No travel charge');
      if (trip.cents) tline.appendChild(document.createTextNode('Includes '));
      tline.appendChild(fee);
      tline.appendChild(document.createTextNode((trip.cents ? ', ' + trip.label : ' in the ' + trip.label.toLowerCase()) + ' (' + trip.place + ')'));
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
      var pick = h('label', 'lb-snap');
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.className = 'lb-file';
      var icon = document.createElementNS(NS, 'svg');
      icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('class', 'lb-cam');
      icon.innerHTML = '<path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>';
      var words = h('span', 'lb-snap-words');
      words.appendChild(h('strong', null, 'Snap your junk'));
      words.appendChild(h('small', null, 'Send up to ' + MAX_PHOTOS + ' photos and we count it for you'));
      pick.appendChild(input); pick.appendChild(icon); pick.appendChild(words);
      var thumbs = h('div', 'lb-thumbs');
      var msg = h('p', 'lb-ai');
      msg.setAttribute('aria-live', 'polite');
      var or = h('p', 'lb-or', 'or tap what you have');
      wrap.appendChild(pick); wrap.appendChild(thumbs); wrap.appendChild(msg); wrap.appendChild(or);
      root.appendChild(wrap);

      function showThumbs(list, busy) {
        thumbs.innerHTML = '';
        list.forEach(function (src) {
          var f = h('span', 'lb-thumb' + (busy ? ' is-busy' : ''));
          var img = document.createElement('img'); img.src = src; img.alt = '';
          f.appendChild(img); thumbs.appendChild(f);
        });
      }
      function say(text, kind) { msg.textContent = text; msg.className = 'lb-ai' + (kind ? ' is-' + kind : ''); }

      // Coming back to the page: show what they already sent.
      var kept = readStore(THUMBS_KEY, []);
      if (kept.length) { showThumbs(kept, false); say(readStore(NOTE_KEY, ''), 'done'); }

      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || [], 0, MAX_PHOTOS);
        input.value = '';
        if (!files.length) return;
        say('Getting your photos ready…', 'busy');
        Promise.all(files.map(function (f) { return shrink(f, 1280, 0.78); })).then(function (big) {
          big = big.filter(Boolean);
          if (!big.length) { say('We could not open those photos. Try different ones, or tap what you have below.', 'err'); return; }
          return Promise.all(big.map(function (d) { return shrink(d, 160, 0.7); })).then(function (small) {
            showThumbs(small, true);
            host.classList.add('is-reading');
            say('Looking at your photos…', 'busy');
            return fetch(opts.photos.endpoint, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ photos: big.map(function (d) { return d.split(',')[1]; }) }),
            }).then(function (r) {
              return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
            }).then(function (res) {
              var j = res.j || {};
              if (Array.isArray(j.photos)) writeStore(PHOTOS_KEY, j.photos);
              writeStore(THUMBS_KEY, small);
              showThumbs(small, false);
              if (!res.ok) throw new Error(j.error || 'failed');
              var found = j.items || {};
              var names = D.items.filter(function (it) { return found[it.key]; })
                .map(function (it) { return it.label + (found[it.key] > 1 ? ' x' + found[it.key] : ''); });
              if (!names.length || j.unsure) {
                var t = (j.notes ? j.notes + ' ' : '') + 'Tap what you have below and we will take it from there.';
                say(t, 'err'); writeStore(NOTE_KEY, t);
                if (names.length) setItems(found);
                return;
              }
              setItems(found);
              // Claude's own note already says what it saw; the bare list is
              // the fallback when it left none.
              var note = (j.notes || 'We count: ' + names.join(', ') + '.') + ' Look right? Tap + or − to fix it.';
              say(note, 'done'); writeStore(NOTE_KEY, note);
            });
          });
        }).catch(function () {
          showThumbs(readStore(THUMBS_KEY, []), false);
          say('We could not read the photos right now. Tap what you have below. If the photos came through, we will still see them.', 'err');
        }).then(function () { host.classList.remove('is-reading'); });
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
