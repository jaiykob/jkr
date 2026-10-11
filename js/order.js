/* The order page (book/quote.html): size, ZIP, day and window, contact, pay.

   One page, five sections that open in turn: a section opens once the one
   above it is done, so there is no Continue button. One state object holds
   the order; render() redraws the page from it.

   Everything it knows comes from generated modules, so this file types no
   price, window or fee:
     window.ORDER    js/order-config.js (sizes, windows, open days, the policy)
     window.TRAVEL   js/travel.js (ZIP -> zone, fee, market)
     GET /api/day-capacity?market=   which days and windows are full (fail open)
   and the page around it: the five cards (BUILD:order-sizes, js/size-cards.js),
   the photo quote (js/photo-quote.js), window.SiteLeads (js/leads.js).

   In: ?size=<row> (the old ?load=<row> too) picks a size; ?zip= or the last
   ZIP typed on the site (sessionStorage quoteZip) fills the ZIP; #photos
   (the homepage's "Send us a photo") puts the photo picker in view and in
   focus. Contact details stay in this tab (sessionStorage orderState), never
   in a URL.

   With the booking gates closed (BOOKINGS_OPEN_CLIENT in the page), Book saves
   a reservation lead (size, ZIP, day, window, contact), shows no card form
   and loads no Stripe.js.

   With them open, the pay step loads Stripe.js and mounts one Elements group
   in payment mode: the quoted total is PAID now, and the card is saved
   (setupFutureUsage off_session) so a bigger size is charged the difference
   after the job and a smaller one refunded (founder, 2026-10-10). Apple Pay
   or Google Pay (Express Checkout Element) above the card form (Payment
   Element); elements.update({ amount }) follows the total. One box, "I agree
   to the terms, and to this card being charged or refunded the difference if
   the crew finds a different size", gates both. Book, or the wallet sheet:
   elements.submit(), POST /api/create-booking (the server reprices, checks
   the window and the consent, and returns a PaymentIntent),
   stripe.confirmPayment(), thanks.html. The booking summary rides to
   thanks.html in sessionStorage (bookingSummary), never in the URL.       */
(function () {
  'use strict';
  var ORDER = window.ORDER, TRAVEL = window.TRAVEL;
  if (!ORDER || !TRAVEL) return;

  var $ = function (id) { return document.getElementById(id); };
  var form = $('order');
  var STORE = 'orderState', ZIP_KEY = 'quoteZip';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var OPEN = window.BOOKINGS_OPEN_CLIENT === true;
  var G = ORDER.GUESS || {};
  var PRICE_GUESS = !!G.prices, TRAVEL_GUESS = !!TRAVEL.GUESS;
  var WIDE = window.matchMedia ? window.matchMedia('(min-width: 900px)') : { matches: false, addListener: function () {} };
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fmt(c) { return '$' + (c / 100).toFixed(2); }
  function read(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function write(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function track(name, params) { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) { /* analytics never breaks the page */ } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  /* Text, red with an asterisk when it is a guess (css/guess.css). */
  function guessy(text, on) { var s = el('span', on ? 'guess' : null, text); return s; }
  function fill(node, parts) { node.textContent = ''; parts.forEach(function (p) { node.appendChild(typeof p === 'string' ? document.createTextNode(p) : p); }); }
  /* Hand a lead to window.SiteLeads (js/leads.js, read at call time). True only
     when capture was really called: capture itself never loses a lead (it keeps
     a copy on the device when the insert fails), but with no client at all the
     page must not say a lead went anywhere. */
  function sendLead(row) {
    try {
      if (!window.SiteLeads || typeof window.SiteLeads.capture !== 'function') return false;
      window.SiteLeads.capture(row);
      return true;
    } catch (e) { return false; }
  }
  function say(text) { var l = $('o-live'); if (l) { l.textContent = ''; setTimeout(function () { l.textContent = text; }, 30); } }

  /* ── the state ───────────────────────────────────────────────────────── */
  var state = {
    size: null, zip: '', trip: null, date: null, window: null,
    contact: { name: '', phone: '', email: '', street: '', unit: '', notes: '' },
  };
  var days = null;          // day-capacity answer: [{ date, label, full, windows: [{ key, label, full }] }]
  var daysMarket = null;    // the market those days are for
  var refused = {};         // 'date|window' the server just called full: stays full until a fresh read agrees
  var reserved = false;
  var busy = false;         // a booking is on its way: a second tap must not start a second one
  var override = null;      // { size, zip, cents }: the server's total after a stale quote
  var photoItems = '';      // what the photos showed, for the lead
  // The number people call, read from the page header (this file types none).
  var PHONE = ((document.querySelector('.o-head-num') || {}).textContent || '').trim();
  var CALL_US = PHONE ? 'call or text ' + PHONE : 'call or text us';

  var SIZES = ORDER.SIZES;
  var sizeOf = function (row) { return row == null ? null : SIZES[row] || null; };
  var load = function () { var s = sizeOf(state.size); return s ? s.cents : 0; };
  var total = function () {
    if (!state.trip || state.size == null) return null;
    if (override && override.size === state.size && override.zip === state.trip.zip) return override.cents;
    return ORDER.totalFor(state.size, state.trip.cents);
  };
  var dayOf = function (date) { return (days || []).filter(function (d) { return d.date === date; })[0] || null; };
  var winOf = function (date, key) { var d = dayOf(date); return d ? d.windows.filter(function (w) { return w.key === key; })[0] || null : null; };
  var windowFree = function (date, key) { var d = dayOf(date), w = winOf(date, key); return !!(d && w && !d.full && !w.full); };

  /* ── contact fields: checked when the customer leaves one, cleared on the next keystroke ── */
  var FIELDS = {
    name:   { el: $('o-name'),   err: $('o-name-err'),   check: function (v) { return v.trim().length >= 2 ? '' : 'Enter your name.'; } },
    phone:  { el: $('o-phone'),  err: $('o-phone-err'),  check: function (v) { return v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length === 10 ? '' : 'Enter a 10 digit phone number.'; } },
    email:  { el: $('o-email'),  err: $('o-email-err'),  check: function (v) { return EMAIL_RE.test(v.trim()) ? '' : 'Enter an email like you@example.com.'; } },
    street: { el: $('o-street'), err: $('o-street-err'), check: function (v) { return v.trim().length >= 4 ? '' : 'Enter the street address for the job.'; } },
  };
  var OPTIONAL = { unit: $('o-unit'), notes: $('o-notes') };
  function fieldError(key, show) {
    var f = FIELDS[key], msg = f.check(f.el.value);
    if (show) { f.err.textContent = msg; f.el.setAttribute('aria-invalid', msg ? 'true' : 'false'); }
    return msg;
  }

  /* ── which sections are done ─────────────────────────────────────────── */
  var SECTIONS = ['o-size', 'o-zip', 'o-when', 'o-you', 'o-pay'];
  function done(id) {
    if (id === 'o-size') return state.size != null;
    if (id === 'o-zip') return !!state.trip;
    if (id === 'o-when') return !!(state.date && state.window && windowFree(state.date, state.window));
    if (id === 'o-you') return Object.keys(FIELDS).every(function (k) { return !FIELDS[k].check(FIELDS[k].el.value); });
    return false;   // the pay step is never "done" on its own: Book finishes it
  }
  var wasOpen = {};
  /* Open every section whose sections above are done. Returns the ids that just opened. */
  function layout() {
    var open = true, opened = [];
    SECTIONS.forEach(function (id) {
      var sec = $(id), isDone = open && done(id);
      sec.classList.toggle('is-open', open);
      sec.classList.toggle('is-locked', !open);
      sec.classList.toggle('is-done', isDone);
      sec.querySelector('.o-sec-body').hidden = !open;
      if (open && !wasOpen[id]) opened.push(id);
      wasOpen[id] = open;
      open = isDone;
    });
    return opened;
  }
  /* After a tap opens sections, bring the first one still to do into view (phones mostly). */
  function reveal(opened) {
    var id = opened.filter(function (x) { return !$(x).classList.contains('is-done'); })[0] || opened[opened.length - 1];
    var sec = id && $(id);
    if (!sec) return;
    var r = sec.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.55) sec.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
  }

  /* ── render: every number on the page comes from here ─────────────────── */
  function render() {
    var s = sizeOf(state.size), t = state.trip, tot = total();
    cards && cards.pick(state.size);
    cards && cards.setTravel(t, TRAVEL_GUESS);

    // The total and the travel line, in the summary and the bar alike.
    // The bar is narrow: before the ZIP its total line is the load price and
    // its travel line says travel comes by ZIP.
    document.querySelectorAll('.o-total .o-v').forEach(function (v) {
      var inBar = !!v.closest('.o-bar');
      v.classList.toggle('is-empty', !s);
      if (!s) { v.textContent = 'Pick a size'; return; }
      if (!t) { fill(v, inBar ? [guessy(fmt(s.cents), PRICE_GUESS)] : [guessy(fmt(s.cents), PRICE_GUESS), ' + travel']); return; }
      fill(v, [guessy(fmt(tot), PRICE_GUESS || TRAVEL_GUESS)]);
    });
    document.querySelectorAll('.o-travel .o-v').forEach(function (v) {
      var inBar = !!v.closest('.o-bar');
      if (!t) { v.textContent = inBar ? '+ travel by ZIP' : 'Add your ZIP'; return; }
      if (!t.cents) { v.textContent = inBar ? 'No travel charge' : '$0.00'; return; }
      fill(v, inBar ? ['With ', guessy(fmt(t.cents), TRAVEL_GUESS), ' travel'] : [guessy(fmt(t.cents), TRAVEL_GUESS)]);
    });
    var travelKey = document.querySelector('#o-summary .o-travel .o-k');
    if (travelKey) travelKey.textContent = t ? 'Travel, ' + t.label + ' (' + t.place + ')' : 'Travel';
    var sizeRow = document.querySelector('#o-summary .o-size-row');
    if (sizeRow) {
      sizeRow.querySelector('.o-k').textContent = s ? s.label : 'Size';
      fill(sizeRow.querySelector('.o-v'), s ? [guessy(fmt(s.cents), PRICE_GUESS)] : ['Not picked yet']);
    }
    var whenRow = document.querySelector('#o-summary .o-when-row .o-v');
    var d = dayOf(state.date), w = winOf(state.date, state.window);
    if (whenRow) fill(whenRow, d && w && state.window ? [d.label + ', ', guessy(w.label, !!G.schedule)] : ['Not picked yet']);

    // The Book button carries the amount: with bookings open it is paid now.
    var book = $('o-book');
    var verb = OPEN ? 'Book and pay ' : 'Reserve, no card: ';
    book.setAttribute('aria-busy', String(busy));
    if (reserved) book.textContent = 'Reserved';
    else if (busy) book.textContent = 'Booking your pickup…';
    else if (!s) book.textContent = OPEN ? 'Book' : 'Reserve';
    else if (!t) fill(book, [verb, guessy(fmt(s.cents), PRICE_GUESS), ' + travel']);
    else fill(book, [verb, guessy(fmt(tot), PRICE_GUESS || TRAVEL_GUESS)]);
    book.classList.toggle('is-done', reserved);

    // The rule beside Book names the total: paid now (bookings open) or the total reserved.
    document.querySelectorAll('[data-o="pay-total"]').forEach(function (n) { fill(n, tot ? [guessy(fmt(tot), PRICE_GUESS || TRAVEL_GUESS)] : ['the total']); });
    // The card form shows the amount it pays (Apple Pay and Google Pay sheets read it too).
    if (elements && tot && tot !== payAmount) { payAmount = tot; try { elements.update({ amount: tot }); } catch (e) { /* the next Book still sends the server's total */ } }

    // The bar shows from the first pick.
    var bar = $('o-bar');
    bar.hidden = !s;
    document.body.classList.toggle('o-has-bar', !!s);

    // The city line under the street comes from the ZIP.
    $('o-city').textContent = t ? 'City: ' + t.place + ', ' + t.state + ' ' + t.zip + ' (from your ZIP)' : '';

    // WhatsApp opens a chat with the size and ZIP filled in.
    var msg = 'Hello, I would like to book a junk pickup' + (s ? ': ' + s.label : '') + (state.zip.length === 5 ? ' in ' + state.zip : '') + '.';
    document.querySelectorAll('a[data-wa]').forEach(function (a) { a.href = a.getAttribute('data-wa') + '?text=' + encodeURIComponent(msg); });

    var opened = layout();
    // Bookings open: the card form loads the first time the pay step opens.
    if (OPEN && $('o-pay').classList.contains('is-open')) mountPay();
    save();
    return opened;
  }

  function save() {
    var c = state.contact;
    Object.keys(FIELDS).forEach(function (k) { c[k] = FIELDS[k].el.value; });
    c.unit = OPTIONAL.unit.value; c.notes = OPTIONAL.notes.value;
    write(STORE, { size: state.size, zip: state.zip, date: state.date, window: state.window, contact: c });
  }
  /* Any change to the order (size, ZIP, day, window, contact): an old failure
     or price note no longer applies, and after a reservation the next Book
     saves the new details. */
  function changed() {
    lastPay = null;
    $('o-pay-fail').hidden = true;
    payMsg('');
    if (reserved) { reserved = false; $('o-reserved').hidden = true; $('o-closed').hidden = OPEN; }
  }
  /* The line under the pay step: kind is 'err' (red) or 'note'. */
  function payMsg(text, kind) {
    var m = $('o-pay-msg');
    m.textContent = text || '';
    m.className = 'o-msg' + (text && kind ? ' is-' + kind : '');
  }

  /* ── 1. size ─────────────────────────────────────────────────────────── */
  var cards = window.SizeCards ? SizeCards.mount($('o-sizes'), { onPick: function (row) { setSize(row, 'tap'); } }) : null;
  function setSize(row, how) {
    if (row == null || !sizeOf(row)) return;
    var before = state.size;
    state.size = row;
    if (before !== row) changed();
    var opened = render();
    if (how === 'tap' && opened.length) reveal(opened);
    if (before !== row) { track('order_size', { size: sizeOf(row).label, how: how }); say(sizeOf(row).label + ' picked.'); }
    var m = $('o-size-msg'); m.textContent = ''; m.className = 'o-msg';
  }

  /* The photo quote: Claude counts, ORDER.sizeForUnits picks the smallest size that holds it. */
  if (window.PhotoQuote && $('o-photo-panel')) {
    PhotoQuote.mount($('o-photo-panel'), {
      endpoint: '../api/photo-quote', cls: 'pq', noteKey: 'orderPhotoNote',
      text: {
        snap: 'Not sure? Send photos', sendUpTo: function () { return 'We pick the size for you.'; },
        getting: 'Getting your photos ready…', looking: 'Looking at your photos…',
        cantOpen: 'We could not open those photos. Try different ones, or pick the closest size.',
        cantRead: 'We could not read the photos right now. Pick the closest size. If the photos came through, we will still see them.',
      },
      onBusy: function (on) { $('o-size').classList.toggle('is-reading', on); },
      onResult: function (res) {
        var units = 0, names = [];
        ORDER.ITEMS.forEach(function (it) {
          var n = Math.max(0, Math.min(30, res.items[it.key] | 0));
          if (!n) return;
          units += n * it.units;
          names.push(it.label + (n > 1 ? ' x' + n : ''));
        });
        photoItems = names.join(', ');
        if (!units) return { text: 'We could not tell the size from these photos. Pick the closest size. The crew confirms the price before loading.', kind: 'err' };
        var row = ORDER.sizeForUnits(units);
        if (row == null) return { text: 'From your photos: more than a full truck. Call or text us and we price it by hand.', kind: 'err' };
        setSize(row, 'photo');
        return { text: 'From your photos: ' + sizeOf(row).label + '. Change it if that looks wrong.', kind: 'done' };
      },
    });
  }

  /* ── 2. ZIP ──────────────────────────────────────────────────────────── */
  var zipIn = $('o-zip-in'), zipMsg = $('o-zip-msg');
  function setZip(v, how) {
    v = String(v || '').replace(/\D/g, '').slice(0, 5);
    if (zipIn.value !== v) zipIn.value = v;
    var before = state.trip, edited = v !== state.zip;
    // A new ZIP is a new question: the far panel's thank you, failure line and button reset.
    if (v !== state.zip) { $('o-far-btn').disabled = false; $('o-far-ok').hidden = true; $('o-far-fail').hidden = true; }
    state.zip = v;
    state.trip = v.length === 5 ? TRAVEL.travelFor(v) : null;
    $('o-far').hidden = !(v.length === 5 && !state.trip);
    zipMsg.className = 'o-msg';
    zipIn.removeAttribute('aria-invalid');
    if (state.trip) {
      var t = state.trip;
      // The last ZIP typed anywhere on the site, a plain string (the homepage reads it too).
      try { sessionStorage.setItem(ZIP_KEY, t.zip); } catch (e) { /* private mode */ }
      fill(zipMsg, ['✓ ' + t.place + ', ' + t.label + ': ', t.cents ? guessy('travel +' + fmt(t.cents), TRAVEL_GUESS) : guessy('no travel charge', TRAVEL_GUESS)]);
      zipMsg.className = 'o-msg is-ok';
      loadDays(t.market);
      if (how === 'typed') track('zip_check', { zip: v, in_area: true, zone: t.zone });
    } else if (v.length === 5) {
      // The panel under the box says what to do; no red error on top of it.
      zipMsg.textContent = '';
      var em = FIELDS.email.el.value.trim();
      if (em && !$('o-far-email').value) $('o-far-email').value = em;
      if (edited) say('That ZIP is past our travel zones, so we price it by hand. Leave your email below, or ' + CALL_US + '.');
      if (how === 'typed') track('zip_check', { zip: v, in_area: false });
    } else {
      zipMsg.textContent = '';
    }
    // Any edit to the ZIP clears an old failure or price note (like every other field).
    if (edited || (before && before.zip) !== (state.trip && state.trip.zip)) changed();
    return render();
  }
  zipIn.addEventListener('input', function () { setZip(zipIn.value, 'typed'); });
  zipIn.addEventListener('blur', function () {
    if (zipIn.value && zipIn.value.length < 5) { zipMsg.textContent = 'Enter a 5 digit ZIP.'; zipMsg.className = 'o-msg is-err'; zipIn.setAttribute('aria-invalid', 'true'); }
  });
  $('o-far-email').addEventListener('input', function () { $('o-far-err').textContent = ''; this.removeAttribute('aria-invalid'); });
  $('o-far-btn').addEventListener('click', function () {
    var input = $('o-far-email'), email = input.value.trim();
    if (!EMAIL_RE.test(email)) {
      $('o-far-err').textContent = 'Enter your email, like you@example.com, so we can send you a price.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    $('o-far-err').textContent = '';
    track('far_zip_lead', { zip: state.zip });
    var s = sizeOf(state.size);
    var sent = sendLead({
      service: 'junk', email: email, zip: state.zip,
      first_name: FIELDS.name.el.value.trim() || null,
      notes: 'FAR ZIP: past our travel zones, wants a price for ' + (state.zip || 'their ZIP') + (s ? ' | Size: ' + s.label : ''),
    });
    // Only a lead that went somewhere earns the thank you; otherwise the
    // customer is told to call or text, and the box stays usable.
    $('o-far-ok').hidden = !sent;
    $('o-far-fail').hidden = sent;
    this.disabled = sent;
    say(sent ? $('o-far-ok').textContent : $('o-far-fail').textContent);
  });

  /* ── 3. day and window ───────────────────────────────────────────────── */
  /* Every open day with nothing full: what the page shows when the capacity
     answer cannot be had (fail open, like the API itself). */
  function openDaysFallback() {
    return ORDER.openDays(Date.now()).map(function (d) {
      return { date: d.date, label: d.label, full: false, windows: ORDER.SCHEDULE.windows.map(function (w) { return { key: w.key, label: w.label, full: false }; }) };
    });
  }
  var loading = null;
  /* The capacity answer for a market: its days, or null when it cannot be had. */
  function fetchDays(market) {
    return fetch('../api/day-capacity?market=' + encodeURIComponent(market), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) { return j && Array.isArray(j.days) && j.days.length ? j.days : null; });
  }
  /* A window the booking API just refused as full stays full here, even if
     the capacity read lags behind it. */
  function markRefused(list) {
    (list || []).forEach(function (d) {
      d.windows.forEach(function (w) { if (refused[d.date + '|' + w.key]) w.full = true; });
      if (d.windows.every(function (w) { return w.full; })) d.full = true;
    });
    return list;
  }
  function loadDays(market) {
    if (daysMarket === market && (days || loading)) return;
    if (daysMarket !== market) days = null;
    daysMarket = market;
    var mine = loading = fetchDays(market).then(function (list) {
      if (mine !== loading) return;
      loading = null;
      days = markRefused(list || openDaysFallback());
      settleDay();
      drawWhen();
      render();
    });
    drawWhen();
  }
  /* Read the days again after the booking API said a window or day is gone,
     keeping what is on screen until the answer comes. */
  function refreshDays() {
    var market = daysMarket;
    if (!market) return;
    fetchDays(market).then(function (list) {
      if (!list || market !== daysMarket) return;
      days = markRefused(list);
      settleDay();
      drawWhen();
      render();
    });
  }
  /* Keep the picked day and window while they are still free; otherwise the
     soonest day with room is picked for them (the window stays theirs to pick,
     so a window never moves to another day on its own). */
  function settleDay() {
    if (!days) return;
    var d = dayOf(state.date);
    if (!d || d.full) {
      var first = days.filter(function (x) { return !x.full; })[0];
      if (state.date && (!first || first.date !== state.date)) state.window = null;
      state.date = first ? first.date : null;
    }
    if (state.window && !windowFree(state.date, state.window)) state.window = null;
  }
  /* The day and window buttons are drawn afresh on every change: the one that
     had the focus gets it back, so a keyboard user keeps their place. */
  function drawWhen() {
    var ae = document.activeElement, sel = null;
    if (ae && ae.getAttribute && $('o-days').contains(ae) && ae.getAttribute('data-date')) sel = '#o-days [data-date="' + ae.getAttribute('data-date') + '"]';
    else if (ae && ae.getAttribute && $('o-wins').contains(ae) && ae.getAttribute('data-window')) sel = '#o-wins [data-window="' + ae.getAttribute('data-window') + '"]';
    drawChips();
    var again = sel && document.querySelector(sel);
    if (again) again.focus({ preventScroll: true });
  }
  function drawChips() {
    var dayBox = $('o-days'), winBox = $('o-wins'), msg = $('o-when-msg');
    dayBox.textContent = ''; winBox.textContent = '';
    if (!days) { dayBox.appendChild(el('p', 'o-hint', 'Loading the open days…')); return; }
    days.forEach(function (d) {
      var b = el('button', 'o-day' + (d.full ? ' full' : ''));
      b.type = 'button';
      b.setAttribute('data-date', d.date);
      var i = d.label.indexOf(' ');
      b.appendChild(el('span', 'o-day-wd', d.label.slice(0, i)));
      b.appendChild(el('span', 'o-day-md', d.full ? 'Full' : d.label.slice(i + 1)));
      if (d.full) { b.setAttribute('aria-disabled', 'true'); b.setAttribute('aria-label', d.label + ', full'); }
      b.setAttribute('aria-pressed', String(d.date === state.date));
      dayBox.appendChild(b);
    });
    var day = dayOf(state.date);
    $('o-wins-day').textContent = day ? ', ' + day.label : '';
    if (!day) { winBox.appendChild(el('p', 'o-hint', 'Every day we show is full. Call or text us and we will find a time.')); return; }
    day.windows.forEach(function (w) {
      var full = day.full || w.full;
      var b = el('button', 'o-win' + (full ? ' full' : ''));
      b.type = 'button';
      b.setAttribute('data-window', w.key);
      b.appendChild(guessy(w.label, !!G.schedule));
      if (full) { b.appendChild(el('span', 'o-win-full', 'Full')); b.setAttribute('aria-disabled', 'true'); }
      b.setAttribute('aria-pressed', String(!full && w.key === state.window));
      winBox.appendChild(b);
    });
    if (msg.classList.contains('is-err') && state.window) { msg.textContent = ''; msg.className = 'o-msg'; }
  }
  $('o-days').addEventListener('click', function (e) {
    var b = e.target.closest('[data-date]');
    if (!b) return;
    var d = dayOf(b.getAttribute('data-date'));
    if (!d) return;
    if (d.full) { whenError('That day is full. Pick another day.'); return; }
    if (state.date !== d.date) {
      state.date = d.date;
      if (state.window && !windowFree(state.date, state.window)) state.window = null;
      changed();
      track('order_day', { date: d.date });
      say(d.label + ' picked.');
    }
    drawWhen(); render();
  });
  $('o-wins').addEventListener('click', function (e) {
    var b = e.target.closest('[data-window]');
    if (!b) return;
    var key = b.getAttribute('data-window');
    if (!windowFree(state.date, key)) { whenError('That time is full. Pick another one.'); return; }
    if (state.window !== key) { state.window = key; changed(); track('order_window', { window: key }); say(winOf(state.date, key).label + ' picked.'); }
    var m = $('o-when-msg'); m.textContent = ''; m.className = 'o-msg';
    drawWhen();
    var opened = render();
    if (opened.length) reveal(opened);
  });
  function whenError(text) { var m = $('o-when-msg'); m.textContent = text; m.className = 'o-msg is-err'; }

  /* ── 4. contact ──────────────────────────────────────────────────────── */
  Object.keys(FIELDS).forEach(function (k) {
    var f = FIELDS[k];
    f.el.addEventListener('blur', function () { if (f.el.value.trim()) fieldError(k, true); });
    f.el.addEventListener('input', function () {
      if (f.el.getAttribute('aria-invalid') === 'true') { f.err.textContent = ''; f.el.removeAttribute('aria-invalid'); }
      changed(); render();
    });
  });
  [OPTIONAL.unit, OPTIONAL.notes].forEach(function (n) { n.addEventListener('input', function () { changed(); save(); }); });
  $('o-notes-btn').addEventListener('click', function () {
    var box = $('o-notes-box'), open = box.hidden;
    box.hidden = !open;
    this.setAttribute('aria-expanded', String(open));
    if (open) OPTIONAL.notes.focus();
  });

  /* The bar never sits over a field being typed in. */
  var TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]), textarea, select';
  document.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches(TYPING)) document.body.classList.add('o-typing'); });
  document.addEventListener('focusout', function () {
    setTimeout(function () { var a = document.activeElement; if (!a || !a.matches || !a.matches(TYPING)) document.body.classList.remove('o-typing'); }, 0);
  });

  /* One Book button: in the summary on a desktop, in the bar on a phone. */
  function placeBook() {
    var slot = document.querySelector('.o-book-slot[data-slot="' + (WIDE.matches ? 'summary' : 'bar') + '"]');
    if (slot && $('o-book').parentNode !== slot) slot.appendChild($('o-book'));
  }
  if (WIDE.addEventListener) WIDE.addEventListener('change', placeBook); else WIDE.addListener(placeBook);
  placeBook();

  /* ── 5. Book ─────────────────────────────────────────────────────────── */
  /* The first thing still missing, in page order: [section, message, element to focus]. */
  function missing() {
    if (state.size == null) return ['o-size', 'Pick a size first.', document.querySelector('#o-sizes .size-card')];
    if (!state.trip) return ['o-zip', state.zip.length === 5 ? 'We do not price that ZIP online. Call or text us for a price.' : 'Enter the ZIP code of the job.', state.zip.length === 5 ? null : zipIn];
    if (!state.date || !dayOf(state.date)) return ['o-when', 'Pick a day.', document.querySelector('#o-days [data-date]')];
    if (!state.window || !windowFree(state.date, state.window)) return ['o-when', 'Pick an arrival window.', document.querySelector('#o-wins [data-window]:not([aria-disabled="true"])')];
    var keys = Object.keys(FIELDS);
    for (var i = 0; i < keys.length; i++) if (fieldError(keys[i], true)) return ['o-you', FIELDS[keys[i]].err.textContent, FIELDS[keys[i]].el];
    return null;
  }
  function guide(m) {
    var sec = $(m[0]), msgEl = { 'o-size': $('o-size-msg'), 'o-zip': zipMsg, 'o-when': $('o-when-msg'), 'o-you': null }[m[0]];
    if (msgEl) { msgEl.textContent = m[1]; msgEl.className = 'o-msg is-err'; }
    say(m[1]);
    if (m[2] && m[2].focus) {
      m[2].focus({ preventScroll: true });
      m[2].scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
    } else sec.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
    track('order_missing', { step: m[0] });
  }
  $('o-book').addEventListener('click', function () {
    if (reserved) { showReserved(); return; }
    if (busy) return;
    var m = missing();
    if (m) { guide(m); return; }
    if (OPEN) bookByCard(); else reserve();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    // Enter in the ZIP box closes the keyboard; anywhere else it is Book.
    if (document.activeElement === zipIn) { zipIn.blur(); return; }
    $('o-book').click();
  });

  /* Bookings closed: the reservation lead, everything that makes the job schedulable. */
  function reserve() {
    var s = sizeOf(state.size), t = state.trip, d = dayOf(state.date), w = winOf(state.date, state.window);
    var c = state.contact, tot = total();
    save();
    var photos = window.PhotoQuote ? PhotoQuote.photos() : [];
    var sent = sendLead({
      service: 'junk',
      first_name: c.name.trim().replace(/\s+/g, ' '),
      phone: c.phone.trim(), email: c.email.trim(), zip: t.zip,
      address: fullAddress(),
      quoted_price: tot / 100,   // leads.quoted_price is dollars
      notes: [
        'PRE-LAUNCH RESERVATION (bookings closed, no card)',
        'Size: ' + s.label + ' (row ' + s.row + ', ' + fmt(s.cents) + ')',
        'Day: ' + d.date + ' (' + d.label + ')',
        'Window: ' + w.key + ' (' + w.label + ')',
        'Travel: ' + t.label + ', ' + fmt(t.cents) + ', ' + t.miles + ' mi, ' + t.place + ' (' + t.market + ')',
        'Total: ' + fmt(tot),
        c.notes.trim() ? 'Notes: ' + c.notes.trim().slice(0, 500) : '',
        photoItems ? 'From photos: ' + photoItems : '',
        photos.length ? 'Photos: ' + photos.join(', ') : '',
      ].filter(Boolean).join(' | '),
    });
    // Never say "reserved" when nothing was saved: ask them to call or text instead.
    $('o-pay-fail').hidden = sent;
    if (!sent) {
      $('o-pay-fail').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
      say($('o-pay-fail').textContent);
      return;
    }
    track('order_reserve', { size: s.label, value: tot / 100, currency: 'USD', zone: t.zone });
    reserved = true;
    render();
    showReserved();
  }
  /* The job address: street, unit, then the city and ZIP the ZIP step found
     (the ZIP last, where the booking API reads it). */
  function fullAddress() {
    var c = state.contact, t = state.trip;
    return [c.street.trim(), c.unit.trim()].filter(Boolean).join(', ') + ', ' + t.place + ', ' + t.state + ' ' + t.zip;
  }
  function showReserved() {
    var s = sizeOf(state.size), d = dayOf(state.date), w = winOf(state.date, state.window), box = $('o-reserved');
    box.textContent = '';
    box.appendChild(el('p', 'o-reserved-h', 'Your day is reserved.'));
    var p = el('p');
    fill(p, [s.label + ' on ' + d.label + ', ', guessy(w.label, !!G.schedule), '. We will text ' + state.contact.phone.trim() + ' to confirm it. No card was taken.']);
    box.appendChild(p);
    box.hidden = false;
    $('o-closed').hidden = true;
    box.focus({ preventScroll: true });
    box.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
    say('Your day is reserved.');
  }

  /* ── 6. pay, bookings open: the total paid now, the card saved for the difference ── */
  var stripe = null, elements = null, payMounted = false, payBroken = false, payAmount = 0;
  var WALLETS = { apple_pay: 'Apple Pay', google_pay: 'Google Pay', link: 'Link' };
  // One id per page visit, sent with every booking. The server stamps a fresh
  // consent time on each attempt, so a second Book always gets a new
  // PaymentIntent: lastPay, not the id, is what stops a second charge.
  var ATTEMPT = 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  // { secret, data }: the last booking PaymentIntent this page tried to pay.
  // The next Book asks Stripe about it first, and a paid one goes straight to
  // thanks. Any change to the order forgets it (changed()).
  var lastPay = null;
  var LOAD_FAIL = 'The card form did not load. Please ' + CALL_US + ' and we will book it with you.';
  var consentBox = $('o-consent');

  function cardErr(text) { $('o-card-err').textContent = text || ''; }
  function consentErr(text) {
    $('o-consent-err').textContent = text || '';
    $('o-consent-box').classList.toggle('is-invalid', !!text);
    if (text) consentBox.setAttribute('aria-invalid', 'true'); else consentBox.removeAttribute('aria-invalid');
  }
  consentBox.addEventListener('change', function () { if (consentBox.checked) consentErr(''); });
  function needConsent() {
    consentErr('Check the box to agree to the terms and to a different size being charged or refunded.');
    say($('o-consent-err').textContent);
    consentBox.focus({ preventScroll: true });
    consentBox.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
    track('order_missing', { step: 'consent' });
  }

  /* Stripe.js loads only once bookings are open and the pay step opens. */
  function loadStripe() {
    if (window.Stripe) return Promise.resolve(window.Stripe);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.async = true;
      s.onload = function () { if (window.Stripe) resolve(window.Stripe); else reject(new Error('no Stripe')); };
      s.onerror = function () { reject(new Error('Stripe.js did not load')); };
      document.head.appendChild(s);
    });
  }
  function mountPay() {
    if (!OPEN || payMounted || !(total() > 0)) return;
    payMounted = true;
    $('o-paybox').hidden = false;
    loadStripe().then(function (StripeJs) {
      stripe = StripeJs(window.STRIPE_PUBLISHABLE_KEY);
      // Payment mode: the total is paid now, and the card is saved (off session)
      // for the difference after the job. The server makes the PaymentIntent.
      payAmount = total();
      elements = stripe.elements({
        mode: 'payment', amount: payAmount, currency: 'usd', setupFutureUsage: 'off_session',
        appearance: { theme: 'stripe', variables: { colorPrimary: '#15171A', colorText: '#2B2F36', colorDanger: '#B42318', fontSizeBase: '16px', borderRadius: '12px' } },
      });
      // Apple Pay and Google Pay above the card form. A wallet that cannot be
      // built costs the wallet row, never the card form.
      try {
        var express = elements.create('expressCheckout', {
          emailRequired: true, phoneNumberRequired: true, buttonHeight: 48,
          buttonType: { applePay: 'book', googlePay: 'book' },
          paymentMethods: { applePay: 'always', googlePay: 'always', link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' },
        });
        express.on('ready', function (e) {
          var a = (e && e.availablePaymentMethods) || {};
          $('o-wallet').hidden = !Object.keys(a).some(function (k) { return a[k]; });
        });
        express.on('loaderror', function () { $('o-wallet').hidden = true; });
        express.on('click', walletClick);
        express.on('confirm', walletConfirm);
        express.mount('#o-express');
      } catch (e) { $('o-wallet').hidden = true; }
      // The card form. Name, email and phone come from the contact step and
      // are passed at confirm, so nobody types them twice.
      var payment = elements.create('payment', {
        fields: { billingDetails: { name: 'never', email: 'never', phone: 'never' } },
        wallets: { applePay: 'never', googlePay: 'never' },
      });
      payment.on('change', function () { cardErr(''); });
      payment.on('loaderror', function () { payBroken = true; cardErr(LOAD_FAIL); });
      // The bar never sits over the card form while it is being typed in.
      payment.on('focus', function () { document.body.classList.add('o-typing'); });
      payment.on('blur', function () { document.body.classList.remove('o-typing'); });
      payment.mount('#o-card');
    }).catch(function () { payBroken = true; $('o-wallet').hidden = true; cardErr(LOAD_FAIL); });
  }

  /* Everything a booking needs, or the first thing missing (said, never a silent no). */
  function readyToBook() {
    var m = missing();
    if (m) { guide(m); return false; }
    if (!consentBox.checked) { needConsent(); return false; }
    if (!elements) { cardErr(payBroken ? LOAD_FAIL : 'The card form is still loading. Try again in a moment.'); say($('o-card-err').textContent); return false; }
    return true;
  }
  function bookByCard() { if (readyToBook()) startBooking('card', null); }
  /* The wallet sheet opens only once resolve() is called: no box, no sheet. */
  function walletClick(ev) {
    if (busy || !readyToBook()) return;
    ev.resolve({ emailRequired: true, phoneNumberRequired: true });
  }
  /* Checked again on confirm: the consent rule holds on the wallet path too. */
  function walletConfirm(ev) {
    if (busy) { walletFailed(ev); return; }
    if (!readyToBook()) { walletFailed(ev); return; }
    startBooking(ev.expressPaymentType || 'wallet', ev);
  }
  function walletFailed(ev) { try { if (ev && ev.paymentFailed) ev.paymentFailed({ reason: 'fail' }); } catch (e) { /* the sheet is already closed */ } }

  function bookingBody() {
    var s = sizeOf(state.size), t = state.trip, c = state.contact;
    var photos = window.PhotoQuote ? PhotoQuote.photos() : [];
    var notes = c.notes.trim();
    return {
      email: c.email.trim(), name: c.name.trim().replace(/\s+/g, ' '), phone: c.phone.trim(),
      size: s.row, zip: t.zip, date: state.date, window: state.window,
      quotedCents: total(),
      consent: { agreed: true, version: ORDER.POLICY.consentVersion },
      attemptId: ATTEMPT,
      metadata: {
        address: fullAddress(), unit: c.unit.trim().slice(0, 100), notes: notes.slice(0, 480), photos: photos.join(',').slice(0, 480),
        // What the crew should know, where the booking ping shows it.
        items: [photoItems ? 'From photos: ' + photoItems : '', notes ? 'Notes: ' + notes : ''].filter(Boolean).join(' | ').slice(0, 480),
      },
    };
  }
  /* Billing details for the card: the contact step's (the wallet's as a fallback). */
  function billing(ev) {
    var c = state.contact, w = (ev && ev.billingDetails) || {};
    return { name: c.name.trim() || w.name || '', email: c.email.trim() || w.email || '', phone: c.phone.trim() || w.phone || '' };
  }
  function writeSummary(data, source) {
    var s = sizeOf(state.size), t = state.trip, d = dayOf(state.date), w = winOf(state.date, state.window), c = state.contact;
    var num = function (v, dflt) { return typeof v === 'number' && isFinite(v) ? v : dflt; };
    var names = c.name.trim().split(/\s+/);
    var tot = num(data.totalCents, total());
    write('bookingSummary', {
      size: s.label, loadCents: num(data.loadCents, s.cents), travelCents: num(data.travelCents, t.cents), totalCents: tot,
      paidCents: num(data.amountCents, tot),   // what the card pays now (the total less any founding discount)
      travel: t.label + ', ' + t.place, travelGuess: TRAVEL_GUESS,
      date: d.date, dayLabel: d.label, window: w.key, windowLabel: w.label,
      address: fullAddress(), phone: c.phone.trim(), email: c.email.trim(), zip: t.zip,
      firstName: names[0] || null, lastName: names.slice(1).join(' ') || null,
      customerId: data.customerId || null, wallet: WALLETS[source] || null,
    });
  }

  /* Book: check the card form, ask the server for the booking PaymentIntent (it
     reprices, checks the window and the consent), then pay it with Stripe. */
  var NOT_PAID = 'Your payment did not go through, so nothing was booked. Try again, or use another card.';
  // When the answer from Stripe is lost, money may have moved: never say it did not.
  var UNSURE = 'We could not confirm your payment. Check your email for a booking confirmation before you try again, or ' + CALL_US + '.';
  /* The last payment this page tried: if it went through after all (its answer
     was lost), resolve its booking data so Book does not charge a second time. */
  function earlierPaid() {
    if (!lastPay) return Promise.resolve(null);
    var was = lastPay;
    return Promise.resolve(stripe.retrievePaymentIntent(was.secret)).then(function (r) {
      var st = r && r.paymentIntent && r.paymentIntent.status;
      if (st === 'succeeded' || st === 'processing') return was.data;
      if (!st) throw { where: 'pay', text: UNSURE };
      lastPay = null;   // not paid: this Book makes a new payment
      return null;
    }, function () { throw { where: 'pay', text: UNSURE }; });
  }
  function startBooking(source, walletEv) {
    busy = true;
    payMsg(''); cardErr('');
    render();
    track('booking_attempt', { method: source });
    var data = null;
    /* The booking API's answer: a refusal, or the PaymentIntent to pay now. */
    function payFor(res, j) {
      if (!res.ok || !j.paymentIntentClientSecret) throw refusal(res.status, j);
      data = j;
      lastPay = { secret: j.paymentIntentClientSecret, data: j };
      // Written before the payment is confirmed: a card that needs a bank's
      // own page comes back to thanks.html with the summary already there.
      writeSummary(data, source);
      // The server charges less than the page showed only with the founding
      // offer on: the card form then shows the amount actually paid.
      if (typeof j.amountCents === 'number' && j.amountCents > 0 && j.amountCents !== payAmount) {
        payAmount = j.amountCents;
        try { elements.update({ amount: j.amountCents }); } catch (e) { /* Stripe charges the PaymentIntent's own amount */ }
      }
      return Promise.resolve(stripe.confirmPayment({
        elements: elements, clientSecret: j.paymentIntentClientSecret, redirect: 'if_required',
        confirmParams: { return_url: new URL('thanks.html', location.href).href, payment_method_data: { billing_details: billing(walletEv) } },
      })).catch(function () { throw { where: 'pay', text: UNSURE }; });
    }
    elements.submit().then(function (r) {
      if (r && r.error) throw { where: 'card', text: r.error.message };
      return earlierPaid();
    }).then(function (paid) {
      if (paid) { data = paid; return 'paid already'; }
      return fetch('../api/create-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bookingBody()) })
        .catch(function () { throw { where: 'pay', text: 'We could not reach our booking system. Check your connection and try again, or ' + CALL_US + '.' }; })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { return payFor(res, j); }); });
    }).then(function (c) {
      if (c === 'paid already') { walletFailed(walletEv); booked(data, source); return; }
      if (c && c.error) {
        var lost = c.error.type === 'api_connection_error' || c.error.type === 'api_error';
        throw lost ? { where: 'pay', text: UNSURE } : { where: 'card', text: c.error.message || NOT_PAID };
      }
      var st = c && c.paymentIntent && c.paymentIntent.status;
      if (st && st !== 'succeeded' && st !== 'processing') throw { where: 'card', text: NOT_PAID };
      booked(data, source);
    }).catch(function (e) {
      busy = false;
      walletFailed(walletEv);
      showFailure(e && e.where ? e : { where: 'pay', text: 'Something went wrong. Please try again, or ' + CALL_US + '.' });
    });
  }
  /* What the booking API's refusal means for the page. */
  function refusal(status, j) {
    var code = j && j.code;
    if (code === 'stale_quote' && typeof j.totalCents === 'number') {
      // The server's price wins: the page shows it, and the next Book sends it.
      override = { size: state.size, zip: state.trip.zip, cents: j.totalCents };
      return { where: 'pay', kind: 'note', text: 'The price has changed since this page loaded. Your new total is ' + fmt(j.totalCents) + '. Check it, then tap Book again.' };
    }
    if (code === 'window_full') {
      refused[state.date + '|' + state.window] = true;
      markRefused(days);
      state.window = null;
      refreshDays();
      return { where: 'o-when', text: 'That arrival window just filled up. Pick another one.' };
    }
    if (code === 'closed_day') {
      days = (days || []).filter(function (d) { return d.date !== state.date; });
      settleDay();
      state.window = null;
      refreshDays();
      return { where: 'o-when', text: 'We are not booking that day any more. Pick another day and window.' };
    }
    if (code === 'outside_area') return { where: 'o-zip', text: 'We do not book that address online. Please ' + CALL_US + ' for a price.' };
    if (code === 'consent_required') return consentBox.checked ? { where: 'pay', text: 'This page is out of date. Reload it, then book again.' } : { where: 'consent' };
    if (status === 503) return { where: 'pay', text: 'We are not taking online bookings just yet. Please ' + CALL_US + ' and we will get you on the schedule.' };
    return { where: 'pay', text: 'We could not book that just now. Please try again, or ' + CALL_US + '.' };
  }
  function showFailure(f) {
    drawWhen(); render();   // a refused window or day, or a new price, shows at once
    if (f.where === 'consent') { needConsent(); return; }
    var at = f.where === 'card' ? $('o-card-err') : f.where === 'o-when' ? $('o-when-msg') : f.where === 'o-zip' ? zipMsg : $('o-pay-msg');
    if (f.where === 'card') cardErr(f.text);
    else if (at === $('o-pay-msg')) payMsg(f.text, f.kind || 'err');
    else { at.textContent = f.text; at.className = 'o-msg is-err'; }
    say(f.text);
    var target = f.where === 'o-when' || f.where === 'o-zip' ? $(f.where) : at;
    target.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: f.where === 'o-when' || f.where === 'o-zip' ? 'start' : 'center' });
    track('booking_refused', { reason: f.kind === 'note' ? 'stale_quote' : f.where });
  }
  function booked(data, source) {
    var s = sizeOf(state.size), t = state.trip, c = state.contact;
    track('order_booked', { size: s.label, value: (data.amountCents || data.totalCents || total()) / 100, currency: 'USD', zone: t.zone, method: source });
    // The contact stays for next time in this tab; the day and window do not,
    // so going back from the thanks page cannot book the same slot twice.
    write(STORE, { size: state.size, zip: state.zip, date: null, window: null, contact: c });
    location.href = 'thanks.html';
  }

  /* ── the policy, from ORDER (red while guessed) ──────────────────────── */
  var P = ORDER.POLICY;
  document.querySelectorAll('[data-o="cancel"]').forEach(function (n) { fill(n, [guessy(P.cancelHours + ' hours', !!G.policy)]); });
  document.querySelectorAll('[data-o="late-fee"]').forEach(function (n) { fill(n, [guessy(fmt(P.lateFeeCents), !!G.policy)]); });
  document.querySelectorAll('[data-o="refusal-fee"]').forEach(function (n) { fill(n, [guessy(fmt(P.refusalFeeCents), !!G.policy)]); });
  // One story: bookings open shows the pay wording, closed the reserve wording.
  document.querySelectorAll('[data-mode]').forEach(function (n) { n.hidden = n.getAttribute('data-mode') !== (OPEN ? 'pay' : 'reserve'); });
  $('o-pay-h').textContent = OPEN ? 'Pay and book' : 'Reserve your day';
  // The refusal fee is printed only while there is one, so a fee is never kept that was not shown.
  document.querySelectorAll('[data-o="refusal"]').forEach(function (n) { n.hidden = !OPEN || !(P.refusalFeeCents > 0); });
  $('o-closed').hidden = OPEN;
  // A launch date, once the founder names one, lives in js/maintenance-banner.js only.
  if (!OPEN && window.SITE_REOPEN_TEXT) $('o-closed').textContent = 'We start hauling ' + window.SITE_REOPEN_TEXT + '. ' + $('o-closed').textContent;

  /* ── start: the URL, then this tab's earlier visit ───────────────────── */
  var q = new URLSearchParams(location.search);
  var saved = read(STORE) || {};
  var qs = parseInt(q.has('size') ? q.get('size') : q.get('load'), 10);
  var startSize = !isNaN(qs) && sizeOf(qs) ? qs : (sizeOf(saved.size) ? saved.size : null);
  var lastZip = '';
  try { lastZip = sessionStorage.getItem(ZIP_KEY) || ''; } catch (e) { /* private mode */ }
  var startZip = [q.get('zip'), lastZip, saved.zip].filter(function (z) { return /^\d{5}$/.test(z || ''); })[0] || '';
  var sc = saved.contact || {};
  Object.keys(FIELDS).forEach(function (k) { if (sc[k]) FIELDS[k].el.value = sc[k]; });
  if (sc.unit) OPTIONAL.unit.value = sc.unit;
  if (sc.notes) { OPTIONAL.notes.value = sc.notes; $('o-notes-box').hidden = false; $('o-notes-btn').setAttribute('aria-expanded', 'true'); }
  state.date = saved.date || null;
  state.window = saved.window || null;
  state.size = startSize;
  if (startZip) setZip(startZip, 'start');
  render();
  // Sections already open when the page loads count as seen, so nothing jumps.
  SECTIONS.forEach(function (id) { wasOpen[id] = $(id).classList.contains('is-open'); });
  // "Send us a photo" on the homepage lands here (#photos): the photo picker comes
  // into view with the focus on it, one tap from the camera or the photo library.
  var photoPick = location.hash === '#photos' && $('o-photo-panel') && $('o-photo-panel').querySelector('input[type="file"]');
  if (photoPick) { $('photos').scrollIntoView({ block: 'center' }); photoPick.focus({ preventScroll: true }); }
})();
