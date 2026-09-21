# Corrected Pilot Failure Audit and Repair Protocol

## Conclusion

The two failed Jev-mode development cases do not support a conclusion that the
worker model was too weak. They failed for different reasons and must be repaired
with different first interventions.

- The SQLite research case is confounded by source fidelity. The worker received
  obsolete advice and its current replacement as adjacent prose without the
  source page's deletion semantics because HTML deletion markup was stripped.
  The first rerun must keep Luna Low and change only source extraction.
- The handoff document contains a worker-authored judgment error. The complete brief did not
  assign the participant-trial status to Sam, but the worker placed that status in
  Sam's table row. Its self-check then received flattened table text and its preview
  did not complete. The first rerun must keep Luna Low while changing only that
  evidence environment.
- Review was uncertain overall in both cases. It did not certify either result as
  accepted. It also did not identify either material defect. In the document case,
  the support judgment was a high-probability pass despite the incorrect
  association. Reviewer evidence fidelity and defect detection therefore need
  separate treatment from worker repair.

The audit itself used saved receipts and source inspection. Live follow-up results
are recorded separately. Original artifacts and raw receipts remain unchanged
and private.

## Evidence reconstruction

### SQLite research

The original `web_read` receipt contains the full current SQLite WAL page as
31,466 flattened characters. The obsolete sentence begins at character 3,226 and
the current SQLite 3.11 correction begins at character 3,637. Both are inside the
first 6,000 characters supplied to the reviewer. The receipt does not preserve the
HTML strike/deletion relationship. This removes material evidence needed to
distinguish the statements, but it does not establish how the worker interpreted them.

The worker then wrote that WAL works best with smaller transactions and that
rollback journal modes should be considered for very large transactions. This is
a material conflict with the current correction on the same page.

Cause classification:

- Evidence deficiency: demonstrated contributing defect and causal confound.
  Source extraction erased the semantic distinction between obsolete and current
  text, while the current correction itself remained present.
- Worker judgment: not isolated. The worker did not reconcile adjacent conflicting
  statements, but its evidence was corrupted in the relevant way.
- Reviewer detection: weak but not a false acceptance. The overall review stayed
  unverified. Support chose pass at probability 0.35, below the 0.80 gate; brief
  chose unknown at 0.48; completion chose fail at 0.62, also below the gate. The
  review did not name the contradiction even though both sentences fell within
  its source excerpt.

### Handoff document

The worker read the complete one-line source brief. It then authored this row in
the document source and saved document:

`Sam | Operations; sign-in sheet | Participant trial not yet run`

The brief assigns Sam to operations and the sign-in sheet. It separately says that
the participant trial has not yet run and names no owner for that status. Putting
the status in Sam's row creates an unsupported ownership association.

The worker reopened the DOCX as extracted text. It attempted a preview, but no
completed preview receipt exists; its checkpoint explicitly says the preview
helper was unavailable. Independent render QA later confirmed that the row is
legible and visibly associates the status with Sam. The file renders as two pages
without clipping; layout legibility is not the failure.

Cause classification:

- Evidence deficiency for the worker: no. The brief was complete and untruncated.
- Worker judgment: demonstrated artifact defect. The incorrect association was
  introduced directly in the authored table; this does not establish that model
  effort caused the error.
- Worker verification: contributory. The worker had no completed visual preview,
  and its extracted table text did not preserve row or cell boundaries.
- Reviewer evidence deficiency: contributory. Office inspection flattened table
  cell and row boundaries into paragraph text, and rendered layout was explicitly
  not independently judged.
- Reviewer detection: missed. The overall review stayed unverified, but support
  chose pass with probability 0.93 and crossed the 0.80 gate. Brief and completion
  were unknown at 0.50. No check identified the unsupported association.

## Bounded repair sequence

Every phase uses an isolated empty state directory and a new output directory.
No command may overwrite the original workspaces or receipts. All worker runs use
the same model, `codex:gpt-5.6-luna`. Jev automatic content review remains enabled,
but routing is bypassed so the worker and effort are fixed.

1. Research tool-isolation clean rerun. Run only `research-sqlite-wal` at Luna Low after
   the source-revision marker fix. This isolates tool evidence from model effort.
2. Research effort clean rerun, conditional. Run the same case at Luna Medium only if
   phase 1 still fails the unchanged independent rubric for a worker-attributable
   reason. Do not run it merely because automatic review is uncertain.
3. Document evidence-isolation clean rerun. Run only `documents-handoff-docx` at
   Luna Low after table structure is preserved for worker self-check and reviewer
   evidence, and after native preview is preflighted. This isolates the changed
   evidence environment from model effort.
4. Document effort clean rerun, conditional. Run the same case at Luna Medium only
   if phase 3 still fails the unchanged independent rubric for a worker-attributable
   reason. Do not run it merely because automatic review is uncertain.
5. Independent acceptance. Apply the original case rubric to saved bytes. Record whether
   the reviewer knows the condition; these reviews are not blinded. Automatic Jev checks are evidence,
   not the acceptance decision. A case passes only when independent review records
   `accepted=true` and `criticalFailure=false`.
6. Fresh development validation. Only after both failed cases are repaired, run
   untouched development cases `research-mdn-csp` and `documents-budget-xlsx` at
   the candidate Luna effort. Do not open the held-out split in this phase.
7. Claim gate. Do not claim quality-preserving savings from repaired cases. A
   policy claim requires the fresh cases to pass the unchanged acceptance process,
   followed by a separately authorized held-out evaluation.

## Cost accounting

Report repair economics per case as cumulative cost to an independently acceptable
result:

`original routing + original worker + original review + every repair worker + every repair review + unresolved request reserve`

Keep model-priced subscription equivalents separate from actual metered API spend.
Do not subtract the failed original attempt. Do not combine repaired development
cases with fresh validation cases in one success rate. The already settled shared
spend and every outstanding reservation remain part of the shared cap calculation.

For these commands, reserve no more than USD 0.002 per single-case phase and USD
0.004 for the two-case fresh validation phase. Their worst-case new reservation is
USD 0.012 if both conditional Medium phases run. The shared budget gate,
not these local values, is authoritative and must reject execution if settled plus
outstanding plus requested reservation exceeds the original approved cap.

## Prepared commands

Set `AUTH_SOURCE`, `DUKE_COORDINATION_DIR`, and `RUN_ROOT` to private local paths.
Run from the repository root only after the source-fidelity fixes and their tests
are present. Pin the execution checkout and record its commit in every receipt. It
must contain the public source-revision change from `b053b44` and the structured
Office table evidence change from `164dac6`, or their reviewed descendants. Native
DOCX preview must pass a read-only preflight in that checkout before the document
phase. These commands describe the preregistered phases; execution and verdicts are
recorded separately. The budget wrapper requires the existing private coordination
receipt and ledger, including prior charges and authorization. It is a maintainer
experiment helper, not a one-command setup flow for new users.

```bash
node --import tsx scripts/with-live-budget-gate.ts \
  --run-id repair-research-source-low-20260921 \
  --reservation-usd 0.002 \
  --results "$RUN_ROOT/research-source-low/results.json" \
  -- node --import tsx scripts/run-bounded-repair-mode.ts \
    --phase research-source-low \
    --state-dir "$RUN_ROOT/state-research-source-low" \
    --out "$RUN_ROOT/research-source-low" \
    --auth-source "$AUTH_SOURCE" \
    --case-ids research-sqlite-wal \
    --effort low
```

Run the following only if independent review attributes a remaining phase 1 defect
to worker judgment:

```bash
node --import tsx scripts/with-live-budget-gate.ts \
  --run-id repair-research-medium-20260921 \
  --reservation-usd 0.002 \
  --results "$RUN_ROOT/research-medium/results.json" \
  -- node --import tsx scripts/run-bounded-repair-mode.ts \
    --phase research-medium \
    --state-dir "$RUN_ROOT/state-research-medium" \
    --out "$RUN_ROOT/research-medium" \
    --auth-source "$AUTH_SOURCE" \
    --case-ids research-sqlite-wal \
    --effort medium
```

```bash
node --import tsx scripts/with-live-budget-gate.ts \
  --run-id repair-document-evidence-low-20260921 \
  --reservation-usd 0.002 \
  --results "$RUN_ROOT/document-evidence-low/results.json" \
  -- node --import tsx scripts/run-bounded-repair-mode.ts \
    --phase document-evidence-low \
    --state-dir "$RUN_ROOT/state-document-evidence-low" \
    --out "$RUN_ROOT/document-evidence-low" \
    --auth-source "$AUTH_SOURCE" \
    --case-ids documents-handoff-docx \
    --effort low
```

Run the following only if independent review attributes a remaining document defect
to worker judgment after the evidence-isolation rerun:

```bash
node --import tsx scripts/with-live-budget-gate.ts \
  --run-id repair-document-medium-20260921 \
  --reservation-usd 0.002 \
  --results "$RUN_ROOT/document-medium/results.json" \
  -- node --import tsx scripts/run-bounded-repair-mode.ts \
    --phase document-medium \
    --state-dir "$RUN_ROOT/state-document-medium" \
    --out "$RUN_ROOT/document-medium" \
    --auth-source "$AUTH_SOURCE" \
    --case-ids documents-handoff-docx \
    --effort medium
```

After both cases pass independent review, set `CANDIDATE_EFFORT` to the lowest effort
that passed both cases and run the fresh development pair:

```bash
node --import tsx scripts/with-live-budget-gate.ts \
  --run-id validate-fresh-luna-candidate-20260921 \
  --reservation-usd 0.004 \
  --results "$RUN_ROOT/fresh-luna-candidate/results.json" \
  -- node --import tsx scripts/run-bounded-repair-mode.ts \
    --phase fresh-luna-candidate \
    --state-dir "$RUN_ROOT/state-fresh-luna-candidate" \
    --out "$RUN_ROOT/fresh-luna-candidate" \
    --auth-source "$AUTH_SOURCE" \
    --case-ids research-mdn-csp,documents-budget-xlsx \
    --effort "$CANDIDATE_EFFORT"
```

These are clean reruns in new workspaces, not continuations that correct the saved
failed outputs. They test bounded worker and tool configurations and are not evidence
of adaptive routing behavior. The harness refuses nonempty state directories, enables only Luna, records the
fixed effort and case IDs, denies unapproved mutations, retains symmetric Jev
review, and writes a machine receipt for later independent review and cost
reconciliation.

## Integrity anchors

- Original research memo SHA-256:
  `2631acf26ce940edbe61af7ed70de66abef8edd4e0107397ed22613d3933482f`
- Original document brief SHA-256:
  `d7c43b4897cbea4d4a516708dae371634cb97c41f4e957c2b9e2029b99b25e44`
- Original DOCX SHA-256:
  `b0a28f87c83c0f81f6ea2e096527d4a86b5ae787bfc1040d732ed82354f2becd`
- Original Jev-mode receipt SHA-256:
  `2879f01eb1ac3589284f797bf2dfeecfc4b7d8210eb8ed889c756068e0ba3a1a`

These hashes identify the retained private evidence. They do not publish its local
paths, task IDs, provider request IDs, account observations, or raw event stream.
