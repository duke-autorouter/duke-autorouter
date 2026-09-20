import { orderedEfforts, type Effort } from '../shared/effort.js';
import { Blocked, type Model, type Provider } from './types.js';

export function catalogEfforts(provider: Provider, raw: any): Effort[] {
  if (provider === 'codex')
    return orderedEfforts(
      raw.supportedReasoningEfforts?.map((option: any) => option.reasoningEffort),
    );
  if (provider === 'claude')
    return raw.supportsEffort === false ? [] : orderedEfforts(raw.supportedEffortLevels);
  const values = raw.reasoning?.supported_efforts;
  const efforts = orderedEfforts(
    values === null ? ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] : values,
  );
  return raw.reasoning?.mandatory ? efforts.filter((effort) => effort !== 'none') : efforts;
}
export function effortVariants(model: Model): Model[] {
  if (model.effort !== undefined) return [model];
  const levels = orderedEfforts(model.supportedEfforts);
  return levels.length ? levels.map((effort) => ({ ...model, effort })) : [model];
}
export function workerEffort(model: Model): Effort | undefined {
  if (model.effort !== undefined && !orderedEfforts(model.supportedEfforts).includes(model.effort))
    throw new Blocked(
      'The selected reasoning effort is no longer supported by this model. Refresh the model catalog.',
    );
  if (
    model.effort &&
    ((model.provider === 'claude' &&
      !['low', 'medium', 'high', 'xhigh', 'max'].includes(model.effort)) ||
      (model.provider === 'openrouter' && model.effort === 'ultra'))
  )
    throw new Blocked('This provider does not accept the selected reasoning effort.');
  return model.effort;
}
