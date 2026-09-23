# ADR 0027: Give workers the verifier's word measurement

Status: Accepted in source; not yet packaged.
Date: September 23, 2026.

## Decision

Expose saved-file word measurement as a read-only files tool, sharing counting and supported-text rules with the deterministic verifier. Return count, convention and original-byte hash, without certifying semantic quality. Add measure-and-revise guidance to the default writing skill and correction feedback. Retain existing tool budgets, recovery gates and model/effort rules.

## Reason and alternatives

A controlled Luna correction exceeded the requested range while claiming a guessed count. Requiring shell access to count would expand permissions for a routine writing check. Raising effort or selecting a stronger model before supplying measurement would spend more without addressing this missing capability. Worker self-report alone is insufficient; DUKE still rechecks the final artifact independently.

## Evidence and limits

The [fresh control](../WORKER_MEASUREMENT_20260923.md) repaired a planted short draft with Luna Low and passed measured and semantic checks. It used a new brief and is not a causal comparison or general reliability estimate. No repeated worker revision after an out-of-range measurement occurred. HTML, entities, large/partial text and non-text formats remain unsupported. Revisit when broader writing workflows require another well-defined counting convention.
