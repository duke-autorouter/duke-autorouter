import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CodexWorker, type CodexRPC } from '../server/adapters/codex.js';
import type { WorkerContext } from '../server/types.js';
import type { ThreadStartParams } from '../server/generated/codex/v2/ThreadStartParams.js';

test('Codex forwards project file tools while native execution stays disabled', async () => {
  const rpc = new EventEmitter() as CodexRPC;
  const replies: any[] = [];
  const calls: { name: string; args: unknown }[] = [];
  let configuration: ThreadStartParams | undefined;
  rpc.closed = false;
  rpc.init = async () => {};
  rpc.close = () => {
    rpc.closed = true;
  };
  rpc.send = (reply: any) => {
    replies.push(reply);
    if (reply.id === 42) {
      rpc.emit('message', {
        method: 'turn/completed',
        params: { threadId: 'scoped-tools', turn: { status: 'completed' } },
      });
    }
  };
  rpc.request = async (method, params) => {
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'account/rateLimits/read') return {};
    if (method === 'thread/start') {
      configuration = params;
      return { thread: { id: 'scoped-tools' } };
    }
    if (method === 'turn/start') {
      assert.equal(params.effort, 'low');
      rpc.emit('message', {
        id: 41,
        method: 'item/commandExecution/requestApproval',
        params: { threadId: 'scoped-tools' },
      });
      rpc.emit('message', {
        id: 42,
        method: 'item/tool/call',
        params: {
          threadId: 'scoped-tools',
          tool: 'write_file',
          arguments: { path: 'result.txt', content: 'Fixture' },
        },
      });
      return {};
    }
    throw new Error(`Unexpected request ${method}`);
  };
  await new CodexWorker('/tmp/scoped-tool-profile', () => rpc).run({
    task: { prompt: 'Create result.txt', required: ['files'] },
    model: { model: 'synthetic', supportedEfforts: ['low', 'max'], effort: 'low' },
    signal: new AbortController().signal,
    prompt: 'Use the supplied project tools.',
    session: () => {},
    emit: () => {},
    tool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { path: 'result.txt', bytes: 7 };
    },
  } as unknown as WorkerContext);
  assert.equal(configuration?.sandbox, 'read-only');
  assert.deepEqual(configuration?.environments, []);
  assert.equal(configuration?.config?.['features.shell_tool'], false);
  assert.equal(configuration?.config?.['features.unified_exec'], false);
  assert.equal(configuration?.config?.web_search, 'disabled');
  assert.ok(configuration?.dynamicTools?.some((tool) => tool.name === 'write_file'));
  assert.ok(!configuration?.dynamicTools?.some((tool) => tool.name === 'shell'));
  assert.deepEqual(calls, [
    { name: 'write_file', args: { path: 'result.txt', content: 'Fixture' } },
  ]);
  assert.equal(replies.find((reply) => reply.id === 41)?.error?.code, -32601);
  assert.equal(replies.find((reply) => reply.id === 42)?.result?.success, true);
  assert.equal(rpc.closed, true);
});

test('Codex reads allowance before and after execution; unavailable final telemetry cannot fail completed work', async () => {
  for (const failAfter of [false, true]) {
    const rpc = new EventEmitter() as CodexRPC;
    const requests: string[] = [],
      emitted: { kind: string; data: any }[] = [];
    rpc.closed = false;
    rpc.init = async () => {};
    rpc.send = () => {};
    rpc.close = () => {
      rpc.closed = true;
    };
    let reads = 0;
    rpc.request = async (method, _params, timeout) => {
      requests.push(method);
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'account/rateLimits/read') {
        reads++;
        assert.equal(timeout, 3000);
        if (failAfter && reads === 2) throw new Error('Telemetry unavailable');
        return {
          rateLimits: {
            primary: {
              usedPercent: reads,
              windowDurationMins: 300,
              resetsAt: Date.now() / 1000 + 3600,
            },
          },
        };
      }
      if (method === 'thread/start') return { thread: { id: 'synthetic' } };
      if (method === 'turn/start') {
        rpc.emit('message', {
          method: 'item/agentMessage/delta',
          params: { threadId: 'synthetic', delta: 'Finished.' },
        });
        rpc.emit('message', {
          method: 'turn/completed',
          params: { threadId: 'synthetic', turn: { status: 'completed' } },
        });
        return {};
      }
      throw new Error(`Unexpected request ${method}`);
    };
    const result = await new CodexWorker('/tmp/synthetic-profile', () => rpc).run({
      task: { prompt: 'Invented task', required: [] },
      model: { model: 'synthetic' },
      signal: new AbortController().signal,
      prompt: 'Synthetic worker prompt',
      session: () => {},
      emit: (kind: string, data: unknown) => emitted.push({ kind, data }),
    } as unknown as WorkerContext);
    assert.equal(result, 'Finished.');
    assert.equal(reads, 2);
    assert.equal(requests.at(-1), 'account/rateLimits/read');
    const snapshots = emitted.filter((e) => e.kind === 'allowance_snapshot');
    assert.deepEqual(
      snapshots.map((e) => e.data.phase),
      ['before', 'after'],
    );
    assert.equal(!!snapshots[1].data.quota, !failAfter);
    assert.equal(rpc.closed, true);
  }
});
