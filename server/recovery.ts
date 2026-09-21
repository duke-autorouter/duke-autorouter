import { effortLevels, orderedEfforts, type Effort } from '../shared/effort.js';
import type { Model, Settings, Task } from './types.js';

export const RECOVERY_POLICY = 'duke-recovery-v1';
export const RECOVERY_MIN_PROBABILITY = 0.9;
export type RecoveryCause = 'reasoning' | 'missing_context' | 'tool_failure' | 'unknown';
export type RecoveryJudgment = { cause: RecoveryCause; probability: number };

// One advertised rung, never a model switch or an unadvertised/provider-default effort.
export function nextRecoveryEffort(
  task: Pick<Task, 'attempt' | 'effortOverride'>,
  model: Model,
  settings: Settings,
): Effort | undefined {
  if (task.effortOverride || task.attempt >= settings.maxRecovery || model.effort === undefined)
    return;
  const supported = orderedEfforts(model.supportedEfforts);
  const index = supported.indexOf(model.effort);
  const next = index < 0 ? undefined : supported[index + 1];
  if (next && effortLevels.indexOf(next) <= effortLevels.indexOf(settings.recoveryEffortCeiling))
    return next;
}
export function recoveryPause(cause: RecoveryCause) {
  if (cause === 'missing_context')
    return 'More context is needed. Review the unmet requirements below and clarify them in a follow-up; DUKE has kept your files and has not increased model effort.';
  if (cause === 'tool_failure')
    return 'A tool or environment problem needs attention. Review the checks below, resolve the problem, then continue. DUKE has not increased model effort.';
  return 'DUKE could not identify a reliable automatic repair. Review the checks below and continue with clarification or a model selection.';
}
