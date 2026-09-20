# Automatic review scoring

The September 20 investigation reproduced an overly strict review cutoff.
Jev's answer probability and its distribution confidence arrived correctly from
the API. DUKE used confidence to decide whether a pass or fail verdict counted.
The corrected policy applies the cutoff to the verdict's own probability.

## What the replay showed

| Check | Pass probability | Distribution confidence | Old policy | Corrected policy |
| --- | --- | --- | --- | --- |
| Coding, support | 0.80 | 0.70 | Unverified | Passed |
| Documents, brief | 0.83 | 0.75 | Unverified | Passed |
| Documents, completion | 0.85 | 0.77 | Unverified | Passed |

These are fresh replay results, not recovered numbers from the original tasks.
The old records retained rounded confidence but discarded the full distribution.
Replay used the saved public or invented briefs and outputs, checked output hashes,
and reused the recorded test result. Project-structure context was reconstructed.
No worker reran these tasks, and no original task status was changed.

[TypeSafe describes confidence](https://docs.typesafe.ai/confidence) as a measure
of how concentrated a distribution is. It is distinct from the probability
assigned to a particular answer. Neither establishes a measured success rate for
DUKE without independent comparisons on representative work.

## Corrected behavior

Review policy `duke-review-v2` requires a probability of at least `0.8` on the
selected pass or fail answer. Unknown and uncertain answers stay unverified.
Each check now retains both measures, the complete distribution, the model
version and the threshold. Routing policy `duke-routing-v8` separates the resulting
acceptance labels from older efficiency history. Model and effort selection,
the assessment confidence rule and economical fallbacks are unchanged.

A subsequent live diagnostic set contained four correct outputs and five
deliberately incorrect outputs. All four correct outputs passed; all five
incorrect outputs failed. The incorrect examples changed a price, invented a
booking service, omitted required facts, changed opening hours or gave the wrong
inventory total. Expected labels were fixed before those calls.

The [receipt](evidence/review-scoring-verification.json) records the scores and
spending. Automated tests cover the threshold boundary, uncertain and unknown
answers, malformed replies, unavailable review, exhausted budget, failed tests,
missing citations and changed files. This is a bounded diagnostic check, not a
routing benchmark or a general accuracy claim.

## Separate coverage gaps

- The research task included a screenshot. Jev receives text, and the verifier
  cannot establish the screenshot's visual content. Its incomplete result also
  included uncertain content judgments. Changing the score rule cannot supply
  that missing evidence.
- The cancellation test's follow-up requested a plain text file, while its
  original expected result still described waiting for shell approval. The task
  was classified as coding, which also required a repeatable test command. That
  record remains incomplete; its file and cancellation behavior passed separate
  acceptance checks.
- The zero-budget test intentionally prevented a paid Jev review. Its incomplete
  content review is expected, even though the fallback produced the right file.

These checks retain their original statuses. They do not become positive learning
evidence through this scoring change.
