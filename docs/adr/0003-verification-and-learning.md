# ADR 0003: Keep verification evidence separate from model confidence

Status: implemented; document coverage repairs checked. Recorded September 20, 2026.

## Context

DUKE learns from completed work. Incorrect success labels would teach the router
to prefer configurations that produced incomplete or unusable output. A worker's
claim, a file's existence and a judge's confidence each answer different questions.

## Decision

Combine deterministic checks with Jev's review of bounded content and source
evidence. Retain passed, failed and unverified outcomes. Keep comparison trials
out of personal learning. Record usage from failed attempts and recovery.

Independent development review evaluates the final deliverable, including its
appearance and calculations where relevant. Jev cannot serve as the sole judge
of a benchmark intended to establish Jev's routing quality.

## Alternatives

Trusting the worker's final message is cheap but misses failed actions. Asking
users to grade every task adds work to routine use. Treating every uncertain
judge response as failure creates unnecessary retries. Treating uncertainty as
success contaminates future routing evidence.

## Consequences and evidence

An uncertain review can return useful work with incomplete checks. File parsing
does not establish layout quality; cached spreadsheet values do not prove
recalculation. Successful test execution does not establish test adequacy.

Live acceptance caught a citation checker that mistook example URLs for sources,
an unsupported policy in a writing draft, and document files with literal Markdown.
The failed examples stay in the record. Coverage must be explicit in the UI and
receipts, and unsupported checks cannot quietly become passes.

The current confidence thresholds are engineering choices, not calibrated
probabilities of useful work. Held-out comparisons and broader failure cases
are required before making quality or efficiency claims.
