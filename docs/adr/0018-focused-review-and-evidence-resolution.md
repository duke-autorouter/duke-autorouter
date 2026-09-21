# 0018 — Check specific claims before retrying work

Date: 2026-09-21
Status: Accepted for 0.1.6

## Problem

Three broad Jev review questions did not reliably identify an unsupported owner
assignment. An incomplete review could not safely justify another worker attempt.
Lowering the threshold would also create unnecessary retries on correct work.

## Decision

Check literal requirements and output passages against source excerpts. Separate
person-to-item ownership from role titles and task status. Keep path/URL and offset
references. Do not use earlier output as supporting input. Review extraction is
bounded; coverage gaps remain visible.

Allow one evidence-resolution request for uncertain passages. Supply expanded
source windows, omit unrelated output and prior probabilities, and retain the
original verdicts in the event history. Keep the 0.80 threshold. Broad concerns
need a specific failed claim or requirement before recovery; missing evidence
cannot establish a broad quality failure.

Use the existing same-model repair controls after a confirmed failure. This
change does not add an expensive reviewer, change the user's worker selection,
raise effort limits or turn uncertain work into a pass. Both Jev calls count as
review usage and consume the existing API budget.

## Alternatives and tradeoffs

Repeating the same broad prompt preserves the same ambiguity. Lowering thresholds
risks false failures. A separate reviewer model might improve difficult cases,
but adds provider usage and another policy choice; it is not enabled here.
Deterministic passage and assignment parsing avoids generated source facts but
has limited coverage. Correct work can still remain unverified.

## Evidence

The [development report](../FOCUSED_REVIEW_VALIDATION_20260921.md) retains all eight
runs, including false alarms during calibration. The final run detected ten
planted defects with no false failures among nine correct examples; two correct
examples remained unverified. The actual saved owner error crossed the unchanged
threshold in one final recheck. The correct PDF still had incomplete checks.
These results justify further unseen testing, not a general accuracy claim.
