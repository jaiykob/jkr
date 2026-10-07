# Ad copy

Pasteable copy for every place we advertise, one file per channel, because
the limits differ (characters, self promotion rules, tone). Carried over from
the founder's first business and rewritten for junk removal (2026-10-07).

| File | Channel |
| --- | --- |
| `facebook-group-posts.md` | Community and neighborhood group posts (see `../facebook-groups.md`) |
| `short-form.md` | Marketplace, Craigslist, Nextdoor, Google posts, one line bios |
| `flyer-door-hanger.md` | Print: door hangers, flyers, the truck magnet |
| `../gbp-optimization.md` | The Google Business Profile, field by field |

## The fact sheet

Every number here is written by `npm run build` from `pricing.config.mjs`
and the town files. **The ads themselves name no prices**, so a price change
never leaves a stale ad behind; they send people to the site, where the price
is always current.

### Prices

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

### Service area

<!-- BUILD:docs-area -->
We serve 135 ZIP codes and 40 towns (31 in Oregon, 9 in Clark County, Washington), out to 40 road miles from our base in Gresham. Every town has its own page (`content/towns/`); the hub is `service-areas.html`.
<!-- /BUILD:docs-area -->

- **Phone:** (925) 408-6053, call or text.
- **Site:** example.com (GUESS* no domain yet). The quote is at `/book/quote.html`.
- **Naming the area:** "the Portland metro" in titles and one liners; name the
  town when the post is in a town's own group. Clark County towns are "across
  the river", never "Portland".

## Claims you may make

- "See your price before you book" (true: photo or tap, price on screen).
- "Snap a photo and we count it for you" (true: photo quotes).
- "We do all the lifting" (true).
- "Travel is set by your ZIP, and it is in the price you see" (true).
- "If there is more than your photos showed, we show you the new price before we load anything" (true; the rule on the FAQ and terms pages).
- "Usable items go to donation" (true when a center takes them).

## Claims you may NOT make

- Any price in the ad itself (it goes stale; link to the site instead).
- "Licensed", "bonded", "insured", "eco friendly", "same day" or "available 24/7" until each one is real (GUESS* insurance is not bought yet).
- Anything about competitors by name.
- "Free estimates": we give a price, not an estimate, and there is nothing to schedule.

## Voice

The business is "we". Plain, warm, short. No slang, **no dashes as
punctuation** in anything pasteable, no emoji strings. Every piece ends with
how to get a price: the site or (925) 408-6053.
