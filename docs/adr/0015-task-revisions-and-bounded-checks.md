# ADR 0015: Preserve task requirements and bound incomplete operations

Status: implemented for 0.1.2. Recorded September 20, 2026.

## Context

A follow-up could change the requested output while verification still required
the original format. Preparation could wait on an account or filesystem read
without a task-level deadline. A broad coding classification required tests even
for a literal text-file task. Retrying an incomplete review required running the
worker again.

## Decision

Record each follow-up as a new revision. Preserve the prior request, requirements,
result, checks and checkpoint in the event history. Put the latest request first
in the worker and judge context. Retain applicable file and test requirements.
Jev may retire an explicit requirement only when it selects “superseded” with
at least 0.95 reported probability. Uncertain, unavailable or truncated judgments
retain the requirement and leave the review incomplete. The cutoff is a policy
choice, not a calibrated guarantee. Changed requests do not become comparable
quality or efficiency observations for the original task.

Inspect files produced in the current revision and retained required files.
Earlier artifacts remain in the history. Require executable checks for source
changes, writable shell work, explicitly requested software repairs, or an
explicit test command. A coding label alone is insufficient. Missing test access
or a missing command remains an incomplete check, not a successful test.

Bound account refresh, setup and attachment reads, project context, Jev selection,
worker startup and verification. Record the phase and elapsed time. Cancellation
releases the queue even if a dependency ignores its abort signal. Fence later
callbacks, file publication, setup snapshots and verdicts so that a late response
cannot resume a stopped task. File writes use a temporary file followed by rename.
An operation already committed before cancellation remains in the evidence;
cancellation cannot undo a completed external effect.

Add **Retry checks** for a saved result with incomplete checks. It queues only
verification, including read-only tests and Jev review. It does not route or start
a worker. Check the saved requirement key and file hashes before and after the
retry. Changed files require a follow-up. Preserve every review receipt and count
the additional usage. A retry is one observation for the task, not another sample.
Legacy or incomplete evidence can be inspected again but cannot establish a new
comparable learning sample. Restart and resume preserve the review-only operation.

Accept mixed-precision Jev distributions using a rounding interval for each
two-decimal value and a small floating-point tolerance for more precise values.
Retain the raw reported probabilities. Advance review policy to v4 and routing
policy to v10 so earlier verification behavior remains distinguishable.

## Alternatives and costs

Dropping every old requirement would make refinements lose regression checks.
Keeping every requirement forever would make explicit changes of goal impossible.
Asking users to maintain a checklist for each follow-up would add routine setup
work. The typed reconciliation adds a small Jev request when explicit earlier
requirements exist; ambiguous changes still need clarification.

Racing a deadline cannot terminate every filesystem call. Abort propagation and
guards before publication prevent late state changes; OS operations already in
progress may finish in the background. Provider requests already sent may consume
usage, so unresolved reservations stay visible.

Review retries do not supply missing visual evidence, invent a test suite, or
remove unavailable API capacity. A text review still cannot establish visual
layout quality. Repeated requests must not turn unknown usage into zero cost.

## Evidence and revisit conditions

The [workflow verification record](../WORKFLOW_PATCH.md) distinguishes local
regressions and browser checks from live model judgments. Revisit follow-up
reconciliation after representative live cases and the held-out benchmark.
Resource savings remain unmeasured.
