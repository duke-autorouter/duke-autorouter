import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
test('local API requires authentication and same-origin requests; setup round trip', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-http-')),
    r = await createApp({ stateDir: join(root, 'state'), serveUI: false });
  await mkdir(join(root, 'workspace'));
  try {
    const request = (method: any, url: string, payload?: any, extra: any = {}) =>
      r.app.inject({ method, url, payload, headers: { host: '127.0.0.1:4318', ...extra } });
    assert.equal((await request('GET', '/api/state')).statusCode, 401);
    assert.equal(
      (
        await request(
          'POST',
          '/api/session',
          { token: r.launchToken },
          { origin: 'https://evil.example' },
        )
      ).statusCode,
      403,
    );
    const login = await request('POST', '/api/session', { token: r.launchToken });
    assert.equal(login.statusCode, 200);
    const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join(';');
    assert.equal((await request('GET', '/api/state', undefined, { cookie })).statusCode, 200);
    assert.equal(
      (await request('GET', '/api/state', undefined, { cookie, host: 'evil.example' })).statusCode,
      403,
    );
    const w = await request(
      'POST',
      '/api/workspaces',
      { name: 'Test', path: join(root, 'workspace'), providers: ['codex'] },
      { cookie },
    );
    assert.equal(w.statusCode, 200);
    assert.equal(w.json().name, 'Test');
    const blocked = await request(
      'POST',
      '/api/workspaces',
      { name: 'Bad', path: root, providers: ['codex'] },
      { cookie },
    );
    assert.equal(blocked.statusCode, 409);
  } finally {
    await r.app.close();
    await rm(root, { recursive: true, force: true });
  }
});
