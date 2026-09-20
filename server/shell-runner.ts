// One isolated SRT manager per invocation: configuration cannot leak across tasks.
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { runProcess, safeEnv } from './process.js';
import { mkdtemp, rm, realpath, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { sensitiveGlobs } from './paths.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { workspace, command, writable } = JSON.parse(input);
const temp = await realpath(await mkdtemp(join(tmpdir(), 'duke-shell-')));
try {
  const cwd = await realpath(workspace);
  const runtime = await realpath(resolve(dirname(process.execPath), '..'));
  await SandboxManager.initialize({
    network: { allowedDomains: [], deniedDomains: [], allowLocalBinding: false },
    filesystem: {
      denyRead: ['/', ...sensitiveGlobs.map((glob) => join(cwd, '**', glob))],
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
      denyWrite: sensitiveGlobs.map((glob) => join(cwd, '**', glob)),
    },
  });
  const started = join(temp, 'command-started');
  const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
  const wrapped = await SandboxManager.wrapWithSandbox(
    `printf started > ${quote(started)} && /bin/sh -c ${quote(command)}`,
  );
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
  if (
    result.status === 'exited' &&
    !(await access(started).then(
      () => true,
      () => false,
    ))
  ) {
    result.status = 'unavailable';
    result.code = null;
    result.stderr = `The sandbox could not start the command. ${result.stderr}`;
  }
  process.stdout.write(JSON.stringify(result));
} catch (e) {
  process.stdout.write(
    JSON.stringify({
      status: 'unavailable',
      code: null,
      stdout: '',
      stderr: `Sandbox unavailable: ${e instanceof Error ? e.message : String(e)}`,
    }),
  );
} finally {
  await SandboxManager.reset();
  await rm(temp, { recursive: true, force: true });
}
