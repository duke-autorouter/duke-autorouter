import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { route } from '../server/router.js';
import {
  defaults,
  ModelInput,
  TaskInput,
  Blocked,
  type Task,
  type Workspace,
  type Worker,
} from '../server/types.js';
import { Approvals, fingerprint } from '../server/approval.js';
import { scoped } from '../server/paths.js';
import { publicIP, publicURL } from '../server/web.js';
import { ToolService } from '../server/tools.js';
import { Engine } from '../server/engine.js';
import { Jev } from '../server/adapters/jev.js';
import { Secrets } from '../server/secrets.js';
import { OpenRouterWorker } from '../server/adapters/openrouter.js';
import { acquireInstanceLock } from '../server/lock.js';
const task = (id = 'task'): Task => ({
  ...TaskInput.parse({ prompt: 'Fix the function and test it', workspaceId: 'w' }),
  id,
  title: 'Test',
  status: 'queued',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  attempt: 0,
});
const workspace = (path = '/tmp/work'): Workspace => ({
  id: 'w',
  name: 'Test',
  path,
  providers: ['codex', 'claude', 'openrouter'],
  instructions: [],
});
const model = (id: string, provider: 'codex' | 'claude' | 'openrouter', quality = 0.9) =>
  ModelInput.parse({
    id,
    provider,
    model: id,
    label: id,
    enabled: true,
    evaluated: true,
    evidence: 'test corpus',
    maxDifficulty: 'complex',
    capabilities: ['files', 'shell', 'web', 'browser', 'artifacts'],
    quality: { coding: quality, research: quality, writing: quality },
    inputPrice: 1,
    outputPrice: 2,
    providerSlug: 'test',
    contextLimit: 100000,
  });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'duke-test-'))),
    dir = join(root, 'workspace');
  await mkdir(dir);
  const store = new Store(join(root, 'state', 'test.sqlite'));
  store.put('workspace', 'w', workspace(dir));
  store.save(task());
  const approvals = new Approvals(store),
    tools = new ToolService(store, approvals, join(root, 'state'));
  return {
    root,
    dir,
    store,
    approvals,
    tools,
    close: async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
const noKey = { get: async () => undefined } as unknown as Secrets;

test('quality bar filters candidates; subscription billing alone does not establish resource efficiency', () => {
  const r = route(
    task(),
    workspace(),
    [model('bad', 'codex', 0.7), model('good', 'openrouter', 0.94)],
    defaults,
  );
  assert.equal(r.modelId, 'good');
  assert.equal(
    route(
      task(),
      workspace(),
      [model('good', 'openrouter', 0.99), model('included', 'claude', 0.85)],
      defaults,
    ).modelId,
    'good',
  );
  assert.equal(
    route(
      task(),
      workspace(),
      [model('api', 'openrouter', 0.94), model('included', 'claude', 0.92)],
      defaults,
    ).modelId,
    'api',
  );
});
test('fallback and manual choices cannot bypass provider/tool scope', () => {
  const w = { ...workspace(), providers: ['codex'] as const };
  assert.throws(
    () =>
      route(
        { ...task(), modelOverride: 'paid' },
        w as unknown as Workspace,
        [model('paid', 'openrouter')],
        defaults,
      ),
    Blocked,
  );
  assert.throws(
    () =>
      route(
        { ...task(), required: ['browser'] },
        workspace(),
        [{ ...model('a', 'codex'), capabilities: ['files'] }],
        defaults,
      ),
    Blocked,
  );
});
test('unevaluated models require an explicit manual trial', () => {
  const m = { ...model('trial', 'codex'), evaluated: false };
  assert.throws(() => route(task(), workspace(), [m], defaults));
  assert.equal(route({ ...task(), modelOverride: m.id }, workspace(), [m], defaults).modelId, m.id);
});
test('budget reservations enforce daily and monthly limits and retain uncertainty', async () => {
  const f = await fixture();
  try {
    f.store.put('settings', 'main', { ...defaults, dailyLimit: 1, monthlyLimit: 1.5 });
    const a = f.store.reserve('t', 'test', 0.8);
    assert.throws(() => f.store.reserve('t', 'test', 0.3), /budget/);
    assert.equal(f.store.spend().unreconciled, 1);
    f.store.settle(a, 0.2);
    assert.equal(f.store.spend().day, 0.2);
    assert.throws(() => f.store.reserve('t', 'test', NaN));
    f.store.reserve('t', 'test', 0.7);
    assert.equal(f.store.spend().day, 0.9);
  } finally {
    await f.close();
  }
});
test('budget uses New York calendar boundaries and counts late settled calls in their original window', async () => {
  const f = await fixture();
  try {
    assert.equal(f.store.periods(new Date('2026-09-01T03:59:00Z')).month, '2026-08');
    assert.equal(f.store.periods(new Date('2026-09-01T04:00:00Z')).month, '2026-09');
    const id = f.store.reserve('t', 'test', 2, new Date('2026-09-01T03:59:00Z'));
    f.store.settle(id, 1);
    assert.equal(f.store.spend(new Date('2026-09-01T04:00:00Z')).month, 0);
    assert.equal(f.store.spend(new Date('2026-08-31T21:00:00Z')).month, 1);
  } finally {
    await f.close();
  }
});
test('approval is bound to canonical arguments and is single-use', async () => {
  const f = await fixture();
  try {
    const c = new AbortController(),
      p = f.approvals.request('task', 'publish', { b: 2, a: 1 }, c.signal);
    const a = f.store.approvals()[0];
    assert.equal(a.hash, fingerprint('publish', { a: 1, b: 2 }));
    assert.throws(() => f.approvals.decide(a.id, 'wrong', true));
    f.approvals.decide(a.id, a.hash, true);
    await p;
    assert.throws(() => f.approvals.decide(a.id, a.hash, true));
  } finally {
    await f.close();
  }
});
test('cancel expires waiting approvals', async () => {
  const f = await fixture();
  try {
    const c = new AbortController(),
      p = f.approvals.request('task', 'write', { to: 'external' }, c.signal);
    c.abort();
    await assert.rejects(p, /cancelled/);
    assert.equal(f.store.approvals()[0].status, 'expired');
  } finally {
    await f.close();
  }
});
test('restart interrupts active work and invalidates approvals without releasing spend', async () => {
  const f = await fixture();
  try {
    f.store.update('task', { status: 'running' });
    f.store.reserve('task', 'jev', 0.001);
    f.store.recover();
    assert.equal(f.store.task('task').status, 'interrupted');
    assert.equal(f.store.spend().unreconciled, 1);
  } finally {
    await f.close();
  }
});
test('workspace rejects traversal, secrets, and symlink escapes', async () => {
  const f = await fixture();
  try {
    await symlink(f.root, join(f.dir, 'outside'));
    for (const p of [
      '../secrets',
      '/etc/passwd',
      '.env',
      'a/.env.local',
      'outside/state/test.sqlite',
    ])
      await assert.rejects(() => scoped(f.dir, p));
    assert.equal(await scoped(f.dir, 'good.md', true), join(f.dir, 'good.md'));
  } finally {
    await f.close();
  }
});
test('file writes are real and retain a previous version', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.dir, 'a.txt'), 'old');
    await f.tools.call(
      'task',
      'write_file',
      { path: 'a.txt', content: 'new' },
      new AbortController().signal,
    );
    assert.equal(await readFile(join(f.dir, 'a.txt'), 'utf8'), 'new');
    const event = f.store.events('task').find((e) => e.kind === 'backup')!;
    assert.equal(await readFile(event.data.recovery, 'utf8'), 'old');
  } finally {
    await f.close();
  }
});
test('tool capability scope is enforced independently of worker', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      () => f.tools.call('task', 'shell', { command: 'pwd' }, new AbortController().signal),
      /capability/,
    );
  } finally {
    await f.close();
  }
});
test('public web rejects local networks and credential URLs', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
  ])
    assert.equal(publicIP(ip), false);
  assert.equal(publicIP('8.8.8.8'), true);
  await assert.rejects(() => publicURL('https://127.0.0.1'));
  await assert.rejects(() => publicURL('https://user:pass@example.com'));
});
test('Jev ignores malformed classifications and never sees attachment contents', async () => {
  const f = await fixture();
  try {
    f.store.put('settings', 'main', { ...defaults, jevMode: 'observe' });
    const calls: any[] = [];
    const j = new Jev(f.store, { get: async () => 'test-only' } as any, async (_u, o) => {
      calls.push(JSON.parse(o?.body as string));
      return new Response(
        JSON.stringify({
          model: 'jev-1.13.0',
          usage: { input_tokens: 50 },
          answers: { kind: { choice: 'coding', confidence: 0.95 } },
        }),
        { status: 200 },
      );
    });
    const res = await j.decide(
      { ...task(), attachments: ['sensitive.txt'] },
      [model('worker', 'codex')],
      new AbortController().signal,
    );
    assert.equal(res, undefined);
    assert.equal(calls[0].state.attachmentCount, 1);
    assert.equal(JSON.stringify(calls).includes('sensitive.txt'), false);
    assert.equal(f.store.spend().unreconciled, 0);
  } finally {
    await f.close();
  }
});
test('Jev timeout falls back with reservation retained', async () => {
  const f = await fixture();
  try {
    f.store.put('settings', 'main', { ...defaults, jevMode: 'observe' });
    const j = new Jev(f.store, { get: async () => 'test-only' } as any, async () => {
      throw new Error('timeout');
    });
    assert.equal(
      await j.decide(task(), [model('worker', 'codex')], new AbortController().signal),
      undefined,
    );
    assert.equal(f.store.spend().unreconciled, 1);
  } finally {
    await f.close();
  }
});
test('OpenRouter pins provider, disables fallbacks, executes tools, and reconciles usage', async () => {
  const f = await fixture();
  try {
    const requests: any[] = [];
    const worker = new OpenRouterWorker(
      f.store,
      { get: async () => 'fake-test-only' } as any,
      async (_u, o) => {
        if (String(_u).endsWith('/endpoints'))
          return new Response(
            JSON.stringify({
              data: {
                endpoints: [
                  {
                    tag: 'test',
                    supported_parameters: ['tools'],
                    pricing: { prompt: '0.000001', completion: '0.000002' },
                  },
                ],
              },
            }),
          );
        const b = JSON.parse(o?.body as string);
        requests.push(b);
        return new Response(
          JSON.stringify({
            id: 'fake',
            usage: { cost: 0.001 },
            choices: [
              {
                message:
                  requests.length === 1
                    ? {
                        role: 'assistant',
                        content: null,
                        tool_calls: [
                          {
                            id: '1',
                            type: 'function',
                            function: { name: 'read_file', arguments: '{"path":"a.txt"}' },
                          },
                        ],
                      }
                    : { role: 'assistant', content: 'Done' },
                finish_reason: 'stop',
              },
            ],
          }),
        );
      },
    );
    let called = 0;
    const result = await worker.run({
      task: task(),
      workspace: workspace(f.dir),
      model: { ...model('m', 'openrouter'), model: 'vendor/m' },
      signal: new AbortController().signal,
      prompt: 'system',
      tool: async () => {
        called++;
        return 'content';
      },
      emit: () => {},
      session: () => {},
    });
    assert.equal(result, 'Done');
    assert.equal(called, 1);
    assert.deepEqual(requests[0].provider.only, ['test']);
    assert.equal(requests[0].provider.allow_fallbacks, false);
    assert.equal(f.store.spend().day, 0.002);
  } finally {
    await f.close();
  }
});
test('OpenRouter refuses unknown pricing before making a request', async () => {
  const f = await fixture();
  try {
    const worker = new OpenRouterWorker(f.store, { get: async () => 'fake' } as any, async () => {
      throw new Error('should not call');
    });
    await assert.rejects(
      () =>
        worker.run({
          task: task(),
          workspace: workspace(),
          model: { ...model('m', 'openrouter'), inputPrice: undefined },
          signal: new AbortController().signal,
          prompt: '',
          tool: async () => {},
          emit: () => {},
          session: () => {},
        }),
      /prices/,
    );
  } finally {
    await f.close();
  }
});
test('engine completes a real file task and verifies file evidence', async () => {
  const f = await fixture();
  try {
    f.store.put('model', 'm', model('m', 'codex'));
    f.store.update('task', { verification: { files: ['result.md'], command: '' } });
    const worker: Worker = {
      run: async (c) => {
        await c.tool('write_file', { path: 'result.md', content: '# Verified output' });
        return 'Created result.md';
      },
    };
    const engine = new Engine(
      f.store,
      f.tools,
      { codex: worker, claude: worker, openrouter: worker },
      new Jev(f.store, noKey),
    );
    await engine.execute('task');
    assert.equal(f.store.task('task').status, 'completed');
    assert.equal(await readFile(join(f.dir, 'result.md'), 'utf8'), '# Verified output');
    assert.ok(f.store.events('task').some((e) => e.kind === 'verification'));
  } finally {
    await f.close();
  }
});
test('engine fallback carries checkpoint and artifact state', async () => {
  const f = await fixture();
  try {
    f.store.put('model', 'a', model('a', 'codex'));
    f.store.put('model', 'b', model('b', 'claude'));
    const bad: Worker = {
        run: async (c) => {
          await c.tool('write_file', { path: 'partial.md', content: 'retained' });
          throw new Error('quota exhausted');
        },
      },
      good: Worker = {
        run: async (c) => {
          assert.match(c.prompt, /partial.md/);
          return 'Recovered';
        },
      };
    const engine = new Engine(
      f.store,
      f.tools,
      { codex: bad, claude: good, openrouter: good },
      new Jev(f.store, noKey),
    );
    await engine.execute('task');
    assert.equal(f.store.task('task').status, 'completed');
    assert.equal(f.store.task('task').route?.provider, 'claude');
    assert.equal(f.store.task('task').attempt, 1);
  } finally {
    await f.close();
  }
});
test('engine cancellation stops worker and never marks success', async () => {
  const f = await fixture();
  try {
    f.store.put('model', 'm', model('m', 'codex'));
    const worker: Worker = {
      run: (c) =>
        new Promise((_, reject) =>
          c.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
        ),
    };
    const engine = new Engine(
      f.store,
      f.tools,
      { codex: worker, claude: worker, openrouter: worker },
      new Jev(f.store, noKey),
    );
    const p = engine.execute('task');
    await new Promise((r) => setTimeout(r, 25));
    engine.cancel('task');
    await p;
    assert.equal(f.store.task('task').status, 'cancelled');
  } finally {
    await f.close();
  }
});
test('one data directory cannot have two active router instances', async () => {
  const f = await fixture();
  try {
    const release = await acquireInstanceLock(f.root);
    await assert.rejects(() => acquireInstanceLock(f.root), /already has a running/);
    await release();
    const releaseAgain = await acquireInstanceLock(f.root);
    await releaseAgain();
  } finally {
    await f.close();
  }
});
test('OpenRouter price increase blocks before any paid request', async () => {
  const f = await fixture();
  try {
    let posts = 0;
    const worker = new OpenRouterWorker(
      f.store,
      { get: async () => 'test-only' } as any,
      async (_u, o) => {
        if (o?.method === 'POST') posts++;
        return new Response(
          JSON.stringify({
            data: {
              endpoints: [
                {
                  tag: 'test',
                  supported_parameters: ['tools'],
                  pricing: { prompt: '0.01', completion: '0.02' },
                },
              ],
            },
          }),
        );
      },
    );
    await assert.rejects(
      () =>
        worker.run({
          task: task(),
          workspace: workspace(),
          model: { ...model('m', 'openrouter'), model: 'vendor/m' },
          signal: new AbortController().signal,
          prompt: '',
          tool: async () => {},
          emit: () => {},
          session: () => {},
        }),
      /prices changed/,
    );
    assert.equal(posts, 0);
    assert.equal(f.store.spend().day, 0);
  } finally {
    await f.close();
  }
});
test('known exhausted subscription capacity routes to another qualified worker', async () => {
  const f = await fixture();
  try {
    f.store.put('model', 'a', model('a', 'codex'));
    f.store.put('model', 'b', model('b', 'claude'));
    f.store.put('health', 'codex', {
      ready: true,
      checkedAt: new Date().toISOString(),
      quota: { rateLimits: { primary: { usedPercent: 100, resetsAt: Date.now() / 1000 + 1000 } } },
    });
    const unavailable: Worker = {
        run: async () => {
          throw new Error('should not execute');
        },
      },
      good: Worker = { run: async () => 'Completed through the eligible subscription' };
    const e = new Engine(
      f.store,
      f.tools,
      { codex: unavailable, claude: good, openrouter: good },
      new Jev(f.store, noKey),
    );
    await e.execute('task');
    assert.equal(f.store.task('task').status, 'completed');
    assert.equal(f.store.task('task').route?.provider, 'claude');
  } finally {
    await f.close();
  }
});
test('uncertain external effects require a verified outcome before resume', async () => {
  const f = await fixture();
  try {
    f.store.update('task', { status: 'interrupted' });
    f.store.put('effect', 'x', { id: 'x', taskId: 'task', state: 'pending' });
    const worker: Worker = { run: async () => 'unused' },
      e = new Engine(
        f.store,
        f.tools,
        { codex: worker, claude: worker, openrouter: worker },
        new Jev(f.store, noKey),
      );
    e.stopped = true;
    assert.throws(() => e.resume('task'), /uncertain/);
    assert.throws(() => e.resume('task', true), /Describe/);
    e.resume('task', true, 'Verified receipt: the action completed. Do not repeat it.');
    assert.equal(f.store.get<any>('effect', 'x').state, 'reviewed');
    assert.equal(f.store.task('task').status, 'queued');
  } finally {
    await f.close();
  }
});
test('verification failure cannot be reported as completed', async () => {
  const f = await fixture();
  try {
    f.store.put('model', 'a', model('a', 'codex'));
    f.store.update('task', { verification: { files: ['missing.txt'], command: '' } });
    const worker: Worker = { run: async () => 'I claim this is done' },
      e = new Engine(
        f.store,
        f.tools,
        { codex: worker, claude: worker, openrouter: worker },
        new Jev(f.store, noKey),
      );
    await e.execute('task');
    assert.equal(f.store.task('task').status, 'blocked');
    assert.ok(f.store.events('task').some((e) => e.kind === 'attempt_failed'));
  } finally {
    await f.close();
  }
});
