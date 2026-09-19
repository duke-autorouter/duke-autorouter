# Local interfaces

All `/api/*` routes except the session exchange require the local session cookie.
They are local application interfaces, not a remote service contract.

| Method and path | Purpose |
| --- | --- |
| POST `/api/session` | Exchange the launch token for an HttpOnly cookie |
| GET `/api/state` | Task summaries, workspaces, roster, settings, usage, approvals |
| GET `/api/events` | SSE change notifications; refetch persisted state on reconnect |
| POST `/api/workspaces` | Register a canonical project path and provider permissions |
| PUT `/api/workspaces/:id` | Update project name and worker provider permissions |
| POST `/api/system/choose-folder` | Open the installed app’s native folder picker |
| POST `/api/tasks/:id/feedback` | Save or replace the task’s Worked / Needs work rating |
| POST `/api/login/claude` | Start official browser sign-in; `method` is `subscription` (default), `console`, or `sso` |
| POST `/api/login/claude/cancel` | Cancel pending sign-in and re-read the existing account without signing it out |
| POST `/api/claude/setup` | Open the unmodified interactive Claude Code runtime in Terminal on macOS; no prompt supplied |
| POST `/api/logout/:provider` | Disconnect an idle account |
| POST `/api/workspaces/:id/import-preview` | Read one explicitly selected instruction file |
| POST `/api/workspaces/:id/import` | Save the reviewed instruction copy and hash |
| POST `/api/routes/preview` | Preview eligibility and model choice from local state; no inference, queued task, or spend reservation |
| POST `/api/tasks` | Queue a task with required capabilities and success checks |
| GET `/api/tasks/:id` | Persisted task, complete ordered event history, artifacts |
| POST `/api/tasks/:id/cancel` | Stop the worker and retain evidence |
| POST `/api/tasks/:id/resume` | Resume from checkpoint with optional follow-up |
| POST `/api/approvals/:id` | Resolve one live approval with its operation hash |
| PUT `/api/models/:id` | Edit a profile or record user-declared evaluation evidence |
| GET `/api/models/:id/endpoints` | Discover exact OpenRouter providers and prices |
| PUT `/api/settings` | Update spending limits and Jev routing policy |
| PUT `/api/preferences` | Save `usageDisplay`: `compact`, `api`, `subscriptions`, or `both`; rejects unrelated settings |
| POST `/api/usage/refresh` | Read connected Codex/Claude subscription metadata without inference; one-minute cooldown and concurrent-request deduplication |
| POST `/api/keys/:provider` | Store an OpenRouter/TypeSafe key in macOS Keychain |
| POST `/api/health` | Read runtime account and quota metadata without inference |
| POST `/api/login/codex` | Start supported ChatGPT sign-in |
| POST `/api/discover/:provider` | Discover models and descriptions; new entries remain unselected |
| GET `/api/spending` | Reservations, settlements and audited corrections |
| POST `/api/spending/:id/reconcile` | Record `actualUSD`, expected `reservedMicros` and a billing `note` for a stopped task; rejects stale or duplicate corrections |
| GET `/api/artifacts/:id` | Hash-checked preview; `?download=1` for download |

`server/types.ts` defines task, route, model, workspace, checkpoint, approval, and
worker contracts. `server/tools.ts` defines the shared tool schemas. There are no
tools for modifying app configuration or budget policies from inside a task.

Display preferences are stored independently from routing settings. Account
usage reads preserve last-known data on failure, mark it stale, and never turn a
telemetry failure into a disconnected account. Sign-in/out invalidates in-flight
reads. The client treats data older than fifteen minutes or past its reset as
needing refresh. See [usage display](USAGE.md) for provider-specific limits.

Claude health distinguishes `connection.signedIn` and `connection.billing` from
`ready` for DUKE task routing. The latter currently requires subscription
authentication. Console/cloud authentication is retained by Claude Code but
does not enable unconfigured paid task execution in DUKE. Account switching is
rejected while a task is active. Pending browser sign-in temporarily excludes
Claude from routing; cancelling rechecks the existing connection.

Project input no longer includes a `jevAllowed` permission. Connected Jev participates
in automatic routing across projects; stored legacy values do not disable it.
The global `assist` default applies its assessment and model selection. `observe`
and `off` remain diagnostic modes under Advanced routing diagnostics.

The route preview accepts task input and returns `available` or `blocked`, the
estimated route when available, an explanation, and compatible manual-trial
models. It shares execution's permission, tool, quality, difficulty coverage, budget estimates, and recently recorded
availability checks. It does not validate attachments, refresh provider health,
reserve budget, or call Jev. With Jev automatic selection, `jevMayRefine` indicates that Jev will
assess difficulty and choose a worker at execution. Preview estimates omit
attachment contents and imported instructions; execution computes the complete
first-request bound. Execution still runs all
of its checks independently.

Routes now include `assessment` (task family, difficulty, source, and optional Jev
score/confidence) and `selectionSource` (`jev`, `rules`, or `manual`). Model profiles
support `maxDifficulty` (`routine`, `standard`, `complex`) and `routingNotes`.
Evaluated legacy models without difficulty coverage qualify for routine work only.
Provider-described models can route immediately, with quality explicitly unmeasured.
Catalog descriptions and aggregated task feedback are included in model profiles.

New adapters implement `Worker.run(WorkerContext)`. Tools must run through
`context.tool`, usage through the ledger, and session references through
`context.session`. A fallback must preserve the task's workspace and capabilities.
No adapter may infer permission from prompt text or classifier confidence.

Provider-native reasoning is not shown as a product feature. User-facing events
are result text, concise status, tools, approvals, checkpoints, sources, and usage.
