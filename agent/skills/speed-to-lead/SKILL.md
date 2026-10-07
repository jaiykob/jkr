---
name: speed-to-lead
description: When a new quote lands in the leads table, reply within minutes with the customer's own load, travel zone and price, and a link back to book. Drafts for the founder to approve by default (MODE=draft).
---

# Speed to lead

How fast we answer a quote is the biggest lever on whether it books: the odds
drop sharply after the first few minutes. This skill closes that gap. It
spots a fresh quote, recaps it in plain words, and hands the customer one tap
back to booking.

**Read `../_shared/jkr-context.md` first** for the business, prices, travel
zones, the leads table, channels, `MODE` and the security model. Do not repeat
those facts here; point to them.

## Trigger

- A new row in `public.leads` with `service = 'junk'` and a `created_at` newer
  than the last one processed.
- Poll about every 60 seconds, or subscribe to inserts. Keep a watermark
  (`last_seen_created_at`, `last_seen_id`) so each lead is handled once.

## Guardrails (check in order; skip the lead if one fails)

1. **Already booked.** If the email or phone matches a row in `customers`, do
   not contact them; they booked.
2. **Travel zone.** Run `travelFor(zip)`. If it returns null, or `notes` starts
   with `FAR ZIP:`, the ZIP is past our last zone: do not pitch an online price.
   Flag it for the founder as a hand quote and stop.
3. **Channel.** Email when the lead has one (every full quote does). Phone
   only leads get an SMS draft; SMS never sends on its own until A2P 10DLC is
   approved.
4. **MODE.** Default `draft`: write the message and the send action, then stop
   for approval. `auto` only after the 2 week ramp (and for SMS, after A2P).
5. **Dedupe.** If this email or phone already had a first touch in the last
   24 hours, do not send another; add a note to that thread instead.
6. **Quiet hours.** Nothing before 8:00 or after 20:00 America/Los_Angeles.
   Queue it for the next window.

## Steps

1. Read the lead row. From `notes`, take the load (`Load: 1/2 truck`) and the
   zone and travel (`Zone 2, travel $25.00`). `quoted_price` is dollars and
   already includes travel.
2. Build the resume link from the shared context:
   `book/quote.html?load={load_idx}&freq={fi}&zip={zip}&edit=contact`, where
   `load_idx` is the row of the load size and `fi` is 0 for one-time, 1 for
   monthly. The quote page reprices it; nothing in the link is trusted.
3. Write the message (templates below), filling only facts from the row.
4. Emit per channel and `MODE`:
   - **Email:** subject and body from the template; `draft` queues
     `{lead_id, channel:'email', to, subject, body, link}` for approval;
     `auto` sends through Resend and logs it.
   - **SMS (phone only):** `draft` queues `{lead_id, channel:'sms', to, body,
     link, reason_if_blocked}`. Never auto send until A2P is approved.
5. Record `first_touch_at` for `quote-followup`, and advance the watermark.

## Templates

Email subject: `Your price for a {load} haul`

```
Hi {first_name},

Thanks for getting a price from us. Here is what you showed us:

{load}, {frequency}: {quoted_price}, with {zone} travel included.

Want to pick a day? This link brings back your quote: {link}

If there is more on the day than your photos or taps showed, we show you the
new price before we load anything. Questions? Reply here or call or text
(925) 408-6053.

Brand Name
```

SMS draft (phone only leads):

```
Hi {first_name}, this is Brand Name. Thanks for getting a price: {load},
{quoted_price} with travel included. Want to pick a day? {link}
Reply STOP to opt out.
```

- `{zone}` is the zone label from `notes` ("Zone 2"); in the home zone write
  "no travel charge" instead of "{zone} travel included".
- Never offer a discount that is not in the config. Never restate a monthly
  price as a yearly total.

## Output and logging

Append to the outbound log: `lead_id, channel, mode, sent|drafted|flagged,
reason, timestamp, link`. Advance the watermark only after a draft, send or
flag.

## Done means

Every fresh in area quote gets an approval ready draft (or, once on, a sent
message) within minutes, and every far ZIP lands on the founder's list
instead of getting a price we cannot honor.
