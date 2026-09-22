import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { createRemoteApp } from '../server/remote.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'duke-remote-'));
  const first = join(root, 'first');
  const second = join(root, 'second');
  await mkdir(first);
  await mkdir(second);
  const core = await createApp({
    stateDir: join(root, 'state'),
    serveUI: false,
  });
  core.engine.stopped = true;
  core.store.put('workspace', 'w1', {
    id: 'w1',
    name: 'Allowed project',
    path: first,
    providers: ['codex'],
    instructions: [],
  });
  core.store.put('workspace', 'w2', {
    id: 'w2',
    name: 'Private project',
    path: second,
    providers: ['codex'],
    instructions: [],
  });
  const remote = createRemoteApp({
    store: core.store,
    engine: core.engine,
    approvals: core.approvals,
    access: core.remoteAccess,
    allowInsecureForTests: true,
  });
  return {
    ...core,
    remote,
    root,
    first,
    second,
    close: async () => {
      await remote.close();
      await core.app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function pair(f: Awaited<ReturnType<typeof fixture>>) {
  const challenge = f.remoteAccess.createChallenge(['w1']);
  const response = await f.remote.inject({
    method: 'POST',
    url: '/remote/v1/pair',
    payload: { code: challenge.code, deviceName: 'Test iPhone' },
  });
  assert.equal(response.statusCode, 200);
  return response.json() as { credential: string; device: { id: string } };
}

test('pairing is one-use and expiring, and revoked devices lose access', async () => {
  const f = await fixture();
  try {
    const expired = f.remoteAccess.createChallenge(['w1'], -1);
    assert.equal(
      (
        await f.remote.inject({
          method: 'POST',
          url: '/remote/v1/pair',
          payload: { code: expired.code, deviceName: 'Late phone' },
        })
      ).statusCode,
      401,
    );
    const challenge = f.remoteAccess.createChallenge(['w1']);
    const first = await f.remote.inject({
      method: 'POST',
      url: '/remote/v1/pair',
      payload: { code: challenge.code, deviceName: 'Joshua’s iPhone' },
    });
    assert.equal(first.statusCode, 200);
    assert.equal(
      (
        await f.remote.inject({
          method: 'POST',
          url: '/remote/v1/pair',
          payload: { code: challenge.code, deviceName: 'Replay' },
        })
      ).statusCode,
      401,
    );
    const { credential, device } = first.json();
    const headers = { authorization: `Bearer ${credential}` };
    assert.equal(
      (
        await f.remote.inject({
          method: 'GET',
          url: '/remote/v1/state',
          headers,
        })
      ).statusCode,
      200,
    );
    f.remoteAccess.revoke(device.id);
    assert.equal(
      (
        await f.remote.inject({
          method: 'GET',
          url: '/remote/v1/state',
          headers,
        })
      ).statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});

test('production remote routes require HTTPS before pairing or authentication', async () => {
  const f = await fixture();
  const secureOnly = createRemoteApp({
    store: f.store,
    engine: f.engine,
    approvals: f.approvals,
    access: f.remoteAccess,
    requireTailscaleIdentity: true,
  });
  try {
    const challenge = f.remoteAccess.createChallenge(['w1']);
    assert.equal(
      (
        await secureOnly.inject({
          method: 'POST',
          url: '/remote/v1/pair',
          payload: { code: challenge.code, deviceName: 'Plaintext phone' },
        })
      ).statusCode,
      426,
    );
    assert.equal(
      (
        await secureOnly.inject({
          method: 'POST',
          url: '/remote/v1/pair',
          headers: { 'x-forwarded-proto': 'https' },
          payload: { code: challenge.code, deviceName: 'Missing identity' },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await secureOnly.inject({
          method: 'POST',
          url: '/remote/v1/pair',
          headers: {
            'x-forwarded-proto': 'https',
            'tailscale-user-login': 'owner@example.com',
          },
          payload: { code: challenge.code, deviceName: 'Private HTTPS phone' },
        })
      ).statusCode,
      200,
    );
    const paired = f.remoteAccess.createChallenge(['w1']);
    const response = await secureOnly.inject({
      method: 'POST',
      url: '/remote/v1/pair',
      headers: { 'tailscale-user-login': 'owner@example.com' },
      payload: { code: paired.code, deviceName: 'Bound phone' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(
      (
        await secureOnly.inject({
          method: 'GET',
          url: '/remote/v1/state',
          headers: {
            authorization: `Bearer ${response.json().credential}`,
            'tailscale-user-login': 'someone-else@example.com',
          },
        })
      ).statusCode,
      401,
    );
    assert.equal('tailscaleLogin' in response.json().device, false);
  } finally {
    await secureOnly.close();
    await f.close();
  }
});

test('task commands are project-scoped and persisted idempotently', async () => {
  const f = await fixture();
  try {
    const { credential } = await pair(f);
    const headers = {
      authorization: `Bearer ${credential}`,
      'idempotency-key': randomUUID(),
    };
    const payload = {
      workspaceId: 'w1',
      prompt: 'Create a short synthetic note.',
    };
    const first = await f.remote.inject({
      method: 'POST',
      url: '/remote/v1/tasks',
      headers,
      payload,
    });
    assert.equal(first.statusCode, 200);
    const taskId = first.json().task.id;
    const duplicate = await f.remote.inject({
      method: 'POST',
      url: '/remote/v1/tasks',
      headers,
      payload,
    });
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json().task.id, taskId);
    assert.equal(f.store.tasks().filter((task) => task.id === taskId).length, 1);

    const conflict = await f.remote.inject({
      method: 'POST',
      url: '/remote/v1/tasks',
      headers,
      payload: {
        ...payload,
        prompt: 'Different command with the same identifier.',
      },
    });
    assert.equal(conflict.statusCode, 409);

    assert.equal(
      (
        await f.remote.inject({
          method: 'POST',
          url: '/remote/v1/tasks',
          headers: { ...headers, 'idempotency-key': randomUUID() },
          payload: { ...payload, modelOverride: 'premium-model' },
        })
      ).statusCode,
      400,
    );

    assert.equal(
      (
        await f.remote.inject({
          method: 'POST',
          url: '/remote/v1/tasks',
          headers: { ...headers, 'idempotency-key': randomUUID() },
          payload: { ...payload, effortOverride: 'ultra' },
        })
      ).statusCode,
      400,
    );

    const deniedProject = await f.remote.inject({
      method: 'POST',
      url: '/remote/v1/tasks',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { workspaceId: 'w2', prompt: 'Do not allow this.' },
    });
    assert.equal(deniedProject.statusCode, 401);

    const state = await f.remote.inject({
      method: 'GET',
      url: '/remote/v1/state',
      headers: { authorization: `Bearer ${credential}` },
    });
    assert.deepEqual(
      state.json().workspaces.map((workspace: any) => workspace.id),
      ['w1'],
    );
    assert.equal(state.json().tasks.length, 1);
    f.store.event(taskId, 'route', { modelId: 'internal-model', effort: 'high' });
    const detail = await f.remote.inject({
      method: 'GET',
      url: `/remote/v1/tasks/${taskId}`,
      headers: { authorization: `Bearer ${credential}` },
    });
    assert.equal(detail.statusCode, 200);
    assert.equal('route' in detail.json().task, false);
    assert.equal('modelOverride' in detail.json().task, false);
    assert.equal('effortOverride' in detail.json().task, false);
    assert.equal(
      detail.json().events.some((event: any) => event.kind === 'route'),
      false,
    );

    const cancelKey = randomUUID();
    const cancel = () =>
      f.remote.inject({
        method: 'POST',
        url: `/remote/v1/tasks/${taskId}/cancel`,
        headers: {
          authorization: `Bearer ${credential}`,
          'idempotency-key': cancelKey,
        },
        payload: {},
      });
    assert.equal((await cancel()).json().task.status, 'cancelled');
    assert.equal((await cancel()).json().task.status, 'cancelled');

    const followUpKey = randomUUID();
    const followUp = () =>
      f.remote.inject({
        method: 'POST',
        url: `/remote/v1/tasks/${taskId}/follow-ups`,
        headers: {
          authorization: `Bearer ${credential}`,
          'idempotency-key': followUpKey,
        },
        payload: { text: 'Add one plain closing sentence.' },
      });
    assert.equal((await followUp()).json().task.status, 'queued');
    assert.equal((await followUp()).json().task.status, 'queued');
    assert.equal(f.store.events(taskId).filter((event) => event.kind === 'resumed').length, 1);
    assert.equal(f.store.task(taskId).revision, 1);
    assert.match(f.store.task(taskId).prompt, /User follow-up: Add one plain closing sentence\./);
  } finally {
    await f.close();
  }
});

test('remote approvals retain stale-hash checks and duplicate decisions are safe', async () => {
  const f = await fixture();
  try {
    const { credential } = await pair(f);
    const created = await f.engine.create({
      workspaceId: 'w1',
      prompt: 'Wait for approval.',
    });
    f.store.update(created.id, { status: 'running' });
    const controller = new AbortController();
    const waiting = f.approvals.request(
      created.id,
      'Write file',
      { path: 'approved.txt', sha256: 'before' },
      controller.signal,
    );
    await new Promise((resolve) => setImmediate(resolve));
    const approval = f.store.approvals().find((item) => item.taskId === created.id)!;
    const baseHeaders = { authorization: `Bearer ${credential}` };
    const state = await f.remote.inject({
      method: 'GET',
      url: '/remote/v1/state',
      headers: baseHeaders,
    });
    assert.match(state.json().approvals[0].arguments, /approved\.txt/);
    assert.equal('args' in state.json().approvals[0], false);
    const stale = await f.remote.inject({
      method: 'POST',
      url: `/remote/v1/approvals/${approval.id}`,
      headers: { ...baseHeaders, 'idempotency-key': randomUUID() },
      payload: { hash: 'changed-operation', allow: true },
    });
    assert.equal(stale.statusCode, 409);
    assert.equal(f.store.approvals().find((item) => item.id === approval.id)!.status, 'pending');

    const key = randomUUID();
    const decide = () =>
      f.remote.inject({
        method: 'POST',
        url: `/remote/v1/approvals/${approval.id}`,
        headers: { ...baseHeaders, 'idempotency-key': key },
        payload: { hash: approval.hash, allow: true },
      });
    assert.equal((await decide()).statusCode, 200);
    await waiting;
    assert.equal((await decide()).statusCode, 200);
    assert.equal(f.store.approvals().find((item) => item.id === approval.id)!.status, 'approved');
  } finally {
    await f.close();
  }
});

test('remote authorization rejects credentials, tasks, and approvals outside the paired project', async () => {
  const f = await fixture();
  try {
    const { credential } = await pair(f);
    assert.equal(
      (
        await f.remote.inject({
          method: 'GET',
          url: '/remote/v1/state',
          headers: { authorization: 'Bearer unknown.invalid' },
        })
      ).statusCode,
      401,
    );

    const privateTask = await f.engine.create({
      workspaceId: 'w2',
      prompt: 'Private approval.',
    });
    f.store.update(privateTask.id, { status: 'running' });
    const controller = new AbortController();
    const waiting = f.approvals.request(
      privateTask.id,
      'Private write',
      { path: 'private.txt' },
      controller.signal,
    );
    await new Promise((resolve) => setImmediate(resolve));
    const approval = f.store.approvals().find((item) => item.taskId === privateTask.id)!;
    const response = await f.remote.inject({
      method: 'POST',
      url: `/remote/v1/approvals/${approval.id}`,
      headers: {
        authorization: `Bearer ${credential}`,
        'idempotency-key': randomUUID(),
      },
      payload: { hash: approval.hash, allow: true },
    });
    assert.equal(response.statusCode, 401);
    assert.equal(f.store.approvals().find((item) => item.id === approval.id)!.status, 'pending');
    controller.abort();
    await assert.rejects(waiting);
  } finally {
    await f.close();
  }
});

test('reconnected state preserves revisions, recovery attempts, and incomplete checks', async () => {
  const f = await fixture();
  try {
    const { credential } = await pair(f);
    const task = await f.engine.create({
      workspaceId: 'w1',
      prompt: 'Create a synthetic result.',
    });
    f.store.update(task.id, {
      status: 'completed',
      revision: 2,
      attempt: 2,
      result: 'Saved result',
      review: {
        status: 'unverified',
        summary: 'One saved-output check could not finish.',
        checks: [
          {
            name: 'Saved file review',
            status: 'unverified',
            detail: 'The current evidence was incomplete.',
          },
        ],
        limitations: ['Retry checks on the Mac or follow up with more context.'],
        at: new Date().toISOString(),
        policy: 'test-policy',
      },
      route: {
        kind: 'coding',
        modelId: 'internal-model',
        provider: 'codex',
        model: 'Internal Model',
        reason: 'Internal recovery route',
        fallbacks: [],
        effort: 'medium',
        assessment: { kind: 'coding', difficulty: 'standard', source: 'rules' },
        selectionSource: 'rules',
      },
      effortOverride: 'medium',
    });

    const readState = () =>
      f.remote.inject({
        method: 'GET',
        url: '/remote/v1/state',
        headers: { authorization: `Bearer ${credential}` },
      });
    const first = (await readState()).json();
    const reconnected = (await readState()).json();
    for (const state of [first, reconnected]) {
      const visible = state.tasks.find((item: any) => item.id === task.id);
      assert.equal(visible.revision, 2);
      assert.equal(visible.attempt, 2);
      assert.equal(visible.review.status, 'unverified');
      assert.equal(visible.review.checks[0].status, 'unverified');
      assert.equal('route' in visible, false);
      assert.equal('effortOverride' in visible, false);
    }
  } finally {
    await f.close();
  }
});

test('artifact downloads enforce paired project and saved content hash', async () => {
  const f = await fixture();
  try {
    const { credential } = await pair(f);
    const allowed = await f.engine.create({
      workspaceId: 'w1',
      prompt: 'Save allowed file.',
    });
    const privateTask = await f.engine.create({
      workspaceId: 'w2',
      prompt: 'Save private file.',
    });
    const bytes = Buffer.from('saved deliverable');
    await writeFile(join(f.first, 'deliverable.txt'), bytes);
    await writeFile(join(f.second, 'private.txt'), bytes);
    f.store.put('artifact', 'allowed', {
      id: 'allowed',
      taskId: allowed.id,
      path: 'deliverable.txt',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    f.store.put('artifact', 'private', {
      id: 'private',
      taskId: privateTask.id,
      path: 'private.txt',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    const headers = { authorization: `Bearer ${credential}` };
    const download = await f.remote.inject({
      method: 'GET',
      url: '/remote/v1/artifacts/allowed',
      headers,
    });
    assert.equal(download.statusCode, 200);
    assert.equal(download.rawPayload.toString(), 'saved deliverable');
    assert.equal(
      (
        await f.remote.inject({
          method: 'GET',
          url: '/remote/v1/artifacts/private',
          headers,
        })
      ).statusCode,
      401,
    );
    await writeFile(join(f.first, 'deliverable.txt'), 'changed');
    assert.equal(
      (
        await f.remote.inject({
          method: 'GET',
          url: '/remote/v1/artifacts/allowed',
          headers,
        })
      ).statusCode,
      409,
    );
  } finally {
    await f.close();
  }
});
