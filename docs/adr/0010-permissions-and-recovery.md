# ADR 0010: Keep authority and recovery in the local harness

Status: implemented with bounded coverage. Recorded during the September 2026 release pass.

## Context

A worker may change, fail, lose its connection or stop after an external action.
Retrying the whole prompt without state can repeat actions or lose the distinction
between something requested and something confirmed.

## Decision

Scope file tools to the selected project, exclude credential/state paths and
reject symlink traversal. Retain prior file versions. Run shell commands in an
OS sandbox with no network access; workspace writes require approval. Keep
browser actions isolated and approve clicks/fills against the captured action.

Persist task events, approvals, an external-action ledger, usage and checkpoints
in local SQLite. Use bounded recovery. Preserve uncertain external effects for
review rather than automatically repeating them. After a process interruption,
require explicit resume. Run one task at a time in 0.1.

## Alternatives and consequences

Provider-only approvals differ across workers. Unrestricted shell access makes
the simplest implementation but broadens task authority. Automatic replay after
a crash can duplicate an external write. Running many tasks concurrently would
complicate file ownership, spending reservations and recovery.

These controls reduce scope; they do not prove arbitrary generated code safe.
Network-dependent package installation and unsupported operations can require
work outside DUKE. Receipts prove the events captured by the harness, not every
possible side effect. Adversarial tests and native sandbox checks remain part of
release validation.

Implementation: [approvals](../../server/approval.ts), [paths](../../server/paths.ts),
[engine](../../server/engine.ts), [security boundaries](../../SECURITY.md).
