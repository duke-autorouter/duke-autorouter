import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../server/process.js';
import { shellRunnerArgs } from '../server/runtime.js';
const root = await realpath(await mkdtemp(join(tmpdir(), 'duke-isolation-'))),
  workspace = join(root, 'workspace');
await mkdir(workspace);
await writeFile(join(root, 'private.txt'), 'OUTSIDE_SECRET');
await writeFile(join(workspace, 'allowed.txt'), 'inside');
await writeFile(join(workspace, '.env'), 'SECRET_VALUE');
await mkdir(join(workspace, '.git'));
await writeFile(join(workspace, '.git/config'), 'SECRET_VALUE');
await mkdir(join(workspace, '.AWS'));
await writeFile(join(workspace, '.AWS/credentials'), 'SECRET_VALUE');
const checks = [
  ['workspace read', 'cat allowed.txt', false, 0],
  ['outside read', `cat '${join(root, 'private.txt')}'`, false, 1],
  ['secret read', 'cat .env', false, 1],
  ['mixed-case git read', 'cat .GIT/config', false, 1],
  ['mixed-case credential read', 'cat .AWS/credentials', false, 1],
  ['mixed-case git write', 'touch .GIT/forbidden', true, 1],
  ['unapproved write', 'touch forbidden.txt', false, 1],
  ['approved write', 'touch permitted.txt', true, 0],
  ['network', 'curl --max-time 4 -sS https://example.com', false, 1],
] as const;
try {
  for (const [name, command, writable, expected] of checks) {
    const result = await runProcess(process.execPath, shellRunnerArgs(), {
      input: JSON.stringify({ workspace, command, writable }),
      timeout: 15000,
    });
    const body = JSON.parse(result.stdout);
    assert.equal(body.code === 0, expected === 0, `${name}: ${body.stderr}`);
    assert.ok(!body.stdout.includes('OUTSIDE_SECRET') && !body.stdout.includes('SECRET_VALUE'));
    console.log(`PASS ${name}`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
