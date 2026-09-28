# Junk removal: working notes for Claude

A skeleton built on 2026-09-27 from the Scoops Co. stack
(`C:\Users\chris\scoopco`): static pages + Vercel serverless API. **Not live,
no name, no domain yet.** Placeholders: "Brand Name", "example.com",
"(000) 000-0000", and every `TODO` (`grep -rn TODO`).

The founder is finishing a degree. Keep sessions focused and small.

## Layout

| Path | What it is |
| --- | --- |
| `pricing.config.mjs` | **The only price table.** Integer cents, per truck load, plus surcharges and the ZIP gate |
| `api/price.js` | Serves the table to the pages |
| `api/quote-request.js` | Takes a quote request, **recomputes the price on the server**, logs the lead |
| `index.html` | Homepage |
| `onboarding/quote.html` | Quote form (ZIP first, then load size, then contact) |
| `css/site.css`, `js/site.js`, `fonts/` | Design system copied from Scoops Co. |
| `scripts/check-meta.mjs` | `npm test`: title/description length, og match, no dashes, no duplicates |

## Rules carried over from Scoops Co.

- **Never commit directly to `main`** once this is deployed. Branch, then merge.
- **Money is integer cents**, printed with `toFixed(2)`. Never hand-type a
  price into a page: pages read `/api/price`.
- **The server is authoritative.** Never trust a price the browser sends.
- **No card is charged at quote time.** Junk jobs are confirmed on site, so
  payment comes after. Revisit if deposits are added.
- **Fail-soft on leads:** a database or email error must never lose a lead.
  Log the full lead if every channel fails.
- **Secrets:** `.gitignore` covers `.env*`, keys, `.vercel`. Never commit one.
- Mobile: running text at least 16px, tap targets at least 48×48 (`--tap`),
  no horizontal scroll at 360/390/430.

## Copy voice

A company: "we / us / our", never "I / me / my". Plain, genuine, correct
grammar, no slang. **No dashes as punctuation** (em or en). Questions a
customer asks stay in their voice ("Do I need to be home?").

## Known gaps (next steps, roughly in order)

1. Name, domain, phone, real prices, real service ZIPs.
2. Prices are fetched in the browser, so Google does not see them. Scoops Co.
   fixed this by generating them into the HTML at build time (`build-pricing`).
3. Lead delivery (database + Discord + email), then photo upload.
4. Header/footer generation, sitemap, city pages, blog, as at Scoops Co.
