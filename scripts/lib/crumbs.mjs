/**
 * The breadcrumb trail: the visible one and its BreadcrumbList, written from
 * the same list so the two cannot disagree (round 9; the scorecard and the
 * SEO audit compare them name by name and address by address).
 *
 *   crumbs([HUB.en, { name: 'Garage cleanout' }], { rel: 'portland/garage-cleanout.html' })
 *   → { html: '<nav class="crumbs" aria-label="Breadcrumb"><ol>…</ol></nav>', ld: { '@type': 'BreadcrumbList', … } }
 *
 * `trail` runs from the top down, each step `{ name, href }` with href a path
 * from the site root (service-areas.html, blog/index.html); the last step is
 * the page itself and has no href. Home (Inicio in Spanish) is put in front
 * unless the trail already starts there. `rel` is the page's own path from
 * the root: it makes the links relative and the last item's URL the page's
 * canonical. Names are plain text (escaped here). The › between steps is
 * hidden from screen readers; the list already says it is a trail.
 * Addresses are absolute on site.SITE_URL (absUrl in ./twins.mjs). `ld`
 * has no @context: it goes in a page's @graph (or add the context to print
 * it in a block of its own).
 *
 * Used by scripts/build-services.mjs, and by the other generators and
 * scripts/build-chrome.mjs for every page below the homepage.
 */
import { absUrl, relHref } from './twins.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const HOME = { en: { name: 'Home', href: 'index.html' }, es: { name: 'Inicio', href: 'es/index.html' } };
const LABEL = { en: 'Breadcrumb', es: 'Ruta' };

/** The metro hub, the middle step of a service page's trail. */
export const HUB = {
  en: { name: 'Portland metro', href: 'service-areas.html' },
  es: { name: 'Área de Portland', href: 'es/service-areas.html' },
};

export function crumbs(trail, { rel, lang = 'en' }) {
  if (!rel) throw new Error('crumbs: rel (the page\'s path from the root) is required');
  const home = HOME[lang];
  if (!home) throw new Error(`crumbs: no words for lang "${lang}"`);
  const steps = trail[0] && trail[0].href === home.href ? [...trail] : [home, ...trail];
  const last = steps.length - 1;
  if (steps[last].href) throw new Error(`crumbs: the last step ("${steps[last].name}") is the page itself and has no href`);
  const sep = '<span class="crumbs-sep" aria-hidden="true">›</span>';
  const items = steps.map((s, i) => (i === last
    ? `<li aria-current="page">${esc(s.name)}</li>`
    : `<li><a href="${relHref(rel, s.href)}">${esc(s.name)}</a>${sep}</li>`));
  return {
    html: `<nav class="crumbs" aria-label="${LABEL[lang]}"><ol>${items.join('')}</ol></nav>`,
    ld: {
      '@type': 'BreadcrumbList',
      '@id': `${absUrl(rel)}#breadcrumb`,
      itemListElement: steps.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: s.name,
        item: absUrl(i === last ? rel : s.href),
      })),
    },
  };
}
