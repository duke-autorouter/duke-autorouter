# 0022: Defer requirement coverage metadata

Status: Accepted, September 23, 2026.

## Context

PR13 explored mapping individual requirements to predeclared verification commands and files. Review found that hashing selected verifier files does not secure the command's transitive dependencies, runtime, environment, inputs or output interpretation. A worker could influence those while leaving the declared files unchanged.

The revised proposal kept every coverage row unverified and preserved semantic review. That avoids certification, but adds task, revision and receipt state without resolving the original trust problem. The diff also carried unrelated formatting changes.

## Decision

Close PR13 without merging its runtime changes. Preserve the proposal and review in the PR history and this decision. Existing execution receipts and independent development acceptance checks remain available. A successful command alone must not certify that a natural-language requirement is satisfied.

## Revisit criteria

A future proposal must either show a concrete user need for advisory metadata beyond existing receipts, or define a verifiable execution boundary for certification. It must bind evidence to the exact task revision and input, handle requirement supersession, check relevant files before and after execution, and account for dependencies that the worker can change. Hashes establish identity of selected bytes; they do not establish semantic correctness.

Keep any implementation small, with no unrelated formatting changes. Test stale receipts, changed inputs, changed verifiers, unavailable execution and partial requirement replacement. Diagnostic observations must stay distinct from acceptance judgments.

## Evidence

[PR13](https://github.com/duke-autorouter/duke-autorouter/pull/13), reviewed at `1d4dba9dd635ab23d4583413804a3894ca629688` against 0.1.9 main. The September 23 review examined the actual diff and confirmed it applied to main; it did not execute its tests or validate live providers. This decision is a scope and trust-boundary judgment, not a claim of an observed exploit.
