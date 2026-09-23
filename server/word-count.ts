import { marked } from 'marked';

export type WordRange = { min: number; max: number; path: string };

// Deliberately small grammar: a direct writing instruction with one exact range.
// Quoted examples, negations, approximations and competing ranges are not rules.
export function statedWordRange(text: string, path: string, expectedResult = false): WordRange | undefined {
  const candidates = text.split(/\n|[.!?](?:\s|$)/).filter((sentence) =>
    (expectedResult
      ? /^\s*\d{1,4}\s*[-–—]\s*\d{1,4}\s*words\b|^\s*between\s+\d{1,4}\s+and\s+\d{1,4}\s+words\b/i.test(sentence)
      : /\b(?:write|create|draft|keep|make)\s+(?:(?:a|an|the)\s+)?(?:\d{1,4}\s*[-–—]\s*\d{1,4}\s*word|between\s+\d{1,4}\s+and\s+\d{1,4}\s+words)\b/i.test(sentence)) &&
    !/\b(?:introduction|intro|paragraph|section|summary section|conclusion|heading|abstract|bullet|caption)\b/i.test(sentence) &&
    !/\b(?:example|sample|hypothetical|do not|don't|not|optional|if|may|could|avoid|approximately|about|roughly|around|at least|at most|up to)\b|\be\.g\./i.test(sentence) &&
    !/[“”"`]/.test(sentence),
  );
  const ranges = candidates.flatMap((sentence) => {
    const matches = [...sentence.matchAll(/\b(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*words?\b|\bbetween\s+(\d{1,4})\s+and\s+(\d{1,4})\s+words\b/gi)];
    return matches.map((m) => ({ min: Number(m[1] ?? m[3]), max: Number(m[2] ?? m[4]), path }));
  });
  return ranges.length === 1 && ranges[0].min > 0 && ranges[0].max >= ranges[0].min
    ? ranges[0]
    : undefined;
}

export function countWords(text: string) {
  const html = marked.parse(text, { async: false }) as string;
  const plain = html.replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|apos|#39);/g, ' ');
  return plain.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
