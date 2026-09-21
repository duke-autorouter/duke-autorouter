import { createHash } from 'node:crypto';
import type { Store } from './store.js';
import type { Model, EfficiencyRun, EfficiencySummary, TaskAssessment } from './types.js';
import { modelExecutionKey, scopeKey, scopeRelevance, workScope } from './work-profile.js';
import { REVIEW_POLICY, ROUTING_POLICY } from './outcomes.js';
import { TOOLCHAIN_POLICY, coreSkillsHash } from './core-skills.js';

export const EFFICIENCY_POLICY = 'duke-efficiency-v2';
export function executionKey(store: Store) {
  const s = store.settings();
  return createHash('sha256')
    .update(
      JSON.stringify({
        maxSteps: s.maxSteps,
        maxRecovery: s.maxRecovery,
        recoveryEffortCeiling: s.recoveryEffortCeiling,
        jevModel: s.jevModel,
        mode: s.jevMode,
        jevFallbackModel: s.jevFallbackModel ?? '',
        review: REVIEW_POLICY,
        routing: ROUTING_POLICY,
        tools: TOOLCHAIN_POLICY,
        skills: coreSkillsHash,
      }),
    )
    .digest('hex');
}
export function rosterKey(store: Store) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        // Retained as route context, not a blanket learning reset.
        models: store
          .list<Model>('model')
          .filter((m) => m.enabled)
          .map((m) => ({
            id: m.id,
            model: m.model,
            provider: m.provider,
            maxOutput: m.maxOutput,
            providerSlug: m.providerSlug,
            contextLimit: m.contextLimit,
            maxDifficulty: m.maxDifficulty,
            capabilities: m.capabilities,
            evaluated: m.evaluated,
            quality: m.quality,
            routingNotes: m.routingNotes,
          })),
        preferences: Object.entries(store.settings().workPreferences ?? {}).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
        qualityFloor: store.settings().qualityFloor,
        maxRecovery: store.settings().maxRecovery,
        recoveryEffortCeiling: store.settings().recoveryEffortCeiling,
        maxSteps: store.settings().maxSteps,
        jevModel: store.settings().jevModel,
      }),
    )
    .digest('hex');
}
export function efficiencySummaries(
  store: Store,
  model: Model,
  runs = store.list<EfficiencyRun>('routing_run'),
  key = rosterKey(store),
): EfficiencySummary[] {
  const active = new Set(
    store
      .tasks()
      .filter((t) =>
        ['queued', 'routing', 'running', 'verifying', 'awaiting_approval'].includes(t.status),
      )
      .map((t) => t.id),
  );
  const latest = new Map<string, EfficiencyRun>();
  // Each record holds the cumulative task total. Select the newest record before
  // excluding changed/manual/benchmark runs, so a later continuation cannot make
  // earlier costs disappear or leave stale success evidence behind.
  for (const row of [...runs].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)))
    latest.set(row.taskId, row);
  const groups = new Map<string, EfficiencyRun[]>();
  const modelKey = modelExecutionKey(model),
    currentExecution = executionKey(store);
  for (const row of [...latest.values()].filter(
    (r) =>
      !active.has(r.taskId) &&
      !r.evaluation &&
      r.mode === store.settings().jevMode &&
      (r.policy === EFFICIENCY_POLICY
        ? r.modelKey === modelKey && r.executionKey === currentExecution
        : // Legacy receipts lack per-model configuration: reuse only when verifiable.
          r.policy === 'duke-efficiency-v1' && r.rosterKey === key && model.effort === undefined) &&
      r.modelId === model.id &&
      r.model === model.model &&
      r.status !== 'cancelled' &&
      Date.parse(r.at) > Date.now() - 90 * 86400000,
  )) {
    const k = scopeKey(row.assessment);
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return [...groups.values()].map((group) => {
    const rows = group.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-50);
    const successful = rows.filter((r) => r.status === 'passed').length;
    const incomplete = rows.filter(
      (r) => !r.usage.complete || !r.usage.records || r.status === 'unverified',
    ).length;
    const sampled = rows.filter(
      (r) => r.usage.complete && r.usage.records > 0 && r.status !== 'unverified',
    );
    const sampledSuccessful = sampled.filter((r) => r.status === 'passed').length;
    return {
      ...workScope(rows[0].assessment),
      tasks: rows.length,
      successful,
      recoveredSuccessful: rows.filter((r) => r.status === 'passed' && r.recovered === true).length,
      recoveryUnknown: rows.filter((r) => r.status === 'passed' && r.recovered === undefined)
        .length,
      incomplete,
      sampledTasks: sampled.length,
      sampledSuccessful,
      knownReportedTokens: rows.reduce((sum, r) => sum + r.usage.reportedTokens, 0),
      incompleteReportedTokens: rows
        .filter((r) => !sampled.includes(r))
        .reduce((sum, r) => sum + r.usage.reportedTokens, 0),
      changedRosterTasks: rows.filter((r) => r.rosterKey !== key).length,
      evidence: incomplete ? 'incomplete' : sampledSuccessful >= 5 ? 'established' : 'early',
      // Failed tasks and all retries stay in the numerator. Partial/unverified
      // tasks remain visible beside this complete-subset estimate, never as zeros.
      tokensPerSuccess:
        sampledSuccessful > 0
          ? sampled.reduce((sum, r) => sum + r.usage.reportedTokens, 0) / sampledSuccessful
          : undefined,
    };
  });
}
export function matchingEfficiency(model: Model, assessment: TaskAssessment) {
  return model.efficiency?.find((e) => scopeKey(e) === scopeKey(assessment));
}

export function efficiencyEvidence(model: Model, assessment: TaskAssessment) {
  const exact = matchingEfficiency(model, assessment);
  const related = (model.efficiency ?? [])
    .filter((e) => e !== exact)
    .map((e) => ({ ...e, relevance: scopeRelevance(e, assessment) }))
    .filter((e) => e.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.tasks - a.tasks)
    .slice(0, 4);
  return exact || related.length ? { exact: exact ?? null, related } : null;
}

export function rankingTokens(model: Model, assessment: TaskAssessment) {
  const evidence = matchingEfficiency(model, assessment);
  return evidence && !evidence.incomplete && evidence.sampledSuccessful >= 5
    ? evidence.tokensPerSuccess
    : undefined;
}
