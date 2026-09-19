# Source-preview release checklist

This is a portfolio build of a working local harness. Its source and synthetic
checks can be inspected without claiming demonstrated routing quality or savings.
The current local evidence is in [verification](VERIFICATION.md).

## Before sharing source

- Confirm the allowlisted snapshot builds and runs using its own lockfile.
- Review the source, screenshots and notices for private information.
- Keep the production dependency audit current when dependencies change. The
  September 19, 2026 retry passed with zero known vulnerabilities reported; see
  [the audit receipt](evidence/dependency-audit.json).
- Review provider terms and the licenses of pinned runtimes. Dependencies are
  obtained by the user from npm; no proprietary binaries belong in the source.
- Assess Claude integration against both the SDK subscription-login restriction
  and the published conditions for running unmodified Claude Code in a product.
  The [runtime review](USAGE.md#claude-runtime-and-distribution-review) records
  the verified architecture, additional official setup choices and remaining
  scope ambiguity. DUKE retains subscription routing; its worker does not yet
  execute directly billed Claude API/cloud tasks. Switching from the SDK to CLI
  calls is not sufficient evidence of permission. The current implementation
  retains the subscription feature with the ambiguity documented. This
  supersedes the earlier approval-or-API-only framing; no blanket distribution
  permission is claimed.
- Choose the repository, enable private vulnerability reporting and review its
  visibility. Publication is a separate action; the export command does not push.
- After publishing, verify the configured GitHub Actions job and actual clone path.

The export excludes local profiles, databases, logs, downloaded runtimes, private
review scratchpads and build outputs. Curated test receipts and synthetic
screenshots remain in `docs/evidence/` so readers can inspect the evidence.

## Before claiming daily-use reliability or routing gains

Run the [prepared live tasks](LIVE_ACCEPTANCE_TASKS.md) with explicit account and
spending authorization. Check coding, research, writing and documents, and at
least one task on each intended worker. Verify real Jev selection, artifacts,
cancellation, exhausted capacity, recovery and resumed work.

Then compare a fixed strong-model baseline, rules and Jev on matched held-out
cases with independent acceptance review. Count all routing, worker, retry and
review resources. Preserve incomplete token and subscription telemetry. See the
[benchmark protocol](BENCHMARK_PROTOCOL.md). Routine users do not have to grade
models; this independent review belongs to development validation.

## Before distributing a Mac download

The current target is Apple Silicon macOS 14 or newer. The app bundles Node,
Codex, Claude SDK and Chromium and manages its own local service. Local ad hoc
signing is not notarization.

A public binary needs dependency/distribution permission review, signing and
notarization, then a fresh-machine install and account-flow check. Do not advise
users to remove quarantine attributes as the normal install procedure.
A source build on the development machine does not close these distribution gates.
