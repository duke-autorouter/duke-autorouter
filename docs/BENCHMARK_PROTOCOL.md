# Development benchmark protocol

The objective is useful work at the required quality with minimal necessary
resources, for subscription and API users alike. Jev remains the assessor,
automatic selector and content reviewer. Reducing its small per-task overhead
is not a development priority.

`npm run eval` validates fixtures locally. `--run` submits real tasks to your
connected providers and consumes usage; run it only after explicitly deciding to
send the fixtures and use the configured budget. No results here establish
model quality, calibrated routing or resource savings.

## Compare practical alternatives

Use the same explicit roster, starting preferences, profiles, execution limits
and task corpus for each comparison:

1. `strong`: one strong selected model for every task, using an explicit override.
2. `rules`: the configured economical fallback at its lowest supported effort;
   Jev is off for this diagnostic baseline. Record the exact fallback.
3. `jev`: normal automatic assessment, model-and-effort selection and review.

Record the actual effort on every attempt; a model name alone does not identify
the execution configuration. Include the tools/skills version in each comparison.

These are complete operating modes. Their actual routing/review calls count in
usage. Each result receives the same independent acceptance review; Jev's review
cannot be its own benchmark judge. Benchmarks do not enter personal learning
history. Profile and policy hashes prevent comparing different starting evidence.

Use the 40 development cases to adjust policies. The other 40 are held out,
with ten cases per work family. The comparison command requires at least five
held-out cases per family, matching case IDs and hashes, and completed independent
acceptance and critical-failure review. Fix development decisions before using
the held-out set. Expand future fixtures to real project changes, ambiguity,
adversarial content and longer documents before broad public claims.

## Report resources with quality

| Measurement | What the report establishes |
| --- | --- |
| Acceptance and critical failures | Independently reviewed usefulness, separately for coding, research, writing and documents. |
| Whole-task tokens | All known routing, worker and review consumption, including retries and failures; provider and role breakdowns. |
| Subscription allowance | Observed before/after changes for each account limit and reset window, with unknown coverage. No conversion from tokens to quota or dollars. |
| API cost | Settled dollars, pending reservations, and cost per accepted task only when spending is reconciled. |
| Worker attempts, retries and stages | Recovery and repeated work that an initial-model-only receipt would hide. |
| Latency | Elapsed time for useful results, including unsuccessful work. |

A token-reduction figure requires complete counts for both modes, no acceptance
regression in any family, and no candidate critical failure. Missing consumption
is never free. An API-only run and a subscription run share this quality objective;
API price alone is not a measure of total efficiency.

Account usage can include concurrent work elsewhere. Keep other usage quiet during
approved comparisons where practical, but retain the attribution limitation in
the results. Rounded zero changes, resets and missing Claude quota telemetry do
not demonstrate unused allowance. Overlapping intervals are not summed. Separate
windows are not merged into a fictitious universal percentage.

Small observed differences require repeated development runs before changing
defaults. Review outliers where a smaller model needed more attempts, where Jev
selected excessive capability, or where checks accepted an inadequate deliverable.
Do not optimize average tokens by sacrificing one work family or hiding unknowns.
