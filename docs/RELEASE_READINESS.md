# Version 0.1 release record

DUKE 0.1 is a portfolio release with inspectable source and a standalone Mac app.
The source and Mac downloads are available in the
[0.1.2 public prerelease](https://github.com/duke-autorouter/duke-autorouter/releases/tag/v0.1.2).
This page records what was checked and the limits that early users need to know.

The [0.1.1 review response](ADVERSARIAL_REVIEW_20260920.md) records fixes for
browser redirects, incomplete execution checks, rounded Jev answers and fallback
exclusions. Update from 0.1.0 before using browser research.

## Completed checks

- 182 automated tests pass for the release source. The interface passed
  15 browser workflows; the final package passed 12 signed standalone checks.
  Browser workflows use synthetic workers; the [verification record](VERIFICATION.md)
  distinguishes them from live tasks and native-window checks.
- Live Codex and Claude tasks cover coding, research, writing and basic documents.
  Installed checks cover previews, cancellation, resume and saved-state restart.
- The [original credential audit](evidence/secret-audit.json) covers source history,
  document contents and screenshot text. The [0.1.1 package audit](evidence/distribution-0.1.1-verification.json)
  checks the updated app, known credential values and download contents. No
  credentials were found in these scopes. CI scans source and history on each push.
- The published DMG and ZIP passed notarization, stapling, signature and Gatekeeper
  checks. Claude retains Anthropic's published bytes and signature. See the
  [distribution receipt](evidence/distribution-0.1.1-verification.json).
- The [review-scoring correction](REVIEW_SCORING.md) passed nine live Jev diagnostic
  cases: four correct outputs passed and five incorrect outputs failed.
- The [dependency audit](evidence/dependency-audit.json) reports zero known
  vulnerabilities for the current lockfile.
- The README, guides, decision records and current interface copy have been
  [reviewed against the project's voice guidance](evidence/public-copy-audit.json).
  Historical receipts, sample
  worker outputs and design prompts retain their original wording and dates.

## Distribution

The release includes an Apple Silicon DMG, ZIP, SHA-256 checksums and a manifest.
The app includes the review corrections and preserves existing tasks, projects,
accounts and settings when updated. The final native launch and disposable-profile
checks ran on the development Mac. GitHub checks scan source history for secrets
and run the core build, tests and evaluation-corpus validation.

End users do not need Node, Xcode or a terminal. The target is Apple Silicon
macOS 14 or newer. The [distribution guide](MAC_DISTRIBUTION.md) covers maintainer
commands, and the [download instructions](../README.md#download-and-install)
cover normal installation. Security reports can use GitHub's private
**Security → Report a vulnerability** form.

## Limits in 0.1

- **OpenRouter live completion is unverified.** The adapter has automated coverage;
  the attempted zero-price endpoint returned HTTP 404 before execution. Keep it
  optional and identify this gap in release notes. A successful task is needed
  before describing every adapter as live-validated.
- **A second physical Mac has not been tested.** Disposable-profile and native
  checks on the development Mac do not establish that coverage. Ask an early
  tester to check installation, sign-in, a task and restart through the normal
  macOS download path. Do not prescribe removing quarantine.
- **Automatic reviews can remain incomplete.** Five of six installed live tasks kept
  that status under the earlier policy. The [scoring correction](REVIEW_SCORING.md)
  fixes the probability cutoff. The [0.1.2 workflow patch](WORKFLOW_PATCH.md) adds requirement reconciliation,
  bounded preparation and review-only retries. Image evidence, ambiguous follow-up
  requirements and zero-budget review can still leave checks incomplete. One
  initial routing attempt stalled and completed after restart and resume; its
  specific cause remains unresolved. Local regression tests now exercise the
  bounded wait paths and cancellation. Search produced irrelevant results
  in one run, and the worker recovered through direct source URLs.
- **Savings and broader reliability are unmeasured.** No paired routing benchmark,
  multi-day reliability result, Intel build, Windows build or Linux build is claimed.

The release notes disclose these limits. Failed examples and incomplete checks
remain in the verification records; acceptance checks do not establish general
model quality.

## Evidence needed for stronger claims

Compare Jev with a fixed strong-model baseline and the configured economical
fallback on matched held-out cases. Use independent acceptance review. Count
routing, workers, retries and review, and preserve incomplete token and
subscription readings. See the [benchmark protocol](BENCHMARK_PROTOCOL.md).
Routine users do not need to grade models; development validation owns this work.
