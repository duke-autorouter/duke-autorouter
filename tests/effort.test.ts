import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogEfforts, workerEffort } from '../server/effort.js';
import { ModelInput, defaults, type Workspace } from '../server/types.js';
import { route } from '../server/router.js';
import { modelExecutionKey } from '../server/work-profile.js';
import { Store } from '../server/store.js';
import { outcomeSummaries, REVIEW_POLICY } from '../server/outcomes.js';

const model = (id: string, provider: 'codex' | 'claude' = 'codex') =>
  ModelInput.parse({
    id,
    model: id,
    label: id,
    provider,
    enabled: true,
    evaluated: true,
    evidence: 'Synthetic profile',
    quality: { coding: 1, research: 1, writing: 1 },
    maxDifficulty: 'routine',
    capabilities: ['files'],
    supportedEfforts: ['low', 'high'],
  });
const workspace: Workspace = {
  id: 'w',
  name: 'Fixture',
  path: '/tmp',
  providers: ['codex', 'claude'],
  instructions: [],
};
const task = { prompt: 'Debug a distributed system', required: ['files'] as ['files'] };

test('effort discovery uses provider-advertised levels, orders them and respects mandatory reasoning', () => {
  assert.deepEqual(
    catalogEfforts('codex', {
      supportedReasoningEfforts: [
        { reasoningEffort: 'max' },
        { reasoningEffort: 'low' },
        { reasoningEffort: 'future' },
      ],
    }),
    ['low', 'max'],
  );
  assert.deepEqual(
    catalogEfforts('claude', { supportsEffort: true, supportedEffortLevels: ['high', 'low'] }),
    ['low', 'high'],
  );
  assert.deepEqual(
    catalogEfforts('claude', { supportsEffort: false, supportedEffortLevels: ['low'] }),
    [],
  );
  assert.deepEqual(
    catalogEfforts('openrouter', {
      reasoning: { supported_efforts: ['high', 'none', 'minimal'], mandatory: true },
    }),
    ['minimal', 'high'],
  );
  assert.deepEqual(catalogEfforts('openrouter', {}), []);
});

test('automatic fallback uses Luna or Haiku at the lowest effort and never a flagship', () => {
  const luna = model('gpt-5.6-luna'),
    haiku = model('claude-haiku-4-5', 'claude'),
    astra = model('gpt-6-astra');
  const first = route(task, workspace, [astra, luna], defaults);
  assert.equal(first.modelId, luna.id);
  assert.equal(first.effort, 'low');
  assert.equal(
    route(task, workspace, [astra, luna, haiku], defaults, new Set([luna.id])).modelId,
    haiku.id,
  );
  assert.throws(() => route(task, workspace, [astra, { ...luna, enabled: false }], defaults));
  assert.throws(() => route(task, workspace, [astra, { ...luna, capabilities: [] }], defaults));
});

test('explicit fallback is honored, and its absence or lost effort support cannot activate another model', () => {
  const luna = model('gpt-5.6-luna'),
    astra = model('gpt-6-astra');
  const settings = { ...defaults, jevFallbackModel: astra.id };
  const selected = route(task, workspace, [luna, astra], settings);
  assert.equal(selected.modelId, astra.id);
  assert.equal(selected.effort, 'low');
  assert.throws(() => route(task, workspace, [luna, { ...astra, enabled: false }], settings));
  assert.throws(() => workerEffort({ ...luna, effort: 'max' }), /no longer supported/);
});

test('effort-specific observations do not mix with another level or legacy unknown effort', () => {
  const store = new Store(':memory:');
  try {
    const base = model('gpt-5.6-luna'),
      low = { ...base, effort: 'low' as const },
      high = { ...base, effort: 'high' as const };
    assert.notEqual(modelExecutionKey(low), modelExecutionKey(high));
    const row = {
      taskId: 't',
      modelId: base.id,
      model: base.model,
      kind: 'writing',
      difficulty: 'routine',
      status: 'passed',
      at: new Date().toISOString(),
      policy: REVIEW_POLICY,
      modelKey: modelExecutionKey(low),
    };
    store.put('routing_outcome', 't', row);
    assert.equal(outcomeSummaries(store, low).length, 1);
    assert.equal(outcomeSummaries(store, high).length, 0);
    store.put('routing_outcome', 'legacy', { ...row, taskId: 'old', modelKey: undefined });
    assert.equal(outcomeSummaries(store, low)[0].passed, 1);
  } finally {
    store.close();
  }
});
