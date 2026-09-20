# Workflow patch for 0.1.2

The patch addresses follow-up requirements, stalled preparation and incomplete
checks. It also accepts valid mixed-precision Jev probabilities. The implementation
decision and tradeoffs are in [ADR 0015](adr/0015-task-revisions-and-bounded-checks.md).

## User-visible changes

- Follow-ups preserve earlier results and relevant requirements. An explicit
  change of output format can retire the old file requirement. Uncertain changes
  retain the requirement and explain why verification is incomplete.
- While preparation waits, the task shows the step in progress. Account refresh
  has a 20-second limit; setup, attachments and project reads have 30 seconds;
  the complete Jev selection phase has 15 seconds. Individual Jev requests retain
  their existing limits. Worker startup has 60 seconds, ending when a session,
  message, tool request or API execution begins. Verification has three minutes.
  These are separate phase limits, not a promise about total task duration.
- A coding label alone no longer requires a test command. Source changes and
  requested software repairs still require executable checks.
- **Retry checks** appears inside incomplete check details. It checks saved files
  and reruns the review without asking a worker to redo the task. Changed files
  require a follow-up. Review usage remains part of the task's total.

## Verification scope

Automated tests use disposable project folders and synthetic Jev and worker
responses. They exercise the real engine, store, file tools, requirement receipts
and review path. Coverage includes retained tests, explicit format changes,
ambiguous requirements, late health responses, stalled setup reads, late worker
callbacks, economical routing fallback, cancelled reviews, review timeouts,
review-only restart/resume, changed-file rejection and cumulative usage.

The browser check uses the real interface and temporary files. The Retry checks
case asserts that the review adds usage without adding another route, worker
attempt or artifact write. Native document and sandbox checks run on the
development Mac. No new live model calls or benchmark runs are part of this patch.

Local checks passed: **182 automated tests**, **15 browser workflows**, **9 Mac
sandbox checks**, TypeScript, the production build and the **80-case evaluation
corpus**. The signed package passed **12 standalone checks**. The
[distribution receipt](evidence/distribution-0.1.2-verification.json) records
notarization, package contents and the credential audit. The corpus check makes
no model calls and measures no efficiency.

## Remaining limits

Synthetic requirement judgments test the integration and enforcement; they do not
establish how accurately Jev interprets real follow-ups. The original live stall
was not conclusively diagnosed. These changes bound the known wait paths and test
recovery without claiming that its specific cause was reproduced.

Visual review still needs appropriate image evidence. Missing provider capacity
or executable tests can still leave checks incomplete. OpenRouter live completion,
a second physical Mac, comparative efficiency and multi-day reliability remain
outside the verified scope.
