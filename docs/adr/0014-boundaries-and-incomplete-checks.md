# ADR 0014: Enforce network boundaries before contact and keep runner limits neutral

Status: implemented in 0.1.1. Recorded September 20, 2026.

## Context

An adversarial review of the public 0.1.0 source found that a browser redirect
could bypass the request guard. It also found that execution limits could become
failed quality observations, rounded Jev responses could be rejected, and sparse
failure history could disable the configured economical fallback.

## Decision

Put browser connections through a task-scoped HTTPS proxy. Resolve and validate
the destination before connecting, dial the validated IP, and disable Chromium's
implicit loopback bypass. Check every page redirect through CDP Fetch, including
the method and approved origin. Keep final-URL checks as a second check before
returning content. Block WebSockets and service workers.

Give subprocess results explicit execution states. Timeouts, output limits,
interruptions and unavailable runners leave verification incomplete. A sandbox
startup marker distinguishes a launcher failure from a real command exit,
including exit 126. The outer runner reserves enough space for the inner result's
JSON escaping. Keep missing and corrupt deliverables as failures.

Accept Jev probability distributions that could result from two-decimal rounding.
Preserve the reported numbers for review thresholds and receipts. Exempt the
economical outage fallback from automatic quality-history exclusions while
retaining user-declared quality, tools, project, account and budget checks. A
worker that failed the current attempt remains excluded from recovery.

Advance review and routing policy versions. Preserve earlier task records, but
do not mix their potentially misclassified outcomes into the corrected history.

## Alternatives and costs

A URL check after navigation cannot undo contact with a private endpoint. Turning
off the browser would remove a supported research tool. The proxy preserves
normal public redirects, cookies and end-to-end TLS, at the cost of another local
socket and browser-specific interception code.

Scoring every incomplete command as a failure is simple but rewards or penalizes
models for the test environment. Treating every nonzero exit as incomplete would
hide real test failures. Typed runner results preserve that distinction.

Renormalizing probabilities can move a below-threshold verdict across the cutoff.
Rounding intervals avoid that change. Letting automatic history disable the
fallback can stop work on very little evidence; keeping it available can spend a
small amount on a worker that fails again. The configured fallback and bounded
recovery make that tradeoff explicit.

## Evidence and revisit conditions

The [review response](../ADVERSARIAL_REVIEW_20260920.md) records executed checks.
Revisit the network boundary when adding authenticated browsing, WebSockets or
another browser engine. Revisit learning thresholds after independent benchmarks
measure quality and total resource use on representative tasks.

This supplements [ADR 0002](0002-efficient-routing.md),
[ADR 0003](0003-verification-and-learning.md),
[ADR 0010](0010-permissions-and-recovery.md), and
[ADR 0013](0013-review-probability-threshold.md).
