/* Photo quote, the page half: the customer picks up to 4 photos of the junk,
   we shrink them in the browser, send them to api/photo-quote.js, and Claude
   counts the items. Claude only counts; the page turns the count into a size
   and the server still prices the size on its own.

   Used by the order page (book/quote.html), and by the homepage hero until
   that moves to the size cards (round 6, Task 10).

   The stored photo paths ride with the booking (sessionStorage quotePhotos);
   small thumbnails (quoteThumbs) and the last read back line come back when
   the customer returns to the page.

   PhotoQuote.mount(host, {
     endpoint,             '../api/photo-quote'
     cls,                  class prefix for the parts (default 'pq')
     noteKey,              sessionStorage key for the last line (default 'quotePhotoNote')
     text,                 { snap, sendUpTo(n), getting, cantOpen, looking, cantRead }
     onBusy(on),           while the photos are being read
     onResult(res)         res = { items, notes, unsure } from the API;
                           return { text, kind: 'done' | 'err' } for the line under the photos
   }) -> { say(text, kind), input }
   PhotoQuote.shrink(fileOrDataUrl, maxPx, quality) -> Promise<dataUrl|null>
   PhotoQuote.photos() -> the stored photo paths                                    */
(function () {
  'use strict';
  var PHOTOS_KEY = 'quotePhotos', THUMBS_KEY = 'quoteThumbs';
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

  var EN = {
    snap: 'Send photos', sendUpTo: function (n) { return 'Up to ' + n + ' photos. We count what is in them.'; },
    getting: 'Getting your photos ready…',
    cantOpen: 'We could not open those photos. Try different ones, or pick the closest size.',
    looking: 'Looking at your photos…',
    cantRead: 'We could not read the photos right now. Pick the closest size. If the photos came through, we will still see them.'
  };

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function mount(host, opts) {
    opts = opts || {};
    var C = opts.cls || 'pq';
    var S = opts.text || EN;
    var NOTE_KEY = opts.noteKey || 'quotePhotoNote';
    host.classList.add(C + '-photo');

    var pick = h('label', C + '-snap');
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.className = C + '-file';
    var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('class', C + '-cam');
    icon.innerHTML = '<path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/>';
    var words = h('span', C + '-snap-words');
    words.appendChild(h('strong', null, S.snap));
    words.appendChild(h('small', null, S.sendUpTo(MAX_PHOTOS)));
    pick.appendChild(input); pick.appendChild(icon); pick.appendChild(words);
    var thumbs = h('div', C + '-thumbs');
    var msg = h('p', C + '-ai');
    msg.setAttribute('aria-live', 'polite');
    host.appendChild(pick); host.appendChild(thumbs); host.appendChild(msg);

    function showThumbs(list, busy) {
      thumbs.innerHTML = '';
      list.forEach(function (src) {
        var f = h('span', C + '-thumb' + (busy ? ' is-busy' : ''));
        var img = document.createElement('img'); img.src = src; img.alt = '';
        f.appendChild(img); thumbs.appendChild(f);
      });
    }
    function say(text, kind) { msg.textContent = text || ''; msg.className = C + '-ai' + (kind ? ' is-' + kind : ''); }
    function busy(on) { if (opts.onBusy) opts.onBusy(on); }

    // Coming back to the page: show what they already sent.
    var kept = readStore(THUMBS_KEY, []);
    if (kept.length) { showThumbs(kept, false); say(readStore(NOTE_KEY, ''), 'done'); }

    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || [], 0, MAX_PHOTOS);
      input.value = '';
      if (!files.length) return;
      say(S.getting, 'busy');
      Promise.all(files.map(function (f) { return shrink(f, 1280, 0.78); })).then(function (big) {
        big = big.filter(Boolean);
        if (!big.length) { say(S.cantOpen, 'err'); return; }
        return Promise.all(big.map(function (d) { return shrink(d, 160, 0.7); })).then(function (small) {
          showThumbs(small, true);
          busy(true);
          say(S.looking, 'busy');
          return fetch(opts.endpoint, {
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
            var out = opts.onResult ? opts.onResult({ items: j.items || {}, notes: j.notes || '', unsure: !!j.unsure }) : null;
            if (out && out.text) { say(out.text, out.kind || 'done'); writeStore(NOTE_KEY, out.text); }
          });
        });
      }).catch(function () {
        showThumbs(readStore(THUMBS_KEY, []), false);
        say(S.cantRead, 'err');
      }).then(function () { busy(false); });
    });

    return { say: say, input: input };
  }

  window.PhotoQuote = {
    mount: mount, shrink: shrink, MAX_PHOTOS: MAX_PHOTOS,
    photos: function () { return readStore(PHOTOS_KEY, []).filter(function (p) { return typeof p === 'string'; }).slice(0, MAX_PHOTOS); }
  };
})();
