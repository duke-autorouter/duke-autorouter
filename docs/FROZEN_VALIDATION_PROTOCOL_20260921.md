# Frozen 0.1.6 validation

Frozen before provider calls on September 21, 2026. Runtime source is release
`ab25b6e5105fdd2d175657883bd24f5939fa768f`: routing v11, review v6, focused review v5,
recovery v1. This protocol adds evaluation code and fixtures only. The runtime,
thresholds, tools, skills and worker prompts stay unchanged for every phase.

## Order and acceptance

1. **Controlled ownership repair.** Inject the original, unchanged fictional
   Harbor PDF and an initial Luna Low route with zero first-worker inference.
   Record a real input read. Let the released engine run live Jev detection,
   diagnosis, any permitted real worker repair and recheck without intervention.
   Inspect the final PDF against the original brief. A complete success requires
   detection of the unsupported internal-workshop ownership, same-model effort
   increase within Medium, corrected independently acceptable content and a
   recorded final recheck. Report incomplete final checks separately. A failure
   to trigger repair is a result; do not repeat until it passes. This probe is
   excluded from routing quality and natural-task cost comparisons.
2. **New fixed-artifact review sample.** Six correct/flawed pairs cover ownership,
   arithmetic, conditional dates, survey attribution, labeled proposals and
   required sections. Two separate cases cover unavailable source material and
   an explicitly unknown date. Expected verdicts are fixture labels, never input
   to Jev. Run each once. Report detected defects, missed defects, false failures,
   passes and incomplete checks separately. These examples were authored after
   the release freeze and do not modify the earlier 40-case held-out corpus.
   They are a small post-release sample, not a calibrated accuracy estimate.
3. **Natural-task cost comparison.** Run four new complete-context tasks: CSV
   encoding, primary-source research on composed abort signals, a volunteer
   update email, and a one-page museum status PDF. Run automatic routing first,
   then fixed Astra Medium with the same task text, files, tools, skills and
   review policy. Use fresh profiles and workspaces for each condition, with no
   carried-over learning. Retain all attempts and failures. No manual repair or
   rewording after results. A task may be independently acceptable while Jev's
   checks remain incomplete; keep those two outcomes separate.

## Controls and measurement

The roster is Codex Luna, Sol and Astra. Claude and OpenRouter workers are outside
this comparison. Automatic routing uses Jev with Luna as the economical fallback,
at most two recoveries and a Medium effort ceiling. Fixed Astra uses an explicit
Medium override, which remains fixed under the released policy. Both conditions
receive the same Jev content review. This compares complete policies, not identical
worker effort or an isolated causal effect of Jev selection.

Benchmark tasks do not train normal routing history. Headless approval requests
are denied. Scoped file tools, artifact creation, read-only checks and public-source
reads remain available. Each task has a 20-minute harness cancellation limit;
released phase and inactivity limits still apply. No installed user state is used.
Authentication is copied into a private disposable profile and removed afterward.

Acceptance is judged from artifacts and the fixed rubrics, separately from the
worker and Jev. The evaluator is not blinded. Independently rerun the original
coding assertions and additional edge cases; inspect research against the opened
primary sources, count and assess the writing output, and inspect PDF text and
rendered pages. If a fixture itself is faulty, report it and preserve the result;
do not silently replace it.

Primary economics are total model-priced worker usage plus recorded Jev API cost
per independently acceptable result. Include routing, review, retries, failed
outputs and incomplete outcomes in the numerator. Use the frozen September 20
pricing scenario in `evals/cost-efficiency-pilot-plan.json` for comparability. This
is an API-equivalent scenario for subscription workers, not an actual subscription
bill or a claim that those rates are current. Report input/cache/output tokens
at their distinct model prices. Missing usage prevents a complete savings claim.
Account-wide subscription observations remain separate, since concurrent use and
rounding prevent task-level allowance attribution. Offline evaluation work is
excluded equally from both conditions.

The original shared **$1 total API cap** stays in force. No new allowance.
Reserve $0.04 per phase through the original ledger and lock; each disposable
app has a $0.03 API limit. Preserve prior unresolved reservations. Count reported
Jev input tokens at the configured $0.042/million rate; costs are not invoice
reconciled. Failed or interrupted calls retain their uncertainty.

## Freeze and publication

The receipt records source, runtime tree, fixture, roster/profile, policy and
skill hashes, all review events, usage, attempt counts and artifact text/hashes.
The original seed PDF is stored in `evals/fixtures/ownership-probe`; its SHA-256 is
`4878f35ef80fa81b627285cf5b904a05089d8344e12ea6a178055c2c0d97f73d`.
Run with `scripts/run-frozen-validation.ts` through `scripts/with-live-budget-gate.ts`.
Publish sanitized results and limitations even when a phase does not succeed.
Any product fix requires a separate policy version, new tests and a new release;
these frozen results must remain attached to 0.1.6.
