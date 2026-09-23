# ADR 0025: Conservative literal extraction before review

Status: Accepted for source development; not part of the installed 0.1.11 package.
Date: September 23, 2026.

## Context

The first fresh factory comparison reproduced two transformations that changed what Jev was asked to judge. Numbered list labels became standalone requirements, exhausting review slots. Ownership extraction retained status text in an item or captured a whole trailing sentence as the person. A source-supported ownership statement was falsely rejected in the same run; malformed extraction is a plausible contributor, not a proven sole cause.

## Decision

Keep a leading numeric list marker with its literal requirement. Preserve sentence boundaries elsewhere, quoted text, code, decimal/version strings, and the existing bounded review budget.

Extract an ownership pair only from a narrow recognizable assignment form. Remove supported presentation markup and explicit status separators; stop at a clear sentence boundary. Omit ambiguous, negated, proposed, unknown, multi-owner or cross-item pairs. Omitting a pair does not pass the claim: the complete passage remains available for ordinary factual and ownership judgment. Name syntax is deliberately conservative; unsupported names or formats fall back to the full passage.

Advance review policy v10 to v11 and focused-review policy v9 to v10 so earlier judgments do not become new-policy quality evidence. Keep routing policy v15, confidence thresholds, fallback selection, user ceilings, provenance rules, and recovery limits unchanged.

## Evidence and limits

Local regression tests cover the observed formats and fresh names, multiline numbering, version numbers, code/quotes, negation, multiple owners, unknown owners, and cross-item ambiguity. The frozen factory comparison remains pre-fix evidence and is not rerun selectively. Correct literal extraction does not establish improved live judgment accuracy; that needs fresh validation. Native preview reliability is a separate open issue.
