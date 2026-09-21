# 0019: Carry verifier observations into response review

Status: Accepted, September 21, 2026.

## Context

The frozen 0.1.6 comparison produced a correct coding artifact with passing tests. Focused review lacked the actual test receipt and rejected the worker's statement that verification passed. A subsequent negative control also showed that unavailable execution could be mistaken for a false claim.

## Decision

Provide bounded task-specific verifier checks and file metadata to both focused response-review requests. Treat logs as untrusted data. Exclude worker assertions and prior model judgments from supporting observations. Restrict a passing receipt to the command it records. Keep incomplete or truncated execution observations neutral, while preserving direct deterministic test failures and document-source contradictions.

Version the review policies so earlier evidence does not silently inform the new policy. Keep the existing model, effort, recovery-confidence, and budget policies.

## Alternatives

Lowering review thresholds would hide the missing-evidence problem. Accepting worker completion statements would make review circular. Sending unrestricted logs would increase exposure and context use. The selected approach supplies bounded observations from the verifier already responsible for executing the checks.

## Consequences

The observed false failure no longer occurs in the live recheck; the correct response still remains unverified. Conservative handling can leave other claims uncertain when execution observations are incomplete. This does not establish general judge accuracy or successful automatic recovery. See the [validation report](../EXECUTION_REVIEW_VALIDATION_20260921.md).
