# 0020: Correct at unchanged effort before escalating

Status: Accepted, September 21, 2026. Extends [0017](0017-bounded-same-model-recovery.md).

## Context

The original ownership-error probe detected a defect but blocked because Jev did not reach the confidence required to increase reasoning effort. A targeted correction using existing source facts is a different action from increasing effort.

## Decision

After a failed review, Jev first decides whether the available evidence supports one targeted correction on the same model at unchanged effort. It must select correction with probability at least 0.80. Missing essential context, unavailable tools and uncertain judgments do not authorize correction. The worker receives bounded failed-check details alongside the original requirements and source context. It must preserve unrelated correct content and may not weaken requirements, supplied sources or tests.

One correction may start per unchanged task input and revision, including across resumes. It consumes the existing retry allowance; it is not an extra attempt outside the limit. Before dispatch, model eligibility, effort support, permissions, capacity and limits are checked again. Explicit effort overrides stay fixed. Provider-default effort is preserved only while the provider still advertises no effort control.

If that attempt produces another failed review, the existing reasoning-cause decision can authorize one higher supported effort at probability 0.90, subject to the effort ceiling and remaining retry allowance. A different model is never silently selected for quality repair. Incomplete checks do not trigger correction or escalation.

Recovery policy v3 and routing policy v13 identify this behavior. Every decision and worker attempt remains in usage accounting. A persisted correction-start event prevents repeated unchanged-effort corrections on an unchanged task after resume.

## Alternatives and tradeoffs

Always increasing effort spends more before testing whether specific feedback is enough. Applying the same 0.90 gate to both actions reproduced the original block on a deterministic assertion failure. Version v2 retained that gate in the first development runs; v3 uses the established 0.80 review threshold for the lower-cost bounded attempt and leaves escalation at 0.90.

The thresholds are policy choices, not calibrated success probabilities. A correction can waste an attempt or introduce a new error. Original requirements and fresh verification remain necessary. No correction policy repairs defects the reviewer misses. The validation report retains a false arithmetic acceptance, the blocked PDF, and all calibration runs rather than treating a later success as a replacement.
