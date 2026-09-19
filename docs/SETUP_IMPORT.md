# Bring your setup

Open **Connections & setup → Bring your setup**. Choose the folder containing
your existing instructions. The Mac app opens a native folder picker; source
builds also accept a folder path. Nothing is sent to a model while scanning or
reviewing the folder.

1. Choose **Link to existing files** or **Copy into DUKE**.
2. Review the recommended files. Expand a row to read its content and notices.
   Choose one entry point if both AGENTS.md and CLAUDE.md cover the same scope.
3. Apply general preferences across projects or to a selected project. Map
   nested project rules to their project. Optionally add detected folders as
   writable projects; importing context by itself does not grant writes there.
4. Choose **Use this setup**. Subsequent tasks receive the approved context.

New projects created here allow the selected Codex, Claude and OpenRouter
models to receive their task context. The preview discloses this; use **Project
settings** to narrow permissions before starting work. Existing project
permissions are preserved.

## Link and Copy

Link reads current versions of approved files when a **new task starts**. Missing
files or inaccessible folders block preparation with a message; stale copies are
not silently used. Changed references to unapproved material produce a task
notice. **Review updates / locate folder** discovers new files, reviews changes,
and can relink a moved source. Newly detected files are not selected automatically
when updating an existing setup.

Copy stores text under DUKE's private application data in SQLite. It is independent
of the source directory. **View files → Edit copy** changes a copy. A reviewed
refresh explicitly replaces selected copies with the displayed source versions;
the server rejects a refresh if the saved copy changed after preview.

Each task captures exact text, hashes, scope, source name and mode. Continuing,
recovering or switching workers within that task uses the same snapshot. To use
new setup versions, start a new task. **Setup used for this task** displays its
receipt. Removing a setup stops future use but keeps originals and past receipts.

## Supported inputs

| Input | Behavior |
| --- | --- |
| AGENTS.md / CLAUDE.md | Alternative operating entry points. Preserve the selected file and its conditional instructions. |
| Markdown/text preferences | Root files are available for review. Voice, personal-context and style filenames suggest preferences; the user approves their content and scope. |
| Markdown links, `[[wiki links]]`, backtick file references and `@relative.md` | Follow local references within the selected root. Basename wiki links must be unambiguous. Cycles are reported and each file is included once. |
| SKILL.md | Import instructions, a name/description, simple inline or YAML-list tool requirements, and explicitly referenced text support files. |
| agents/ or roles/ Markdown | Readable role guidance. Unsupported tool requirements are displayed. |
| Agent TOML | Narrow adapter for `developer_instructions` in a quoted string or triple-quoted block. Other runtime fields do not transfer. |
| settings.json, settings.local.json, preferences.json, config.toml | Only top-level language and writing-style string preferences. JSON is parsed; TOML supports simple quoted top-level values. Unsupported settings are reported, not executed. |

The portable preference allowlist is `language`, `preferred_language`,
`outputStyle`, `output_style`, `responseStyle`, and `response_style`. These become
worker guidance, not provider account configuration. Portable settings are stored
as a JSON object so multiline text and colons survive edits, export and reimport.
Earlier `key: value` bundles are still accepted for compatibility. There is no arbitrary YAML
or TOML runtime loader. Multiline frontmatter descriptions and complex tool
expressions are not interpreted as executable capabilities.

The importer does not install plugins or run hooks, scripts, services, or separate
agents. A role is labeled **Role guidance**; unresolved references promote it to **Needs
review**. Missing tool connections have a **Needs connection** notice. Unavailable tools produce **Needs
review** or **Needs connection**; importing them does not connect that service.
Supported skill instructions can use the normal DUKE tools when the task allows
them. The worker retrieves relevant support files through `setup_list` and
`setup_read`, both read-only and limited to that task's snapshot.

## Scope and bounds

The scanner skips credentials, common caches, histories, logs, build outputs and
symlinks. It rejects recognizable credential content rather than treating it as
instructions. Detection is conservative and is not a guarantee that arbitrary
personal documents contain no sensitive information; review files before sharing.
Settings are sanitized before any preview is returned.

Scans are bounded to eight directory levels, 4,000 entries, 200 imported files,
64 KB per file and 1 MB of text. Limit notices identify incomplete scans. The
combined setup context for one task also has a 200-file / 1 MB cap. Nested rules
are mapped explicitly, and unrelated project files are excluded from the task
snapshot. Only up to 16,000 characters of core text are included directly in the
worker prompt; remaining core files and support references use the read tool.

Jev receives a bounded task brief, selected attachment excerpts, project structure,
progress, and model profiles. After execution it reviews bounded deliverable and
retrieved-source excerpts. The importer does not add the personal setup library
to those requests; material quoted into a deliverable can be included in its review. The worker chosen
to perform the task receives the approved operating core and an index of context.
Imported instructions remain subordinate to the current request and the app's
enforced action, project, provider and approval boundaries.

## Portable bundles for open-source users

In **View files**, select the files and choose **Export selected files**. Review
their contents before sharing. The JSON contains only selected content and
relative paths, with `format: "duke-setup"` and `version: 1`. It excludes account
settings, source roots, project IDs, task history and logs. Exports containing
recognized credentials or personal absolute paths are rejected; edit a copy to
use relative references. Unselected dependencies are not silently added.

Use **Or import a DUKE setup bundle** to preview and import on another machine.
Bundles become independent copies. Map nested project scopes to local projects.
No private directory conventions are required by the importer or its fixtures.

The normalized file fields are `path`, `content`, `kind`, `scope` and `core`.
Kinds are `instructions`, `preferences`, `skill`, `agent`, `settings`, `reference`.
Scope `.` means the general scope selected during import; other relative scopes
need project bindings. Content hashes and requirements are regenerated on import.
Never include credentials in a bundle, even if a scanner would not recognize them.

## Verification

`npm test` covers scanning, settings filtering, link/copy behavior, revalidation,
scope, context snapshots, all worker dispatch paths, Jev payload isolation, unsafe
paths, cycles, export/reimport, removal and HTTP authentication.
`npm run test:importer` exercises the browser UI, real SQLite/file writes and a
synthetic worker. Its native picker boundary uses a fixture helper and is reported
separately from an actual macOS picker check. No model inference is required.
