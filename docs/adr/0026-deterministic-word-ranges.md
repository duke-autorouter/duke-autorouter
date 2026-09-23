# ADR 0026: Deterministic checks for explicit word ranges

Status: Accepted for 0.1.12.
Date: September 23, 2026.

## Context

Factory cycle 3 produced a factually correct status file below its requested word range. Jev left the review unverified, so no repair began. A mechanical count can establish this particular defect without relying on a model's probability judgment.

## Decision

Before semantic review, verify an explicit document-level word range in the user's task prompt or expected result when there is exactly one complete Markdown or text deliverable. Support direct writing instructions and leading expected-result ranges. Count letter/number groups, retaining internal apostrophes and hyphens, after removing Markdown formatting and link destinations. Headings count; standalone markup does not. This is a defined counting convention, not every editor's word count.

Do not extract limits from editable briefs, output files, quoted examples, conditional or approximate wording, section-specific instructions, conflicting ranges, or follow-ups. Multiple outputs, partial evidence and HTML/entity-bearing text remain with existing review. Unsupported phrasing may therefore miss deterministic coverage; it must not create a false failure. No setup toggle is required.

Add a normal failed check when the supported range is missed. Existing recovery judgment still decides whether a bounded same-effort repair is appropriate. Do not force retries, loosen confidence thresholds, increase effort, or change economical fallback. Bump review policy to v12 so earlier outcomes do not count as evidence under this policy.

## Evidence and limits

Regression tests preserve the original cycle-3 short output and exercise short, within-range and long text; direct prompt and expected-result syntax; examples and negation; ambiguous targets; follow-ups; partial files; and unsupported HTML. Tests through the real verifier establish a failed check, not live recovery success. Broad semantic review and requirement-provenance work remain open.
