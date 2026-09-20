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
the selected public sites. Document parsing and previews run locally.

The application data directory contains task text, files, authentication profiles,
backups and the private launch token. API keys are stored in macOS Keychain or read
from environment variables. Never commit state, logs, launch links, `.env` files,
provider profiles or account screenshots. Stop the app before backing up its
database and WAL files together.

The setup importer rejects known credential paths and recognizable secrets, but
cannot determine whether every personal document is safe to share. Inspect every
selected export. Imports never authorize external actions or install services.

## Reporting a vulnerability

Do not put credentials, private task content or an exploitable vulnerability in a
public issue. If the repository offers GitHub private vulnerability reporting,
use **Security → Report a vulnerability**. Otherwise request a private reporting
channel from the maintainer without posting reproduction details. A dedicated
private reporting channel must be configured before public release; this source
preview does not advertise an invented contact address.

Provide the affected version, platform, a minimal reproduction using invented
data, the expected boundary and observed behavior. Avoid testing another person's
accounts or systems. No response-time or support guarantee is offered for this
portfolio project.
