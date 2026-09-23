# Follow-up to the 0.1.10 adversarial review

Opus 5.5 reviewed `f4f09402cb6d86b6729dc306bdf9e7177cb6479c` and found no release blockers. This follow-up addresses the reported parsing and coverage weaknesses while preserving explicit model limits. It is not a claim that routing efficiency is calibrated.

## Difficulty tails (D1)

The conservative 0.80 cumulative difficulty bound remains. A roughly 20% complex tail can still classify a task as complex and exclude profiles whose explicit difficulty ceiling is standard. We do not silently override that user-declared limit. An unevaluated economical profile without an explicit ceiling remains eligible; price alone does not determine difficulty coverage.

Selection now receives the full difficulty distribution, score and distribution confidence, alongside the conservative category. Jev can compare uncertainty and whole-task resource use among eligible model/effort pairs. Tests cover 78% routine / 22% complex and 10% routine / 70% standard / 20% complex. They check the candidate list, preserved user limits and economical selection using synthetic responses. They do not establish optimal selection or eliminate the premium-only shortlist risk. A calibrated change to the difficulty threshold remains open.

## Requirement parsing and coverage (R1–R3)

A single literal-text scan protects quotes and code before sentence or semicolon splitting. Dependent prohibitions remain together. The original task context remains available; no generated paraphrase replaces it. Requirements are reviewed in batches of eight, up to 24 total. Overflow, truncated context, missing answers and unfinished batches remain unverified. Pass/fail thresholds and bounded recovery are unchanged.

## Evidence framing

The two-task comparison now leads with all three cost and acceptance results. Fixed Luna had similar cost and better acceptance than automatic fallback. The 98.6% Astra comparison is retained as a limited, unmatched-quality model-cost observation, not a claim of Jev's selection advantage.

## Remote boundary (S1)

No remote access is enabled or expanded in this maintenance pass. The iOS guide now states that loopback identity headers are trusted proxy metadata. A local process with a stolen paired credential can spoof them. Stronger proxy-origin authentication remains a prerequisite for broader remote deployment.

## Verification

Verification results will be recorded after the candidate checks complete. The independent Linux report lists 236 passes and nine platform-bound failures out of 248 tests; the raw summary is needed to confirm the remaining three cases. We do not reinterpret those counts as a successful macOS run.
