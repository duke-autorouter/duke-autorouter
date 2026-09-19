import { z } from 'zod';
import { ROSTER_LIMIT, workTypes } from '../shared/routing.js';
import type { Store } from './store.js';
import { Blocked, type Model } from './types.js';

// Older catalog discovery opted every model in. Require an explicit choice once
// for those profiles, retaining the old selection for a reversible migration.
export function initializeRoster(store: Store) {
  if (store.get('roster', 'main')) return;
  const legacy = store.list<Model>('model').filter((m) => m.catalog && m.enabled);
  store.db.exec('BEGIN IMMEDIATE');
  try {
    for (const model of legacy) store.put('model', model.id, { ...model, enabled: false });
    store.put('roster', 'main', {
      version: 1,
      needsReview: !!legacy.length,
      previousModelIds: legacy.map((m) => m.id),
    });
    store.db.exec('COMMIT');
  } catch (e) {
    store.db.exec('ROLLBACK');
    throw e;
  }
}

export function saveRoster(store: Store, body: unknown) {
  const { modelIds } = z
    .object({ modelIds: z.array(z.string().min(1)).max(ROSTER_LIMIT) })
    .parse(body);
  const chosen = new Set(modelIds),
    models = store.list<Model>('model');
  if (chosen.size !== modelIds.length) throw new Blocked('A model can appear only once.');
  if (modelIds.some((id) => !models.some((m) => m.id === id)))
    throw new Blocked('A selected model is no longer available in the catalog. Refresh the list.');
  store.db.exec('BEGIN IMMEDIATE');
  try {
    for (const model of models)
      store.put('model', model.id, { ...model, enabled: chosen.has(model.id) });
    store.put('roster', 'main', {
      ...store.get<object>('roster', 'main'),
      version: 1,
      needsReview: false,
      savedAt: new Date().toISOString(),
    });
    store.db.exec('COMMIT');
  } catch (e) {
    store.db.exec('ROLLBACK');
    throw e;
  }
  return { modelIds };
}
export function savePreferences(store: Store, body: unknown) {
  const value = z
    .partialRecord(
      z.enum(workTypes as [(typeof workTypes)[number], ...(typeof workTypes)[number][]]),
      z.string().min(1),
    )
    .parse(body);
  const old = store.settings().workPreferences ?? {};
  for (const [work, id] of Object.entries(value)) {
    const model = store.get<Model>('model', id!);
    if ((!model || !model.enabled) && old[work as keyof typeof old] !== id)
      throw new Blocked('Choose a model from your selected roster.');
  }
  store.put('settings', 'main', { ...store.settings(), workPreferences: value });
  return value;
}
