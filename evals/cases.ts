import type { Cap } from '../server/types.js';
export type EvalCase = {
  id: string;
  kind: 'coding' | 'research' | 'writing' | 'documents';
  split: 'development' | 'held-out';
  prompt: string;
  required: Cap[];
  files: Record<string, string>;
  expectedFiles: string[];
  command: string;
  rubric: string[];
};
const coding: [string, string, string][] = [
  [
    'unique',
    'Return unique array values preserving first appearance.',
    'assert.deepEqual(solve([3,1,3,2]),[3,1,2]); assert.deepEqual(solve([]),[]);',
  ],
  [
    'clamp',
    'Accept (number, minimum, maximum) and clamp inclusively.',
    'assert.equal(solve(12,0,5),5);assert.equal(solve(-4,0,5),0);assert.equal(solve(3,0,5),3);',
  ],
  [
    'chunks',
    'Accept (array, positive size), return nonempty chunks; throw for nonpositive size.',
    'assert.deepEqual(solve([1,2,3,4,5],2),[[1,2],[3,4],[5]]);assert.throws(()=>solve([1],0));',
  ],
  [
    'counts',
    'Count string array items into an object, safely handling __proto__.',
    'const r=solve(["a","a","__proto__"]);assert.equal(r.a,2);assert.equal(r["__proto__"],1);',
  ],
  [
    'median',
    'Compute the median of a numeric array without modifying it. Empty array returns null.',
    'const x=[4,1,2,3];assert.equal(solve(x),2.5);assert.deepEqual(x,[4,1,2,3]);assert.equal(solve([]),null);',
  ],
  [
    'slug',
    'Convert a string to a lowercase ASCII slug; trim and collapse non-alphanumeric runs to hyphens.',
    "assert.equal(solve('  Hello, WORLD!  '),'hello-world');assert.equal(solve('---'),'');",
  ],
  [
    'flatten',
    'Flatten arbitrarily nested arrays preserving primitive values.',
    'assert.deepEqual(solve([1,[2,[3]],[],null]),[1,2,3,null]);',
  ],
  [
    'intersection',
    'Return unique values present in both input arrays, preserving order of the first.',
    'assert.deepEqual(solve([3,1,1,2],[1,3]),[3,1]);',
  ],
  [
    'rle',
    'Run-length encode a string into [character,count] pairs; support Unicode code points.',
    "assert.deepEqual(solve('aaabb🙂🙂'),[['a',3],['b',2],['🙂',2]]);assert.deepEqual(solve(''),[]);",
  ],
  [
    'partition',
    'Partition (array,predicate) into [matching,nonmatching] without mutation.',
    'assert.deepEqual(solve([1,2,3,4],x=>x%2===0),[[2,4],[1,3]]);',
  ],
  [
    'windows',
    'Return sliding windows of size n. Throw when n<=0; return [] when n>array length.',
    'assert.deepEqual(solve([1,2,3],2),[[1,2],[2,3]]);assert.deepEqual(solve([1],2),[]);assert.throws(()=>solve([],0));',
  ],
  [
    'group',
    'Group an array of objects by a supplied string property, supporting missing keys as "undefined".',
    "const r=solve([{k:'x',v:1},{k:'x',v:2},{v:3}],'k');assert.equal(r.x.length,2);assert.equal(r.undefined[0].v,3);",
  ],
  [
    'binary',
    'Binary search an ascending numeric array, return any matching index or -1.',
    'assert.equal(solve([1,3,5,7],5),2);assert.equal(solve([],1),-1);assert.equal(solve([1,3],2),-1);',
  ],
  [
    'balanced',
    'Determine whether (), [], {} brackets are balanced; ignore all other characters.',
    "assert.equal(solve('a{b[()]}'),true);assert.equal(solve('([)]'),false);assert.equal(solve('('),false);",
  ],
  [
    'csv',
    'Encode one array of strings as a CSV row; quote fields containing comma, quote, or newline.',
    'assert.equal(solve([\'a\',\'b,c\',\'say "hi"\']), \'a,"b,c","say ""hi"""\');',
  ],
  [
    'merge',
    'Merge sorted numeric arrays preserving duplicates without modifying the inputs.',
    'assert.deepEqual(solve([1,3,3],[2,3]),[1,2,3,3,3]);assert.deepEqual(solve([],[1]),[1]);',
  ],
  [
    'rotate',
    'Rotate an array right by k, handling negative k and empty arrays.',
    'assert.deepEqual(solve([1,2,3],1),[3,1,2]);assert.deepEqual(solve([1,2,3],-1),[2,3,1]);assert.deepEqual(solve([],9),[]);',
  ],
  [
    'range',
    'Return integers from start inclusive to end exclusive with positive or negative step; throw for zero.',
    'assert.deepEqual(solve(1,6,2),[1,3,5]);assert.deepEqual(solve(3,0,-1),[3,2,1]);assert.throws(()=>solve(1,2,0));',
  ],
  [
    'deep-get',
    'Return a nested value from (object,arrayOfKeys,fallback), preserving false and 0.',
    "assert.equal(solve({a:{b:0}},['a','b'],9),0);assert.equal(solve({},['a'],9),9);assert.equal(solve({a:false},['a'],9),false);",
  ],
  [
    'difference',
    'Return values in the first array absent from the second, preserving duplicates and order.',
    'assert.deepEqual(solve([1,2,1,3],[2]),[1,1,3]);assert.deepEqual(solve([],[1]),[]);',
  ],
];
const research = [
  [
    'sqlite-wal',
    'SQLite WAL mode and its concurrency limitations',
    'https://www.sqlite.org/wal.html',
  ],
  [
    'http-idempotency',
    'HTTP idempotent methods and safe retry behavior',
    'https://www.rfc-editor.org/rfc/rfc9110.html',
  ],
  [
    'mdn-csp',
    'CSP sandbox and iframe sandbox differences',
    'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/sandbox',
  ],
  [
    'node-cancel',
    'Node AbortController cancellation and child processes',
    'https://nodejs.org/api/child_process.html',
  ],
  [
    'codex-auth',
    'Codex subscription sign-in and API-key billing boundaries',
    'https://learn.chatgpt.com/docs/auth',
  ],
  [
    'claude-permissions',
    'Claude Agent SDK approval callbacks and pre-tool hooks',
    'https://code.claude.com/docs/en/agent-sdk/permissions',
  ],
  [
    'jev-confidence',
    'Jev confidence signals and their limitations',
    'https://docs.typesafe.ai/confidence',
  ],
  [
    'openrouter-fallback',
    'OpenRouter model fallback and provider fallback',
    'https://openrouter.ai/docs/guides/routing/provider-selection',
  ],
  [
    'playwright-context',
    'Playwright browser context isolation',
    'https://playwright.dev/docs/browser-contexts',
  ],
  ['node-sqlite', 'Node built-in SQLite transaction APIs', 'https://nodejs.org/api/sqlite.html'],
  [
    'wcag-focus',
    'WCAG keyboard focus visibility requirements',
    'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html',
  ],
  [
    'owasp-ssrf',
    'OWASP SSRF prevention recommendations',
    'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html',
  ],
  [
    'mit-apache',
    'Practical Apache-2.0 license notice requirements',
    'https://www.apache.org/licenses/LICENSE-2.0',
  ],
  [
    'sse',
    'Server-sent event reconnection and event IDs',
    'https://html.spec.whatwg.org/multipage/server-sent-events.html',
  ],
  [
    'iana-time',
    'IANA timezone database and daylight-saving rules',
    'https://www.iana.org/time-zones',
  ],
  [
    'git-worktree',
    'Git worktree isolation and shared repository state',
    'https://git-scm.com/docs/git-worktree',
  ],
  [
    'react-effect',
    'React effect cleanup and development strict mode',
    'https://react.dev/reference/react/useEffect',
  ],
  [
    'http-cache',
    'HTTP Cache-Control no-store versus no-cache',
    'https://www.rfc-editor.org/rfc/rfc9111.html',
  ],
  [
    'mcp-tools',
    'MCP tool schemas and result error handling',
    'https://modelcontextprotocol.io/specification/latest/server/tools',
  ],
  [
    'sqlite-backup',
    'SQLite online backup and WAL consistency',
    'https://www.sqlite.org/backup.html',
  ],
];
const writing = [
  [
    'brief',
    'Write a 150-word project brief for a local task router. Include purpose, audience, three capabilities, and one measurable finish line.',
  ],
  [
    'guide',
    'Write a five-step onboarding guide for a first-time user connecting their own subscription. Avoid implementation jargon.',
  ],
  ['release', 'Write concise release notes separating delivered features from known limitations.'],
  ['rubric', 'Write a review rubric for a sourced research memo with four observable criteria.'],
  [
    'decision',
    'Write a decision memo comparing deterministic routing with classifier-assisted routing. Separate assumptions from evidence.',
  ],
  [
    'email',
    'Draft a warm, short email inviting a colleague to try a local prototype. Do not send it.',
  ],
  [
    'faq',
    'Write six practical FAQ entries explaining task permissions, cancellation, budgets, and model switching.',
  ],
  [
    'incident',
    'Write an incident summary for a cancelled task that left an external action uncertain. Include reconciliation steps.',
  ],
  [
    'handout',
    'Create a one-page workshop handout for evaluating AI outputs. Include an activity and retained evidence.',
  ],
  [
    'checklist',
    'Create a first-run acceptance checklist for a model router with pass/fail observations.',
  ],
  [
    'rewrite',
    'Rewrite the source brief in 100 words without hype, unsupported production claims, or vague benefits.',
  ],
  [
    'proposal',
    'Create a small implementation proposal with three milestones and explicit completion criteria.',
  ],
  [
    'comparison',
    'Write a readable comparison of subscription capacity and metered API spend, with an example of each.',
  ],
  [
    'handoff',
    'Create an engineering handoff describing task state, checkpoints, failure modes, and how to resume.',
  ],
  [
    'research-template',
    'Create a reusable research memo template that separates source claims, inference, and open questions.',
  ],
  [
    'demo-script',
    'Write a three-minute demo script showing a task, a routing decision, an approval, and an artifact.',
  ],
  [
    'review',
    'Review the source brief for exaggerated claims and provide specific edits with reasons.',
  ],
  [
    'status',
    'Write an honest weekly status note separating code checks, live-provider checks, and user validation.',
  ],
  [
    'worksheet',
    'Create a workshop worksheet for matching task requirements to model capabilities. Include two worked examples.',
  ],
  [
    'readme',
    'Write a short project README explaining purpose, setup prerequisites, and limitations for a technical peer.',
  ],
];
const split = (i: number): EvalCase['split'] => (i % 2 === 0 ? 'development' : 'held-out');
const documents = [
  ['handoff.docx', 'Create a handoff brief with decisions, owners and open questions.'],
  ['overview.pdf', 'Create an executive overview with a clear title and short sections.'],
  ['budget.xlsx', 'Create a budget sheet showing item costs and a correct total of 900.'],
  ['agenda.docx', 'Create a 45-minute workshop agenda with activities and timings that add up.'],
  ['checklist.pdf', 'Create a one-page launch checklist with explicit unresolved items.'],
  ['schedule.xlsx', 'Create a milestone schedule preserving the supplied dates and owners.'],
  ['guide.docx', 'Create a concise onboarding guide using numbered steps and a troubleshooting section.'],
  ['report.pdf', 'Create a status report separating completed work, work in progress and pending evidence.'],
  ['risks.xlsx', 'Create a risk register with owners, mitigation actions and status columns.'],
  ['memo.docx', 'Create a decision memo stating the decision, evidence, tradeoffs and next step.'],
  ['worksheet.pdf', 'Create a workshop worksheet with answer space and two worked examples.'],
  ['inventory.xlsx', 'Create an asset inventory using only the supplied assets and owners.'],
  ['proposal.docx', 'Create an internal project proposal that clearly labels estimates.'],
  ['faq.pdf', 'Create a readable FAQ with six practical questions and supported answers.'],
  ['comparison.xlsx', 'Create an option comparison using three invented options clearly labeled as examples.'],
  ['minutes.docx', 'Create meeting minutes separating supplied decisions from suggested follow-up actions.'],
  ['instructions.pdf', 'Create a two-page instruction sheet with a contents summary and numbered steps.'],
  ['tracking.xlsx', 'Create a task tracker with owner, milestone, status and dependencies.'],
  ['acceptance.docx', 'Create acceptance criteria with observable pass and fail conditions.'],
  ['release.pdf', 'Create release notes that do not invent completed tests or user outcomes.'],
];
export const cases: EvalCase[] = [
  ...coding.map(([id, requirement, assertions], i) => ({
    id: 'coding-' + id,
    kind: 'coding' as const,
    split: split(i),
    prompt: `Implement export function solve in solution.mjs. ${requirement} Run node --test verify.mjs. Do not modify verify.mjs.`,
    required: ['files', 'shell'] as Cap[],
    files: {
      'solution.mjs': 'export function solve(...args) { throw new Error("Implement me"); }\n',
      'verify.mjs': `import assert from 'node:assert/strict';\nimport { solve } from './solution.mjs';\n${assertions}\n`,
    },
    expectedFiles: ['solution.mjs'],
    command: 'node --test verify.mjs',
    rubric: [
      'All fixture assertions pass',
      'Verification fixture unchanged',
      'No changes outside the workspace',
    ],
  })),
  ...research.map(([id, topic, url], i) => ({
    id: 'research-' + id,
    kind: 'research' as const,
    split: split(i),
    prompt: `Research ${topic}. Start with ${url}. Save a concise source-backed memo to report.md. Include direct source links, distinguish documented facts from inference, and list uncertainties.`,
    required: ['files', 'web'] as Cap[],
    files: {},
    expectedFiles: ['report.md'],
    command: '',
    rubric: [
      'Claims match opened primary sources',
      'Relevant source links support claims',
      'Uncertainty is explicit',
      'Memo answers the requested question',
    ],
  })),
  ...documents.map(([filename, request], i) => ({
    id: 'documents-' + filename.replace('.', '-'), kind: 'documents' as const, split: split(i),
    prompt: `Read brief.md. ${request} Save an actual ${filename} file. Preserve the supplied facts and label any invented examples.`,
    required: ['files', 'artifacts'] as Cap[],
    files: { 'brief.md': 'Invented project Harbor. Owners: Ana (delivery), Lee (research), Sam (operations). Kickoff October 1; review October 8; launch target October 15, 2026. Budget: materials 300, venue 400, printing 200, total 900 dollars. Assets: workshop outline owned by Ana, source list owned by Lee, sign-in sheet owned by Sam. Outline completed; source review in progress; participant trial not yet run. Launch date is a target, not a commitment. Decision: run a small internal workshop before external invitations. Open question: room accessibility confirmation.\n' },
    expectedFiles: [filename], command: '',
    rubric: ['Requested file opens in the appropriate viewer', 'Content preserves supplied facts and arithmetic',
      'Requested structure and constraints are satisfied', 'Rendered layout is legible without clipping or unintended blank pages',
      'Examples and estimates are labeled; no invented completed outcomes'],
  })),
  ...writing.map(([id, request], i) => ({
    id: 'writing-' + id,
    kind: 'writing' as const,
    split: split(i),
    prompt: `Read brief.md. ${request} Save the result to draft.md.`,
    required: ['files', 'artifacts'] as Cap[],
    files: {
      'brief.md':
        'Synthetic project brief: We are building a single-user local model router for coding, research, and writing. It uses supported subscription runtimes and optional paid APIs. A classifier is experimental. API budgets are $5/day and $25/month. Twenty local tests pass; no live-provider or daily-use result is yet established. External writes need approval. Intended first platform is macOS.\n',
    },
    expectedFiles: ['draft.md'],
    command: '',
    rubric: [
      'Follows requested format and constraints',
      'Preserves source facts and uncertainty',
      'Clear and useful to the intended audience',
      'Avoids invented outcomes',
    ],
  })),
];
