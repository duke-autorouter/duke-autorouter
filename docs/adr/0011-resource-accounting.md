# ADR 0011: Learn from whole-task resources without inventing equivalence

Status: implemented; comparative efficiency remains unmeasured.
Recorded during the September 2026 release pass.

## Context

API dollars and subscription capacity are different measurements of resources
users want to conserve. Measuring only a successful final call conceals failed
attempts, retries and review. Pooling all tasks conceals differences in difficulty,
length, effort and tool configuration.

## Decision

Record routing, worker, retry and review usage. Reserve API spending before calls;
keep unknown charges unresolved until reconciled. Preserve provider token and
allowance readings with freshness and coverage labels. Account-wide subscription
changes are not automatically attributable to one DUKE task.

Use observed task outcomes and comparable resource histories as guidance for
Jev. Scope evidence to model, supported effort, work type, difficulty and brief
size, with reduced weight for explicitly related work. Exclude manual overrides,
benchmark runs and uncertain assessments from positive automatic learning.
Changes to the execution tools or core skills invalidate incompatible evidence.

## Alternatives and consequences

Counting subscription tasks as free would reward waste. Converting every token
or allowance change into one universal dollar metric would imply equivalence
the data cannot support. Restricting evidence to an identical roster would throw
away useful observations when unrelated models change.

Cold starts use provider descriptions and optional preferences rather than
invented scores. Small samples remain small samples. Development benchmarks
compare the configured economical fallback, other stated baselines and Jev on
matched held-out tasks, counting all work. An observed pass does not establish
measured savings or a calibrated probability of success.

Implementation: [efficiency](../../server/efficiency.ts), [usage](../../server/usage.ts),
[benchmark protocol](../BENCHMARK_PROTOCOL.md).
