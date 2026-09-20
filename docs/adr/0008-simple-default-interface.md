# ADR 0008: Make a task the default interaction

Status: implemented. Recorded during the September 2026 release pass.

## Context

A router that first asks users to choose a model, tools, output filenames and
verification commands defeats its own purpose. An empty override dropdown and
an empty project selector looked actionable while providing no useful action.

## Decision

Use a chat-first layout. A normal task requires a project and a brief. Put account
connections and roster selection in setup, and show an actionable Add a project
path when no project exists. Keep useful permissions enabled by default; put
fine-tuning controls in optional and advanced sections.

Make usage available on demand, with an optional persistent summary. Keep budget
and subscription information together without treating subscription usage as
free or converting unknown capacity into a dollar value. Show task activity and
the selected model clearly, including its supported reasoning effort.

## Alternatives and consequences

A full Codex-like three-pane workspace would offer more persistent context but
add complexity to first use. A configuration-heavy form exposes implementation
details before users need them. Hiding every routing decision would make errors
and unexpected resource use difficult to understand.

The simple path still needs honest failure states, approvals and inspection of
results. Advanced settings remain available, but cannot become prerequisites for
ordinary coding, research, writing or document tasks.

Implementation: [interface](../../src/main.tsx), [browser checks](../../scripts/browser-check.ts).
