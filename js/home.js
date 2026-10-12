/* Homepage: the travel line on the size cards and the price ticket, and the
   ZIP check. Each piece is optional; without JS the page is plain and every
   link still goes to the quote. */
(function () {
  'use strict';
  var T = window.TRAVEL;
  // The site root, from this script's own address: the Spanish homepage lives
  // in /es/, and the quote and the API are one level up from it.
  var me = document.currentScript && document.currentScript.src;
  var ROOT = me ? me.replace(/js\/home\.js(\?.*)?$/, '') : '';
  var ES = document.documentElement.lang === 'es';
  var S = ES ? {
    travel: 'viaje +', noTravel: 'sin cargo de viaje', yes: 'Sí, vamos a ', price: 'Ver mi precio',
    far: 'Eso queda más lejos de lo que cotizamos en línea. Llama o escribe al ', farEnd: ' y te damos el precio.'
  } : {
    travel: 'travel +', noTravel: 'no travel charge', yes: 'Yes, we come to ', price: 'Get my price',
    far: 'That is farther than we price online. Call or text ', farEnd: ' and we will quote it.'
  };
  function zoneName(l) { return ES ? String(l).replace(/^Home zone$/, 'Zona base').replace(/^Zone /, 'Zona ') : l; }

  // The five size cards (the sizes band) and the hero's price ticket are links to the
  // order page. Once the ZIP is known each says what travel adds (js/size-cards.js);
  // until then "+ travel".
  var words = ES ? { none: 'Sin cargo de viaje', suffix: ' de viaje' } : null;
  var lists = window.SizeCards ? [
    SizeCards.mount(document.getElementById('homeSizes'), { words: words }),
    SizeCards.mount(document.querySelector('.h-art'), { words: words, selector: '.h-ticket' })
  ].filter(Boolean) : [];
  var hero = lists.length ? { setTravel: function (t, g) { lists.forEach(function (l) { l.setTravel(t, g); }); } } : null;
  // Each opens the order page with its size picked, and with the ZIP once we know it
  // (the order page reads quoteZip too; the link carries it if storage is off).
  var cardLinks = [].slice.call(document.querySelectorAll('#homeSizes a.size-card, a.h-ticket'));
  var cardHrefs = cardLinks.map(function (a) { return a.getAttribute('href'); });
  function cardsZip(zip) { cardLinks.forEach(function (a, i) { a.setAttribute('href', cardHrefs[i] + (zip ? '&zip=' + zip : '')); }); }

  // ZIP check: the answer as you type (zone and travel), its zone card lights up,
  // its dot on the map grows, and the size cards add the travel to their prices.
  // Without this script the form opens the order page with the ZIP (action, name="zip").
  var zin = document.getElementById('zipIn'), zout = document.getElementById('zipOut');
  var form = document.getElementById('zipCheck');
  function money(c) { return '$' + (c / 100).toFixed(2); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  if (zin && T) {
    form.addEventListener('submit', function (e) { e.preventDefault(); zin.dispatchEvent(new Event('input')); zin.focus(); });
    zin.addEventListener('input', function () {
      zin.value = zin.value.replace(/\D/g, '').slice(0, 5);
      var t = zin.value.length === 5 ? T.travelFor(zin.value) : null;
      document.querySelectorAll('#zoneList li').forEach(function (li) { li.classList.toggle('is-hit', !!t && li.getAttribute('data-zone') === t.zone); });
      document.querySelectorAll('.map-dots circle').forEach(function (c) { c.classList.toggle('is-hit', !!t && c.getAttribute('data-zip') === t.zip); });
      zout.className = 'zip-out';
      zout.textContent = '';
      if (zin.value.length < 5) { if (hero) hero.setTravel(null); cardsZip(''); return; }
      if (t) {
        try { sessionStorage.setItem('quoteZip', t.zip); } catch (e) { /* private mode */ }
        window.dispatchEvent(new Event('quotezip'));
        if (hero) hero.setTravel(t, !!T.GUESS);
        cardsZip(t.zip);
        var fee = '<span' + (T.GUESS ? ' class="guess"' : '') + '>' + (t.cents ? S.travel + money(t.cents) : S.noTravel) + '</span>';
        zout.className = 'zip-out ok';
        zout.innerHTML = S.yes + esc(t.place) + '. ' + esc(zoneName(t.label)) + ': ' + fee + '. <a href="' + ROOT + 'book/quote.html?zip=' + t.zip + '">' + S.price + '</a>';
      } else {
        if (hero) hero.setTravel(null);
        cardsZip('');
        zout.className = 'zip-out no';
        zout.innerHTML = S.far + '<a href="tel:+19254086053">(925) 408-6053</a>' + S.farEnd;
      }
    });
    // Back on the homepage: the ZIP they already gave us.
    var saved = '';
    try { saved = sessionStorage.getItem('quoteZip') || ''; } catch (e) { /* private mode */ }
    if (/^\d{5}$/.test(saved) && !zin.value) { zin.value = saved; zin.dispatchEvent(new Event('input')); }
  }
})();
