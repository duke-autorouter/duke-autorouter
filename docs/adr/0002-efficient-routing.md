# ADR 0002: Choose the model and effort within a selected roster

Status: implemented. Recorded September 20, 2026.

## Context

A catalog with hundreds of models adds setup and judgment uncertainty. Subscription
users also care about consumption. Calling the most capable model by default
undermines the product's purpose, even when the subscription has no per-task bill.

## Decision

The user selects a roster of at most 32 models and may set starting work preferences.
Jev assesses the task, then chooses a model and an advertised reasoning effort.
DUKE rechecks permissions, tools, availability and budget before execution.

The default failure path uses an available selected Luna or Haiku at its lowest
supported effort. Users may configure another selected fallback. An unavailable
fallback pauses the task; it does not silently activate Astra, Opus or Fable.

## Alternatives

Static task-to-model assignments are simple but cannot adapt to task difficulty.
Always choosing the strongest model avoids some retries at the cost of routine
overuse. Price-only ranking ignores subscription capacity, quality and repeated
work. A catalog-wide choice adds candidates the user may not want or fund.

## Consequences and evidence

A cheap failed attempt is an accepted tradeoff. Checks and bounded recovery remain
necessary. A stronger model at low effort may be more efficient than a smaller
one at high effort; names and effort labels alone cannot settle that comparison.

Whole-task usage includes routing, execution, retries and review. Local evidence
is scoped to model, effort and comparable work. Early observations inform Jev
without becoming invented success rates. Live dispatch has exercised model-plus-
effort selection and Luna at Low on the fallback path. Savings remain unmeasured.

See [routing policy](../ROUTING_POLICY.md) and [benchmark protocol](../BENCHMARK_PROTOCOL.md).
