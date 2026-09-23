# ADR 0023: Preserve ordinal uncertainty and separate review clauses

Status: Accepted for 0.1.10. Date: September 23, 2026.

## Context

A concentrated-distribution threshold treated routine/standard uncertainty as a Jev outage. The September 23 comparison therefore used the economical fallback without requesting model selection. Semicolon-separated requirements also became one compound review question.

## Decision

Use a conservative cumulative 0.80 bound across ordered difficulty levels, accounting for reported rounding; use complex when lower levels do not reach the bound. Gate task type on its chosen-option probability. Preserve missing-context difficulty floors and all model eligibility checks. Keep the explicit cheap fallback for outages and invalid responses.

Split top-level semicolon requirements into literal clauses, while preserving quoted/code/bracketed punctuation. Supply the original request as context and retain conditions and exceptions. Keep verdict probability thresholds and bounded review coverage unchanged. Version evidence scopes when the judgment policy changes.

## Alternatives and costs

Lowering concentration thresholds still confuses ordinal uncertainty with unavailable judgment. Rounding the mean can understate a meaningful complex tail. Taking the maximum nonzero level overreacts to small tails. The chosen quantile is a conservative policy choice requiring calibration; it is not an accuracy guarantee.

Generated requirement extraction could omit or rewrite constraints. Literal clause separation avoids that rewrite, but is not semantic parsing: dependent clauses still require context-aware judgment. More questions can increase review usage and reach the coverage cap sooner. Unchecked clauses remain unverified.

## Evidence and revisit criteria

See the [development checks](../JUDGMENT_VALIDATION_20260923.md). Revisit with independent, fresh multi-domain judgments and matched-quality cost comparisons. Do not lower pass thresholds or treat a passing arbitrary verifier as requirement certification merely to improve benchmark counts.
