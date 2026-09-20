import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { Engine } from '../server/engine.js';
import { Jev } from '../server/adapters/jev.js';
import { ToolService } from '../server/tools.js';
import { Approvals } from '../server/approval.js';
import {
  ModelInput,
  type TaskKind,
  type Worker,
  type WorkerContext,
  type Workspace,
} from '../server/types.js';
import { outcomeSummaries } from '../server/outcomes.js';
import { bounded, PhaseTimeout } from '../server/deadline.js';

const answer = (keys: string[], selected: string) => ({
  type: 'choice',
  choice: selected,
  confidence: 1,
  probabilities: Object.fromEntries(keys.map((key) => [key, Number(key === selected)])),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function fixture(t: TestContext, kind: TaskKind = 'writing') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'duke-workflow-')));
  const workspace: Workspace = {
    id: 'w',
    name: 'Fixture',
    path: join(root, 'work'),
    providers: ['codex'],
    instructions: [],
  };
  await mkdir(workspace.path);
  const store = new Store(join(root, 'state', 'db'));
  store.put('workspace', 'w', workspace);
  const model = ModelInput.parse({
    id: 'luna',
    model: 'gpt-5.6-luna',
    provider: 'codex',
    label: 'Luna',
    enabled: true,
    evaluated: true,
    evidence: 'Synthetic test only',
    supportedEfforts: ['low', 'high'],
    maxDifficulty: 'complex',
    capabilities: ['files', 'shell', 'web', 'artifacts'],
    quality: { writing: 1, coding: 1, research: 1, documents: 1 },
  });
  store.put('model', model.id, model);
  store.put('settings', 'main', {
    ...store.settings(),
    jevFallbackModel: model.id,
    maxRecovery: 0,
  });
  const calls: any[] = [];
  const control = { verdict: 'pass', requirement: 'keep', runs: 0 };
  const jev = new Jev(
    store,
    { get: async () => 'synthetic-only' } as any,
    async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      calls.push(body);
      const answers = body.questions.difficulty
        ? {
            kind: answer(['coding', 'research', 'writing', 'documents'], kind),
            difficulty: {
              type: 'score',
              score: 0,
              confidence: 1,
              probabilities: { '0': 1, '1': 0, '2': 0 },
            },
          }
        : Object.fromEntries(
            Object.entries<any>(body.questions).map(([key, question]) => [
              key,
              answer(
                Object.keys(question.criteria),
                key === 'model'
                  ? 'candidate_0'
                  : body.questions.brief
                    ? control.verdict
                    : control.requirement,
              ),
            ]),
          );
      return Response.json({ answers, usage: { input_tokens: 10 } });
    },
  );
  const worker: Worker = {
    run: async (ctx) => {
      control.runs++;
      ctx.emit('subscription_usage', {
        total: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
      });
      await ctx.tool('write_file', {
        path: 'result.md',
        content: 'An invented result.',
      });
      return 'Saved result.md.';
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
  t.after(async () => {
    await engine.shutdown();
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const create = (patch: any = {}) =>
    engine.create({
      prompt: 'Write an introduction',
      workspaceId: 'w',
      required: ['files'],
      ...patch,
    });
  const run = async (patch: any = {}) => {
    const task = await create(patch);
    await engine.execute(task.id);
    return store.task(task.id);
  };
  return {
    root,
    workspace,
    model,
    store,
    tools,
    engine,
    jev,
    worker,
    control,
    calls,
    create,
    run,
  };
}

test('a coding label alone does not require tests for a literal text-file task', async (t) => {
  const f = await fixture(t, 'coding');
  const task = await f.run({ prompt: 'Save this sentence in result.md.' });
  assert.equal(task.review?.status, 'passed');
  assert.ok(!task.review?.checks.some((c) => c.name === 'Tests'));
});

test('a changed output format retires only explicitly superseded requirements and preserves history', async (t) => {
  const f = await fixture(t);
  const first = await f.run({
    expectedResult: 'A Markdown introduction',
    verification: { files: ['result.md'] },
  });
  assert.equal(first.review?.status, 'passed');
  f.control.requirement = 'superseded';
  f.engine.resume(
    first.id,
    false,
    'Replace the Markdown deliverable with result.txt instead. The Markdown file is no longer needed.',
  );
  await rm(join(f.workspace.path, 'result.md'));
  f.worker.run = async (ctx) => {
    await ctx.tool('write_file', {
      path: 'result.txt',
      content: 'An invented introduction.',
    });
    return 'Saved result.txt.';
  };
  await f.engine.execute(first.id);
  const task = f.store.task(first.id);
  assert.equal(task.revision, 1);
  assert.equal(task.expectedResult, '');
  assert.deepEqual(task.verification.files, []);
  assert.equal(
    task.review?.status,
    'passed',
    task.error ?? task.review?.summary ?? 'Review absent',
  );
  assert.ok(task.review?.checks.some((c) => c.name === 'result.txt'));
  assert.ok(!task.review?.checks.some((c) => c.name === 'result.md'));
  const saved = f.store.events(first.id).find((e) => e.kind === 'task_revision')!.data;
  assert.equal(saved.review.status, 'passed');
  assert.deepEqual(saved.verification.files, ['result.md']);
  assert.match(
    f.calls.filter((c) => c.questions.brief).at(-1).state.task,
    /^Current user follow-up/,
  );
  assert.equal(
    f.store
      .list<any>('routing_outcome')
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .at(-1).evaluation,
    true,
  );
});

test('refinement retains the test command, and a real failing test stays a failure', async (t) => {
  const f = await fixture(t);
  let exit = 0;
  const commands: string[] = [];
  f.tools.shell = async (_workspace, command) => {
    commands.push(command);
    return { status: 'exited', code: exit, stdout: '', stderr: '' };
  };
  const task = await f.run({
    required: ['files', 'shell'],
    verification: { files: ['result.md'], command: 'node verify.mjs' },
  });
  exit = 1;
  f.engine.resume(task.id, false, 'Make the introduction shorter.');
  await f.engine.execute(task.id);
  assert.deepEqual(commands, ['node verify.mjs', 'node verify.mjs']);
  assert.equal(f.store.task(task.id).verification.command, 'node verify.mjs');
  assert.equal(f.store.task(task.id).review?.status, 'failed');
  assert.equal(f.store.task(task.id).status, 'blocked');
});

test('uncertain follow-up requirements remain visible without teaching a quality failure', async (t) => {
  const f = await fixture(t);
  const task = await f.run({ verification: { files: ['result.md'] } });
  f.control.requirement = 'unknown';
  f.engine.resume(task.id, false, 'Try a different output.');
  f.worker.run = async () => 'A different response.';
  await rm(join(f.workspace.path, 'result.md'));
  await f.engine.execute(task.id);
  const next = f.store.task(task.id);
  assert.equal(next.status, 'completed');
  assert.equal(next.review?.status, 'unverified');
  assert.deepEqual(next.verification.files, ['result.md']);
  assert.match(next.review!.limitations.join(' '), /clarify which result/);
  assert.equal(f.store.events(task.id).filter((e) => e.kind === 'quality_retry').length, 0);
});

test('retry checks uses the saved result, retains usage, and is one quality observation', async (t) => {
  const f = await fixture(t);
  f.control.verdict = 'unknown';
  const first = await f.run();
  const initialTokens = first.usage!.reportedTokens;
  const workerCalls = f.control.runs;
  const routes = f.calls.filter((c) => c.questions.model).length;
  f.control.verdict = 'pass';
  f.engine.retryReview(first.id);
  assert.throws(() => f.engine.retryReview(first.id), /saved result/);
  await f.engine.execute(first.id);
  const task = f.store.task(first.id);
  assert.equal(task.status, 'completed');
  assert.equal(task.review?.status, 'passed', task.error ?? 'Review incomplete');
  assert.equal(f.control.runs, workerCalls);
  assert.equal(f.calls.filter((c) => c.questions.model).length, routes);
  assert.equal(task.usage!.reportedTokens, initialTokens + 10);
  const summary = outcomeSummaries(f.store, { ...f.model, effort: 'low' })[0];
  assert.equal(summary.passed, 1);
  assert.equal(summary.unverified, 0);
  assert.equal(f.store.events(task.id).filter((e) => e.kind === 'verification').length, 2);
});

test('retry checks rejects changed files without rerunning the worker or replacing the old review', async (t) => {
  const f = await fixture(t);
  f.control.verdict = 'unknown';
  const first = await f.run();
  await writeFile(join(f.workspace.path, 'result.md'), 'An externally changed result.');
  f.control.verdict = 'pass';
  const calls = f.calls.length;
  f.engine.retryReview(first.id);
  await f.engine.execute(first.id);
  assert.equal(f.calls.length, calls);
  assert.equal(f.control.runs, 1);
  assert.deepEqual(f.store.task(first.id).review, first.review);
  assert.match(f.store.task(first.id).error!, /changed after the last review/);
});

test('Stop releases a stalled health check and a late reply cannot update availability', async (t) => {
  const f = await fixture(t);
  const entered = deferred<void>(),
    late = deferred<any>();
  f.worker.health = async () => {
    entered.resolve();
    return late.promise;
  };
  const first = await f.create();
  const execution = f.engine.execute(first.id);
  await entered.promise;
  f.engine.cancel(first.id);
  await execution;
  assert.equal(f.store.task(first.id).status, 'cancelled');
  assert.equal(f.control.runs, 0);
  late.resolve({ provider: 'codex', ready: true, message: 'Late health' });
  await new Promise((r) => setImmediate(r));
  assert.equal(f.store.get('health', 'codex'), undefined);
  delete f.worker.health;
  assert.equal((await f.run()).status, 'completed');
});

test('a timed-out setup read cannot publish late context, and the next queued task runs', async (t) => {
  const f = await fixture(t);
  const late = deferred<any[]>();
  f.store.put('setup', 's', {
    id: 's',
    files: [{ scope: '.', path: 'guide.md' }],
    bindings: {},
    workspaceId: 'w',
  });
  f.tools.setups.current = async () => late.promise;
  f.engine.limits.preparation = 40;
  const first = await f.run();
  assert.equal(first.status, 'blocked');
  assert.match(first.error!, /Reading project instructions took too long/);
  late.resolve([]);
  await new Promise((r) => setImmediate(r));
  assert.equal(f.store.get('setup_snapshot', first.id), undefined);
  assert.equal(f.store.list('routing_outcome').length, 0);
  f.store.put('setup', 's', { id: 's', files: [], bindings: {} });
  const second = await f.create();
  f.engine.stopped = false;
  await f.engine.drain();
  assert.equal(f.store.task(second.id).status, 'completed');
});

test('a stale worker cannot write, publish a message, or replace a result after startup times out', async (t) => {
  const f = await fixture(t);
  const entered = deferred<WorkerContext>(),
    late = deferred<string>();
  f.worker.run = async (ctx) => {
    entered.resolve(ctx);
    return late.promise;
  };
  f.engine.limits.startup = 40;
  const task = await f.create();
  const execution = f.engine.execute(task.id);
  const ctx = await entered.promise;
  await execution;
  assert.equal(f.store.task(task.id).status, 'blocked');
  assert.match(f.store.task(task.id).error!, /Starting the model took too long/);
  await assert.rejects(async () => ctx.tool('write_file', { path: 'late.md', content: 'late' }));
  ctx.emit('message', { text: 'Late success' });
  late.resolve('Late result');
  await new Promise((r) => setImmediate(r));
  assert.equal(f.store.task(task.id).result, undefined);
  assert.ok(!f.store.events(task.id).some((e) => e.kind === 'message'));
  await assert.rejects(readFile(join(f.workspace.path, 'late.md')));
});

test('a hung Jev selection uses the configured low-effort fallback and ignores a late choice', async (t) => {
  const f = await fixture(t);
  const late = deferred<any>();
  f.jev.decide = async () => late.promise;
  f.engine.limits.routing = 40;
  const task = await f.run();
  assert.equal(task.status, 'completed');
  assert.equal(task.route?.modelId, 'luna');
  assert.equal(task.route?.effort, 'low');
  late.resolve({ modelId: 'premium' });
  await new Promise((r) => setImmediate(r));
  assert.equal(f.store.task(task.id).route?.modelId, 'luna');
  assert.equal(f.control.runs, 1);
});

test('a whole-review timeout is neutral and can be retried without a second worker run', async (t) => {
  const f = await fixture(t);
  const original = f.jev.review.bind(f.jev);
  f.jev.review = async () => new Promise(() => {});
  f.engine.limits.verification = 40;
  const first = await f.run();
  assert.equal(first.status, 'completed');
  assert.equal(first.review?.status, 'unverified');
  assert.match(first.review!.summary, /took too long/);
  assert.ok(!f.store.events(first.id).some((e) => e.kind === 'quality_retry'));
  f.jev.review = original;
  f.engine.limits.verification = 2000;
  f.engine.retryReview(first.id);
  await f.engine.execute(first.id);
  assert.equal(f.store.task(first.id).review?.status, 'passed');
  assert.equal(f.control.runs, 1);
});

test('deadline cancellation does not wait for an uncooperative promise', async () => {
  const controller = new AbortController();
  const waiting = bounded(controller.signal, 1000, 'Fixture', async () => new Promise(() => {}));
  controller.abort(new Error('Stopped'));
  await assert.rejects(waiting, /Stopped/);
  await assert.rejects(
    bounded(new AbortController().signal, 20, 'Fixture', async () => new Promise(() => {})),
    PhaseTimeout,
  );
});

test('review-only retries stay review-only after restart and explicit resume', async (t) => {
  const f = await fixture(t);
  f.control.verdict = 'unknown';
  const first = await f.run();
  f.engine.retryReview(first.id);
  // Persist the state an app crash would leave during verification.
  f.store.update(first.id, { status: 'verifying' });
  f.store.recover();
  assert.equal(f.store.task(first.id).status, 'interrupted');
  assert.equal(f.store.task(first.id).pendingOperation, 'review');
  f.control.verdict = 'pass';
  f.engine.resume(first.id);
  await f.engine.execute(first.id);
  assert.equal(f.control.runs, 1);
  assert.equal(f.store.task(first.id).review?.status, 'passed');
  assert.equal(f.store.task(first.id).pendingOperation, undefined);
});

test('Stop during a review retry preserves the result and rejects the late verdict', async (t) => {
  const f = await fixture(t);
  f.control.verdict = 'unknown';
  const first = await f.run();
  const entered = deferred<void>(),
    late = deferred<any>();
  f.jev.review = async () => {
    entered.resolve();
    return late.promise;
  };
  f.engine.retryReview(first.id);
  const checking = f.engine.execute(first.id);
  await entered.promise;
  f.engine.cancel(first.id);
  await checking;
  late.resolve([{ name: 'Late verdict', status: 'passed', detail: 'Late' }]);
  await new Promise((r) => setImmediate(r));
  assert.equal(f.store.task(first.id).status, 'completed');
  assert.equal(f.store.task(first.id).result, first.result);
  assert.deepEqual(f.store.task(first.id).review, first.review);
  assert.equal(f.control.runs, 1);
  assert.equal(f.store.list('routing_outcome').length, 1);
});
