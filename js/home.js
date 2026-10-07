/* Homepage: the hero load builder, the scroll road, the card tilt, the price
   tier fill and the ZIP check. Each piece is optional; without JS the page is
   plain and every link still goes to the quote. */
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

  // Hero: the configurator. "Book this load" opens the quote with the size set.
  var hero = window.LoadBuilder ? LoadBuilder.mount(document.getElementById('heroBuilder'), { cta: { href: ROOT + 'book/quote.html' }, persist: true, photos: { endpoint: ROOT + 'api/photo-quote' } }) : null;

  // How it works: the truck drives the road as the section scrolls by.
  var road = document.querySelector('.road');
  if (road && !reduce) {
    road.classList.add('is-live');
    var truck = road.querySelector('.road-truck');
    var lane = road.querySelector('.road-lane');
    var wheels = road.querySelectorAll('.road-wheel');
    var stops = road.querySelectorAll('.road-stop');
    var cargo = road.querySelector('.road-cargo');
    var ticking = false;
    var update = function () {
      ticking = false;
      var r = road.getBoundingClientRect();
      var span = r.height - window.innerHeight;
      var p = Math.max(0, Math.min(1, span > 0 ? -r.top / span : 0));
      var travel = lane.clientWidth - truck.getBoundingClientRect().width;
      truck.style.transform = 'translateX(' + (p * travel).toFixed(1) + 'px)';
      wheels.forEach(function (w) { w.style.transform = 'rotate(' + (p * 1440).toFixed(0) + 'deg)'; });
      var phase = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
      stops.forEach(function (s, i) { s.classList.toggle('is-on', i <= phase); });
      // loaded after stop one, empty (hauled) at the end
      cargo.style.opacity = p < 0.2 ? p / 0.2 : p > 0.9 ? Math.max(0, (1 - p) / 0.1) : 1;
    };
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

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
  // and the hero truck adds the travel to its price.
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
      if (zin.value.length < 5) return;
      if (t) {
        try { sessionStorage.setItem('quoteZip', t.zip); } catch (e) { /* private mode */ }
        if (hero) hero.setTravel(t);
        var fee = '<span' + (T.GUESS ? ' class="guess"' : '') + '>' + (t.cents ? S.travel + money(t.cents) : S.noTravel) + '</span>';
        zout.className = 'zip-out ok';
        zout.innerHTML = S.yes + esc(t.place) + '. ' + esc(zoneName(t.label)) + ': ' + fee + '. <a href="' + ROOT + 'book/quote.html?zip=' + t.zip + '">' + S.price + '</a>';
      } else {
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
