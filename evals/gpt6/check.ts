import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { cases } from './fixtures.js';
export const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export async function check(caseId: string, dir: string) {
  const item = cases.find((c) => c.id === caseId);
  if (!item) throw new Error(`Unknown case: ${caseId}`);
  const fixtureHashes = Object.fromEntries(await Promise.all(Object.entries(item.files).map(async ([name, original]) =>
    [name, { expected: sha(original), actual: sha(await readFile(join(dir, name), 'utf8').catch(() => 'MISSING')) }]
  ))) as Record<string, {expected: string; actual: string}>;
  const fixturesUnchanged = Object.values(fixtureHashes).every((h) => h.expected === h.actual);
  if (item.kind === 'coding') return { fixtureHashes, fixturesUnchanged, acceptance: 'node --test verify.mjs', rubric: item.rubric };
  const draft = await readFile(join(dir, 'draft.md'), 'utf8').catch(() => '');
  const words = draft.trim().split(/\s+/).filter(Boolean).length;
  return {
    fixtureHashes, fixturesUnchanged, draftHash: sha(draft), words,
    structuralChecks: {
      wordRange: words >= 90 && words <= 140,
      subject: /^subject:/im.test(draft),
      greeting: /^(dear|hi|hello)\b/im.test(draft),
      date: /october 8,? 2026/i.test(draft),
      replyRequest: /\b(reply|respond|let me know)\b/i.test(draft),
    },
    rubric: item.rubric, humanReview: { accepted: null, notes: '' },
  };
}
