# GPT-6 routing and recovery development check

This two-task development sample does not establish an advantage for Jev routing over fixed Luna. Automatic mode used the Luna Low fallback on both tasks and cost $0.006059, with one of two outputs independently accepted. Fixed Luna Low cost $0.006105 and both outputs were accepted. Fixed Astra Medium cost $0.444753 and both were accepted. These totals combine model-priced worker usage with actual Jev spending; they are not subscription charges.

Automatic mode cost 98.6% less than fixed Astra in this sample, but acceptance differed and neither automatic run reached Jev's final model-selection step. That percentage describes this model-cost comparison only. It does not establish matched-quality savings, Jev's selection benefit, or general routing efficiency.

## Independent output acceptance and review

| Mode | Model-priced total + actual Jev | Independently accepted | DUKE final review passed |
| --- | ---: | ---: | ---: |
| Automatic | $0.006059 | 1 of 2 | 0 of 2 |
| Fixed Astra Medium | $0.444753 | 2 of 2 | 1 of 2 |
| Fixed Luna Low | $0.006105 | 2 of 2 | 0 of 2 |

All six tasks finished, and all coding outputs passed the unchanged three-test verifier. All writing outputs passed their structural checks. The automatic writing output added “I’ll share that information when it’s available,” an unsupported follow-up commitment. It fails the frozen no-invented-promises criterion. This is a narrow, editable defect; its other task facts and structure were correct. The two other writing outputs met the frozen rubric. The review was independent of Jev but was not blinded to model or mode.

The automatic total retains the unsuccessful writing attempt. Its model-priced cost per accepted result was $0.006059 versus $0.222377 for Astra, about 97.3% lower, with unequal accepted counts. Fixed Luna also delivered both acceptable artifacts at far lower model-priced cost than Astra in this small sample. No natural case triggered recovery. One run per task cannot establish stable quality or general savings.

DUKE marked five final reviews unverified, including independently correct work. Unverified is not a failed artifact and did not trigger an effort increase. The coding requirement bundled multiple clauses into one judgment, and Jev's pass probability sometimes fell below the existing gate despite the passing verifier. Preserve this as a review/workflow limitation; do not tune thresholds to these known fixtures.

## Controlled recovery, separately

The separate probe forced an initial Luna Low route and inserted a deliberately wrong, zero-inference coding artifact. The unchanged verifier failed. Real Jev selected same-effort correction with probability 0.98, above the existing 0.80 gate. Real Luna Low then repaired the code; the original tests passed and the brief/verifier hashes remained unchanged. Final semantic review remained unverified.

The probe cost $0.002960 on the same combined pricing basis, including $0.000473 actual Jev spending. Its two recorded worker stages include the injected zero-inference stage. This verifies one controlled correction path; it is excluded from natural efficiency totals and does not establish effort escalation or natural recovery frequency.

## Method and accounting

The [frozen protocol](../evals/gpt6/README.md) supplies identical briefs, files, tools, skills and review settings across modes, with two recoveries maximum and a Medium effort ceiling. Fixed effort overrides stay fixed; automatic mode can increase effort when policy permits. Coding acceptance combines the unchanged scoped verifier with source inspection. Writing acceptance combines structural checks with the predeclared factual and editorial rubric. No held-out benchmark was used.

The tested harness commit was `cf6d460`; product runtime matched 0.1.9. Receipts preserve the full commit and case hashes. Initial fixture defects were corrected and checked before any comparison calls; no model failures are attributed to those preparation errors. Artifact and review outcomes are kept separately.

Worker amounts are Standard API price equivalents for observed subscription tokens, including cached input and output. They are not subscription charges. [Dated prices](evidence/model-prices-20260923.json) come from official OpenAI model pages. Actual Jev spend across the six natural tasks was $0.003079; including the separate recovery probe and three integration checks, this pass recorded $0.004051. All requests reconciled. Every recorded attempt is included. Each worker attempt's total input stayed below the long-context threshold, so no individual request required its surcharge.

The account-wide weekly usage moved from 33% used at the start to 34% at the final check (66% remaining). Other Codex activity and the coordinating workers share that allowance. No precise subscription allowance saving is claimed.

## Repository validation

All 238 tests and TypeScript passed locally. A targeted regression covers the writing checker and source mutation detection. The pinned secrets scan passed; exported receipts were checked for local user paths. The initial sandboxed full-suite attempt hit macOS browser/native permission errors; the run with the required local permissions passed. No product runtime changed, so the installed and downloadable app remain 0.1.9.

## Evidence and next work

[Priced results](evidence/gpt6-20260923/priced-results.json), [independent reviews](evidence/gpt6-20260923/independent-reviews.json), scoped receipts and fictional artifacts are in [the evidence directory](evidence/gpt6-20260923). The three new-model integration checks are [recorded separately](MODEL_VALIDATION_20260923.md).

The next focused investigation is how routing handles uncertainty between adjacent difficulty levels and how review produces actionable judgments for individually testable requirements. These results support using economical models for well-specified work while retaining review and bounded correction; they also show where DUKE's judgments still need improvement.
