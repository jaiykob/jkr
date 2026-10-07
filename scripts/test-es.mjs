// The Spanish site: the phrase map translator, the links that stay inside
// /es/ or step out of it, the language switch, hreflang, and that a new
// English phrase with no Spanish stops the build. No network.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { phraseKey, translateHtml, toSpanish } from './build-es.mjs';
import { twinOf, hasEsTwin, langSwitch, setLangSwitch, hreflang, absUrl } from './lib/twins.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };

console.log('== phrase keys ==');
ok(phraseKey('  Up to 10 road\n   miles ') === 'Up to {0} road miles', `numbers become slots: "${phraseKey('  Up to 10 road\n   miles ')}"`);
ok(phraseKey('+$25.00 per visit') === '+${0} per visit', `money: "${phraseKey('+$25.00 per visit')}"`);
ok(phraseKey('1/4 truck') === '{0}/{1} truck', `fractions: "${phraseKey('1/4 truck')}"`);

console.log('== translating text ==');
const map = {
  'Fill the truck.': 'Llena el camión.',
  'Up to {0} road miles from Gresham': 'Hasta {0} millas por carretera desde Gresham',
  'Call or text': 'Llama o escribe',
  'and we will price it.': 'y te damos el precio.',
  'Open menu': 'Abrir menú',
  'Your ZIP code': 'Tu código postal',
  'Junk removal near you.': 'Retiro de basura cerca de ti.',
  '{0}/{1} truck': '{0}/{1} de camión',
};
const src = [
  '<html lang="en"><head><title>Junk removal near you.</title><meta name="description" content="Junk removal near you." /></head><body>',
  '<h1> Fill the truck. </h1>',
  '<p>Up to 12 road miles from Gresham</p>',
  '<p>Call or text <a href="tel:+19254086053">(925) 408-6053</a> and we will price it.</p>',
  '<button aria-label="Open menu"></button><label>Your ZIP code</label>',
  '<script>var s = "Fill the truck.";</script><style>.a{}</style><!-- Fill the truck. -->',
  '<svg viewBox="0 0 2 2"><text>Fill the truck.</text></svg>',
  '<a href="gresham.html">Gresham</a> <span>Brand Name</span> <span>&copy; 2026 Brand Name &nbsp;·&nbsp;</span>',
  '<span>1/4 truck</span>',
  '</body></html>',
].join('\n');
const r = translateHtml(src, map, { places: ['Gresham'], brand: 'Brand Name' });
ok(r.missing.length === 0, `nothing should be missing: ${r.missing.join(' | ')}`);
ok(r.html.includes('<h1> Llena el camión. </h1>'), 'text is translated and its spacing kept');
ok(r.html.includes('<p>Hasta 12 millas por carretera desde Gresham</p>'), 'the number goes back into its slot');
ok(r.html.includes('<p>Llama o escribe <a href="tel:+19254086053">(925) 408-6053</a> y te damos el precio.</p>'), 'text around an inline link');
ok(r.html.includes('aria-label="Abrir menú"') && r.html.includes('<label>Tu código postal</label>'), 'labels for screen readers are translated');
ok(r.html.includes('<title>Retiro de basura cerca de ti.</title>') && r.html.includes('content="Retiro de basura cerca de ti."'), 'title and description are translated');
ok(r.html.includes('var s = "Fill the truck.";') && r.html.includes('<!-- Fill the truck. -->') && r.html.includes('<text>Fill the truck.</text>'), 'scripts, comments and drawings are left alone');
ok(r.html.includes('>Gresham</a>') && r.html.includes('<span>Brand Name</span>'), 'place names and the brand are not phrases');
ok(r.html.includes('<span>1/4 de camión</span>'), 'fractions keep both numbers');
const r2 = translateHtml('<p>A brand new sentence.</p><p>Fill the truck.</p>', map, {});
ok(r2.missing.length === 1 && r2.missing[0] === 'A brand new sentence.', `a phrase with no Spanish is listed: ${JSON.stringify(r2.missing)}`);

console.log('== twins ==');
ok(twinOf('index.html') === 'es/index.html' && twinOf('es/index.html') === 'index.html', 'the homepage pairs with es/index.html');
ok(twinOf('privacy.html') === null && twinOf('book/quote.html') === null, 'pages with no Spanish have no twin');
ok(hasEsTwin('index.html') === true, 'the homepage has a Spanish twin');
ok(absUrl('es/index.html') === 'https://www.example.com/es/' && absUrl('index.html') === 'https://www.example.com/' && absUrl('faq.html') === 'https://www.example.com/faq.html', 'folder pages are addressed as the folder');
const hl = hreflang('es/index.html');
ok(hl.includes('hreflang="en" href="https://www.example.com/"') && hl.includes('hreflang="es" href="https://www.example.com/es/"') && hl.includes('hreflang="x-default" href="https://www.example.com/"'), `hreflang lines: ${hl}`);
ok(hreflang('privacy.html') === '', 'no hreflang without a twin');

console.log('== the language switch ==');
ok(/href="es\/index\.html"/.test(langSwitch('index.html')) && /lang="es"/.test(langSwitch('index.html')), 'English homepage switches to the Spanish homepage');
ok(/href="\.\.\/index\.html"/.test(langSwitch('es/index.html')) && /lang="en"/.test(langSwitch('es/index.html')), 'Spanish homepage switches back');
ok(/href="es\/index\.html"/.test(langSwitch('privacy.html')), 'a page with no Spanish switches to the Spanish homepage');
ok(/href="\.\.\/es\/index\.html"/.test(langSwitch('book/commercial.html')), 'from a folder, the path climbs out first');
const nav = '<div class="nav-right"><a class="lang-switch" href="x">ES</a></div>';
ok(setLangSwitch(nav, 'es/index.html').includes(langSwitch('es/index.html')), 'setLangSwitch swaps the element in place');
const sw = langSwitch('index.html').match(/class="lang-switch"/);
ok(sw && (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes(langSwitch('index.html'))), 'the homepage carries the switch');

const page = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
ok(page('index.html').includes(hreflang('index.html')), 'the English homepage names its Spanish twin');
ok(page('faq.html').includes(hreflang('faq.html')) && page('faq.html').includes(langSwitch('faq.html')) && /es\/faq\.html/.test(langSwitch('faq.html')), 'the FAQ switches to the Spanish FAQ, not the Spanish homepage');
ok(page('es/faq.html').includes(langSwitch('es/faq.html')) && /<html lang="es"/.test(page('es/faq.html')), 'the Spanish FAQ switches back');

console.log('== the Spanish homepage ==');
const es = toSpanish(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
ok(es.missing.length === 0, `untranslated: ${es.missing.slice(0, 5).join(' | ')}`);
ok(/<html lang="es"/.test(es.html), 'lang="es"');
ok(es.html.includes('<link rel="canonical" href="https://www.example.com/es/" />'), 'canonical is itself');
ok(es.html.includes(hreflang('es/index.html')), 'hreflang both ways');
ok(es.html.includes('href="../css/site.css"') && es.html.includes('src="../js/load-builder.js"') && es.html.includes('url(../fonts/dm-sans.woff2)'), 'styles, scripts and fonts climb out of /es/');
ok(es.html.includes('href="../book/quote.html"'), 'the quote stays English, one level up');
ok(es.html.includes('href="#pricing"'), 'anchors stay on the page');
ok(/"label":"Sofá"/.test(es.html), 'the truck items are in Spanish');
ok(/"@type": "FAQPage"/.test(es.html) && /"@id": "https:\/\/www\.example\.com\/es\/#faq"/.test(es.html), 'the FAQ schema is the Spanish page\'s own');
const faqLd = es.html.match(/"name": "([^"]+)"/g) || [];
ok(faqLd.some((x) => /¿/.test(x)), 'the FAQ schema asks in Spanish');
ok(es.html.includes(langSwitch('es/index.html')), 'the switch goes back to English');

console.log('== the build stops on a phrase with no Spanish ==');
const idx = path.join(ROOT, 'index.html');
const orig = fs.readFileSync(idx, 'utf8');
try {
  fs.writeFileSync(idx, orig.replace('<p class="take-no">', '<p class="take-no">Brand new untranslated words here. '));
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-es.mjs'), '--check'], { encoding: 'utf8' });
  ok(run.status === 1 && run.stderr.includes('Brand new untranslated words here.'), `build-es --check should list the phrase: ${run.stderr.slice(0, 200)}`);
} finally { fs.writeFileSync(idx, orig); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
