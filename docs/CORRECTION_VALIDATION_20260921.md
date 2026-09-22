# Correction validation

Version 0.1.8 separates one targeted correction at unchanged model and effort from a later increase in effort. A live Luna Low worker corrected a known bad total and passed the unchanged test. The complete workflow still blocked because Jev then falsely rejected the correct output. A subsequent evidence-handling fix removed that false failure in a review-only recheck; the saved result remained unverified.

The [protocol](CORRECTION_PROTOCOL_20260921.md) was committed before each phase. All attempts remain in the [machine-readable report](evidence/correction-20260921.json), including the original threshold, blocked attempts and false acceptance. This is development calibration, not held-out accuracy evidence.

## Policy

A failed review can trigger one correction using the existing facts, tools, model and effort. Jev must select correction at 0.80 or higher. If that attempt still fails, the existing reasoning judgment can authorize the next supported effort at 0.90, within the effort ceiling and remaining retries. Both consume the existing retry allowance; fixed effort stays fixed. The same correction cannot repeat on an unchanged task after resume. Missing essential context and tool failures pause; unknown judgments never authorize another worker.

The first implementation applied 0.90 to correction as well. It blocked even the deterministic assertion failure. Recovery v3 separates the thresholds because one unchanged-effort correction is a different cost/risk decision from increasing effort. Neither threshold is a calibrated probability of successful repair. See [decision 0020](adr/0020-bounded-correction-before-effort-escalation.md).

## Observations

| Check | Outcome |
| --- | --- |
| Arithmetic decision control | Correction selected at 0.97. No worker involved. |
| Missing required user decision | Missing context selected at 0.75, below the initial gate; returned unknown and did not authorize correction. |
| Unavailable PDF reader | Tool failure selected at 0.97; no correction authorized. |
| Original ownership-error PDF, v2 | Error detected; correction selected at 0.78, below 0.90. No worker ran. Not rerun under v3. |
| Arithmetic note with $120 + $80 = $250 | Jev falsely passed the unchanged wrong result. No correction ran. |
| Deterministic JSON control, v2 | Actual verifier rejected total 250. Correction probability 0.80 did not meet 0.90. No worker ran. |
| Same deterministic control, v3 | Correction selected at 0.87. One real Luna Low worker produced total 200 and passed the unchanged verifier. Jev falsely rejected the correct result; the escalation judgment did not meet 0.90. |
| Saved correct JSON after evidence fix | Review-only recheck was unverified with no failed checks. No worker rerun. |
| Wrong-total negative control after evidence fix | Failed. |

Independent inspection confirmed that the corrected JSON contains exactly printing 120, signs 80 and total 200. The original brief and verifier remained byte-identical. The original test passed after correction. That establishes a successful artifact correction, not a successfully completed automatic workflow on the final runtime.

## Evidence handling

Final review had received preparation-time progress from the earlier failed attempt. JSON files were also excluded from direct focused passages despite their current text being available. Version 0.1.8 removes the old progress from final-review requests and reviews current JSON passages directly. Review policy v8 and focused-review policy v7 identify the change. The recheck does not isolate which change affected Jev's judgment.

The arithmetic-note false acceptance remains a detection limitation. These fixes do not establish reliable arithmetic judgment, and correction cannot help when a defect is not detected. Deterministic checks remain valuable whenever the task has an executable correctness criterion.

## Cost and validation boundary

All five phases recorded $0.003781 in Jev API usage at the configured input price, with no newly unresolved requests. This is not invoice-reconciled spending. Only one real worker ran, on the existing Codex subscription. Raw usage is retained; no subscription dollar charge or allowance savings is inferred. The original shared $1 total API cap remains in force, including earlier spending and reservations.

All 226 local tests passed. Regression coverage includes unchanged-effort correction, later escalation, fixed-effort behavior, retry ceilings, cancellation, changed model availability, provider-default effort, resume persistence, fresh JSON evidence and stale-progress exclusion. TypeScript, the production build and browser checks also passed. Signed-package verification is recorded in the [distribution receipt](evidence/distribution-0.1.8-verification.json).

No final-runtime end-to-end provider rerun was performed after the review-only fix. The original PDF remains unrepaired. A fresh held-out set should test missed errors, false failures, new defects introduced during correction and total cost per independently acceptable completed task. Repeatedly adjusting these development fixtures would not establish general reliability.

## Offline regression replay

`npm run eval:correction-replay` replays the sanitized recorded-provider report without a provider call or worker run. It fails closed unless the retained history still exposes all three review gaps: the missed arithmetic error, the verifier-passing corrected JSON that was falsely rejected, and the later review-only result that remained unverified without a failed check. It also checks the recorded unchanged-effort correction against the current 0.80 gate and the later escalation judgment against the unchanged 0.90 gate.

Tests labeled `recorded-provider replay` consume the historical provider receipts. Tests labeled `synthetic mutation` alter copies only to exercise fail-closed evidence and policy boundaries. Neither kind measures current or general Jev accuracy, and neither replaces a future held-out or live-provider evaluation.
