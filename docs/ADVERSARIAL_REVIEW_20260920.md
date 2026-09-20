# September 20 adversarial review response

An Opus review examined public commit `fe885b17df8318e9dbe314618f547c521a5cf0d9`.
It was incomplete and ran on Node 22/Linux, outside the Mac release target.
Its findings exposed cases missing from the original 157 passing tests.

## Corrections in 0.1.1

| Finding | Change | Evidence |
| --- | --- | --- |
| F3: browser redirects could contact private addresses | Validate and pin network connections through a local HTTPS proxy; intercept each page redirect before dispatch. Check the final URL before returning content. | Chromium fixtures cover direct and multi-hop private redirects, redirected subresources, normal public redirects, approved POSTs and rejected cross-origin POST redirects. The private fixture received zero requests. Proxy checks reject loopback, private IPs, metadata addresses, unsupported ports, HTTP and unauthenticated clients before dialing. A real public HTTPS page also loaded with normal TLS validation. |
| F2: runner limits became failed quality observations | Return typed execution states; distinguish sandbox startup from command exit; preserve the complete JSON envelope. Incomplete execution creates an unverified outcome without a quality retry. | Tests cover timeout, output cap, signal interruption, missing executable and cancellation. A real sandbox command printing 300,000 control characters retained its output-limit result through JSON escaping. A real command exiting 126 still reports a command exit. Engine checks confirm no difficulty increase or failure observation from runner limits. |
| F4: valid rounded probabilities could be rejected | Accept totals consistent with two-decimal rounding and preserve raw probabilities. | Three-option review fixtures include totals of 0.99 and 1.01; a nine-option selection totaling 0.98 still uses Jev. A reported pass probability of 0.79 remains unverified. Invalid keys, impossible totals and unusable all-zero answers remain rejected. |
| F1: sparse failures could disable the economical fallback | Keep automatic quality-history exclusions out of the outage fallback path. Retain hard eligibility and user-declared quality checks. | A one-pass/two-failure fixture remains excluded from Jev's shortlist but can run as the configured fallback at Low effort. Disabled, unavailable, out-of-project, tool-incompatible and explicitly low-quality models remain blocked. No premium substitution occurs. |
| Case-sensitive credential exclusions | Use case-insensitive names in file tools and case-aware deny globs in the shell sandbox. | File tests reject mixed-case credential paths. Real macOS sandbox checks deny `.GIT/config`, `.AWS/credentials` and a write through `.GIT`. |
| Misleading `use_rules` description | Describe the configured economical fallback and its stopping behavior. | The routing criteria now match the implemented path. |

The review and routing policies advance to `duke-review-v3` and `duke-routing-v9`.
Existing task reviews remain visible. Earlier acceptance labels do not become
evidence under the new policy.

## Evidence limits and remaining observations

The corrected source passes 167 automated tests on macOS and nine sandbox checks.
These include synthetic providers and local browser fixtures. They do not establish
general routing accuracy, savings, or support for Linux native document tools.
No new paid model calls were needed for this correction.

The [AI SDK TypeSafe reference](https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai)
confirms two-decimal rounding. Opus's estimated rejection percentages were simulations;
we have not measured those rates across live DUKE tasks.

The assessment confidence gate and review verdict-probability gate serve different
decisions. Both thresholds remain uncalibrated policy choices. The
[routing policy](ROUTING_POLICY.md) explains that distinction. Jev may choose any
eligible configuration when it expects that choice to use fewer total resources.
An independent benchmark must test that judgment; automatic reviews alone cannot
prove it. See the [benchmark protocol](BENCHMARK_PROTOCOL.md).

A follow-up continues the original task and retains its expected files and test
command. This is useful for repairs, but changed instructions can conflict with
older criteria. That remains a disclosed limitation; a separate task avoids it.
This patch does not claim a new independent review of setup import, migrations,
concurrency or accounting. Existing coverage is listed in [Verification](VERIFICATION.md).

[ADR 0014](adr/0014-boundaries-and-incomplete-checks.md) records the alternatives
and tradeoffs behind these changes.

The [0.1.1 distribution receipt](evidence/distribution-0.1.1-verification.json)
records Apple notarization, the final package audit and the installed native
update. It does not extend the scope of the independent review.
