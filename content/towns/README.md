# Town pages

Every town we serve has one file here, and each file becomes a page on the
site: `lake-oswego.md` becomes `lake-oswego.html`. To change what a town page
says, change its file and run `npm run build`. Never edit the `.html` page
itself; the build writes it, and `npm test` fails if someone did.

The rest of each town page (the truck, prices, how it works, the zone list)
comes from the homepage, so a change there reaches every town on the next
build.

## The format

```
name: Lake Oswego
state: OR
zips: 97034, 97035
lede: One or two sentences under the big headline.
areas: Lake Grove, First Addition, Westlake, Mountain Park

## Local
A paragraph about hauling in this town.

Another paragraph. Leave a blank line between paragraphs.

## FAQ
Q: A question people in this town ask?
A: The answer.

Q: Another question?
A: Another answer.
```

- **name, state** (OR or WA), **zips** (every ZIP code the town uses, comma
  separated), **lede** and **areas** (neighborhoods or landmarks, comma
  separated) are one line each.
- Every ZIP must be in a travel zone (`pricing.config.mjs`), or the build
  stops and names the file.
- The page adds two questions of its own, answered from the zone table: the
  travel charge, and which ZIP codes we cover. Don't repeat them.
- Write each town's copy fresh. `npm test` fails if two towns share a
  sentence: town pages that say the same thing look like spam to Google.

## Guesses

Wrap anything we have not checked in double brackets: `[[Metro South in
Oregon City]]`. It prints red with an asterisk on the page and shows up in
`GUESSES.md` until someone checks it and takes the brackets off.

## Adding or removing a town

Add a file, run `npm run build`, and the page, the hub (`service-areas.html`)
and the homepage zone list all pick it up. Delete a file and the build
removes its page.
