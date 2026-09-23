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

Actual Jev spending was **$0.003171**: $0.002923 for the first seven and $0.000248 for the scope pair. Every request settled; this uses the existing shared $1 authorization. [Initial receipt](evidence/factory-cycle-2-20260923/initial-review.json), [scope controls](evidence/factory-cycle-2-20260923/scope-controls.json), and [frozen protocol](../evals/factory-cycle-2/README.md).

## Preview finding withdrawn

Cycle 1's cropped-preview finding was an incorrect visual reading. The original saved Astra PNG contains the title and expected first-page text. It is byte-identical to a new render: SHA-256 `b694e741b11add7a0c93822c25f5e88adf40c5b308ee4b8868a790a0ac79b824`. Its nonwhite pixel bounds are `(104, 127, 1075, 592)` in a 1200×1553 image, so it is not blank. Reopening the automatic-route Quick Look PNG also shows its title and expected text.

The unmodified repository helper rendered four fresh filename copies of the Astra document and three repeats each of the original Astra, Luna and automatic documents: thirteen renders. Repeated renders of each original file had identical hashes. No renderer fix was made. An experimental `.preview` representation did not compile and never produced these images. The [preview receipt](evidence/factory-cycle-2-20260923/preview-verification.json) records hashes, dimensions, source identity and coverage.

This clears the asserted first-page crop defect. Quick Look thumbnails still do not establish complete pagination, every page of a long document, or appearance in Microsoft Word. That limitation remains explicit.

## What remains

The overall completion gate can remain uncertain even when specific content checks pass. The next useful study should vary verified deliverable evidence and completion wording on a predeclared, balanced set containing real omissions and placeholders as well as concise correct work. It should distinguish a broad-judge calibration problem from incomplete synthetic evidence. Removing that gate or lowering its threshold because these examples stayed unverified would not establish a reliable fix.

The source correction from PR19 remains unreleased. Installed and downloadable DUKE stay at 0.1.11. The scheduled factory pilot remains paused; this cycle adds validation and corrects the record, without expanding remote access or publishing a release.
