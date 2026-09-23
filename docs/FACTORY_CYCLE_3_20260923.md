# Factory cycle 3: worker output and review uncertainty

Two fresh, fully specified tasks ran once through DUKE with the PR19 parser correction. Jev selected **Sol Low for coding** and **Luna Low for the status file**. Both workers finished in one attempt. The coding output met its brief; the status file was too short. DUKE left both reviews unverified, and neither task entered recovery.

| Task | Independent content check | DUKE review | Natural recovery |
| --- | --- | --- | --- |
| Tag-count utility | Accepted; three fixed tests passed | Unverified | None |
| Ownership/status file | Rejected: 79 words against 90–130 | Unverified | None |

The word count uses whitespace-delimited tokens, including Markdown markers. Removing markers would make the file shorter, so the failure does not depend on whether headings count. Ownership, dates and pending/undecided facts matched the source. This is one missed constraint, not evidence that Luna cannot do the task or that escalation to a stronger model was necessary.

## What the checks show

The coding output creates a new plain object, counts special property names safely, preserves input and rejects nonstrings. Its three supplied tests passed inside DUKE's scoped verifier. The coordinator independently inspected the source against the brief. Both the brief and fixed verifier retained their original SHA-256 hashes. Jev passed the scoped test, behavior and completion checks, but remained uncertain about unchanged input files and the worker's compound final summary. The external hash comparison is not supplied as trusted execution provenance inside the current product review; it must not be treated as proof that arbitrary worker tests certify their own requirements.

The status output kept Nia's review and Omar's estimate distinct, left the walk-through unassigned and undated, and preserved the open decision. Its ownership checks passed. The length requirement remained uncertain rather than a confirmed failure, alongside broader review uncertainty. Because there was no confirmed failure, DUKE did not attempt repair. The saved task state is `completed` with review `unverified`; neither state is relabeled a verified success in this report.

The next narrow improvement should address deterministic constraint checking, starting with explicit word ranges on clearly identified text deliverables. Scope, counting rules and requirement provenance need to be explicit; quoted examples or source text must not become new requirements. A definite length failure could then enter existing bounded recovery judgment, without assuming a model or effort increase. Preserve this failed output as a regression and use fresh material for validation. Do not lower Jev's confidence threshold to force these examples through.

This cycle did not exercise recovery. It also does not establish routing savings: no fixed-model comparison was run. Both initial choices came from Jev rather than outage fallback. All three GPT-6 model families remained available, with existing effort and recovery rules unchanged.

## Evidence and resources

The [protocol](../evals/factory-cycle-3/README.md) and fixtures were committed before calls. The final pre-run commit was `18fdde3`; it strengthened the plain-object test before the first worker ran. Each case used a new isolated state, the real engine and file verifier, invented local sources, denied approvals, an eight-minute bound and two-recovery maximum. There were no forced failures, selective reruns or product runtime changes.

Independent content review was performed by the Astra coordinator, distinct from the Sol/Luna workers and Jev judge. Artifacts were read against the brief before inspecting each route and verdict. This was not an external blinded Opus review. The [receipt](evidence/factory-cycle-3-20260923/results.json) separates that assessment from automatic review, preserves all check probabilities, source hashes, usage and saved outputs.

Actual Jev charges were **$0.001802**, all settled under the unchanged shared $1 cap. Worker-reported totals were 72,879 tokens for code and 71,461 for the status file, including substantial cached context; these are not equal-cost units across models. Subscription windows observed 42% used before and after the coding attempt; account-wide window movement cannot establish the exact subscription cost of a task. No API-equivalent comparison or subscription savings percentage is claimed.

## Parser release status

PR19 is merged and tested in source. It keeps numbered requirements and literal ownership assignments intact before review, with updated review-policy versions. These runs add fresh worker evidence, but do not prove broad judge calibration. The installed app and downloadable release remain **0.1.11**, which does not contain PR19.

The parser correction is ready for the normal maintenance-release process: freeze versioned source and release notes; run Mac, bundle and secret checks; sign and notarize the immutable package; validate its assets and upgrade behavior; then publish. No threshold adjustment or broader routing redesign is required to package this correction. This evaluation cycle does not publish a new app. The earlier erroneous crop finding is withdrawn; full-document pagination and second-Mac validation remain separate limitations.
