import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { Engine } from '../server/engine.js';
import { ToolService } from '../server/tools.js';
import { Approvals } from '../server/approval.js';
import { Jev } from '../server/adapters/jev.js';
import {
  ModelInput,
  defaults,
  type Difficulty,
  type Model,
  type Workspace,
  type Worker,
} from '../server/types.js';
import { route } from '../server/router.js';
import { workTypes } from '../shared/routing.js';

function model(id: string, maxDifficulty: Difficulty = 'complex', patch: Partial<Model> = {}) {
  return ModelInput.parse({
    id,
    model: id,
    label: id,
    provider: 'codex',
    enabled: true,
    evaluated: true,
    evidence: 'Synthetic test coverage only',
    maxDifficulty,
    capabilities: ['files'],
    quality: { coding: 0.9, research: 0.9, writing: 0.9 },
    ...patch,
  });
}
function choice(keys: string[], selected: string, confidence = 1) {
  return {
    type: 'choice',
    choice: selected,
    confidence,
    probabilities: Object.fromEntries(keys.map((k) => [k, Number(k === selected)])),
  };
}
function assessment(level: number, confidence = 1) {
  return {
    kind: choice(['coding', 'research', 'writing', 'documents'], 'coding'),
    difficulty: {
      type: 'score',
      score: level,
      confidence,
      probabilities: {
        '0': Number(level === 0),
        '1': Number(level === 1),
        '2': Number(level === 2),
      },
    },
  };
}
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'duke-jev-')));
  const path = join(root, 'workspace');
  await mkdir(path);
  const store = new Store(join(root, 'state', 'router.sqlite'));
  const workspace: Workspace = {
    id: 'w',
    name: 'Synthetic',
    path,
    providers: ['codex', 'claude', 'openrouter'],
    instructions: [],
  };
  store.put('workspace', workspace.id, workspace);
  const calls: any[] = [],
    runs: string[] = [];
  let answer = (body: any): any =>
    body.questions.difficulty
      ? assessment(0)
      : {
          model: choice(
            Object.keys(body.questions.model.criteria),
            Object.keys(body.questions.model.criteria)[0],
          ),
        };
  const jev = new Jev(store, { get: async () => 'synthetic-key' } as any, async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    calls.push(body);
    const answers = answer(body);
    return Response.json({ model: 'fixture-jev', usage: { input_tokens: 10 }, answers });
  });
  // These assertions isolate routing. The full review transport and recovery loop have
  // dedicated coverage in verification.test.ts.
  jev.review = async () => [
    { name: 'Content review', status: 'unverified', detail: 'Routing-only fixture.' },
  ];
  const worker: Worker = {
    run: async (c) => {
      runs.push(c.model.id);
      await c.tool('write_file', { path: 'result.md', content: `Executed by ${c.model.id}` });
      return `Completed with ${c.model.id}`;
    },
  };
  const engine = new Engine(
    store,
    new ToolService(store, new Approvals(store), join(root, 'state')),
    { codex: worker, claude: worker, openrouter: worker },
    jev,
  );
  return {
    root,
    path,
    store,
    workspace,
    calls,
    runs,
    jev,
    engine,
    answer: (fn: typeof answer) => {
      answer = fn;
    },
    add: (...models: Model[]) => {
      models.forEach((m) => store.put('model', m.id, m));
      // Synthetic identifiers use an explicit fallback rather than a real model alias.
      store.put('settings', 'main', { ...store.settings(), jevFallbackModel: models.at(-1)!.id });
    },
    run: async (prompt = 'Change a line of code', patch: Record<string, unknown> = {}) => {
      engine.stopped = true;
      const task = await engine.create({ prompt, workspaceId: 'w', required: ['files'], ...patch });
      await engine.execute(task.id);
      return store.task(task.id);
    },
    close: async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('Jev difficulty changes model eligibility and automatically executes routine and complex tasks', async () => {
  const f = await fixture();
  try {
    f.add(model('quick', 'routine'), model('deep', 'complex'));
    f.answer((body) =>
      body.questions.difficulty
        ? assessment(body.state.task.includes('distributed') ? 2 : 0)
        : {
            model: choice(Object.keys(body.questions.model.criteria), 'candidate_0'),
          },
    );
    const simple = await f.run('Change a line of code');
    const complex = await f.run('Debug a distributed system');
    assert.deepEqual(f.runs, ['quick', 'deep']);
    for (const task of [simple, complex]) {
      assert.equal(task.modelOverride, undefined);
      assert.equal(task.status, 'completed');
      assert.equal(task.route?.selectionSource, 'jev');
      assert.equal(task.route?.assessment.source, 'jev');
    }
    assert.equal(complex.route?.assessment.difficulty, 'complex');
    assert.equal(f.calls[3].state.assessment.difficulty, 'complex');
    assert.deepEqual(
      Object.values(f.calls[3].questions.model.criteria)
        .slice(0, -1)
        .map((v: any) => v.model),
      ['deep'],
    );
    assert.equal(await readFile(join(f.path, 'result.md'), 'utf8'), 'Executed by deep');
    assert.equal(f.store.spending().length, 4);
    assert.equal(f.store.spend().unreconciled, 0);
  } finally {
    await f.close();
  }
});

test('Jev can choose a provider-described model immediately without claiming measured quality', async () => {
  const f = await fixture();
  try {
    f.store.put('settings', 'main', { ...f.store.settings(), jevValidated: false });
    f.add(
      model('catalog', 'complex', {
        evaluated: false,
        evidence: '',
        catalog: {
          description: 'Provider description of coding capability',
          preferred: true,
          discoveredAt: new Date().toISOString(),
        },
      }),
    );
    const task = await f.run();
    assert.equal(task.status, 'completed');
    assert.equal(task.route?.selectionSource, 'jev');
    assert.match(task.route!.reason, /collecting results/);
    const sent = f.calls[1].questions.model.criteria.candidate_0;
    assert.equal(sent.userDeclaredTaskSuccess, null);
    assert.equal(sent.userDeclaredMaxDifficulty, 'complex');
    assert.match(sent.providerDescription, /Provider description/);
    assert.equal(f.store.get<Model>('model', 'catalog')!.evaluated, false);
  } finally {
    await f.close();
  }
});

test('the selected candidate controls dispatch even when rules rank another model first', async () => {
  const f = await fixture();
  try {
    f.add(
      model('a-general'),
      model('z-specialist', 'complex', {
        routingNotes: 'Reviewed strength in concurrency diagnosis',
      }),
    );
    f.answer((body) =>
      body.questions.difficulty
        ? assessment(2)
        : {
            model: choice(Object.keys(body.questions.model.criteria), 'candidate_1'),
          },
    );
    const task = await f.run('Diagnose a race condition in this code');
    assert.equal(task.route?.modelId, 'z-specialist');
    assert.deepEqual(f.runs, ['z-specialist']);
    assert.match(f.calls[1].questions.model.criteria.candidate_1.routingNotes, /concurrency/);
  } finally {
    await f.close();
  }
});

test('permission, tools, quality, difficulty, health, and budget filter candidates before selection', async () => {
  const f = await fixture();
  try {
    f.store.put('workspace', 'w', { ...f.workspace, providers: ['codex', 'openrouter'] });
    f.add(
      model('good'),
      model('too-simple', 'routine'),
      model('out-of-scope', 'complex', { provider: 'claude' }),
      model('disabled', 'complex', { enabled: false }),
      model('no-tools', 'complex', { capabilities: [] }),
      model('weak', 'complex', { quality: { coding: 0.1, research: 0.1, writing: 0.1 } }),
      model('unevaluated', 'complex', { evaluated: false }),
      model('expensive', 'complex', {
        provider: 'openrouter',
        providerSlug: 'test',
        inputPrice: 10000,
        outputPrice: 10000,
      }),
      model('unknown-price', 'complex', { provider: 'openrouter' }),
    );
    f.answer((body) =>
      body.questions.difficulty
        ? assessment(2)
        : {
            model: choice(Object.keys(body.questions.model.criteria), 'candidate_0'),
          },
    );
    const task = await f.run('Debug distributed code');
    assert.equal(task.status, 'completed');
    assert.deepEqual(
      Object.values(f.calls[1].questions.model.criteria)
        .slice(0, -1)
        .map((v: any) => v.model),
      ['good'],
    );
    assert.deepEqual(f.runs, ['good']);
  } finally {
    await f.close();
  }
});

test('a stale Jev choice cannot execute a disabled or newly exhausted model', async () => {
  for (const change of ['disabled', 'quota', 'budget'] as const) {
    const f = await fixture();
    try {
      const first =
        change === 'budget'
          ? model('chosen', 'complex', {
              provider: 'openrouter',
              providerSlug: 'test',
              inputPrice: 1,
              outputPrice: 1,
            })
          : model('chosen');
      f.add(first, model('fallback', 'complex', { provider: 'claude' }));
      f.answer((body) => {
        if (body.questions.difficulty) return assessment(2);
        const selected = Object.entries(body.questions.model.criteria).find(
          ([, v]: any) => v.model === 'chosen',
        )![0];
        if (change === 'disabled') f.store.put('model', 'chosen', { ...first, enabled: false });
        if (change === 'quota')
          f.store.put('health', 'codex', {
            ready: true,
            checkedAt: new Date().toISOString(),
            quota: {
              rateLimits: { primary: { usedPercent: 100, resetsAt: Date.now() / 1000 + 3600 } },
            },
          });
        if (change === 'budget')
          f.store.put('settings', 'main', { ...f.store.settings(), dailyLimit: 0 });
        return { model: choice(Object.keys(body.questions.model.criteria), selected) };
      });
      const task = await f.run('Debug complex distributed code');
      assert.equal(task.status, 'completed', change);
      assert.deepEqual(f.runs, ['fallback'], change);
      assert.equal(task.route?.selectionSource, 'rules');
    } finally {
      await f.close();
    }
  }
});

test('explicit rules choice and invalid candidate IDs fall back automatically at the assessed difficulty', async () => {
  for (const mode of ['rules', 'invalid', 'timeout'] as const) {
    const f = await fixture();
    try {
      f.add(model('quick', 'routine'), model('deep'));
      f.answer((body) => {
        if (body.questions.difficulty) return assessment(2);
        if (mode === 'timeout') throw new Error('selection timeout');
        return {
          model: choice(
            Object.keys(body.questions.model.criteria),
            mode === 'invalid' ? 'outside-candidate-list' : 'use_rules',
          ),
        };
      });
      const task = await f.run();
      assert.equal(task.status, 'completed');
      assert.deepEqual(f.runs, ['deep']);
      assert.equal(task.route?.assessment.difficulty, 'complex');
      assert.equal(task.route?.selectionSource, 'rules');
      assert.equal(f.store.spend().unreconciled, mode === 'timeout' ? 1 : 0);
    } finally {
      await f.close();
    }
  }
});

test('a close choice among qualified models executes Jev selection without a confidence escalation', async () => {
  const f = await fixture();
  try {
    f.add(model('default'), model('selected'));
    f.answer((body) => {
      if (body.questions.difficulty) return assessment(1);
      const keys = Object.keys(body.questions.model.criteria);
      const selected = Object.entries(body.questions.model.criteria).find(
        ([, v]: any) => v.model === 'selected',
      )![0];
      return {
        model: {
          type: 'choice',
          choice: selected,
          confidence: 0.2,
          probabilities: Object.fromEntries(keys.map((key) => [key, key === selected ? 0.4 : 0.3])),
        },
      };
    });
    const task = await f.run();
    assert.equal(task.status, 'completed');
    assert.deepEqual(f.runs, ['selected']);
    assert.equal(task.route?.selectionSource, 'jev');
    assert.equal(task.route?.assessment.difficulty, 'standard');
  } finally {
    await f.close();
  }
});

test('Jev jointly chooses a supported model and effort and the engine records that execution', async () => {
  const f = await fixture();
  try {
    f.add(model('worker', 'complex', { supportedEfforts: ['low', 'max'] }));
    const worker = f.engine.workers.codex;
    let effort: string | undefined;
    f.engine.workers.codex = {
      run: async (context) => {
        effort = context.model.effort;
        return worker.run(context);
      },
    };
    f.answer((body) => {
      if (body.questions.difficulty) return assessment(1);
      const options = body.questions.model.criteria;
      assert.deepEqual(
        Object.values<any>(options)
          .filter((option) => option.model === 'worker')
          .map((option) => option.effort),
        ['low', 'max'],
      );
      const selected = Object.keys(options).find((key) => options[key].effort === 'max')!;
      return { model: choice(Object.keys(options), selected, 0.3) };
    });
    const task = await f.run();
    assert.equal(task.status, 'completed');
    assert.equal(task.route?.effort, 'max');
    assert.equal(task.route?.selectionSource, 'jev');
    assert.equal(effort, 'max');
    assert.equal(f.store.list<any>('routing_run')[0].effort, 'max');
    assert.equal(f.store.list<any>('routing_outcome')[0].effort, 'max');
  } finally {
    await f.close();
  }
});

test('the default fallback cannot silently select a provider flagship', () => {
  const selected = route(
    { prompt: 'Write a short note', required: ['files'] },
    { id: 'w', name: 'Test', path: '/tmp', providers: ['codex'], instructions: [] },
    [
      model('z-default', 'complex', {
        catalog: {
          preferred: true,
          description: 'Provider default',
          discoveredAt: new Date().toISOString(),
        },
      }),
      model('a-qualified', 'routine', { model: 'gpt-5.6-luna' }),
    ],
    defaults,
  );
  assert.equal(selected.modelId, 'a-qualified');
});

test('uncertain task type uses the configured fallback without asking for a model', async () => {
  const f = await fixture();
  try {
    f.add(model('quick', 'routine'), model('deep'));
    f.answer(() => ({
      ...assessment(1),
      kind: {
        type: 'choice',
        choice: 'coding',
        confidence: 0.2,
        probabilities: { coding: 0.5, writing: 0.5, research: 0, documents: 0 },
      },
    }));
    const task = await f.run();
    assert.equal(task.status, 'completed');
    assert.deepEqual(f.runs, ['deep']);
    assert.equal(f.calls.length, 1);
  } finally {
    await f.close();
  }
});

test('rounded distributions retain Jev routing across a nine-option choice', async () => {
  const f = await fixture();
  try {
    f.add(...Array.from({ length: 8 }, (_, i) => model(`worker-${i}`)));
    f.answer((body) => {
      if (body.questions.difficulty)
        return {
          kind: {
            ...choice(['coding', 'research', 'writing', 'documents'], 'coding'),
            probabilities: { coding: 0.97, research: 0.01, writing: 0.01, documents: 0.02 },
          },
          difficulty: {
            type: 'score',
            score: 0.995,
            confidence: 1,
            probabilities: { '0': 0.33, '1': 0.33, '2': 0.33 },
          },
        };
      const keys = Object.keys(body.questions.model.criteria);
      assert.equal(keys.length, 9);
      return {
        model: {
          ...choice(keys, 'candidate_0'),
          probabilities: Object.fromEntries(
            keys.map((key) => [key, key === 'candidate_0' ? 0.9 : 0.01]),
          ),
        },
      };
    });
    const task = await f.run();
    assert.equal(task.route?.selectionSource, 'jev');
    assert.equal(task.route?.modelId, 'worker-0');
    assert.equal(f.calls.length, 2);
  } finally {
    await f.close();
  }
});

test('mixed-precision probabilities retain the allowance of each rounded value', async () => {
  const f = await fixture();
  try {
    f.add(model('quick', 'routine'));
    f.answer((body) =>
      body.questions.difficulty
        ? {
            ...assessment(0),
            kind: {
              ...choice(['coding', 'research', 'writing', 'documents'], 'coding'),
              probabilities: {
                coding: 0.810001,
                research: 0.06,
                writing: 0.06,
                documents: 0.06,
              },
            },
          }
        : {
            model: choice(Object.keys(body.questions.model.criteria), 'candidate_0'),
          },
    );
    const task = await f.run();
    assert.equal(task.route?.selectionSource, 'jev');
    assert.equal(task.route?.modelId, 'quick');
  } finally {
    await f.close();
  }
});

test('rounding allowance cannot accept empty mass, wrong keys or invalid high-precision totals', async () => {
  for (const probabilities of [
    { coding: 0, research: 0, writing: 0, documents: 0 },
    { coding: 0.9, research: 0.09, writing: 0, extra: 0 },
    { coding: 0.5001, research: 0.2001, writing: 0.1501, documents: 0.1401 },
    { coding: 0.5, research: 0.1, writing: 0.1, documents: 0.1 },
  ]) {
    const f = await fixture();
    try {
      f.add(model('quick', 'routine'));
      f.answer(() => ({
        ...assessment(0),
        kind: { ...choice(Object.keys(probabilities), 'coding'), probabilities },
      }));
      assert.equal((await f.run()).route?.selectionSource, 'rules');
    } finally {
      await f.close();
    }
  }
});

test('shadow testing records decisions but cannot change the executed model', async () => {
  const f = await fixture();
  try {
    f.store.put('settings', 'main', { ...f.store.settings(), jevMode: 'observe' });
    f.add(model('quick', 'routine'), model('deep'));
    f.store.put('settings', 'main', { ...f.store.settings(), jevFallbackModel: 'quick' });
    f.answer((body) =>
      body.questions.difficulty
        ? assessment(2)
        : {
            model: choice(Object.keys(body.questions.model.criteria), 'candidate_0'),
          },
    );
    const task = await f.run('Format this code');
    assert.deepEqual(f.runs, ['quick']);
    assert.equal(task.route?.selectionSource, 'rules');
    assert.equal(
      f.store.events(task.id).find((e) => e.kind === 'jev_selection')?.data.modelId,
      'deep',
    );
    assert.equal(f.calls.length, 2);
  } finally {
    await f.close();
  }
});

test('Jev assesses and selects by default for new projects and legacy project settings', async () => {
  for (const legacyValue of [undefined, false, true]) {
    const f = await fixture();
    try {
      if (legacyValue !== undefined)
        f.store.put('workspace', 'w', { ...f.workspace, jevAllowed: legacyValue });
      f.add(model('quick', 'routine'), model('deep'));
      f.answer((body) =>
        body.questions.difficulty
          ? assessment(2)
          : {
              model: choice(Object.keys(body.questions.model.criteria), 'candidate_0'),
            },
      );
      const task = await f.run('Investigate a difficult coding failure');
      assert.equal(task.status, 'completed');
      assert.equal(task.route?.assessment?.source, 'jev');
      assert.equal(task.route?.selectionSource, 'jev');
      assert.deepEqual(f.runs, ['deep']);
      assert.equal(f.calls.length, 2);
    } finally {
      await f.close();
    }
  }
});

test('manual override and diagnostic off mode avoid Jev requests and spend', async () => {
  for (const mode of ['manual', 'off'] as const) {
    const f = await fixture();
    try {
      f.add(model('worker'));
      if (mode === 'off')
        f.store.put('settings', 'main', { ...f.store.settings(), jevMode: 'off' });
      const task = await f.run('Write code', mode === 'manual' ? { modelOverride: 'worker' } : {});
      assert.equal(task.status, 'completed');
      assert.equal(f.calls.length, 0);
      assert.equal(f.store.spending().length, 0);
    } finally {
      await f.close();
    }
  }
});

test('failed workers are removed before Jev selects a recovery model', async () => {
  const f = await fixture();
  try {
    f.add(model('first'), model('second', 'complex', { provider: 'claude' }));
    f.engine.workers.codex = {
      run: async () => {
        throw new Error('Capacity exhausted');
      },
    };
    const task = await f.run('Write code');
    assert.equal(task.status, 'completed');
    assert.deepEqual(f.runs, ['second']);
    assert.equal(task.attempt, 1);
    assert.deepEqual(
      Object.values(f.calls[3].questions.model.criteria)
        .slice(0, -1)
        .map((v: any) => v.model),
      ['second'],
    );
  } finally {
    await f.close();
  }
});

test('legacy evaluations do not imply complex-work coverage', () => {
  const legacy = model('legacy');
  delete legacy.maxDifficulty;
  const workspace: Workspace = {
    id: 'w',
    name: 'w',
    path: '/tmp',
    providers: ['codex'],
    instructions: [],
  };
  const task = { prompt: 'Debug a distributed system', required: ['files'] as const };
  assert.throws(
    () =>
      route({ ...task, required: [...task.required] }, workspace, [legacy], {
        dailyLimit: 5,
        monthlyLimit: 25,
        timezone: 'UTC',
        qualityFloor: 0.8,
        jevMode: 'off',
        jevModel: 'test',
        jevInputPrice: 0.042,
        jevValidated: false,
        maxSteps: 24,
        maxRecovery: 2,
        recoveryEffortCeiling: 'medium',
      }),
    /complex/,
  );
});

test('multi-bucket capacity filters only exhausted models and respects the account usage gate', async () => {
  const f = await fixture();
  try {
    f.add(
      model('available'),
      model('exhausted'),
      model('other-provider', 'complex', { provider: 'claude' }),
    );
    const quota = {
      ordinaryUsageAllowed: true,
      rateLimits: { primary: { usedPercent: 100, resetsAt: Date.now() / 1000 + 1000 } },
      rateLimitsByLimitId: {
        available: { normalModelSlug: 'available', primary: { usedPercent: 20, resetsAt: null } },
        exhausted: { normalModelSlug: 'exhausted', primary: { usedPercent: 100, resetsAt: null } },
      },
    };
    f.store.put('health', 'codex', { ready: true, checkedAt: new Date().toISOString(), quota });
    const task = await f.run();
    assert.equal(task.route?.modelId, 'available');
    assert.ok(!JSON.stringify(f.calls[1]).includes('exhausted'));
    f.store.put('health', 'codex', {
      ready: true,
      checkedAt: new Date().toISOString(),
      quota: { ...quota, ordinaryUsageAllowed: false },
    });
    const denied = await f.run();
    assert.equal(denied.route?.modelId, 'other-provider');
  } finally {
    await f.close();
  }
});

test('cancellation during Jev selection stops dispatch and retains the uncertain reservation', async () => {
  const f = await fixture();
  try {
    f.add(model('worker'));
    f.jev.transport = async (_url, options) => {
      f.engine.active.values().next().value!.abort();
      options?.signal?.throwIfAborted();
      throw new Error('Expected abort');
    };
    const task = await f.run();
    assert.equal(task.status, 'cancelled');
    assert.deepEqual(f.runs, []);
    assert.equal(f.store.spend().unreconciled, 1);
  } finally {
    await f.close();
  }
});

test('Jev receives only selected profiles with scoped work preferences and an efficiency objective', async () => {
  const f = await fixture();
  try {
    f.add(model('selected'), model('outside', 'complex', { enabled: false }));
    f.store.put('settings', 'main', { ...f.store.settings(), workPreferences: { ui: 'selected' } });
    f.answer((body) =>
      body.questions.difficulty
        ? { ...assessment(1), work_type: choice(workTypes, 'ui') }
        : { model: choice(Object.keys(body.questions.model.criteria), 'candidate_0') },
    );
    const task = await f.run('Implement a responsive UI');
    assert.equal(task.route?.assessment.workType, 'ui');
    assert.equal(task.route?.assessment.workTypeSource, 'jev');
    assert.equal(f.calls.length, 2);
    assert.deepEqual(Object.keys(f.calls[0].questions.work_type.criteria), workTypes);
    const selected = f.calls[1].questions.model;
    assert.equal(selected.criteria.candidate_0.userStartingPreference, true);
    assert.equal(selected.criteria.candidate_0.observedEfficiency, null);
    assert.equal(selected.criteria.candidate_1, undefined);
    assert.doesNotMatch(JSON.stringify(f.calls), /outside/);
    assert.match(selected.instructions, /model-specific prices/);
    assert.equal(task.route?.modelId, 'selected');
  } finally {
    await f.close();
  }
});

for (const [probabilities, expected] of [
  [{ '0': 0.4, '1': 0.6, '2': 0 }, 'standard'],
  [{ '0': 0, '1': 0.6, '2': 0.4 }, 'complex'],
  [{ '0': 0.34, '1': 0.33, '2': 0.33 }, 'complex'],
  [{ '0': 0.8, '1': 0.2, '2': 0 }, 'standard'],
  [{ '0': 0.82, '1': 0.18, '2': 0 }, 'routine'],
] as const) {
  test(`ordinal difficulty ${JSON.stringify(probabilities)} retains Jev selection at ${expected}`, async () => {
    const f = await fixture();
    try {
      f.add(model('worker'));
      f.answer((body) =>
        body.questions.difficulty
          ? {
              ...assessment(0),
              difficulty: {
                type: 'score',
                score: probabilities['1'] + 2 * probabilities['2'],
                probabilities,
                confidence: 0.2,
              },
            }
          : {
              model: choice(Object.keys(body.questions.model.criteria), 'candidate_0'),
            },
      );
      const task = await f.run();
      assert.equal(task.status, 'completed');
      assert.equal(task.route?.assessment.source, 'jev');
      assert.equal(task.route?.assessment.difficulty, expected);
      assert.equal(f.calls.length, 2);
      assert.equal(task.route?.selectionSource, 'jev');
    } finally {
      await f.close();
    }
  });
}
