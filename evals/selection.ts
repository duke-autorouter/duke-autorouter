import type { EvalCase } from './cases.js';
export const evalKinds = ['coding', 'research', 'writing', 'documents'] as const;
export function balancedCases(cases: EvalCase[], split: EvalCase['split'], limit: number) {
  const groups = evalKinds.map((kind) => cases.filter((c) => c.kind === kind && c.split === split));
  const selected: EvalCase[] = [];
  while (selected.length < limit && groups.some((g) => g.length)) {
    for (const group of groups)
      if (group.length && selected.length < limit) selected.push(group.shift()!);
  }
  return selected;
}
