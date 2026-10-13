---
name: complaint-reply
description: When a customer writes in unhappy (an email, a text, a review), draft a reply that listens, understands, says sorry, offers one fix and notes why it happened. Drafts only; the founder always sends (MODE=draft, never send).
---

# Complaint reply

Something went wrong on a job and the customer told us. The reply decides
whether they book again and what they tell their neighbors. This skill drafts
it in the order our service standard sets (`docs/service-standard.md`, part
8), so the founder starts from a calm, complete answer instead of a blank page.

**Read `../_shared/jkr-context.md` first** for channels, `MODE`, quiet hours
and the security model.

## Trigger

The founder points it at one message: an email reply, a text, a Google review,
or a note on a job in the dashboard. It never sweeps the inbox on its own.

## MODE: draft only

This helper **never sends**, whatever `MODE` the others run in. A complaint
reply can promise money, so the founder reads every one and sends it
themselves. A draft written in quiet hours (before 8:00 or after 20:00
America/Los_Angeles) is marked for the founder to send after 8:00, never at
night.

## Stop first

1. **Already answered:** the thread has a reply from us after the complaint.
   Show it to the founder instead of drafting a second one (dedupe).
2. **Threat or legal words** (lawyer, small claims, police, damage claim over
   the on the spot limit): no draft. Flag it for the founder at once.
3. **Not our customer:** no `customers` row and no job matches. Draft a short
   "can you tell us the address and day so we can look into it" note.

## Read the job first

From the job (`visits` and its `customers` row): the day and window, the size
booked and the final size, what was paid and refunded, the travel zone
(`travelFor(zip)`), the crew notes, the before and after photos. Quote facts
from the row, never from memory, and never guess an amount.

## The reply, in this order

1. **Listen**: say back what happened in their words, briefly, so they know
   we read all of it.
2. **Understand**: one line that we see why they are upset ("We would be
   frustrated too.").
3. **Sorry**: apologize for the trouble, plainly, even when the crew did
   nothing wrong. No "but".
4. **Fix**: offer one concrete fix. Within the on the spot limit in the
   standard, write it as an offer (part of the haul back to their card, a
   return trip for what we missed); the founder sending the draft is the
   approval. Above it, write "we will call you today about making this
   right" and flag it for the founder. Never argue about who was right.
5. **Why**: for the founder only, below the draft, one line on why it
   happened and what would stop it next time (for the weekly review). It is
   not part of the message.

## Template

Email subject: `About your {day} haul`

```
Hi {first_name},

Thank you for telling us. {what_happened_in_their_words}

We would be frustrated too, and we are sorry for the trouble.

{one_fix}

If anything else is not right, reply here or call or text (925) 408-6053
and we will sort it out.

Haulmighty
```

SMS draft:

```
Hi {first_name}, Haulmighty here. Thank you for telling us, and we are sorry
about {short_issue}. {one_fix} Reply STOP to opt out.
```

Public review reply (short, no amounts, no details of the job):

```
Thank you for telling us, {first_name}. We are sorry about {short_issue}.
We have reached out to make it right.
```

## How it writes

The house rules in the shared context: "we / us / our", plain and warm, no
slang, no dashes as punctuation. Never blame the customer, the crew or the
weather. Never mention a discount the customer did not ask about.

## Output

The draft, the channel, and the founder's note:
`job_id, issue, fix_offered, over_limit (yes/no), why_it_happened`.

## Done means

Every complaint gets a calm, complete draft in the standard's order within
the hour, the founder sends it, and the reason lands in the weekly review.
