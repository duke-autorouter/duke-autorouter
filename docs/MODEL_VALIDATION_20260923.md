# September 23 live model checks

GPT-6 Luna, GPT-6 Sol and Opus 5.5 each completed the same small fictional inventory task at Low effort using DUKE 0.1.9's adapters and shared tools. Each saved the exact correct JSON, preserved the supplied input and verifier, and completed DUKE's review. These explicit-model checks establish basic integration, not automatic routing quality or comparative efficiency.

The task supplied three item quantities and integer unit prices, specified the calculation and output fields, and included an unchanged verification command. Independent acceptance compared the parsed output to the expected values and checked input/verifier integrity. All three passed. Total recorded Jev review cost was $0.000499; all requests reconciled. Worker execution used the existing subscriptions. Reported tokens are retained separately from API spending.

The [sanitized receipt](evidence/model-smoke-20260923.json) records model IDs, effort, routes, usage and acceptance. The protocol is in `scripts/validate-model-refresh.ts`; it uses an isolated task store, a disposable Codex authentication copy, and the existing Claude account profile. It does not change the installed app's task store, projects or settings. It denies approval requests, permits scoped tools, caps Jev spending at $0.05 and disables recovery for these integration checks.

A Claude SDK warning says broad allowed-tool entries bypass its `canUseTool` callback. DUKE also applies its existing `PreToolUse` allowlist and shared tool-layer permission checks. This run did not establish broader permission-boundary coverage; it found no failed integration check.

The routing comparison and controlled recovery probe are separate work. These three small integration checks do not establish broad quality, savings, second-device behavior or long-running reliability.
