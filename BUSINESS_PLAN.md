# Haulmighty: business plan

Junk removal for the Portland metro, based in Gresham. Written 2026-10-07 as
a starting point; the founder will change it. Prices, zones and the service
area below are written by `npm run build` from `pricing.config.mjs` and the
town files, so they are always the site's real numbers. Anything marked
GUESS* is a placeholder until the founder checks it (`GUESSES.md`).

## 1. Summary

- **What:** junk removal and hauling. Customers pick a load size (or send a
  photo and we pick it), see a flat price plus travel by zone, and pay when
  they book online.
  We do the lifting, loading, hauling and sweeping up.
- **Who:** households moving, downsizing, remodeling or clearing an estate;
  landlords and property managers turning units; small businesses.
- **Where:** the Portland metro on both sides of the Columbia, from a base in
  Gresham.
- **Why us:** the price before you book, from a photo, with no estimator
  visit and no "starting at" fine print. The same owner who built the
  booking system runs the truck.
- **Stage:** not live. The site, booking flow, dashboard, emails and alerts
  are built; bookings are closed until launch (`LAUNCH-DAY.md`).
- **Owner:** the founder of Scoops Co. GUESS* run as a sole proprietorship under a trade name, like Scoops Co.

## 2. Services

- **One-time haul:** the core product. A single item up to a full truck.
- **Monthly pickup:** a set load size every month, for landlords, property
  managers and businesses. A quarterly prepay saves 10%.
- **Photo quotes:** up to four photos; the AI counts the items and the page
  picks the load size; the customer can change it.
- **Pay at booking:** the customer pays the quoted total when booking, and
  the card is saved. If the load is bigger or smaller, the crew shows the new
  price before loading: we charge the difference (with the customer's
  agreement) or refund it after the job, and the customer can say no.
- **What we can't take:** paint, chemicals, fuel, asbestos, medical waste.

## 3. Pricing

<!-- BUILD:docs-prices -->
| Load size | One-time haul | Monthly pickup |
| --- | --- | --- |
| Single item (a couch, a mattress, an appliance) | $99.00 | $89.00 a visit |
| 1/4 truck (a few pieces or a room corner) | $199.00 | $179.00 a visit |
| 1/2 truck (a small room or a garage corner) | $349.00 | $319.00 a visit |
| 3/4 truck (a full room or a small garage) | $479.00 | $439.00 a visit |
| Full truck (a garage, basement or estate) | $599.00 | $549.00 a visit |

Travel for the customer's zone is added to every visit. More than a full truck is quoted by hand.
GUESS* These prices are placeholder guesses (`GUESS` in `pricing.config.mjs`).
<!-- /BUILD:docs-prices -->

### Travel zones

<!-- BUILD:docs-zones -->
| Zone | Road miles from the base | Travel per visit | Towns |
| --- | --- | --- | --- |
| Home zone | 0 to 10 | none | Gresham, Fairview, Portland, Troutdale, Wood Village, Boring, Damascus, Happy Valley, Clackamas |
| Zone 2 | 10 to 20 | $25.00 | Portland, Sandy, Corbett, Milwaukie, Gladstone, Vancouver, Oregon City, Estacada, West Linn |
| Zone 3 | 20 to 30 | $50.00 | Portland, Vancouver, Lake Oswego, Camas, Beaverton, Brush Prairie, Tigard, Canby, King City, Washougal, Aloha, Battle Ground, Welches, Tualatin, Ridgefield |
| Zone 4 | 30 to 40 | $75.00 | Beaverton, Wilsonville, Hillsboro, Sherwood, Molalla, Aurora, La Center, Scappoose, Woodland, Yacolt, Newberg |

Past 40 road miles: no online price; quoted by hand.
GUESS* The mile bands and fees are placeholder guesses (`GUESS` in `pricing.config.mjs`).
GUESS* The base point (Gresham city center) is a placeholder guess (`GUESS` in `pricing.config.mjs`).
<!-- /BUILD:docs-zones -->

How the price is built: the smallest load size that holds the items, plus
the travel fee for the customer's ZIP. The server recomputes every booking
and refuses one that does not match. Money is integer cents.

## 4. Service area

<!-- BUILD:docs-area -->
We serve 135 ZIP codes and 40 towns (31 in Oregon, 9 in Clark County, Washington), out to 40 road miles from our base in Gresham. Every town has its own page (`content/towns/`); the hub is `service-areas.html`.
<!-- /BUILD:docs-area -->

**Founder note (2026-10-07):** 30 miles may be too far for junk removal; a
max radius of 22 to 24 road miles, with every zone's fee covering its drive.
Decide before launch (`LAUNCH-DAY.md` step 0).

## 5. Market

- The Portland metro is about GUESS* 2.5 million people in roughly 1 million households across the Oregon and Washington sides.
- Junk removal demand follows moves, remodels, estate settlements and
  spring and fall cleanups. GUESS* Most households need a haul once every few years; landlords need one at most unit turnovers.
- Search demand: "junk removal Portland", "junk removal near me",
  "couch removal", "mattress disposal", "garage cleanout". The 40 town pages
  target each town by name.

## 6. Competition

| Competitor | What they do | Our angle |
| --- | --- | --- |
| National franchises (GUESS* 1-800-GOT-JUNK, College HUNKS, Junk King) | On site estimates, volume pricing, "starting at" prices online | A real price online, from a photo, before anyone visits |
| Dumpster rental | Cheap per yard, but you do the loading | We load; no dumpster on the driveway for a week |
| Local one truck haulers (Craigslist, Nextdoor, Facebook) | Low prices, call for a quote, uneven reliability | Online booking, card payment, confirmations, photos when done |
| Doing it yourself | Truck rental plus dump fees plus a lost Saturday | We take it in one visit; GUESS* transfer station fees alone are often $30 to $60 a trip |

## 7. Operations

- **A job:** the booking arrives (Discord ping, owner email, dashboard). The
  day before, a reminder email. On the day: On my way on the dashboard
  (a text from the owner's phone), look at the job, confirm the load size,
  load, sweep, photos, then Finish on the dashboard: it settles any
  difference and the customer gets the "all done" email with photos.
- **Where loads go:** donation first, then recycling (metal, electronics,
  cardboard, appliances), then the transfer station. GUESS* Metro Central (Portland) and Metro South (Oregon City) on the Oregon side; GUESS* Clark County transfer stations on the Washington side.
- **Truck:** GUESS* one box truck or dump trailer of about 15 cubic yards (the "full truck" size holds 100 of the photo count's units, about 0.15 cubic yards each).
- **Crew:** the founder, plus GUESS* one helper for heavy items.
- **Capacity:** GUESS* 3 to 4 jobs a day; each 2 hour window and each day is full at its cap in `SCHEDULE` (`pricing.config.mjs`).
- **Systems:** static site and Vercel functions, Stripe, Supabase,
  Resend, Discord, Anthropic (photo counts), the `/jkr/` dashboard.

## 8. Marketing

In priority order:

1. **Google Business Profile** (`marketing/gbp-optimization.md`): the
   biggest lever for local search. Photos of real loads, reviews after every job.
2. **Town pages and search** (40 pages, round 4 adds sitemap and schema).
3. **Facebook groups and Nextdoor** (`marketing/facebook-groups.md`,
   `marketing/ad-copy/facebook-group-posts.md`): helpful posts, drafted by
   the helpers, posted by a person.
4. **Door hangers and flyers** (`marketing/ad-copy/flyer-door-hanger.md`)
   near a job: neighbors see the truck.
5. **Landlords and property managers:** monthly pickups; the commercial
   form is at `book/commercial.html`.
6. **Follow-up helpers** (`agent/skills/`): every quote gets a reply within
   minutes and up to two reminders; every job gets a review request.

## 9. Money

What a job costs us to do, against the price in section 3 (every number
here is a guess until real jobs exist; the price itself is never typed here,
so it cannot go stale):

| Cost per job | Home zone | Zone 3 |
| --- | --- | --- |
| Disposal at the transfer station | GUESS* about $60 for half a truck | same |
| Fuel and truck wear | GUESS* about $25 | GUESS* about $45 (the travel fee covers the difference) |
| Helper for heavy items | GUESS* about $60 | GUESS* about $75 |
| Card fees | about 3% of the price | same |

- Fixed costs: GUESS* insurance about $150 a month, truck payment or rental, Vercel and Supabase free tiers to start, Resend free tier.
- Break even: GUESS* about 4 to 6 half truck jobs a month covers fixed costs.
- Zone fees exist to keep the far jobs as profitable as the near ones; the
  founder's radius note (section 4) is the other half of that.

## 10. Risks

| Risk | What we do about it |
| --- | --- |
| A job is bigger than the photos showed | We show the new price before loading; the customer decides (Part 3 makes it binding) |
| Long drives eat the margin | Zone fees; the founder's 22 to 24 mile radius note; group far jobs on set days |
| Washington rules (registration, tax, disposal) | Checked before taking a Clark County job (`LAUNCH-DAY.md`) |
| Prohibited items in a load | Listed on the site and in the terms; set aside on the day |
| Injury or damage on a job | GUESS* general liability insurance before launch; two people for heavy items |
| No reviews at launch | Review request after every job; photos of real work on the profile |
| Seasonality (slow winters) | Monthly pickups for landlords and businesses |

## 11. Milestones

- **Before launch:** the open decisions in `LAUNCH-DAY.md` step 0 (name,
  domain, base, zones, prices, Washington, insurance), then accounts and a
  test mode run through.
- **Month 1:** first 10 jobs; a review after each; real photos on the site.
- **Months 2 and 3:** set real prices from real jobs; turn on the follow-up
  helpers after their two week draft ramp.
- **Months 4 to 6:** a steady helper; monthly pickup accounts; decide on a
  second truck or not.
