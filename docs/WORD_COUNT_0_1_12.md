# 0.1.12: literal requirements and word-count checks

This maintenance update packages the PR 19 correction for numbered requirements and ownership labels, then adds a deterministic word-count check for a narrow, explicit case: one complete text or Markdown file and a document-level range in the user's task prompt or expected result.

Markdown formatting and link destinations are excluded; heading text is included. Letter/number groups count as words, retaining internal apostrophes and hyphens. The earlier cycle-3 output is below 90 words under both the old whitespace diagnostic and this defined convention. Other editors may count differently near a boundary.

The check does not extract requirements from editable briefs, quoted examples, approximate/conditional instructions or output text. Multiple outputs, section-specific ranges, partial files, HTML/entity text and follow-ups stay with the existing review process. This deliberately limited coverage avoids imposing the wrong requirement. See [ADR 0026](adr/0026-deterministic-word-ranges.md).

## Controlled live result

A fresh fictional task requested 90–110 words. Its deliberately planted first draft contained 14 words, with no initial worker inference and a forced Luna Low route. The real verifier failed it. Jev approved a same-model, same-effort correction, and the real Luna worker returned 121 words. The verifier failed the excess too. Jev's escalation judgment chose reasoning at probability 0.87, below the unchanged 0.9 threshold, so DUKE blocked rather than promoting the task.

Detection and recovery handoff worked. The repair itself failed. This is one controlled-path check, not natural recovery success, model calibration, or an efficiency comparison. The result is retained without a selective rerun. Actual Jev charges were $0.000137, with no unresolved requests. The [receipt](evidence/word-count-recovery-0.1.12.json) records both failed checks and recovery judgments. Route fields from the injected first stage must not be mistaken for a natural Jev model choice.

## Release scope

All 261 Mac tests pass, including the real verifier's length failure and conservative exclusions. TypeScript and the production package build pass. The review policy advances to v12; routing, confidence thresholds, economical fallback, user ceilings and recovery limits are unchanged. No new setting or manual model-rating step is introduced.

Signing, notarization, bundle checks and installation evidence are recorded separately in the distribution receipt. Broad semantic review remains imperfect, and this release does not claim guaranteed repair or general efficiency savings. Second-Mac and physical iPhone checks remain outstanding.
