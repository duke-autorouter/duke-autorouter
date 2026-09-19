import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { homedir } from 'node:os';
export const safeEnv = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  HOME: homedir(),
  LANG: 'en_US.UTF-8',
  TERM: 'dumb',
  TMPDIR: process.env.TMPDIR,
});
export function stopTree(child: ChildProcess) {
  if (!child.pid) return;
  const descendants: number[] = [];
  try {
    const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], {
      encoding: 'utf8',
      timeout: 1000,
    })
      .trim()
      .split('\n')
      .map((r) => r.trim().split(/\s+/).map(Number));
    const walk = (pid: number) => {
      for (const [id, parent] of rows)
        if (parent === pid) {
          descendants.push(id);
          walk(id);
        }
    };
    walk(child.pid);
  } catch {}
  const terminate = (signal: NodeJS.Signals) => {
    for (const id of [...descendants].reverse()) {
      try {
        process.kill(id, signal);
      } catch {}
    }
    try {
      process.kill(-child.pid!, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {}
    }
  };
  terminate('SIGTERM');
  const timer = setTimeout(() => terminate('SIGKILL'), 1000);
  timer.unref();
}
export function runProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    timeout?: number;
    input?: string;
  } = {},
) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    options.signal?.throwIfAborted();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? safeEnv(),
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    const kill = () => stopTree(child),
      timer = setTimeout(kill, options.timeout ?? 60000);
    options.signal?.addEventListener('abort', kill, { once: true });
    child.stdout.on('data', (b) => {
      stdout += b;
      if (stdout.length > 250000) {
        stdout = stdout.slice(0, 250000);
        kill();
      }
    });
    child.stderr.on('data', (b) => {
      stderr = (stderr + b).slice(-24000);
    });
    child.on('error', finish);
    child.on('close', (code) => finish(null, code));
    function finish(err: Error | null, code: number | null = null) {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', kill);
      if (err) reject(err);
      else if (options.signal?.aborted) reject(new Error('Task cancelled'));
      else resolve({ stdout, stderr, code });
    }
    child.stdin.end(options.input);
  });
}
