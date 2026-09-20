# Getting started with DUKE Autorouter

Start with the [Mac download and installation instructions](../README.md#download-and-install).
Download availability is listed there. Contributors can use the separate
[source-build instructions](../CONTRIBUTING.md).

## 1. Open DUKE

Open **DUKE Autorouter** from Applications. It starts its background service and
opens its own Mac window. Use the Dock icon or **DUKE** menu bar item to bring that
window forward. Closing the window leaves running tasks alone. Quitting
DUKE stops work safely; saved conversations and files remain available next time.

The installed app contains its own runtimes. Its data is separate from a source
checkout’s `.router` directory. It does not require Codex desktop or a terminal.

## 2. Connect accounts

Open **Connections & setup**.

1. Choose **Connect subscription** on Codex, open the secure sign-in link, and
   finish ChatGPT sign-in. DUKE uses its own authentication profile.
2. Connect Claude with the same button on its card. Claude’s bundled sign-in flow
   opens your browser; there is no terminal command to copy.
   **Other sign-in options** exposes official SSO and Console login, plus full
   Claude Code setup in Terminal on macOS. These are optional. DUKE's Claude
   worker still uses subscription authentication; Console/cloud execution is
   not enabled or billed automatically.
3. Use **Add API key** on Jev for automatic model and effort selection.
   OpenRouter is optional; its live task path remains unverified in 0.1.
   Enter keys only in these local password fields. They are stored in Keychain.
4. The app discovers models after connection. **Check connections** refreshes
   status; **Refresh models** updates descriptions and prices.

## 3. Choose your models

Under **My models**, choose **Choose models**, select the handful you want DUKE
to use, then **Save model selection**. Search by name or filter by connection.
Catalog refreshes preserve your selection and leave new discoveries unselected.
Existing installations with legacy catalog selections may need a one-time roster
review. Accounts and settings remain saved.

Expand **Starting preferences** if you want a favorite for UI, writing,
repetitive work, debugging or another category. These are optional starting
points. Jev can choose a different selected model when the work requires it.
No model scores or qualification runs are required.

## 4. Bring your setup and choose a project

Choose **Bring your setup** under **Your setup**. Select the folder containing
your instructions, choose **Link** or **Copy**, and review the discovered files.
Link follows future source edits; Copy is independent and editable in DUKE.
Choose **Use this setup** after checking the selection and project scope. See
[the importer guide](SETUP_IMPORT.md) for updates, portable exports and supported
skills/settings. Imported agent roles are guidance, not separate running agents.

Return to **Tasks** and choose **Add a project** in the task box. Select a
folder where DUKE can read and create files, check the project name, and save.
The folder picker can create a new folder. **Account access** lets you restrict
which worker accounts can receive that project's context. You can also add
projects under **Connections & setup**.

Once connected, Jev assesses difficulty and chooses the model and effort for
tasks across your projects. There is no per-project Jev switch. Jev receives a
bounded brief, success criteria, selected attachment excerpts, project structure,
progress and model profiles. Content review includes bounded task-input, deliverable
and source excerpts. Imported setup files stay with the worker unless material
is quoted into task output. See the [routing policy](ROUTING_POLICY.md) for details.

Use **Project settings** to change which worker accounts can carry out the work.

## 5. Start a task

Click **New task**, describe the work, and check the **Project** selector.
Choose **Start task**. Automatic routing is the default.

**Task options** contains optional result instructions, attachments, and a model
override when compatible models are available. **Advanced options** holds tool
permissions, output-file checks, and a test command. None is required to begin.

On Start, DUKE rechecks permissions, availability and spending limits. Jev chooses
the model and effort. If Jev is unavailable or uncertain, DUKE uses the configured
fallback at its lowest supported effort. An unavailable fallback pauses the task.

Models in your roster are labeled **Selected**. Jev uses their provider
descriptions to choose a model. You do not need to score or evaluate models.
DUKE checks the result and can retry failed work with another suitable model.
If checks cannot finish, it saves the work with **Saved · checks incomplete**.
**Usage & execution receipts** shows the checks and reported resource use,
including retries and review. DUKE uses comparable past results to inform later
choices. **Worked** and **Needs work** are optional feedback.

## For contributors: live acceptance checks

These checks are part of release validation. They are not required for ordinary
setup. Live runs send prompts to connected providers and consume account usage.

Use a dedicated test project with nonprivate material for these checks:

| Work | Task | Acceptance evidence |
| --- | --- | --- |
| Coding | Create a small JavaScript utility and meaningful tests; run the tests with bundled Node. | Source, passing test output and reviewed result. |
| Research | Compare a narrow topic using two primary public sources. Save a cited report. | Actual retrieval events, correct links and checked claims. |
| Writing | Turn a supplied brief into a one-page explanation. | Useful result with no invented facts. |
| Documents | Create Word, PDF and spreadsheet files from a small table. | Reopened files with checked content and layout. |

Confirm a real Jev assessment and model choice led to worker execution. Run at
least one successful task through each connected worker adapter. Also check
follow-up, cancellation and restart. Synthetic tests do not replace these checks.

See [RELEASE_READINESS.md](RELEASE_READINESS.md) for the acceptance record and
[LIVE_ACCEPTANCE_TASKS.md](LIVE_ACCEPTANCE_TASKS.md) for prepared prompts.

## Data and troubleshooting

- Saved state: `~/Library/Application Support/DUKE Autorouter`.
- Service log: `~/Library/Logs/DUKE Autorouter/service.log`.
- A locked page: reopen using the DUKE menu bar item.
- A disconnected provider: use **Check connections** first; reconnect if the provider still reports that sign-in is needed.
- A stopped task: review its saved work and follow up.
- API spending defaults to $5/day and $25/month, adjustable in **Usage & routing**.
- An uncertain API charge: open **Review request ledger**, check the provider’s
  billing record, then record the verified amount and reference. This adjusts
  local accounting, not the provider’s bill. An active task must finish first.

[Architecture and routing diagrams](ARCHITECTURE.md).
