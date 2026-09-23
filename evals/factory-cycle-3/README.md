# Factory cycle 3: bounded development evaluation

Frozen before live execution on September 23, 2026. These two invented cases are development probes, not held-out benchmarks. They test a small code task and a concise ownership/status file through the real DUKE engine and task verification path. All necessary context is local. No runtime behavior or model policy changes are part of this cycle.

## Predeclared protocol

Run each case once with `--factory-cycle-3 --case CASE_ID --mode jev`, sequentially, in a fresh isolated state and output directory per case. Jev chooses the initial GPT-6 Luna, Sol, or Astra route and supported effort from the existing roster. Keep the runner's $0.03 Jev state cap, eight-minute task timeout, two-recovery maximum, and medium recovery-effort ceiling. Approvals are denied. There is no injected failure, forced route, retry to improve a result, live web source, or external write. Check the shared live budget and account weekly usage before each dispatch; stop at the parent's 50% used threshold. Record any interruption without silently replacing a run.

The coding case has a fixed `node --test verify.mjs` verifier supplied before the worker runs. DUKE's scoped `verifyTask` executes it. The offline checker only checks hashes, output presence, and structure; it never executes worker code in the coordinator process. The status file has a frozen seven-part content rubric. Its structural checks do not establish factual or semantic acceptance. Have an independent reviewer read the output against the brief, blind to route and DUKE verdict where possible, and record reviewer identity and acceptance separately. DUKE automatic review is reported independently. Do not infer content acceptance from task completion or a DUKE review pass.

Every receipt includes corpus and case hashes, fixture hashes before/after, route/effort, attempts/events, DUKE review, usage, spending, and terminal status. Compare source commit and hashes before interpreting results. Count natural recovery only from actual recovery events. If no recovery occurs, report none observed; do not claim the recovery mechanism was validated. Account usage movement is not attributable task cost. Keep unresolved reservations and missing usage unknown. This tiny cohort supports diagnosis, not general model quality claims or threshold tuning.

Predeclared SHA-256 of `JSON.stringify(cases)`: `9776d9ec9c7fc33b46ce586f6c2892d1f022f060fc00bea54891ae10215c044d`. Individual case hashes are `444641741495760676917a2af142e1f0b1402954057794682d586e48b21698ae` (coding) and `873fe8d44c8da54e24109c4a25536dd734ba8ee14bf5db948bb9ae647cef2827` (status). The receipt also records SHA-256 for every input file; all must match the frozen fixture bytes afterward.

## Gated run template

Run from the repository root after committing a clean fixture/harness revision. Use the existing auth source without opening its secrets. Each command requires its own empty state and output paths. Supply the current verified Jev input price and invoke the existing shared budget gate around each command.

```sh
node --import tsx scripts/evals/run-gpt6.ts --run --factory-cycle-3 --case coding-bag-counts --mode jev --state-dir "$CODE_STATE" --out "$CODE_OUT" --auth-source "$AUTH_SOURCE" --jev-input-price "$VERIFIED_JEV_INPUT_PRICE"
node --import tsx scripts/evals/run-gpt6.ts --run --factory-cycle-3 --case ownership-status --mode jev --state-dir "$STATUS_STATE" --out "$STATUS_OUT" --auth-source "$AUTH_SOURCE" --jev-input-price "$VERIFIED_JEV_INPUT_PRICE"
```
