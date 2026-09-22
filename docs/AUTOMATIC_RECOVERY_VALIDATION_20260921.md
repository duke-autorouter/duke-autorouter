# Automatic recovery and fresh development comparison

September 21, 2026. Tested clean commit `9734cd0ed5e811590b2fdafedf952c505193eb60`, packaged as 0.1.5. Routing v11, review v5, recovery v1. The [protocol](RECOVERY_EVALUATION_PROTOCOL_20260921.md) was frozen before execution; [machine evidence](evidence/automatic-recovery-20260921.json) includes costs, usage, route sources and artifact hashes.

## Results

Automatic routing produced three independently acceptable outputs out of four. Fixed Astra Medium produced four. The automatic condition cost less after including its failed output, all routing and review calls, and model-specific worker usage.

| Condition | Independently accepted | Worker API equivalent | Actual Jev charges | Combined proxy | Proxy per accepted result |
| --- | --- | --- | --- | --- | --- |
| Automatic routing | 3 / 4 | $0.242508 | $0.001030 | $0.243538 | $0.081179 |
| Fixed Astra Medium | 4 / 4 | $1.245438 | $0.000519 | $1.245957 | $0.311489 |

That is about 80% lower total proxy cost and 74% lower cost per accepted result in this sample, with lower acceptance. Subscription workers were priced using the same frozen September 20 scenario as the prior pilot. These amounts are API equivalents, not subscription bills or measured allowance savings. Raw tokens are not interchangeable cost units. There were no unresolved API requests in these new runs.

| Task | Automatic execution | Route source | Independent result | Jev review | Astra Medium |
| --- | --- | --- | --- | --- | --- |
| Chunk an array | Luna Low | Economical fallback after uncertain assessment | Accepted | Passed | Accepted |
| Research browser context isolation | Sol Low | Jev selection | Accepted | Unverified | Accepted |
| Create a launch checklist PDF | Luna Low | Economical fallback after uncertain assessment | Rejected | Unverified | Accepted |
| Write release notes | Luna Low | Economical fallback after uncertain assessment | Accepted | Passed | Accepted |

Only the research task received a direct Jev model-effort selection. The other three used the configured economical fallback because assessment confidence did not meet the current gate. This compares the complete automatic policy, including fallback; it does not establish Jev selection superiority. The assessment gate remains a development concern. No policy was changed or task rerun after seeing these results.

The rejected PDF assigned the internal workshop to Ana although the supplied brief did not name its owner. The inference was not labeled. It also contained redundant empty checkboxes and left a completed outline unchecked. The PDF opened, had one page and was legible; the failure was content fidelity and presentation, not file corruption. Astra left the owner explicitly unresolved and labeled its proposed review action.

Research claims were checked against the official [isolation guide](https://playwright.dev/docs/browser-contexts), [authentication guide](https://playwright.dev/docs/auth) and [BrowserContext API](https://playwright.dev/docs/api/class-browsercontext). Both memos distinguished browser-side state from shared server data and labeled inference and uncertainty. Original coding checks were independently rerun. Both PDFs were rendered and inspected. Writing outputs were compared with the supplied brief.

## Controlled recovery probe

A separate probe injected an incorrect empty-array implementation and an initial Luna Low route. That first worker was synthetic and had no inference cost. The real verification command failed. Live Jev classified the cause as reasoning with probability 0.98. DUKE then dispatched the same model at Medium, retained the original test, and produced an implementation that passed it. No operator intervention occurred after launch.

The final Jev content review remained unverified. This demonstrates the repair path and a successful concrete correction, not reliable final review. The probe cost $0.000169 in Jev charges and $0.005088 including the model-priced repair worker. It is excluded from the natural comparison because of the injected route and failure.

## What the new behavior does

After a concrete failed check, Jev distinguishes reasoning failure from missing context, tool failure or uncertainty. A reasoning diagnosis at probability 0.90 or higher can move the same model up one advertised effort level. The default ceiling is Medium with at most two retries. Users can change these limits under Advanced routing options. Fixed effort overrides stay fixed. Permissions, availability and spending limits are checked again before dispatch.

Missing context, tool failures and uncertain diagnoses pause the task. An incomplete review does not justify spending another worker attempt. No natural task in this cohort triggered recovery: the document error remained unverified rather than being identified as a concrete failure. Detection remains the limiting step.

## Scope and remaining work

The four tasks were fresh development variants with explicit briefs and identical tools, skills, roster and review behavior across conditions. The policy, toolchain, case and profile hashes match. One worker attempt ran for each natural task; no manual corrections or hidden retries were made. Every failed output remains in the cost numerator. The controlled probe is reported separately.

Independent review was separate from the workers and Jev but was not blinded. Offline review cost is excluded equally from both conditions. Account-wide subscription observations do not isolate this evaluation from other use. The original shared $1 API cap stayed in force; these new phases spent $0.001718 in metered API charges including the probe.

The result supports lower model-priced cost in this sample. It does not establish equal quality, general savings, calibrated judgments or reliable natural recovery. Held-out cases remain untouched. The next evaluation should focus on detecting specific unsupported claims and on the assessment gate, with a new frozen policy and symmetric checks before drawing broader conclusions.
