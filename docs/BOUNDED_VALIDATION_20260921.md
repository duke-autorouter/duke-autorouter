# DUKE Autorouter bounded repair validation

Recorded September 21, 2026.

Tested from clean source commit `7939309d2d6a4cc5f7341fc1cf38affa3f6d14ee`.

The two failed development cases were successfully repaired under the bounded protocol, and both fresh development cases passed at operator-fixed Luna Medium. This does not validate automatic routing or establish general quality-preserving savings.

## What failed

The original four-case Luna/Jev run accepted two cases and rejected two.

- **SQLite research:** This had a demonstrated source-fidelity confound. The web text extraction removed strike/deletion semantics from obsolete SQLite text, placing obsolete and corrected guidance side by side without their revision relationship. The worker repeated the obsolete statement. The automatic reviewer remained unverified and did not catch it.
- **DOCX handoff:** This was a worker synthesis error compounded by weak table-aware checking. The worker had the complete brief but placed the unowned participant-trial status in Sam's row. The flattened self-check obscured the row/cell association, and the original preview evidence was incomplete.

The repair harness preserved all original artifacts, used clean workspaces, kept the task and rubric fixed, and changed only the preregistered evidence path or effort. Jev observations were retained but were not used as independent acceptance decisions.

## Repair outcomes

| Case | Model / effort | Independent result | Critical failure | Corrections | Combined attempt proxy |
|---|---|---:|---:|---:|---:|
| SQLite research | Luna Low | Accepted | No | 0 | $0.00986212 |
| DOCX handoff | Luna Low | Rejected | Yes | 1 | $0.00795868 |
| DOCX handoff | Luna Medium | Accepted | No | 0 | $0.01021056 |

The SQLite rerun used current primary-source evidence and no longer repeated the obsolete large-transaction guidance. The Low-effort DOCX rerun repeated the unsupported Sam/trial association and was rejected. The Medium rerun separated the unowned status from the owners table and passed the unchanged rubric after two-page render inspection.

## Cost of the original tasks and reruns

The cost below includes the full original four-case run and every repair attempt, including the failed Low-effort DOCX rerun.

| Cost component | Original run | Repairs | Full repaired cohort |
|---|---:|---:|---:|
| Worker API-equivalent | $0.03791312 | $0.02747536 | $0.06538848 |
| Recorded Jev API cost | $0.001322 | $0.000556 | $0.001878 |
| Combined proxy | $0.03923512 | $0.02803136 | **$0.06726648** |

All four original development cases eventually reached independent acceptance.
The worker amounts use the frozen September 20 model-specific rates in the
[corrected comparison](COST_EFFICIENCY_PILOT_20260920.md); they are subscription
API equivalents, not subscription bills or measured quota savings. Jev amounts
are settled costs recorded by the harness, not independently reconciled invoices.
The total excludes offline independent-review labor and its model usage. Reviewers
knew the condition. Single stochastic reruns do not isolate a causal effect.

For context, the original strong baselines were:

| Baseline | Accepted | Combined proxy |
|---|---:|---:|
| Astra Medium | 4/4 | $1.421647 lower bound; $1.423100 upper bound |
| Astra Ultra | 4/4 | $1.757710 |

The Medium upper bound uses its provider receipt reserve; the shared authorization
ledger still retains a more conservative $0.009766 uncertainty allowance. No
uncertain charge was silently treated as free.

The repaired Luna cohort's combined proxy was descriptively 95.27% below the Astra Medium range and 96.17% below Astra Ultra on these four development cases. Because the repairs were targeted on known failures, these figures are not evidence of quality-preserving savings beyond this cohort.

## Fresh development validation

The untouched fresh pair was opened only after the shared passing effort had been fixed at Luna Medium. Model and effort were selected manually; this did not test routing.

| Fresh case | Independent result | Key verification | Worker equivalent | Recorded Jev API | Combined proxy |
|---|---:|---|---:|---:|---:|
| MDN CSP research | Accepted | Claims checked against current MDN, WHATWG and CSP3 primary sources | $0.01865912 | $0.000533 | $0.01919212 |
| Budget XLSX | Accepted | Formula total 900; two sheets and two tables inspected; no formula errors; both sheets rendered legibly | $0.03082544 | $0.000100 | $0.03092544 |
| **Fresh pair** | **2/2 accepted** | Independent artifact review | **$0.04948456** | **$0.000633** | **$0.05011756** |

The research output accurately distinguished document-owner CSP sandboxing from embedder-controlled iframe sandboxing, covered opaque-origin behavior and the `allow-scripts` plus `allow-same-origin` warning, and labeled recommendations and caveats. The workbook preserved the supplied facts and arithmetic, used a real formula for the $900 total, and did not invent completed outcomes.

The Low document rerun again received a support pass at probability 0.90 despite
its ownership error; its overall review remained unverified. Automatic Jev review
also remained unverified on both fresh cases and was treated only as an observation. The independent verdicts came from the frozen rubrics, source checks, workbook inspection and visual renders.

## Evidence boundary

This result supports a narrow conclusion: after repairing the evidence path and strengthening structured artifact checks, the two known failures could be recovered, and two fresh development cases also passed at the preregistered shared effort.

It does **not** establish:

- automatic routing quality;
- general quality-preserving savings;
- production readiness or reliability;
- performance on held-out cases; or
- attributable subscription savings from observed allowance percentages.

The next meaningful test is a preregistered, materially larger untouched set with
operator-independent routing and repair, symmetric review and complete cost
receipts. No strong-model baseline was run on the fresh pair.

See the [machine summary](evidence/bounded-validation-20260921.json) and
[independent verdicts](evidence/bounded-validation-independent-review.json).
