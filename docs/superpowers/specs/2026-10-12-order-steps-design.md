# Round 8: the order page one step per page, with a progress bar

Date: 2026-10-12. Branch: `feat/order-steps`. Scored by
`npm run score -- --round 8`; done at 100, then merged (founder's standing
order). The SEO pass moves to round 9, CRM and KPIs to 10, Sacramento to 11.

## What the founder asked

- 2026-10-12: "the booking flow clicks should each have there own page with
  progress batrd a ttoo", then "minmize clicks at all costs".
- Picked, from two mockups: **4 pages, 5 taps** (Size, Where, When, then one
  page with the details and payment) over 5 pages and 6 taps.

## The flow

```
[1 Size] -> [2 Where] -> [3 When] -> [4 Book: your details + pay]
```

- **One step per page.** Only the current step shows. Each has its own
  address (`#size`, `#where`, `#when`, `#book` on `/book/quote.html`), so the
  phone's Back button goes to the step before and the browser history reads
  like pages. Nothing reloads and nothing typed is lost (one page underneath,
  the one order record it already keeps).
- **A progress bar at the top**, sticky: four named steps (Size, Where,
  When, Book), the done ones ticked and tappable to go back, the current one
  marked (`aria-current="step"`), a filled bar under them and "Step N of 4".
  A Back button sits at its left from step 2 on.
- **No Next or Continue button anywhere.** A step moves on by itself the
  moment it is complete:
  - Size: tapping a card (or the photo quote picking one).
  - Where: the fifth digit of a ZIP we serve. The When page then says where
    and what travel adds ("Gresham, OR 97030. No travel charge.") with a
    Change link. A ZIP past the zones stays on Where with the email a price
    panel, as now.
  - When: tapping an arrival time. The soonest open day is already picked,
    so most people tap one time and nothing else.
  - Book: Book (or Reserve while the gates are closed) finishes it.
- **Steps already answered are skipped.** A homepage size card (`?size=`)
  skips Size; a ZIP typed anywhere on the site (`quoteZip`) skips Where. A
  link to a step that is not reachable yet opens the first step still to do.
- **Taps, homepage card to booked**: card 1, ZIP typed 0, time 1, autofill
  1, agree box 1, Book 1: **5** (round 6 measured about 8). Wallet (Apple or
  Google Pay): card, time, box, wallet: **4**. Gates closed: card, time,
  autofill, Reserve: **4**.
- **The total stays in view** the whole way: the bar at the bottom on a
  phone, the summary card on the right on a desktop. The Book button shows
  only on the Book page (on earlier pages it would only send people back).
- **When something is missing or refused** (a window just filled, the price
  changed, the ZIP is outside the area), the page goes to that step and says
  why, as the one page flow did.
- Each page gets its own tab title ("When should we come? | Book a junk
  pickup"), and the focus moves to the page's heading for screen readers.

## What does not change

Prices, travel, the API, the pay step's rule and consent box, the photo
quote, the reservation path, the far ZIP lead, the double charge guard, the
thanks page, every word on the sections themselves (the step headings stay
the section headings). The order page stays English.

## How it is checked (`npm run score -- --round 8`)

| Check | Points | Passes when |
| --- | --- | --- |
| tests | 10 | `npm test` passes |
| earlier | 5 | rounds 1 to 7 each still score 100 |
| one-step | 12 | at 360 and 1280px only the current step's sections show; each step has its hash; the progress bar is at the top of the screen on every step (sticky), names four steps, marks the current one and says "Step N of 4" |
| advance | 15 | a size tap goes to Where; the fifth ZIP digit goes to When (which names the place); an arrival time tap goes to Book; no Next or Continue button on the page |
| skip | 8 | `?size=` and a known ZIP open on When; `?size=` alone on Where; nothing on Size; a hash for an unreachable step opens the first step to do |
| back | 8 | the browser Back goes to the step before with the ZIP and size kept; a done step in the progress bar goes back to it |
| taps | 15 | scripted bookings from a homepage card against the real API: card 5 taps or fewer at 360 and 1280, wallet 4 or fewer, gates closed 4 or fewer; one create-booking call each |
| refusal | 7 | a window that fills at Book takes the page to When with the message; a stale price stays on Book with the new total |
| mobile | 10 | each step at 360px: no sideways scroll, text 16px+, taps 48px+; the progress bar 48px taps |
| desktop | 5 | at 1280px the steps on the left and the summary on the right, the summary in view on every step |
| a11y | 5 | the current step's heading takes the focus on a step change; the progress list has `aria-current="step"`; each step's title is in the tab |

Total 100. Round 6's checks that measured the one page (cards stacked on
the size section, the contact fields after a window tap, the day chip
before the window) walk to the step they measure; round 6's ten tap budget
stays as it was (round 8's is the stricter one).

## Out of scope

Separate HTML files per step (the hash pages give the same experience
without reloads and without losing the card form between pages), the
WhatsApp bot, any change to prices, windows or the API.

## Risks

- **Stripe's card form** mounts once and must survive moving between pages:
  it lives on the Book page and is only hidden, never removed.
- **Round 1 and 6 checks** were written against one page: each is walked to
  its step; none is loosened.
- **A wrong but valid ZIP** auto-advances: the When page names the place
  with a Change link, one tap back.
