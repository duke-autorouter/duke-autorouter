# Factory cycle 2: fresh review checks and a corrected preview finding

This cycle tested the unreleased parser correction on fresh invented material. It also rechecked the document previews from cycle 1. No product runtime, threshold, model-selection, recovery or image-conversion change was justified by these results.

## Review results

Seven cases were frozen at `c264129` before calls, against review runtime `c5c3c00`. Five matched their predeclared overall outcomes. The other two remained unverified on the broad completion check, although both correct ownership relationships passed their specific ownership checks.

| Fresh case | Expected | Observed |
| --- | --- | --- |
| Correct owner with Markdown/status label | Passed | Unverified: completion P(pass) 0.74 |
| Correct owner with dash label | Passed | Unverified: completion P(pass) 0.69 |
| Owner incorrectly transferred from another item | Failed | Failed |
| Invented owner for an unassigned item | Failed | Failed |
| Ownership source withheld | Unverified | Unverified |
| Fourteen correct numbered fields | Passed | Passed |
| Incorrect fourteenth field | Failed | Failed |

The final field's defect was detected beyond the first batch of eight requirements. All fourteen numbered requirements were retained. The supported ownership cases passed their requirement, factual-support and ownership checks; neither was falsely failed. This is narrow post-fix evidence, not a before/after causal accuracy estimate.

The first two prompts could be read as requesting a broader handoff than the one item in the output. To investigate that possibility, a **separate** two-case control was frozen at `d112924`, with new names and facts, before its calls. It explicitly requested exactly one line about one item and excluded the other source item. The correct line still remained unverified on completion, P(pass) 0.63; the wrong-owner control failed. Tightening the scope did not resolve the uncertainty. The original seven cases remain in the evidence and are not replaced by these controls.

Across both cohorts, six of nine overall outcomes matched their declared expectation, with three correct outputs still unverified rather than failed. This is a diagnostic count, not a population accuracy rate. All three incorrect-owner/assignment cases failed, both numbered-field cases behaved as expected, and missing evidence stayed neutral. There were no generation workers, automatic repairs, efficiency comparisons, or threshold adjustments. These fixtures simulate inspected evidence; they do not establish end-to-end task completion.

Actual Jev spending for these two cohorts was **$0.003171**: $0.002923 for the first seven and $0.000248 for the scope pair. Every request settled; this uses the existing shared $1 authorization. [Initial receipt](evidence/factory-cycle-2-20260923/initial-review.json), [scope controls](evidence/factory-cycle-2-20260923/scope-controls.json), and [frozen protocol](../evals/factory-cycle-2/README.md).

## Real file-verifier controls

A final six-case diagnostic was frozen at `e0f79b5` before calls. It used actual saved text files, a real `read_file` source receipt, and DUKE's `verifyTask` inspection. Files were fixture-authored; no generation or recovery worker ran.

| File/control | Expected | Observed |
| --- | --- | --- |
| Correct owner and status; short final response | Passed | Passed |
| Same correct file; descriptive final response | Passed | Passed |
| Missing file | Failed | Failed before Jev |
| Placeholder content | Failed | Failed |
| Wrong owner | Failed | Failed |
| Missing required status | Failed | Failed |

All six matched their predeclared overall outcomes. Both correct files passed completion at P(pass) 0.99. Negative controls remained rejected without changing the 0.8 threshold. The missing-status case also left its correct-owner requirement uncertain while its dedicated ownership check passed; individual judgments are not perfectly isolated from other defects. The [full receipt](evidence/factory-cycle-2-20260923/real-verifier.json) preserves every check, including uncertainty.

The completion uncertainty from the synthetic-evidence cohorts did not reproduce through the actual file verifier in this sample. This supports retaining the gate and using real verifier evidence in future evaluations. It does not isolate the cause: evidence shape, new facts and wording changed between cohorts, and these are single observations rather than a repeated controlled calibration study. The earlier three uncertain outputs remain recorded.

This cohort cost **$0.000691**, making cycle 2's total actual Jev spending **$0.003862**, with no unresolved requests. Weekly account usage moved from 40% to 41% used during the cycle; that account-wide movement cannot be attributed solely to this work.

## Preview finding withdrawn

Cycle 1's cropped-preview finding was an incorrect visual reading. The original saved Astra PNG contains the title and expected first-page text. It is byte-identical to a new render: SHA-256 `b694e741b11add7a0c93822c25f5e88adf40c5b308ee4b8868a790a0ac79b824`. Its nonwhite pixel bounds are `(104, 127, 1075, 592)` in a 1200×1553 image, so it is not blank. Reopening the automatic-route Quick Look PNG also shows its title and expected text.

The unmodified repository helper rendered four fresh filename copies of the Astra document and three repeats each of the original Astra, Luna and automatic documents: thirteen renders. Repeated renders of each original file had identical hashes. No renderer fix was made. An experimental `.preview` representation did not compile and never produced these images. The [preview receipt](evidence/factory-cycle-2-20260923/preview-verification.json) records hashes, dimensions, source identity and coverage.

This clears the asserted first-page crop defect. Quick Look thumbnails still do not establish complete pagination, every page of a long document, or appearance in Microsoft Word. That limitation remains explicit.

## What remains

The next worker evaluation should pass artifacts through the real verifier and include fresh negative controls. Broader completion calibration and recovery success remain open; this small file-verifier sample does not settle those questions. There is no evidence here supporting a renderer patch or a lower review threshold.

The source correction from PR19 remains unreleased. Installed and downloadable DUKE stay at 0.1.11. The scheduled factory pilot remains paused; this cycle adds validation and corrects the record, without expanding remote access or publishing a release.
