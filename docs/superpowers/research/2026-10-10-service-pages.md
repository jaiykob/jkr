# Service pages research (round 9 input), 2026-10-10

From the SearchFit content strategist agent. Local search volumes were not
measured (judgment, check Keyword Planner per metro before writing).

**Pages, priority order:** P1 garage cleanout, furniture/couch, estate
cleanout, hot tub (both metros, 8 pages). P2 mattress, appliance, yard debris
(Portland), hoarder. P3 construction debris and commercial (Sacramento city
requires a franchised hauler for C&D: check first), piano (a post first).
No e-waste page (free state programs; a section on other pages).

**URLs:** one page per service per metro, towns moved under their metro:
`/portland/` hub (replaces `/service-areas.html`), `/portland/<service>.html`,
`/portland/<town>.html`, same under `/sacramento/`, Spanish under `/es/`.
No page per service per town (doorway / scaled content risk). Built from
`content/services/<metro>/<slug>.md` like towns; the shared sentence test
extends to them. Fixes a clash: Woodland WA vs Woodland CA.

**Sacramento towns** (road miles from the State Capitol, OSRM, re-measure
once the base is set): Sacramento 0 to 10, West Sacramento 2.2, Arden-Arcade
8.0, Carmichael 10.9, Rio Linda 11.9, North Highlands 12.4, Rancho Cordova
13.4, Davis 14.9, Antelope 15.1, Elk Grove 15.2, Citrus Heights 16.2, Fair
Oaks 17.9, Orangevale 18.4, Roseville 19.6, Woodland 19.9, Rocklin 22.8,
Folsom 23.0, Dixon 23.2, Granite Bay 24.8. Out (over 25): Loomis, Galt, El
Dorado Hills, Lincoln.

**Template:** fresh H1 and lede; generated price block ("from $X + travel",
size cards linking to `/book/quote.html?size=`); what we take by state; where
it goes locally (Metro Central/South, Clark County stations, North Area
Recovery Station, Kiefer, Yolo landfill; donation partners); the free options
stated honestly; how the job goes; 5 to 8 towns with reasons; real job photos;
3 to 5 metro FAQs; related posts. Schema: Service (provider = metro
LocalBusiness, areaServed towns, AggregateOffer checked by check-schema),
BreadcrumbList, FAQPage (Google dropped FAQ rich results 2026-05-07).

**Decisions needed first:** Sacramento base, zones and price table; the
Portland 22 to 24 mile trim; Sacramento franchise rules; a local phone number
per metro (the 925 number is East Bay); a Sacramento Google Business Profile.
