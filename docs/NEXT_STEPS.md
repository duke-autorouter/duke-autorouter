# Getting started with DUKE Autorouter

Use the [source or Mac-app build instructions](../README.md) first. No public
notarized installer is included. The steps below apply to your own installation.

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
3. Use **Add API key** on Jev and OpenRouter for the providers you want to use.
   Enter keys only in these local password fields. They are stored in Keychain.
4. The app discovers models after connection. **Check connections** refreshes
   status; **Refresh models** updates descriptions and prices.

Sign-in success does not itself prove a model completed a task. The live checks
below establish that separately.

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

Under **Projects**, give the project a name and use **Choose folder…**. Select a
specific folder where DUKE can read and create files. The picker can create a new
folder. Select the providers allowed to receive that project’s task context.

Once connected, Jev automatically assesses difficulty and chooses the model for
tasks across your projects. There is no per-project Jev switch. Jev receives a
bounded brief, success criteria, selected attachment excerpts, project structure,
progress and model profiles. Content review includes bounded task-input, deliverable
and source excerpts. Imported setup files stay with the worker unless material
is quoted into task output. See ROUTING_POLICY.md for limits and verification behavior.

Use **Project settings** to change which worker accounts can carry out the work.

## 5. Start a task

Click **New task**, describe the work, and check the labeled **Project** selector.
Automatic routing is the default. **Task options** contains attachments, expected
files, verification commands, available tools, and the optional model override.

The preview makes no model calls. On Start, DUKE rechecks permissions,
availability and spending limits. Jev assesses difficulty and selects the worker
automatically; automatic rules handle missing or uncertain Jev responses.

Models in your roster are labeled **Selected**. Jev uses their provider
descriptions to choose a model. You do not need to score or evaluate models.
DUKE checks the result and can retry failed work with another suitable model.
If checks cannot finish, it saves the work with **Saved · checks incomplete**.
**Usage & execution receipts** contains the details. The token receipt includes routing, worker attempts and review; incomplete reports
are labeled. Subscription allowance receipts show reported account-window changes
when available. DUKE aims for sufficient quality with minimal necessary resources
across subscriptions and APIs. Early outcomes inform Jev, and unrelated model or
preference changes retain compatible history. **Worked** or **Needs work** remains
optional feedback. Developer testing is separate from normal setup.

## 6. Complete the live acceptance checks

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

[Architecture map](assets/duke-autorouter-architecture-v3.png).
