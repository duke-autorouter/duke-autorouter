import type { ReviewEvidence } from './task-evidence.js';

export const FOCUSED_REVIEW_POLICY = 'duke-focused-review-v3';
export type ReviewPassage = { id: string; path: string; text: string; facet?: 'ownership' };
export type ReviewSource = { path: string; text: string; incomplete?: boolean };
export type FocusedReview = {
  passages: ReviewPassage[];
  sources: ReviewSource[];
  complete: boolean;
};

// Deterministic excerpts, not generated facts. Keep rows intact so ownership and
// status relationships remain visible. A coverage limit must never imply success.
export function passages(text: string, width = 700): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (/^(?:[-*]\s*)?(?:\[[ xX]\]|[☐☑])$/.test(line)) continue;
    if (lines.length && /^[a-z]/.test(line) && !/[.!?:;]$/.test(lines.at(-1)!))
      lines[lines.length - 1] += ' ' + line;
    else lines.push(line);
  }
  return lines.flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^[-| :]+$/.test(trimmed)) return [];
    const chunks: string[] = [];
    for (let offset = 0; offset < trimmed.length; offset += width)
      chunks.push(trimmed.slice(offset, offset + width));
    return chunks;
  });
}

export function focusReview(evidence: ReviewEvidence): FocusedReview {
  const textFiles = evidence.files.filter(
    (f) => f.text && /\.(?:md|txt|pdf|docx|html|xlsx|csv)$/i.test(f.path),
  );
  const outputs = textFiles.length
    ? textFiles.map((f) => ({ path: f.path, text: f.text! }))
    : [{ path: 'response', text: evidence.result }];
  const all = outputs.flatMap((f) => passages(f.text).map((text) => ({ path: f.path, text })));
  const outputPaths = new Set(evidence.files.map((f) => f.path));
  const sources: ReviewSource[] = (
    evidence.resolutionSources ?? [
      ...evidence.inputs,
      ...evidence.sources.map((s) => ({ path: s.url, text: s.text })),
    ]
  ).filter((s) => !outputPaths.has(s.path));
  let budget = 64000;
  const boundedSources = sources.slice(0, 12).map((source) => {
    const text = source.text.slice(0, Math.min(budget, 32000));
    budget -= text.length;
    return { ...source, text, incomplete: !!source.incomplete || text.length < source.text.length };
  });
  return {
    passages: all.slice(0, 24).flatMap((p, i) => [
      { id: `claim_${i}`, ...p },
      { id: `claim_${i}_ownership`, ...p, facet: 'ownership' as const },
    ]),
    sources: boundedSources,
    complete:
      all.length <= 24 &&
      sources.length <= 12 &&
      !evidence.incomplete &&
      !boundedSources.some((s) => s.incomplete),
  };
}

// Rank literal source windows locally. No network requests, worker invocation,
// file discovery, or generated interpretation is allowed in this second pass.
export function sourceWindows(claim: string, sources: ReviewSource[], expanded = false) {
  const words = new Set(claim.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const width = expanded ? 1800 : 900;
  const candidates = sources.flatMap((s) => {
    const result: Array<{
      path: string;
      offset: number;
      text: string;
      score: number;
    }> = [];
    for (let offset = 0; offset < s.text.length; offset += width / 2) {
      const text = s.text.slice(offset, offset + width);
      const terms = new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
      result.push({
        path: s.path,
        offset,
        text,
        score: [...words].filter((w) => terms.has(w)).length,
      });
    }
    return result;
  });
  const selected = candidates.sort((a, b) => b.score - a.score).slice(0, expanded ? 4 : 2);
  return selected.map(({ score: _score, ...window }) => window);
}
