# ADR 0009: Import reviewed setups by Link or Copy

Status: implemented. Recorded during the September 2026 release pass.

## Context

Users may already have project instructions, agent definitions, skills, a voice
guide and personal operating context. Re-entering those preferences is needless
work. Different users want either a shared source of truth or an independent copy.

## Decision

Preview supported files from a user-selected folder and import only the reviewed
selection. Offer Link for following source changes and Copy for independent
contents. Apply setups at the chosen scope and capture a task snapshot so the
instructions used by a run remain inspectable.

Treat imported agent definitions as instructions in 0.1. Do not execute setup
scripts, install tools, copy credentials or grant access just because a document
requests it. Keep imported setup content with the worker; Jev receives bounded
task evidence rather than the setup library. Output may quote that guidance,
so it is not an absolute guarantee against indirect disclosure.

## Alternatives and consequences

Copy-only import becomes stale. Link-only import prevents independent use and
breaks when original files move. Automatically importing a whole home directory
would include unrelated and sensitive material.

Links require freshness and missing-file handling. Copies need explicit updates.
Neither mode establishes compatibility with every feature of the source app.
Portable exports should contain reviewed setup content without machine-specific
paths, secrets or executable authority.

Implementation and checks: [import guide](../SETUP_IMPORT.md),
[importer](../../server/setup-import.ts), [tests](../../tests/setup-import.test.ts).
