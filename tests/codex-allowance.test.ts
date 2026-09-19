import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CodexWorker, type CodexRPC } from '../server/adapters/codex.js';
import type { WorkerContext } from '../server/types.js';

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
