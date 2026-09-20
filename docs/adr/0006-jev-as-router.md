# ADR 0006: Give Jev the routing decision

Status: implemented. Recorded during the September 2026 release pass.

## Context

DUKE exists to remove the routine model-choice burden. An observation-only or
recommendation layer would leave that burden with the user. Rules can identify
some task types but struggle with difficulty and mixed requirements.

## Decision

Use Jev for typed task assessment, selection from eligible model-and-effort
configurations, and bounded result review. The application owns eligibility and
execution. Jev cannot enable accounts, expand file permissions or override a
spending limit. The worker completes the task.

Typed Choice/Score results constrain the response shape. They do not establish
that the assessment or choice is correct. A close distribution among suitable
choices does not by itself justify discarding the choice or spending more.
Uncertain assessment follows the configured economical fallback.

## Alternatives and consequences

A rules-only router is predictable and remains useful during failure, but cannot
provide the intended task judgment. Letting users approve every recommendation
would undermine automatic routing. An unconstrained model response would require
more output parsing and could name unavailable models.

The routing service adds latency, cost and a provider dependency. All of those
belong in whole-task accounting. Judgment quality needs held-out evaluation;
schema correctness and a working API call are insufficient proof.

Implementation: [Jev adapter](../../server/adapters/jev.ts),
[router](../../server/router.ts), [fallback decision](0002-efficient-routing.md).
