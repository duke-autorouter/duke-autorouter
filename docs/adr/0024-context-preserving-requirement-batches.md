# ADR 0024: Preserve requirement context across bounded review batches

Status: Accepted for 0.1.11. Date: September 23, 2026.

The 0.1.10 adversarial review showed that sentence splitting happened before quote protection, dependent prohibitions could become bare noun questions, and the eight-requirement cap made ordinary briefs incomplete.

Use one literal scan before splitting. Protect straight and curly quotations, code, brackets and common abbreviations. Conservatively retain shared prohibitions rather than generate rewritten requirements. Supply the complete bounded request with every question. The scanner is a heuristic, not a complete natural-language parser; merging ambiguous clauses is preferable to changing their meaning.

Review up to 24 requirements in batches of eight. Broad and passage questions remain in the first request. Preserve completed verdicts if a later batch fails, mark unreviewed requirements incomplete, and stop further resolution after a batch outage. The caller's total deadline and spending limits still apply. More than 24 clauses or truncated context remain incomplete. Keep the 0.80 verdict threshold and recovery limits.

Alternatives include a larger single request, generated requirement extraction, or keeping the original eight-clause cap. Batching avoids one larger compound request and generated rewriting, at the cost of additional bounded requests and possible deadline exhaustion. The old cap did not provide enough coverage for ordinary structured briefs.

Also provide the full difficulty distribution to model selection without weakening explicit model difficulty ceilings or changing the uncalibrated ordinal threshold. A complex tail can still create a premium-only shortlist; that remains a calibration question, not a resolved efficiency claim.

See the [follow-up evidence](../OPUS_FOLLOWUP_20260923.md). Revisit parsing and limits using new conditional, quoted, code-heavy and multi-domain briefs, preserving both false-acceptance and false-rejection evidence.
