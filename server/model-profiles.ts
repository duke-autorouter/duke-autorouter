import { Store } from './store.js';
import { ModelInput, type Model, type Provider, type TaskKind, type Outcome } from './types.js';
import { outcomeSummaries } from './outcomes.js';
import { efficiencySummaries, rosterKey } from './efficiency.js';
import type { EfficiencyRun } from './types.js';
import { catalogEfforts, effortVariants } from './effort.js';

export const catalogFields = ['inputPrice', 'outputPrice', 'requestPrice', 'contextLimit'] as const;
export function preserveModelOverrides(model: Model, previous?: Model): Model {
  if (!previous?.catalog) return model;
  const overrides = new Set(previous.catalogOverrides ?? []);
  for (const key of catalogFields) {
    if (model[key] !== previous[key]) overrides.add(key);
  }
  return { ...model, catalogOverrides: [...overrides] };
}

export function recordCatalog(store: Store, provider: Provider, list: any[]) {
  const results: Model[] = [];
  // SDK aliases can move between releases. Also expose provider-resolved IDs
  // so users can select a version without inheriting an older alias's evidence.
  const entries = [...list];
  if (provider === 'claude') {
    const seen = new Set(list.map((raw) => raw.value));
    for (const raw of list) {
      const resolved = raw.resolvedModel;
      if (typeof resolved !== 'string' || !resolved.startsWith('claude-') || seen.has(resolved)) continue;
      seen.add(resolved);
      entries.push({ ...raw, value: resolved, displayName: String(raw.description ?? resolved).split(' · ')[0], isDefault: false, is_default: false });
    }
  }
  for (const raw of entries) {
    const model = provider === 'codex' ? raw.model : provider === 'claude' ? raw.value : raw.id;
    if (!model) continue;
    // API models without tools cannot complete DUKE's shared-tool tasks.
    if (provider === 'openrouter' && !raw.supported_parameters?.includes('tools')) continue;
    const id = `${provider}:${model}`;
    const existing = store.get<Model>('model', id);
    const numeric = (value: unknown, multiplier = 1) => {
      if (value === undefined || value === null || value === '') return undefined;
      const n = Number(value) * multiplier;
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const fresh = {
      inputPrice: provider === 'openrouter' ? numeric(raw.pricing?.prompt, 1e6) : undefined,
      outputPrice: provider === 'openrouter' ? numeric(raw.pricing?.completion, 1e6) : undefined,
      requestPrice: provider === 'openrouter' ? numeric(raw.pricing?.request) : 0,
      contextLimit:
        Number.isInteger(raw.context_length) && raw.context_length > 0
          ? raw.context_length
          : (existing?.contextLimit ?? 32000),
    };
    // Preserve explicit endpoint caps and edits; ordinary catalog refresh replaces stale data.
    const overrides = new Set(
      existing?.catalogOverrides ?? (existing?.providerSlug ? catalogFields : []),
    );
    for (const key of overrides) if (existing) (fresh as any)[key] = existing[key];
    const value = ModelInput.parse({
      id,
      provider,
      model,
      label: raw.displayName ?? raw.display_name ?? raw.name ?? model,
      enabled: false,
      capabilities: ['files', 'shell', 'web', 'browser', 'artifacts'],
      quality: { coding: 0, research: 0, writing: 0 },
      maxOutput: 4096,
      ...existing,
      ...fresh,
      supportedEfforts: catalogEfforts(provider, raw),
      catalogOverrides: [...overrides],
      catalog: {
        description: String(
          raw.description ?? raw.displayName ?? raw.display_name ?? raw.name ?? model,
        ).slice(0, 4000),
        preferred: raw.isDefault === true || raw.is_default === true,
        discoveredAt: new Date().toISOString(),
      },
    });
    store.put('model', id, value);
    results.push(value);
  }
  return results;
}

export function modelsWithFeedback(store: Store, kind?: TaskKind, withEfforts = false): Model[] {
  const evaluationTasks = new Set(
    store
      .tasks()
      .filter((t) => t.evaluation)
      .map((t) => t.id),
  );
  const feedback = store
    .list<any>('feedback')
    .filter((f) => !evaluationTasks.has(f.taskId) && (!kind || f.kind === kind));
  const outcomes = store.list<Outcome>('routing_outcome');
  const runs = store.list<EfficiencyRun>('routing_run'),
    key = rosterKey(store);
  const models = store.list<Model>('model');
  return (withEfforts ? models.flatMap(effortVariants) : models).map((model) => ({
    ...model,
    ...(!withEfforts && model.supportedEfforts?.length
      ? {
          effortProfiles: effortVariants(model).map((variant) => ({
            effort: variant.effort!,
            observations: outcomeSummaries(store, variant, kind, outcomes),
            efficiency: efficiencySummaries(store, variant, runs, key),
          })),
        }
      : {}),
    observations: outcomeSummaries(store, model, kind, outcomes),
    efficiency: efficiencySummaries(store, model, runs, key),
    feedback: {
      worked: feedback.filter((f) => f.modelId === model.id && f.rating === 'worked').length,
      needsWork: feedback.filter((f) => f.modelId === model.id && f.rating === 'needs_work').length,
    },
  }));
}

export function feedbackPreference(model: Model) {
  const f = model.feedback;
  if (!f || f.worked + f.needsWork < 3) return 0;
  // Smoothed user feedback is a preference signal, not an evaluated success rate.
  return (f.worked + 1) / (f.worked + f.needsWork + 2) - 0.5;
}
