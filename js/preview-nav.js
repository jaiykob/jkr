// Local preview bar: Home / Quote / Checkout / Thanks on every page, so the
// whole flow can be clicked through without paying. Runs on localhost only;
// on the real site this file does nothing.
(function () {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;

  const SAMPLE_CONTACT = {
    name: 'Sample Customer', email: 'sample@example.com', phone: '(000) 000-0000',
    addr: '123 Sample St', items: 'Old couch and boxes',
  };

  function read(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function write(key, v) { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode */ } }

  async function toCheckout() {
    const { PRICES, ONE_TIME_COL, ALL_ZIPS, COLUMN_LABELS, COLUMNS } = await import('/pricing.config.mjs');
    const c = read('quoteContact') || {};
    // Checkout sends you back to the quote without a full contact; fill the gaps.
    const contact = { ...SAMPLE_CONTACT, ...c, zip: ALL_ZIPS.includes(c.zip) ? c.zip : ALL_ZIPS[0] };
    write('quoteContact', contact);
    const p = new URLSearchParams({
      freq: COLUMN_LABELS[COLUMNS[ONE_TIME_COL]], fi: String(ONE_TIME_COL), load: '0',
      cents: String(PRICES[0][ONE_TIME_COL]), zip: contact.zip,
    });
    location.href = `/book/checkout.html?${p}`;
  }

  async function toThanks() {
    if (!read('bookingSummary')) {
      const { PRICES, ONE_TIME_COL } = await import('/pricing.config.mjs');
      write('bookingSummary', {
        cadence: 'One-time visit, Monday', day: 'Monday', plan: 'Preview booking',
        last4: '4242', amountCents: PRICES[0][ONE_TIME_COL], phone: SAMPLE_CONTACT.phone,
        address: SAMPLE_CONTACT.addr, firstName: 'Sample',
      });
    }
    location.href = '/book/thanks.html';
  }

  const links = [
    ['Home', '/index.html'],
    ['Quote', '/book/quote.html'],
    ['Checkout', '/book/checkout.html', toCheckout],
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
  document.body.prepend(bar);
})();
