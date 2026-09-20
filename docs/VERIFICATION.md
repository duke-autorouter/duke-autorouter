# Verification

The current source passes **157 automated tests** after the review-scoring fix.
The preceding tool pass passed **14 browser workflows and 12 standalone package
checks**. The package checks also pass with
Developer ID signing and the hardened runtime. Live Codex and Claude workers
completed bounded checks of coding, research, writing, and documents. These runs
found defects; the [tool audit](TOOL_AUDIT.md) records the corrections and limits.

The [installed-app receipt](evidence/installed-acceptance.json) records six later
live tasks, native previews, cancellation, resume and saved-state restart. The
earlier [tool receipt](evidence/tool-audit-verification.json) identifies its tested
source, commands and live checks. [Sample outputs](evidence/tool-audit/README.md)
include actual worker-created files and their rendered previews. The production
[dependency audit](evidence/dependency-audit.json) reports zero known vulnerabilities
for its recorded lockfile. None of these checks establishes routing savings or
general model quality.

The [scoring investigation](REVIEW_SCORING.md) records nine later live Jev review
checks: four correct outputs passed and five incorrect outputs failed. They used
saved public or invented evidence without rerunning workers. The signed app and
download candidate need this source correction before publication.

## Current checks

| Check | Result and scope |
| --- | --- |
| TypeScript and build | Passed locally; includes the native document helper. |
| Automated tests | 157 pass. Routing, model/effort fallback, tool contracts, permissions, accounting, imports, document calculations, image messages, preview authentication/version checks, probability boundaries and evidence limits. |
| Browser workflows | 14 pass using the actual app, files and synthetic workers. Covers creation, model choice, approvals, cancellation, rendered deliverables, usage, recovery and narrow screens. |
| Standalone package | 12 pass using a disposable profile, minimal PATH and unrelated working directory. Bundled Node, Codex, Claude, Chromium, core skills and document helper work without global installations. Includes saved-state restart and Developer ID signature checks under the hardened runtime. |
| Installed Mac app | Signed update preserved accounts, model choices, settings, two projects and 14 tasks. PDF, Word and both workbook sheets displayed; native quit/relaunch retained state and left a valid signature. |
| Evaluation corpus | 80 cases validate, 20 per work family. This checks the corpus, without calling models. |
| Live workers | Successful Codex and Claude runs, detailed below. No successful OpenRouter task yet. |
| Credential exposure | Full source history, tracked files, document contents, screenshot text and the packaged app reviewed. No credentials identified. The [audit receipt](evidence/secret-audit.json) records scope and limits; CI now checks text and history. |

Clean-source and hosted checks are recorded against the source snapshot or
commit they actually tested. See the receipt and
[GitHub Actions](https://github.com/duke-autorouter/duke-autorouter/actions).

## Live acceptance

The initial eight task runs used the installed app's engine, connected Jev and
subscription workers. They included four rechecks. The later tool checks used
the bundled adapters and tools through an isolated acceptance runner. Those
later checks exercised real accounts but bypassed Jev selection and the native
window. A subsequent six-task cohort used the installed engine with Jev, Codex
and Claude. Those tasks were queued through the local API with the evaluation
flag set; resume, cancellation and follow-up used the native window. The native
Start task button was not exercised in that cohort; synthetic browser checks
cover it.

| Work | Observed result |
| --- | --- |
| Coding | The first Codex attempt exposed incorrect tool guidance. After repair, saved code and tests ran. A later Luna Low package check created a utility and passed five independently rerun Node tests. |
| Research | A citation checker incorrectly treated an example URL as a source. After repair, source checks passed. Later search and screenshot-delivery defects were fixed; Luna Low retrieved MDN and a public PDF, viewed a browser screenshot, and wrote an accurate sourced note. |
| Writing | The initial draft added an unsupported borrowing policy. A Luna Low recheck stayed within the invented brief and passed factual review. |
| Documents | Valid initial files contained literal Markdown and poorly rendered tables. Repaired exporters produced clean Word/PDF outputs and a two-sheet workbook with total 15. Claude Sonnet Low read the inputs, created the files, and inspected image previews. Independent renders confirmed the saved output. |
| Spreadsheet inspection | Quick Look cropped cells. A later Claude check read recalculated formulas and viewed both sheets through explicit cell-range previews. Saved-cell previews and native Excel layout remain different checks. |
| Image delivery | Codex and Claude correctly described an image with a blue circle and red square. After additional Codex bridge guidance, a research run emitted one actual image input and described its screenshot. |
| OpenRouter | A zero-price endpoint request returned HTTP 404 before any tool call. The account had no API credit. The attempt spent $0 and left no unresolved reservation. Its adapter has automated coverage, but live completion is unverified. |

The six installed-engine tasks completed: coding, research, writing, documents,
zero-API-budget fallback, and cancellation/recovery. Jev selected Sonnet Low for
coding, research and documents. Uncertain selections and the exhausted API budget
used Luna Low. The zero-budget task incurred no additional API charge. Native
Stop removed a pending shell approval without creating the file; a subsequent
native follow-up saved the requested line through the file tool.

The first coding attempt stalled during routing without a provider receipt.
Quit/relaunch marked it interrupted, and native Continue completed it. The cause
was not established; later tasks did not reproduce it. Research search results
were irrelevant in one run; the worker recovered by reading official URLs
directly. These are retained observations, not repaired results.

Installed checks found a blank PDF iframe. The repair now displays rendered
images from the shared document helper, with PDF page controls and workbook sheet
selection. The signed app displayed the PDF page, Word first page, and Inventory
and Summary cells with the expected total. After switching from the development
signature, macOS requested Documents access again; the owner allowed it and the
preview succeeded on reopening.

Jev's review remained **unverified** on some otherwise useful outputs. Independent
acceptance review does not rewrite those saved statuses. The original failures
also remain in the private run history. All prompts used public or invented
material. Five of the six later automatic reviews remain unverified, including
conservative Jev judgments and checks unavailable at the exhausted budget.
The later scoring correction preserves those original records. Its
[separate receipt](evidence/review-scoring-verification.json) contains fresh
distributions, known incorrect examples and the remaining coverage gaps.
Recorded API spending across both cohorts was **$0.005682** within a $1 total cap;
subscription usage was separate. No comparative savings claim follows from this
small set of acceptance tasks. Original budget settings were restored and no
unsettled charges remain.

## Earlier evidence

These receipts retain their original dates and scope:

- [Initial release checks](evidence/release-checks.json): initial clean export,
  core tests, sandbox, importer and package verification.
- [Branding](evidence/branding-verification.json): SVG assets, favicon, Mac icons,
  layouts and installed update.
- [Usage and typography](evidence/usage-verification.json): header preferences,
  account-wide Codex/Claude readings, stale states and packaged update. Real
  account metadata was read without inference; UI cases used invented readings.
- [Claude setup](evidence/claude-setup-verification.json): simulated login choices,
  cancellation and billing classification. It does not prove real SSO or cloud
  account execution.
- [Native window](evidence/native-window-verification.json): actual window, menus,
  attached dialogs, quit/relaunch and state preservation on the development Mac.
  It predates the final tool repairs.

## Distribution and remaining coverage

The final 0.1 candidate passed Developer ID verification, Apple notarization,
stapling and Gatekeeper. The delivered DMG and ZIP preserve Anthropic's original
Claude executable and signature. All 12 standalone checks passed again, and the
corrected runtime recognized the existing Claude subscription without inference.
The [distribution receipt](evidence/distribution-verification.json) identifies
the exact assets. A final native-window launch remains before publication;
earlier native checks retain their recorded scope. Check public download links
and checksums again after publishing.

OpenRouter live completion and a second physical Mac installation remain
unverified. A clean profile on the development Mac does not establish that
second-machine coverage. No Intel, Windows or Linux release is tested.

Broader routing accuracy, multi-day reliability, and resource savings require
the [benchmark protocol](BENCHMARK_PROTOCOL.md). The
[release checklist](RELEASE_READINESS.md) separates those claims from the 0.1
distribution work.
