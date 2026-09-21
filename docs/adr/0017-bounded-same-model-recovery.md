# 0017 — Retry reasoning failures on the same model within explicit limits

Date: 2026-09-21
Status: Accepted; extended by [0020](0020-bounded-correction-before-effort-escalation.md), which adds a bounded same-effort correction before escalation.

## Context

The development pilot showed that a failed Luna Low document task could succeed at Medium. The earlier engine excluded the entire model after a failed check and raised the difficulty floor, making this repair impossible. The manual repair result did not establish that DUKE could identify or repair failures automatically.

## Decision

After a failed verification, Jev chooses among a repairable reasoning error, missing user context, a tool/environment failure, and unknown. The selected probability must reach 0.9. The gate uses the selected probability, not distribution confidence. Evidence and results remain untrusted data.

Only a reasoning verdict permits automatic quality repair. DUKE advances one provider-advertised effort step on the same model. The default ceiling is Medium; the existing retry cap is two. Both controls are exposed under advanced routing options. An explicit task effort override stays fixed. A model without an advertised next effort cannot be escalated.

Before dispatch, DUKE rechecks the enabled roster, project permissions, tools, account capacity, API budget, effort support, declared quality and current recovery settings. Recovery cannot select a different model. A worker failure during the repair pauses the task instead of switching models. Existing initial worker-availability recovery remains separate from quality repair.

Missing context and tool failures pause with the saved work and neutral quality evidence. Uncertain diagnoses pause. Incomplete reviews do not trigger a worker retry. Cancellation fences late decisions. Reviewed-file hashes are checked around diagnosis, and the next worker receives the original requirements, failed checks, checkpoint and external-action ledger.

Every attempt and diagnosis remains in usage and event receipts. Routing policy v11 and review policy v5 separate the changed recovery and attribution rules from older evidence. Recovery controls participate in execution identity.

## Alternatives and consequences

Always selecting a larger model would spend more without distinguishing missing facts or broken tools. Always increasing effort would have the same problem. A one-rung retry after a narrow diagnosis keeps automatic repair bounded and visible.

This policy will miss mistakes the reviewer does not detect. The 0.9 diagnosis threshold is a conservative policy choice, not a calibrated success probability. A successful controlled repair proves that path works for that fixture; fresh natural tasks and independent acceptance are still required to assess usefulness.

## Live evidence

The [frozen development comparison](../AUTOMATIC_RECOVERY_VALIDATION_20260921.md)
records a successful controlled Low-to-Medium correction, an incomplete final
review, and a natural document error that did not trigger repair. Three automatic
outputs and four Astra Medium outputs were independently accepted. The detection
limit remains; the policy was not changed after seeing these results.
