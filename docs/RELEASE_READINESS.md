# Version 0.1 release checklist

DUKE's first release is an inspectable portfolio build with a downloadable Mac
app. The [verification record](VERIFICATION.md) is the source for completed
checks. Source and release artifacts remain private until publication is approved.

## Before sharing source

- Build and check the final allowlisted export with its own lockfile. Record its
  file hashes and the matching private GitHub commit and CI result.
- Review source, screenshots and notices for private information. The exporter
  excludes profiles, databases, logs, downloaded runtimes and review scratchpads.
- Run `npm run security:secrets` on the final full-history Git checkout. The
  [credential audit](evidence/secret-audit.json) also covers historical images,
  document contents and the current app. Repeat the artifact review if those
  files change; rerun it on the final signed download before uploading.
- Keep the [production dependency audit](evidence/dependency-audit.json) current.
  The latest tool pass reports zero known vulnerabilities, including the new
  spreadsheet calculation dependencies.
- Keep the failed acceptance cases and current limits visible. Confirm links in
  the README, architecture, decision log and tool audit point to current evidence.
- Review pinned runtime licenses and distribution conditions. The
  [Claude runtime notes](USAGE.md#claude-runtime-and-distribution-review) retain
  the subscription feature and document the remaining provider-term ambiguity.
  Neither open source status nor an SDK-to-CLI change establishes blanket permission.
- Configure private vulnerability reporting when the repository becomes public,
  then verify the public clone path and workflow results. No secret or runtime
  profile belongs in the source repository.

## Before distributing the Mac download

- Install the final audited tool bundle and repeat the native window, saved
  account, project and task flow. The earlier native checks predate these repairs.
- Complete a successful live OpenRouter worker check with an available endpoint
  before claiming every adapter works. A key/catalog lookup is insufficient;
  the zero-price endpoint attempt failed before tool execution.
- Sign the app and nested runtimes with Developer ID, then rerun the standalone
  tests under the hardened runtime. Current package checks used ad hoc signing.
- Submit the exact signed archive to Apple, verify acceptance, staple the ticket,
  and assess it with Gatekeeper. Create the DMG, ZIP and checksums from those bytes.
- Download and install on a fresh Apple Silicon Mac, connect accounts, create a
  project, run a task and check quit/relaunch. Test the normal quarantine path;
  removing quarantine is not the installation procedure.
- Publish the reviewed release assets and source together. The
  [distribution guide](MAC_DISTRIBUTION.md) describes the maintainer commands.

The target is Apple Silicon macOS 14 or newer. The bundle includes Node, Codex,
Claude, Chromium, the native document helper and four default skills. End users
should not need to package it or install a development toolchain.

## Before claiming routing gains or daily-use reliability

Bounded live checks now cover coding, research, writing and basic documents on
Codex and Claude. They establish specific working paths and expose failures;
they do not establish comparative quality or efficiency.

Compare a fixed strong-model baseline, local rules and Jev on matched held-out
cases with independent acceptance review. Count routing, worker, retry and review
resources. Preserve incomplete token and subscription telemetry. Include
cancellation, exhausted capacity, recovery and resumed work in continued use.
See the [benchmark protocol](BENCHMARK_PROTOCOL.md). Routine users do not need
to grade models; development validation owns this work.
