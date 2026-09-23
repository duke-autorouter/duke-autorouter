import type { ReviewEvidence } from './task-evidence.js';

export const FOCUSED_REVIEW_POLICY = 'duke-focused-review-v9';

// Scan the literal request once, before splitting it into requirements. Keep
// punctuation within quoted examples, code, brackets, abbreviations and list
// items. The full request remains the context for every resulting clause.
export function reviewRequirementClauses(text: string): string[] {
  const clauses: string[] = [];
  let start = 0;
  let quote = '';
  const closers: string[] = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const quoteEnd: Record<string, string> = { '“': '”', '‘': '’', '"': '"', "'": "'", '`': '`' };
  const add = (end: number) => {
    const clause = text.slice(start, end).trim();
    if (clause) clauses.push(clause);
    start = end + 1;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
      continue;
    }
    if ((char === "'" || char === '’') && /[\p{L}\p{N}]/u.test(text[i - 1] ?? '') && /[\p{L}\p{N}]/u.test(text[i + 1] ?? ''))
      continue;
    if (quoteEnd[char]) {
      quote = quoteEnd[char];
      continue;
    }
    if (pairs[char]) closers.push(pairs[char]);
    else if (char === closers.at(-1)) closers.pop();
    else if (!closers.length) {
      const current = text.slice(start, i).trim();
      const rest = text.slice(i + 1);
      if (char === ';') {
        // Bare noun fragments after a shared prohibition retain that scope.
        const dependent = /\b(?:do\s+not|don't)\b/i.test(current) &&
          /^\s*(?:[a-z][\w-]*(?:\s+(?:[a-z][\w-]*|or|and))*\s*(?:;|\.|$))/i.test(rest) &&
          !/^\s*(?:and\s+)?(?:do|must|should|keep|ensure|include|provide|write|create)\b/i.test(rest);
        if (!dependent) add(i);
      } else if (char === '\n') add(i);
      else if (/[.!?]/.test(char) && /\s/.test(rest[0] ?? '') && /^\s+[A-Z]/.test(rest)) {
        const token = current.match(/(?:^|\s)([\p{L}]+)$/u)?.[1]?.toLowerCase();
        const abbreviation = (!!token && /^(?:mr|mrs|ms|dr|prof|sr|jr|vs|etc|e|g|i|a|u|s)$/.test(token)) || /\b(?:e\.g|i\.e)$/i.test(current);
        const initials = /(?:\b[A-Z]\.){2,}$/.test(current + char);
        if (!abbreviation && !initials) add(i + 1);
      }
    }
  }
  const last = text.slice(start).trim();
  if (last) clauses.push(last);
  return clauses;
}
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
    (f) => f.text && /\.(?:md|txt|pdf|docx|html|xlsx|csv|json)$/i.test(f.path),
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

// Only parse literal assignment-shaped text. These are candidate claims, never facts.
export function ownershipClaim(text: string): { item: string; person: string } | undefined {
  if (/\b(proposal|proposed|suggested|suggestion)\b/i.test(text)) return;
  const clean = text.replace(/^\s*(?:[-*]\s*)?(?:\[[ xX]\]|[☐☑])?\s*/, '');
  const match =
    clean.match(/^(.+?)\s+[—–]\s+([^;()]+)(?:\([^)]*\))?(?:;.*)?$/) ??
    clean.match(
      /(?:^|[.!?]\s+)([^.!?]+?)\s+(?:owner|assignee|responsible person):\s*([^.;]+)(?:[.;]|$)/i,
    );
  if (!match) return;
  const item = match[1].trim(),
    person = match[2].trim();
  if (!item || !person || /^(?:TBD|unknown|unassigned|unresolved|not assigned)$/i.test(person))
    return;
  return { item, person };
}
export const unresolvedChecklistAction = (text: string) =>
  /^\s*(?:[-*]\s*)?(?:\[[ xX]\]|[☐☑])\s*.+?[—–]\s*(?:TBD|unknown|unassigned)\s*;\s*unresolved\s*$/i.test(
    text,
  );

// These are verifier observations about this run, not factual sources for a
// deliverable. Keep them separate from source windows and worker-authored text.
export function executionObservations(evidence: ReviewEvidence) {
  const checks = evidence.checks.filter(
    (c) => !c.judgment && !c.name.startsWith("Jev:"),
  );
  let remaining = 16000;
  let truncated = checks.length > 24 || evidence.files.length > 20;
  const observedChecks = checks.slice(0, 24).map((c) => {
    const detail = c.detail.slice(0, Math.min(6000, remaining));
    remaining -= detail.length;
    truncated ||= detail.length < c.detail.length || c.name.length > 300;
    return { name: c.name.slice(0, 300), status: c.status, detail };
  });
  const files = evidence.files.slice(0, 20).map((f) => {
    truncated ||= f.path.length > 1000;
    return {
      path: f.path.slice(0, 1000),
      sha256: f.sha256,
      bytes: f.bytes,
      inspectionIncomplete: f.incomplete,
    };
  });
  return {
    scope:
      "Current task verifier observations, not worker assertions or source facts",
    checks: observedChecks,
    files,
    incomplete: checks.some((c) => c.status === "unverified") || evidence.files.some((f) => f.incomplete),
    truncated,
  };
}
