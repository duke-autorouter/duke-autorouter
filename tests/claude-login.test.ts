import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { spawn } from 'node:child_process';
import { ClaudeLogin } from '../server/claude-login.js';
import { openClaudeSetup } from '../server/claude-setup.js';
import { runProcess } from '../server/process.js';
import { createApp } from '../server/app.js';
import { ClaudeWorker } from '../server/adapters/claude.js';
import type { Health, Worker } from '../server/types.js';
import type { ClaudeLoginMethod } from '../shared/claude-connection.js';

function fakeLauncher() {
  const calls: { args: string[]; child: any }[] = [];
  const launch = ((command: string, args: string[], options: any) => {
    assert.match(command, /claude$/);
    assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    calls.push({ args, child });
    queueMicrotask(() => {
      child.stdout.write('https://claude.ai.bad.example/login\n');
      child.stdout.write('https://claude.ai/oauth/authorize?fixture=true\n');
    });
    return child;
  }) as unknown as typeof spawn;
  return { calls, launch };
}

test('Claude login keeps the official default and exposes Console and SSO without implementing OAuth', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-auth-'));
  try {
    for (const [method, flags] of [
      ['subscription', []],
      ['console', ['--console']],
      ['sso', ['--sso']],
    ] as [ClaudeLoginMethod, string[]][]) {
      const fake = fakeLauncher();
      let completed = 0;
      const login = new ClaudeLogin(
        root,
        async () => {
          completed++;
        },
        fake.launch,
      );
      const result = await login.start(method);
      assert.deepEqual(fake.calls[0].args, ['auth', 'login', ...flags]);
      assert.deepEqual(result, {
        authUrl: 'https://claude.ai/oauth/authorize?fixture=true',
        pending: true,
        method,
      });
      assert.equal(login.pending, true);
      fake.calls[0].child.emit('exit', 0);
      assert.equal(login.pending, false);
      assert.equal(completed, 1);
      login.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Superseded and cancelled Claude sign-ins cannot publish stale completion or hang their caller', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-auth-cancel-'));
  const fake = fakeLauncher();
  let completed = 0;
  const login = new ClaudeLogin(
    root,
    async () => {
      completed++;
    },
    fake.launch,
  );
  try {
    await login.start();
    const old = fake.calls[0].child;
    await login.start('console');
    old.emit('exit', 0);
    assert.equal(completed, 0);
    assert.equal(login.pending, true);
    login.close();
    fake.calls[1].child.emit('exit', 0);
    assert.equal(completed, 0);
    assert.equal(login.pending, false);
    const pending = login.start();
    login.close();
    assert.equal((await pending).pending, false);
    assert.equal(fake.calls.length, 2);
  } finally {
    login.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Claude worker cannot start a query while account sign-in is pending', async () => {
  const worker = new ClaudeWorker('/unused', () => true);
  assert.equal((await worker.health()).ready, false);
  assert.equal((await worker.subscription()).ready, false);
  await assert.rejects(
    worker.run({ signal: new AbortController().signal } as any),
    /Finish Claude sign-in/,
  );
});

test('Claude account endpoints preserve routing on cancel and reject active-task changes and invalid methods', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-auth-http-'));
  const fake = fakeLauncher();
  let connection: Health = {
    provider: 'claude',
    ready: true,
    message: 'Subscription connected',
    connection: { signedIn: true, billing: 'subscription' },
  };
  let setupOpens = 0,
    inference = 0;
  const worker: Worker = {
    run: async () => {
      inference++;
      throw new Error('No inference in account tests');
    },
    health: async () => structuredClone(connection),
  };
  const r = await createApp({
    stateDir: root,
    serveUI: false,
    workers: { claude: worker, codex: worker, openrouter: worker },
    claudeLoginLaunch: fake.launch,
    claudeSetupOpen: async () => {
      setupOpens++;
      return { opened: true };
    },
  });
  try {
    const session = await r.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { token: r.launchToken },
    });
    const headers = { cookie: session.cookies.map((c) => `${c.name}=${c.value}`).join(';') };
    const post = (url: string, payload: any = {}) =>
      r.app.inject({ method: 'POST', url, headers, payload });
    assert.equal((await post('/api/login/claude', { method: 'shell' })).statusCode, 400);
    assert.equal(
      (await post('/api/login/claude', { method: 'console', token: 'invented' })).statusCode,
      400,
    );
    r.engine.active.set('synthetic-task', new AbortController());
    for (const url of ['/api/login/claude', '/api/claude/setup'])
      assert.equal((await post(url)).statusCode, 409);
    assert.equal(fake.calls.length, 0);
    r.engine.active.clear();
    assert.equal((await post('/api/login/claude')).statusCode, 200);
    assert.equal(r.store.get<Health>('health', 'claude')!.ready, false);
    assert.equal((await post('/api/login/claude/cancel')).statusCode, 200);
    assert.equal(r.store.get<Health>('health', 'claude')!.ready, true);
    await post('/api/login/claude', { method: 'console' });
    connection = {
      provider: 'claude',
      ready: false,
      message: 'Claude Console connected · separately billed',
      connection: { signedIn: true, billing: 'api' },
    };
    const changed = new Promise<void>((resolve) => r.store.changes.once('change', () => resolve()));
    fake.calls.at(-1)!.child.emit('exit', 0);
    await changed;
    assert.deepEqual(r.store.get<Health>('health', 'claude')?.connection, connection.connection);
    assert.equal(r.store.get<Health>('health', 'claude')?.ready, false);
    assert.equal((await post('/api/claude/setup')).statusCode, 200);
    assert.equal(setupOpens, 1);
    assert.equal(inference, 0);
    assert.equal(r.store.spending().length, 0);
  } finally {
    await r.app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'Full setup launches an unmodified interactive runtime with quoted paths and no inherited API secret',
  { skip: process.platform !== 'darwin' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "duke setup ' $-"));
    const executable = join(root, "official runtime ' $.sh");
    await writeFile(
      executable,
      '#!/bin/zsh\nprint -r -- "$CLAUDE_CONFIG_DIR"\nprint -r -- "$#"\nprint -r -- "${DUKE_TEST_SECRET:-absent}"\n',
      { mode: 0o700 },
    );
    let result = '';
    try {
      await openClaudeSetup(
        root,
        async (command, args) => {
          assert.equal(command, '/usr/bin/open');
          assert.deepEqual(args.slice(0, 2), ['-a', 'Terminal']);
          const script = args[2];
          assert.equal((await stat(script)).mode & 0o777, 0o700);
          const source = await readFile(script, 'utf8');
          assert.ok(!source.includes('--claudeai'));
          const execution = await runProcess('/bin/zsh', [script], {
            env: { ...process.env, DUKE_TEST_SECRET: 'invented-sensitive-value' },
          });
          assert.equal(execution.code, 0, execution.stderr);
          result = execution.stdout;
          await assert.rejects(stat(script), { code: 'ENOENT' });
          return { stdout: '', stderr: '', code: 0 };
        },
        executable,
      );
      assert.ok(result.endsWith(`${join(root, 'claude')}\n0\nabsent\n`));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
