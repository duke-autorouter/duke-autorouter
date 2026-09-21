# Execution evidence in response review

Version 0.1.7 fixes a false failure found in the frozen 0.1.6 comparison. The worker correctly said its test passed, but the focused response review did not receive DUKE's passing test receipt. Jev therefore treated the statement as unsupported.

Focused response review now receives bounded verifier observations and file metadata. Worker assertions cannot become their own supporting evidence. A passing command supports that command only; it does not prove deployment, unrelated tests, document facts, or whole-task success. Missing or truncated execution evidence stays neutral. Document-source checks remain separate.

The focused-review policy is v6 and the review evidence policy is v7. Earlier review evidence does not transfer silently into this policy. Recovery thresholds, model selection, effort, permissions, and spending limits are unchanged.

## Validation

All 220 local tests passed, including regressions for both focused requests, failed and unavailable commands, unrelated claims, truncated evidence, and document-source contradictions. TypeScript and the production build passed.

Two live diagnostic runs reused the original coding receipt without rerunning a worker or modifying its artifact. Every call is retained in the [evidence](evidence/execution-review-20260921.json). The first run exposed an unavailable-command edge case; the final run followed its correction.

| Case | Initial diagnostic | Final diagnostic |
| --- | --- | --- |
| Original passing test | Unverified | Unverified |
| False claim that a failed test passed | Failed | Failed |
| Unavailable test | Failed | Unverified |
| Unrelated deployment claim | Failed | Failed |

The original false failure is removed, but the response still does not receive a complete passing review. These are development controls, not an independent held-out accuracy result. Total recorded Jev cost was $0.001851 across both runs. The natural efficiency comparison remains a 0.1.6 result and has not been rerun on 0.1.7.

The original PDF recovery probe still blocks on uncertain failure cause. The next evaluation should distinguish reasoning errors from missing context and tool failures using known causes. Changing the recovery threshold requires separate evidence; this patch does not change it.
