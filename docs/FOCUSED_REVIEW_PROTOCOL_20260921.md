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
