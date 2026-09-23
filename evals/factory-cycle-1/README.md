# Factory cycle 1: fresh development comparison

Frozen before live execution on September 23, 2026. This is four development cases, not a held-out benchmark or a population estimate. Runtime starts at 0.1.11 (`a2b8d7f`). No product thresholds or policies change during this cycle.

## Question and boundaries

Does automatic Jev model/effort selection achieve independently acceptable work at lower whole-task cost than fixed Astra medium, and does it add useful quality or recovery behavior over fixed Luna low? Both comparisons matter. Choosing Luna can save against Astra even if routing adds no value over fixed Luna on these particular tasks.

Four fresh cases cover coding, writing, supplied-source research synthesis, and an actual Word document. All material is invented and supplied locally. Research does not test web retrieval. Each brief gives necessary context, allowed tools, outputs and acceptance requirements. No hidden semantic requirement may be added after seeing outputs. The corpus is public development material; it must never later be described as held out.

Run each case once in each policy, sequentially, with a new isolated state per case. Rotate order: coding Luna/automatic/Astra; writing automatic/Astra/Luna; research Astra/Luna/automatic; documents Luna/Astra/automatic. There is no controlled failure injection and no selective rerun of disappointing results. Infrastructure interruptions remain reported, with any replacement run separately labeled.

Automatic roster: GPT-6 Luna, Sol and Astra, default provider profiles, no invented manual quality scores or difficulty ceilings. Fixed policies keep the specified model and effort. All share DUKE core skills/tools, Jev review, two-recovery maximum and medium recovery-effort ceiling. Automatic selection can choose its initial supported effort; the ceiling applies to recovery, not an initial-effort cap. Report this policy difference. Each task has an eight-minute bound. Approvals default to deny; no external writes. Installed app state is never the test database.

## Resources and stopping

The existing shared $1 API cap remains in force, including previous spending and unresolved reservations. Reserve $0.03 per case through the existing lock and ledger; per-state Jev cap is also $0.03. Codex subscription work is sequential. Check weekly account usage before each case and stop new dispatches at 50% used, preserving 50% remaining. Initial snapshot is 38% used. Account-wide movement includes this coordinator and other tasks; it is not an attributable task charge. Do not redeem credits. No scheduled loop, release packaging, or publication of a new app is part of this cycle.

## Acceptance and economics

Hash briefs and frozen verifiers before/after. Save all attempts, reviews, recovery decisions, route/effort, terminal status, actual Jev charges, unresolved reservations, worker token categories and elapsed time. A passing test checks only its stated requirements; it does not certify arbitrary prose or documents. Worker-produced code is not executed in the coordinator's unrestricted process.

Prepare randomly labeled output packets with the original brief and frozen rubric but without model, route, cost or Jev verdict. Independent semantic review must be separate from Jev. If an independent reviewer is unavailable, publish acceptance as pending, never silently substitute Jev. Record reviewer identity and whether blinding succeeded. Word files need native inspection and rendered-layout review; file existence alone is insufficient.

Use the dated, verified model-specific prices in `docs/evidence/model-prices-20260923.json`, including cached input and output, for subscription API-equivalent estimates. Jev input is $0.042/million on the provider's [published rate](https://typesafe.ai/blog/introducing-system-one-models-and-jev). These are not subscription invoices or precise allowance savings. Include all retries/reviews and failed cases. Report total cost, accepted counts, and cost per accepted output (undefined if zero accepted). Unresolved or missing usage stays unknown. Report initial choices separately from fallback choices.

## Improvement gate

First classify observed discrepancies: missing context, tool/infrastructure failure, worker quality, routing/effort choice, or review error. A concrete defect can justify one narrow economical-worker correction after review. Keep these cases as regressions, add fresh validation, and never tune a threshold just to pass this sample. No change is merged solely because the same model judges its own work successful. Preserve explicit user ceilings, cheap outage fallback, provenance boundaries and approval rules.

## Run

Use `scripts/evals/run-gpt6.ts --factory-cycle-1 --case CASE_ID` with its normal `--run`, mode, fresh state/output, auth source and verified Jev input price arguments, under `scripts/with-live-budget-gate.ts`. Missing `--run` makes no provider calls. The receipt hashes the full corpus and individual case.
