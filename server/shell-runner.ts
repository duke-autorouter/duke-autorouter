// One isolated SRT manager per invocation: configuration cannot leak across tasks.
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { runProcess, safeEnv } from './process.js';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { workspace, command, writable } = JSON.parse(input);
const temp = await mkdtemp(join(tmpdir(), 'duke-shell-'));
try {
  const cwd = await realpath(workspace);
  const runtime = await realpath(resolve(dirname(process.execPath), '..'));
  await SandboxManager.initialize({
    network: { allowedDomains: [], deniedDomains: [], allowLocalBinding: false },
    filesystem: {
      denyRead: [
        '/',
        join(cwd, '**/.env'),
        join(cwd, '**/.env.*'),
        join(cwd, '**/.git'),
        join(cwd, '**/.router'),
        join(cwd, '**/auth.json'),
        join(cwd, '**/credentials.json'),
        join(cwd, '**/.npmrc'),
        join(cwd, '**/.ssh'),
      ],
      allowRead: [
        cwd,
        temp,
        '/usr',
        '/bin',
        '/sbin',
        '/System',
        '/Library/Apple',
        '/opt/homebrew',
        runtime,
        '/dev/null',
        '/dev/urandom',
        '/private/etc',
      ],
      allowWrite: [temp, ...(writable ? [cwd] : [])],
      denyWrite: [
        join(cwd, '**/.git'),
        join(cwd, '**/.router'),
        join(cwd, '**/.env'),
        join(cwd, '**/.env.*'),
      ],
    },
  });
  const wrapped = await SandboxManager.wrapWithSandbox(command);
  const result = await runProcess('/bin/sh', ['-c', wrapped], {
    cwd,
    env: {
      ...safeEnv(),
      PATH: join(runtime, 'bin') + ':' + (safeEnv().PATH ?? '/usr/bin:/bin'),
      HOME: temp,
      TMPDIR: temp,
      XDG_CACHE_HOME: temp,
      PYTHONDONTWRITEBYTECODE: '1',
      npm_config_cache: temp,
    },
    timeout: 90000,
  });
  process.stdout.write(JSON.stringify(result));
} catch (e) {
  process.stdout.write(
    JSON.stringify({
      code: 126,
      stdout: '',
      stderr: `Sandbox unavailable: ${e instanceof Error ? e.message : String(e)}`,
    }),
  );
} finally {
  await SandboxManager.reset();
  await rm(temp, { recursive: true, force: true });
}
