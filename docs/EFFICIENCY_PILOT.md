# Efficiency pilot

> Historical run preserved unchanged. The later symmetric-review, model-priced
> comparison is reported in [Corrected cost efficiency pilot](COST_EFFICIENCY_PILOT_20260920.md).
> The original 4/4 vs 3/4 vs 3/4 quality conclusions below remain valid for these
> original runs; raw token totals are not treated as model-specific cost.

Status: complete for four matched development cases. This is not a held-out release comparison.

## Outcome

The economical modes did not match the observed strong baseline quality on this case set.

| Mode | Actual worker route | Accepted | Critical failures | Reported tokens | Latency | Settled API |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Strong | Astra Medium for all four cases | 4/4 | 0 | 372,968 | 156.645 s | $0 |
| Rules | Luna Low for all four cases | 3/4 | 1 | 373,466 | 167.651 s | $0 |
| Jev | Luna Low for coding; Sol Low for research; Luna Low fallback for writing; Sol Low for documents | 3/4 | 1 | 536,923 | 152.746 s | $0.001734 |

Rules produced essentially the same token volume as strong (+498, about +0.13%) and took 11.006 seconds longer, but its document artifact failed because it invented ownership and planning commitments. Jev was 3.899 seconds faster than strong, but it used 163,955 more reported tokens (about +44.0%), incurred the only efficiency-task API charge, and its writing artifact lacked a measurable finish line. Because both economical modes had a critical failure, no savings claim is accepted.

## Frozen design and execution

- Release base: `v0.1.2` at `bcc9ab0ac67d3f18576f8416eef53726c4f4fa77`.
- Tested harness: clean commit `270d1d0d4e04dcdfac1376894accc33d9dfa2e02` on `validation/efficiency-pilot-20260920`.
- Cases: `coding-unique`, `research-sqlite-wal`, `writing-brief`, and `documents-handoff-docx` from the development split. Held-out cases were not run.
- Frozen roster: `codex:gpt-6-astra`, `codex:gpt-5.6-sol`, and `codex:gpt-5.6-luna`. The disposable Claude profile was not signed in, so Claude was excluded as unavailable capacity and was never counted as free.
- All 12 task runs used isolated disposable profiles with the same profile, corpus, case-set, policy, toolchain, and core-skill hashes.
- Every task was marked as evaluation work, so the runs did not train normal routing history.
- All runs held the shared OS lock and ledger reservation; there was no workflow/efficiency provider overlap.
- No OpenRouter worker was used.

## Independent review

Codex Sol at Medium evaluated the artifacts without using Jev's verdict as the benchmark decision. Deterministic checks reran all coding fixtures and confirmed the verification-file hash. Every research citation was reopened from official SQLite documentation. One frozen Unicode word tokenizer counted the writing outputs. Every DOCX page was rendered and visually inspected.

Random UUID receipt-key copies were used for the final cross-mode content and render pass. This was only partial blinding because strong and rules identities had already been exposed during deterministic checks. The evaluator is also a Codex model, so it is independent of Jev's decisions but not independent of Codex as a provider.

Review findings:

- Strong: all four accepted. Its DOCX had a non-critical layout defect: a source line was orphaned onto a nearly empty second page.
- Rules: coding, research, and writing accepted. The DOCX failed critically because it invented `Status: Planning`, assigned Ana ownership of the decision, labeled kickoff/review `Planned`, and visually associated the unowned participant trial with Sam.
- Jev: coding, research, and documents accepted. The 150-word writing artifact failed critically because its finish line only restated existing tests/documentation and vague readiness rather than defining a measurable completion criterion. The DOCX had one non-critical misleading table association between Sam and the unowned participant trial.

## Resource accounting

All modes had four worker attempts, four stages, zero retries, complete token reports, unchanged fixtures, and zero unresolved reservations.

- Strong: 372,968 Codex subscription tokens, all worker-role. The account-window receipt stayed at 5% within each case.
- Rules: 373,466 Codex subscription tokens, all worker-role. The account-window receipt stayed at 6% within each case.
- Jev: 494,240 Codex worker tokens plus 42,683 Jev tokens: 25,763 routing and 16,920 review. The account-window receipt stayed at 6% within each case. Jev API spend settled at $0.001734.
- The shared ledger and reconciled workflow receipt agree on $0.003224 settled across workflow and efficiency work, with every reservation settled and uncertainty at $0, against the approved $1 combined cap.

The subscription percentages are coarse account-window observations, not task-attributed debits. Zero change inside a case can reflect rounding or delayed updates, and the shift from 5% to 6% between modes cannot be attributed to this pilot. Therefore, no account-quota savings claim is made.

The $0 API figures for strong and rules are supported by provider events, zero metered requests, zero unresolved requests, and the reconciled ledger; they are not inferred from missing telemetry. Worker execution used connected Codex subscription runtimes. Jev's nonzero spend covers its metered routing/review calls.

## Deviation and interpretation limits

The frozen plan expected Jev review evidence in strong mode, but the explicit-model diagnostic path left automatic content review inactive. Strong and rules therefore recorded zero routing/review tokens, while Jev recorded both routing and review overhead. Independent review was applied equally after the run, but the live token comparison cannot isolate Jev routing cost from Jev review cost.

These four development cases reveal two concrete quality failures and show no accepted efficiency advantage for either economical mode as executed. They do not establish general model quality, general savings, calibrated routing, production readiness, account-attributed quota savings, or the held-out release threshold.
