# Focused review development protocol

Freeze implementation and fixtures before live calls. Test review v6 and focused
review v1 on 14 supplied-text fixtures: six correct/flawed pairs covering owners,
dates, totals, completion claims, omitted requirements and labeled proposals; one
embedded-instruction case; one missing-source case. No worker model generates or
repairs these fixed outputs. These are development calibration cases, not held-out
results or a whole-task cost comparison.

Report each original verdict, false failure on correct content, missed defect,
unverified result, review pass count and all metered API charges. Retain failed
and uncertain results. Use the existing shared $1 ledger and lock, a $0.02 phase
reservation and $0.02 app cap. No new API allowance is created. Do not change the
fixtures or policy mid-run. A later change requires a new identified run.

Local tests cover verdict normalization, malformed responses, incomplete source
coverage, cancellation, source separation, bounded excerpts and the existing
same-model repair path. Live verdicts must be inspected independently against the
frozen labels; synthetic transport tests do not establish detection accuracy.

## Second development run

The first 14-case run detected all seven defects but falsely failed a labeled
proposal and missing source. Preserve its receipt and cost. Focused review v2
requires a specific failed claim or requirement to corroborate a broad negative
judgment, and keeps source-dependent broad failures neutral when evidence is
incomplete. It explicitly distinguishes proposals from factual assertions.

Freeze this change before repeating the original cases and six fresh transfer
cases (owner assignments, approval status and proposed dates). Report the
original 14 and fresh six separately. These remain development cases.

## Third development run

Version 2 removed false failures on the synthetic correct and missing-source
cases, but the original PDF ownership claim stayed uncertain. Its negative
verdict came from a different checklist item and is not evidence that the original
error was caught. Version 3 adds a separate person-to-item ownership judgment,
joins lower-case PDF continuation lines, and ignores empty checkbox-only rows.
Re-run the same 20 fixtures and the two untouched saved PDFs. Keep all prior
receipts and charges; do not claim these repeated cases are held out.
