# Usage display

The header shows a **Usage** button by default. Its panel contains API spending
against the daily and monthly limits and separate subscription allowance cards.
Choose **Show in header** to pin the API budget, subscriptions, both, or keep only
the button. The same preference is in **Usage & routing**. It survives restarts.
Small screens keep the button to leave room for work.

The preference affects display only. It cannot edit budget limits, turn off Jev,
change routing policy or spend money. Fresh readings at 90% used or above, and a
reached API budget, put an attention indicator on the button even in compact mode.

## What each number means

- API spending covers DUKE's ledger, including reservations and unresolved
  charges, using its configured calendar timezone. It does not include other
  apps, subscription fees or account-level extra-usage charges.
- Subscription percentages cover the provider account, including other apps.
  Each window is displayed separately with its reset time. Model-scoped limits
  keep their model labels. Percentages from different windows are never added.
- The header's subscription summary names one unscoped window. Open Usage for
  all windows and model-specific limits; that summary does not imply all models
  have the same allowance.
- Missing values are unavailable, never zero use or 100% remaining. After fifteen
  minutes, after a failed refresh, or after the reported reset, the interface
  labels the reading as last known or needing refresh. It never invents a new
  allowance when a reset time passes.

## Retrieval and limitations

Opening the panel or choosing Refresh reads connected account metadata. Reads
are deduplicated with a one-minute server cooldown; no idle polling or model
prompt is needed. A failed provider read leaves the other provider usable and
does not disconnect an authenticated account. The SDK's local transcript scan is
explicitly skipped. No token files, cookies or private web endpoints are scraped.

Codex uses `account/read` and `account/rateLimits/read` through the pinned official
app-server. Its keyed buckets take precedence over the legacy mirrored bucket.
Existing task-time Codex quota updates also refresh the display.

Claude Agent SDK 0.3.280 exposes
`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })`.
The pinned SDK declares this method unstable. DUKE isolates the call and retains
only plan windows from the response, with bounded timeouts and an unavailable
fallback. Five-hour, seven-day, Opus/Sonnet/OAuth-app and server-named model windows
are supported when present. Its utilization values are percentages from 0–100;
they are not the separate rate-limit event's utilization representation. Extra
usage and session API-equivalent costs are not added to the API ledger.

This addition displays Claude account usage. It does not change Claude routing
eligibility or establish before/after task attribution. Subscription readings do
not prove model-task execution, routing quality or savings. Subscription
distribution considerations are assessed below and tracked in
[release readiness](RELEASE_READINESS.md).

Sources: the pinned runtimes' shipped TypeScript contracts and Anthropic's
[status-line reference](https://code.claude.com/docs/en/statusline) for subscription
window semantics. The SDK method's experimental contract is kept in the adapter;
the UI does not depend directly on it.

Local checks: `npm test`, `node --import tsx scripts/usage-browser-check.ts`, and
the packaged restart check. Browser tests use invented account readings and
workers that reject inference. Connected-account metadata checks are recorded
separately from those synthetic checks.

## Claude runtime and setup

The September 19 setup review used SDK 0.3.275 and its declared Claude Code
version 2.1.275. It checked account choices without live inference. Later Codex
and Claude task checks are recorded in [verification](VERIFICATION.md). The
September 20 distribution review also checks the packaged Claude binary against
the pinned dependency before and after signing.

### Verified implementation

- [The adapter](../server/adapters/claude.ts) passes the official platform
  executable to the SDK through `pathToClaudeCodeExecutable`.
  [Resolution](../server/runtime.ts) uses the pinned SDK runtime dependency.
  The release candidate's executable and the dependency executable have the same
  SHA-256: `1b8177fe49f2be5bacc75e89b5f88fa7454791283113ace16a453fe9171d179b`.
  The release signer preserves Anthropic's original signature and rejects a
  changed runtime.
- [Sign-in](../server/claude-login.ts) launches the official binary's
  `auth login` for its subscription default, `--console` for Console, or `--sso`
  for organization sign-in. The binary handles OAuth, browser callback and
  credential persistence in the local DUKE profile. DUKE receives the sign-in
  URL and process result; it does not extract subscription tokens.
- [Full setup](../server/claude-setup.ts) opens the same unmodified binary in
  Terminal, without an injected prompt or authentication-selection flag. This
  optional path exposes its own account, API-key and cloud-provider setup. It
  uses DUKE's existing isolated profile; users return to DUKE and choose Check
  connections afterward. Ordinary subscription connection needs no Terminal.
- [Authentication detection](../server/claude-auth.ts) reports sign-in and
  billing separately from DUKE routing readiness. A separately billed or unknown
  connection cannot masquerade as an available subscription or show old quota.
  The existing worker continues to require subscription authentication, and its
  [environment](../server/process.ts) excludes inherited provider keys. Direct
  Claude API/cloud routing remains outside the current worker's supported scope.
- Execution is local through the SDK and the official process. DUKE's service
  binds to loopback. There is no DUKE-operated shared credential or inference
  billing service. The existing task-scoped tool broker remains in place.

### Scope of the setup change

Subscription routing is retained. Additional account choices are optional and
do not require existing users to reconnect. Cancelling a browser sign-in rechecks
the prior connection; opening setup does not reset credentials. Provider-native
setup runs in a separate Terminal session, not inside DUKE's task tool broker.

Any API or cloud route needs explicit configuration, authorization and correct
spend accounting before DUKE can run it. Merely signing in is not that
authorization. The native binary's authentication options are accessible, while
DUKE's own worker coverage is still narrower. This change does not claim support
for every provider or verify native SSO/cloud account setup.
