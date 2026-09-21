# Cost efficiency pilot public evidence manifest

This manifest separates public, reviewable evidence from private operating receipts.

## Public files

- `docs/EFFICIENCY_PILOT.md` preserves the original 12-run result and its 4/4,
  3/4 and 3/4 quality conclusion.
- `docs/EFFICIENCY_PILOT_STATUS.md` is the terminal status for that original run.
- `docs/evidence/efficiency-pilot/summary.json` is its compact machine summary.
- `docs/evidence/efficiency-pilot/independent-review.json` contains the original
  rubric verdicts with the private mapping path removed.
- `docs/COST_EFFICIENCY_PILOT_20260920.md` reports the corrected symmetric-review,
  model-priced comparison and its interpretation boundary.
- `docs/evidence/corrected-cost-efficiency-pilot.json` is the privacy-safe corrected
  machine summary.

## Exact implementation commits

The historical execution and report are preserved through:

- `270d1d0d4e04dcdfac1376894accc33d9dfa2e02` - clean tested original harness.
- `14bdbacd612b9bddf3c06ab98672ce282601309f` - reconciled original workflow evidence.

The corrected production behavior and harness begin at:

- `5a2d6c96699103a68ab32a8d54e75d01b5a36b6e` - fixed baselines bypass
  Jev routing but receive the same assist-mode content review; adds the three corrected
  modes, explicit receipt labels and terminal workflow receipt recognition. This is
  the clean commit used by all corrected live worker runs.

Analysis and recovery support is additive:

- `9a0c1260b0cc2da5d3c3cba82ddc11073431a3cd` - dated model-priced analysis.
- `251ed68ed398aeed43ccfcb31c5f217cd54af163` - review-only recovery with no worker rerun.
- `1c85b797b0f19613ab3659ce71eaf289f00e3e27` - evidence-checked recovery reconciliation.
- `51b56e9bc802797097edd96897a420c43bc07b53` - explicit cost-uncertainty bounds.
- `909e76026309e1e45ec883b2d10bd935700452a0` - independent review overlays.

These identifiers record the local benchmark source history. This PR publishes the
reports and summaries; the benchmark implementation chain has not yet been
integrated into the public branch. No merge to `main` is implied.

## Exclude from a public repository

- Raw run receipts and event streams. They contain task, usage and request identifiers,
  detailed account-window observations and internal execution history.
- Shared API ledgers, coordination receipts, lock files and reservation journals.
- Disposable profiles, provider authentication files, launch tokens and local databases.
- Local logs, temporary state, rendered QA intermediates and blind-review mappings.
- Absolute local paths, private workspace names and operator-specific command lines.
- Unresolved provider references. Publish only the bounded aggregate uncertainty above.

The private source artifacts are retained locally for audit but are not needed to verify
the public conclusions.

## Claim boundary

Do not claim general or quality-preserving savings. The corrected Jev mode was cheaper
on the model-priced proxy but passed only two of four cases. No quality-recovery retry
occurred; Jev writing used three stages in its initial path and the other cases used one.
These runs therefore do not measure the full adaptive cost of repair or escalation.

The next investigation should inspect prompt, context and tool fidelity, evaluate a
bounded same-model higher-effort repair for failed development work, and validate any
tuned policy on fresh cases before opening the held-out set.
