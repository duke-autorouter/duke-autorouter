# Saved-file measurement and a successful controlled repair

The fresh Linden control passed on GPT-6 Luna at Low effort. DUKE detected the planted nine-word draft, Jev approved one same-effort correction, and Luna saved a 102-word update within the requested 85–105 range. Luna called `count_words` before finishing. The tool count and file hash matched final verifier evidence. Jev's automatic review passed; the Astra coordinator separately accepted the factual content against the fictional brief.

## What changed

The earlier Hazel repair claimed “100 words” but produced 121 against a 90–110 range. Its transcript showed reads and a rewrite without measurement. The failed count and range were available in DUKE's correction prompt assembly. The missing executable measurement was a plausible contributor, not a proven sole cause.

Workers now receive a read-only `count_words` tool under the existing files capability. It measures complete saved text or Markdown using the verifier's convention and returns a count and file hash, never a task verdict. Headings count; Markdown formatting and link destinations do not. Partial text, unsupported formats and HTML/entity-bearing text are rejected. The default writing skill and correction feedback ask workers to measure, revise within their existing tool budget, and measure again when needed. No shell permission, new setting, model promotion, extra retry or confidence-threshold change is involved. Toolchain policy is v3 and recovery policy v4.

## What this run establishes

The [protocol](../evals/factory-cycle-3/MEASUREMENT_CONTROL.md) was frozen at `658cffe` before calls. A new isolated project received one planted short draft and a forced initial Luna Low route. The recovery judgment and subsequent worker execution were live. Jev selected correction at probability 1 under the unchanged 0.8 gate. There was one real worker attempt, one saved rewrite and one measurement. The rewrite was already in range, so this run does not establish repeated revise-after-measure behavior within an attempt.

The output preserves the completed checklist, Ada's pending inventory and October 8 deadline, the unassigned and undated briefing, and the undecided opening. No cafe session has begun. The final sentence proposes revisiting the decision; it does not report a new approval. The source brief remained byte-identical. The coordinator read the artifact before inspecting route and verdict details, but this was not an external blinded review.

Actual Jev spending was **$0.000382**, settled under the existing shared $1 cap. The worker reported 71,551 tokens, including 53,248 cached input tokens. Account weekly usage displayed 45% before and after; rounded account movement cannot establish task-level subscription cost. No model comparison or savings percentage is claimed.

The [sanitized receipt and output](evidence/worker-measurement-20260923/results.json) preserve the measurement, judgments and tool sequence. Account metadata and internal input digests are omitted; the raw receipt remains private. The prior failed Hazel repair remains failed. This is one successful controlled recovery, not an estimated general repair rate or proof that the tool alone caused success.

## Source and package status

Source validation passed 263 Mac tests, TypeScript and the production build. Focused checks cover capability and path boundaries, incomplete text, unsupported syntax, count parity and original-byte hashing (including UTF-8 BOM). The installed and downloadable app remains **0.1.12** and does not include this new tool. A future package must repeat the normal distribution checks.
