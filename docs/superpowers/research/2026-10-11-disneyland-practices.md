# Disneyland practices for junk removal, 2026-10-11

Founder, 2026-10-11: "check disney land customer service and seo practices and
copy them just dont copy the magical language tailor tone and taste to junk
removal". What follows is what Disneyland does, what it becomes here in plain
junk removal words, and which round builds it. None of Disney's own words
("magic", "guests", "cast members", "show") go into our copy.

Sources are mostly former staff, trainers and fan sites; Disney does not
publish its training. Treat the details as the widely reported practice.

## Customer service

| Disneyland does | Here it becomes | Where |
| --- | --- | --- |
| **Four keys in order**: Safety, Courtesy, Show, Efficiency (a fifth, Inclusion, since 2020 or 2021). An earlier key wins a conflict. | Four priorities in order: **safe, kind, tidy, on time**. Never rush a lift to keep a window. Spanish on every page counts as the fifth. | `docs/service-standard.md` (round 7) |
| **Posted waits run long on purpose** (actual waits about two thirds to three quarters of the posted time); guests who wait less than promised end happier. | Quote what we can beat: the arrival window is a promise, the "on my way" text gives a time we will make, and when unsure we say the later time. Never a price that grows without the customer's yes (already the rule). | service standard; homepage promises (round 7) |
| **HEARD** when something goes wrong: Hear, Empathize, Apologize, Resolve, Diagnose. "Not our fault, still our problem." | Listen to the whole story, say we understand, say sorry for the trouble, fix it now (the crew can make a small fix on the spot), then find why so it does not happen again. | service standard; `agent/skills/complaint-reply` (round 7) |
| **"What time is the 3 o'clock parade?"**: answer the question behind the question. | "Do I need to be home?" really asks "can I book while I am at work?". FAQ answers start with the plain answer, then what to do next. | service standard (round 7); FAQ wording (round 8) |
| **Seven service guidelines**: eye contact and a smile, greet everyone, seek contact, fix it on the spot, open body language, keep the experience, thank everyone. | At the door: greet by name, walk the items together and confirm the size before lifting, thank them at the end. | service standard (round 7) |
| **Take 5**: staff may step aside to do a small kind thing nobody asked for. | If it fits in the size they booked, take it without making them ask twice; carry, sweep, break down a box. | service standard (round 7) |
| **Onstage and backstage**: what the customer sees is always tidy. | Truck tidy, no smoking, music or phone calls on the property, park legally, the driveway swept. | service standard (round 7) |
| **The end of the visit is what people remember** (peak end). | Final walk through, sweep, before and after photo, thank you. The "all done" email already sends the photos and "reply and we will make it right" (round 3). | service standard (round 7); email already built |

## Search (what disneyland.disney.go.com does, read 2026-10-11)

| Disneyland does | Here | Where |
| --- | --- | --- |
| Title names the place: "Disneyland Resort in Anaheim, California – Official Site"; the description names the city and state. | Titles and descriptions name the town and state on every town and service page (already true for towns). | round 8 audit |
| `hreflang` en-us, es-us, en-ca; canonical; `index, follow`; share image and `summary_large_image` on every page. | Already built (rounds 4 and 5). Add `twitter:card` where missing. | round 8 audit |
| Menus name tasks: "Buy Theme Park Tickets", "Change Theme Park Tickets", "Maps", "Directions", "See All Hours". | Menu and footer say what people came to do: "Get my price", "Send a photo", "Change or cancel" (once a self serve page exists), "Where we go". | footer (round 7); nav (round 8) |
| A Help Center: "How can we help you?", FAQ by topic (parks, hotels, dining, tickets), Email and Call beside it. Questions in the visitor's own words ("I'm driving to the Disneyland Resort. How do I get there?"), the answer first. | The FAQ page grouped by topic (price, booking, the day of the job, what we take, paying and refunds, where we go) with call, text and email beside it; questions as customers ask them. | round 8 |
| "Pre-Arrival Tips" and "Getting to the Disneyland Resort" pages. | A "Before we come" page: what to set out, parking, pets, what we cannot take. Good for search ("how to get ready for junk removal") and for the job. | round 8 |
| One page per hotel, park and service, linked from a hub. | One page per service per metro (already planned in `2026-10-10-service-pages.md`). | round 8 |
| Every image has alt text (0 of 140 missing on the homepage). | Keep it so: decorative images `alt=""`, photos described. | round 8 check |
| No JSON-LD on the homepage. | We already carry more (Service, FAQPage, BreadcrumbList); nothing to copy. | none |

## Not copied

The words ("magic", "guests", "cast", "onstage"), the character theming, and
fake scarcity. Posted waits that run long are copied only as "promise what we
can beat", never as a padded price.

## Sources

- Four keys: [disneyblog.com glossary](https://disneyblog.com/glossary/four-keys/),
  [mickeyblog.com, the five keys](https://mickeyblog.com/2024/09/24/the-five-keys-to-disneys-success/),
  [kennythepirate.com, Inclusion added](https://kennythepirate.com/2020/09/24/breaking-disney-announces-a-new-cast-member-key-inclusion)
- HEARD: [Service Recovery the Disney Way](https://wp.customerservicegroup.com/2025/05/15/service-recovery-the-disney-way/),
  [Parcel Perform](https://www.parcelperform.com/insights/customer-service-disney-tips)
- Posted waits: [Queen's University, Smith School](https://smith.queensu.ca/insight/articles/the_science_hiding_in_mickeys_pixie_dust),
  [Disney Tourist Blog](https://www.disneytouristblog.com/actual-versus-posted-wait-times-disney-world),
  [Queue-it](https://queue-it.com/blog/disney-queue-psychology/)
- The 3 o'clock parade: [Customer Contact Week](https://www.customercontactweekdigital.com/customer-experience/articles/what-time-is-the-3-o-clock-parade-disney-s-approa),
  [MousePlanet](https://mouseplanet.com/what-time-is-the-300-parade/642/)
- Seven guidelines: [MousePlanet, service basics](https://mouseplanet.com/disney-service-basics/657/),
  [Coyle Hospitality, 10 and 5](https://www.coylehospitality.com/hotels-resorts-inns/what-is-the-10-and-5-staff-rule/)
- Take 5: [MousePlanet](https://mouseplanet.com/magical-moments-take-5s/640/)
- Search: disneyland.disney.go.com home, `/faq/`, `/faq/parks/` and `/guest-services/`, read in headless Chrome 2026-10-11.
