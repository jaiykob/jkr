# Round 9: the full SEO pass and service pages (Portland)

Date: 2026-10-12. Branch: `feat/seo-pass`. Scored by
`npm run score -- --round 9`; done at 100, then merged (founder's standing
order, "do everything i got the docket"). CRM and KPIs are round 10, the
Sacramento metro round 11 (its service pages come with it).

## What the founder asked

- 2026-10-10: "full seo pass and service pages for portland metro and
  sacramento metro". Reordered 2026-10-11: the SEO pass first, Portland only
  at first.
- 2026-10-11: "check disney land customer service and seo practices and copy
  them just dont copy the magical langiage". The search half is in
  `docs/superpowers/research/2026-10-11-disneyland-practices.md`: menus that
  name tasks, a help center by topic, a "Before we come" page, questions in
  the customer's words, the place named in every title.
- Inputs: `docs/superpowers/research/2026-10-10-service-pages.md` (which
  services, the page template, the schema).

## Already true (not rebuilt)

Share cards and `twitter:card` on every indexable page; alt text on every
image; hreflang and canonicals (rounds 4 and 5); the FAQ grouped by topic
with call and text beside it (round 7); FAQPage and Service schema on the
towns.

## What this round builds

### 1. Eight Portland service pages

Garage cleanout, furniture removal, estate cleanout, hot tub removal
(priority 1); mattress removal, appliance removal, yard debris removal,
hoarder cleanout (priority 2). Not this round: construction debris,
commercial (the commercial form already exists), piano (a blog post first,
see 3), e-waste (free state programs; a line on the appliance page).

- **One plain text file per service**, like the towns:
  `content/services/portland/<slug>.md`, built by `npm run build` into a
  page. Fields: `name`, `title`, `description`, `lede`, `sizes` (the size
  keys a typical job of this kind fills, smallest first), `towns` (5 to 8
  town slugs, each with a one line reason), `posts` (related blog slugs),
  then `## What we take`, `## Where it goes`, `## Free options`,
  `## How the job goes`, `## FAQ` (3 to 5, questions in the customer's own
  words, the plain answer first).
- **Prices are generated, never typed**: "From $X plus travel" where X is the
  config price of the first listed size, and the listed sizes as cards
  linking `/book/quote.html?size=<key>`, red while the prices are guesses.
  The build stops on a size key the config does not have, a town slug with
  no town file, or a post slug with no post.
- **Own words, 400 or more per page**, and no 8+ word sentence shared with
  another service page or a town page (the towns' rule extends to services).
- **Anything we do not know yet is red** (`[[...]]`): which transfer station
  or donation partner a load goes to, what a hot tub needs before we come
  (power off by an electrician), what a hoarder job excludes (no biohazard
  cleaning), how many people come. The founder rewrites the copy later;
  this is the starting point.
- **Schema**: Service (provider the LocalBusiness, `areaServed` the listed
  towns as City, an AggregateOffer from the listed sizes plus the real
  travel fees), BreadcrumbList, FAQPage from the visible questions.
  `check-schema` proves each price is a load plus a real fee and each town is
  one we serve.
- **Linked from**: the hub, `service-areas.html` (a Services section), the homepage's "What
  we take" section (each kind of job links its page), the footer (a Services
  column), each listed town page (a "Jobs we do here" line), and related
  blog posts.
- **English only this round.** Spanish service pages follow the towns'
  `(es)` format in a later round; Spanish pages link the English service
  page meanwhile (as `build-es` already does for a page with no twin).

### Where the pages live (decided by the plan contest)

Two layouts compete in the plans, scored like every round:

- **Metro folders now**: `/portland/` hub (replacing `service-areas.html`),
  `/portland/<service>.html`, the 40 towns moved to `/portland/<town>.html`,
  Spanish under `/es/portland/`, a 301 from every old address. Round 11
  adds `/sacramento/` beside it (and settles Woodland WA against Woodland
  CA).
- **Portland at the root**: services at `/<service>.html`, the towns and
  `service-areas.html` where they are; round 11 puts Sacramento under
  `/sacramento/`.

Either way: the title and H1 name the service and "Portland"; the URL is
stable from launch on; nothing already built loses a check (a check that
reads an old address is walked to the new one, with a ruling, never
loosened).

**Result (`evolution.md`, round 9): Portland at the root, 89, over metro
folders now, 81; the child keeps the towns and `service-areas.html` where
they are and puts the eight new service pages in `/portland/`**
(`/portland/garage-cleanout.html`), so the address names the metro, nothing
already built moves, and round 11's `/sacramento/garage-cleanout.html` is
its sibling. `/portland` and `/portland/` 301 to `service-areas.html` until
round 11 decides on metro hubs. Every page below the homepage shows a
breadcrumb trail (Home › Portland metro › Garage cleanout) matching its
BreadcrumbList.

### 2. A "Before we come" page

`before-we-come.html` and its Spanish twin `es/before-we-come.html`: the
checklist for a booked job, in the order the customer meets it. Sections:
set it out (what to pull aside and how to show what goes), the path (doors,
stairs, the elevator), parking (where the truck stops, a permit if the
street needs one), pets and children, if you will not be home, what we
cannot take (links the post), on the day (the "on my way" text, the
arrival window, the walk through and the price before lifting). Plain
answers first, no prices typed.

- It **replaces the blog post `getting-ready-for-a-pickup`** (English and
  Spanish): the post's words move into the page, the post is removed, and
  its addresses 301 to the page (`vercel.json`). Two pages answering one
  question compete with each other in search.
- To keep the blog at 12 posts (round 5), a new post on **piano removal**
  (English and Spanish), the research's "a post first" service.
- **Linked from**: the thanks page, the confirmation email, the help page
  (its own topic), the footer's Book column, the header menu.
- Schema: BreadcrumbList; the page is HowTo shaped in the visible text only
  (Google retired HowTo rich results; no HowTo JSON-LD).

### 3. A help center: the FAQ page by topic

`faq.html` keeps its address and becomes the help center:

- H1 "How can we help?"; under it the **topics as buttons** (Getting a
  price, Before we come, On the day, What we take, Paying and changes,
  Where we go), each jumping to its group; the Before we come topic links
  the page.
- **Call, text, WhatsApp and email beside the topics** (under them on a
  phone), so help is one tap from the top of the page.
- Questions **in the customer's words** ("Do I have to be home?", "Can you
  take a fridge?"), each answer starting with the plain answer, then what
  to do next. At least three questions per topic.
- Title "Junk Removal Help and FAQ | Brand Name". FAQPage JSON-LD stays
  generated from the visible questions; `es/faq.html` kept in step.

### 4. Menus that name tasks

- **Header**: Services, Prices, Where we go, Before we come, Help; Text us
  and WhatsApp in the phone menu; the Get my price button. (Today: How it
  works, What we take, Pricing, Service areas, FAQ.) On a phone the menu
  keeps every item 48px tall.
- **Footer**: Book (Get my price, Send a photo, Before we come, Property
  managers), Services (the eight), Where we go (the hub and six towns),
  Help (Help and FAQ, Blog, Terms, Privacy).
- Built once in `index.html`, copied everywhere by `build-chrome`; the
  Spanish phrases added to `i18n/es.json`.

### 5. The technical audit

A new check script, `scripts/check-seo-audit.mjs` (run by `npm test`),
over every indexable page in English and Spanish:

- exactly one H1; a unique title of 65 characters or fewer that names the
  place (town and service pages name the town or "Portland", and the state
  where a town has a twin elsewhere); a unique description of 100 to 160
  characters naming the place;
- a self canonical, share card and `twitter:card` (already true; kept
  true);
- BreadcrumbList JSON-LD on every page below the homepage, matching a
  visible breadcrumb trail;
- every internal link resolves; no orphan: every sitemap page is reachable
  from the homepage in three clicks or fewer;
- every `<img>` carries width and height (or a CSS aspect ratio) and alt;
  no `loading="lazy"` on the first screen's main image.

And in headless Chrome at 360px (the scorecard, not `npm test`): layout
shift under 0.1 on the homepage, a town page, a service page and the help
page; no script in `<head>` without `defer` or `async` except the JSON-LD.

## Scorecard (round 9, 100 points)

| Check | Pts | What passes |
| --- | --- | --- |
| tests | 8 | `npm test` passes |
| earlier | 5 | rounds 1 to 8 each still score 100 |
| services | 15 | eight service pages generated from their files: H1 names the service and Portland, 400+ own words, price block from the config (red while guessed), 5+ town links that exist, related posts that exist, 3+ FAQs, size cards to `?size=` |
| unique | 8 | no 8+ word sentence shared between two service pages or a service and a town |
| schema | 10 | Service, BreadcrumbList and FAQPage parse and are true on every service page (`check-schema`); BreadcrumbList on every page below the homepage |
| before | 8 | the page and its Spanish twin with the seven sections; linked from thanks, the confirmation email, help, the header and footer; the old post gone with 301s; the piano post; the blog at 12 |
| help | 8 | "How can we help?", six topic buttons that jump, 3+ questions each, call, text, WhatsApp and email by the topics; Spanish in step |
| menus | 8 | the header's five task names and the Get my price button, the footer's four columns with the eight services, on every page (`build-chrome --check`) |
| audit | 15 | `check-seo-audit` passes; layout shift under 0.1; no blocking head script |
| mobile | 8 | 360px on a service page, the hub, Before we come and the help page (and its Spanish twin): no sideways scroll, text 16px+, taps 48px+; 1280px no sideways scroll |
| copy | 7 | service pages, Before we come, help and the piano post: no dashes as punctuation, slang, TODO, Disney words or typed prices; guesses red and in `GUESSES.md` |

## Not this round

Spanish service pages; Sacramento (round 11); a self serve "change or
cancel" page (the menu item waits for it); reviews (never invented; after
real Google reviews); measuring local search volumes (Keyword Planner, the
founder's account).
