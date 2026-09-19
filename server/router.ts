import {
  Blocked,
  type Model,
  type Task,
  type TaskKind,
  type Workspace,
  type Route,
  type Settings,
  type TaskAssessment,
  type RoutingDecision,
} from './types.js';
import { feedbackPreference } from './model-profiles.js';
import { matchingOutcomes, measuredQuality } from './outcomes.js';
import { workTypeFor, briefSizeFor } from './work-profile.js';
import { rankingTokens } from './efficiency.js';
import { ROSTER_LIMIT } from '../shared/routing.js';

export const difficultyRank = { routine: 0, standard: 1, complex: 2 } as const;
export type RoutingTask = Pick<Task, 'prompt' | 'required' | 'modelOverride'> &
  Partial<Pick<Task, 'expectedResult' | 'attachments' | 'checkpoint'>>;

export function applyDifficultyFloor(
  task: RoutingTask,
  assessment: TaskAssessment,
): TaskAssessment {
  const floor = task.checkpoint?.repairDifficulty;
  return floor && difficultyRank[floor] > difficultyRank[assessment.difficulty]
    ? { ...assessment, difficulty: floor }
    : assessment;
}

export function classify(text: string): TaskKind {
  if (/\b(docx|xlsx|spreadsheet|word document|pdf|slide deck)\b/i.test(text)) return 'documents';
  if (
    /\b(code|bug|test|function|typescript|python|repository|refactor|implement|debug|compile)\b/i.test(
      text,
    )
  )
    return 'coding';
  if (/\b(research|sources|compare|investigate|latest|evidence|cite|market|find)\b/i.test(text))
    return 'research';
  return 'writing';
}

// A visible rules fallback, not a claim of measured difficulty accuracy.
export function assessLocally(task: RoutingTask): TaskAssessment {
  const text = `${task.prompt}\n${task.expectedResult ?? ''}`;
  const complex =
    /\b(architect(?:ure)?|distributed|concurrency|race condition|security audit|multi[- ](?:file|service|step)|migrat(?:e|ion)|end.to.end|across (?:the |multiple )?(?:system|service|repo))\b/i.test(
      text,
    );
  const standard =
    /\b(implement|debug|refactor|research|compare|investigate|analy[sz]e|synthesi[sz]e|test|function)\b/i.test(
      text,
    );
  return {
    kind: classify(text),
    workType: workTypeFor(text, classify(text)),
    workTypeSource: 'rules',
    briefSize: briefSizeFor(Buffer.byteLength(text)),
    difficulty:
      complex || text.length > 6000 || task.attachments?.length
        ? 'complex'
        : standard || text.length > 1000
          ? 'standard'
          : 'routine',
    source: 'rules',
  };
}

export function eligibleModels(
  task: RoutingTask,
  workspace: Workspace,
  models: Model[],
  unavailable = new Set<string>(),
) {
  return models.filter(
    (m) =>
      m.enabled &&
      workspace.providers.includes(m.provider) &&
      !unavailable.has(m.id) &&
      task.required.every((c) => m.capabilities.includes(c)),
  );
}

export function qualifiedModels(models: Model[], assessment: TaskAssessment, settings: Settings) {
  const demonstrated = (m: Model) =>
    (measuredQuality(m, assessment) ?? -1) >= settings.qualityFloor;
  const preferred = preferredModelId(settings, assessment);
  const efficiencyOrder = (a: Model, b: Model) => {
    const x = rankingTokens(a, assessment);
    const y = rankingTokens(b, assessment);
    // Within the same quality/preference tier, prefer a measured estimate over
    // unknown consumption. This is a fallback; Jev can choose any qualified model.
    return (
      Number(y !== undefined) - Number(x !== undefined) ||
      (x !== undefined && y !== undefined ? x - y : 0)
    );
  };
  return models
    .filter((m) => {
      if (!m.enabled) return false;
      const reviewed = m.evaluated ? m.quality[assessment.kind] : undefined;
      if (
        (m.maxDifficulty || m.evaluated) &&
        difficultyRank[m.maxDifficulty ?? 'routine'] < difficultyRank[assessment.difficulty]
      )
        return false;
      if (reviewed !== undefined && reviewed < settings.qualityFloor) return false;
      const observed = matchingOutcomes(m, assessment);
      if (
        observed &&
        observed.passed + observed.failed >= 3 &&
        observed.upperBound < settings.qualityFloor
      )
        return false;
      return reviewed !== undefined || !!m.catalog || demonstrated(m);
    })
    .sort(
      (a, b) =>
        Number(demonstrated(b)) - Number(demonstrated(a)) ||
        Number(b.id === preferred) - Number(a.id === preferred) ||
        efficiencyOrder(a, b) ||
        difficultyRank[a.maxDifficulty ?? 'complex'] -
          difficultyRank[b.maxDifficulty ?? 'complex'] ||
        Number(b.catalog?.preferred ?? false) - Number(a.catalog?.preferred ?? false) ||
        feedbackPreference(b) - feedbackPreference(a) ||
        a.id.localeCompare(b.id),
    );
}

export function preferredModelId(settings: Settings, assessment: TaskAssessment) {
  return (
    settings.workPreferences?.[assessment.workType ?? assessment.kind] ??
    settings.workPreferences?.[assessment.kind]
  );
}

export function shortlistModels(
  models: Model[],
  _assessment: TaskAssessment,
  limit = ROSTER_LIMIT,
) {
  // The explicit roster is already small. Never include an unselected catalog model.
  return models.slice(0, Math.min(limit, ROSTER_LIMIT));
}

export function route(
  task: RoutingTask,
  workspace: Workspace,
  models: Model[],
  settings: Settings,
  unavailable = new Set<string>(),
  decision?: RoutingDecision,
): Route {
  const assessment = applyDifficultyFloor(
    task,
    task.modelOverride ? assessLocally(task) : (decision?.assessment ?? assessLocally(task)),
  );
  const eligible = eligibleModels(task, workspace, models, unavailable);
  const qualified = qualifiedModels(eligible, assessment, settings);
  let chosen = task.modelOverride ? eligible.find((m) => m.id === task.modelOverride) : undefined;
  if (task.modelOverride && !chosen)
    throw new Blocked(
      'Your selected model is unavailable or cannot meet this task’s permissions, tools, and budget.',
    );
  const jevChoice =
    !task.modelOverride &&
    decision?.modelId &&
    decision.confidence !== undefined &&
    decision.confidence >= 0.8
      ? qualified.find((m) => m.id === decision.modelId)
      : undefined;
  chosen ??= jevChoice || qualified[0];
  if (!chosen)
    throw new Blocked(
      `No available model has a suitable profile for this ${assessment.difficulty} ${assessment.kind} task. Choose a suitable model in My models, or check its connection and project permissions.`,
    );
  const selectionSource = task.modelOverride ? 'manual' : jevChoice ? 'jev' : 'rules';
  return {
    modelId: chosen.id,
    provider: chosen.provider,
    model: chosen.model,
    kind: assessment.kind,
    assessment,
    selectionSource,
    reason: task.modelOverride
      ? 'Your model selection; workspace, availability, and tool checks passed.'
      : `${assessment.difficulty[0].toUpperCase() + assessment.difficulty.slice(1)} ${assessment.kind} task · ${jevChoice ? 'Jev selected this model' : 'rules selected this model'} · ${chosen.evaluated && chosen.quality[assessment.kind] !== undefined ? 'meets your declared quality and difficulty requirements' : 'initial profile and preferences; collecting results for this type of work'}${task.checkpoint?.repairDifficulty ? ' · difficulty floor retained for an unfinished repair' : ''}`,
    fallbacks: task.modelOverride
      ? []
      : qualified.filter((m) => m.id !== chosen!.id).map((m) => m.id),
  };
}
