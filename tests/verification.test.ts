import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { Engine } from '../server/engine.js';
import { Jev } from '../server/adapters/jev.js';
import { ToolService } from '../server/tools.js';
import { Approvals } from '../server/approval.js';
import { route, shortlistModels } from '../server/router.js';
import {
  recordCatalog,
  preserveModelOverrides,
  modelsWithFeedback,
} from '../server/model-profiles.js';
import { inspectFile, routingContext } from '../server/task-evidence.js';
import { outcomeSummaries, interval, REVIEW_POLICY } from '../server/outcomes.js';
import { citedURLs } from '../server/verification.js';
import type { ProcessStatus } from '../server/process.js';
import {
  defaults,
  ModelInput,
  type Model,
  type TaskKind,
  type Workspace,
  type Worker,
  type Outcome,
} from '../server/types.js';

const model = (id: string, patch: Partial<Model> = {}) =>
  ModelInput.parse({
    id,
    model: id,
    label: id,
    provider: 'codex',
    enabled: true,
    evaluated: true,
    evidence: 'Synthetic test evidence',
    capabilities: ['files', 'shell', 'web', 'artifacts'],
    maxDifficulty: 'complex',
    quality: { coding: 0.9, research: 0.9, writing: 0.9, documents: 0.9 },
    ...patch,
  });
const choice = (keys: string[], selected: string, confidence = 1) => ({
  type: 'choice',
  choice: selected,
  confidence,
  probabilities: Object.fromEntries(keys.map((k) => [k, +(k === selected)])),
});

async function fixture(kind: TaskKind = 'writing') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'duke-review-')));
  const workspace: Workspace = {
    id: 'w',
    name: 'Synthetic',
    path: join(root, 'work'),
    providers: ['codex', 'claude', 'openrouter'],
    instructions: [
      {
        source: 'Private guide',
        content: 'PRIVATE-SETUP-MARKER',
        sha256: 'fixture',
      },
    ],
  };
  await mkdir(workspace.path);
  const store = new Store(join(root, 'state', 'db'));
  store.put('workspace', workspace.id, workspace);
  const calls: any[] = [],
    runs: string[] = [];
  let verdict = (_body: any): any => ({
    brief: 'pass',
    support: 'pass',
    completion: 'pass',
  });
  const jev = new Jev(
    store,
    { get: async () => 'synthetic-only' } as any,
    async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      calls.push(body);
      const answers = body.questions.difficulty
        ? {
            kind: choice(['coding', 'research', 'writing', 'documents'], kind),
            difficulty: {
              type: 'score',
              score: 0,
              confidence: 1,
              probabilities: { '0': 1, '1': 0, '2': 0 },
            },
          }
        : body.questions.recovery
          ? {
              recovery: choice(Object.keys(body.questions.recovery.criteria), 'reasoning'),
            }
          : body.questions.model
            ? {
                model: choice(Object.keys(body.questions.model.criteria), 'candidate_0'),
              }
            : Object.fromEntries(
                Object.entries({
                  ...Object.fromEntries(
                    Object.keys(body.questions)
                      .filter((id) => /^(claim|requirement)_/.test(id))
                      .map((id) => [id, 'pass']),
                  ),
                  ...verdict(body),
                }).map(([id, v]) => [
                  id,
                  typeof v === 'string'
                    ? choice(
                        Object.keys(
                          body.questions[id]?.criteria ?? { pass: '', fail: '', unknown: '' },
                        ),
                        id.startsWith('claim_')
                          ? v === 'pass'
                            ? 'supported'
                            : v === 'fail'
                              ? 'contradicted'
                              : v
                          : v,
                      )
                    : v,
                ]),
              );
      return Response.json({
        model: 'synthetic-jev',
        answers,
        usage: { input_tokens: 10 },
      });
    },
  );
  const worker: Worker = {
    run: async (c) => {
      runs.push(c.model.id);
      const pending = store
        .list<any>('routing_run')
        .find((r) => r.taskId === c.task.id && r.status === 'unverified');
      assert.equal(pending.status, 'unverified');
      assert.equal(pending.usage.complete, false);
      c.emit('subscription_usage', {
        total: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
      });
      await c.tool('write_file', {
        path: 'result.md',
        content: 'A complete invented project introduction.',
      });
      return 'Saved the requested introduction to result.md.';
    },
  };
  const tools = new ToolService(store, new Approvals(store), join(root, 'state'));
  const engine = new Engine(
    store,
    tools,
    { codex: worker, claude: worker, openrouter: worker },
    jev,
  );
  engine.stopped = true;
  return {
    root,
    store,
    workspace,
    engine,
    jev,
    tools,
    calls,
    runs,
    verdict: (fn: typeof verdict) => {
      verdict = fn;
    },
    add: (...models: Model[]) => models.forEach((m) => store.put('model', m.id, m)),
    run: async (patch: Record<string, unknown> = {}) => {
      const task = await engine.create({
        prompt: 'Write a project introduction',
        workspaceId: 'w',
        required: ['files'],
        ...patch,
      });
      await engine.execute(task.id);
      return store.task(task.id);
    },
    close: async () => {
      await engine.shutdown();
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('Jev gives content review a longer deadline than routing and preserves the whole-task receipt', async (t) => {
  const deadlines: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    deadlines.push(ms);
    return new AbortController().signal;
  });
  const f = await fixture();
  try {
    f.add(model('worker'));
    const task = await f.run();
    assert.equal(task.review?.status, 'passed');
    assert.ok(deadlines.filter((ms) => ms === 5000).length >= 2);
    assert.equal(deadlines.filter((ms) => ms === 30000).length, 1);
    assert.equal(f.store.list<any>('routing_run')[0].recovered, false);
    const summary = modelsWithFeedback(f.store)[0].efficiency![0];
    assert.equal(summary.recoveredSuccessful, 0);
    assert.equal(summary.recoveryUnknown, 0);
  } finally {
    await f.close();
  }
});

test('manual model overrides bypass Jev routing but receive the same assist-mode content review', async () => {
  const f = await fixture();
  try {
    f.add(model('worker'));
    const task = await f.run({ modelOverride: 'worker' });
    assert.equal(task.status, 'completed');
    assert.equal(task.route?.selectionSource, 'manual');
    assert.equal(task.review?.status, 'passed');
    assert.equal(f.calls.length, 1);
    assert.ok(f.store.events(task.id).some((event) => event.kind === 'jev_review'));
  } finally {
    await f.close();
  }
});

test('configured fallback permits an economical attempt without treating it as proven complex capability', () => {
  const w: Workspace = {
    id: 'w',
    name: 'w',
    path: '/tmp',
    providers: ['codex', 'openrouter'],
    instructions: [],
  };
  const strong = model('proven', {
    provider: 'openrouter',
    quality: { coding: 0.99, research: 0.99, writing: 0.99 },
  });
  const catalog = {
    description: 'Unmeasured profile',
    preferred: true,
    discoveredAt: new Date().toISOString(),
  };
  const unknown = model('unknown', {
    evaluated: false,
    catalog,
    maxDifficulty: undefined,
  });
  const routine = model('routine', {
    evaluated: false,
    catalog,
    maxDifficulty: 'routine',
  });
  const task = {
    prompt: 'Implement a distributed system',
    required: ['files'] as ['files'],
  };
  const settings = { ...defaults, jevFallbackModel: 'routine' };
  assert.equal(route(task, w, [unknown, routine, strong], settings).modelId, 'routine');
  assert.equal(
    route(task, w, [unknown, routine, strong], settings).assessment.difficulty,
    'complex',
  );
  assert.throws(
    () => route(task, w, [unknown, strong], settings),
    /configured fallback cannot run/,
  );
});

test('catalog refresh replaces stale prices and context while preserving explicit overrides and enablement', () => {
  const store = new Store(':memory:');
  const raw = (price: string, context: number) => ({
    id: 'fixture',
    supported_parameters: ['tools'],
    context_length: context,
    pricing: { prompt: price, completion: price, request: '0' },
  });
  try {
    const first = recordCatalog(store, 'openrouter', [raw('.000001', 32000)])[0];
    store.put('model', first.id, {
      ...first,
      enabled: false,
      routingNotes: 'Keep this note',
    });
    const fresh = recordCatalog(store, 'openrouter', [raw('.000010', 128000)])[0];
    assert.equal(fresh.inputPrice, 10);
    assert.equal(fresh.contextLimit, 128000);
    assert.equal(fresh.enabled, false);
    assert.equal(fresh.routingNotes, 'Keep this note');
    store.put('model', first.id, preserveModelOverrides({ ...fresh, inputPrice: 3 }, fresh));
    const pinned = recordCatalog(store, 'openrouter', [raw('.000020', 256000)])[0];
    assert.equal(pinned.inputPrice, 3);
    assert.equal(pinned.outputPrice, 20);
    assert.equal(pinned.contextLimit, 256000);
    assert.equal(recordCatalog(store, 'openrouter', [raw('0', 64000)])[0].outputPrice, 0);
  } finally {
    store.close();
  }
});

test('selection payload stays bounded to a small roster', () => {
  const candidates = Array.from({ length: 500 }, (_, i) =>
    model(String(i), {
      evaluated: false,
      inputPrice: i,
      catalog: { description: 'Fixture', preferred: false, discoveredAt: '' },
    }),
  );
  candidates[300].evaluated = true;
  candidates[400].catalog!.preferred = true;
  const result = shortlistModels(candidates, {
    kind: 'writing',
    difficulty: 'routine',
    source: 'rules',
  });
  assert.equal(result.length, 32);
  assert.deepEqual(result, candidates.slice(0, 32));
});

test('small attachments are assessed on their contents and private setup stays out of Jev inputs', async () => {
  const f = await fixture();
  try {
    f.add(model('worker'));
    await writeFile(join(f.workspace.path, 'note.txt'), 'A short invented note to edit.');
    const task = await f.run({ attachments: ['note.txt'] });
    assert.equal(task.route?.assessment.difficulty, 'routine');
    assert.equal(f.calls[0].state.context.attachments[0].excerpt, 'A short invented note to edit.');
    assert.equal(f.calls[0].state.contextIncomplete, false);
    assert.doesNotMatch(JSON.stringify(f.calls), /PRIVATE-SETUP-MARKER/);
    assert.equal(task.review?.status, 'passed');
    assert.equal(f.calls.length, 3);
    const saved = outcomeSummaries(f.store, model('worker'), 'writing')[0];
    assert.equal(saved.passed, 1);
    assert.equal(saved.failed, 0);
    assert.equal(f.store.get<Model>('model', 'worker')!.evaluated, true);
    assert.ok(saved.lowerBound < 0.8);
  } finally {
    await f.close();
  }
});

test('bounded context includes progress, marks truncation, and never reads imported instructions', async () => {
  const f = await fixture();
  try {
    const task = await f.engine.create({
      prompt: 'Continue the work',
      workspaceId: 'w',
    });
    const context = await routingContext(
      {
        ...task,
        checkpoint: {
          summary: 'Code is done',
          remaining: 'Research the citations',
          artifacts: [],
          at: '',
        },
      },
      f.workspace,
      [{ path: 'long.txt', content: 'x'.repeat(12000) }],
    );
    assert.equal(context.attachments[0].excerpt.length, 2000);
    assert.equal(context.incomplete, true);
    assert.match(context.progress!.remaining, /citations/);
    assert.doesNotMatch(JSON.stringify(context), /PRIVATE-SETUP/);
  } finally {
    await f.close();
  }
});

test('a focused defect missed by broad checks retries the same model and retains all usage', async () => {
  const f = await fixture();
  try {
    f.add(
      model('first', { supportedEfforts: ['low', 'medium', 'high'] }),
      model('premium', { provider: 'claude' }),
    );
    const efforts: string[] = [];
    f.engine.workers.codex = {
      run: async (c) => {
        f.runs.push(c.model.id);
        efforts.push(c.model.effort!);
        c.emit('subscription_usage', {
          total: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
        });
        if (c.model.effort === 'medium') {
          assert.match(c.prompt, /Recover from/);
          assert.match(c.prompt, /Jev: claim_0/);
        }
        await c.tool('write_file', {
          path: 'result.md',
          content: c.model.effort === 'low' ? 'TODO' : 'A complete introduction.',
        });
        return c.model.effort === 'low' ? 'BAD placeholder' : 'Created the complete introduction.';
      },
    };
    f.engine.workers.claude = {
      run: async () => {
        throw new Error('Premium model must not run');
      },
    };
    f.verdict((body) => ({
      brief: 'pass',
      claim_0: body.state.evidence.result.includes('BAD') ? 'fail' : 'pass',
      support: 'pass',
      completion: 'pass',
    }));
    const task = await f.run();
    assert.equal(task.status, 'completed');
    assert.equal(task.review?.status, 'passed');
    assert.equal(task.attempt, 1);
    assert.deepEqual(f.runs, ['first', 'first']);
    assert.deepEqual(efforts, ['low', 'medium']);
    assert.equal(task.usage?.reportedTokens, 250);
    assert.equal(task.usage?.complete, true);
    assert.deepEqual(task.usage?.byRole, {
      routing: 20,
      worker: 200,
      review: 30,
    });
    const runs = f.store.list<any>('routing_run');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].recovered, true);
    assert.equal(runs[0].status, 'passed');
    assert.equal(task.route?.assessment.difficulty, 'routine');
    assert.deepEqual(
      f.store
        .list<Outcome>('routing_outcome')
        .map((o) => [o.effort, o.status])
        .sort(),
      [
        ['low', 'failed'],
        ['medium', 'passed'],
      ],
    );
    assert.equal(f.calls.filter((c) => c.questions.recovery).length, 1);
  } finally {
    await f.close();
  }
});

test('failed checks without a suitable alternative retain the deliverable and cannot report completion', async () => {
  const f = await fixture();
  try {
    f.add(model('only'));
    f.verdict(() => ({ brief: 'fail', support: 'pass', completion: 'pass' }));
    const task = await f.run();
    assert.equal(task.status, 'blocked');
    assert.equal(task.review?.status, 'failed');
    assert.ok(task.result);
    assert.equal(f.runs.length, 1);
    assert.ok(!f.store.events(task.id).some((e) => e.kind === 'completed'));
  } finally {
    await f.close();
  }
});

test('review gates use verdict probability and retain the full distribution separately from confidence', async (t) => {
  for (const [label, probabilities, confidence, expected] of [
    ['observed coding distribution', { pass: 0.8, fail: 0.18, unknown: 0.02 }, 0.7, 'passed'],
    ['observed document distribution', { pass: 0.83, fail: 0.13, unknown: 0.04 }, 0.75, 'passed'],
    ['below pass threshold', { pass: 0.799, fail: 0.15, unknown: 0.051 }, 0.95, 'unverified'],
    ['at fail threshold', { fail: 0.8, pass: 0.18, unknown: 0.02 }, 0.7, 'failed'],
    ['below fail threshold', { fail: 0.799, pass: 0.15, unknown: 0.051 }, 0.95, 'unverified'],
    ['certain unknown', { unknown: 1, pass: 0, fail: 0 }, 1, 'unverified'],
  ] as const) {
    await t.test(label, async () => {
      const f = await fixture();
      try {
        f.add(model('worker'));
        const selected = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
        f.verdict(() => ({
          brief: {
            type: 'choice',
            choice: selected,
            probabilities,
            confidence,
          },
          support: 'pass',
          completion: 'pass',
        }));
        const task = await f.run();
        assert.equal(task.review?.status, expected);
        const check = task.review!.checks.find((c) => c.name === 'Jev: brief')!;
        assert.equal(check.judgment?.model, 'synthetic-jev');
        assert.deepEqual(check.judgment?.probabilities, probabilities);
        assert.equal(check.judgment?.confidence, confidence);
        assert.equal(
          check.judgment?.probability,
          probabilities[selected as keyof typeof probabilities],
        );
        assert.equal(check.judgment?.threshold, 0.8);
        const event = f.store.events(task.id).find((e) => e.kind === 'jev_review')!;
        assert.equal(event.data.policy, REVIEW_POLICY);
        assert.deepEqual(event.data.judgments['Jev: brief'], check.judgment);
        assert.ok(!JSON.stringify(event.data).includes('PRIVATE-SETUP-MARKER'));
      } finally {
        await f.close();
      }
    });
  }
});

test('uncertain, malformed and unavailable reviews are neutral, not successes or quality failures', async () => {
  for (const mode of ['unknown', 'uncertain', 'malformed', 'unavailable'] as const) {
    const f = await fixture();
    try {
      f.add(model('worker'));
      f.verdict(() => {
        if (mode === 'unavailable') throw new Error('Synthetic review outage');
        return {
          brief:
            mode === 'malformed'
              ? { choice: 'pass' }
              : mode === 'uncertain'
                ? {
                    type: 'choice',
                    choice: 'fail',
                    confidence: 0.2,
                    probabilities: { fail: 0.4, pass: 0.35, unknown: 0.25 },
                  }
                : 'unknown',
          support: 'pass',
          completion: 'pass',
        };
      });
      const task = await f.run();
      assert.equal(task.status, 'completed', mode);
      assert.equal(task.review?.status, 'unverified', mode);
      assert.equal(f.runs.length, 1);
      const o = outcomeSummaries(f.store, model('worker'))[0];
      assert.equal(o.passed, 0);
      assert.equal(o.failed, 0);
      assert.equal(o.unverified, 1);
    } finally {
      await f.close();
    }
  }
});

test('review cancellation stops completion and never records a learned outcome', async () => {
  const f = await fixture();
  try {
    f.add(model('worker'));
    f.verdict(() => {
      f.engine.active.values().next().value!.abort();
      throw new Error('Cancelled review');
    });
    const task = await f.run();
    assert.equal(task.status, 'cancelled');
    assert.equal(f.store.list('routing_outcome').length, 0);
    assert.equal(f.store.spend().unreconciled, 1);
  } finally {
    await f.close();
  }
});

test('exhausted Jev budget uses the configured fallback and leaves review incomplete without paid calls', async () => {
  const f = await fixture();
  try {
    f.store.put('settings', 'main', {
      ...defaults,
      dailyLimit: 0,
      jevFallbackModel: 'worker',
    });
    f.add(model('worker'));
    const task = await f.run();
    assert.equal(task.status, 'completed');
    assert.equal(task.review?.status, 'unverified');
    assert.equal(task.route?.assessment.difficulty, 'complex');
    assert.equal(f.calls.length, 0);
    assert.equal(f.store.spending().length, 0);
  } finally {
    await f.close();
  }
});

test('coding without tests cannot become positive quality evidence even if Jev approves the prose', async () => {
  const f = await fixture('coding');
  try {
    f.add(model('worker'));
    const task = await f.run({ prompt: 'Fix the code' });
    assert.equal(task.review?.status, 'unverified');
    assert.ok(task.review?.checks.some((c) => c.name === 'Tests' && c.status === 'unverified'));
  } finally {
    await f.close();
  }
});

test('a bounded task input read by the worker supplies factual evidence to the review', async () => {
  const f = await fixture();
  try {
    f.add(model('worker'));
    await writeFile(join(f.workspace.path, 'brief.md'), 'The invented budget is 900 dollars.');
    f.engine.workers.codex = {
      run: async (c) => {
        await c.tool('read_file', { path: 'brief.md' });
        return 'The budget is 900 dollars.';
      },
    };
    const task = await f.run();
    assert.equal(task.review?.status, 'passed');
    assert.match(f.calls.at(-1).state.evidence.inputs[0].text, /900/);
  } finally {
    await f.close();
  }
});

test('files changed during remote review are neutral evidence even when the judge claims a pass', async () => {
  const f = await fixture();
  try {
    f.add(model('worker'));
    const transport = f.jev.transport;
    f.jev.transport = async (...args) => {
      const body = JSON.parse(String(args[1]?.body));
      if (body.questions.brief)
        await writeFile(join(f.workspace.path, 'result.md'), 'An outside edit during review.');
      return transport(...args);
    };
    const task = await f.run();
    assert.equal(task.review?.status, 'unverified');
    assert.ok(task.review?.checks.some((c) => c.detail.includes('changed while')));
    assert.equal(outcomeSummaries(f.store, model('worker'))[0].passed, 0);
  } finally {
    await f.close();
  }
});

test('stale account status is refreshed before dispatch; a failed refresh preserves a known block', async () => {
  for (const recovered of [true, false]) {
    const f = await fixture();
    try {
      f.add(model('worker'));
      f.store.put('health', 'codex', {
        ready: false,
        checkedAt: new Date(Date.now() - 120000).toISOString(),
      });
      let refreshes = 0;
      f.engine.workers.codex.health = async () => {
        refreshes++;
        if (!recovered) throw new Error('Offline');
        return { provider: 'codex', ready: true, message: 'Fixture' };
      };
      const task = await f.run();
      assert.equal(refreshes, 1);
      assert.equal(task.status, recovered ? 'completed' : 'blocked');
      assert.equal(f.runs.length, recovered ? 1 : 0);
    } finally {
      await f.close();
    }
  }
});

test('benchmark tasks do not train ordinary routing history or feedback preferences', async () => {
  const f = await fixture();
  try {
    f.add(model('worker'));
    const task = await f.run({ evaluation: true });
    assert.equal(task.review?.status, 'passed');
    assert.equal(f.store.list('routing_outcome').length, 1);
    f.store.put('feedback', task.id, {
      taskId: task.id,
      modelId: 'worker',
      kind: 'writing',
      rating: 'worked',
    });
    assert.equal(outcomeSummaries(f.store, model('worker')).length, 0);
    assert.equal(modelsWithFeedback(f.store, 'writing')[0].feedback?.worked, 0);
  } finally {
    await f.close();
  }
});

test('an independently rerun task check can fail and trigger recovery before semantic review', async () => {
  const f = await fixture('coding');
  try {
    f.add(model('worker'));
    let runs = 0;
    f.tools.shell = async () => {
      runs++;
      return {
        status: 'exited',
        code: 1,
        stdout: 'Incorrect result',
        stderr: '',
      };
    };
    const task = await f.run({
      prompt: 'Fix the code',
      required: ['files', 'shell'],
      verification: { files: ['result.md'], command: 'node verify.mjs' },
    });
    assert.equal(task.status, 'blocked');
    assert.equal(task.review?.status, 'failed');
    assert.equal(runs, 1);
    assert.equal(f.calls.filter((c) => c.questions.brief).length, 0);
  } finally {
    await f.close();
  }
});

test('research citations exclude code examples but retain linked and bare prose URLs', () => {
  assert.deepEqual(
    citedURLs(
      [
        '[Report](https://example.org/report#section)',
        'See https://example.org/other.',
        '`fetch("https://example.com/inline")`',
        '```js\nfetch("https://example.com/fenced")\n```',
        '\n    fetch("https://example.com/indented")\n',
      ].join('\n'),
    ),
    ['https://example.org/report', 'https://example.org/other'],
  );
});

test('runner limits and unavailable execution remain neutral and do not trigger recovery', async () => {
  for (const status of [
    'timed_out',
    'output_limit',
    'unavailable',
    'interrupted',
  ] as ProcessStatus[]) {
    const f = await fixture('coding');
    try {
      f.add(model('worker'));
      f.tools.shell = async () => ({
        status,
        code: null,
        stdout: '',
        stderr: 'Synthetic infrastructure limit',
      });
      const task = await f.run({
        prompt: 'Fix the code',
        required: ['files', 'shell'],
        verification: { files: ['result.md'], command: 'node verify.mjs' },
      });
      assert.equal(task.status, 'completed', status);
      assert.equal(task.review?.status, 'unverified', status);
      assert.equal(task.review?.checks.find((c) => c.name === 'Tests')?.status, 'unverified');
      assert.equal(task.attempt, 0);
      assert.equal(task.checkpoint?.repairDifficulty, undefined);
      assert.deepEqual(f.runs, ['worker']);
      assert.equal(f.store.list<Outcome>('routing_outcome')[0].status, 'unverified');
      assert.ok(!f.store.events(task.id).some((e) => e.kind === 'quality_retry'));
    } finally {
      await f.close();
    }
  }
});

test('real sandbox output cap survives its JSON envelope without becoming a failed test', async () => {
  const f = await fixture('coding');
  try {
    f.add(model('worker'));
    await writeFile(
      join(f.workspace.path, 'verify.mjs'),
      'process.stdout.write("\\u0001".repeat(300000));',
    );
    const result = await f.tools.shell(
      f.workspace,
      'node verify.mjs',
      false,
      new AbortController().signal,
    );
    assert.equal(result.status, 'output_limit', result.stderr);
    assert.equal(result.stdout.length, 250000);
    assert.equal(result.code, null);
    const exited = await f.tools.shell(
      f.workspace,
      'exit 126',
      false,
      new AbortController().signal,
    );
    assert.equal(exited.status, 'exited', exited.stderr);
    assert.equal(exited.code, 126);
  } finally {
    await f.close();
  }
});

test('rounded review probabilities are retained without moving the acceptance threshold', async () => {
  for (const [probabilities, expected] of [
    [{ pass: 0.8, fail: 0.1, unknown: 0.09 }, 'passed'],
    [{ pass: 0.8, fail: 0.11, unknown: 0.1 }, 'passed'],
    [{ pass: 0.79, fail: 0.1, unknown: 0.1 }, 'unverified'],
    [{ pass: 0.33, fail: 0.33, unknown: 0.33 }, 'unverified'],
    [{ pass: 0.4, fail: 0.1, unknown: 0.1 }, 'unverified'],
  ] as const) {
    const f = await fixture();
    try {
      f.add(model('worker'));
      f.verdict(() =>
        Object.fromEntries(
          ['brief', 'support', 'completion'].map((id) => [
            id,
            { type: 'choice', choice: 'pass', confidence: 1, probabilities },
          ]),
        ),
      );
      const task = await f.run();
      assert.equal(task.review?.status, expected, JSON.stringify(probabilities));
    } finally {
      await f.close();
    }
  }
});

test('research requires retrieved citation receipts and gives source excerpts to the reviewer', async () => {
  for (const retrieved of [true, false]) {
    const f = await fixture('research');
    try {
      f.add(model('worker'));
      f.engine.workers.codex = {
        run: async (c) => {
          if (retrieved)
            c.emit('tool_completed', {
              name: 'web_read',
              result: {
                url: 'https://example.org/report',
                text: 'An invented report says the value is 42.',
              },
            });
          await c.tool('write_file', {
            path: 'example.js',
            content: 'fetch("https://example.com/code");',
          });
          return 'The value is 42. [Report](https://example.org/report)\n\n```js\nfetch("https://example.com/sample")\n```';
        },
      };
      const task = await f.run({
        prompt: 'Research and cite the value',
        required: ['web', 'files'],
      });
      // The source citation can pass independently of the untested executable example.
      assert.equal(
        task.review?.checks.find((c) => c.name === 'Citations')?.status,
        retrieved ? 'passed' : 'failed',
      );
      assert.equal(task.review?.status, retrieved ? 'unverified' : 'failed');
      if (retrieved) assert.match(f.calls.at(-1).state.evidence.sources[0].text, /42/);
      else assert.match(task.review!.summary, /not read/);
    } finally {
      await f.close();
    }
  }
});

test('documents are inspected as real Office/PDF files and corruption cannot pass on filename alone', async () => {
  const f = await fixture('documents');
  try {
    f.add(model('worker'));
    f.engine.workers.codex = {
      run: async (c) => {
        await c.tool('create_artifact', {
          path: 'brief.docx',
          format: 'docx',
          content: 'Decision\nApprove the invented plan.',
        });
        await c.tool('create_artifact', {
          path: 'budget.xlsx',
          format: 'xlsx',
          rows: [
            ['Item', 'Cost'],
            ['Example', 42],
          ],
          content: '',
        });
        await c.tool('create_artifact', {
          path: 'brief.pdf',
          format: 'pdf',
          content: 'Decision\nApprove the invented plan.',
        });
        return 'Created the requested files.';
      },
    };
    const task = await f.run({
      prompt: 'Create a Word document, spreadsheet and PDF',
      required: ['artifacts'],
    });
    assert.equal(
      task.review?.status,
      'passed',
      task.error ?? task.review?.summary ?? 'Review was absent',
    );
    const files = f.calls.at(-1).state.evidence.files;
    assert.match(files.find((x: any) => x.path === 'brief.docx').text, /Approve the invented plan/);
    assert.match(files.find((x: any) => x.path === 'budget.xlsx').text, /42/);
    assert.ok(task.review?.limitations.some((s) => /rendered layout/.test(s)));
    await writeFile(join(f.workspace.path, 'broken.docx'), 'Not an Office document');
    await assert.rejects(inspectFile(f.workspace, 'broken.docx'), /ZIP/);
    await symlink('/etc/passwd', join(f.workspace.path, 'escape.txt'));
    await assert.rejects(inspectFile(f.workspace, 'escape.txt'), /Symlink/);
  } finally {
    await f.close();
  }
});

test('observed outcomes are task-deduplicated, family/difficulty scoped, versioned, and conservative', async () => {
  const f = await fixture();
  try {
    const worker = model('worker', {
      evaluated: false,
      catalog: {
        description: 'Provider profile',
        preferred: false,
        discoveredAt: '',
      },
    });
    f.add(worker);
    const row = (id: string, taskId: string, patch: Partial<Outcome> = {}): Outcome => ({
      id,
      taskId,
      modelId: worker.id,
      model: worker.model,
      kind: 'writing',
      difficulty: 'routine',
      status: 'passed',
      at: new Date().toISOString(),
      policy: REVIEW_POLICY,
      latencyMs: 10,
      review: {
        status: 'passed',
        checks: [],
        summary: 'Synthetic',
        limitations: [],
        at: '',
        policy: REVIEW_POLICY,
      },
      ...patch,
    });
    for (let i = 0; i < 40; i++)
      f.store.put('routing_outcome', String(i), row(String(i), 'same-task'));
    assert.equal(outcomeSummaries(f.store, worker)[0].passed, 1);
    f.store.put('routing_outcome', 'ignored', row('ignored', 'other', { policy: 'old-policy' }));
    f.store.put('routing_outcome', 'stale', row('stale', 'old', { at: '2000-01-01T00:00:00Z' }));
    f.store.put(
      'routing_outcome',
      'coding',
      row('coding', 'code', { kind: 'coding', difficulty: 'complex' }),
    );
    assert.equal(outcomeSummaries(f.store, worker, 'writing')[0].passed, 1);
    assert.equal(outcomeSummaries(f.store, worker, 'coding')[0].difficulty, 'complex');
    assert.ok(interval(5, 0).lowerBound < 0.8);
    assert.ok(interval(20, 0).lowerBound > 0.8);
    assert.equal(modelsWithFeedback(f.store, 'writing')[0].quality.writing, 0.9);
    assert.equal(modelsWithFeedback(f.store, 'writing')[0].evaluated, false);
    assert.equal(outcomeSummaries(f.store, { ...worker, model: 'a-new-model' }).length, 0);
  } finally {
    await f.close();
  }
});

test('same-task continuation retains all token use and original routing attribution; changed briefs leave comparison history', async () => {
  const f = await fixture();
  try {
    f.add(model('worker'));
    const first = await f.run();
    assert.equal(first.usage?.reportedTokens, 130);
    assert.deepEqual(first.usage?.byProvider, { codex: 100, jev: 30 });
    assert.equal(first.subscriptionUsage?.unobservedAttempts, 1);
    // Adding another model and a starting preference must not erase this task's costs.
    f.add(model('z-ui'));
    f.store.put('settings', 'main', {
      ...f.store.settings(),
      workPreferences: { ui: 'z-ui' },
    });
    f.engine.resume(first.id);
    await f.engine.execute(first.id);
    const resumed = f.store.task(first.id);
    assert.equal(resumed.usage?.reportedTokens, 260);
    const history = modelsWithFeedback(f.store)[0].efficiency![0];
    assert.equal(history.tasks, 1);
    assert.equal(history.successful, 1);
    assert.equal(history.tokensPerSuccess, 260);
    assert.equal(history.changedRosterTasks, 1);
    assert.equal(f.store.task(first.id).subscriptionUsage?.unobservedAttempts, 2);
    assert.equal(f.store.list<any>('routing_run').at(-1).modelId, 'worker');
    f.engine.resume(first.id, false, 'Now write a different follow-up introduction.');
    await f.engine.execute(first.id);
    assert.equal(f.store.task(first.id).usage?.reportedTokens, 390);
    assert.deepEqual(modelsWithFeedback(f.store)[0].efficiency, []);
  } finally {
    await f.close();
  }
});

test('engine persists per-attempt subscription windows and supplies early related evidence to Jev', async () => {
  const f = await fixture();
  try {
    f.add(model('worker'));
    const original = f.engine.workers.codex.run;
    f.engine.workers.codex.run = async (c) => {
      const snapshot = (percent: number) => ({
        rateLimits: {
          limitId: 'core',
          primary: {
            usedPercent: percent,
            windowDurationMins: 300,
            resetsAt: Date.parse('2026-09-20T00:00:00Z') / 1000,
          },
        },
      });
      c.emit('allowance_snapshot', {
        phase: 'before',
        at: '2026-09-19T10:00:00Z',
        quota: snapshot(10),
      });
      const result = await original(c);
      c.emit('allowance_snapshot', {
        phase: 'after',
        at: '2026-09-19T10:01:00Z',
        quota: snapshot(11),
      });
      return result;
    };
    const first = await f.run();
    assert.equal(first.subscriptionUsage?.unobservedAttempts, 0);
    assert.equal(first.subscriptionUsage?.attempts[0].windows[0].changePercentagePoints, 1);
    await f.run({ prompt: 'Rewrite the project introduction' });
    const selection = f.calls.filter((c) => c.questions.model).at(-1).questions.model;
    const candidate = selection.criteria.candidate_0;
    assert.equal(candidate.observedEfficiency.exact, null);
    assert.equal(candidate.observedEfficiency.related[0].tokensPerSuccess, 130);
    assert.equal(candidate.observedEfficiency.related[0].evidence, 'early');
    assert.equal(candidate.automaticChecks.related[0].passed, 1);
    assert.match(selection.instructions, /subscriptions and paid APIs alike/);
    assert.match(selection.instructions, /Routing and review remain active/);
  } finally {
    await f.close();
  }
});

test('context gaps and tool failures pause without spending another worker attempt or teaching a quality failure', async () => {
  for (const cause of ['missing_context', 'tool_failure'] as const) {
    const f = await fixture();
    try {
      f.add(model('worker', { supportedEfforts: ['low', 'medium'] }));
      f.verdict(() => ({ brief: 'fail', support: 'pass', completion: 'pass' }));
      f.jev.recovery = async () => ({ cause, probability: 1 });
      const task = await f.run();
      assert.equal(task.status, 'blocked');
      assert.equal(f.runs.length, 1);
      assert.equal(task.review?.status, 'unverified');
      assert.equal(f.store.list<Outcome>('routing_outcome')[0].status, 'unverified');
      assert.equal(f.store.list<any>('routing_run')[0].status, 'unverified');
      assert.ok(task.result);
    } finally {
      await f.close();
    }
  }
});

test('quality recovery respects fixed effort, disabled retries, medium ceiling and changed model permissions', async () => {
  for (const scenario of ['fixed', 'disabled', 'ceiling', 'availability'] as const) {
    const f = await fixture();
    try {
      f.add(model('worker', { supportedEfforts: ['low', 'medium', 'high'] }));
      f.verdict(() => ({ brief: 'fail', support: 'pass', completion: 'pass' }));
      if (scenario === 'disabled') f.store.put('settings', 'main', { ...defaults, maxRecovery: 0 });
      f.jev.recovery = async () => {
        if (scenario === 'availability')
          f.store.put('model', 'worker', {
            ...f.store.get<Model>('model', 'worker'),
            enabled: false,
          });
        return { cause: 'reasoning', probability: 1 };
      };
      const task = await f.run(
        scenario === 'fixed' ? { modelOverride: 'worker', effortOverride: 'low' } : {},
      );
      assert.equal(task.status, 'blocked');
      assert.equal(f.runs.length, scenario === 'ceiling' ? 2 : 1);
      assert.ok(
        !f.store.events(task.id).some((e) => e.kind === 'route' && e.data.effort === 'high'),
      );
    } finally {
      await f.close();
    }
  }
});

test('cancellation while diagnosing recovery rejects a late judgment and cannot start another worker', async () => {
  const f = await fixture();
  try {
    f.add(model('worker', { supportedEfforts: ['low', 'medium'] }));
    f.verdict(() => ({ brief: 'fail', support: 'pass', completion: 'pass' }));
    f.jev.recovery = async (task) => {
      f.engine.cancel(task.id);
      return { cause: 'reasoning', probability: 1 };
    };
    const task = await f.run();
    assert.equal(task.status, 'cancelled');
    assert.equal(f.runs.length, 1);
    assert.ok(!f.store.events(task.id).some((e) => e.kind === 'quality_retry'));
  } finally {
    await f.close();
  }
});
