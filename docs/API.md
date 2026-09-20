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
| POST `/api/tasks/:id/review` | Queue a retry of incomplete checks on a saved result; no worker execution |
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
| GET `/api/artifacts/:id` | Hash-checked file; `?download=1` for download |
| GET `/api/artifacts/:id/preview` | Authenticated, hash-checked image preview; optional PDF `page` or workbook `sheet`/`range`. Returns bounded coverage metadata. |

The local interface also owns iPhone consent. `POST
/api/remote/pairing-challenges` creates an expiring, one-use challenge for an
explicit list of registered project IDs. `GET /api/remote/devices` lists paired
devices without credential hashes. `POST /api/remote/devices/:id/revoke`
revokes one device. These routes retain the local session, Host and Origin
checks above.

## iPhone gateway

The iPhone gateway is a separate, opt-in Fastify listener. It binds to loopback
and requires private HTTPS termination in front of it. It is disabled unless
`DUKE_REMOTE_ENABLE=1`. The production gateway rejects plaintext requests; the
synthetic development fixture is the only code path that permits local HTTP.
The default production mode also requires Tailscale Serve's authenticated
`Tailscale-User-Login` header and binds the device credential to that identity.

`POST /remote/v1/pair` exchanges a valid one-use challenge for a random
per-device bearer credential. Other routes require that credential and apply
its saved project scope.

| Method and path | Purpose |
| --- | --- |
| GET `/remote/v1/state` | Scoped projects, task summaries, pending approvals and artifacts |
| GET `/remote/v1/tasks/:id` | One scoped task, user-facing persisted history and artifacts; routing and model events are omitted |
| POST `/remote/v1/tasks` | Start work without a model or effort override |
| POST `/remote/v1/tasks/:id/follow-ups` | Continue stopped work with a user follow-up |
| POST `/remote/v1/tasks/:id/cancel` | Stop current work without claiming to undo completed effects |
| POST `/remote/v1/approvals/:id` | Decide a live approval using its stored operation hash |
| GET `/remote/v1/artifacts/:id` | Download one scoped, hash-checked artifact |

Every remote mutation requires a UUID `Idempotency-Key`. The Mac stores the
request fingerprint and result. Identical retries return the saved result;
conflicting reuse is rejected. A command left pending by a process interruption
is not executed again automatically.

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

### Fallback and effort

`PUT /api/settings` accepts `jevFallbackModel`, a selected model ID. An empty string
uses an available selected Luna or Haiku. A newly configured ID must be enabled.
If it later becomes unavailable, execution blocks rather than choosing an
unconfigured model. Routes record optional `effort`; omission means provider
default. Model profiles expose advertised `supportedEfforts` and per-effort
`effortProfiles` evidence. Provider catalog refresh owns supported levels.

## Shared worker tools

These are model-facing tool calls through the adapters, not unauthenticated HTTP
endpoints. Task capabilities and project scope are enforced by the service.

| Tool | Contract and limits |
| --- | --- |
| `setup_list`, `setup_read` | Read packaged core skills and approved task setup snapshots. A setup cannot grant permissions. |
| `list_files` | Sorted directory entries, 500 per page; `offset`, `total` and `nextOffset` expose pagination. |
| `read_file` | UTF-8, saved PDF text, Word main text and XLSX cells/formulas; 2 MB input, bounded lines and explicit extraction limits. |
| `search_files` | Literal text, project scope, line numbers; at most 1,000 files/10 MB/100 matches; excludes credentials, links, dependencies and binary files. |
| `write_file`, `edit_file` | Text output or one unique exact replacement, with retained previous bytes. Ambiguous replacements fail without modifying the file. |
| `remove_file` | Approved, recoverable removal with content revalidation. |
| `shell` | Network-isolated execution; project writes need approval. Node is bundled; other language runtimes are project prerequisites. |
| `web_search`, `web_read` | Keyless Tavily discovery and public HTTPS source reading, including text-based PDFs under 2 MB. Search results alone cannot support citations. Rate limits, unsupported binary pages and empty responses fail explicitly. |
| `browser` | Isolated public browser; approved clicks/fills, bounded reads and viewport screenshots. |
| `create_artifact` | Markdown, HTML, basic Word/PDF, and XLSX with `rows` or named `sheets`. Formula cells use `{ "formula": "SUM(B2:B4)" }`; strings beginning with `=` remain text. |
| `preview_file` | PDF `page`, PNG/JPEG, static HTML viewport, Word Quick Look thumbnail, or XLSX `sheet` and `range` (for example `A1:D12`). XLSX previews show saved cells, up to 50 rows and 12 columns, rather than native Excel styling. Word previews may cover only the first page. Returns image data and coverage. |
| `checkpoint` | Completed work, remaining work and artifact paths for the next stage. |

Images use each adapter's image-content protocol, with only metadata retained in
tool event receipts. Codex's code-mode bridge receives instructions to emit the
image from its string-wrapped tool result; returning a data URL alone does not
prove that the model viewed it. OpenRouter requires verified vision support and image rates
within the approved price ceiling; missing metadata produces an explicit visual
limitation instead of an unbounded image request. Static HTML rendering disables
scripts and subresources and does not verify an interactive app.

The calculation worker has cell, formula-length, time and memory limits. External
workbook links, structured references, macros and native Excel parity are outside
this contract. Reads may report cached values with calculations unverified when
an imported workbook uses unsupported formulas. Artifact creation fails on
unsupported formulas or calculation errors.

XLSX previews display saved formula caches. Use `read_file` to recalculate and
report any unsupported formulas before relying on those values. PDF extraction
reports pages without readable text, including image-only pages in a mixed PDF.
OCR is not bundled.

Execution evidence includes `duke-tools-v2` and the hashes of packaged skills.
Changes to these invalidate incompatible learning observations.
