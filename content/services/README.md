# Service pages

Every job we do has one plain text file per metro, and each file becomes a
page on the site: `portland/garage-cleanout.md` becomes
`portland/garage-cleanout.html`. To change what a service page says, change
its file and run `npm run build`. Never edit the `.html` page itself; the
build writes it (`scripts/build-services.mjs`), and `npm test` fails if
someone did.

`portland/ORDER` lists the services in priority order, one slug per line
(lines starting with `#` are notes). A slug with no file yet is skipped; a
file that is not listed stops the build. The order is the order the menus,
the footer and the hub list them in.

## The format

```
name: Garage cleanout
h1: Garage cleanouts across the Portland metro
description: One sentence for search results, 100 to 160 characters, naming Portland, no price.
lede: One or two sentences under the headline.
sizes: half, three, full
towns:
- gresham: Why this job comes up in Gresham, one line, true of the town.
- portland: ...
posts: garage-cleanout-in-a-weekend, where-hauled-junk-goes

## What we take
Paragraphs, or lines starting "- " for a list (one line per item).

## Where it goes
...

## Free options
...

## How the job goes
...

## FAQ
Q: A question in the customer's own words?
A: The plain answer first, then what to do next.
```

- **name** is the service ("Garage cleanout"); the page title is
  "<name> in Portland, OR | <brand>". **h1** must name the service and
  Portland. No `[[guesses]]` in name, h1 or description: they print where
  red cannot show (the tab, search results).
- **sizes** are size keys from `pricing.config.mjs` (single, quarter, half,
  three, full), smallest first: the sizes a typical job of this kind fills.
  The page shows "From $X plus travel" (the first size's price) and a card
  for each, all from the config, red while the prices are guesses.
- **towns**: 5 to 8 town slugs (each must have `content/towns/<slug>.md`),
  each with a one line reason that is true of that town (read its file).
- **posts**: related blog posts, by slug (`content/blog/en/<slug>.md`).
- The four sections and the FAQ (3 to 5 questions) are required, each under
  its own heading, once. Any other `## ` heading stops the build (its text
  would never print).
- Each field is one line. A line in the top part that is not a field, or a
  town line that is not under `towns:`, stops the build; blank lines between
  the town lines are fine.
- **The four sections are written like a blog post**: `**bold**`, and links
  written from the site root, such as `[send a photo](/book/quote.html#photos)`
  or `[Gresham](/gresham.html)`, which the build points up out of the
  `portland/` folder. The lede, the town reasons and the FAQ answers are plain
  text: no links or bold there, only `[[guesses]]`.

## Rules the build and the tests hold you to

- **Never type a price.** A `$` before a digit stops the build: prices come
  from `pricing.config.mjs`.
- **Own words.** No sentence of 8 or more words may appear on another
  service page or in a town's local copy (`scripts/test-services.mjs`), and
  each page needs 400 or more words of its own across the four sections and
  the towns.
- `[[double brackets]]` print red with an asterisk: a guess. Use them for
  anything not yet known, such as which transfer station or donation partner
  a load goes to, or how many people come.
- Plain words, "we / us / our", no dashes as punctuation, no slang.
