# Corrected cost efficiency pilot

Status: complete for four frozen development cases. Held-out cases were not run.

## Conclusion

The corrected comparison demonstrated a mechanism for reducing model-priced cost,
but did not demonstrate quality-preserving savings.

Jev selected GPT-5.6 Luna at Low effort for all four cases. Its combined cost proxy
was $0.039235, 97.2% below the known $1.421647 lower bound for fixed GPT-6 Astra at
Medium. Independent review accepted only two of the four Jev results and found two
critical failures. Both fixed Astra modes passed four of four.

| Mode | Accepted | Critical failures | Worker API-equivalent | Actual metered API | Combined proxy |
| --- | ---: | ---: | ---: | ---: | ---: |
| Astra Medium | 4/4 | 0 | $1.421090 | $0.000557 settled plus one unresolved request | $1.421647-$1.423100 |
| Astra Ultra | 4/4 | 0 | $1.757092 | $0.000618 | $1.757710 |
| Jev automatic | 2/4 | 2 | $0.037913 | $0.001322 | $0.039235 |

The Jev per-accepted-task result is not quality-matched to either baseline. It
cannot support a claim that Jev delivered the same work more cheaply.

## Quality findings

- Astra Medium and Astra Ultra passed coding, research, writing and document review.
- Jev coding passed.
- Jev research failed critically because it repeated obsolete large-transaction
  guidance that the current SQLite WAL documentation strikes out.
- Jev writing passed with a correction to make its finish line explicitly prospective.
- Jev's document failed critically because Sam's row was assigned the participant
  trial status even though the source assigned Sam only the sign-in sheet and named
  no owner for the trial.

The independent pass reran the frozen code fixture, opened SQLite primary sources,
counted and source-checked the writing, and rendered every DOCX page. The evaluator
was separate from the workers but not provider-independent, and mode identity was
visible. Automatic Jev verdicts were retained as evidence but were not the acceptance
decision.

## Accounting boundaries

Worker API-equivalent cost values observed Codex subscription tokens using the exact
model's dated Standard short-context API input, cached-input, cache-write and output
rates. It is a counterfactual comparison, not an API bill or subscription-dollar
estimate.

Actual metered API cost includes Jev routing and review only. Corrected runs settled
$0.002497 in known API charges. One failed Astra-Medium review request remains
unresolved. Its provider reservation was $0.001453; the private safety ledger retained
a more conservative $0.009766 under the unchanged $1 cap. Neither amount is presented
as settled cost.

Subscription-window readings remain separate. One visible percentage-point change
occurred during one Astra-Medium attempt; other observed attempts showed no visible
movement. These coarse, account-wide snapshots are not converted into dollars or
quota multipliers.

The pricing source was [OpenAI API pricing](https://developers.openai.com/api/docs/pricing/)
on 2026-09-20. OpenAI's qualitative [model guidance](https://learn.chatgpt.com/docs/models)
says higher effort uses more tokens, while its [Codex pricing guidance](https://learn.chatgpt.com/docs/pricing)
says smaller models can extend usage limits. Neither defines a numeric subscription conversion.

## Historical evidence

The original pilot remains unchanged: strong passed 4/4, rules 3/4, and Jev 3/4.
Repricing its preserved worker tokens produced $0.329064 per accepted task for strong,
$0.010966 for rules, and $0.165464 for Jev. The historical Jev proxy was 49.7% lower
than strong, but quality was not matched and fixed baselines lacked symmetric live Jev
review. It remains exploratory evidence.

## Interpretation limit and next investigation

These runs did not exercise a quality-recovery retry. Jev writing used three worker
stages within its initial execution path; the other cases used one. The observed
first-path, no-recovery findings therefore do not establish the cost of the full
adaptive system when a weak result is repaired, escalated or rerun.

Before another comparison:

1. Inspect prompt, context and tool-receipt fidelity for the two Jev failures and the
   all-Luna routing decision.
2. Test a bounded same-model higher-effort repair on failed development work before
   introducing a model switch. Count the first attempt, review and repair together.
3. Tune routing only from development evidence, then use fresh cases for validation.
   Keep the held-out set untouched until the protocol and thresholds are frozen.

This four-case development sample does not establish general savings, production
reliability, calibrated routing quality or subscription quota economics.
