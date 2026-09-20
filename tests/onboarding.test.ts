import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { Jev } from '../server/adapters/jev.js';
import { recordCatalog, modelsWithFeedback } from '../server/model-profiles.js';
import { saveRoster } from '../server/roster.js';
import { route } from '../server/router.js';
import { defaults, type Workspace, type Worker } from '../server/types.js';

test('provider discovery waits for selection without claiming evaluated quality; refresh preserves user choices', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-onboarding-'));
  const worker: Worker = { run: async () => 'Completed fixture work' };
  const r = await createApp({
    stateDir: join(root, 'state'),
    serveUI: false,
    workers: { codex: worker, claude: worker, openrouter: worker },
  });
  r.engine.jev = new Jev(r.store, { get: async () => undefined } as any);
  const workspace: Workspace = {
    id: 'w',
    name: 'Project',
    path: join(root, 'work'),
    providers: ['codex'],
    instructions: [],
  };
  await mkdir(workspace.path);
  r.store.put('workspace', workspace.id, workspace);
  const catalog = [
    {
      model: 'general',
      displayName: 'General worker',
      description: 'General coding, research and writing',
      isDefault: true,
    },
    { model: 'specialist', displayName: 'Specialist', description: 'Complex reasoning' },
  ];
  try {
    let profiles = recordCatalog(r.store, 'codex', catalog);
    assert.ok(profiles.every((m) => !m.enabled && !m.evaluated && !m.evidence));
    assert.deepEqual(profiles[0].quality, { coding: 0, research: 0, writing: 0 });
    const task = { prompt: 'Debug a distributed system', required: ['files'] as const };
    assert.throws(
      () => route({ ...task, required: [...task.required] }, workspace, profiles, defaults),
      /No available model/,
    );
    saveRoster(r.store, { modelIds: [profiles[0].id] });
    r.store.put('settings', 'main', { ...defaults, jevFallbackModel: profiles[0].id });
    profiles = modelsWithFeedback(r.store);
    const selected = route(
      { ...task, required: [...task.required] },
      workspace,
      profiles,
      r.store.settings(),
    );
    assert.equal(selected.modelId, 'codex:general');
    assert.match(selected.reason, /configured fallback/);
    const created = await r.engine.create({ ...task, workspaceId: 'w' });
    for (let i = 0; i < 100 && r.store.task(created.id).status !== 'completed'; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(r.store.task(created.id).status, 'completed');
    assert.equal(r.store.task(created.id).modelOverride, undefined);
    r.store.put('model', profiles[0].id, { ...profiles[0], enabled: false });
    assert.equal(recordCatalog(r.store, 'codex', catalog)[0].enabled, false);
    assert.deepEqual(r.store.spending(), []);
  } finally {
    await r.app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('feedback is one rating per task, informs future routing, and leaves measured quality unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-feedback-'));
  const r = await createApp({ stateDir: join(root, 'state'), serveUI: false });
  try {
    recordCatalog(r.store, 'codex', [
      { model: 'a', description: 'General' },
      { model: 'b', description: 'General' },
    ]);
    saveRoster(r.store, { modelIds: ['codex:a', 'codex:b'] });
    const workspace: Workspace = {
      id: 'w',
      name: 'Project',
      path: root,
      providers: ['codex'],
      instructions: [],
    };
    const task = { prompt: 'Write an introduction', required: ['files'] as const };
    for (let i = 0; i < 3; i++)
      r.store.put('feedback', String(i), { modelId: 'codex:b', kind: 'writing', rating: 'worked' });
    // The same task's changed rating replaces the earlier one, rather than inflating evidence.
    r.store.put('feedback', '0', { modelId: 'codex:b', kind: 'writing', rating: 'needs_work' });
    const profiles = modelsWithFeedback(r.store, 'writing');
    assert.deepEqual(profiles[1].feedback, { worked: 2, needsWork: 1 });
    assert.equal(profiles[1].evaluated, false);
    assert.equal(profiles[1].quality.writing, 0);
    assert.equal(
      route({ ...task, required: [...task.required] }, workspace, profiles, {
        ...defaults,
        jevFallbackModel: 'codex:b',
      }).modelId,
      'codex:b',
    );
    assert.equal(modelsWithFeedback(r.store, 'coding')[1].feedback?.worked, 0);
  } finally {
    await r.app.close();
    await rm(root, { recursive: true, force: true });
  }
});
