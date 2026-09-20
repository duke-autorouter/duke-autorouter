# Contributing

DUKE Autorouter is a local, chat-first routing harness. Keep changes focused on
choosing sufficient capability, checking results and accounting for whole-task
resource use across subscriptions and APIs. Start from the small selected roster.

## Local development

Use Apple Silicon macOS and Node 24 or newer. Run `npm ci`,
`npx playwright install chromium`, then `npm run build` and `npm start`.
The app prints a private local launch link. Do not paste it into issues or logs.
See [getting started](docs/NEXT_STEPS.md) for account and project setup.

Before submitting a change, run the checks relevant to its behavior:

```sh
npm run check
npm test
npm run build
npm run eval
npm run security:secrets
```

For interface or import changes, also run `npm run test:browser` and
`npm run test:importer`. These use synthetic workers, real files and temporary
databases. For sandbox or runtime changes, run `npm run test:sandbox`, build the
Mac app, and run `npm run test:standalone`. Native checks need local process and
socket permissions. Keep any incomplete or platform-specific checks visible.

No live model calls are needed for routine tests. Live acceptance and comparison
runs require your own accounts and an explicit spending decision. Keep model
credentials out of test fixtures. Benchmark tasks are excluded from normal
learning, and model-generated reviews do not establish independent quality.

## Build the standalone Mac app

Source builds require an Apple Silicon Mac, macOS 14+, Node 24+, npm and Xcode
Command Line Tools. These are contributor requirements; ordinary users install
prebuilt downloads.

```sh
git clone https://github.com/duke-autorouter/duke-autorouter.git
cd duke-autorouter
npm ci
npx playwright install chromium
npm run package:mac
npm run test:standalone
```

The command prints the built `DUKE Autorouter.app` path. Local builds use ad hoc
signing. Keep them distinct from the Developer ID-signed, notarized download.
Use the [Mac distribution guide](docs/MAC_DISTRIBUTION.md) for release preparation.

## Changes and reports

Describe the concrete behavior, reproduction and evidence. Include a small
regression test for authority, accounting, persistence or routing logic changes.
UI copy and layout changes can use interaction and screenshot checks.

Preserve these boundaries:

- Jev selects automatically; no mandatory user grading or invented model scores.
- Preferences cannot bypass project, capability or budget limits. The explicit
  economical fallback may attempt work below declared difficulty coverage; normal
  Jev selection still uses qualified profiles.
- Unknown usage remains unknown. Include retries and review in task costs.
- Imported instructions do not install tools or expand permissions.
- Provider runtimes and task content stay outside the public source snapshot.

`npm run source:export` writes a new allowlisted snapshot under `release/` and
refuses to replace a nonempty directory. It does not publish or create a Git repo.
Review the snapshot and [release checklist](docs/RELEASE_READINESS.md) before sharing.

Run the secret check from the release Git repository with full history. It
downloads a pinned, checksum-verified Gitleaks executable, then scans locally.
Set `GITLEAKS_BIN` to an existing 8.30.1 executable to avoid the download. Reports
contain finding locations, never credential values. CI runs the same check.
Screenshots, rendered documents and the final app still need release review.

For a model upgrade, check its official protocol, package license and provider
terms against the pinned adapters. A successful catalog read is not evidence of
working inference or subscription entitlement.
