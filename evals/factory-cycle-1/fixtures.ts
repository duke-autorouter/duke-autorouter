// Frozen fictional tasks. Every source needed to answer is local to its case.
export const cases = [
  {
    id: "coding-intervals", kind: "coding", required: ["files", "shell", "artifacts"] as const,
    prompt: "Read brief.md, implement solution.mjs, then run node --test verify.mjs. Do not edit brief.md or verify.mjs. No packages or network are needed.",
    files: {
      "brief.md": `Fictional Eastbank room reservations. Export mergeReservations(rows) from solution.mjs. Each row is {start:integer,end:integer}, a half-open time interval [start,end). Return a new array of merged intervals sorted by start, without mutating rows or row objects. Merge intervals only when they overlap (next.start < current.end); touching boundaries must remain separate. An unsorted chain of overlaps must merge fully. Reject any row whose endpoints are nonintegers or whose start is greater than or equal to end with RangeError. Empty input returns []. No date conversion, packages, or network needed.`,
      "verify.mjs": `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeReservations } from './solution.mjs';
test('unsorted overlapping chain and no mutation',()=>{ const rows=[{start:8,end:12},{start:1,end:4},{start:3,end:9},{start:20,end:21}]; const before=structuredClone(rows); assert.deepEqual(mergeReservations(rows),[{start:1,end:12},{start:20,end:21}]); assert.deepEqual(rows,before); });
test('touching stays separate',()=>{ assert.deepEqual(mergeReservations([{start:4,end:7},{start:1,end:4},{start:7,end:9}]),[{start:1,end:4},{start:4,end:7},{start:7,end:9}]); });
test('empty and invalid',()=>{ assert.deepEqual(mergeReservations([]),[]); for(const row of [{start:2,end:2},{start:3,end:2},{start:0.5,end:2},{start:1,end:Infinity}]) assert.throws(()=>mergeReservations([row]),RangeError); });`,
    },
    expectedFiles: ["solution.mjs"], command: "node --test verify.mjs",
    rubric: ["Frozen verifier passes inside isolated worker", "Intervals sorted and overlap chains merged, while touching boundaries remain separate", "Invalid endpoints throw RangeError", "Fixture files unchanged and input not mutated", "No dependencies or external calls"],
  },
  {
    id: "writing-status", kind: "writing", required: ["files", "artifacts"] as const,
    prompt: "Read brief.md and write a 100–150 word internal status email in draft.md. Do not edit brief.md or send it.",
    files: {
      "brief.md": `Fictional North Quay accessibility review, September 23, 2026. A first draft of the visitor guide is complete. Maya's wording review is unfinished. A screen-reader check is scheduled for September 29; it has not happened. Public release date is undecided. Reply to a colleague asking whether it is ready to publish. Include subject, greeting, body, signoff. Answer directly that it is not ready, state completed and pending work, and ask for critical wording concerns by September 27. Include exact quoted label “Step-free entrance” because it is under review. Do not imply the entrance is verified. Do not say “approved,” “tested,” or “launch confirmed” in your own voice; quoting them to reject a claim is allowed. Invent no release date, access finding, or other owner.`,
    },
    expectedFiles: ["draft.md"], command: "",
    rubric: ["100–150 words and email structure", "Direct readiness answer; draft complete but review pending", "September 29 check scheduled, not completed", "Exact quoted label without an access finding", "Concern request by September 27", "Dependent prohibitions respected; no invented date, finding, or owner", "Warm, concise prose"],
  },
  {
    id: "research-brief", kind: "research", required: ["files", "artifacts"] as const,
    prompt: "Use only brief.md and sources.md to write findings.md. This is local supplied-source synthesis, not a live-web test. Do not browse or edit inputs. Cite source numbers inline for material facts.",
    files: {
      "brief.md": `Fictional Cedar Transit pilot. Write a 300–450 word decision memo to an operations lead. Include (1) conditional recommendation; (2) pilot dates; (3) population and coverage limits; (4) counts and rates with denominators; (5) prior-period comparison without causal claim; (6) opt-out handling; (7) accessibility and language gaps; (8) cost and staffing implications; (9) conflicting date/status evidence and resolution; (10) two concrete next checks and owners, marking any suggested owner as proposed; (11) statement that no live source verification occurred. Source 4 is a draft, not approved. Cite numbered sources; invent no facts.`,
      "sources.md": `# Supplied fictional sources
[1] Pilot log, September 21, 2026. Reminder pilot ran August 17–September 13, 2026, Route C weekday trips only. Covered 480 of 1,600 eligible weekday bookings. Reminders delivered to 312/480; 74/312 delivered group bookings were later cancelled. Of 168 with no delivered reminder, 31 were later cancelled. Delivery failures: 53 missing phone numbers and 115 carrier rejects. An opt-out suppressed subsequent reminders within 24 hours; opt-out count unrecorded.
[2] Baseline report, August 14, 2026. In preceding four weeks, 128 of 600 Route C weekday bookings were cancelled. Booking mix and disruptions were not controlled. Observational comparison only.
[3] Access note, September 20, 2026. English text only. Screen-reader wording review and Spanish translation unfinished. No participant accessibility study.
[4] Extension draft, September 19, 2026. Proposed six-week extension costs $1,200 message fees and 12 staff hours/week. Draft suggests Operations lead Nora for delivery monitoring and Access lead Ivo for wording review. Neither assignment nor funding approved.
[5] Calendar export, September 22, 2026. Follow-up meeting September 30. Stale title says “extension approved”; meeting details say decision pending.
[6] Coordinator excerpt, September 23, 2026. Says pilot ended September 12, conflicting with log's September 13. September 30 decision meeting planned. Reconcile dates against raw send logs before publication.`,
    },
    expectedFiles: ["findings.md"], command: "",
    rubric: ["300–450 words", "1. Conditional recommendation", "2. Pilot dates", "3. Route C weekday population and 480/1600 coverage limit", "4. Counts and rates with denominators: 74/312, 31/168, 128/600", "5. Prior-period comparison without causal inference", "6. Opt-out suppression policy separate from unknown opt-out count", "7. Accessibility and language gaps", "8. Draft cost and staffing separate from approved resources", "9. September 12/13 conflict and stale calendar title resolved as pending checks", "10. Two concrete next checks and proposed owners", "11. Explicit no-live-verification statement", "Material facts cited to numbered supplied sources; no invented claims"],
  },
  {
    id: "documents-one-pager", kind: "documents", required: ["files", "artifacts"] as const,
    prompt: "Read brief.md. Create an actual Word document handoff.docx with DUKE create_artifact, format docx. Also save handoff.md with the exact text supplied to create_artifact for review. Do not edit brief.md, send, or publish. No shell or packages are needed.",
    files: {
      "brief.md": `Fictional Alder Library handoff, September 23, 2026. Create a one-page handoff titled “Alder Library kiosk trial”. In-library kiosk trial is planned for October 6, 2026. Quick-start guide is drafted; staff walkthrough and privacy review are pending. No patron trial has occurred. Lea owns staff walkthrough. Privacy review has no assigned owner. Sections: Current status, Before trial, Open decisions. Under Before trial, list walkthrough and privacy review separately with exact owner status. Under Open decisions, ask whether to proceed October 6 after both checks; do not decide. End with “Prepared from the September 23 fictional brief.” No approval, results, or confirmed launch claims. The Word file must contain substantive handoff text, not a placeholder.`,
    },
    expectedFiles: ["handoff.docx", "handoff.md"], command: "",
    rubric: ["Valid nonempty DOCX from DUKE create_artifact and matching review text", "Exact title, three sections, and ending sentence", "October 6 planned and patron trial not completed", "Lea walkthrough distinct from unassigned privacy review", "Decision stays open until checks; no invented approval or result"],
  },
] as const;
