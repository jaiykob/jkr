/* Homepage: the hero load builder, the scroll road, the card tilt, the price
   tier fill and the ZIP check. Each piece is optional; without JS the page is
   plain and every link still goes to the quote. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var D = window.LOAD_BUILDER || {};

  // Hero: the configurator. "Book this load" opens the quote with the size set.
  if (window.LoadBuilder) LoadBuilder.mount(document.getElementById('heroBuilder'), { cta: { href: 'book/quote.html' }, persist: true, photos: { endpoint: 'api/photo-quote' } });

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

  // ZIP check: the answer as you type, and the city lights up.
  var zin = document.getElementById('zipIn'), zout = document.getElementById('zipOut');
  var form = document.getElementById('zipCheck');
  if (zin && D.zips) {
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    zin.addEventListener('input', function () {
      zin.value = zin.value.replace(/\D/g, '').slice(0, 5);
      var city = D.zips[zin.value];
      document.querySelectorAll('#areaCities li').forEach(function (li) { li.classList.toggle('is-hit', li.getAttribute('data-city') === city); });
      zout.className = 'zip-out';
      zout.textContent = '';
      if (zin.value.length < 5) return;
      if (city) {
        zout.className = 'zip-out ok';
        zout.innerHTML = 'Yes, we come to ' + city + '. <a href="book/quote.html?zip=' + zin.value + '">Get my price</a>';
      } else {
        zout.className = 'zip-out no';
        zout.innerHTML = 'Not yet. Call or text <a href="tel:+19254086053">(925) 408-6053</a> and ask.';
      }
    });
  }
})();
