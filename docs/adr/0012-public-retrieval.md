# ADR 0012: Use a bounded search interface and inspect original sources

Status: implemented; live Codex check passed. Recorded September 20, 2026.

## Context

Research needs useful discovery and source reading on a fresh installation.
Search-result HTML returned JavaScript redirects, challenge pages or irrelevant
results during acceptance. HTTP success did not establish usable research input.

## Decision

Use Tavily's keyless search endpoint, as implemented by its official client.
Send the query without a provider API key. Bound time, response size and result
count. Report empty results and service limits; never switch to paid search
without an explicit configuration change.

Treat search results as discovery. Read the original public sources and retain
their URLs, text and coverage limits for verification. Support bounded text-based
PDFs through the bundled Mac helper. Scanned or partly unreadable PDFs cannot be
presented as completely read.

## Alternatives and consequences

Scraping search pages needs ongoing repairs and can mistake a challenge for
results. A required paid search account adds first-use setup and spending.
Direct URLs remain useful when supplied, but do not cover ordinary discovery.

Keyless search adds an external service dependency and shares the query with
that service. Availability and limits can change. The UI must report failures,
and the README and security notes must identify the destination. There is no
claim of unlimited or offline search.

## Evidence and review

A packaged Luna Low run found MDN, read the original page, read a public PDF,
opened the source in the browser and viewed its screenshot. Failure, empty-result,
URL and size handling also have local tests. A successful retrieval does not
prove every statement in a resulting report; source checks and content review
remain separate.

Revisit this choice if service limits interfere with routine use. An optional
user-supplied search provider could be added with explicit costs and data handling.

- [Official Tavily client](https://github.com/tavily-ai/tavily-python/blob/master/tavily/tavily.py)
- [Tool audit](../TOOL_AUDIT.md)
