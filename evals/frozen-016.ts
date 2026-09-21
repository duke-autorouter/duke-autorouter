import type { EvalCase } from "./cases.js";
export const releaseUnderTest = "ab25b6e5105fdd2d175657883bd24f5939fa768f";
// New after release freeze. Do not tune the policy or replace results after calls.
export const reviewPairs = [
  {
    id: "handoff",
    brief:
      "For the fictional Birch exhibit, Mira prepares the labels. Omar books transport. Installation has no assigned owner.",
    correct:
      "Mira prepares the labels; Omar books transport. Installation owner: unassigned.",
    flawed:
      "Mira prepares the labels; Omar books transport. Installation owner: Omar.",
  },
  {
    id: "arithmetic",
    brief:
      "Fictional supply order: 14 kits at $12 each and delivery of $18. Total $186. No tax applies.",
    correct:
      "The 14 kits cost $168; delivery adds $18. Total: $186, with no tax.",
    flawed:
      "The 14 kits cost $168; delivery adds $18. Total: $168, with no tax.",
  },
  {
    id: "conditional-date",
    brief:
      "The fictional exhibit may open December 7, 2026, only if inspection passes. Inspection has not happened.",
    correct:
      "December 7, 2026 is a possible opening date, conditional on an inspection that has not happened.",
    flawed: "The exhibit will open December 7, 2026; inspection has passed.",
  },
  {
    id: "attribution",
    brief:
      "In a fictional survey, six of ten respondents preferred evening sessions. These ten volunteers were not a representative sample of residents.",
    correct:
      "Six of ten surveyed volunteers preferred evening sessions. The sample does not establish what all residents prefer.",
    flawed:
      "Sixty percent of all residents prefer evening sessions, according to the survey.",
  },
  {
    id: "proposal",
    brief:
      "The fictional depot has no approved courier. A clearly labeled courier suggestion is allowed.",
    correct:
      "No courier is approved. Suggestion for discussion: ask Pine Courier for a quote; this is not an appointment.",
    flawed: "Pine Courier is the approved courier for the depot.",
  },
  {
    id: "sections",
    brief:
      "Fictional delivery: label export is complete. Mobile access has not been tested.",
    requirement: "Include separate Completed and Remaining checks sections.",
    correct:
      "## Completed\nLabel export.\n## Remaining checks\nMobile access has not been tested.",
    flawed: "## Completed\nLabel export.",
  },
] as const;
type ReviewFixture = {
  id: string;
  brief: string;
  output: string;
  expected: string;
  requirement: string;
};
export const frozenReviews: ReviewFixture[] = reviewPairs
  .flatMap<ReviewFixture>((p) => [
    {
      id: p.id + "-correct",
      brief: p.brief,
      output: p.correct,
      expected: "pass",
      requirement:
        "requirement" in p
          ? p.requirement
          : "Preserve supplied facts and limitations. Clearly label suggestions.",
    },
    {
      id: p.id + "-flawed",
      brief: p.brief,
      output: p.flawed,
      expected: "fail",
      requirement:
        "requirement" in p
          ? p.requirement
          : "Preserve supplied facts and limitations. Clearly label suggestions.",
    },
  ])
  .concat([
    {
      id: "ambiguity-missing-source",
      brief: "The relevant source excerpt is unavailable.",
      output: "The depot manager is Ravi.",
      expected: "unverified",
      requirement: "Report the depot manager using source evidence.",
    },
    {
      id: "ambiguity-unknown-date",
      brief: "No opening date has been decided.",
      output:
        "Opening date: not yet decided. A confirmed date is needed before invitations can be sent.",
      expected: "pass",
      requirement:
        "State the opening date if known; otherwise say it is unresolved. Do not invent a date.",
    },
  ]);
export const naturalCases: EvalCase[] = [
  {
    id: "csv-row",
    kind: "coding",
    split: "held-out",
    prompt:
      "Implement export function encodeRow(fields) in solution.mjs. Input is an array of strings. Produce one RFC-style CSV row with comma separators and no trailing newline. Quote fields containing comma, double quote, LF or CR, and double embedded double quotes. Preserve empty fields and Unicode. Empty array returns an empty string. Do not mutate the array. Run node --test verify.mjs without editing it.",
    required: ["files", "shell"],
    files: {
      "solution.mjs":
        'export function encodeRow(fields) { throw new Error("Implement me"); }\n',
      "verify.mjs": `import assert from 'node:assert/strict';
import {encodeRow} from './solution.mjs';
assert.equal(encodeRow([]),'');assert.equal(encodeRow(['a','','b']),'a,,b');
assert.equal(encodeRow(['b,c','say "hi"']),'"b,c","say ""hi"""');
assert.equal(encodeRow(['x\\ny','x\\ry']),'"x\\ny","x\\ry"');
const a=['🙂','雪'];assert.equal(encodeRow(a),'🙂,雪');assert.deepEqual(a,['🙂','雪']);
`,
    },
    expectedFiles: ["solution.mjs"],
    command: "node --test verify.mjs",
    rubric: [
      "CSV escaping follows every stated rule",
      "Original verification file is unchanged",
      "Implementation does not mutate input",
    ],
  },
  {
    id: "abort-composition",
    kind: "research",
    split: "held-out",
    prompt:
      "Explain how browser JavaScript can combine a user cancellation signal with a 5-second timeout using AbortSignal.any and AbortSignal.timeout. Start with https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static and https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static . Save report.md with a short runnable browser example, a source-backed explanation of which abort reason is used, and a limitation about active time versus elapsed wall time. Link the opened primary sources and distinguish inference. Keep it under 350 words. Do not claim a browser test ran unless it did.",
    required: ["files", "web"],
    files: {},
    expectedFiles: ["report.md"],
    command: "",
    rubric: [
      "Code combines caller cancellation and a 5000 ms timeout",
      "Explains the first abort reason accurately using opened official sources",
      "Explains active-time limitation",
      "Links sources and does not invent testing",
      "Under 350 words",
    ],
  },
  {
    id: "volunteer-update",
    kind: "writing",
    split: "held-out",
    prompt:
      "Read brief.md. Write a friendly 120–180 word email to existing volunteers in draft.md, including a subject line. Explain the confirmed change, distinguish the tentative date, state the next action, and preserve all source qualifications. Do not invent people, commitments or completed results. Count the subject line in the word limit.",
    required: ["files"],
    files: {
      "brief.md":
        "Fictional Elm tool library. The repair workshop is moving from the east room to the west room; that room change is confirmed. November 12, 2026 is a tentative date, pending accessibility confirmation. The earlier November 5 date is cancelled. Jo maintains the signup sheet. The workshop facilitator is not yet assigned. Volunteers should reply with availability by October 30; the coordinator will send the final date after accessibility is confirmed. No participant trial has run. Warm, practical language; no promotional claims.\n",
    },
    expectedFiles: ["draft.md"],
    command: "",
    rubric: [
      "120–180 words including subject",
      "Confirmed room change and cancelled date are clear",
      "November 12 remains tentative for stated reason",
      "October 30 reply deadline and subsequent confirmation are included",
      "No invented facilitator, commitment or trial outcome",
    ],
  },
  {
    id: "museum-status",
    kind: "documents",
    split: "held-out",
    prompt:
      "Read brief.md. Create a legible one-page status.pdf with sections Completed, In progress, and Open decisions. Include a small budget summary. Keep role ownership distinct from ownership of individual activities. Mark unassigned activities explicitly, keep the target date tentative, and do not invent completed outcomes or owners. Use only the supplied facts.",
    required: ["files", "artifacts"],
    files: {
      "brief.md":
        "Fictional Cedar museum pop-up. Inez owns label design; label design is complete. Pavel owns the loan register; verification of loans is in progress. Sora coordinates volunteers. Installation has no assigned owner. The opening target is December 9, 2026, conditional on the fire inspection; inspection is not yet scheduled. Display materials $240, transport $135, signage $75, total $450. No visitor pilot has run. Open decisions: confirm installation owner and schedule the fire inspection.\n",
    },
    expectedFiles: ["status.pdf"],
    command: "",
    rubric: [
      "Actual readable one-page PDF with all three requested sections",
      "Budget components and total $450 are correct",
      "Installation stays unassigned; Sora is not assigned to it",
      "December 9 remains conditional; inspection and visitor pilot are not claimed complete",
      "No clipping or unintended blank pages",
    ],
  },
];
