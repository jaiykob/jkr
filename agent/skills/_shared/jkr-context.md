# jkr: shared context for the follow-up helpers

The one place every helper reads the facts it needs: who we are, where we
work, what things cost, what a lead row holds, and the rules for reaching
out. Skills point here instead of repeating it. The price, zone and area
blocks are written by `npm run build` from `pricing.config.mjs` and
`content/towns/`; never type a price into a skill.

## Business

- **Name:** Brand Name (GUESS* the business has no name yet; "Brand Name" everywhere until it does)
- **What we do:** junk removal and hauling: furniture, appliances, mattresses, yard debris, cleanouts. We do all the lifting.
- **Phone:** (925) 408-6053 (call or text)
- **Email:** GUESS* hello@example.com (no business email yet)
- **Site:** `https://www.example.com` (GUESS* no domain yet)
- **Base:** Gresham, Oregon. The truck starts there every day.
- **Stage:** not live. The three booking gates are closed; the order page reserves a day without a card.

### Service area

<!-- BUILD:docs-area -->
We serve 135 ZIP codes and 40 towns (31 in Oregon, 9 in Clark County, Washington), out to 40 road miles from our base in Gresham. Every town has its own page (`content/towns/`); the hub is `service-areas.html`.
<!-- /BUILD:docs-area -->

Any ZIP inside a travel zone books online. Check a ZIP with `travelFor(zip)`
from `api/_lib/travel.js` (Node) or `js/travel.js`: it returns the zone, fee,
miles and place, or `null` when the ZIP is past our last zone. **A lead from a
ZIP past the last zone gets no online price:** flag it for the founder to
quote by hand.

## Pricing

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

- **The price a customer sees is load price + their zone's travel fee**, paid
  when they book. The online order is one time hauls only; regular pickups
  go through the commercial form or a call.
- **A different size on the day:** if the load is bigger or smaller than the
  size booked, we show the new load size and price before loading. Bigger:
  we charge the difference with the customer's agreement. Smaller: we refund
  the difference. They can also remove items, or say no. Never promise a
  price will not change if the job turns out bigger.
- Never quote a full truck plus more online. It is quoted by hand.
- `leads.quoted_price` is **dollars** (the pages divide cents by 100). Multiply by 100 for cents.

### Links to hand a lead

- Get or rebuild a price: `https://www.example.com/book/quote.html`
- Resume an order with the size and ZIP filled in:
  `https://www.example.com/book/quote.html?size={load_idx}&zip={zip}`
  - `load_idx`: 0 single item, 1 quarter, 2 half, 3 three quarter, 4 full truck (row order of the price table above).
  - The order page reprices from the config and the ZIP, travel included; nothing in the link is trusted.

## Data: Supabase

Project: GUESS* not created yet (`YOUR-PROJECT.supabase.co` in the code).

**`public.leads`**: one row per quote, written by the quote page the moment
the price is shown (`js/leads.js`), and by the "send me a price" box for far
ZIPs.

| Column | What it holds |
| --- | --- |
| `id` | uuid |
| `service` | `junk` (or `referral` from the thanks page) |
| `first_name`, `last_name` | the customer's name |
| `email` | always present on a full quote (required on the quote page) |
| `phone` | 10 digits, as typed |
| `zip` | the job's ZIP |
| `address` | the street address, when given |
| `frequency` | `One-time haul` or `Monthly pickup` |
| `quoted_price` | dollars, load plus travel |
| `notes` | `Load: 1/2 truck \| Zone 2, travel $25.00, 16.8 mi \| Address: ... \| Items: ...`, or `FAR ZIP: past our travel zones, wants a price for 98601` |
| `source_url`, `user_agent`, `utm` | where the lead came from |
| `created_at` | when |

A lead that books becomes a row in `customers` and `subscriptions` (by
email), with `travel_zone`, `travel_cents` and `travel_miles`. **Before any
follow-up, check `customers` for the email or phone: if they booked, do not
follow up.**

## Channels and the SMS gate (read before any outreach)

- **Email is the main channel.** It is not gated and sends through Resend.
  Use it for any lead with an email, which is every full quote.
- **SMS waits for A2P 10DLC approval.** Until then, any text a helper writes
  is a **draft for the founder to send by hand**, and only for a lead with a
  phone but no email.
- Channel per lead: **has email → email; else → SMS draft.**
- All outreach is about the customer's own quote or job, honors opt out
  (STOP), and follows the `MODE` setting below.
- **Facebook groups, Nextdoor and Google: never auto post and never auto DM.**
  Doing it risks a ban. Helpers draft; a person posts.

## Agent security model (enforced by the runtime, assumed by every skill)

- Runs on an isolated machine, services bound to localhost, token auth on any endpoint.
- The Stripe key is restricted to read and invoicing: the agent can read
  customers and invoices, never create a charge.
- Supabase access for helpers is read only on `leads`, `customers` and
  `subscriptions`, plus writing its own follow-up log.
- Every community skill is read before it is installed.
- **Ramp:** for the first 2 weeks only `lead-research-briefing` runs.
  Customer facing skills stay in `MODE: draft` until the founder flips them.

## MODE

Every customer facing skill has a `MODE`:

- `draft` (default): write the message and the exact send action, then stop
  and surface it for the founder to approve. Nothing is sent.
- `auto`: send directly. Only after the 2 week ramp, and for SMS only after
  A2P 10DLC approval.

## Quiet hours

No outreach before 8:00 or after 20:00 America/Los_Angeles. Queue for the
next window.

## How we write

- "we / us / our" for the business; plain, warm, short. No slang, no emoji
  stuffing, **no dashes as punctuation**.
- Name the customer's own load, zone and price. Never invent a discount.
- Every first text says who we are and ends with "Reply STOP to opt out."
- How we treat customers on and off the job, and how a complaint is answered
  (listen, understand, sorry, fix, why): `docs/service-standard.md`. The
  `complaint-reply` helper drafts those answers.
