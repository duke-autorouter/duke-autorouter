# Version 0.1 release record

DUKE 0.1 is a portfolio release with inspectable source and a standalone Mac app.
The current maintenance release is 0.1.4. This page separates current checks from
historical live coverage and the gaps that remain.

## Current source and package checks

- The integrated source passes 199 automated tests, TypeScript, the production
  build and evaluation-corpus validation. GitHub also scans source history for
  secrets on each push.
- The 0.1.4 package passes 12 standalone checks with isolated state and no
  developer PATH. These cover bundled workers and browser startup, native
  document tools, project setup, imports, persistence and restart. They do not
  call provider models.
- Updating the installed app from 0.1.2 to 0.1.4 preserved all 14 saved tasks,
  two projects, settings, preferences and selected models by hash comparison.
  The native window loaded the saved work and passed visual inspection.
- The packaged application files match the generated build output. The
  [distribution receipt](evidence/distribution-0.1.4-verification.json) records the
  signing, notarization, checksums and final package audit.
- [The evidence audit](SOURCE_FIDELITY_AUDIT.md) records repaired web revision
  markers and Word table structure. The [diagnostic protocol](FAILURE_AUDIT_AND_REPAIR_PROTOCOL_20260921.md)
  holds task requirements fixed while separating tool changes from model effort.

## Historical live coverage

Earlier 0.1 checks exercised Codex and Claude on coding, research, writing and
basic documents. Fifteen browser workflows used synthetic workers. Nine Jev
review diagnostics met their expected outcomes after the probability correction.
These are scoped historical checks, not a fresh live validation of every adapter
for 0.1.4. See [verification](VERIFICATION.md), the [tool audit](TOOL_AUDIT.md),
[workflow validation](CURRENT_STATUS.md#live-workflow-validation), and the
[review-scoring record](REVIEW_SCORING.md).

The [0.1.1 adversarial response](ADVERSARIAL_REVIEW_20260920.md) covers browser
redirects, neutral treatment of incomplete execution, probability rounding and
fallback exclusions. The [0.1.2 workflow patch](WORKFLOW_PATCH.md) covers task
revisions and review-only retries. The [0.1.3 follow-up](RELIABILITY_FOLLOWUP.md)
adds worker inactivity protection and missing-file recovery.

## Distribution

The Apple Silicon release includes a signed, notarized DMG and ZIP, SHA-256
checksums and a manifest. Users need macOS 14 or newer; they do not need Node,
Xcode or a terminal. Follow the [download instructions](../README.md#download-and-install).
The [distribution guide](MAC_DISTRIBUTION.md) covers maintainer commands.

## Remaining limits

- **OpenRouter has no successful live worker result in the recorded checks.**
  Automated adapter coverage does not close that gap.
- **A second physical Mac has not been tested.** Isolated profiles on the
  development Mac do not establish second-device installation and sign-in.
- **Jev review is not a reliable substitute for independent evaluation.**
  Development examples remained unverified overall, and a high-probability
  support judgment missed an unsupported document association. Preserving better
  evidence helps inspection but does not guarantee detection.
- **Broad savings and routing accuracy are not established.** The four-case
  comparison measured a lower model-priced cost with quality failures. Controlled
  reruns retain failed-attempt costs, but use operator decisions. Neither they nor
  the fresh development checks prove autonomous recovery or precise subscription
  allowance savings. Held-out comparison remains separate.
- **Coverage remains bounded.** No multi-day reliability result, Intel, Windows
  or Linux release is claimed. Setup-import prompt injection, concurrent failure
  recovery and accounting completeness still need broader adversarial coverage.

Keep these limits with the results. Routine users should not need to grade models;
development validation owns the benchmark work.
