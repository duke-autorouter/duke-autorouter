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

## Word table evidence

The original document contains an owner table that places the participant-trial
status in Sam's row, although the brief assigns Sam the sign-in sheet. This is an
output error. Separately, Word review extraction discarded table row and cell
boundaries, making that association harder to assess from the review text.

Word review evidence now retains explicit table, row and cell markers. This
preserves structure already present in the document; it does not infer ownership
or inspect rendered layout. Regression coverage checks the owner/status grouping
and ordinary paragraphs, including escaped text. The full local suite passes all
192 tests after both extraction fixes.

The original stored Jev verdicts were `unverified` for both failed examples.
Research support was below the acceptance threshold. Document support received a
passing probability of 0.93, but the overall document review remained unverified.
The audit therefore does not describe either artifact as globally certified by
Jev. The document support judgment did miss a specific unsupported association.

These changes are on the development branch after 0.1.3. They do not retroactively
change the released download or the pilot results. Repair experiments must retain
the original results, account for their cost, and distinguish better evidence from
increased reasoning effort.
