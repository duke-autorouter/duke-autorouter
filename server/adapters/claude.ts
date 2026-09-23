import { claudeToolContent } from '../tool-results.js';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { safeEnv } from '../process.js';
import { claudeExecutable } from '../runtime.js';
import { workerEffort } from '../effort.js';
import {
  claudeSubscriptionConnected,
  claudeConnection,
  claudeConnectionMessage,
} from '../claude-auth.js';
import { readClaudeQuota } from '../claude-usage.js';
import { definitions, toolSchemas } from '../tools.js';
import { Blocked, Unavailable, type Health, type Worker, type WorkerContext } from '../types.js';
export class ClaudeWorker implements Worker {
  constructor(
    public stateDir: string,
    private authenticating = () => false,
  ) {}
  options() {
    const cwd = join(this.stateDir, 'runtime'),
      profile = join(this.stateDir, 'claude');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(profile, { recursive: true, mode: 0o700 });
    return {
      cwd,
      pathToClaudeCodeExecutable: claudeExecutable(),
      env: { ...safeEnv(), CLAUDE_CONFIG_DIR: profile },
      tools: [] as string[],
      settingSources: [],
      strictMcpConfig: true,
    };
  }
  async subscription() {
    if (this.authenticating()) return { ready: false, quota: undefined, quotaCheckedAt: undefined };
    const connection = await claudeConnection(this.stateDir);
    if (!connection.signedIn || connection.billing !== 'subscription')
      return {
        ready: false,
        connection,
        message: claudeConnectionMessage(connection),
        quota: undefined,
        quotaCheckedAt: undefined,
        usageError: undefined,
      };
    // An empty prompt plus control requests initializes the SDK without a
    // model turn. Never iterate this query or submit a user message here.
    const q = query({ prompt: '', options: { ...this.options(), maxTurns: 1 } });
    try {
      const quota = await readClaudeQuota(q);
      return { quota, quotaCheckedAt: new Date().toISOString(), usageError: undefined };
    } finally {
      q.close();
    }
  }
  async health(signal?: AbortSignal): Promise<Health> {
    signal?.throwIfAborted();
    if (this.authenticating())
      return {
        provider: 'claude',
        ready: false,
        message: 'Sign-in in progress. Finish in the browser.',
      };
    let q: ReturnType<typeof query> | undefined;
    const controller = new AbortController();
    const abort = () => {
      controller.abort();
      q?.close();
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const connection = await claudeConnection(this.stateDir, signal);
      signal?.throwIfAborted();
      const ready = connection.signedIn && connection.billing === 'subscription';
      // Keep pre-sign-in model discovery. This is a control request only;
      // the query is never iterated and cannot submit a model prompt.
      q = query({
        prompt: '',
        options: {
          ...this.options(),
          maxTurns: 1,
          abortController: controller,
        },
      });
      const models = await q.supportedModels();
      signal?.throwIfAborted();
      return {
        provider: 'claude',
        ready,
        message: claudeConnectionMessage(connection),
        connection,
        models,
        quota: { state: 'unknown' },
        version: 'SDK 0.3.280',
      };
    } catch (e) {
      signal?.throwIfAborted();
      return {
        provider: 'claude',
        ready: false,
        message: (e as Error).message,
      };
    } finally {
      signal?.removeEventListener('abort', abort);
      q?.close();
    }
  }
  async run(ctx: WorkerContext) {
    ctx.signal.throwIfAborted();
    if (this.authenticating())
      throw new Unavailable('Finish Claude sign-in before starting a task.');
    const effort = workerEffort(ctx.model) as
      'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
    if (!(await claudeSubscriptionConnected(this.stateDir, ctx.signal)))
      throw new Unavailable(
        'Claude subscription authentication is required; API credentials are not used.',
      );
    ctx.signal.throwIfAborted();
    const controller = new AbortController();
    let toolFailure: Error | undefined;
    const defs = definitions(ctx.task.required),
      allowed = new Set(defs.map((d) => 'mcp__workspace__' + d.name));
    const server = createSdkMcpServer({
      name: 'workspace',
      version: '0.1.0',
      tools: defs.map((d) =>
        tool(d.name, d.description, (toolSchemas as any)[d.name].shape, async (args: any) => {
          try {
            return {
              content: claudeToolContent(await ctx.tool(d.name, args)),
            };
          } catch (e) {
            if (e instanceof Blocked) {
              toolFailure = e;
              controller.abort();
            }
            return {
              isError: true,
              content: [{ type: 'text' as const, text: (e as Error).message }],
            };
          }
        }),
      ),
    });
    const cancel = () => controller.abort();
    ctx.signal.addEventListener('abort', cancel, { once: true });
    ctx.signal.throwIfAborted();
    const q = query({
      prompt: ctx.task.prompt,
      options: {
        ...this.options(),
        abortController: controller,
        model: ctx.model.model,
        ...(effort === undefined ? {} : { effort }),
        maxTurns: 24,
        systemPrompt: ctx.prompt,
        mcpServers: { workspace: server },
        allowedTools: [...allowed],
        permissionMode: 'default',
        hooks: {
          PreToolUse: [
            {
              hooks: [
                async (input: any) => ({
                  hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: allowed.has(input.tool_name) ? 'allow' : 'deny',
                    permissionDecisionReason: 'Only task-scoped tools are available.',
                  },
                }),
              ],
            },
          ],
        },
        canUseTool: async (name, input) =>
          allowed.has(name)
            ? { behavior: 'allow', updatedInput: input }
            : { behavior: 'deny', message: 'Tool is outside the task scope.' },
      },
    });
    try {
      let result = '';
      for await (const m of q) {
        ctx.signal.throwIfAborted();
        if (m.type === 'system' && m.subtype === 'init') ctx.session(m.session_id);
        if (m.type === 'assistant') {
          for (const c of m.message.content)
            if (c.type === 'text') ctx.emit('message', { text: c.text });
        }
        if (m.type === 'result') {
          ctx.emit('subscription_usage', {
            usage: m.usage,
            modelUsage: m.modelUsage,
            estimatedApiEquivalent: m.total_cost_usd,
            accounting:
              'Subscription runtime; actual account charges are not reported by this event.',
          });
          if (m.subtype === 'success') result = m.result;
          else throw new Error(m.errors?.join('; ') ?? m.subtype);
        }
      }
      if (toolFailure) throw toolFailure;
      return result;
    } catch (e) {
      throw toolFailure ?? e;
    } finally {
      ctx.signal.removeEventListener('abort', cancel);
      q.close();
    }
  }
}
