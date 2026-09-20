# Version 0.1 release readiness

DUKE 0.1 is a portfolio release with inspectable source and a standalone Mac app.
The repository is still private. This page separates publication work from the
limits that early users need to know.

## Completed checks

- 157 automated tests pass for the current source. The preceding candidate passed
  14 browser workflows and 12 signed standalone checks.
  Browser workflows use synthetic workers; the [verification record](VERIFICATION.md)
  distinguishes them from live tasks and native-window checks.
- Live Codex and Claude tasks cover coding, research, writing and basic documents.
  Installed checks cover previews, cancellation, resume and saved-state restart.
- The [credential audit](evidence/secret-audit.json) covers source history,
  document contents, screenshot text and the packaged app. No credentials were
  found. CI scans source and history on each push.
- The preceding DMG and ZIP passed notarization, stapling, signature and Gatekeeper
  checks. Claude retains Anthropic's published bytes and signature. See the
  [distribution receipt](evidence/distribution-verification.json).
- The [review-scoring correction](REVIEW_SCORING.md) passed nine live Jev diagnostic
  cases: four correct outputs passed and five incorrect outputs failed.
- The [dependency audit](evidence/dependency-audit.json) reports zero known
  vulnerabilities for the current lockfile.
- The README, guides, decision records and current interface copy have been
  [reviewed against the project's voice guidance](evidence/public-copy-audit.json).
  Historical receipts, sample
  worker outputs and design prompts retain their original wording and dates.

## Publication steps

1. Rebuild, sign and notarize the candidate with the scoring correction. Check the
   packaged app, then open its native window and confirm saved state. The earlier
   signed-app and distribution receipts describe the preceding candidate.
2. Confirm the final source commit passes both GitHub checks. Keep the source
   manifest and distribution receipt with the exact files they describe.
3. Publish the reviewed source and 0.1 prerelease assets together after approval.
   Enable private vulnerability reporting when the repository becomes public;
   [GitHub supports this for public repositories](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
4. Verify the public clone, release links, checksums and normal download/install
   path. Update the README's download status after the files are available.

End users should get a DMG or ZIP, checksums and release notes. They do not need
Node, Xcode or a terminal. The target is Apple Silicon macOS 14 or newer.
The [distribution guide](MAC_DISTRIBUTION.md) covers maintainer commands.

## Limits to disclose with 0.1

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
  fixes the probability cutoff; image evidence, cancellation-test coverage and
  zero-budget review remain separate limits. One initial routing attempt stalled and completed after restart
  and resume; its cause remains unresolved. Search produced irrelevant results
  in one run, and the worker recovered through direct source URLs.
- **Savings and broader reliability are unmeasured.** No paired routing benchmark,
  multi-day reliability result, Intel build, Windows build or Linux build is claimed.

These limits belong in the 0.1 prerelease description. They do not turn a bounded
acceptance result into proof of general model quality. Keep the failed examples
and incomplete checks visible.

## Evidence needed for stronger claims

Compare Jev with a fixed strong-model baseline and the configured economical
fallback on matched held-out cases. Use independent acceptance review. Count
routing, workers, retries and review, and preserve incomplete token and
subscription readings. See the [benchmark protocol](BENCHMARK_PROTOCOL.md).
Routine users do not need to grade models; development validation owns this work.
