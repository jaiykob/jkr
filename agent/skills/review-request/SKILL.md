---
name: review-request
description: The day after a job is marked done, ask the customer for a Google review once, unless the job had a problem. Drafts for the founder to approve by default (MODE=draft).
---

# Review request

Google reviews are the biggest growth lever a local hauler has. The best time
to ask is the day after the job, while the clean garage is still a fresh
feeling. This skill asks once, politely, and never asks someone who had a
problem.

**Read `../_shared/jkr-context.md` first** for channels, `MODE`, quiet hours
and the security model.

## Trigger

A daily sweep for `visits` with `status = 'done'` and `completed_at` between
20 and 48 hours ago.

## Stop first (skip the visit if any is true)

1. **Already asked:** this customer got a review request before (any visit).
   One ask per customer, ever.
2. **A problem on the job:** the visit has a note of a complaint, a damage
   report, a refund or a price dispute. Flag it for the founder instead.
3. **Opted out:** the customer unsubscribed or replied STOP.
4. **Monthly pickups:** ask after the second completed pickup, not the first.
5. **Travel zone sanity:** the customer's ZIP should still be inside a travel
   zone (`travelFor(zip)`); if the zones changed and it is now past the last
   zone, still ask (they were served), but note it for the founder.

## Guardrails

- Email only (every booking has one). `MODE=draft` by default; the founder
  approves each request until the ramp is done.
- Quiet hours: nothing before 8:00 or after 20:00 America/Los_Angeles; best
  sent around 10:00 the day after the job.
- Dedupe: stamp the customer `review_requested_at`; the "already asked" check
  reads it.
- Use the `reviewRequest` email template (`api/_lib/email-templates.js`) with
  the customer's first name and the Google review link (`GBP_REVIEW_URL`,
  GUESS* not set up yet).
- Never offer anything in exchange for a review; Google forbids it.

## Template

The `reviewRequest` email, with this one line added when the job had
photos: "The after photo from your job is in the email we sent when we
finished."

Subject: `How did we do?`

```
Hi {first_name}, thanks again for choosing us for your haul.

If you have 30 seconds, a short Google review helps other people nearby find
us more than anything else we could do: {review_link}

And if anything was less than right, reply here first. We would rather fix it.

Brand Name
```

## Output

Log `customer_id, visit_id, mode, sent|drafted|skipped, reason, timestamp`.

## Done means

Every happy customer is asked once, the day after their job; nobody with a
problem is asked; nobody is asked twice.
