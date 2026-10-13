/* Shared page behaviour: the mobile menu and the sticky quote button.
   Same logic the homepage runs inline, in one cached file for every other
   page. Both degrade safely: without JS the menu links are still in the DOM
   (and in the footer), and the sticky bar simply never slides in. */
(function () {
  var burger = document.getElementById('navBurger');
  var links = document.getElementById('navLinks');
  if (burger && links) {
    var set = function (open) {
      links.classList.toggle('open', open);
      burger.classList.toggle('open', open); // the homepage's icon swap keys off this class
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      // The homepage burger carries no data-label-*; aria-expanded still says it.
      var label = burger.getAttribute(open ? 'data-label-close' : 'data-label-open');
      if (label) burger.setAttribute('aria-label', label);
    };
    burger.addEventListener('click', function () { set(!links.classList.contains('open')); });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && links.classList.contains('open')) { set(false); burger.focus(); } });
  }

  // Novah's dropdowns in the header (Services, What we take). On a wide screen one
  // opens under a mouse pointer, or on a tap or Enter, and closes when the pointer
  // leaves, on Escape, or on a tap anywhere else. A touch only taps (no hover), so
  // a tap never opens and closes it at once. In the phone menu the groups are open.
  var drops = [].slice.call(document.querySelectorAll('.nav-drop'));
  if (drops.length && window.matchMedia) {
    var wide = window.matchMedia('(min-width: 960px)');
    var setDrop = function (d, open) {
      d.classList.toggle('is-open', open);
      d.querySelector('.nav-drop-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    var closeAll = function (except) { drops.forEach(function (o) { if (o !== except) setDrop(o, false); }); };
    var syncDrops = function () { drops.forEach(function (d) { setDrop(d, !wide.matches); }); };
    drops.forEach(function (d) {
      var btn = d.querySelector('.nav-drop-btn'), timer = 0, by = '';
      // A mouse has already opened it by hovering, so its click keeps it open; a tap or a key toggles.
      btn.addEventListener('pointerdown', function (e) { by = e.pointerType; });
      btn.addEventListener('click', function () {
        if (!wide.matches) return;
        var open = by === 'mouse' || !d.classList.contains('is-open');
        by = '';
        closeAll(d);
        setDrop(d, open);
      });
      d.addEventListener('pointerenter', function (e) {
        if (!wide.matches || e.pointerType !== 'mouse') return;
        clearTimeout(timer);
        closeAll(d);
        setDrop(d, true);
      });
      d.addEventListener('pointerleave', function (e) {
        if (!wide.matches || e.pointerType !== 'mouse') return;
        timer = setTimeout(function () { setDrop(d, false); }, 180);
      });
      d.addEventListener('focusout', function (e) { if (wide.matches && !d.contains(e.relatedTarget)) setDrop(d, false); });
    });
    document.addEventListener('click', function (e) { if (wide.matches && !e.target.closest('.nav-drop')) closeAll(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !wide.matches) return;
      drops.forEach(function (d) {
        if (!d.classList.contains('is-open')) return;
        setDrop(d, false);
        d.querySelector('.nav-drop-btn').focus();
      });
    });
    if (wide.addEventListener) wide.addEventListener('change', syncDrops); else if (wide.addListener) wide.addListener(syncDrops);
    syncDrops();
  }

  // Novah's top bar: the hero's color at the top of the page; once scrolled it turns
  // frosted, slides away while you scroll down and comes back as soon as you scroll up.
  // It stays while the phone menu is open or something in it has keyboard focus.
  var bar = document.querySelector('.site-header') || document.querySelector('body > .site-nav');
  if (bar) {
    var lastY = window.scrollY, ticking = false;
    var onScroll = function () {
      ticking = false;
      var y = Math.max(0, window.scrollY), d = y - lastY;
      bar.classList.toggle('is-scrolled', y > 8);
      var keep = y < 80 || (links && links.classList.contains('open')) || !!bar.querySelector(':focus-visible');
      if (keep || d < -6) bar.classList.remove('is-hidden');
      else if (d > 6) {
        bar.classList.add('is-hidden');
        // an open dropdown goes with it, so it is not still open when the bar comes back
        [].forEach.call(bar.querySelectorAll('.nav-drop.is-open'), function (o) {
          if (window.matchMedia && !matchMedia('(min-width: 960px)').matches) return;
          o.classList.remove('is-open');
          o.querySelector('.nav-drop-btn').setAttribute('aria-expanded', 'false');
        });
      }
      if (keep || Math.abs(d) > 6) lastY = y;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();
  }

  // WhatsApp buttons (a[data-wa] holds the chat address): the message says hello and,
  // once the visitor has given a ZIP anywhere on the site, the ZIP. The order page
  // (js/order.js) writes its own message with the size.
  var es = document.documentElement.lang === 'es';
  var waLinks = [].slice.call(document.querySelectorAll('a[data-wa]'));
  var waSync = function () {
    var zip = '';
    try { zip = sessionStorage.getItem('quoteZip') || ''; } catch (e) { /* private mode */ }
    var msg = es ? 'Hola, quiero una cotización para retirar basura.' : 'Hi, I would like a junk removal quote.';
    if (/^\d{5}$/.test(zip)) msg += es ? ' Mi código postal es ' + zip + '.' : ' My ZIP is ' + zip + '.';
    waLinks.forEach(function (a) { a.href = a.getAttribute('data-wa') + '?text=' + encodeURIComponent(msg); });
  };
  if (waLinks.length) { waSync(); window.addEventListener('quotezip', waSync); }

  // Sticky CTA: slides in once the hero is scrolled past, and steps aside
  // while another quote button (price card, closing banner) is on screen so
  // two identical buttons are never stacked on top of each other.
  var cta = document.getElementById('stickyCta');
  if (!cta) return;
  var past = false, covered = 0;
  var sync = function () { cta.classList.toggle('show', past && covered === 0); };
  window.addEventListener('scroll', function () {
    var p = window.scrollY > window.innerHeight * 0.6;
    if (p !== past) { past = p; sync(); }
  }, { passive: true });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.target._in === e.isIntersecting) return;
        e.target._in = e.isIntersecting;
        covered += e.isIntersecting ? 1 : -1;
      });
      sync();
    });
    document.querySelectorAll('[data-hides-sticky]').forEach(function (el) { el._in = false; io.observe(el); });
  }

  // Price card calculator (city pages). Everything it shows comes from the
  // card's data-calc, generated by scripts/build-regions.mjs from
  // pricing.config.mjs, so this file holds no prices. The quote link is left
  // plain on purpose: the estimator opens exactly as it does from the homepage,
  // at step 1 with nothing selected.
  document.querySelectorAll('[data-calc]').forEach(function (card) {
    var c;
    try { c = JSON.parse(card.getAttribute('data-calc')); } catch (e) { return; }
    var col = 0, row = 0;
    var price = card.querySelector('[data-calc-price]');
    var label = card.querySelector('[data-calc-label]');
    var render = function () {
      price.textContent = c.prices[row][col];
      label.textContent = c.freq[col] + ' · ' + c.dogs[row];
      card.querySelectorAll('[data-calc-col]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-calc-col') === col)); });
      card.querySelectorAll('[data-calc-row]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-calc-row') === row)); });
    };
    card.addEventListener('click', function (e) {
      var b = e.target.closest('[data-calc-col],[data-calc-row]');
      if (!b) return;
      if (b.hasAttribute('data-calc-col')) col = +b.getAttribute('data-calc-col');
      else row = +b.getAttribute('data-calc-row');
      render();
    });
  });
})();
