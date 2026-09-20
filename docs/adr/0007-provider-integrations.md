# ADR 0007: Support subscriptions and optional API workers

Status: implemented.
Recorded during the September 2026 release pass.

## Context

Individuals and teams already have subscriptions. Requiring API billing for every
worker would discard that capacity. Conversely, subscriptions alone would limit
the available roster and exclude users who prefer API access.

## Decision

Use the bundled Codex app-server and Claude runtime through their adapters, with
separate DUKE profiles and official sign-in flows. Keep OpenRouter optional and
let users select a small roster. Jev has a separate TypeSafe API connection.
Check execution availability independently from whether an API key is present.

Keep the Claude runtime unmodified and preserve its setup choices. DUKE's current
worker executes subscription tasks; additional sign-in choices do not imply
implemented API/cloud execution. The [usage notes](../USAGE.md#claude-runtime-and-setup)
describe connection setup and the bundled runtime.

## Alternatives and consequences

API-only execution would simplify accounting but miss a central use case.
Reading another app's private credentials would create fragile coupling and
unclear account boundaries. Supporting an entire model catalog by default would
increase uncertainty and setup burden.

Separate profiles require sign-in inside DUKE. Bundled runtimes add package size
and update responsibilities. Provider changes can break authentication, quota
readings or execution independently. Each adapter needs its own evidence; a
successful catalog lookup does not prove a task can run.

Implementation: [adapters](../../server/adapters), [connections and usage](../USAGE.md).
