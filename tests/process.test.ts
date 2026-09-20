import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../server/process.js';

test('process results distinguish real exits, timeouts, output caps and missing executables', async () => {
  const run = (code: string, options = {}) => runProcess(process.execPath, ['-e', code], options);
  assert.deepEqual(await run('process.exit(126)'), {
    status: 'exited',
    code: 126,
    stdout: '',
    stderr: '',
  });
  assert.equal((await run('console.log("ok")')).status, 'exited');
  const timeout = await run('setInterval(() => {}, 1000)', { timeout: 50 });
  assert.equal(timeout.status, 'timed_out');
  assert.equal(timeout.code, null);
  const capped = await run('process.stdout.write("x".repeat(300000))');
  assert.equal(capped.status, 'output_limit');
  assert.equal(capped.stdout.length, 250000);
  assert.equal(capped.code, null);
  // JSON escaping can make the outer envelope much larger than the inner output.
  const envelope = JSON.stringify({ ...capped, stdout: '\u0001'.repeat(250000) });
  const outer = await run('process.stdin.pipe(process.stdout)', {
    input: envelope,
    maxOutput: 2_000_000,
  });
  assert.equal(outer.status, 'exited');
  assert.equal(JSON.parse(outer.stdout).status, 'output_limit');
  assert.equal((await runProcess('/nonexistent/duke-test-command', [])).status, 'unavailable');
  assert.equal((await run('process.kill(process.pid, "SIGTERM")')).status, 'interrupted');
  const abort = new AbortController();
  const running = run('setInterval(() => {}, 1000)', { signal: abort.signal });
  abort.abort();
  await assert.rejects(running, /cancelled/);
});
