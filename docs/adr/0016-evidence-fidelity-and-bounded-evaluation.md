# ADR 0016: Check evidence before increasing model effort

Status: evidence fixes and evaluation harness implemented for 0.1.4. Recorded September 21, 2026.

## Context

Two development tasks failed after Jev selected Luna Low. The research tool had
removed the formatting that marked obsolete source text. Word extraction had
flattened table boundaries for both worker self-checks and content review. The
worker also made an unsupported ownership association despite receiving the full
brief. Those findings do not support a single explanation based on model size.

## Decision

Preserve semantic revision markers in web text and row/cell boundaries in Word
text. Keep extraction limits explicit. These markers preserve source structure;
they are not instructions or proof that a statement is correct.

Run the same frozen development cases at the same model and effort after tool
repairs. Increase effort only when independent review still finds a material
worker error. Retain original outputs and charge every attempt to the diagnostic
cost calculation. Test separate fresh development cases before opening held-out
cases. Record whether independent reviewers know the condition.

Fixed-model runs bypass routing but keep the same Jev content review. Explicit
effort overrides must be supported by that model. This prevents a baseline from
silently avoiding review costs paid by the routed condition.

Compare model-priced input, cached input and output costs, including automatic
reviews and retries. Keep actual API charges and observable subscription usage
separate. Raw token totals cannot establish monetary or subscription savings.

## Alternatives and costs

Switching immediately to a larger model could hide a tool defect and consume more
resources. Retrying indefinitely at Low could waste resources without correcting
the error. A bounded sequence makes both failure and recovery costs visible.

Clean reruns do not prove that DUKE can detect the defect and choose the repair
without help. Operator judgment and offline evaluation are not free, and their
cost is not included in the worker/API proxy. A single successful repeat also
cannot establish a causal effect or a dependable success rate.

## Evidence and revisit conditions

See the [source audit](../SOURCE_FIDELITY_AUDIT.md) and
[diagnostic protocol](../FAILURE_AUDIT_AND_REPAIR_PROTOCOL_20260921.md).
The existing economical fallback and no-silent-premium-escalation rules remain in
force. Automatic defect detection and recovery need separate validation before
these diagnostic results can support an end-to-end efficiency claim.
