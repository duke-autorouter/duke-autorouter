import type { Model, Outcome, OutcomeSummary, TaskAssessment, TaskKind } from './types.js';
import type { Store } from './store.js';
import { modelExecutionKey, scopeRelevance } from './work-profile.js';

export const REVIEW_POLICY = 'duke-review-v7';
// Acceptance labels feed whole-task efficiency as well as quality history.
export const ROUTING_POLICY = 'duke-routing-v13';
export const REVIEW_MIN_PROBABILITY = 0.8;

const scope = (o: Pick<TaskAssessment, 'kind' | 'difficulty' | 'workType' | 'briefSize'>) =>
  `${o.kind}:${o.difficulty}:${o.workType ?? 'legacy'}:${o.briefSize ?? 'legacy'}`;

// Wilson interval: a handful of successful judge reviews must not become a 100% quality claim.
export function interval(passed: number, failed: number) {
  const n = passed + failed;
  if (!n) return { lowerBound: 0, upperBound: 1 };
  const p = passed / n,
    z = 1.96,
    d = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / d;
  const radius = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / d;
  return { lowerBound: Math.max(0, center - radius), upperBound: Math.min(1, center + radius) };
}

export function outcomeSummaries(
  store: Store,
  model: Model,
  kind?: TaskKind,
  outcomes = store.list<Outcome>('routing_outcome'),
): OutcomeSummary[] {
  const latest = new Map<string, Outcome>();
  for (const o of outcomes
    .filter(
      (o) =>
        !o.evaluation &&
        o.modelId === model.id &&
        o.model === model.model &&
        (o.modelKey ? o.modelKey === modelExecutionKey(model) : model.effort === undefined) &&
        o.policy === REVIEW_POLICY &&
        (!kind || o.kind === kind) &&
        Date.parse(o.at) > Date.now() - 90 * 86400000,
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    // Repeated retries/resumes of one task are one observation per task family/difficulty.
    latest.set(`${o.taskId}:${scope(o)}`, o);
  }
  const groups = new Map<string, Outcome[]>();
  for (const o of latest.values()) {
    const key = scope(o);
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups.values()].map((group) => {
    const rows = group.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-50);
    const passed = rows.filter((o) => o.status === 'passed').length;
    const failed = rows.filter((o) => o.status === 'failed').length;
    return {
      kind: rows[0].kind,
      difficulty: rows[0].difficulty,
      workType: rows[0].workType,
      briefSize: rows[0].briefSize,
      passed,
      failed,
      unverified: rows.filter((o) => o.status === 'unverified').length,
      ...interval(passed, failed),
    };
  });
}

export function matchingOutcomes(model: Model, assessment: TaskAssessment) {
  return model.observations?.find((o) => scope(o) === scope(assessment));
}

export function qualityEvidence(model: Model, assessment: TaskAssessment) {
  const exact = matchingOutcomes(model, assessment);
  const related = (model.observations ?? [])
    .filter((o) => o !== exact)
    .map((o) => ({ ...o, relevance: scopeRelevance(o, assessment) }))
    .filter((o) => o.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.passed + b.failed - (a.passed + a.failed))
    .slice(0, 4);
  return exact || related.length ? { exact: exact ?? null, related } : null;
}

export function measuredQuality(model: Model, assessment: TaskAssessment): number | undefined {
  const reviewed = model.evaluated ? model.quality[assessment.kind] : undefined;
  const o = matchingOutcomes(model, assessment);
  // Automated checks are provisional evidence. Their conservative bound can help routing,
  // but they never rewrite a controlled evaluation or its difficulty coverage.
  const observed = o && o.passed + o.failed >= 5 ? o.lowerBound : undefined;
  if (reviewed !== undefined)
    return o && o.passed + o.failed >= 5 && o.upperBound < reviewed
      ? Math.min(reviewed, o.upperBound)
      : reviewed;
  return observed;
}
