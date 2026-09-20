import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { homedir } from 'node:os';
export const safeEnv = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  HOME: homedir(),
  LANG: 'en_US.UTF-8',
  TERM: 'dumb',
  TMPDIR: process.env.TMPDIR,
});
export type ProcessStatus = 'exited' | 'timed_out' | 'output_limit' | 'unavailable' | 'interrupted';
export type ProcessResult = {
  status: ProcessStatus;
  stdout: string;
  stderr: string;
  code: number | null;
};
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
    maxOutput?: number;
  } = {},
) {
  return new Promise<ProcessResult>((resolve, reject) => {
    options.signal?.throwIfAborted();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? safeEnv(),
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    let status: ProcessStatus | undefined,
      finished = false;
    const kill = () => stopTree(child);
    const limited = (reason: ProcessStatus) => {
      if (status) return;
      status = reason;
      kill();
    };
    const timer = setTimeout(() => limited('timed_out'), options.timeout ?? 60000);
    options.signal?.addEventListener('abort', kill, { once: true });
    child.stdout.on('data', (b) => {
      stdout += b;
      if (stdout.length > (options.maxOutput ?? 250000)) {
        stdout = stdout.slice(0, options.maxOutput ?? 250000);
        limited('output_limit');
      }
    });
    child.stderr.on('data', (b) => {
      stderr = (stderr + b).slice(-24000);
    });
    child.on('error', finish);
    child.on('close', (code) => finish(null, code));
    function finish(err: Error | null, code: number | null = null) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', kill);
      if (options.signal?.aborted) reject(new Error('Task cancelled'));
      else
        resolve({
          status: err ? 'unavailable' : (status ?? (code === null ? 'interrupted' : 'exited')),
          stdout,
          stderr: err ? `${stderr}\n${err.message}`.trim() : stderr,
          // A limit can race with a successful exit. It is still incomplete execution evidence.
          code: status || err ? null : code,
        });
    }
    child.stdin.on('error', () => {}); // A child may exit before consuming its input.
    child.stdin.end(options.input);
  });
}
