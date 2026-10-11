# The order flow: no truck, booked and paid in about 10 taps

Date: 2026-10-10. Status: the founder said "enact all changes" after the
research summary in chat; this file records what was agreed. Built as round 6
(`npm run score -- --round 6`), the same way as rounds 1 to 5.

## What the founder asked for

> "i very much dislike the booking flow with the truck"
> "remove the truck mechanism very unrealistic"
> "way too many clicks should be about 10 clicks to book"
> "its gonna be a combo of whatsapp booking form and order flow, and phone number"
> "b is better, but figuring out the online ordering flow is paramount"
> "copy the best websites the ones with the best design"
> "enact all changes"

This round is the online order flow. It also does the money half of Part 3
of the plan (the on site adjustment): the customer pays the quoted price at
booking and the card is saved, so after the job a bigger load is charged the
difference (with the customer's agreement) and a smaller one is refunded the
difference, without a second conversation about cards.

> **Changed 2026-10-10 (founder):** "payments have to be accepted at time of
> bookings so i can pay hauler". The first version of this spec charged the
> card once after the job; that is replaced throughout by payment at booking
> plus a settled difference after the job.

## Decisions (founder, 2026-10-10)

| Question | Answer |
| --- | --- |
| The truck load builder | **Removed everywhere**: homepage hero, quote step 1, town pages, Spanish pages. |
| Ways to book | **Three**: the online order flow, WhatsApp, the phone (call or text). |
| WhatsApp | **An automatic booking bot** (WhatsApp Business API), but **later, its own project**. This round adds a WhatsApp button that opens a chat with the details filled in. |
| How the price is set | **Pick a size from photo cards** (single item, 1/4, 1/2, 3/4, full truck), each with its price. Unsure customers send photos. |
| When the card is charged | **At booking, the quoted total** (option B; founder 2026-10-10: "payments have to be accepted at time of bookings so i can pay hauler"). The card is saved; after the job a bigger size is charged the difference with the customer's agreement and a smaller size is refunded the difference. Replaces the earlier "charged once after the job". |
| Timing | **A day plus a 2 hour arrival window**, with a text before the crew arrives (the norm at every competitor studied). |
| Monthly pickup | **Out of the online flow.** A small "Need regular pickups?" link to the commercial form. |
| Tap budget | **About 10**: about 8 with Apple Pay or Google Pay, about 10 by card with autofill. |

## What the research found (2026-10-10, four agents)

- Nobody in the Portland metro shows a real instant price for a full service
  haul, and nobody shows travel by ZIP. That is the gap this flow fills.
- Only LoadUp charges before the job, and its one star reviews are about
  refunds, cancel fees and surprise charges. The franchises take no card.
  Lugg and Dumpsters.com take a card at booking and charge after.
- 2 hour windows and a text 15 to 30 minutes ahead are standard.
- Every company keeps the right to change the price on site. None writes
  down the rule. We will.
- Baymard: fewer fields beats fewer steps; show the total from the start;
  vertical cards, not carousels; explain why the phone number is needed;
  wallets above the card form; the amount on the button.
- Market prices (published, Portland): 1/2 truck $400 to $460, full truck
  $699 to $860. Our guesses are lower for the bigger loads. Not changed in
  this round; it goes to the pricing review with the 22 to 24 mile radius.

## The customer's path

**Homepage (and every town page, English and Spanish).** The hero keeps its
headline and drops the truck. Under it, the five size cards, each a link to
the order page with that size picked. Below the cards, "Not sure? Send us a
photo" and the call, text and WhatsApp buttons. The ZIP check stays.

**The order page (`/book/quote.html`, the same address, so every existing link
works).** One page, sections open in turn, English only (as today):

1. **Size.** Five full width cards stacked: photo, name, what fits, price.
   Until the ZIP is known the price reads "$349 + travel". Tapping a card picks
   it. "Not sure? Send photos" opens the existing photo quote; the count it
   returns picks the smallest size that holds it (the `ITEMS` units and each
   load's `fits`, as now) and the page says "From your photos: 1/2 truck.
   Change it if that looks wrong." Claude still only counts.
2. **ZIP.** Filled from `quoteZip` when we have it. The travel line appears.
   Outside every zone: the existing "we'll email you a price" lead.
3. **Day and window.** Chips for the next open days with real dates
   ("Tue Oct 14"), then window buttons for that day. Full ones show greyed and
   say "Full". How many days ahead, the earliest day, the windows and the caps
   are in `pricing.config.mjs` (all guesses, red). Caps are counted **per
   market**: the founder is adding the Sacramento metro as a second service
   area with its own base and crew (2026-10-10, round 8), so the travel lookup
   returns the ZIP's market (`portland` only, until round 8) and a full
   Portland window never blocks a Sacramento one.
4. **You.** Name (one box), phone ("we text you when the crew is on the
   way"), email, street, unit (optional). City comes from the ZIP. Correct
   `autocomplete` values, so a phone fills all of them in one tap. "Anything
   we should know?" is a link that opens a notes box (stairs, gate code).
5. **Pay.** Apple Pay or Google Pay on top, the card form under it (Stripe
   Express Checkout Element and Payment Element). One checkbox: "I agree to
   the terms, and to this card being charged or refunded the difference if
   the crew finds a different size." Above the box, the rule in plain words:
   > You pay $374.00 now. If your load is bigger or smaller than a 1/2 truck,
   > the crew shows you the new price before loading: we charge or refund the
   > difference on this card, and you can say no. Free to cancel or move
   > until 24 hours before, with a full refund.
   (Wording is a starting point for the founder; the 24 hours, the late fee
   and the refusal fee are guesses, red.)

**A bar fixed to the bottom of the screen** from the first tap: the total
(load plus travel, travel as its own line once known), call and WhatsApp
buttons, and the Book button with the amount on it. The bar never sits over
a field being typed in.

**Mobile and desktop** (founder, 2026-10-10: "mobile and desktop"). Phones
first, and desktop is designed on purpose, not a stretched phone:

- **Phone (under 900px)**: one column, cards stacked, the bar fixed to the
  bottom as above.
- **Desktop (900px and wider)**: two columns. The sections on the left (about
  640px wide); on the right a summary card that stays in view as the page
  scrolls (size, travel line, total, day and window once picked, the Book
  button, call and WhatsApp). No bottom bar. The size cards sit two or three
  to a row with their photos larger. On the homepage the five cards sit in
  one row under the headline.
- Both are checked: a real 360px phone and a 1280px desktop.

**After booking:** `book/thanks.html` as now, showing the size, the total, the
day and window, "paid today; any difference settled after the job", and what
happens next. The old
`book/checkout.html` becomes a redirect to `/book/quote.html`.

**Bookings closed (the gates, as today).** The page works end to end, and the
Book button saves a reservation lead with the size, ZIP, day and window and
contact (no card), as `reserveSpot()` does now.

## The money

- **At booking** the server recomputes the price from `PRICES` (one time
  column) plus travel, refuses a stale quote, a full window, an address outside
  the area, and creates a Stripe customer and a **PaymentIntent for the quoted
  total** with `setup_future_usage: 'off_session'` (the card is saved for the
  difference). The page confirms it. The quoted size, price, travel, date,
  window and the consent (time, wording version) ride in metadata.
- **The webhook** (`payment_intent.succeeded` whose own `metadata.kind` is
  `booking`) writes the customer and the visit (date, window, quoted size and
  price, `payment_status: 'paid'`, the saved payment method), sends the
  confirmation email (with what was paid), the Discord ping and the owner
  email. Fail soft on the database, as today.
- **After the job** the dashboard's Finish step asks for the final size,
  defaulting to the booked one. The server prices the final size plus the
  same travel from `PRICES` (never from the page) and settles the difference
  against what was paid: **bigger** needs the "customer agreed to the new
  price" box and charges the difference to the saved card off session;
  **smaller** refunds the difference (a partial refund of the booking
  payment); **the same** settles nothing. The receipt shows paid, adjusted
  and final.
- **A declined difference charge**: the visit is marked "payment needed",
  Discord and the owner email say so, and the customer gets a Stripe hosted
  invoice link for the difference.
- **The customer says no on site**: the booking payment is refunded, less the
  refusal fee (a guess, red; $0 today, so a full refund).
- **Cancels**: before the cancel window (24 hours, a guess) a full refund;
  inside it, the late fee is kept and the rest refunded. Both are dashboard
  actions.
- **Founding offer**: still off; when on, it comes off the booking payment.

## The dashboard (`/jkr/`)

The job card shows the booked size, the quoted total, the day and the
window. New actions: **On my way** (opens a text to the customer on the
owner's phone, filled in: "On our way, about 20 minutes"), **Finish**
(final size, the difference to charge or refund, agreement box when bigger,
after photos), **Cancel and refund** (full refund before the cancel window,
less the late fee inside it), and **Customer said no** (refund less the
refusal fee). No SMS provider in this round.

## Contact buttons

Call (`tel:`), text (`sms:`) and WhatsApp (`https://wa.me/<number>` with a
message filled in: the size and ZIP if picked). The WhatsApp number is the
phone number until the founder says otherwise (a guess, red). They appear in
the header, the bottom bar and under the homepage size cards.

## What goes away

`js/load-builder.js` and its styles, the truck on every page, the item
counters, the one time or monthly switch, the quarterly prepay in the online
flow, `book/checkout.html` as a page, and the weekday picker. The Spanish
phrases for the truck leave `i18n/es.json`. Old round checks that measured
the truck are generalised to measure the size cards (not loosened), as
round 5 did for its own changes.

## Still left out (each its own project later)

- The CRM and the KPI dashboard (asked for 2026-10-10): round 7, right after
  this one, because they read the data this round creates (final charges,
  windows, sizes changed on site). Spec:
  `docs/superpowers/specs/2026-10-10-crm-kpis-design.md`.
- The Sacramento metro (founder, 2026-10-10: a real second service area):
  round 8, its own spec. Base downtown Sacramento until the founder names the
  yard; zones and prices start as Portland's, all guesses, red. Its own town
  pages, ZIP miles from its own base, its own crew capacity.
- The full SEO pass and service pages for both metros, phone and desktop:
  round 9, after Sacramento, so the service pages cover both from the start.
- The WhatsApp booking bot.
- "Redo all systems with the plugins": a design pass, an SEO pass, a code
  review pass, one at a time.
- Real prices, the 22 to 24 mile radius, the zone fees (the pricing review).
- Automatic texts (an SMS provider) and address autocomplete.
- Real photos for the size cards (placeholders until the founder takes them).

## Testing and the scorecard

`npm test` keeps passing, with the booking test rewritten for the
PaymentIntent at booking and the after job difference (charge or refund)
against the fake Stripe. Round 6 checks,
with points adding to 100, include at least:

- No truck: no page or script references the load builder.
- The order page at a real 360px: cards stacked, the bar visible with the
  total, no sideways scroll, text 16px+, taps 48px+.
- The order page and homepage at 1280px: two columns, the summary card in
  view after scrolling, no bottom bar, no sideways scroll.
- A scripted booking in headless Chrome against a fake API counts the taps:
  10 or fewer by card with autofill, on the phone and on desktop.
- Server: a PaymentIntent for the quoted total with the card saved at
  booking; stale quote, full window and outside the area refused before any
  Stripe object; the difference priced on the server from the final size; a
  bigger size refused without agreement; a smaller size refunded.
- Webhook writes the visit (paid) with date and window; a failed difference
  charge marks "payment needed" and alerts.
- Dashboard actions behind the admin token.
- Guesses red and listed; generated pages current; rounds 1 to 5 still 100.

## Risks

- **Stripe consent for later charges**: the checkbox, the wording and a
  stored record are what Stripe asks for. The founder should read the wording
  before launch.
- **Unpaid differences**: a card can fail when the difference is charged
  after the job. The invoice link and the alert are the fallback; the booking
  payment is already in hand.
- **Refund costs**: Stripe keeps its fee on the refunded part of a smaller
  load or a cancel (told to the founder in chat).
- **Upfront payment and complaints**: the research found LoadUp's one star
  reviews come from upfront charges with unclear refunds; the written rule,
  the full refund before 24 hours and the refund of any smaller difference
  are the answer.
- **Big change, many files**: built in small tasks on `feat/order-flow`, each
  scored, merged only at 100.
