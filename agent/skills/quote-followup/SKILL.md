---
name: quote-followup
description: Two gentle reminders for quotes that did not book, on day 2 and day 5 after the first reply, stopping the moment someone books or opts out. Drafts for the founder to approve by default (MODE=draft).
---

# Quote follow-up

Most people do not book the first time they see a price. Two light reminders
bring a real share of them back without being pushy. This skill runs that
sequence and knows when to stop.

**Read `../_shared/jkr-context.md` first** for prices, travel zones, the
leads table, channels, `MODE` and the security model.

## Trigger

A sweep a few times a day. For each lead with a `first_touch_at` (set by
`speed-to-lead`):

- **Day 2 reminder:** at least 48 hours after `first_touch_at`, not yet sent.
- **Day 5 reminder:** at least 120 hours after `first_touch_at`, not yet sent.

## Stop first (skip the lead entirely if any is true)

1. **Already booked:** the email or phone matches a row in `customers`. Mark it
   `converted` and stop.
2. **Opted out:** any STOP or unsubscribe from this contact. Mark it and stop.
3. **Past the last travel zone:** `travelFor(zip)` is null or `notes` starts
   with `FAR ZIP:`. These are hand quotes for the founder; never sequence them.
4. **In conversation:** the customer replied. Hand the thread to the founder
   and pause.
5. **Done:** both reminders sent. Mark `nurture_done` and stop.

## Guardrails

- Same channel as the first touch: email when there is one, else an SMS draft
  (SMS waits for A2P 10DLC). Default `MODE=draft`.
- **Two reminders at most, ever.** The first reply plus these two is three
  touches over about five days. Never invent a day 7.
- Quiet hours: nothing before 8:00 or after 20:00 America/Los_Angeles.
- Dedupe: stamp `reminder_day2_at` and `reminder_day5_at` so no step goes twice.
- Rebuild the resume link from the lead's own row; the quote page reprices it,
  so a price change since the quote shows up honestly.

## Templates

Day 2, a plain reminder. Email subject: `Your {load} price is still here`

```
Hi {first_name},

Your price for a {load} haul is still here whenever you are ready:
{quoted_price}, with {zone} travel included. Pick a day and we do all the
lifting: {link}

Questions? Reply here or call or text (925) 408-6053.

Brand Name
```

Day 5, the last note. Email subject: `One last note about your haul`

```
Hi {first_name},

This is our last note about your quote. We fill our days a few at a time, so
if you would like a day this week or next, this link brings your price back:
{link}

If your plans changed, no reply needed. Thanks for thinking of us.

Brand Name
```

SMS drafts (phone only leads):

```
Hi {first_name}, Brand Name here. Your {load} price ({quoted_price}, travel
included) is still here: {link} Reply STOP to opt out.
```

```
{first_name}, last note from Brand Name about your haul. Happy to hold a day
for you: {link} Reply STOP to opt out.
```

- Only say days are filling up when they are. Never invent a deadline.
- In the home zone, write "no travel charge" instead of "{zone} travel included".

## Output

Log `lead_id, step, channel, mode, sent|drafted|skipped, reason, timestamp`.

## Done means

Every unbooked, in area quote gets at most two respectful reminders, and the
sequence stops the minute they book, reply or opt out.
