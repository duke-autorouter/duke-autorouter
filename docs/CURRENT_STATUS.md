# Current development status

Updated September 21, 2026.

The downloadable Mac prerelease remains **0.1.2**. Development changes and
validation results below do not imply a new signed download has been published.

## Desktop reliability

The maintenance branch adds a five-minute worker inactivity limit and a clear
message when a previously reviewed file is missing. Active tools and approval
waits suspend the inactivity timer. Saved work survives; infrastructure timeouts
do not count as model quality failures. All 187 local tests, TypeScript and the
production build passed. See [the follow-up](RELIABILITY_FOLLOWUP.md).

## Live workflow validation

Four scenarios passed against released commit `bcc9ab0`: explicit output-format
replacement, refinement retaining earlier tests, cancellation with saved work and
queue continuation, and review-only retry without rerunning the worker. Codex
Luna Low and Jev ran live. Claude was signed out and was not validated. The test
harness used invented fixtures and a disclosed injected review interruption.
Multiple attempts were needed to correct harness approval handling and an error
message assertion; their resource use was retained.

## Development efficiency comparison

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

Next: audit prompt clarity and tool-provided evidence, investigate whether source
extraction preserved obsolete-text markings, and measure bounded repair with
specific feedback, higher effort or a different model. Validate improvements on
fresh cases. No automatic premium fallback is introduced by this investigation.

## iOS companion

The iOS companion is separate development work, not part of the Mac download.
SwiftUI task controls, pairing, project scoping, approvals and file previews have
simulator coverage. Tailscale identity binding is implemented. Physical iPhone,
private transport and live remote execution checks remain outstanding.

## Repository updates

Completed changes and evidence should be published through reviewable branches
and pull requests as work progresses. Keep released downloads, development code
and experimental findings explicitly distinguished. A release claim requires a
matching packaged artifact and verification record.
