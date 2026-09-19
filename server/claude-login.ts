import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { claudeExecutable } from './runtime.js';
import { safeEnv, stopTree, runProcess } from './process.js';
import type { ClaudeLoginMethod, ClaudeLoginState } from '../shared/claude-connection.js';

// The provider's bundled CLI owns OAuth, the browser callback and credential persistence.
export class ClaudeLogin {
  private child?: ChildProcessWithoutNullStreams;
  private timer?: NodeJS.Timeout;
  private url?: string;
  private cancelStart?: () => void;
  private generation = 0;
  get pending() {
    return !!this.child;
  }
  constructor(
    private stateDir: string,
    private completed: (success: boolean) => Promise<void>,
    private launch: typeof spawn = spawn,
  ) {}
  async start(method: ClaudeLoginMethod = 'subscription'): Promise<ClaudeLoginState> {
    this.close();
    const generation = this.generation;
    const profile = join(this.stateDir, 'claude');
    await mkdir(profile, { recursive: true, mode: 0o700 });
    if (generation !== this.generation) return { pending: false, method };
    const flags = method === 'console' ? ['--console'] : method === 'sso' ? ['--sso'] : [];
    const child = this.launch(claudeExecutable(), ['auth', 'login', ...flags], {
      cwd: this.stateDir,
      env: { ...safeEnv(), CLAUDE_CONFIG_DIR: profile },
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.url = undefined;
    let output = '';
    let resolveStart!: (value: ClaudeLoginState) => void;
    const started = new Promise<ClaudeLoginState>((resolve) => {
      resolveStart = resolve;
    });
    const early = setTimeout(
      () => resolveStart({ authUrl: this.url, pending: true, method }),
      4000,
    );
    this.cancelStart = () => {
      clearTimeout(early);
      resolveStart({ pending: false, method });
    };
    const inspect = (bytes: Buffer) => {
      if (this.child !== child) return;
      output = (output + bytes.toString('utf8')).slice(-16000);
      for (const match of output.matchAll(/https:\/\/[^\s\x1b]+/g)) {
        try {
          const url = new URL(match[0]);
          if (
            ['claude.ai', 'platform.claude.com', 'console.anthropic.com'].includes(url.hostname)
          ) {
            this.url = url.href;
            resolveStart({ authUrl: this.url, pending: true, method });
          }
        } catch {}
      }
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    const finish = (success: boolean) => {
      clearTimeout(early);
      if (this.child !== child) return;
      this.child = undefined;
      this.cancelStart = undefined;
      clearTimeout(this.timer);
      resolveStart({ pending: false, method });
      void this.completed(success).catch(() => {});
    };
    child.once('error', () => finish(false));
    child.once('exit', (code) => finish(code === 0));
    this.timer = setTimeout(() => {
      if (this.child === child) stopTree(child);
    }, 180000);
    return started;
  }
  close() {
    this.generation++;
    this.cancelStart?.();
    this.cancelStart = undefined;
    clearTimeout(this.timer);
    const child = this.child;
    this.child = undefined;
    if (child) stopTree(child);
  }
  async logout() {
    this.close();
    const result = await runProcess(claudeExecutable(), ['auth', 'logout'], {
      cwd: this.stateDir,
      env: { ...safeEnv(), CLAUDE_CONFIG_DIR: join(this.stateDir, 'claude') },
    });
    if (result.code !== 0) throw new Error('Claude could not sign out. Try again.');
  }
}
