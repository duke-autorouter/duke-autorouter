import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, realpath, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { z } from 'zod';
import { Store } from './store.js';
import { Secrets } from './secrets.js';
import { Approvals } from './approval.js';
import { ToolService } from './tools.js';
import { Engine } from './engine.js';
import { CodexWorker, CodexRPC } from './adapters/codex.js';
import { ClaudeWorker } from './adapters/claude.js';
import { OpenRouterWorker } from './adapters/openrouter.js';
import { Jev } from './adapters/jev.js';
import {
  WorkspaceInput,
  ModelInput,
  Blocked,
  type Workspace,
  type Model,
  type Worker,
  type Provider,
  type Health,
} from './types.js';
import { scoped, within } from './paths.js';
import { acquireInstanceLock } from './lock.js';
import { appRoot, resource } from './runtime.js';
import { ClaudeLogin } from './claude-login.js';
import { openClaudeSetup } from './claude-setup.js';
import { runProcess } from './process.js';
import { recordCatalog, modelsWithFeedback, preserveModelOverrides } from './model-profiles.js';
import { snapshotReceipt } from './setup-import.js';
import type { SetupSnapshot } from '../shared/setup.js';
import { initializeRoster, saveRoster, savePreferences } from './roster.js';
import { ROSTER_LIMIT } from '../shared/routing.js';
import { summarizeUsage } from './usage.js';
import { summarizeSubscriptionUsage } from './subscription-usage.js';
import { SubscriptionRefresh } from './subscription-refresh.js';
import { previewFile } from './previews.js';
import {
  defaultUsagePreferences,
  usageDisplays,
  type UsagePreferences,
} from '../shared/usage-display.js';
import { RemoteAccess } from './remote.js';

export async function createApp(
  options: {
    stateDir?: string;
    workers?: Record<Provider, Worker>;
    serveUI?: boolean;
    claudeLoginLaunch?: ConstructorParameters<typeof ClaudeLogin>[2];
    claudeSetupOpen?: typeof openClaudeSetup;
  } = {},
) {
  const requestedStateDir = resolve(
    options.stateDir ?? process.env.ROUTER_DATA_DIR ?? resource('.router'),
  );
  await mkdir(requestedStateDir, { recursive: true, mode: 0o700 });
  const stateDir = await realpath(requestedStateDir);
  const releaseLock = await acquireInstanceLock(stateDir);
  const store = new Store(join(stateDir, 'router.sqlite'));
  initializeRoster(store);
  store.recover();
  const remoteAccess = new RemoteAccess(store),
    secrets = new Secrets(),
    approvals = new Approvals(store),
    tools = new ToolService(store, approvals, stateDir);
  const codex = new CodexWorker(stateDir),
    claude = new ClaudeWorker(stateDir, () => claudeLogin.pending),
    openrouter = new OpenRouterWorker(store, secrets);
  const workers = options.workers ?? { codex, claude, openrouter };
  const subscriptionRefresh = new SubscriptionRefresh(store, workers);
  const engine = new Engine(store, tools, workers, new Jev(store, secrets));
  const app = Fastify({ logger: false, bodyLimit: 1_000_000, forceCloseConnections: true });
  await app.register(cookie);
  const launchToken = randomBytes(32).toString('base64url'),
    sessionToken = randomBytes(32).toString('base64url');
  const matches = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
      return reply.code(403).send({ error: 'Loopback host required' });
    if (req.headers.origin && req.headers.origin !== `http://${host}`)
      return reply.code(403).send({ error: 'Origin rejected' });
    if (
      req.url.startsWith('/api/') &&
      req.url !== '/api/session' &&
      !matches(req.cookies.duke_session ?? '', sessionToken)
    )
      return reply.code(401).send({ error: 'Open this app using its local launch link.' });
  });
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.setErrorHandler((error, req, reply) => {
    const code = error instanceof z.ZodError ? 400 : error instanceof Blocked ? 409 : 500;
    reply.code(code).send({
      error:
        error instanceof z.ZodError
          ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : error instanceof Error
            ? error.message
            : 'Request failed',
    });
  });
  app.post('/api/session', async (req, reply) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    if (!matches(token, launchToken))
      return reply.code(401).send({ error: 'Invalid launch token' });
    reply.setCookie('duke_session', sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
    });
    return { ok: true };
  });
  app.get('/api/state', async () => ({
    tasks: store.tasks(),
    workspaces: store.list('workspace'),
    setups: tools.setups.summaries(),
    models: modelsWithFeedback(store),
    roster: store.get('roster', 'main'),
    settings: store.settings(),
    preferences: {
      ...defaultUsagePreferences,
      ...store.get<UsagePreferences>('preferences', 'main'),
    },
    spend: store.spend(),
    approvals: store.approvals().filter((a) => a.status === 'pending'),
    health: store.list('health'),
    artifacts: store.list('artifact'),
    remoteDevices: remoteAccess.devices(),
    remoteEnabled: process.env.DUKE_REMOTE_ENABLE === '1',
    version: '0.1.0',
    desktop: !!process.env.DUKE_DESKTOP_EXECUTABLE,
    claudeSetupAvailable: process.platform === 'darwin',
    claudeLoginPending: claudeLogin.pending,
  }));
  app.get('/api/events', async (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = () => reply.raw.write(`data: ${JSON.stringify({ changed: true })}\n\n`);
    const onEvent = (event: any) => reply.raw.write(`data: ${JSON.stringify({ event })}\n\n`);
    store.changes.on('change', send);
    store.changes.on('event', onEvent);
    const timer = setInterval(() => reply.raw.write(': heartbeat\n\n'), 20000);
    req.raw.on('close', () => {
      clearInterval(timer);
      store.changes.off('change', send);
      store.changes.off('event', onEvent);
    });
    send();
  });
  app.post('/api/workspaces', async (req) => {
    const input = WorkspaceInput.parse(req.body),
      path = await realpath(input.path);
    if (!(await stat(path)).isDirectory()) throw new Blocked('Workspace must be a directory.');
    if (path === '/' || path === process.env.HOME || within(path, stateDir))
      throw new Blocked(
        'Choose a specific project folder that does not contain the router’s private state.',
      );
    const w: Workspace = { ...input, path, id: randomUUID(), instructions: [] };
    store.put('workspace', w.id, w);
    return w;
  });
  app.put('/api/workspaces/:id', async (req) => {
    const { id } = req.params as { id: string };
    const existing = store.get<Workspace>('workspace', id);
    if (!existing) throw new Blocked('Project not found.');
    const input = WorkspaceInput.omit({ path: true }).parse(req.body);
    const workspace = { ...existing, ...input };
    store.put('workspace', id, workspace);
    return workspace;
  });
  app.post('/api/system/choose-folder', async (req) => {
    const { purpose } = z
      .object({ purpose: z.enum(['project', 'setup']).default('project') })
      .parse(req.body ?? {});
    const helper = process.env.DUKE_DESKTOP_EXECUTABLE;
    if (!helper) throw new Blocked('The folder picker is available in the installed Mac app.');
    const result = await runProcess(
      helper,
      ['--choose-folder', ...(purpose === 'setup' ? ['--setup-source'] : [])],
      { timeout: 180000 },
    );
    if (result.code !== 0) throw new Blocked('Folder selection did not complete.');
    return { path: result.stdout.trim() };
  });
  app.post('/api/workspaces/:id/import-preview', async (req) => {
    const { id } = req.params as any,
      w = store.get<Workspace>('workspace', id);
    if (!w) throw new Blocked('Workspace not found');
    const { path } = z.object({ path: z.string() }).parse(req.body);
    const p = await realpath(path);
    if (!/\.(md|txt)$/i.test(p) || (await stat(p)).size > 64000)
      throw new Blocked('Choose a Markdown or text instruction file under 64 KB.');
    const content = await readFile(p, 'utf8');
    return { source: p, content, sha256: createHash('sha256').update(content).digest('hex') };
  });
  app.post('/api/workspaces/:id/import', async (req) => {
    const { id } = req.params as any,
      w = store.get<Workspace>('workspace', id);
    if (!w) throw new Blocked('Workspace not found');
    const value = z
      .object({ source: z.string(), content: z.string().max(64000), sha256: z.string() })
      .parse(req.body);
    if (createHash('sha256').update(value.content).digest('hex') !== value.sha256)
      throw new Blocked('Preview changed; review again.');
    w.instructions = [...w.instructions.filter((i) => i.source !== value.source), value];
    store.put('workspace', id, w);
    return w;
  });
  app.post('/api/setups/preview', async (req) => {
    const input = z
      .object({ path: z.string().min(1), replaceId: z.string().optional() })
      .parse(req.body);
    return tools.setups.preview(input.path, input.replaceId);
  });
  app.post('/api/setups/bundle-preview', { bodyLimit: 2_000_000 }, async (req) =>
    tools.setups.bundlePreview(req.body),
  );
  app.post('/api/setups', async (req) => tools.setups.commit(req.body));
  app.get('/api/setups/:id', async (req) => {
    const setup = tools.setups.get((req.params as { id: string }).id);
    return { ...setup, files: await tools.setups.current(setup) };
  });
  app.delete('/api/setups/:id', async (req) =>
    tools.setups.remove((req.params as { id: string }).id),
  );
  app.put('/api/setups/:id/file', async (req) =>
    tools.setups.edit((req.params as { id: string }).id, req.body),
  );
  app.post('/api/setups/:id/export', async (req) => {
    const { selected } = z.object({ selected: z.array(z.string()).max(200) }).parse(req.body);
    return tools.setups.export((req.params as { id: string }).id, selected);
  });
  app.post('/api/routes/preview', async (req) => engine.preview(req.body));
  app.post('/api/tasks', async (req) => engine.create(req.body));
  app.get('/api/tasks/:id', async (req) => {
    const { id } = req.params as any;
    const events = store.events(id);
    return {
      task: {
        ...store.task(id),
        usage: summarizeUsage(events),
        subscriptionUsage: summarizeSubscriptionUsage(events),
      },
      events,
      artifacts: store.list<any>('artifact').filter((a) => a.taskId === id),
      feedback: store.get('feedback', id),
      setupContext: snapshotReceipt(store.get<SetupSnapshot>('setup_snapshot', id)),
    };
  });
  app.post('/api/tasks/:id/feedback', async (req) => {
    const task = store.task((req.params as { id: string }).id);
    if (!task.route || !['completed', 'blocked', 'cancelled', 'interrupted'].includes(task.status))
      throw new Blocked('Review a finished task before rating its result.');
    const { rating } = z.object({ rating: z.enum(['worked', 'needs_work']) }).parse(req.body);
    const feedback = {
      taskId: task.id,
      modelId: task.route.modelId,
      kind: task.route.kind,
      difficulty: task.route.assessment.difficulty,
      rating,
      at: new Date().toISOString(),
    };
    store.put('feedback', task.id, feedback);
    return feedback;
  });
  app.post('/api/tasks/:id/cancel', async (req) => {
    engine.cancel((req.params as any).id);
    return { ok: true };
  });
  app.post('/api/tasks/:id/resume', async (req) => {
    const b = z
      .object({
        reconciled: z.boolean().default(false),
        followup: z.string().max(8000).default(''),
      })
      .parse(req.body ?? {});
    engine.resume((req.params as any).id, b.reconciled, b.followup);
    return { ok: true };
  });
  app.post('/api/tasks/:id/review', async (req) => {
    engine.retryReview((req.params as { id: string }).id);
    return { ok: true };
  });
  app.post('/api/remote/pairing-challenges', async (req) => {
    const input = z
      .object({ workspaceIds: z.array(z.string()).min(1).max(50) })
      .strict()
      .parse(req.body);
    return remoteAccess.createChallenge(input.workspaceIds);
  });
  app.get('/api/remote/devices', async () => remoteAccess.devices());
  app.post('/api/remote/devices/:id/revoke', async (req) => remoteAccess.revoke((req.params as { id: string }).id));
  app.post('/api/approvals/:id', async (req) => {
    const b = z.object({ hash: z.string(), allow: z.boolean() }).parse(req.body);
    approvals.decide((req.params as any).id, b.hash, b.allow);
    return { ok: true };
  });
  app.put('/api/roster', async (req) => saveRoster(store, req.body));
  app.put('/api/routing-preferences', async (req) => savePreferences(store, req.body));
  app.put('/api/models/:id', async (req) => {
    const parsed = ModelInput.parse(req.body);
    const m = preserveModelOverrides(parsed, store.get<Model>('model', parsed.id));
    if (m.id !== (req.params as any).id) throw new Blocked('Model ID mismatch');
    if (
      m.enabled &&
      store.list<Model>('model').filter((v) => v.enabled && v.id !== m.id).length >= ROSTER_LIMIT
    )
      throw new Blocked(`Choose at most ${ROSTER_LIMIT} models for your roster.`);
    if (m.evaluated && !m.evidence.trim())
      throw new Blocked('Add supporting evidence before marking a model as evaluated.');
    store.put('model', m.id, m);
    return m;
  });
  app.put('/api/preferences', async (req) => {
    const preferences = z
      .object({ usageDisplay: z.enum(usageDisplays) })
      .strict()
      .parse(req.body);
    store.put('preferences', 'main', preferences);
    return preferences;
  });
  app.post('/api/usage/refresh', async () => {
    await subscriptionRefresh.refresh();
    return store.list('health');
  });
  app.put('/api/settings', async (req) => {
    const s = z
      .object({
        dailyLimit: z.number().min(0).max(100),
        monthlyLimit: z.number().min(0).max(1000),
        qualityFloor: z.number().min(0).max(1),
        jevMode: z.enum(['off', 'observe', 'assist']),
        jevModel: z.string().min(1),
        jevFallbackModel: z.string().max(300).optional(),
        jevInputPrice: z.number().nonnegative(),
        jevValidated: z.boolean(),
      })
      .parse(req.body);
    if (
      s.jevFallbackModel &&
      s.jevFallbackModel !== store.settings().jevFallbackModel &&
      !store.get<Model>('model', s.jevFallbackModel)?.enabled
    )
      throw new Blocked('Choose a Jev fallback model from your selected roster.');
    store.put('settings', 'main', { ...store.settings(), ...s });
    return store.settings();
  });
  app.post('/api/keys/:provider', async (req) => {
    const p = z.enum(['openrouter', 'jev']).parse((req.params as any).provider),
      b = z.object({ key: z.string() }).parse(req.body);
    await secrets.set(p, b.key);
    if (p === 'openrouter') {
      const health = await openrouter.health();
      store.put('health', p, { ...health, checkedAt: new Date().toISOString() });
      if (health.ready) recordCatalog(store, p, await openrouter.models());
    } else
      store.put('health', p, {
        provider: p,
        ready: true,
        message:
          'Key saved. Jev assesses tasks and chooses models automatically; live validation pending.',
      });
    return { ok: true };
  });
  app.post('/api/health', async () => {
    const results = await Promise.allSettled([
      workers.codex.health ? workers.codex.health() : codex.health(),
      readClaudeHealth(),
      workers.openrouter.health ? workers.openrouter.health() : openrouter.health(),
    ]);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const value =
        r.status === 'fulfilled'
          ? r.value
          : {
              provider: ['codex', 'claude', 'openrouter'][i],
              ready: false,
              message: 'Runtime check failed',
            };
      store.put('health', value.provider, { ...value, checkedAt: new Date().toISOString() });
      if (value.ready && 'models' in value && value.models)
        recordCatalog(store, value.provider as Provider, value.models);
    }
    store.put('health', 'jev', {
      provider: 'jev',
      ready: !!(await secrets.get('jev')),
      message:
        'Task difficulty and model selection. Key saved; a live routing check is still needed.',
    });
    return store.list('health');
  });
  let login: CodexRPC | undefined;
  let claudeAuthRevision = 0;
  async function readClaudeHealth(): Promise<Health> {
    if (claudeLogin.pending)
      return {
        provider: 'claude',
        ready: false,
        message: 'Sign-in in progress. Finish in the browser.',
      };
    return workers.claude.health ? workers.claude.health() : claude.health();
  }
  const claudeLogin = new ClaudeLogin(
    stateDir,
    async (success) => {
      const revision = claudeAuthRevision;
      subscriptionRefresh.invalidate();
      const value = await readClaudeHealth();
      if (revision !== claudeAuthRevision) return;
      if (!success) value.message = 'Sign-in did not complete. ' + value.message;
      store.put('health', 'claude', { ...value, checkedAt: new Date().toISOString() });
      if (value.ready && 'models' in value && value.models)
        recordCatalog(store, 'claude', value.models);
    },
    options.claudeLoginLaunch,
  );
  app.post('/api/login/codex', async () => {
    subscriptionRefresh.invalidate();
    login?.close();
    login = new CodexRPC(stateDir);
    await login.init();
    const currentLogin = login;
    login.on('message', (m: any) => {
      if (login === currentLogin && m.method === 'account/login/completed') {
        subscriptionRefresh.invalidate();
        store.put('health', 'codex', {
          provider: 'codex',
          ready: !!m.params.success,
          message: m.params.success ? 'Subscription connected' : 'Login did not complete',
        });
        if (m.params.success)
          void codex
            .health()
            .then((value) => {
              if (login !== currentLogin) return;
              store.put('health', 'codex', { ...value, checkedAt: new Date().toISOString() });
              if (value.ready && value.models) recordCatalog(store, 'codex', value.models);
            })
            .catch(() => {});
      }
    });
    return login.request('account/login/start', { type: 'chatgpt' });
  });
  app.post('/api/login/claude', async (req) => {
    const { method } = z
      .object({
        method: z.enum(['subscription', 'console', 'sso']).default('subscription'),
      })
      .strict()
      .parse(req.body ?? {});
    if (engine.active.size)
      throw new Blocked('Stop the active task before changing the Claude account.');
    claudeAuthRevision++;
    subscriptionRefresh.invalidate();
    store.put('health', 'claude', {
      provider: 'claude',
      ready: false,
      message: 'Sign-in in progress. Finish in the browser.',
      checkedAt: new Date().toISOString(),
    });
    return claudeLogin.start(method);
  });
  app.post('/api/login/claude/cancel', async () => {
    claudeAuthRevision++;
    claudeLogin.close();
    subscriptionRefresh.invalidate();
    const value = await readClaudeHealth();
    store.put('health', 'claude', { ...value, checkedAt: new Date().toISOString() });
    return { ok: true };
  });
  app.post('/api/claude/setup', async () => {
    if (engine.active.size)
      throw new Blocked('Stop the active task before changing the Claude account.');
    claudeAuthRevision++;
    claudeLogin.close();
    subscriptionRefresh.invalidate();
    try {
      const result = await (options.claudeSetupOpen ?? openClaudeSetup)(stateDir);
      store.put('health', 'claude', {
        provider: 'claude',
        ready: false,
        message: 'Finish Claude Code setup, then choose Check connections.',
        checkedAt: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      const value = await readClaudeHealth();
      store.put('health', 'claude', { ...value, checkedAt: new Date().toISOString() });
      throw error;
    }
  });
  app.post('/api/logout/:provider', async (req) => {
    const provider = z.enum(['codex', 'claude']).parse((req.params as any).provider);
    if (engine.active.size)
      throw new Blocked('Stop the active task before disconnecting an account.');
    subscriptionRefresh.invalidate();
    if (provider === 'claude') {
      claudeAuthRevision++;
      await claudeLogin.logout();
    } else {
      login?.close();
      login = new CodexRPC(stateDir);
      await login.init();
      await login.request('account/logout');
      login.close();
      login = undefined;
    }
    store.put('health', provider, {
      provider,
      ready: false,
      message: 'Disconnected',
      checkedAt: new Date().toISOString(),
    });
    return { ok: true };
  });
  app.post('/api/discover/:provider', async (req) => {
    const p = z.enum(['codex', 'claude', 'openrouter']).parse((req.params as any).provider);
    let list: any[];
    if (p === 'openrouter') list = await openrouter.models();
    else list = (await (p === 'claude' ? readClaudeHealth() : codex.health())).models ?? [];
    return recordCatalog(store, p, list);
  });
  app.get('/api/spending', async () => store.spending());
  app.post('/api/spending/:id/reconcile', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const input = z
      .object({
        actualUSD: z.number().finite().min(0).max(1_000_000),
        reservedMicros: z.number().int().nonnegative(),
        note: z.string().trim().min(5).max(2000),
      })
      .parse(req.body);
    const row = store.spending().find((r) => r.id === id);
    if (row && engine.active.has(String(row.taskId)))
      throw new Blocked('Wait for this task to stop before reconciling its charge.');
    return store.reconcileSpending(id, input);
  });
  app.get('/api/models/:id/endpoints', async (req) => {
    const m = store.get<Model>('model', (req.params as any).id);
    if (!m || m.provider !== 'openrouter') throw new Blocked('Select an OpenRouter model');
    return openrouter.endpoints(m.model);
  });
  app.get('/api/artifacts/:id/preview', async (req, reply) => {
    const input = z.object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      sheet: z.string().min(1).max(31).optional(),
      range: z.string().min(1).max(32).optional(),
    }).strict().parse(req.query);
    const artifact = store.get<any>('artifact', (req.params as any).id);
    if (!artifact) throw new Blocked('Artifact not found');
    const task = store.task(artifact.taskId);
    const workspace = store.get<Workspace>('workspace', task.workspaceId)!;
    const result = await previewFile(workspace.path, artifact.path, input.page,
      AbortSignal.timeout(30000), { sheet: input.sheet, range: input.range });
    if (result.sha256 !== artifact.sha256)
      throw new Blocked('Artifact changed since this version was recorded.');
    reply.header('Cache-Control', 'no-store');
    return result;
  });
  app.get('/api/artifacts/:id', async (req, reply) => {
    const a = store.get<any>('artifact', (req.params as any).id);
    if (!a) throw new Blocked('Artifact not found');
    const task = store.task(a.taskId),
      w = store.get<Workspace>('workspace', task.workspaceId)!,
      p = await scoped(w.path, a.path);
    const data = await readFile(p);
    if (createHash('sha256').update(data).digest('hex') !== a.sha256)
      throw new Blocked('Artifact changed since this version was recorded.');
    const types: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.md': 'text/plain; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    reply.type(types[extname(p)] ?? 'application/octet-stream');
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    );
    reply.header(
      'Content-Disposition',
      `${(req.query as any).download ? 'attachment' : 'inline'}; filename="${basename(p).replace(/["\r\n]/g, '')}"`,
    );
    return reply.send(data);
  });
  if (options.serveUI !== false) {
    if (existsSync(resource('dist/index.html'))) {
      await app.register(fastifyStatic, { root: resource('dist'), wildcard: false });
      app.setNotFoundHandler((req, reply) =>
        req.url.startsWith('/api/')
          ? reply.code(404).send({ error: 'Not found' })
          : reply.sendFile('index.html'),
      );
    } else {
      if (process.env.NODE_ENV === 'production')
        throw new Error(
          'The application is missing its built interface. Rebuild or reinstall DUKE.',
        );
      const { createServer } = await import('vite');
      const vite = await createServer({
        root: appRoot,
        server: {
          middlewareMode: true,
          fs: {
            strict: true,
            deny: [
              stateDir + '/**',
              '**/.router/**',
              '**/.env*',
              '**/.git/**',
              '**/outputs/**',
              '**/work/**',
            ],
          },
        },
        appType: 'spa',
      });
      app.addHook('onRequest', async (req, reply) => {
        if (req.url.startsWith('/api/')) return;
        await new Promise<void>((res) => {
          vite.middlewares(req.raw, reply.raw, () => res());
          reply.raw.once('finish', res);
        });
        if (reply.raw.writableEnded) reply.hijack();
      });
      app.addHook('onClose', async () => vite.close());
    }
  }
  app.addHook('onClose', async () => {
    login?.close();
    claudeLogin.close();
    await engine.shutdown();
    store.close();
    await releaseLock();
  });
  return { app, store, engine, tools, approvals, remoteAccess, launchToken, stateDir };
}
