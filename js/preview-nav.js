// Local preview bar: Home / Order / Thanks on every page, so the whole flow
// can be clicked through without paying. Runs on localhost only; on the real
// site this file does nothing. (The old checkout page is a redirect to the
// order page since round 6.)
(function () {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;

  // Page numbers, so the founder and I can name a page in a message ("page 12, the
  // button"; founder 2026-10-15: "number pages at the top for now for better
  // communications"). A blue strip over the header, local only. The booking adds its
  // step: 3.1 Size to 3.4 Checkout. Towns come last, as they are the list most likely to change.
  (function pageNumber() {
    const human = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
    const town = (s) => s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const PAGES = [
      ['index.html', 'Home'], ['prices.html', 'Prices'], ['book/quote.html', 'Booking'],
      ['book/thanks.html', 'Booking done'], ['book/commercial.html', 'Property managers'],
      ['before-we-come.html', 'Before we come'], ['faq.html', 'Help and FAQ'],
      ['terms.html', 'Terms'], ['privacy.html', 'Privacy'], ['404.html', 'Page not found'],
      ...['garage-cleanout', 'furniture-removal', 'estate-cleanout', 'hot-tub-removal', 'mattress-removal',
        'appliance-removal', 'yard-debris-removal', 'hoarder-cleanout'].map((s) => [`portland/${s}.html`, human(s)]),
      ['blog/index.html', 'Blog'],
      ...['choosing-a-junk-removal-company', 'clearing-a-rental-between-tenants', 'estate-cleanout',
        'fridge-and-freezer-disposal', 'garage-cleanout-in-a-weekend', 'junk-removal-or-dumpster', 'mattress-disposal',
        'piano-removal', 'what-junk-haulers-cant-take', 'what-junk-removal-costs', 'where-hauled-junk-goes',
        'yard-debris-after-a-storm'].map((s) => [`blog/${s}.html`, 'Blog: ' + human(s)]),
      ...['aloha', 'aurora', 'battle-ground', 'beaverton', 'boring', 'brush-prairie', 'camas', 'canby', 'clackamas',
        'corbett', 'damascus', 'estacada', 'fairview', 'gladstone', 'gresham', 'happy-valley', 'hillsboro', 'king-city',
        'la-center', 'lake-oswego', 'milwaukie', 'molalla', 'newberg', 'oregon-city', 'portland', 'ridgefield', 'sandy',
        'scappoose', 'sherwood', 'tigard', 'troutdale', 'tualatin', 'vancouver', 'washougal', 'welches', 'west-linn',
        'wilsonville', 'wood-village', 'woodland', 'yacolt'].map((s) => [`${s}.html`, 'Town: ' + town(s)]),
    ];
    const STEPS = { size: 'Size', when: 'When', contact: 'Contact', book: 'Checkout' };

    let p = location.pathname.replace(/^\/+/, '');
    if (p === '' || p.endsWith('/')) p += 'index.html';
    else if (!/\.[a-z]+$/i.test(p)) p += '.html';
    const spanish = p.startsWith('es/');
    if (spanish) p = p.slice(3);
    if (/^Page not found/.test(document.title)) p = '404.html';
    const i = PAGES.findIndex(([path]) => path === p);

    const strip = document.createElement('div');
    strip.setAttribute('aria-hidden', 'true');
    strip.style.cssText = 'display:flex;align-items:center;gap:10px;min-height:36px;padding:4px 16px;background:#1D4ED8;'
      + 'color:#fff;font:600 16px/1.3 system-ui,sans-serif;position:relative;z-index:10000';
    const num = document.createElement('span');
    num.style.cssText = 'padding:2px 10px;border-radius:999px;background:#fff;color:#1D4ED8;font-weight:800;white-space:nowrap';
    const name = document.createElement('span');
    strip.append(num, name);

    function paint() {
      if (i < 0) { num.textContent = 'No number'; name.textContent = '/' + p; return; }
      let n = String(i + 1), label = PAGES[i][1];
      if (p === 'book/quote.html') {
        const open = [...document.querySelectorAll('.o-sec[data-step]')].find((s) => !s.hidden);
        const k = open && open.getAttribute('data-step');
        if (k && STEPS[k]) { n += '.' + (Object.keys(STEPS).indexOf(k) + 1); label += ': ' + STEPS[k]; }
      }
      num.textContent = 'Page ' + n;
      name.textContent = label + (spanish ? ' (Spanish)' : '');
    }
    paint();
    document.body.prepend(strip);
    if (p === 'book/quote.html') {
      new MutationObserver(paint).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    }
  })();

  // Off unless asked for (?preview once in a tab): the founder walks the site locally and
  // it is clutter on every page.
  try { if (/[?&]preview/.test(location.search)) sessionStorage.setItem('previewNav', '1'); if (!sessionStorage.getItem('previewNav')) return; } catch (e) { return; }

  const SAMPLE_CONTACT = { name: 'Sample Customer', email: 'sample@example.com', phone: '(000) 000-0000', addr: '123 Sample St' };

  function read(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function write(key, v) { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  async function toThanks() {
    if (!read('bookingSummary')) {
      // The shape js/order.js writes after a booking: the first size, the
      // first metro ZIP's travel, the first open day and window.
      const { PRICES, ONE_TIME_COL, LOAD_OPTIONS, ALL_ZIPS, travelFor, SCHEDULE } = await import('/pricing.config.mjs');
      const t = travelFor(ALL_ZIPS[0]);
      const day = new Date(Date.now() + 2 * 86400000);
      write('bookingSummary', {
        size: LOAD_OPTIONS[0].label, loadCents: PRICES[0][ONE_TIME_COL], travelCents: t.cents,
        totalCents: PRICES[0][ONE_TIME_COL] + t.cents, travel: `${t.label}, ${t.place}`,
        date: day.toISOString().slice(0, 10), dayLabel: day.toDateString().slice(0, 10),
        window: SCHEDULE.windows[0].key, windowLabel: SCHEDULE.windows[0].label,
        address: `${SAMPLE_CONTACT.addr}, ${t.place}, ${t.state} ${t.zip}`, phone: SAMPLE_CONTACT.phone,
        email: SAMPLE_CONTACT.email, firstName: 'Sample',
      });
    }
    location.href = '/book/thanks.html';
  }

  const links = [
    ['Home', '/index.html'],
    ['Order', '/book/quote.html'],
    ['Thanks', '/book/thanks.html', toThanks],
  ];

  const bar = document.createElement('nav');
  bar.setAttribute('aria-label', 'Local preview');
  bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 16px;'
    + 'background:#222;color:#fff;font:16px/1.2 system-ui,sans-serif;position:relative;z-index:9999';
  bar.append(Object.assign(document.createElement('span'), { textContent: 'Preview:' }));
  for (const [label, path, go] of links) {
    const a = document.createElement('a');
    a.textContent = label;
    a.href = path;
    a.style.cssText = 'display:inline-flex;align-items:center;min-height:48px;min-width:48px;padding:0 14px;'
      + 'border-radius:6px;background:#444;color:#fff;text-decoration:none';
    const here = location.pathname === path || (path === '/index.html' && location.pathname === '/');
    if (here) { a.style.background = '#0a7'; a.setAttribute('aria-current', 'page'); }
    if (go) a.addEventListener('click', (e) => { e.preventDefault(); go(); });
    bar.append(a);
  }
  // Placeholder guesses print red with an asterisk; the list is GUESSES.md.
  const key = document.createElement('span');
  key.innerHTML = '<span style="color:#FF8A80">Red*</span> = a guess, listed in GUESSES.md';
  bar.append(key);
  document.body.prepend(bar);
})();
