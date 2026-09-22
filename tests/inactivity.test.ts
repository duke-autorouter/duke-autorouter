import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whileActive } from '../server/deadline.js';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('meaningful progress extends inactivity without a total runtime cap', async () => {
  const value = await whileActive(new AbortController().signal, 100, async (_, activity) => {
    for (let i = 0; i < 5; i++) {
      await sleep(30);
      activity();
    }
    return 'done';
  });
  assert.equal(value, 'done');
});

test('concurrent active tools suspend inactivity until all finish', async () => {
  await whileActive(new AbortController().signal, 40, async (_, activity, tool) => {
    await Promise.all([
      tool(() => sleep(90)),
      tool(async () => {
        await sleep(160);
        activity();
      }),
    ]);
    await sleep(10);
  });
});

test('inactivity resumes after tools and cancellation interrupts pending approval', async () => {
  await assert.rejects(
    whileActive(new AbortController().signal, 30, async (_, __, tool) => {
      await tool(() => sleep(60));
      return new Promise(() => {});
    }),
    /Waiting for the model took too long/,
  );
  const controller = new AbortController();
  const waiting = whileActive(controller.signal, 100, async (_, __, tool) =>
    tool(() => new Promise(() => {})),
  );
  await sleep(10);
  controller.abort(new Error('Stopped'));
  await assert.rejects(waiting, /Stopped/);
});
