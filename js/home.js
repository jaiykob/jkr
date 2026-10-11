/* Homepage: the size cards' travel line, the card tilt, the price tier fill
   and the ZIP check. Each piece is optional; without JS the page is plain and
   every link still goes to the quote. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  // Hero: the five size cards are links to the order page. Once the ZIP is known each
  // card says what travel adds (js/size-cards.js); until then it says "+ travel".
  var hero = window.SizeCards ? SizeCards.mount(document.getElementById('homeSizes'), {
    words: ES ? { none: 'Sin cargo de viaje', suffix: ' de viaje' } : null
  }) : null;
  // Each card opens the order page with its size picked, and with the ZIP once we
  // know it (the order page reads quoteZip too; the link carries it if storage is off).
  var cardLinks = [].slice.call(document.querySelectorAll('#homeSizes a.size-card'));
  var cardHrefs = cardLinks.map(function (a) { return a.getAttribute('href'); });
  function cardsZip(zip) { cardLinks.forEach(function (a, i) { a.setAttribute('href', cardHrefs[i] + (zip ? '&zip=' + zip : '')); }); }

  // What we take: cards tilt toward the pointer.
  if (!reduce && matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.take').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var b = card.getBoundingClientRect();
        var x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
        card.style.transform = 'rotateX(' + (-y * 10).toFixed(2) + 'deg) rotateY(' + (x * 12).toFixed(2) + 'deg)';
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }

  // Price tiers: the little trucks fill when they scroll into view.
  var tiers = document.querySelector('.tiers');
  if (tiers) {
    if ('IntersectionObserver' in window && !reduce) {
      var io = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { tiers.classList.add('is-in'); io.disconnect(); }
      }, { threshold: 0.3 });
      io.observe(tiers);
    } else tiers.classList.add('is-in');
  }

  // ZIP check: the answer as you type (zone and travel), its zone lights up,
  // and the size cards add the travel to their prices.
  var zin = document.getElementById('zipIn'), zout = document.getElementById('zipOut');
  var form = document.getElementById('zipCheck');
  function money(c) { return '$' + (c / 100).toFixed(2); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  if (zin && T) {
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    zin.addEventListener('input', function () {
      zin.value = zin.value.replace(/\D/g, '').slice(0, 5);
      var t = zin.value.length === 5 ? T.travelFor(zin.value) : null;
      document.querySelectorAll('#zoneList li').forEach(function (li) { li.classList.toggle('is-hit', !!t && li.getAttribute('data-zone') === t.zone); });
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
