import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { initializeRoster, saveRoster, savePreferences } from '../server/roster.js';
import { recordCatalog, modelsWithFeedback } from '../server/model-profiles.js';
import { normalizeUsage, WorkerUsage, summarizeUsage } from '../server/usage.js';
import {
  EFFICIENCY_POLICY,
  rosterKey,
  matchingEfficiency,
  executionKey,
  efficiencyEvidence,
  rankingTokens,
} from '../server/efficiency.js';
import { modelExecutionKey } from '../server/work-profile.js';
import { qualifiedModels, assessLocally } from '../server/router.js';
import {
  outcomeSummaries,
  matchingOutcomes,
  REVIEW_POLICY,
  qualityEvidence,
  measuredQuality,
} from '../server/outcomes.js';
import {
  defaults,
  ModelInput,
  type Model,
  type TaskAssessment,
  type EfficiencyRun,
  type Outcome,
} from '../server/types.js';

const assessment: TaskAssessment = {
  kind: 'writing',
  difficulty: 'routine',
  workType: 'writing',
  briefSize: 'short',
  source: 'rules',
};
const model = (id: string, patch: Partial<Model> = {}): Model =>
  ModelInput.parse({
    id,
    model: id,
    label: id,
    provider: 'codex',
    enabled: true,
    evaluated: true,
    quality: { writing: 0.85, coding: 0.85, research: 0.85 },
    maxDifficulty: 'complex',
    evidence: 'Synthetic fixture',
    capabilities: ['files'],
    ...patch,
  });
const efficiency = (tokens: number) => ({
  ...assessment,
  workType: 'writing' as const,
  briefSize: 'short' as const,
  tasks: 5,
  successful: 5,
  incomplete: 0,
  sampledTasks: 5,
  sampledSuccessful: 5,
  knownReportedTokens: tokens * 5,
  incompleteReportedTokens: 0,
  changedRosterTasks: 0,
  evidence: 'established' as const,
  tokensPerSuccess: tokens,
});

test('migration requires a one-time catalog selection and preserves connections, preferences and manual profiles', () => {
  const s = new Store(':memory:');
  try {
    const profile = recordCatalog(s, 'codex', [{ model: 'legacy', isDefault: true }])[0];
    s.put('model', profile.id, { ...profile, enabled: true });
    s.put('model', 'manual', model('manual'));
    s.put('health', 'codex', { ready: true });
    s.put('settings', 'main', { workPreferences: { writing: profile.id } });
    initializeRoster(s);
    assert.equal(s.get<Model>('model', profile.id)!.enabled, false);
    assert.equal(s.get<Model>('model', 'manual')!.enabled, true);
    assert.equal(s.get<any>('health', 'codex')!.ready, true);
    assert.equal(s.settings().workPreferences?.writing, profile.id);
    assert.deepEqual(s.get<any>('roster', 'main')!.previousModelIds, [profile.id]);
    saveRoster(s, { modelIds: [profile.id] });
    initializeRoster(s);
    assert.equal(s.get<Model>('model', profile.id)!.enabled, true);
    assert.equal(s.get<any>('roster', 'main')!.needsReview, false);
    recordCatalog(s, 'codex', [{ model: 'legacy' }, { model: 'new' }]);
    assert.equal(s.get<Model>('model', 'codex:new')!.enabled, false);
    assert.equal(s.get<Model>('model', profile.id)!.enabled, true);
  } finally {
    s.close();
  }
});

test('roster changes are all-or-nothing; preferences use only selected models and never activate one', () => {
  const s = new Store(':memory:');
  try {
    for (let i = 0; i < 33; i++) s.put('model', String(i), model(String(i), { enabled: false }));
    saveRoster(s, { modelIds: ['0'] });
    for (const ids of [
      ['0', 'missing'],
      ['0', '0'],
      Array.from({ length: 33 }, (_, i) => String(i)),
    ])
      assert.throws(() => saveRoster(s, { modelIds: ids }));
    assert.deepEqual(
      s
        .list<Model>('model')
        .filter((m) => m.enabled)
        .map((m) => m.id),
      ['0'],
    );
    assert.throws(() => savePreferences(s, { writing: '1' }), /selected roster/);
    assert.throws(() => savePreferences(s, { unknownCategory: '0' }));
    savePreferences(s, { writing: '0' });
    saveRoster(s, { modelIds: ['1'] });
    savePreferences(s, { writing: '0', ui: '1' }); // retained, visibly unavailable preference
    assert.equal(s.get<Model>('model', '0')!.enabled, false);
    savePreferences(s, {});
    assert.deepEqual(s.settings().workPreferences, {});
  } finally {
    s.close();
  }
});

test('roster and preference HTTP endpoints require a session; per-model updates cannot bypass the cap', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-roster-api-'));
  const r = await createApp({ stateDir: root, serveUI: false });
  try {
    const req = (url: string, payload: any, cookie = '', method: any = 'PUT') =>
      r.app.inject({
        method,
        url,
        payload,
        headers: { host: '127.0.0.1:4318', cookie },
      });
    assert.equal((await req('/api/roster', { modelIds: [] })).statusCode, 401);
    assert.equal((await req('/api/routing-preferences', {})).statusCode, 401);
    const login = await req('/api/session', { token: r.launchToken }, '', 'POST');
    const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join(';');
    for (let i = 0; i < 33; i++)
      r.store.put('model', String(i), model(String(i), { enabled: false }));
    const ids = Array.from({ length: 32 }, (_, i) => String(i));
    assert.equal((await req('/api/roster', { modelIds: ids }, cookie)).statusCode, 200);
    assert.equal((await req('/api/models/32', model('32'), cookie)).statusCode, 409);
    assert.equal((await req('/api/routing-preferences', { ui: '0' }, cookie)).statusCode, 200);
    assert.equal((await req('/api/routing-preferences', { ui: '32' }, cookie)).statusCode, 409);
  } finally {
    await r.app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('rules honor explicit preferences within a quality tier, then rank by whole-task efficiency', () => {
  const lean = { ...model('lean'), efficiency: [efficiency(500)] };
  const strong = {
    ...model('strong', { quality: { writing: 0.99, coding: 0.99, research: 0.99 } }),
    efficiency: [efficiency(1500)],
  };
  const settings = { ...defaults, workPreferences: { writing: 'strong' } };
  assert.equal(qualifiedModels([strong, lean], assessment, settings)[0].id, 'strong');
  assert.equal(qualifiedModels([strong, lean], assessment, defaults)[0].id, 'lean');
  assert.equal(
    qualifiedModels([lean, model('unsampled')], assessment, {
      ...defaults,
      workPreferences: { writing: 'unsampled' },
    })[0].id,
    'unsampled',
  );
  assert.equal(
    qualifiedModels([strong, lean], assessment, { ...settings, qualityFloor: 0.9 })[0].id,
    'strong',
  );
  assert.equal(
    qualifiedModels([model('lean'), model('strong')], assessment, settings)[0].id,
    'strong',
  );
  const small = model('small', { maxDifficulty: 'routine' });
  assert.ok(
    !qualifiedModels(
      [small, strong],
      { ...assessment, difficulty: 'complex' },
      { ...defaults, workPreferences: { writing: 'small' } },
    ).some((m) => m.id === 'small'),
  );
});

test('legacy declared difficulty also applies to documents without a declared document score', () => {
  const legacy = model('legacy', {
    maxDifficulty: undefined,
    catalog: {
      description: 'A general model',
      preferred: false,
      discoveredAt: new Date().toISOString(),
    },
  });
  const catalog = model('catalog', {
    evaluated: false,
    maxDifficulty: undefined,
    catalog: {
      description: 'A general model',
      preferred: false,
      discoveredAt: new Date().toISOString(),
    },
  });
  const documents: TaskAssessment = {
    ...assessment,
    kind: 'documents',
    workType: 'documents',
    difficulty: 'complex',
  };
  assert.deepEqual(
    qualifiedModels([legacy, catalog], documents, defaults).map((m) => m.id),
    ['catalog'],
  );
  assert.ok(qualifiedModels([legacy], { ...documents, difficulty: 'routine' }, defaults).length);
  const belowFloor = model('low-score', {
    quality: { coding: 0.85, research: 0.85, writing: 0.85, documents: 0.2 },
  });
  assert.equal(
    qualifiedModels([belowFloor], documents, {
      ...defaults,
      workPreferences: { documents: 'low-score' },
    }).length,
    0,
  );
});

test('unknown token use never looks free, and work preferences do not lower assessed difficulty', () => {
  const models = [
    { ...model('known'), efficiency: [efficiency(900)] },
    model('unknown'),
    { ...model('lean'), efficiency: [efficiency(600)] },
  ];
  for (const order of [models, [...models].reverse(), [models[1], models[2], models[0]]])
    assert.deepEqual(
      qualifiedModels(order, assessment, defaults).map((m) => m.id),
      ['lean', 'known', 'unknown'],
    );
  const a = assessLocally({ prompt: 'Batch migrate code across multiple services', required: [] });
  assert.equal(a.workType, 'repetitive');
  assert.equal(a.difficulty, 'complex');
  assert.equal(matchingEfficiency(models[0], { ...assessment, workType: 'editing' }), undefined);
});

test('provider usage normalization counts caches and reasoning once, across all Claude models', () => {
  const codex = normalizeUsage('codex', {
    total: {
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      cachedInputTokens: 80,
      cacheWriteInputTokens: 10,
      reasoningOutputTokens: 30,
    },
  });
  assert.equal(codex.totalTokens, 140);
  assert.equal(codex.complete, true);
  const claude = normalizeUsage('claude', {
    modelUsage: {
      main: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadInputTokens: 60,
        cacheCreationInputTokens: 10,
        thinkingTokens: 15,
      },
      helper: {
        inputTokens: 5,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    },
  });
  assert.equal(claude.inputTokens, 85);
  assert.equal(claude.totalTokens, 110);
  assert.equal(claude.complete, true);
  assert.equal(
    normalizeUsage('claude', {
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 5,
      },
    }).complete,
    false,
  );
  assert.equal(
    normalizeUsage('openrouter', {
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_tokens_details: { cached_tokens: 90 },
      completion_tokens_details: { reasoning_tokens: 15 },
    }).totalTokens,
    120,
  );
  assert.equal(normalizeUsage('jev', { input_tokens: 30 }).totalTokens, 30);
  assert.equal(
    normalizeUsage('codex', { total: { inputTokens: 5, outputTokens: 2, totalTokens: 1 } })
      .complete,
    false,
  );
  assert.equal(
    normalizeUsage('openrouter', { prompt_tokens: -1, completion_tokens: 5 }).complete,
    false,
  );
});

test('cumulative snapshots replace earlier totals; multiple API calls add and missing reports retain known use', () => {
  const worker = new WorkerUsage('codex');
  worker.accept('subscription_usage', {
    total: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
  });
  worker.accept('subscription_usage', {
    total: { inputTokens: 40, outputTokens: 20, totalTokens: 60 },
  });
  assert.equal(worker.snapshot(true).totalTokens, 60);
  assert.equal(worker.snapshot(false).complete, false);
  const api = new WorkerUsage('openrouter');
  api.accept('api_request_started', { reservation: 'a' });
  api.accept('api_usage', {
    reservation: 'a',
    usage: { prompt_tokens: 40, completion_tokens: 10 },
  });
  api.accept('api_usage', {
    reservation: 'a',
    usage: { prompt_tokens: 40, completion_tokens: 10 },
  });
  api.accept('api_request_started', { reservation: 'b' });
  assert.equal(api.snapshot(true).totalTokens, 50);
  assert.equal(api.snapshot(true).complete, false);
  api.accept('api_usage', { reservation: 'b', usage: { prompt_tokens: 20 } });
  assert.equal(api.snapshot(true).totalTokens, 70);
  assert.equal(api.snapshot(true).complete, false);
  api.accept('api_usage', {
    reservation: 'b',
    usage: { prompt_tokens: 20, completion_tokens: 10 },
  });
  assert.equal(api.snapshot(true).totalTokens, 80);
  assert.equal(api.snapshot(true).complete, true);
});

test('usage ledger keeps routing, worker and review separate and cannot hide unfinished calls', () => {
  const s = new Store(':memory:');
  try {
    for (const role of ['routing', 'worker', 'review']) {
      s.event('t', 'usage_started', { id: role, role });
      s.event('t', 'usage_report', {
        id: role,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, complete: true },
      });
    }
    s.event('t', 'usage_started', { id: 'failed-worker', role: 'worker' });
    const u = summarizeUsage(s.events('t'));
    assert.equal(u.reportedTokens, 45);
    assert.equal(u.missingReports, 1);
    assert.equal(u.complete, false);
    assert.deepEqual(u.byRole, { routing: 15, worker: 15, review: 15 });
  } finally {
    s.close();
  }
});

test('efficiency retains complete observations alongside unknown use, survives unrelated settings, and isolates changed execution', () => {
  const s = new Store(':memory:');
  try {
    s.put('model', 'a', model('a'));
    const usage = {
      reportedTokens: 100,
      inputTokens: 80,
      outputTokens: 20,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      reasoningOutputTokens: 0,
      records: 1,
      missingReports: 0,
      complete: true,
      byRole: { routing: 10, worker: 80, review: 10 },
    };
    const row = (id: string, patch: Partial<EfficiencyRun> = {}): EfficiencyRun => ({
      id,
      taskId: id,
      modelId: 'a',
      model: 'a',
      assessment,
      status: 'passed',
      usage,
      policy: EFFICIENCY_POLICY,
      at: new Date().toISOString(),
      evaluation: false,
      mode: defaults.jevMode,
      rosterKey: rosterKey(s),
      inputKey: 'fixture',
      modelKey: modelExecutionKey(model('a')),
      executionKey: executionKey(s),
      ...patch,
    });
    for (let i = 0; i < 5; i++) s.put('routing_run', String(i), row(String(i)));
    s.put('routing_run', 'failed', row('failed', { status: 'failed' }));
    s.put('routing_run', 'eval', row('eval', { evaluation: true }));
    s.put('routing_run', 'stale', row('stale', { at: '2000-01-01' }));
    s.put('routing_run', 'duplicate', row('duplicate', { taskId: '0' }));
    const measured = () => modelsWithFeedback(s)[0].efficiency![0];
    assert.equal(measured().tasks, 6);
    assert.equal(measured().tokensPerSuccess, 120);
    s.put('routing_run', 'unknown', row('unknown', { usage: { ...usage, complete: false } }));
    assert.equal(measured().tokensPerSuccess, 120);
    assert.equal(measured().incomplete, 1);
    assert.equal(measured().sampledTasks, 6);
    assert.equal(measured().incompleteReportedTokens, 100);
    assert.equal(rankingTokens(modelsWithFeedback(s)[0], assessment), undefined);
    s.remove('routing_run', 'unknown');
    s.put(
      'routing_run',
      'editing',
      row('editing', { assessment: { ...assessment, workType: 'editing' } }),
    );
    assert.equal(measured().tokensPerSuccess, 120);
    savePreferences(s, { writing: 'a' });
    s.put('model', 'unrelated-ui', model('unrelated-ui'));
    assert.equal(measured().tokensPerSuccess, 120);
    assert.equal(measured().changedRosterTasks, 6);
    assert.equal(rankingTokens(modelsWithFeedback(s)[0], assessment), 120);
    s.put('model', 'a', model('a', { model: 'a-next-version' }));
    assert.equal(modelsWithFeedback(s)[0].efficiency!.length, 0);
    s.put('model', 'a', model('a', { maxOutput: 8192 }));
    assert.equal(modelsWithFeedback(s)[0].efficiency!.length, 0);
    s.put('model', 'a', model('a'));
    assert.equal(measured().tokensPerSuccess, 120);
    s.put('settings', 'main', { ...s.settings(), maxSteps: 12 });
    assert.equal(modelsWithFeedback(s)[0].efficiency!.length, 0);
  } finally {
    s.close();
  }
});

test('legacy or neighboring quality observations do not establish success for a new work scope', () => {
  const s = new Store(':memory:');
  try {
    const outcome = {
      id: 'o',
      taskId: 't',
      modelId: 'a',
      model: 'a',
      kind: 'writing',
      difficulty: 'routine',
      status: 'passed',
      policy: REVIEW_POLICY,
      at: new Date().toISOString(),
      evaluation: false,
    } as Outcome;
    s.put('routing_outcome', 'o', outcome);
    const m = { ...model('a'), observations: outcomeSummaries(s, model('a')) };
    assert.equal(matchingOutcomes(m, assessment), undefined);
    s.put('routing_outcome', 'o', { ...outcome, workType: 'writing', briefSize: 'short' });
    m.observations = outcomeSummaries(s, model('a'));
    assert.equal(matchingOutcomes(m, assessment)?.passed, 1);
    assert.equal(matchingOutcomes(m, { ...assessment, briefSize: 'long' }), undefined);
    assert.equal(
      qualityEvidence(m, { ...assessment, workType: 'editing' })?.related[0].relevance,
      0.5,
    );
    assert.equal(
      qualityEvidence(m, { ...assessment, briefSize: 'medium' })?.related[0].relevance,
      0.5,
    );
    assert.equal(qualityEvidence(m, { ...assessment, briefSize: 'long' }), null);
    assert.equal(qualityEvidence(m, { ...assessment, difficulty: 'complex' }), null);
    assert.equal(qualityEvidence(m, { ...assessment, kind: 'research' }), null);
    assert.equal(measuredQuality({ ...m, evaluated: false }, assessment), undefined);
  } finally {
    s.close();
  }
});

test('restart preserves partial token receipts and an unknown efficiency result', () => {
  const s = new Store(':memory:');
  try {
    s.save({
      id: 'interrupted',
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
    s.event('interrupted', 'usage_started', { id: 'worker', role: 'worker' });
    s.event('interrupted', 'usage_report', {
      id: 'worker',
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, complete: false },
    });
    s.put('model', 'a', model('a'));
    s.put('routing_run', 'pending', {
      id: 'pending',
      taskId: 'interrupted',
      modelId: 'a',
      model: 'a',
      assessment,
      status: 'unverified',
      usage: summarizeUsage(s.events('interrupted')),
      policy: EFFICIENCY_POLICY,
      at: new Date().toISOString(),
      mode: defaults.jevMode,
      rosterKey: rosterKey(s),
      inputKey: 'same',
      modelKey: modelExecutionKey(model('a')),
      executionKey: executionKey(s),
    });
    assert.deepEqual(modelsWithFeedback(s)[0].efficiency, []);
    s.recover();
    assert.equal(s.task('interrupted').status, 'interrupted');
    assert.equal(s.task('interrupted').usage?.reportedTokens, 30);
    assert.equal(s.task('interrupted').usage?.complete, false);
    assert.equal(modelsWithFeedback(s)[0].efficiency![0].incomplete, 1);
    assert.equal(modelsWithFeedback(s)[0].efficiency![0].tokensPerSuccess, undefined);
  } finally {
    s.close();
  }
});

test('one completed result guides Jev immediately; related evidence never becomes hard ranking or demonstrated quality', () => {
  const s = new Store(':memory:');
  try {
    const m = model('early');
    s.put('model', m.id, m);
    s.event('t', 'usage_started', { id: 'u', role: 'worker', provider: 'codex' });
    s.event('t', 'usage_report', {
      id: 'u',
      usage: { totalTokens: 75, inputTokens: 50, outputTokens: 25, complete: true },
    });
    s.put('routing_run', 'r', {
      id: 'r',
      taskId: 't',
      modelId: m.id,
      model: m.model,
      assessment,
      usage: summarizeUsage(s.events('t')),
      status: 'passed',
      at: new Date().toISOString(),
      evaluation: false,
      policy: EFFICIENCY_POLICY,
      mode: s.settings().jevMode,
      rosterKey: rosterKey(s),
      modelKey: modelExecutionKey(m),
      executionKey: executionKey(s),
      inputKey: 'same',
    } satisfies EfficiencyRun);
    const learned = modelsWithFeedback(s)[0];
    assert.equal(efficiencyEvidence(learned, assessment)?.exact?.tokensPerSuccess, 75);
    assert.equal(efficiencyEvidence(learned, assessment)?.exact?.evidence, 'early');
    assert.equal(rankingTokens(learned, assessment), undefined);
    const related = efficiencyEvidence(learned, { ...assessment, workType: 'editing' });
    assert.equal(related?.exact, null);
    assert.equal(related?.related[0].tokensPerSuccess, 75);
    assert.equal(related?.related[0].relevance, 0.5);
    assert.equal(efficiencyEvidence(learned, { ...assessment, difficulty: 'complex' }), null);
    assert.equal(efficiencyEvidence(learned, { ...assessment, briefSize: 'long' }), null);
    assert.equal(learned.efficiency![0].knownReportedTokens, 75);
    // A newer excluded continuation must suppress the older success, not revive it.
    s.put('routing_run', 'newer', {
      ...s.get<any>('routing_run', 'r'),
      id: 'newer',
      evaluation: true,
      at: new Date(Date.now() + 1000).toISOString(),
    });
    assert.deepEqual(modelsWithFeedback(s)[0].efficiency, []);
  } finally {
    s.close();
  }
});
