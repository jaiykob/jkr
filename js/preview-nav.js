// Local preview bar: Home / Order / Thanks on every page, so the whole flow
// can be clicked through without paying. Runs on localhost only; on the real
// site this file does nothing. (The old checkout page is a redirect to the
// order page since round 6.)
(function () {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;

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
