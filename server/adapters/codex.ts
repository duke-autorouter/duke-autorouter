import { codexToolContent } from '../tool-results.js';
import { exhaustedCapacity } from '../capacity.js';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { safeEnv, stopTree } from '../process.js';
import { definitions } from '../tools.js';
import { Blocked, Unavailable, type Worker, type WorkerContext, type Health } from '../types.js';
import type { ThreadStartParams } from '../generated/codex/v2/ThreadStartParams.js';
import { brand } from '../../shared/brand.js';
import { codexExecutable } from '../runtime.js';
import { workerEffort } from '../effort.js';

export class CodexRPC extends EventEmitter {
  child: ChildProcessWithoutNullStreams;
  seq = 0;
  pending = new Map<
    number,
    {
      resolve: (x: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  closed = false;
  constructor(public stateDir: string) {
    super();
    const profile = join(stateDir, 'codex'),
      cwd = join(stateDir, 'runtime');
    mkdirSync(profile, { recursive: true, mode: 0o700 });
    mkdirSync(cwd, { recursive: true, mode: 0o700 });
    this.child = spawn(
      process.execPath,
      [
        codexExecutable(),
        'app-server',
        '-c',
        'forced_login_method="chatgpt"',
        '-c',
        'project_doc_max_bytes=0',
        '-c',
        'features.shell_tool=false',
        '-c',
        'features.unified_exec=false',
        '-c',
        'features.shell_snapshot=false',
        '-c',
        'features.multi_agent=false',
        '-c',
        'web_search="disabled"',
      ],
      {
        cwd,
        env: { ...safeEnv(), CODEX_HOME: profile },
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      try {
        const m = JSON.parse(line);
        if (m.id !== undefined && !m.method) {
          const p = this.pending.get(m.id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(m.id);
            m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
          }
        } else this.emit('message', m);
      } catch {
        /* non-protocol diagnostic */
      }
    });
    this.child.stderr.on('data', () => {});
    this.child.on('error', (e) => this.fail(e));
    this.child.on('exit', () => this.fail(new Error('Codex app-server disconnected.')));
  }
  fail(e: Error) {
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
    this.emit('closed', e);
  }
  send(m: unknown) {
    if (!this.closed) this.child.stdin.write(JSON.stringify(m) + '\n');
  }
  request(method: string, params: any = {}, timeoutMs = 45000) {
    if (this.closed) return Promise.reject(new Error('Codex is disconnected'));
    const id = ++this.seq;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  async init() {
    await this.request('initialize', {
      clientInfo: { name: 'duke_router', title: brand.name, version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
  }
  close() {
    stopTree(this.child);
    this.fail(new Error('Codex connection closed'));
  }
}
export class CodexWorker implements Worker {
  constructor(
    public stateDir: string,
    private connect = (dir: string) => new CodexRPC(dir),
  ) {}
  async subscription() {
    const rpc = this.connect(this.stateDir);
    const timer = setTimeout(() => rpc.close(), 12_000);
    try {
      await rpc.init();
      const account = await rpc.request('account/read', { refreshToken: false }, 3000);
      if (account.account?.type !== 'chatgpt')
        return { ready: false, quota: undefined, quotaCheckedAt: undefined, usageError: undefined };
      const quota = await rpc.request('account/rateLimits/read', {}, 8000);
      return { quota, quotaCheckedAt: new Date().toISOString(), usageError: undefined };
    } finally {
      clearTimeout(timer);
      rpc.close();
    }
  }
  async health(signal?: AbortSignal): Promise<Health> {
    signal?.throwIfAborted();
    const rpc = this.connect(this.stateDir);
    const abort = () => rpc.close();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await rpc.init();
      const a = await rpc.request('account/read', { refreshToken: false });
      const models = await rpc.request('model/list', { limit: 100 });
      let quota;
      try {
        quota = await rpc.request('account/rateLimits/read');
      } catch {}
      signal?.throwIfAborted();
      return {
        provider: 'codex',
        ready: a.account?.type === 'chatgpt',
        message:
          a.account?.type === 'chatgpt'
            ? 'Subscription connected'
            : 'Sign in with ChatGPT in this app profile.',
        models: models.data ?? [],
        quota,
        version: '0.155.0',
      };
    } catch (e) {
      signal?.throwIfAborted();
      return { provider: 'codex', ready: false, message: (e as Error).message };
    } finally {
      signal?.removeEventListener('abort', abort);
      rpc.close();
    }
  }
  async run(ctx: WorkerContext) {
    ctx.signal.throwIfAborted();
    const effort = workerEffort(ctx.model);
    const rpc = this.connect(this.stateDir);
    let output = '';
    const abort = () => rpc.close();
    let startedWork = false;
    const readAllowance = async (phase: 'before' | 'after') => {
      let quota;
      try {
        quota = await rpc.request('account/rateLimits/read', {}, 3000);
        ctx.emit('quota', quota);
      } catch {
        /* Usage telemetry must not turn completed work into a failed task. */
      }
      ctx.emit('allowance_snapshot', { phase, quota, at: new Date().toISOString() });
      return quota;
    };
    ctx.signal.addEventListener('abort', abort, { once: true });
    try {
      await rpc.init();
      const account = await rpc.request('account/read', { refreshToken: false });
      if (account.account?.type !== 'chatgpt')
        throw new Unavailable('Codex subscription login is required.');
      const capacity = await readAllowance('before');
      if (exhaustedCapacity(capacity, ctx.model.model))
        throw new Error('Codex subscription capacity is exhausted.');
      const cfg: ThreadStartParams = {
        model: ctx.model.model,
        cwd: join(this.stateDir, 'runtime'),
        approvalPolicy: 'never',
        sandbox: 'read-only',
        environments: [],
        baseInstructions: ctx.prompt,
        developerInstructions: [
          'DUKE supplies client-handled tools for this task. They run in the DUKE host, which enforces the selected project and approvals.',
          'The native Codex environment is read-only and has no execution environment attached. This restricts direct native access; it does not disable the supplied DUKE tools.',
          'When write_file or create_artifact is supplied, use it to create and edit the requested project files. These tools are the authorized file-editing interface and keep backups. Do not substitute an in-memory example for a requested file.',
          'Use the supplied shell tool for tests. Its default is read-only; request writable=true only when needed, and wait for DUKE approval. A denied tool operation remains denied.',
          'Use workspace-relative paths with DUKE tools. Never access files through native tools or attempt to bypass a tool rejection.',
          'Image handling in the Codex exec bridge: preview_file and browser screenshot results are strings containing JSON metadata followed by image data URLs, not MCP objects with a content array. To view them inside exec, keep the result r and run: for (const url of String(r).match(/data:image\\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+/g) ?? []) image(url). Print metadata only after removing those data URLs. Do not print base64 or call the tool repeatedly just to display an image. A successful image tool call alone is not visual inspection.',
        ].join('\n'),
        config: {
          project_doc_max_bytes: 0,
          'features.shell_tool': false,
          'features.unified_exec': false,
          'features.multi_agent': false,
          web_search: 'disabled',
        },
        dynamicTools: definitions(ctx.task.required).map((t) => ({
          type: 'function',
          name: t.name,
          description: t.description,
          inputSchema: t.parameters as any,
        })),
      };
      // Start a clean native thread for each stage. Checkpoints carry cross-stage evidence;
      // this prevents stale dynamic-tool permissions from a previous task being restored.
      const start = await rpc.request('thread/start', cfg);
      const threadId = start.thread.id;
      ctx.session(threadId);
      const completed = new Promise<void>((resolveDone, reject) => {
        const timer = setTimeout(
          () => reject(new Blocked('Worker reached the 30-minute stage limit.')),
          30 * 60 * 1000,
        );
        const done = (error?: Error) => {
          clearTimeout(timer);
          rpc.off('message', handler);
          rpc.off('closed', closed);
          error ? reject(error) : resolveDone();
        };
        const closed = (e: Error) => done(e);
        const handler = async (m: any) => {
          const p = m.params ?? {};
          if (m.method === 'item/tool/call' && m.id !== undefined) {
            try {
              const value = await ctx.tool(p.tool, p.arguments);
              rpc.send({
                id: m.id,
                result: {
                  success: true,
                  contentItems: codexToolContent(value),
                },
              });
            } catch (e) {
              rpc.send({
                id: m.id,
                result: {
                  success: false,
                  contentItems: [{ type: 'inputText', text: (e as Error).message }],
                },
              });
              if (e instanceof Blocked) done(e);
            }
            return;
          }
          if (m.id !== undefined && m.method) {
            rpc.send({
              id: m.id,
              error: {
                code: -32601,
                message: 'Native tool access is disabled. Use the task-scoped router tools.',
              },
            });
            return;
          }
          if (p.threadId && p.threadId !== threadId) return;
          if (m.method === 'item/agentMessage/delta') {
            output += p.delta;
            ctx.emit('message_delta', { text: p.delta });
          }
          if (m.method === 'thread/tokenUsage/updated')
            ctx.emit('subscription_usage', p.tokenUsage);
          if (m.method === 'turn/completed') {
            if (p.turn?.status === 'completed') done();
            else done(new Error(p.turn?.error?.message ?? 'Codex turn did not complete'));
          }
        };
        rpc.on('message', handler);
        rpc.on('closed', closed);
      });
      // Attach a rejection observer before starting the turn to avoid unhandled failures.
      completed.catch(() => {});
      startedWork = true;
      await rpc.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: ctx.task.prompt, text_elements: [] }],
        environments: [],
        ...(effort === undefined ? {} : { effort }),
      });
      await completed;
      return output;
    } finally {
      if (startedWork && !rpc.closed && !ctx.signal.aborted) await readAllowance('after');
      ctx.signal.removeEventListener('abort', abort);
      rpc.close();
    }
  }
}
