# ADR 0001: Own the task and share tools across workers

Status: accepted. Recorded September 20, 2026. Tool repairs pass local and
packaged Codex/Claude checks; final installed and OpenRouter live checks remain.

## Context

A task can move between Codex, Claude and an OpenRouter model. Its project,
permissions, files, approvals, checkpoint and usage must remain understandable
when the provider changes.

## Decision

DUKE owns the task state and exposes a shared tool service. Codex receives dynamic
tools, Claude receives them through MCP, and OpenRouter uses tool calls. Native
worker environments are isolated. DUKE keeps the project and action receipts.

## Alternatives

Keeping each provider's full native tool environment would provide more features
immediately, but would require separate permission, recovery and evidence handling
for each provider. Limiting the app to one provider would reduce that complexity
while losing the central routing use case.

## Consequences

The shared layer gives consistent action boundaries and makes cross-provider
tests possible. It also makes DUKE responsible for useful default tools. Bundling
a provider runtime does not bundle the provider app's complete workflows.

The first document acceptance run exposed that cost: DUKE's generator wrote raw
Markdown into valid Word and PDF files. This was a harness defect. The release
must close the [tool audit](../TOOL_AUDIT.md), including input handling and output
inspection, before describing these workflows as ready.

Revisit this choice if maintaining basic tool parity takes more effort than
adapting mature provider-native tools while preserving equivalent boundaries.
