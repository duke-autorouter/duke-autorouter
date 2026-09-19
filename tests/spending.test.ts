import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { summarizeSpending } from '../server/spending.js';

test('cost reports include audited corrections and preserve unknown reservations', () => {
  assert.deepEqual(
    summarizeSpending([
      { state: 'settled', actual: 10000, reserved: 20000 },
      { state: 'reconciled', actual: 20000, reserved: 30000 },
      { state: 'reserved', actual: null, reserved: 40000 },
    ]),
    { apiCostUSD: 0.03, reconciledRequests: 1, unreconciledRequests: 1, reservedAPIUSD: 0.04 },
  );
});

test('reconciliation persists an audit record and updates only the original budget window', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duke-spending-'));
  const path = join(dir, 'router.sqlite');
  let store = new Store(path);
  try {
    store.put('settings', 'main', { dailyLimit: 10, monthlyLimit: 50, timezone: 'UTC' });
    const old = new Date('2026-01-10T12:00:00Z'),
      current = new Date('2026-02-10T12:00:00Z');
    const id = store.reserve('stopped', 'jev', 0.5, old);
    assert.equal(store.spend(old).day, 0.5);
    assert.equal(store.spend(current).month, 0);
    const input = {
      actualUSD: 0.12,
      reservedMicros: 500000,
      note: 'Provider billing record: request 123',
    };
    assert.throws(
      () => store.reconcileSpending(id, { ...input, reservedMicros: 499999 }),
      /changed/,
    );
    assert.throws(() => store.reconcileSpending(id, { ...input, actualUSD: -1 }), /verified/);
    const receipt = store.reconcileSpending(id, input);
    assert.equal(receipt.reservedMicros, 500000);
    assert.equal(receipt.actualMicros, 120000);
    assert.equal(store.spend(old).month, 0.12);
    assert.equal(store.spend(current).month, 0);
    assert.equal(store.spend().unreconciled, 0);
    assert.throws(() => store.reconcileSpending(id, input), /already reconciled/);
    store.settle(id, 0); // A late provider callback cannot erase the correction.
    store.close();
    store = new Store(path);
    assert.equal(store.spending()[0].actual, 120000);
    assert.deepEqual(store.spending()[0].reconciliation, receipt);
    assert.equal(store.spending()[0].state, 'reconciled');
    const settled = store.reserve('done', 'jev', 0.1);
    store.settle(settled, 0.05);
    assert.throws(
      () => store.reconcileSpending(settled, { ...input, reservedMicros: 100000 }),
      /changed/,
    );
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('reconciliation API requires authenticated same-origin requests and a stopped task', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duke-spending-http-'));
  const r = await createApp({ stateDir: dir, serveUI: false });
  try {
    const id = r.store.reserve('t', 'openrouter', 0.2);
    const payload = { actualUSD: 0, reservedMicros: 200000, note: 'Provider confirms no charge' };
    const req = (cookie = '', body: any = payload, origin?: string) =>
      r.app.inject({
        method: 'POST',
        url: `/api/spending/${id}/reconcile`,
        payload: body,
        headers: { host: '127.0.0.1:4318', cookie, ...(origin ? { origin } : {}) },
      });
    assert.equal((await req()).statusCode, 401);
    const login = await r.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { token: r.launchToken },
      headers: { host: '127.0.0.1:4318' },
    });
    const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join(';');
    assert.equal((await req(cookie, payload, 'https://example.com')).statusCode, 403);
    assert.equal((await req(cookie, { ...payload, note: '' })).statusCode, 400);
    for (const status of ['queued', 'routing', 'running', 'verifying', 'awaiting_approval']) {
      r.store.save({
        id: 't',
        status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);
      assert.equal((await req(cookie)).statusCode, 409, status);
    }
    r.store.save({ ...r.store.task('t'), status: 'blocked' });
    r.engine.active.set('t', new AbortController());
    assert.equal((await req(cookie)).statusCode, 409);
    r.engine.active.delete('t');
    assert.equal((await req(cookie)).statusCode, 200);
    assert.equal(r.store.spending()[0].actual, 0);
    assert.equal((await req(cookie)).statusCode, 409);
  } finally {
    r.engine.active.clear();
    await r.app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
