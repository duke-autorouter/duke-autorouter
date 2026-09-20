# Live acceptance tasks

Use a dedicated project with only invented or public information, after accounts
are connected and provider permissions are selected. Initial live runs and
rechecks were performed during the September 2026 release pass. They exposed
defects as well as successful results; see the [verification record](VERIFICATION.md).
Installed-package rechecks are recorded in the
[installed-app receipt](evidence/installed-acceptance.json). OpenRouter live
completion remains unverified.

## Coding

Create `slugify.cjs` exporting a function that converts a title to a lowercase URL
slug, trims and collapses separators, preserves numbers, removes punctuation,
normalizes accented Latin letters, and returns an empty string for empty input.
Create `slugify.test.cjs` using Node’s built-in test runner. Cover repeated spaces,
punctuation, accents, numbers and empty input. Run `node --test slugify.test.cjs`,
inspect failures, and fix the code if necessary. Explain what passed.

Verification command: `node --test slugify.test.cjs`.

## Research

Using official Node.js and MDN documentation, explain how JavaScript can cancel a
fetch request after a timeout. Retrieve both primary sources, show a short
example, identify one compatibility consideration, and save a concise report to
`artifacts/fetch-timeouts.md` with direct links. Do not claim the example ran
unless you actually ran it.

## Writing

Write a one-page getting-started note for a fictional neighborhood tool library.
Facts: open Saturday 9am–1pm; members borrow up to two tools for seven days; annual
membership is $20; return tools clean; damaged tools should be reported to the
volunteer desk; no online booking exists. Use a welcoming, plain voice. Include
a first-visit checklist. Add no invented services, guarantees or contact details.
Save `artifacts/tool-library.md` and read it back.

## Documents

Create a report titled “Neighborhood Tool Library — Sample Inventory” as Word and
PDF, and a matching Excel workbook. Use this invented table: Hammer, 8 available;
Drill, 4 available; Sander, 3 available. Show a total of 15, label the data as a
sample, and include a short explanation. Save under `artifacts/`. Inspect the
produced files using available tools. Do not claim visual checks you could not do.

Human review: open/render all three outputs, check counts and layout, and rate
the result. Repeat a bounded task on any adapter not exercised by automatic
selection before calling all connected adapters validated.
