# ADR 0004: Keep skills distinct from tools

Status: default skills implemented and package verified. Recorded September 20, 2026.

## Context

Users expect familiar skills to carry across setups. A new user also needs useful
defaults without importing a personal instruction library or adjusting many toggles.

## Decision

Use **skills** for workflow instructions and **tools** for executable operations.
Package concise skills for the four core work types, with creation and verification
steps tied to actual tool capabilities. Preserve the user's instructions as the
higher authority. Skills cannot grant access or bypass an approval.

Imported setups retain their names and file types. Link follows reviewed source
files; Copy keeps independent contents. Each task captures a snapshot so an
external edit cannot silently change instructions midway through execution.
Imported agent definitions are instructions in this release, not spawned agents.

## Alternatives and consequences

Depending entirely on imported skills makes first use incomplete. A single large
system prompt consumes context and obscures which workflow applies. Renaming
skills to tools loses a useful, familiar distinction.

Skills help a worker choose and check actions, but cannot repair a defective
exporter or add a missing renderer. The package must include both the workflow
and the executable capability. Default skills must be reviewed when tool contracts
change, and their version must be visible in execution evidence.
