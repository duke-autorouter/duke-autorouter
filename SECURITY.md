# Security and private data

DUKE runs a local authenticated service bound to `127.0.0.1`. Its task tools enforce
project paths, provider permissions and action approvals. The shell uses a separate
OS sandbox with network access disabled. These controls are covered by local
tests; they are not a security audit or a guarantee against malicious content.

Task prompts and selected context go to the chosen remote worker. Connected Jev
receives bounded routing and review evidence as described in
[routing policy](docs/ROUTING_POLICY.md). Local storage does not mean local inference.

The public web search tool sends its query to Tavily's keyless search endpoint.
It sends no DUKE credentials or API key. Queries can still contain information
from the task, so they are external data sharing. The service has its own limits;
DUKE does not fall back to paid search. Web reads and browser requests contact
the selected public sites. The browser uses a task-scoped HTTPS proxy that pins
connections to validated public IP addresses, including redirected requests.
Request interception also checks each page redirect and approved write origin.
WebSockets and service workers are disabled. Credential paths are excluded
without regard to letter case. Document parsing and previews run locally.

Version 0.1.1 fixes a browser redirect boundary defect in 0.1.0. Update the app
before using browser research. The [review response](docs/ADVERSARIAL_REVIEW_20260920.md)
records the fix and regression coverage.

The application data directory contains task text, files, authentication profiles,
backups and the private launch token. API keys are stored in macOS Keychain or read
from environment variables. Never commit state, logs, launch links, `.env` files,
provider profiles or account screenshots. Stop the app before backing up its
database and WAL files together.

The setup importer rejects known credential paths and recognizable secrets, but
cannot determine whether every personal document is safe to share. Inspect every
selected export. Imports never authorize external actions or install services.

## Release checks

Before sharing source, run `npm run security:secrets` in a full Git clone.
The check scans every reachable commit and tracked working file, rejects private
state paths, and fails on unresolved findings. File-checksum findings are accepted
only when the checksum matches the referenced source bytes. The
[release audit](docs/evidence/secret-audit.json) records the separate document,
screenshot and packaged-app review. This checks for exposed credentials; it is
not an independent security assessment.

If a credential is committed, revoke or rotate it before rewriting history.
Deleting the current file does not remove it from earlier commits or copies.

## Reporting a vulnerability

Use **Security → Report a vulnerability** for a private report to the maintainer.
Do not put credentials, private task content or an exploitable vulnerability in a
public issue. If that form is unavailable, request a private reporting channel
without posting reproduction details.

Provide the affected version, platform, a minimal reproduction using invented
data, the expected boundary and observed behavior. Avoid testing another person's
accounts or systems. No response-time or support guarantee is offered for this
portfolio project.
