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
    instructions: [{ source: 'Private guide', content: 'PRIVATE-SETUP-MARKER', sha256: 'fixture' }],
  };
  await mkdir(workspace.path);
  const store = new Store(join(root, 'state', 'db'));
  store.put('workspace', workspace.id, workspace);
  const calls: any[] = [],
    runs: string[] = [];
  let verdict = (_body: any): any => ({ brief: 'pass', support: 'pass', completion: 'pass' });
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
        : body.questions.model
          ? { model: choice(Object.keys(body.questions.model.criteria), 'candidate_0') }
          : Object.fromEntries(
              Object.entries(verdict(body)).map(([id, v]) => [
                id,
                typeof v === 'string' ? choice(['pass', 'fail', 'unknown'], v) : v,
              ]),
            );
      return Response.json({ model: 'synthetic-jev', answers, usage: { input_tokens: 10 } });
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

test('uncertain fallback prefers demonstrated capability and excludes explicitly inadequate catalog coverage', () => {
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
  const unknown = model('unknown', { evaluated: false, catalog, maxDifficulty: undefined });
  const routine = model('routine', { evaluated: false, catalog, maxDifficulty: 'routine' });
  const task = { prompt: 'Implement a distributed system', required: ['files'] as ['files'] };
  assert.equal(route(task, w, [unknown, routine, strong], defaults).modelId, 'proven');
  assert.ok(!route(task, w, [unknown, routine, strong], defaults).fallbacks.includes('routine'));
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
    store.put('model', first.id, { ...first, enabled: false, routingNotes: 'Keep this note' });
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
    const task = await f.engine.create({ prompt: 'Continue the work', workspaceId: 'w' });
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

test('failed content checks escalate capability, preserve the task, and record both model outcomes', async () => {
  const f = await fixture();
  try {
    f.add(model('first', { maxDifficulty: 'routine' }), model('second', { provider: 'claude' }));
    f.engine.workers.codex = {
      run: async (c) => {
        f.runs.push(c.model.id);
        c.emit('subscription_usage', {
          total: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
        });
        await c.tool('write_file', { path: 'result.md', content: 'TODO' });
        return 'BAD placeholder';
      },
    };
    f.engine.workers.claude = {
      run: async (c) => {
        f.runs.push(c.model.id);
        c.emit('subscription_usage', {
          modelUsage: {
            second: {
              inputTokens: 200,
              outputTokens: 100,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
        });
        assert.match(c.prompt, /Recover from/);
        assert.match(c.prompt, /Jev: brief/);
        await c.tool('write_file', {
          path: 'result.md',
          content: 'The requested complete introduction.',
        });
        return 'Created the complete introduction.';
      },
    };
    f.verdict((body) => ({
      brief: body.state.evidence.result.includes('BAD') ? 'fail' : 'pass',
      support: 'pass',
      completion: 'pass',
    }));
    const task = await f.run();
    assert.equal(task.status, 'completed');
    assert.equal(task.review?.status, 'passed');
    assert.equal(task.attempt, 1);
    assert.deepEqual(f.runs, ['first', 'second']);
    assert.equal(task.usage?.reportedTokens, 460);
    assert.equal(task.usage?.complete, true);
    assert.deepEqual(task.usage?.byRole, { routing: 40, worker: 400, review: 20 });
    const efficiency = f.store.list<any>('routing_run');
    assert.equal(efficiency.length, 1);
    assert.equal(efficiency[0].modelId, 'first');
    assert.equal(efficiency[0].recovered, true);
    assert.equal(efficiency[0].usage.reportedTokens, 460);
    assert.equal(efficiency[0].assessment.difficulty, 'routine');
    assert.equal(efficiency[0].status, 'passed');
    assert.equal(task.route?.assessment.difficulty, 'standard');
    assert.equal(
      f.store.list<Outcome>('routing_outcome').filter((o) => o.status === 'failed').length,
      1,
    );
    assert.equal(
      f.store.list<Outcome>('routing_outcome').filter((o) => o.status === 'passed').length,
      1,
    );
    assert.match(
      await readFile(join(f.workspace.path, 'result.md'), 'utf8'),
      /complete introduction/,
    );
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
                ? choice(['pass', 'fail', 'unknown'], 'fail', 0.2)
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

test('exhausted Jev budget uses capability fallback and leaves review incomplete without paid calls', async () => {
  const f = await fixture();
  try {
    f.store.put('settings', 'main', { ...defaults, dailyLimit: 0 });
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
      return { code: 1, stdout: 'Incorrect result', stderr: '' };
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
          return 'The value is 42. [Report](https://example.org/report)';
        },
      };
      const task = await f.run({ prompt: 'Research and cite the value', required: ['web'] });
      assert.equal(task.review?.status, retrieved ? 'passed' : 'failed');
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
    assert.equal(task.review?.status, 'passed', task.review?.summary ?? 'Review was absent');
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
      catalog: { description: 'Provider profile', preferred: false, discoveredAt: '' },
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
    f.store.put('settings', 'main', { ...f.store.settings(), workPreferences: { ui: 'z-ui' } });
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
