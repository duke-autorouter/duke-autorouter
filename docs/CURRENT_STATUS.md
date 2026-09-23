# Current development status

Updated September 23, 2026.

The desktop maintenance release is **0.1.11**, with GPT-6 Sol, GPT-6 Luna and Opus 5.5 model choices. The [model refresh record](MODEL_REFRESH_20260923.md) separates provider discovery from live task verification. The packaged 0.1.11 verification passed 255 local tests.

The iOS gateway foundation is merged and packaged, disabled by default. Physical iPhone checks and iOS distribution remain unfinished. The bounded factory trial is paused after three assignments: historical evidence replay merged in PR12; PR13 was closed without merging its runtime changes; [ADR0022](adr/0022-defer-requirement-coverage-metadata.md) preserves the verifier trust boundary and revisit criteria.

The [new-model integration checks](MODEL_VALIDATION_20260923.md) completed successfully for GPT-6 Luna, GPT-6 Sol and Opus 5.5 at Low effort. Each produced independently accepted output with unchanged inputs and verifier. The [two-task comparison and controlled recovery probe](GPT6_COMPARISON_20260923.md) are complete: automatic mode used the Luna fallback, a controlled same-effort repair passed its unchanged verifier, and review incompleteness remains.

The 0.1.10 maintenance update keeps ordinal difficulty uncertainty in Jev selection and separates semicolon-delimited review requirements. Fresh Jev-only probes selected Luna Low for two briefs and correctly distinguished supported, contradicted, invented-commitment and missing-evidence examples. These are narrow development checks, not worker success or calibrated accuracy evidence. See [the judgment record](JUDGMENT_VALIDATION_20260923.md).

The 0.1.11 update protects quoted and dependent requirements, checks up to 24 requirements in batches of eight, and supplies the full difficulty distribution to Jev selection. Three fresh dependent-instruction controls matched their expected outcomes. The conservative difficulty threshold remains uncalibrated, and the iOS proxy boundary remains open. See the [maintenance record](OPUS_FOLLOWUP_20260923.md).

The [first fresh factory cycle](FACTORY_CYCLE_1_20260923.md) ran twelve tasks with blinded Opus content review. Automatic routing selected Sol and matched Astra's 4/4 content acceptance at about 77% lower API-equivalent cost; Luna met 3/4 content rubrics at a much lower cost. Full Word layout remains unverified, and DUKE itself passed none of the twelve reviews. The cycle exposed numbered-requirement and ownership-extraction defects. This is a small development sample, not general efficiency or end-to-end success evidence. The original scheduled pilot remains paused.

The [second factory cycle](FACTORY_CYCLE_2_20260923.md) validates numbered-field and ownership checks on fresh inputs. Six of nine predeclared overall outcomes matched; three correct outputs stayed unverified solely on completion. The earlier cropped-preview finding is withdrawn: saved first-page images contain the expected content and an original Astra PNG is byte-identical to a new render. No renderer or threshold change was made. Full-document pagination remains outside thumbnail coverage.

## Historical development results

## Same-effort correction

Version 0.1.8 adds one bounded correction at unchanged model and effort before escalation. All 226 local tests pass. A live Luna Low worker corrected a deterministic total and passed the original test, but its final semantic review falsely failed. The later review-only evidence fix leaves the correct result unverified and rejects the wrong-total control. The original PDF remains blocked and an arithmetic-note error was missed. See the [full report](CORRECTION_VALIDATION_20260921.md); these results do not establish general recovery reliability.

## Execution evidence

Version 0.1.7 supplies verifier observations to focused response review. All 220 local tests pass. The live recheck no longer falsely rejects the original passing test; it remains unverified. Failed-test and unrelated-deployment controls still fail, and unavailable execution stays neutral. See the [diagnostic report](EXECUTION_REVIEW_VALIDATION_20260921.md) and [frozen comparison](FROZEN_VALIDATION_20260921.md). The original PDF recovery probe still blocks on uncertain failure cause.

## Focused error detection

Version 0.1.6 adds requirement and passage checks, a separate ownership judgment,
and one bounded evidence-resolution request. The [development report](FOCUSED_REVIEW_VALIDATION_20260921.md)
retains all calibration runs. The final 20-case run detected ten planted defects;
seven correct examples passed and two remained unverified, with no false failures.
Missing source material stayed neutral. The original PDF owner error crossed the
unchanged threshold in one final recheck; the correct PDF remained unverified.

The source passes 217 tests. The recorded Jev API cost of all eight live diagnostic runs was $0.019950. No worker reran or repaired the saved PDFs. These repeated development
cases establish a narrower observed improvement, not general detection accuracy.

## Automatic recovery and fresh comparison

Version 0.1.5 adds bounded same-model effort recovery and passes 204 local tests.
A controlled live probe repaired a failed coding test by moving Luna from Low to
Medium after Jev diagnosed a reasoning failure. The final content review remained
unverified.

The [fresh comparison](AUTOMATIC_RECOVERY_VALIDATION_20260921.md) accepted three of
four automatic outputs and all four Astra Medium outputs. The combined
model-priced worker and actual Jev proxy was $0.243538 versus $1.245957, including
the failed output. Cost per accepted result was about 74% lower. Three automatic
tasks used the economical fallback after uncertain assessment; Jev directly
selected Sol Low for research. No natural task triggered recovery. An unsupported
PDF ownership assignment remained unverified and was caught independently.

These are four development cases, not proof of equal quality or general savings.
The report preserves the failed artifact, route sources and complete cost basis.

## Desktop reliability

Version 0.1.3 added a five-minute worker inactivity limit and a clear
message when a previously reviewed file is missing. Active tools and approval
waits suspend the inactivity timer. Saved work survives; infrastructure timeouts
do not count as model quality failures. That release passed 187 local tests, TypeScript and the
production build. The 0.1.4 source passes 199 tests and includes source-revision
markers, Word table boundaries and symmetric content review for explicit model
choices. See [the follow-up](RELIABILITY_FOLLOWUP.md).

## Live workflow validation

Four scenarios passed against released commit `bcc9ab0`: explicit output-format
replacement, refinement retaining earlier tests, cancellation with saved work and
queue continuation, and review-only retry without rerunning the worker. Codex
Luna Low and Jev ran live. Claude was signed out and was not validated. The test
harness used invented fixtures and a disclosed injected review interruption.
Multiple attempts were needed to correct harness approval handling and an error
message assertion; their resource use was retained.

## Development efficiency comparison

Read the [corrected report](COST_EFFICIENCY_PILOT_20260920.md) and
[public evidence manifest](evidence/COST_EFFICIENCY_PILOT_MANIFEST.md).

The corrected comparison used four development tasks per mode and the same Jev
content-review behavior. Independent review accepted four outputs from Astra
Medium, four from Astra Ultra, and two from automatic routing. Jev selected Luna
Low for all four tasks. The two rejected outputs repeated obsolete research
guidance and incorrectly associated a document responsibility with a person.

Estimated worker API-equivalent cost plus settled Jev charges was about $1.42 for
Astra Medium, $1.76 for Astra Ultra and $0.039 for automatic routing. These are
model-priced estimates for subscription workers, not actual subscription bills
or measured allowance savings. One Medium review request has unresolved billing
uncertainty. Automatic routing reduced the estimated cost by roughly 97% in this
sample, but the outputs did not match baseline quality. Raw token counts alone do
not measure economic or subscription efficiency.

This was a first-attempt comparison with no worker repair retries. It does not
measure the full cost of an adaptive workflow that corrects mistakes. The original
pilot also had unequal automatic review behavior; it must not be presented as a
controlled cost comparison. Neither pilot used the held-out benchmark cases.

The [failure audit and protocol](FAILURE_AUDIT_AND_REPAIR_PROTOCOL_20260921.md)
records source-formatting loss, Word table extraction and a real worker ownership
error. Controlled reruns preserve the original outputs and costs. They do not
change the original first-attempt results or introduce a premium fallback.

## Bounded follow-up validation

The [follow-up report](BOUNDED_VALIDATION_20260921.md) records five new runs.
Research passed at Luna Low after source-extraction repair. The document still
failed at Low and passed at Medium. Two fresh development cases passed at fixed
Luna Medium. Including the original four-case run and every rerun, the combined
worker API-equivalent and Jev proxy was $0.06726648, versus about $1.42 and $1.76
for the original Astra baselines.

Those are operator-directed clean reruns, not demonstrated automatic recovery.
Independent review was not blinded, its offline cost is excluded, and the fresh
pair has no strong-model comparison. Jev remained unverified overall and missed
the document association in a high-probability support judgment. The results
support the economic premise within this sample; broader savings, calibrated
review and attributable subscription allowance savings remain unestablished.

## iOS companion

The iOS companion is separate development work, not part of the Mac download.
SwiftUI task controls, pairing, project scoping, approvals and file previews have
simulator coverage. Tailscale identity binding is implemented, and a tailnet-only
HTTPS mapping reached the loopback gateway while rejecting an unpaired request.
Physical iPhone, Wi-Fi-to-cellular, background/Keychain and live provider checks
remain outstanding.

## Repository updates

Completed changes and evidence should be published through reviewable branches
and pull requests as work progresses. Keep released downloads, development code
and experimental findings explicitly distinguished. A release claim requires a
matching packaged artifact and verification record.

Latest completed evaluation: [frozen 0.1.6 validation](FROZEN_VALIDATION_20260921.md).

## Unreleased parser correction

A narrow follow-up preserves numeric list markers and conservatively extracts literal ownership pairs. Review policy is v11 and focused review v10; routing policy and thresholds are unchanged. See [ADR0025](adr/0025-conservative-literal-review-extraction.md). All 256 local tests pass for this correction, along with TypeScript. This is source development, not a new desktop release or proof of improved live judgment. Installed and public downloads remain 0.1.11.
