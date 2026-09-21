# Research source fidelity audit

The corrected development pilot's research output repeated obsolete SQLite
large-transaction guidance. On September 21, 2026, inspection of the
[official WAL documentation](https://sqlite.org/wal.html) confirmed that its old
advice is wrapped in HTML `s` elements, followed by a correction for version 3.11.0.

The released `web_read` extraction removes all HTML tags. That removes the
strikethrough cue, leaving old and replacement guidance together as ordinary text.
The replacement remains available, so this finding does not establish that the
worker had no way to reach the right conclusion. It does establish a tool-level
information loss that confounds attribution solely to model capability.

The candidate fix retains explicit text markers around `s`, `strike`, `del` and
`ins` contents before flattening HTML. Markers describe source formatting, not a
trusted instruction or a judgment that a statement is true. Scripts and styles
are removed first. External CSS and layout-only revision cues remain unsupported.
This does not change network validation, tool authority or model selection.

Regression cases cover old and replacement guidance, nested formatting, alternate
semantic tags, entity decoding and removal of script/style content. No inference
was required to reproduce the extraction defect.

Next, examine the original stored tool receipt and Jev review evidence. Compare a
bounded correction with preserved source cues at the same model and effort before
attributing any improvement to higher effort. Keep original artifacts and include
all repair costs. Document ownership errors require their own context/layout audit.
Known examples are diagnostic; fresh cases must validate any general improvement.
