import Fastify from 'fastify';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { z } from 'zod';
import { Approvals, fingerprint } from './approval.js';
import { Engine } from './engine.js';
import { scoped } from './paths.js';
import { Store } from './store.js';
import { Blocked, TaskInput, type Event, type Task, type Workspace } from './types.js';

type PairingChallenge = {
  id: string;
  codeHash: string;
  allowedWorkspaceIds: string[];
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

type RemoteDevice = {
  id: string;
  name: string;
  credentialHash: string;
  allowedWorkspaceIds: string[];
  createdAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
};

type RemoteCommand = {
  id: string;
  deviceId: string;
  requestHash: string;
  operation: string;
  state: 'pending' | 'completed' | 'failed';
  statusCode?: number;
  response?: unknown;
  createdAt: string;
  completedAt?: string;
};

const now = () => new Date().toISOString();
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const same = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export class RemoteUnauthorized extends Error {}

export class RemoteAccess {
  constructor(public store: Store) {}

  createChallenge(allowedWorkspaceIds: string[], lifetimeMs = 5 * 60_000) {
    const ids = [...new Set(allowedWorkspaceIds)];
    if (!ids.length) throw new Blocked('Choose at least one project for this device.');
    for (const id of ids)
      if (!this.store.get<Workspace>('workspace', id)) throw new Blocked('Project not found.');
    const code = randomBytes(32).toString('base64url');
    const challenge: PairingChallenge = {
      id: randomUUID(),
      codeHash: sha256(code),
      allowedWorkspaceIds: ids,
      createdAt: now(),
      expiresAt: new Date(Date.now() + lifetimeMs).toISOString(),
    };
    this.store.put('remote_pairing_challenge', challenge.id, challenge);
    return { code, expiresAt: challenge.expiresAt, allowedWorkspaceIds: ids };
  }

  exchange(code: string, name: string) {
    const codeHash = sha256(code);
    const challenge = this.store
      .list<PairingChallenge>('remote_pairing_challenge')
      .find(
        (item) =>
          !item.usedAt && Date.parse(item.expiresAt) > Date.now() && same(item.codeHash, codeHash),
      );
    if (!challenge)
      throw new RemoteUnauthorized('Pairing code is invalid, expired or already used.');
    const secret = randomBytes(32).toString('base64url');
    const device: RemoteDevice = {
      id: randomUUID(),
      name: name.trim(),
      credentialHash: sha256(secret),
      allowedWorkspaceIds: challenge.allowedWorkspaceIds,
      createdAt: now(),
    };
    this.store.put('remote_pairing_challenge', challenge.id, {
      ...challenge,
      usedAt: now(),
    });
    this.store.put('remote_device', device.id, device);
    return {
      device: this.publicDevice(device),
      credential: `${device.id}.${secret}`,
    };
  }

  authenticate(authorization?: string) {
    const value = /^Bearer\s+(.+)$/i.exec(authorization ?? '')?.[1] ?? '';
    const dot = value.indexOf('.');
    if (dot < 1) throw new RemoteUnauthorized('Pair this device with the Mac.');
    const id = value.slice(0, dot);
    const secret = value.slice(dot + 1);
    const device = this.store.get<RemoteDevice>('remote_device', id);
    if (!device || device.revokedAt || !same(device.credentialHash, sha256(secret)))
      throw new RemoteUnauthorized('This device is not authorized.');
    const updated = { ...device, lastSeenAt: now() };
    this.store.put('remote_device', id, updated);
    return updated;
  }

  devices() {
    return this.store
      .list<RemoteDevice>('remote_device')
      .map((device) => this.publicDevice(device));
  }

  revoke(id: string) {
    const device = this.store.get<RemoteDevice>('remote_device', id);
    if (!device) throw new Blocked('Device not found.');
    const revoked = { ...device, revokedAt: device.revokedAt ?? now() };
    this.store.put('remote_device', id, revoked);
    return this.publicDevice(revoked);
  }

  publicDevice(device: RemoteDevice) {
    const { credentialHash: _, ...safe } = device;
    return safe;
  }
}

const publicTask = (task: Task) => {
  const { modelOverride: _, evaluation: __, route: ___, ...safe } = task;
  return safe;
};

const publicEventKinds = new Set([
  'created',
  'resumed',
  'completed',
  'cancelled',
  'blocked',
  'interrupted',
  'approval_decided',
]);
const publicEvents = (events: Event[]) =>
  events.filter((event) => publicEventKinds.has(event.kind));

function ensureWorkspace(device: RemoteDevice, workspaceId: string) {
  if (!device.allowedWorkspaceIds.includes(workspaceId))
    throw new RemoteUnauthorized('This device cannot access that project.');
}

function ensureTask(store: Store, device: RemoteDevice, id: string) {
  const task = store.task(id);
  ensureWorkspace(device, task.workspaceId);
  return task;
}

function errorStatus(error: unknown) {
  return error instanceof z.ZodError
    ? 400
    : error instanceof RemoteUnauthorized
      ? 401
      : error instanceof Blocked
        ? 409
        : 500;
}

export function createRemoteApp(options: {
  store: Store;
  engine: Engine;
  approvals: Approvals;
  access: RemoteAccess;
  allowInsecureForTests?: boolean;
}) {
  const { store, engine, approvals, access } = options;
  const app = Fastify({
    logger: false,
    bodyLimit: 256_000,
    forceCloseConnections: true,
  });

  app.addHook('onRequest', async (request, reply) => {
    const forwarded = String(request.headers['x-forwarded-proto'] ?? '')
      .split(',')[0]
      .trim();
    if (!options.allowInsecureForTests && request.protocol !== 'https' && forwarded !== 'https')
      return reply.code(426).send({ error: 'The iPhone connection requires private HTTPS.' });
  });
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    return payload;
  });
  app.setErrorHandler((error, _request, reply) => {
    reply.code(errorStatus(error)).send({
      error:
        error instanceof z.ZodError
          ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
          : error instanceof Error
            ? error.message
            : 'Request failed.',
    });
  });

  app.post('/remote/v1/pair', async (request) => {
    const body = z
      .object({
        code: z.string().min(32).max(128),
        deviceName: z.string().trim().min(1).max(80),
      })
      .strict()
      .parse(request.body);
    return access.exchange(body.code, body.deviceName);
  });

  app.addHook('preHandler', async (request) => {
    if (request.url === '/remote/v1/pair') return;
    (request as any).remoteDevice = access.authenticate(request.headers.authorization);
  });

  const deviceFor = (request: any) => request.remoteDevice as RemoteDevice;
  const command = async (
    request: any,
    reply: any,
    operation: string,
    body: unknown,
    run: () => Promise<unknown> | unknown,
  ) => {
    const device = deviceFor(request);
    const key = z.string().uuid().parse(request.headers['idempotency-key']);
    const id = `${device.id}:${key}`;
    const requestHash = fingerprint(operation, body);
    const existing = store.get<RemoteCommand>('remote_command', id);
    if (existing) {
      if (!same(existing.requestHash, requestHash))
        return reply.code(409).send({
          error: 'This command ID was already used for another request.',
        });
      if (existing.state === 'pending') {
        reply.header('Retry-After', '2');
        return reply.code(409).send({
          error: 'The Mac began this command but did not save a result. Refresh before retrying.',
        });
      }
      return reply.code(existing.statusCode ?? 200).send(existing.response);
    }
    const receipt: RemoteCommand = {
      id,
      deviceId: device.id,
      requestHash,
      operation,
      state: 'pending',
      createdAt: now(),
    };
    store.put('remote_command', id, receipt);
    try {
      const response = await run();
      store.put('remote_command', id, {
        ...receipt,
        state: 'completed',
        statusCode: 200,
        response,
        completedAt: now(),
      } satisfies RemoteCommand);
      return reply.send(response);
    } catch (error) {
      const statusCode = errorStatus(error);
      const response = {
        error: error instanceof Error ? error.message : 'Request failed.',
      };
      store.put('remote_command', id, {
        ...receipt,
        state: 'failed',
        statusCode,
        response,
        completedAt: now(),
      } satisfies RemoteCommand);
      return reply.code(statusCode).send(response);
    }
  };

  app.get('/remote/v1/state', async (request) => {
    const device = deviceFor(request);
    const tasks = store
      .tasks()
      .filter((task) => device.allowedWorkspaceIds.includes(task.workspaceId));
    const taskIds = new Set(tasks.map((task) => task.id));
    return {
      device: access.publicDevice(device),
      workspaces: device.allowedWorkspaceIds
        .map((id) => store.get<Workspace>('workspace', id))
        .filter(Boolean)
        .map((workspace) => ({ id: workspace!.id, name: workspace!.name })),
      tasks: tasks.map(publicTask),
      approvals: store
        .approvals()
        .filter((approval) => approval.status === 'pending' && taskIds.has(approval.taskId))
        .map(({ id, taskId, operation, args, hash, status, createdAt }) => ({
          id,
          taskId,
          operation,
          arguments: JSON.stringify(args, null, 2),
          hash,
          status,
          createdAt,
        })),
      artifacts: store
        .list<any>('artifact')
        .filter((artifact) => taskIds.has(artifact.taskId))
        .map(({ id, taskId, path, sha256 }) => ({ id, taskId, path, sha256 })),
      serverTime: now(),
    };
  });

  app.get('/remote/v1/tasks/:id', async (request) => {
    const task = ensureTask(store, deviceFor(request), (request.params as { id: string }).id);
    return {
      task: publicTask(task),
      events: publicEvents(store.events(task.id)),
      artifacts: store
        .list<any>('artifact')
        .filter((artifact) => artifact.taskId === task.id)
        .map(({ id, taskId, path, sha256 }) => ({ id, taskId, path, sha256 })),
    };
  });

  app.post('/remote/v1/tasks', async (request, reply) => {
    const device = deviceFor(request);
    const input = TaskInput.omit({ modelOverride: true, evaluation: true })
      .strict()
      .parse(request.body);
    ensureWorkspace(device, input.workspaceId);
    return command(request, reply, 'create_task', input, async () => ({
      task: publicTask(await engine.create({ ...input, evaluation: false })),
    }));
  });

  app.post('/remote/v1/tasks/:id/follow-ups', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const task = ensureTask(store, deviceFor(request), id);
    const body = z
      .object({ text: z.string().trim().min(1).max(8000) })
      .strict()
      .parse(request.body);
    return command(request, reply, `follow_up:${id}`, body, () => {
      engine.resume(task.id, false, body.text);
      return { ok: true, task: publicTask(store.task(task.id)) };
    });
  });

  app.post('/remote/v1/tasks/:id/cancel', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const task = ensureTask(store, deviceFor(request), id);
    return command(request, reply, `cancel_task:${id}`, {}, () => {
      engine.cancel(task.id);
      return {
        ok: true,
        task: publicTask(store.task(task.id)),
        note: 'Stopping work does not undo an external effect that already completed.',
      };
    });
  });

  app.post('/remote/v1/approvals/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const approval = store.approvals().find((item) => item.id === id);
    if (!approval) throw new Blocked('Approval not found.');
    ensureTask(store, deviceFor(request), approval.taskId);
    const body = z.object({ hash: z.string(), allow: z.boolean() }).strict().parse(request.body);
    return command(request, reply, `approval:${id}`, body, async () => {
      approvals.decide(id, body.hash, body.allow);
      await new Promise((resolve) => setImmediate(resolve));
      return { ok: true, task: publicTask(store.task(approval.taskId)) };
    });
  });

  app.get('/remote/v1/artifacts/:id', async (request, reply) => {
    const artifact = store.get<any>('artifact', (request.params as { id: string }).id);
    if (!artifact) throw new Blocked('Artifact not found.');
    const task = ensureTask(store, deviceFor(request), artifact.taskId);
    const workspace = store.get<Workspace>('workspace', task.workspaceId)!;
    const path = await scoped(workspace.path, artifact.path);
    const data = await readFile(path);
    if (!same(sha256(data), artifact.sha256))
      throw new Blocked('Artifact changed since this version was recorded.');
    const types: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.md': 'text/plain; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    reply.type(types[extname(path).toLowerCase()] ?? 'application/octet-stream');
    reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    reply.header(
      'Content-Disposition',
      `attachment; filename="${basename(path).replace(/["\r\n]/g, '')}"`,
    );
    return reply.send(data);
  });

  return app;
}
