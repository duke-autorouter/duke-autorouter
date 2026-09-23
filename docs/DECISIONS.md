# Decision log

DUKE's purpose is to finish useful work with the least necessary model resources.
This log records decisions that affect that purpose, their costs, and the evidence
needed to keep or revisit them. It is a retrospective record written during the
September 2026 release pass, not a reconstructed transcript or a claim that every
decision was documented when first made.

| Decision | Status | Reason and consequence |
| --- | --- | --- |
| [Defer requirement coverage metadata](adr/0022-defer-requirement-coverage-metadata.md) | Deferred; PR13 closed without runtime changes | Advisory mappings add lifecycle complexity without securing verifier dependencies or certifying requirements. Preserve the design and revisit criteria. |
| [Own the task and use a shared tool layer](adr/0001-shared-task-harness.md) | Implemented; installed checks passed | Consistent permissions, recovery and receipts across workers. DUKE must also supply the tools and workflow quality its users expect. |
| [Route over a chosen roster, model and effort](adr/0002-efficient-routing.md) | Implemented | Bound the choice to the user's models and use only the model capability and effort the task needs. A fallback is economical and explicit. |
| [Keep verification evidence separate from model confidence](adr/0003-verification-and-learning.md) | Implemented; repaired coverage checked | A confident answer, valid file or successful command cannot establish every aspect of task quality. Unknowns remain visible and do not count as success evidence. |
| [Keep skills distinct from tools](adr/0004-skills-and-tools.md) | Implemented and package checked | Skills describe the work; tools execute it. Imported instructions supplement a usable packaged baseline. |
| [Ship a downloadable local Mac app and source](adr/0005-local-mac-release.md) | Accepted for the 0.1 public prerelease | A prebuilt download is the normal install. Source-build instructions serve contributors; a hosted service is unnecessary. |
| [Give Jev the routing decision](adr/0006-jev-as-router.md) | Implemented | Typed assessment and choice remove routine model selection while the harness enforces eligibility. Correct shape does not prove good judgment. |
| [Support subscriptions and optional API workers](adr/0007-provider-integrations.md) | Implemented; provider limits documented | Use existing capacity and selected API models through isolated profiles. Validate each execution path separately. |
| [Make a task the default interaction](adr/0008-simple-default-interface.md) | Implemented | Chat first, optional fine-tuning, quiet usage, and actionable setup states. |
| [Import reviewed setups by Link or Copy](adr/0009-portable-setup-import.md) | Implemented | Preserve existing working preferences without importing credentials, executable authority or every source-app feature. |
| [Keep permissions and recovery in the harness](adr/0010-permissions-and-recovery.md) | Implemented with bounded coverage | Project-scoped tools, approved side effects, retained versions, explicit resume and a persistent action ledger. |
| [Learn from whole-task resources](adr/0011-resource-accounting.md) | Implemented; savings unmeasured | Include retries and reviews, distinguish API cost from subscription capacity, and scope evidence to comparable execution. |
| [Use bounded search and inspect original sources](adr/0012-public-retrieval.md) | Implemented; live check passed | Keyless search avoids another setup account. Service limits stay explicit, and citations require original-source reading. |
| [Use verdict probability for automatic review](adr/0013-review-probability-threshold.md) | Implemented; nine live diagnostic cases checked | Distribution confidence and answer probability have different meanings. Keep both, apply the cutoff to the verdict, and preserve uncertain outcomes. |
| [Enforce network boundaries before contact and keep runner limits neutral](adr/0014-boundaries-and-incomplete-checks.md) | Implemented in 0.1.1; regression checks passed | Redirects cannot bypass the private-network guard. Execution limits remain incomplete checks. Rounded probabilities and sparse history do not unnecessarily disable automatic routing or its economical fallback. |
| [Preserve task requirements and bound incomplete operations](adr/0015-task-revisions-and-bounded-checks.md) | Implemented for 0.1.2 | Follow-ups retain applicable tests, preparation has deadlines, and incomplete reviews can be retried without another worker run. |
| [Check evidence before increasing model effort](adr/0016-evidence-fidelity-and-bounded-evaluation.md) | Implemented for 0.1.4; bounded development validation | Preserve source structure, compare equivalent review behavior, and count failed attempts. Controlled reruns do not prove automatic recovery. |
| [Retry reasoning failures within explicit limits](adr/0017-bounded-same-model-recovery.md) | Implemented in 0.1.5; controlled live repair passed | Jev diagnoses the failure; a same-model effort step respects user limits and retains full costs. |
| [Check specific claims before retrying work](adr/0018-focused-review-and-evidence-resolution.md) | Implemented for 0.1.6; bounded live development checks | Separate ownership claims, resolve uncertain evidence once, and retain false-alarm results. |
| [Carry verifier observations into response review](adr/0019-verifier-evidence-in-response-review.md) | Implemented for 0.1.7; bounded live checks | Give focused review the actual task-specific verifier receipt while keeping incomplete execution neutral. |
| [Correct at unchanged effort before escalating](adr/0020-bounded-correction-before-effort-escalation.md) | Implemented for 0.1.8; bounded development validation | Use a 0.80 gate for one same-model, same-effort correction before the separate 0.90 effort-escalation judgment, inside the shared retry cap. |
| [Add a narrow remote boundary for the iOS companion](adr/0021-ios-companion-remote-boundary.md) | Implemented; physical-device validation open | Keep the local API loopback-only while giving paired devices project-scoped task, approval and artifact access through an opt-in gateway. |

## What changed after testing

- The identity settled on **DUKE Autorouter**, with DUKE meaning **Decides Using Knowledge and Evidence**. Exact combined-name screening informed the choice; it did not establish trademark clearance.
- A standalone native Mac app replaced the development-server experience as the end-user target. A downloadable app is required; asking users to package it was corrected.
- A chat-first interface replaced the proposed persistent three-pane workspace. Usage became optional, and advanced controls moved out of the normal task path.
- Linked and copied setup imports became separate supported choices rather than one assumed preference.
- A small selected roster replaced the initial emphasis on a broad model catalog.
- Efficiency now applies to subscription capacity as well as API spending.
- Jev chooses supported reasoning effort along with the model. Evidence at Low
  does not establish performance at Max.
- A flat model-choice distribution no longer triggers a premium fallback.
  Uncertain assessment uses the configured fallback at its lowest supported effort.
- Live checks exposed differences between provider-native tools and DUKE's own
  tool layer. The [default tool audit](TOOL_AUDIT.md) records repairs, package and
  live rechecks, and remaining limits.
- Structural document checks accepted files with poor presentation. The audit
  now requires inspection of saved outputs and explicit coverage limits.
- Live research exposed search failures and a screenshot returned without an
  image reaching Codex. The repaired retrieval and image paths were rechecked
  with Luna. Workbook previews now show explicit ranges after Quick Look cropped
  values during a Claude check.
- Release review found that the signer replaced Anthropic's signature on Claude.
  The corrected signer preserves its published bytes and signature, rejects an
  altered copy, and checks the delivered app again. No private candidate was published.

For current implementation details use the [architecture](ARCHITECTURE.md),
[routing policy](ROUTING_POLICY.md), and [verification record](VERIFICATION.md).
When a decision changes, add a superseding ADR and retain the original rationale.

## Maintaining this record

Add an ADR when a choice materially changes product behavior, architecture,
authority, evaluation or distribution. Record the problem, decision, plausible
alternatives, costs, evidence and reason to revisit it. Link implementation and
verification without copying private accounts, transcripts or runtime state.

Small visual fixes belong in commits or release notes. Keep accepted decisions
when superseded and link their replacement. Open validation gates belong in
[release readiness](RELEASE_READINESS.md), not in an invented historical success
claim. This log describes the entire project; the tool audit is one supporting
record.

- [ADR 0023: Ordinal difficulty and review clauses](adr/0023-ordinal-difficulty-and-review-clauses.md) records the 0.1.10 judgment maintenance policy and its development evidence.
- [ADR 0024: Context-preserving requirement batches](adr/0024-context-preserving-requirement-batches.md) records the 0.1.11 parser and review coverage changes, costs and remaining difficulty-tail limitation.

- [ADR0025: Conservative literal review extraction](adr/0025-conservative-literal-review-extraction.md) — preserve numbered requirements and omit ambiguous ownership pairs; source-only follow-up to the first fresh factory cycle.
