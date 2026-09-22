# Focused error detection

September 21, 2026. Final source `bbb31858ad689d39b17ffc5e66d9471232aa4067`, review v6 and focused review v5. See the [frozen development protocol](FOCUSED_REVIEW_PROTOCOL_20260921.md), [fixtures](../evals/review-detection.ts), and [results with receipt hashes](evidence/focused-review-20260921.json).

## What changed

DUKE previously asked three broad content questions. An unsupported owner assignment could remain unverified and never reach automatic repair. The new review checks literal requested requirements and bounded output passages separately. Ownership gets its own person-to-item check so a correct role title cannot stand in for an assignment to a different activity.

Source windows retain file or URL references and offsets. Output files and earlier drafts cannot serve as their own supporting inputs. Candidate ownership pairs are parsed from literal assignment-shaped text; they are claims to test, not generated source facts. PDF continuation lines are joined for review without editing the PDF. Empty checkbox-only rows carry no factual claim and are skipped.

An uncertain passage can receive one follow-up request with expanded source windows. That request excludes unrelated output, worker summaries and prior probabilities. Broad uncertain judgments remain incomplete. No additional worker or premium reviewer is selected. Existing API budgets, deadlines and cancellation fences apply to both review calls.

A broad negative judgment needs a specific failed claim or requirement before it can trigger worker recovery. Missing source material stays neutral. Confirmed defects use the existing same-model, one-effort-step repair policy and user limits. The probability threshold remains 0.80.

## Final observed results

| Check | Result |
| --- | --- |
| Planted defects | 10 / 10 detected |
| Correct examples | 7 passed, 2 unverified, 0 failed |
| Missing source | Unverified; no quality failure |
| Original flawed PDF | Unsupported workshop-owner assignment detected at 0.82 |
| Original correct PDF | No failed checks; overall unverified |

The 20 fixtures include six correct/flawed pairs for owners, dates, totals, completion claims, missing sections and proposals; an embedded-instruction case; a missing-source case; and six fresh transfer examples. In the final run, the transfer examples had three detected defects, two correct passes and one correct but unverified proposal. These are small development examples, not a held-out estimate of error-detection accuracy.

The saved PDF recheck used the original files and brief without another worker run or artifact edit. The final ownership check identified the unsupported assignment of Ana to the internal workshop. The correct Astra PDF remained unverified because several content judgments did not cross the threshold. This was a text-evidence recheck, not a new visual-layout judgment. Neither PDF was repaired during this diagnostic.

Local integration coverage verifies that a focused failed claim can trigger bounded same-model recovery even when the broad judgments pass. The full source suite passes 217 tests. That is separate from live evidence: this pass did not execute a new end-to-end worker repair on the PDF.

## Calibration history and cost

The first live run detected seven defects but wrongly rejected a labeled proposal and treated missing source material as a failure. Later runs removed those false failures, yet the real PDF owner assignment remained uncertain. An earlier negative verdict about a different unresolved checklist item is not counted as detecting the owner error. The final isolated evidence request crossed the existing threshold for the actual assignment.

All eight runs are retained, including 82 fixture judgments, failed experiments and incomplete checks. Their recorded Jev API cost was **$0.019950**, with no unresolved requests. They stayed within the original shared $1 cap; no new allowance was created. No worker inference ran in these diagnostics. Cost uses reported input tokens and the configured Jev rate of $0.042 per million input tokens; it has not been reconciled against a provider invoice. Offline development and independent review effort are not included in that API amount.

Repeated examples informed the implementation. The earlier receipts are not replaced by the final results, and the final 0.82 is one observed judgment, not a calibrated success probability. This is evidence that the reported failure can now be detected, not proof that it will always be caught.

## Remaining limits

Two correct proposals and the correct full PDF still had incomplete checks. Review caps cover up to eight requirement passages, 24 output passages with separate ownership questions, and bounded source excerpts. Excess or missing evidence stays unverified. Literal ownership parsing covers common assignment formats; it does not establish complete fact extraction across arbitrary documents.

The next independent evaluation should freeze this released policy and use unseen artifacts, measure false failures and missed defects separately, and include the cost and quality of actual repairs. General detection accuracy, visual-layout judgment and quality-preserving savings remain unproven.
