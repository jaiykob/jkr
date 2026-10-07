---
name: lead-research-briefing
description: A short morning briefing for the founder only, on yesterday's quotes, bookings, far ZIP requests and which towns and travel zones they came from. Never contacts a customer. The first skill to run during the two week ramp.
---

# Lead research briefing

The low stakes skill that runs first. It reads the last day of quotes and
bookings and writes the founder a one screen summary: who is waiting for an
answer, what is working, and what needs a person. It never contacts a
customer, so it needs no `MODE`; everything it writes is a draft for the
founder alone.

**Read `../_shared/jkr-context.md` first** for the leads table, prices,
travel zones and the security model.

## Trigger

Once a day, ready by 7:30 America/Los_Angeles (inside quiet hours rules,
because it only goes to the founder).

## What it reads

- `leads` created in the last 24 hours.
- `customers` and `subscriptions` created in the last 24 hours (the bookings).
- `visits` scheduled for today and tomorrow.
- The follow-up log (what `speed-to-lead` and `quote-followup` drafted).

## Rules

- **Dedupe:** each lead appears once, in the first briefing after it arrived.
  A lead already processed in an earlier briefing only comes back if it
  booked or replied.
- **Already booked** leads move to the bookings section, not the waiting list.
- **Travel zones:** group quotes by zone using the zone in `notes` (or
  `travelFor(zip)`). Leads past the last zone (`FAR ZIP:` in `notes`) get
  their own section: each is a hand quote the founder owes someone.
- Never invent a number; if a table is empty, say so.

## The briefing

```
Good morning. Yesterday: {quotes} quotes, {bookings} bookings ({revenue}).

Waiting for you:
  {far_zip_count} asked for a price past our zones: {zips}
  {replies} customers replied to a follow-up

Quotes by travel zone:
  Home zone {n} · Zone 2 {n} · Zone 3 {n} · Zone 4 {n}
  Towns: {top_towns}

Today and tomorrow: {jobs_today} jobs today, {jobs_tomorrow} tomorrow.

Drafts waiting for approval: {drafts} (speed to lead {a}, follow-up {b}, reviews {c}).
```

## Output

One message to the founder (email or the ops Discord channel). Log the date
and counts.

## Done means

The founder starts each day knowing who is waiting, which zones and towns
are producing quotes, and what needs a person, in under a minute of reading.
