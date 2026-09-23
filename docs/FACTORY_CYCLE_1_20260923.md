# Factory cycle 1: routing, output quality, and review defects

The first fresh cycle ran four development tasks once each through automatic Jev routing, fixed Luna Low, and fixed Astra Medium. Automatic routing selected **Sol Low for coding, writing, and documents; Sol Medium for research**. It used actual Jev selection, not the economical outage fallback.

Opus 5.5 accepted the content of all four automatic outputs and all four Astra outputs. Luna met three content rubrics; its writing output was 90 words against the requested 100–150. All three coding outputs passed the frozen tests without input or verifier changes. Word content and tool provenance passed, but complete document layout/pagination remains unverified because native previews were inconsistent. These are content results, not four fully verified end-to-end successes.

| Policy | Independent content acceptance | Worker API equivalent plus actual Jev | Cost per content-accepted output |
| --- | ---: | ---: | ---: |
| Automatic Jev | 4/4 | $0.261412 | $0.065353 |
| Fixed Astra Medium | 4/4 | $1.135081 | $0.283770 |
| Fixed Luna Low | 3/4 | $0.016064 | $0.005355 |

Automatic routing cost about **77% less than fixed Astra** on this sample, with matching content acceptance. Fixed Luna was much cheaper and missed one writing constraint. This supports the narrow observation that routing to a smaller model can save against an expensive default. Four cases cannot establish general savings or prove that Sol was necessary: Luna at a higher effort, or a corrected Luna draft, was not tested. There were no natural worker retries, so this cycle does not establish recovery efficiency.

The prices are dated [model-specific API equivalents](evidence/model-prices-20260923.json), including cached input and output. Codex used the subscription; those figures are not charges or measured subscription allowance savings. Actual Jev API spending across all twelve runs was **$0.015536**, with no unresolved requests from this cycle. The unchanged shared $1 cap still includes earlier spending and unresolved reservations. Independent Opus review used the connected Claude subscription; its SDK-reported usage is separate evaluation overhead in the evidence receipt.

Weekly Codex usage moved from 38% to 39% used during preparation and execution. That is account-wide movement, including coordination and other activity, not attributable worker cost. Dispatch checks retained the 50% reserve. The old scheduled factory automation remains paused; this was one supervised cycle.

## What the review system did

Eleven tasks completed with an `unverified` review. Luna's document task blocked after an ownership judgment failed. No task earned a fully passing DUKE review. This distinction matters: independently usable content does not yet mean the application reliably recognizes success.

The cycle found two reproducible parsing defects:

1. **Numbered requirements consume extra review slots.** The research rubric has thirteen entries. `1. Conditional recommendation` becomes `1.` and `Conditional recommendation`; the full rubric expands to 25 clauses, exceeding the 24-clause review limit. The baseline is retained unchanged. A lexical fix should keep numbering attached to its requirement, without raising the cap or weakening the verdict threshold.
2. **Ownership extraction can misstate the claim.** `Staff walkthrough: Pending; owner: Lea.` becomes an item named `Staff walkthrough: Pending;`. A dash form can capture `Owner: Lea. Complete the walkthrough before the planned trial.` as the person's name. Jev rejected the literal Lea assignment at 0.86 even though the supplied brief explicitly assigns it. Opus accepted the document content. The malformed pair is a concrete defect that can mislead the judge; this run alone does not prove it was the sole cause of the false rejection.

There are additional limits to investigate. Most reviews remain incomplete even with accepted content. Luna's short writing draft was not labeled a confirmed failure by DUKE. The Word preview helper produced cropped images for automatic and Astra outputs; a separate Quick Look command showed the full Astra first page but also cropped the automatic preview. All expected text is present in the DOCX XML, and the saved Markdown matches the exact `create_artifact` content in all three modes. That proves content and provenance, not complete rendered pagination. Preview inconsistency is an open verification issue, not a demonstrated missing-title error in the underlying file.

## How the evidence was collected

The [protocol and fixtures](../evals/factory-cycle-1/README.md) were committed at `d4932c7` before calls, against runtime `a2b8d7f` (0.1.11). Each case/policy used fresh isolated state, the same core tools and skills, a two-recovery limit, a medium recovery-effort ceiling, default-denied approvals, and an eight-minute task bound. Fixed policies retained their explicit effort; the automatic initial effort was unrestricted by the recovery ceiling. Cases ran sequentially in a rotating policy order. No source, policy, fixture or threshold changed mid-comparison.

Research used supplied fictional sources, not live retrieval. The coding task covered unsorted overlapping intervals, touching boundaries, validation and input preservation. Writing tested factual uncertainty, quoted language, dependent prohibitions and length. The Word handoff tested real artifact creation and unresolved owner/status handling.

Opus received randomly labeled outputs, the original briefs, source files and rubrics. It did not receive model names, routes, prices or Jev verdicts. Tools were disabled. The coordinator separately verified frozen test receipts, file hashes, word counts, actual artifact tool arguments and native previews. Opus's approximate writing word count was replaced with the deterministic count of 90; its below-minimum conclusion was correct. Review verdicts remain model judgments, not human ground truth. The private review prompt is not included in this repository.

[Machine-readable results](evidence/factory-cycle-1-20260923/results.json) include all twelve outcomes, per-attempt token categories, costs, independent findings, review checks and content acceptance. Blinded task packets and native preview examples are beside that receipt. Raw authenticated task stores and private filesystem paths are excluded.

## Bounded improvement

The next correction addresses the two literal parsing defects, with fresh-format regression tests and conservative refusal to extract ambiguous ownership pairs. It must preserve thresholds, economical fallback, user ceilings, provenance rules and recovery limits. The frozen comparison will not be rerun selectively or relabeled as post-fix evidence. A parser fix can establish correct extraction locally; improvement in live Jev judgments requires a separate fresh check. Preview reliability and remaining review calibration are still open.
