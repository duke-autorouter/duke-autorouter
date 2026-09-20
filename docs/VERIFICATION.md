# Verification

DUKE Autorouter has local automated checks for routing, task execution, accounting,
imports, UI interactions and its Mac runtime. The current source-preview evidence
is recorded in [the release receipt](evidence/release-checks.json). The receipt
identifies the commands, platform, synthetic inputs and any untested behavior.
Screenshots in that folder use invented task and account data.

Current results: **124 automated tests, thirteen browser workflows, four Claude-setup workflows, six usage-panel workflows, eleven importer
checks, six native sandbox checks and eleven standalone package checks pass**. The
clean-source build and 80-case corpus validation also pass. The npm production
dependency audit completed on September 19, 2026, with **zero known vulnerabilities
reported**. Its scope and lockfile hash are in [the audit receipt](evidence/dependency-audit.json).

The subsequent [branding check](evidence/branding-verification.json) covers the
outlined SVGs, desktop and narrow layouts, favicon, Mac app and menu bar icons,
and the installed app update. Browser, importer and standalone checks were rerun
after that change. The original release receipt retains the earlier core-test
and clean-source build evidence.

The later [usage and typography receipt](evidence/usage-verification.json) covers
DM Sans, saved header preferences, independent Codex/Claude windows, stale and
unavailable states, keyboard and narrow-screen behavior, and the packaged update.
All automated tests, importer checks and the standalone checks were rerun for
this change. The twelve existing browser workflows passed before the final
sentence-case label adjustment; the six focused usage workflows ran afterward.
Read-only metadata calls through the installed app returned Codex and Claude
allowance percentages and reset times. No model prompt was submitted. Claude's
SDK usage interface remains experimental; this account check does not prove
availability for every plan or future runtime release. Fresh-machine and live
model-task acceptance are still pending.

The [Claude setup receipt](evidence/claude-setup-verification.json) records the
additional official sign-in choices, cancellation and billing classification.
Its four browser workflows use a simulated login process; the native launch
test executes a substitute program to check quoting, environment isolation and
cleanup. No real SSO, Console or cloud login was performed. The eleven package
checks cover actual bundled runtimes and restart with a disposable profile.
The installed app retained its saved configuration and its existing Claude
subscription, and a metadata-only read returned two allowance windows. Source
and packaged Claude executable hashes still match. The earlier native-sandbox
and clean-source receipts are retained as historical checks, not new runs.

The [native window and interface receipt](evidence/native-window-verification.json)
records the standalone WebKit window, standard Mac editing and window controls,
attached folder/file/save dialogs, and the simpler task interface. The installed
app was launched, quit and reopened; native import/export was checked with a
synthetic setup, then removed. Saved account readiness and configuration remained
unchanged. This includes 33 native origin/navigation policy scenarios, 124 core
tests, thirteen browser workflows and eleven final package checks. The source
profile's earlier hosted checks passed on its original commit; current hosted
results remain tied to the commit shown by GitHub.

## What the checks establish

- Core and HTTP tests exercise eligibility, preference ordering, automatic Jev
  dispatch, recovery, uncertainty, approval boundaries, usage and persistence.
- Import tests exercise Link and Copy, portable multiline settings, scope,
  missing references, credential exclusions and immutable task snapshots.
- Browser workflows run the actual app and file tools against synthetic workers.
  They exercise task creation, deliverables and previews, recovery evidence,
  approvals, cancellation, model selection and audited spending reconciliation.
- Standalone checks use a disposable data directory, minimal environment and an
  unrelated working directory. They initialize the bundled worker and browser
  runtimes without model inference and check shutdown, restart and signature.
- Clean-source verification uses the allowlisted export, installs its lockfile
  dependencies and runs the documented build and local checks.

A synthetic Jev transport validates the request/selection/review mechanics. It
cannot establish Jev's judgment, actual provider completion, model quality or
savings. Catalog and sign-in checks do not establish funded API capacity.

## Unverified release claims

Live coding, research, writing and document acceptance remain unvalidated. No
paired model benchmark or multi-day reliability claim is included. No fresh
physical Mac installation, notarized distribution or Intel/Linux/Windows support
is established by a clean directory on the development Mac. Hosted checks are
recorded per commit in [GitHub Actions](https://github.com/duke-autorouter/duke-autorouter/actions).
They cover type checking, core tests, the frontend build and the fixture corpus;
native interactive checks remain local.

See [release readiness](RELEASE_READINESS.md) for outstanding decisions and
[benchmark protocol](BENCHMARK_PROTOCOL.md) for independent output review.
