# GPT-6 two-task validation protocol (frozen before execution)

This small corpus has exactly two fictional tasks: a coding ledger and an internal workshop invitation. It is diagnostic, not a statistically representative benchmark. Inputs, expected files, verifier, and writing rubric are in `fixtures.ts`; their case hashes and corpus hash are saved in every receipt. There is no live result in this commit.

## Comparisons

Run the same two cases separately and sequentially in four modes: Jev automatic selection with only GPT-6 Luna, Sol, and Astra enabled; fixed Astra medium; fixed Luna low; and a **separate** controlled recovery probe using only the coding case. Explicit fixed-effort overrides keep effort fixed during recovery; automatic routing may raise effort within the medium ceiling. Same-effort correction is available under the shared recovery allowance. This is a comparison of those policies, not identical effective effort behavior.

The fixed models use the identical brief, local files, required tools, core skills, evaluation flag, review policy, and recovery settings. All modes have at most two recoveries and a medium recovery effort ceiling. Each task has an eight-minute timeout. The probe forces the first route to Luna low and substitutes an incorrect, zero-inference first artifact. It then returns to real Jev and worker behavior. Never combine probe usage or latency with natural efficiency numbers.

Coding acceptance is the frozen `node --test verify.mjs` command run by Duke's scoped verifier, plus a post-run SHA-256 check that both brief and verifier remain unchanged. Tests cover aggregation, input preservation, empty input, a prototype-like category, and invalid amounts. The independently saved verifier result and full events permit review of failures; the harness does not run worker-produced code in its own host process. Writing acceptance has deterministic file, length, subject, greeting, date, and reply checks, an unchanged-brief hash, and a frozen five-part human rubric. A reviewer must read the draft for factual fidelity, uncertainty, and tone before marking acceptance. Structural checks alone cannot establish writing quality.

The harness saves `results.json` before a task starts and after every poll. Each result retains all events, attempt-related events, route and effort, token usage, raw spending entries, settled API cost, and unresolved reservation count and amount. Error, cancellation, and timeout paths retain partial receipts. The copied Codex auth file is removed at final cleanup; task and spending evidence stays in the disposable state and output directories. Default approval is deny. No prices are built into the harness: supply a current verified Jev input price at run time. Preserve raw tokens for the parent to price after review; do not infer dollar savings from subscription tokens.

## Future execution, only after separate live authorization

From the repository root, with a *new empty* state and output directory for each mode:

```sh
node --import tsx scripts/evals/run-gpt6.ts --run --mode jev --state-dir /private/tmp/gpt6-jev-state --out /private/tmp/gpt6-jev-results --auth-source "$AUTH_SOURCE" --jev-input-price "$VERIFIED_JEV_INPUT_PRICE"
node --import tsx scripts/evals/run-gpt6.ts --run --mode astra-medium --state-dir /private/tmp/gpt6-astra-state --out /private/tmp/gpt6-astra-results --auth-source "$AUTH_SOURCE" --jev-input-price "$VERIFIED_JEV_INPUT_PRICE"
node --import tsx scripts/evals/run-gpt6.ts --run --mode luna-low --state-dir /private/tmp/gpt6-luna-state --out /private/tmp/gpt6-luna-results --auth-source "$AUTH_SOURCE" --jev-input-price "$VERIFIED_JEV_INPUT_PRICE"
node --import tsx scripts/evals/run-gpt6.ts --run --mode probe --state-dir /private/tmp/gpt6-probe-state --out /private/tmp/gpt6-probe-results --auth-source "$AUTH_SOURCE" --jev-input-price "$VERIFIED_JEV_INPUT_PRICE"
```

Use the parent's shared live budget gate around those commands. A `--run` flag, fresh directories, current auth source, and explicit Jev price are required. For each result, compare fixture hashes, verifier/review outcomes, attempts, routed model/effort, token counts, settled spend, unresolved reservations, and elapsed time. Report accepted-result counts alongside total and per-accepted-result costs; retain unsuccessful cases and do not claim equal quality when acceptance differs. Unreconciled spending prevents an exact cost comparison. All four runs are sequential; the separate probe does not enter the two-task efficiency comparison.

## Pricing a completed run

```sh
python3 scripts/evals/summarize-gpt6.py --results-root /path/to/all-mode-results --prices docs/evidence/model-prices-20260923.json --out /path/to/priced-results.json
```

The summarizer requires final complete worker usage and refuses to price an attempt whose aggregate input exceeds 272K without further per-request inspection. It uses API-equivalent prices, keeps Jev's actual API spending separate, and excludes the probe from natural mode totals. See the [recorded development results](../../docs/GPT6_COMPARISON_20260923.md).
