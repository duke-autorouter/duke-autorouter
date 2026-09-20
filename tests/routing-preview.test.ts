import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { Jev } from '../server/adapters/jev.js';
import { ModelInput, type Provider, type Worker, type Workspace } from '../server/types.js';

function model(id: string, provider: Provider = 'codex', evaluated = true) {
  return ModelInput.parse({
    id,
    provider,
    model: provider === 'codex' ? 'gpt-5.6-luna' : 'claude-haiku-4-5',
    label: id,
    enabled: true,
    evaluated,
    evidence: evaluated ? 'Reviewed fixture results' : '',
    capabilities: ['files'],
    quality: { coding: 0.9, research: 0.9, writing: 0.9 },
  });
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'router-preview-')));
  const calls = { worker: 0, jev: 0 };
  const worker: Worker = {
    run: async () => {
      calls.worker++;
      return 'Fixture response';
    },
  };
  const r = await createApp({
    stateDir: join(root, 'state'),
    serveUI: false,
    workers: { codex: worker, claude: worker, openrouter: worker },
  });
  r.engine.jev = new Jev(r.store, { get: async () => undefined } as any);
  r.engine.jev.decide = async () => {
    calls.jev++;
    return undefined;
  };
  const path = join(root, 'workspace');
  await mkdir(path);
  const workspace: Workspace = {
    id: 'workspace',
    name: 'Preview test',
    path,
    providers: ['codex'],
    instructions: [],
  };
  r.store.put('workspace', workspace.id, workspace);
  const login = await r.app.inject({
    method: 'POST',
    url: '/api/session',
    headers: { host: '127.0.0.1:4318' },
    payload: { token: r.launchToken },
  });
  const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join(';');
  const input = {
    prompt: 'Write a short project introduction',
    workspaceId: workspace.id,
    required: ['files'],
  };
  const preview = (patch: Record<string, unknown> = {}) =>
    r.app.inject({
      method: 'POST',
      url: '/api/routes/preview',
      headers: { host: '127.0.0.1:4318', cookie },
      payload: { ...input, ...patch },
    });
  return {
    ...r,
    root,
    calls,
    workspace,
    input,
    preview,
    close: async () => {
      await r.app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('route preview requires authentication and valid local task input', async () => {
  const f = await fixture();
  try {
    const unauthenticated = await f.app.inject({
      method: 'POST',
      url: '/api/routes/preview',
      headers: { host: '127.0.0.1:4318' },
      payload: f.input,
    });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal((await f.preview({ prompt: '' })).statusCode, 400);
    assert.equal((await f.preview({ workspaceId: 'missing' })).statusCode, 409);
    assert.equal(f.store.tasks().length, 0);
  } finally {
    await f.close();
  }
});

test('preview retains a manual option when no profile qualifies without creating tasks, inference, or reservations', async () => {
  const f = await fixture();
  try {
    f.store.put('model', 'trial', model('trial', 'codex', false));
    const automatic = await f.preview();
    assert.equal(automatic.statusCode, 200);
    assert.equal(automatic.json().status, 'blocked');
    assert.match(automatic.json().message, /None of your selected models currently qualifies/);
    assert.deepEqual(
      automatic.json().manualModels.map((m: any) => m.id),
      ['trial'],
    );
    const manual = (await f.preview({ modelOverride: 'trial' })).json();
    assert.equal(manual.status, 'available');
    assert.equal(manual.route.modelId, 'trial');
    assert.deepEqual(f.calls, { worker: 0, jev: 0 });
    assert.equal(f.store.tasks().length, 0);
    assert.deepEqual(f.store.spending(), []);
  } finally {
    await f.close();
  }
});

test('preview cannot offer models outside workspace, tool, or enabled scope', async () => {
  const f = await fixture();
  try {
    f.store.put('model', 'permitted', model('permitted'));
    f.store.put('model', 'other-provider', model('other-provider', 'claude'));
    f.store.put('model', 'disabled', { ...model('disabled'), enabled: false });
    assert.equal((await f.preview()).json().route.modelId, 'permitted');
    for (const modelOverride of ['other-provider', 'disabled']) {
      const blocked = (await f.preview({ modelOverride })).json();
      assert.equal(blocked.status, 'blocked');
      assert.deepEqual(
        blocked.manualModels.map((m: any) => m.id),
        ['permitted'],
      );
    }
    const missingTool = (await f.preview({ required: ['shell'] })).json();
    assert.equal(missingTool.status, 'blocked');
    assert.deepEqual(missingTool.manualModels, []);
    assert.deepEqual(f.calls, { worker: 0, jev: 0 });
  } finally {
    await f.close();
  }
});

test('preview and execution honor exhausted capacity until reset or a refreshed account status', async () => {
  const f = await fixture();
  try {
    f.store.put('workspace', f.workspace.id, { ...f.workspace, providers: ['codex', 'claude'] });
    f.store.put('model', 'a-codex', model('a-codex'));
    f.store.put('model', 'b-claude', model('b-claude', 'claude'));
    const exhausted = {
      provider: 'codex',
      ready: true,
      checkedAt: new Date().toISOString(),
      quota: { rateLimits: { primary: { usedPercent: 100, resetsAt: Date.now() / 1000 + 3600 } } },
    };
    f.store.put('health', 'codex', exhausted);
    const decision = (await f.preview()).json().route;
    assert.equal(decision.modelId, 'b-claude');
    assert.equal((await f.preview({ modelOverride: 'a-codex' })).json().status, 'blocked');
    f.engine.stopped = true;
    const task = await f.engine.create(f.input);
    f.engine.stopped = false;
    await f.engine.execute(task.id);
    assert.equal(f.store.task(task.id).status, 'completed');
    assert.equal(f.store.task(task.id).route?.modelId, decision.modelId);
    assert.equal(f.calls.worker, 1);
    f.store.put('health', 'codex', {
      ...exhausted,
      checkedAt: new Date(Date.now() - 120000).toISOString(),
    });
    assert.equal((await f.preview()).json().route.modelId, 'b-claude');
    f.store.put('health', 'codex', {
      ...exhausted,
      quota: { rateLimits: { primary: { usedPercent: 100, resetsAt: Date.now() / 1000 - 1 } } },
    });
    assert.equal((await f.preview()).json().route.modelId, 'a-codex');
    f.store.put('health', 'codex', {
      provider: 'codex',
      ready: false,
      checkedAt: new Date().toISOString(),
    });
    assert.equal((await f.preview()).json().route.modelId, 'b-claude');
  } finally {
    await f.close();
  }
});

test('preview identifies Jev automatic-selection uncertainty without inference', async () => {
  const f = await fixture();
  try {
    f.store.put('model', 'research-only', {
      ...model('research-only'),
      quality: { coding: 0, research: 0.9, writing: 0 },
    });
    f.store.put('settings', 'main', {
      ...f.store.settings(),
      jevMode: 'assist',
      jevValidated: true,
    });
    const assisted = (await f.preview()).json();
    assert.equal(assisted.status, 'blocked');
    assert.equal(assisted.jevMayRefine, true);
    assert.equal((await f.preview({ modelOverride: 'research-only' })).json().jevMayRefine, false);
    f.store.put('workspace', f.workspace.id, { ...f.workspace, jevAllowed: false });
    assert.equal((await f.preview()).json().jevMayRefine, true);
    f.store.put('settings', 'main', { ...f.store.settings(), jevMode: 'off' });
    assert.equal((await f.preview()).json().jevMayRefine, false);
    assert.deepEqual(f.calls, { worker: 0, jev: 0 });
    assert.deepEqual(f.store.spending(), []);
  } finally {
    await f.close();
  }
});
