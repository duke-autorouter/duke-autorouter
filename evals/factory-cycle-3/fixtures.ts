// Frozen fictional worker tasks. The verifier is supplied before live execution.
export const cases = [
  {
    id: "coding-bag-counts", kind: "coding", required: ["files", "shell", "artifacts"] as const,
    prompt: "Read brief.md. Implement solution.mjs, then run node --test verify.mjs. Do not edit brief.md or verify.mjs. No packages or network are needed.",
    files: {
      "brief.md": `Fictional museum coat room. Export countTags(tags) from solution.mjs. tags is an array of strings. Return a new plain object whose own keys are the exact tag strings and values are occurrence counts. An empty array returns an empty object. Preserve input and distinguish case. Keys such as "__proto__" and "constructor" are ordinary tags. Reject any nonstring element with TypeError. No dependencies or external calls.`,
      "verify.mjs": `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countTags } from './solution.mjs';
test('counts without changing input', () => { const tags=['blue','red','blue','Blue']; const before=[...tags]; const result=countTags(tags); assert.equal(Object.getPrototypeOf(result),Object.prototype); assert.notEqual(result,tags); assert.deepEqual({...result},{blue:2,red:1,Blue:1}); assert.deepEqual(tags,before); });
test('empty and special keys', () => { const empty=countTags([]); assert.equal(Object.getPrototypeOf(empty),Object.prototype); assert.deepEqual(empty,{}); const result=countTags(['__proto__','constructor','__proto__']); assert.equal(Object.hasOwn(result,'__proto__'),true); assert.equal(result.__proto__,2); assert.equal(result.constructor,1); });
test('rejects nonstrings', () => { for (const value of [null,5,{},false]) assert.throws(()=>countTags(['ok',value]),TypeError); });
`,
    },
    expectedFiles: ["solution.mjs"], command: "node --test verify.mjs",
    rubric: ["Scoped verifier passes", "Exact counts and case-sensitive keys including special names", "Input unchanged; nonstrings cause TypeError", "Brief and verifier unchanged; no dependencies or external calls"],
  },
  {
    id: "ownership-status", kind: "writing", required: ["files", "artifacts"] as const,
    prompt: "Read brief.md and write status.md. Keep it concise and factual. Do not edit brief.md, send, or publish anything.",
    files: {
      "brief.md": `Fictional Briar Hall signage update, September 23, 2026. Write a 90–130 word internal status file titled "Briar Hall signage status". Use headings "Done", "Pending", and "Decision". The wording draft is complete. Nia owns the wording review, due September 25; it is pending. Omar owns the installation estimate, due September 27; it is pending. The access walk-through has no assigned owner or date. No sign has been installed. Under Decision, say publication and installation remain open until review, estimate, and walk-through are complete. Do not invent an owner, date, approval, cost, or accessibility finding.`,
    },
    expectedFiles: ["status.md"], command: "",
    rubric: ["90–130 words with exact title and three headings", "Completed wording draft separated from pending review", "Nia and September 25 attached only to wording review; Omar and September 27 attached only to estimate", "Walk-through remains unassigned and undated", "No installed sign or completed access finding claimed", "Publication and installation remain undecided pending all three checks", "No invented owner, date, approval, cost, or accessibility result; concise readable prose"],
  },
] as const;
