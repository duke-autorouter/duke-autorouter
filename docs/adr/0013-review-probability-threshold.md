# ADR 0013: Use verdict probability for automatic review

Status: implemented and checked in source. Recorded September 20, 2026.

## Context

Useful coding and document outputs received incomplete automatic reviews.
The review policy compared Jev's distribution confidence with `0.8`. Live replay
returned pass probability `0.80` with confidence `0.70`, and pass probability
`0.83` with confidence `0.75`. The API values were parsed correctly; the policy
applied its cutoff to a different measure from the verdict probability.

## Decision

Require at least `0.8` probability on the selected pass or fail answer. An unknown
answer or an answer below that threshold remains unverified. Keep deterministic
file, test, citation and evidence-coverage checks in place.

Save the complete distribution, confidence, selected answer, model version and
threshold. Version review and routing histories so outcomes judged under the old
rule do not mix with the corrected acceptance labels. Preserve old task receipts.

## Alternatives and evidence

Keeping the confidence cutoff would retain the observed false uncertainty.
Passing every selected answer would also accept nearly tied choices. Lowering
confidence until these examples pass would leave the intended measure unclear.

Four correct outputs passed and five deliberately incorrect outputs failed in a
bounded live check. Six automated boundary cases cover pass, fail and unknown
answers. This supports the correction; it does not calibrate Jev's probabilities
for every task. See the [investigation](../REVIEW_SCORING.md) and
[TypeSafe's confidence documentation](https://docs.typesafe.ai/confidence).
