import { createHash } from 'node:crypto';
import type { TaskKind, TaskAssessment, Model } from './types.js';
import type { WorkType, BriefSize } from '../shared/routing.js';

export function workTypeFor(text: string, kind: TaskKind): WorkType {
  if (/\b(debug|bug|crash|race condition|diagnos\w*|investigate.*fail)\b/i.test(text))
    return 'debugging';
  if (/\b(batch|repetitive|reformat|rename|convert each|extract .* from each)\b/i.test(text))
    return 'repetitive';
  if (
    /\b(UI|UX|interface|layout|stylesheet|CSS|landing page|responsive|component design)\b/i.test(
      text,
    )
  )
    return 'ui';
  if (/\b(edit|rewrite|proofread|shorten|polish)\b/i.test(text)) return 'editing';
  return kind;
}
export function briefSizeFor(characters: number): BriefSize {
  return characters <= 3000 ? 'short' : characters <= 16000 ? 'medium' : 'long';
}
export const workScope = (
  a: Pick<TaskAssessment, 'kind' | 'difficulty' | 'workType' | 'briefSize'>,
) => ({
  kind: a.kind,
  difficulty: a.difficulty,
  workType: a.workType ?? a.kind,
  briefSize: a.briefSize ?? 'short',
});
export const scopeKey = (
  a: Pick<TaskAssessment, 'kind' | 'difficulty' | 'workType' | 'briefSize'>,
) => JSON.stringify(workScope(a));

// Descriptions, preferences and unrelated roster entries do not change execution.
export function modelExecutionKey(model: Model) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        provider: model.provider,
        model: model.model,
        providerSlug: model.providerSlug,
        maxOutput: model.maxOutput,
        contextLimit: model.contextLimit,
        capabilities: [...model.capabilities].sort(),
      }),
    )
    .digest('hex');
}

// Related evidence is guidance only. Never transfer across family or difficulty,
// or extrapolate from a short brief to a long one. These are policy weights,
// not measured similarities or success probabilities.
export function scopeRelevance(
  a: Pick<TaskAssessment, 'kind' | 'difficulty' | 'workType' | 'briefSize'>,
  b: TaskAssessment,
) {
  if (a.kind !== b.kind || a.difficulty !== b.difficulty || !a.workType || !a.briefSize) return 0;
  const sizes = ['short', 'medium', 'long'];
  const distance = Math.abs(sizes.indexOf(a.briefSize) - sizes.indexOf(b.briefSize ?? 'short'));
  if (distance > 1) return 0;
  return (a.workType === (b.workType ?? b.kind) ? 1 : 0.5) * (distance ? 0.5 : 1);
}
