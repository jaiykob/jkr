# Round 7: the landing page (LoadUp layout) and the service standard (Disneyland)

Date: 2026-10-11. Branch: `feat/landing-page`. Scored by
`npm run score -- --round 7`; done at 100, then merged and pushed (founder's
standing order, 2026-10-10).

## What the founder asked

- 2026-10-11: "just use loadup as inspo i really like hero and ladning page"
  (with the truck and the game gone, done in round 6).
- 2026-10-11: "check disney land customer service and seo practices and copy
  them just dont copy the magical langiage tailor tone and taste to junk
  removal". Research: `docs/superpowers/research/2026-10-11-disneyland-practices.md`.

## What I took from that (rulings, made on the founder's behalf)

- **R1. LoadUp's layout and order, never its words, logo, pictures or
  colors.** Our charcoal, hi-vis yellow, cream, Bricolage Grotesque and DM
  Sans stay. LoadUp's lime becomes our yellow, its teal becomes charcoal or
  cream. Every sentence is ours.
- **R2. The hero goes light**, like LoadUp's: cream page, charcoal header
  above it. The second headline line keeps its yellow as a highlighter band
  behind charcoal text (yellow text on cream fails contrast).
- **R3. The hero's picture is ours, drawn in code**: a pile of the colored
  blocks the site already uses for "what we take", with a price ticket on it
  that is a real link (the half truck, its price from the config, red while
  guessed). No truck in it (founder disliked the moving truck). It is
  decoration plus one link; screen readers hear only the link.
- **R4. One set of size cards on the page.** The five cards leave the hero for
  a dark band right under it (LoadUp's "services" band), in one row on a
  desktop and stacked on a phone, so every price reads at a glance. The
  separate "Pricing" tiers section goes (it repeated the same five prices);
  its travel note and "more than a full truck" line move under the cards. The
  band keeps `id="pricing"` so the menu link still lands on prices.
- **R5. No reviews block.** LoadUp's stars and review counts are proof we do
  not have yet; we never invent any. The block comes when there are real
  Google reviews (noted for the walkthrough).
- **R6. "Where we go" gets a map drawn from our data**: one dot per ZIP we
  serve, at its real place, colored by its travel zone, Gresham marked. Built
  by `build-pricing` like the zone list, so it can never disagree with the
  config. LoadUp's state map becomes our metro map.
- **R7. Promises, not adjectives.** LoadUp's "why us" cards become four
  promises, each one already true in the system: the price first (and a
  bigger load only with the customer's yes), a text when we are on the way,
  we do all the lifting, we leave it clean with a before and after photo.
  Disney's order of keys (safe, kind, tidy, on time) decides what we promise
  and in what order the crew acts on it.
- **R8. The service standard is a short document plus one helper**, not new
  software: `docs/service-standard.md` (for the founder and any crew) and a
  draft only `agent/skills/complaint-reply` helper that writes a reply in the
  HEARD order. The emails already end the job the Disney way (photos, thank
  you, "reply and we will make it right"), so they do not change.
- **R9. Disney's search practices go to the next round** (the SEO pass,
  renumbered round 8), except the footer, which this round rebuilds anyway:
  it gets task named columns.
- **R10. Rounds renumbered in the order they are built**: 7 this landing
  page, 8 the SEO pass and service pages, 9 CRM and KPIs, 10 Sacramento.
- **R11. Copy stays the founder's to write.** Existing headlines and lines
  are kept and moved, not rewritten; new lines are few, plain, and follow the
  copy rules (we/us/our, no dashes, no slang). Each new phrase gets its
  Spanish (tú) in `i18n/es.json`.

## The page, top to bottom

Town pages and the Spanish homepage are copies of this page (`build-towns`,
`build-es`), so they change with it. The `CITY:` regions stay where they are.

1. **Header**: unchanged (charcoal bar, menu, phone, text, WhatsApp, the
   yellow "Get my price").
2. **Hero** (cream). Left: a pill eyebrow with a small icon ("Junk removal
   across the Portland metro"), the headline ("Pick your size." then "See your
   price." on a yellow band), the line under it, then one big yellow button
   "Get my price" with a charcoal offset shadow and an arrow, and beside it a
   check mark and "Price before you book". A thin rule, then a pill with the
   phone ("Call or text (925) 408-6053"). The founding offer line stays where
   it was (hidden while the offer is off). Right: the block pile and its price
   ticket. Phone: one column, the copy first, the pile under the button,
   smaller.
3. **Ticker**: the yellow strip of item names stays (our "as featured on").
4. **How it works** (white): pill eyebrow, centered title, a line under it,
   three numbered circles joined by a line: across on a desktop, down on a
   phone. Same three steps.
5. **Sizes and prices** (charcoal, `id="pricing"`): pill eyebrow, title on the
   left and the "one flat price" line on the right, a tag line "Starting at
   $99.00 for a single item" (generated, red while guessed), the five photo
   cards in one row (stacked on a phone), then "Not sure? Send us a photo",
   the travel note, "More than a full truck?", and the call, text and
   WhatsApp chips.
6. **What we take** (cream): the eight kinds of junk as cards with a dark icon
   square (simple line icons), four across on a desktop, two on a phone; the
   "we can't take" line.
7. **Promises** (white): pill eyebrow, a title with a yellow highlighted
   phrase, and the four promise cards beside it.
8. **Price band** (yellow, LoadUp's colored band): small caps eyebrow, title,
   one line, a charcoal "Get my price" button, "or text (925) 408-6053".
9. **Where we go** (cream, `id="area"`): the metro map and its zone legend on
   the left; on the right the pill eyebrow, "Do we come to you?", the line,
   town chips (the biggest towns, each its page, plus "All service areas"),
   then the ZIP box with a "Check" button with the offset shadow. Under both,
   the zone list (`#zoneList`, one row per zone, as now).
10. **FAQ** (light grey): pill eyebrow, centered title and a line, questions
    as white cards with a round chevron. Same questions.
11. **Closer** (charcoal): big title "Ready when your junk is.", a line, two
    buttons: yellow "Get my price" and an outlined phone button.
12. **Footer** (charcoal, shared by every page through `build-chrome`):
    columns "Book" (Get my price, Send a photo, Property managers), "Where we
    go" (Service areas and the six biggest towns), "Help" (FAQ, Blog, Terms,
    Privacy), and a column with the name, one line about us, call and text.
    The copyright line under it.

Motion: hover lifts and the ticker only; all off under
`prefers-reduced-motion`. Nothing drives across the screen.

## The service standard (`docs/service-standard.md`)

Plain, one page, for the founder and any crew:

1. **Our four priorities, in order**: safe, kind, tidy, on time. An earlier
   one wins (never rush a lift to keep a window).
2. **Before the job**: the confirmation and reminder go out by themselves;
   the "On my way" text gives a time we will beat; when unsure, the later
   time.
3. **At the door**: greet by name, walk the items together, confirm the size
   and the price before lifting (the rule on the order page).
4. **On the property**: what the customer sees is tidy: the truck, the crew,
   the driveway. No smoking, music or phone calls there. Park legally.
5. **Answer the question behind the question**, with two examples.
6. **Small extras**: if it fits in the size they booked, take it without
   making them ask twice.
7. **The end is what people remember**: walk through, sweep, the after
   photo, thank them.
8. **When something goes wrong**: listen to all of it, say we understand,
   say sorry for the trouble, fix it now (the crew may give back up to a red
   guess of $25 on the spot), then write down why so it does not happen
   again. The complaint helper drafts the written reply.
9. **Spanish**: every page has Spanish; answer in the customer's language
   when we can.

## The complaint helper (`agent/skills/complaint-reply/SKILL.md`)

Same rules as the other four helpers (round 3): draft only, never sends,
quiet hours, the copy rules, reads `_shared/jkr-context.md`. Input: what the
customer wrote and the job. Output: a reply in the HEARD order, one fix
offered (within the on the spot limit, anything more goes to the founder), and
a one line "why it happened" note for the founder. It never argues and never
promises a refund the founder has not approved.

## How it is checked (`npm run score -- --round 7`)

| Check | Points | Passes when |
| --- | --- | --- |
| tests | 10 | `npm test` passes |
| earlier | 5 | rounds 1 to 6 each still score 100 |
| order | 8 | the homepage sections come in the order above (by id), and the old tiers section is gone |
| hero | 12 | 1280px: copy and picture side by side, the headline and the one big button in the first screen, the check line beside the button; 360px: headline and button in the first screen with the bookings banner up; the price ticket links to the order page with a size and shows the config price, red while guessed |
| contrast | 6 | headline, highlighted line, buttons, band text and pill text at 4.5:1 or better (3:1 for text 24px and up), measured in Chrome |
| steps | 6 | three numbered steps joined by a line, side by side at 1280px, stacked at 360px |
| sizes | 10 | the five cards in a charcoal band with `id="pricing"`, one row at 1280px, stacked at 360px; the "Starting at" line is the smallest config price; travel note, photo link and contact chips under them |
| map | 8 | one dot per ZIP in the travel zones, each the color of its zone, the base marked, a legend with every zone and its fee from the config; `build-towns --check` covers it |
| promises | 5 | four promise cards with icons; no "say no", no star rating or review count anywhere on the site |
| footer | 6 | footer columns with Get my price, Send a photo, Property managers, Service areas, six town links, FAQ, Blog, Terms, Privacy, call and text; on every page through `build-chrome --check` |
| mobile | 8 | homepage, a town page and the Spanish homepage at 360px: no sideways scroll, text 16px or more, taps 48px or more; same pages at 1280px: no sideways scroll |
| service | 10 | the service standard has its nine parts with the four priorities in order and the HEARD steps; the complaint helper is draft only with quiet hours and the copy rules; the research note lists its sources |
| copy | 6 | the new homepage text, the standard and the helper follow the copy rules (no dashes, slang, Disney words: magic, magical, guest, cast member, onstage, backstage) |

Total 100.

## Out of scope

Reviews, the WhatsApp bot, real photos (placeholders until the founder adds
them), the FAQ rewording and the "Before we come" page (round 8), any change
to the order page, prices or zones.

## Risks

- **Town and Spanish pages change with the homepage.** The build rewrites
  them and `npm test` checks they are current; the round 2 and 5 scorecards
  measure them too.
- **Round 6 checks measured the old hero** (cards in the hero, contact chips
  right under the cards). They are about the cards, not where they sit: the
  cards keep their classes, links and order, and the chips stay under them.
- **The map adds weight**: about 160 small circles in an inline SVG, under
  10 KB. No library.
