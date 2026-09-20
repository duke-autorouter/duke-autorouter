# DUKE Autorouter

![DUKE Autorouter — lime wordmark on navy](docs/assets/duke-autorouter-banner.svg)

**Decides Using Knowledge and Evidence**

*Give it the task. It chooses the model.*

Created and maintained by [Joshua Bloodworth](https://github.com/joshdbloodworth).

A local task harness for coding, research, writing, and file deliverables. It routes
work across a small roster you select from supported Codex and Claude subscription
runtimes and optional OpenRouter models. The objective is sufficient quality with
minimal necessary resource use, conserving subscriptions and API budgets alike.
Jev assesses task difficulty and chooses an eligible model for automatic
execution. Shadow testing is available as a development diagnostic.

**Status: source preview for Apple Silicon macOS.** A standalone app can be built locally.
Live routing quality and resource savings have not been established.
Local tests and browser checks are not evidence of model quality or daily-use
reliability. See [verification](docs/VERIFICATION.md) for the exact coverage.

Start with the [step-by-step setup guide](docs/NEXT_STEPS.md).
The [architecture map](docs/assets/duke-autorouter-architecture-v3.png) shows the local
runtime, remote models, tools, and accounting boundaries.
The [brand assets](docs/assets/README.md) include outlined wordmarks, monochrome
variants, the favicon and the Mac app icon.

## Use the Mac application

After building and installing the app below, open **DUKE Autorouter** from Applications.
It starts its own local service and opens the chat interface in a dedicated Mac
window, with a Dock icon and standard window and editing commands. The **DUKE**
menu bar item brings that same window forward or quits the application and its
owned service. Closing the window keeps work running; reopen it from the Dock or
menu bar. Provider sign-in and external links open in your browser. File imports
and downloads use native file dialogs. No terminal, Codex desktop app,
Homebrew, or developer checkout is required by the installed bundle.

The package includes Node, Codex app-server, the Claude SDK runtime and Chromium.
Tasks and profiles are saved under `~/Library/Application Support/DUKE Autorouter`.
Logs are under `~/Library/Logs/DUKE Autorouter`. This initial Apple Silicon build
is locally signed; a signed and notarized public download is not provided.

## Run from source

Requirements: Node 24 or newer, npm, and a supported macOS system. The first
verified machine is Apple Silicon. Windows and Linux are not release-tested.

```sh
git clone https://github.com/duke-autorouter/duke-autorouter.git
cd duke-autorouter
npm ci
npx playwright install chromium
npm run build
npm start
```

Open the **private launch link** printed by the server. It signs this browser into
the local app. The server binds only to `127.0.0.1:4318`. Keep the launch link local.
The app continues running while its terminal process is running; it is not a
background service. Ctrl+C stops it. `PORT` changes the listening port.

No provider credentials are needed to open the interface or run local synthetic tests.
Executing real tasks requires at least one connected worker. Connecting Jev enables
its assessment, selection and review; without it, the app uses rules and shows
which checks remain incomplete. OpenRouter is optional.

Optional environment variables are documented in [.env.example](.env.example). The
app does not automatically load `.env`; use `export` or Node’s `--env-file` flag.

`npm run doctor` checks Node, Chromium, and the pinned native runtime protocols.
It does not make an inference request. `npm run dev` uses Vite middleware when a
production `dist` folder is absent; `npm run build` refreshes a production build.
Restart the server after rebuilding so its static-file routes match the new assets.

## Build the Mac application

On Apple Silicon macOS 14 or newer with Xcode Command Line Tools installed, run
the source setup above, then:

```sh
npm run package:mac
```

The packager fetches the pinned official Node runtime and verifies its SHA-256
against that version's published checksums. It bundles the locked production
packages and matching Playwright browsers, builds the Swift launcher, and signs
locally. Copy the generated `DUKE Autorouter.app` from the printed build path to
Applications. `DUKE_PACKAGE_DIR` can choose a different output directory.
`npm run test:standalone` checks the generated bundle in a disposable profile.
Do not distribute that bundle until runtime licensing and signing requirements
have been reviewed. See [release readiness](docs/RELEASE_READINESS.md).

## First task

1. Open **Connections & setup**. Connect Codex and/or Claude using their browser
   sign-in flows. Available models are discovered after sign-in. Choose the models DUKE may use under **My models**. These are separate
   app profiles; existing credentials, plugins, and context are not copied.
   Claude's **Other sign-in options** keeps official SSO, Console and full native
   setup accessible. DUKE currently routes Claude work through subscriptions;
   connecting a separately billed account does not enable paid execution.
2. Add TypeSafe and/or OpenRouter keys in the local password form. Keys are saved
   to macOS Keychain. Do not paste keys into chat or task prompts.
3. Choose **Add a project** from the task box and select a project folder.
   **Account access** optionally restricts which worker accounts can receive its context. Connected Jev assesses tasks and selects models automatically across
   projects; there is no separate project switch. Jev receives the task brief,
   expected result, tool names, model profiles, and bounded excerpts of selected task
   attachments and progress. Review includes task-file excerpts read by the worker. It also checks deliverable and source excerpts after execution.
   Imported personal setup files are not included directly. These requests use the API budget.
4. Your selected models can route immediately using provider descriptions. Optionally
   set **Starting preferences** for types of work; scoring is not part of setup. API endpoints
   are selected from current tool-capable endpoints within the catalog price caps;
   an explicit endpoint can still be pinned in advanced model settings.
5. Describe a task and start it. Automatic routing is the default. **Task options**
   contains optional result instructions, project attachments, and a manual model
   override when eligible models are available. **Advanced options** holds tool
   permissions, output-file checks, and a test command. Previewing makes no model calls.
6. Review the deliverables and automatic checks. **Usage & execution receipts**
   holds the detailed evidence. Token receipts distinguish routing,
   worker and review consumption. Feedback is optional; no user grading is required.

Use **Connections & setup → Bring your setup** to import an existing folder of
instructions, preferences, skills and agent roles. Choose **Link** for future
source edits or **Copy** for an independent editable copy. Review the detected
files and project scopes before applying. Every task keeps its own context
snapshot; imported instructions never expand tool permissions. Selected files
can be exported as a portable DUKE bundle. The earlier single-file project
import remains available. See [setup import](docs/SETUP_IMPORT.md) for supported
formats, limits and behavior.

## Operating behavior

- Jev assesses task difficulty, selects from eligible model profiles, and the
  engine dispatches automatically. It uses TypeSafe Score for difficulty and Choice
  for model selection. Uncertain decisions use automatic rules fallback.
- User-declared evaluations retain their quality and difficulty gates. Provider descriptions
  enable first-use routing; optional work preferences provide starting points.
  Jev uses early scoped outcomes and cumulative resource receipts to inform later
  choices. Related work supplies weaker guidance; unrelated roster and preference
  changes retain compatible history. Retries and routing/review calls count.
  Subscription-window receipts preserve observed allowance changes and unknowns.
  Rules honor your work preference within the same quality tier, then compare
  established token evidence. Jev can select any qualified candidate.
  Missing reports cannot establish savings. Overrides retain
  provider and tool restrictions. One task executes at a time in v0.1.
- Tasks save their history and checkpoints in SQLite. A restart marks active work
  interrupted; resume it explicitly. Native session IDs are retained as evidence,
  while subsequent stages start clean sessions using checkpoints and artifacts.
- At most two automatic recovery attempts and six stages. Workers have a bounded
  tool loop; Codex stages also have a 30-minute watchdog.
- Files are scoped to the project. Replacements keep backups. Individual file
  removal moves the file into recoverable app storage after approval.
- Shell commands run in a separate OS sandbox with network access disabled.
  Workspace reads and tests can run automatically; shell write access requires
  approval. Normal file-tool edits remain autonomous. Dependency installation
  needing the network must be done outside the worker by the user.
- Browser actions use an isolated ephemeral Chromium profile. Public HTTPS reads
  are allowed; clicks and fills require approval. This is not a general desktop
  automation or authenticated-account integration.
- API limits default to **$5/day and $25/month**, using America/New_York calendar
  boundaries. Jev is included. Reservations are retained when a response is
  uncertain; reported usage settles successful requests. **Usage & routing →
  Review request ledger** lets you record a provider-verified charge for a stopped
  task, preserving the reservation and an audit note. Unknown charges never
  become zero automatically. Limits cover this
  harness's ledger, not activity in other apps, subscription fees, credit
  purchases, or charges independently enabled in provider accounts.
- The header defaults to a **Usage** button. Open it to see API budgets and separate
  Codex/Claude allowance windows, then choose whether to pin API budget,
  subscriptions, both, or neither. This changes visibility only.
- Subscription readings include account activity outside DUKE. Unknown capacity
  stays unknown; stale readings and elapsed resets require a refresh. Claude
  uses an experimental method in the pinned SDK and degrades to unavailable
  when the runtime cannot report usage. See [usage display](docs/USAGE.md).
- No background notifications, cloud hosting, telemetry service, scheduled tasks,
  automatic teams, or public publishing are configured.

## Evaluate routing

```sh
npm test
npm run test:browser
npm run test:importer
npm run test:sandbox
npm run eval
```

The first command runs core and HTTP tests. Browser verification injects a
**synthetic worker into a separate test app**, while exercising the real UI,
SQLite, tool service, approvals, and artifact files. Production has no synthetic
worker option. The sandbox check exercises real macOS isolation with synthetic
files. `npm run eval` validates the 80-case corpus; it does not call models.

With the app running and a model connected:

```sh
npm run eval -- --run --mode strong --model 'codex:EXACT_DISCOVERED_ID' --limit 4
npm run eval -- --run --mode rules --limit 4
npm run eval -- --run --mode jev --limit 4
```

Use the exact roster ID from setup. Set Jev **Off** for the rules run and
**Automatic selection** for the Jev run. Shadow testing is a separate diagnostic
that does not test Jev dispatch. Existing API budgets still apply. Live runs require
your explicit decision to send the test briefs and consume provider usage. No live
acceptance results are included in this source preview.
Start with development cases. Use `--split held-out --limit 40` for final paired
evaluation, after development decisions are fixed. Review each saved result's
rubric, then fill `review.accepted`, `review.criticalFailure`, `review.corrections`,
and notes in `outputs/evaluations/<run>/results.json`.

```sh
npm run eval:compare -- path/to/baseline/results.json path/to/candidate/results.json
```

Comparison rejects unmatched cases or profiles, duplicate cases, development splits,
fewer than five cases per work type, and unreviewed acceptance results. It compares
acceptance by work type, latency, retries/stages, whole-task tokens by provider,
settled API costs, unresolved reservations and observed subscription-window changes.
Allowance percentages are kept separate by provider and reset window; account-wide
changes are not attributed entirely to DUKE. See [benchmark protocol](docs/BENCHMARK_PROTOCOL.md).
Benchmark tasks do not train normal routing history. Independent release evaluation
is separate from the automatic checks in normal use. Jev confidence is not a
calibrated success probability. See [routing policy](docs/ROUTING_POLICY.md).

## State and portability

Private state defaults to `.router/` in this project. `ROUTER_DATA_DIR` can point
to another private directory. Do not place it inside a selectable task workspace.
The state includes task content, instruction copies, backups, authentication
profiles, and a private launch token. Keep it out of shared folders and source
control. Stop the app before backing up the whole state directory; preserve the
SQLite database together with its WAL files.

For changes and local checks, see [contributing](CONTRIBUTING.md). For sensitive
reports and data boundaries, see [security](SECURITY.md). `npm run source:export`
creates an allowlisted source snapshot under `release/`; it never publishes it.

See [architecture](docs/ARCHITECTURE.md), [interfaces](docs/API.md), and
[verification and release gates](docs/VERIFICATION.md). The application's source
is Apache-2.0. Dependencies retain their own licenses and terms, including the
Claude runtime. See [third-party notices](THIRD_PARTY_NOTICES.md). No proprietary
runtime binaries, private context, or credentials belong in a source release.

The complete public name is **DUKE Autorouter**. See the [naming record](docs/NAME.md)
for the chosen identity and the scope of its preliminary public-use screen.
