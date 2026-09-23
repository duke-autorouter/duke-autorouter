# Default tool audit

The September 2026 audit covers the four 0.1 workflows: coding, public-source
research, writing, and basic Word, PDF and Excel documents. It found defects in
DUKE's shared tool layer that a structural file check could not catch. Repairs
now pass local, standalone-package, installed-app and bounded live Codex/Claude
checks. A successful OpenRouter worker run remains open.

DUKE supplies these tools itself. Bundling a provider runtime does not supply the
entire Codex or Claude application's tool environment. The
[shared-harness ADR](adr/0001-shared-task-harness.md) records that responsibility.

## Findings and verification

| Area | Defect or gap | Current behavior and evidence |
| --- | --- | --- |
| Word and PDF export | Markdown was written as literal text; Word tables later exposed collapsed columns. | Native Word headings, lists and table grids; escaped Markdown-to-PDF rendering. Live Claude outputs were reopened and independently rendered. Sample pages are linked below. |
| Document input | All inputs were decoded as UTF-8. | Bounded readers handle text-based PDFs, Word main text, and XLSX values/formulas. Binary, scanned, truncated and unsupported content is explicit. Mixed PDFs flag pages without text. Package and live Claude checks read actual saved documents. |
| Spreadsheet calculation | Only literal values were supported. Cached formula values could be mistaken for recalculation. | Explicit formulas and named sheets, with bounded calculation. Tests cover arithmetic, conditional and cross-sheet formulas, errors and unsupported references. An incorrect library SUMIF result was caught and corrected. The live two-sheet workbook recalculates to 15. |
| Image delivery | Screenshots were paths or JSON text; Codex's bridge could return a data URL without displaying the image. | Adapter-specific image content plus Codex bridge instructions. Both native workers identified an unseen shape image. The repaired research run delivered an actual model-visible screenshot. Image bytes stay out of stored tool receipts. |
| Spreadsheet preview | Quick Look cropped the workbook and hid some values. | An explicit sheet/range grid shows saved cell values. Claude inspected Inventory and Summary after repair. These previews do not reproduce native Excel layout or recalculate formulas. |
| Native deliverable preview | The Mac window showed a blank PDF iframe; Word and XLSX only offered downloads. | The interface uses the existing renderer for version-checked images. PDF pages, a Word first page, and switching between Inventory and Summary were inspected in the signed Mac app. |
| File navigation and edits | Directory listings silently stopped at 500; no precise replacement or content search. | Sorted pagination, bounded line reads, literal search and unique-match edits with backups. Tests cover limits, failed edits, credential exclusions and project boundaries. Included in the standalone check. |
| Web discovery | Search HTML could be a challenge page or unrelated results. | Keyless Tavily results identify original URLs. Explicit rate/error/empty handling and no paid fallback. Luna's repaired live run found MDN, read the source, opened the page and inspected its screenshot. |
| Public PDFs | A web read could decode binary PDF bytes as text. | Bounded PDF extraction through the bundled helper. Unit, package and live public-PDF checks passed. No OCR is implied. |
| Research evidence | Example URLs in fenced code could be treated as citations. | Citation extraction separates code examples from prose sources. Source receipts and bounded excerpts go to review. Retrieval alone still does not prove every claim. |
| Default skills | Imported skills worked, but a fresh installation lacked a complete baseline. | Four original packaged skills guide coding, research, writing and documents. User instructions remain higher authority. Package checks exercise discovery/readback; skill and tool versions scope later learning. |
| Verification labels | A valid file or content pass could suggest all aspects were checked. | Content checks, calculation and layout coverage remain separate. The UI says “Content checks passed” and retains the layout limitation. Failed and unverified checks remain in receipts. |

## Every shared tool

The [API reference](API.md#shared-worker-tools) gives the schemas and bounds.

| Tools | Checked behavior |
| --- | --- |
| `setup_list`, `setup_read` | Default skills and approved snapshot lookup; unrelated files and permissions cannot be granted by instructions. |
| `list_files`, `read_file`, `search_files` | Scoped discovery, pagination, bounded extraction, text search and explicit incomplete coverage. |
| `write_file`, `edit_file`, `remove_file` | Saved bytes and retained versions; ambiguous edits fail; removal requires approval and unchanged content. |
| `shell` | Bundled Node execution, test failures, denied network, scoped writes and cancellation. Other language runtimes remain project prerequisites. |
| `web_search`, `web_read` | Live public discovery, source reading and a PDF; synthetic tests cover failure and limit behavior. |
| `browser` | Live open/read/screenshot; approved side effects, cancellation and uncertain-action receipts have local automated coverage. No live external form submission was needed for acceptance. |
| `create_artifact`, `preview_file` | Saved Markdown, HTML, Word, PDF and XLSX; structural checks, calculations, preview coverage, actual image delivery and inspection. |
| `checkpoint` | Saved progress and artifacts, stage continuation and explicit interrupted-task resume. |

Core tests exercise tool contracts and adapter image messages. Fourteen browser
workflows use synthetic workers with real file operations. Twelve standalone
checks run the actual bundle with a minimal environment and disposable state.
Live checks exercise selected ordinary operations through Codex and Claude.
These layers cover different failure modes; no one layer substitutes for the rest.

## Evidence and scope

- [Machine-readable tool receipt](evidence/tool-audit-verification.json)
- [Installed tasks and signed-app checks](evidence/installed-acceptance.json)
- [Actual sample files and rendered previews](evidence/tool-audit/README.md)
- [Live tasks and brief](LIVE_ACCEPTANCE_TASKS.md)
- [Verification record and remaining release checks](VERIFICATION.md)

The original failed runs remain in the private acceptance history. Public
evidence contains only invented tasks, public-source notes, reviewed files and
redacted receipts. Deliverables were not manually repaired and relabeled as
worker successes. Independent review does not overwrite Jev's unverified result.

The release does not include OCR, arbitrary Office layout preservation, Excel
macros, native Excel calculation parity, slide authoring, image generation or
general desktop automation. Word previews can cover only the first page; PDF
previews show one requested page; workbook previews show a selected cell range.
Static HTML previews disable scripts and network resources. A preview's existence
does not establish that every page, sheet or interactive behavior was inspected.

No paired model benchmark or efficiency claim is part of this audit. Those
require the separate [benchmark protocol](BENCHMARK_PROTOCOL.md).

## Source-only word measurement follow-up

`count_words` now shares the verifier counting convention for complete saved text/Markdown under files access. The [control and limits](WORKER_MEASUREMENT_20260923.md) record a successful Luna Low repair. This tool is not in the 0.1.12 package.
