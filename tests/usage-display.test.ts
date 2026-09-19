import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  claudeQuota,
  quotaWindows,
  subscriptionView,
  subscriptionHeadline,
  usageAttention,
} from '../shared/usage-display.js';
import { readClaudeQuota } from '../server/claude-usage.js';
import { SubscriptionRefresh } from '../server/subscription-refresh.js';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { CodexWorker, type CodexRPC } from '../server/adapters/codex.js';
import type { Health, Worker } from '../server/types.js';

const at = Date.parse('2026-09-19T18:00:00Z');
const reset = '2026-09-19T23:00:00Z';
test('A signed-in Claude API or unknown account is distinct from a disconnected subscription and cannot display old allowance', () => {
  for (const billing of ['api', 'external', 'unknown'] as const) {
    const view = subscriptionView(
      'claude',
      {
        provider: 'claude',
        ready: false,
        connection: { signedIn: true, billing },
        quota: claudeQuota({
          rate_limits_available: true,
          rate_limits: {
            five_hour: { utilization: 99, resets_at: reset },
          },
        }),
        quotaCheckedAt: new Date(at).toISOString(),
      },
      at,
    );
    assert.equal(view.connected, false);
    assert.deepEqual(view.windows, []);
    assert.ok(view.connectionNote?.includes('signed in'));
    assert.ok(!subscriptionHeadline(view).includes('not connected'));
    assert.deepEqual(
      usageAttention([view], { day: 0, month: 0 }, { dailyLimit: 5, monthlyLimit: 25 }),
      [],
    );
  }
});
const codexQuota = {
  rateLimits: {
    primary: { usedPercent: 95, windowDurationMins: 300, resetsAt: Date.parse(reset) / 1000 },
  },
};

test('Claude plan readings preserve percentage units, model scopes, unknowns and resets; discard unrelated data', () => {
  const quota = claudeQuota({
    rate_limits_available: true,
    session: { total_cost_usd: 123 },
    behaviors: { private: 'transcripts' },
    rate_limits: {
      five_hour: { utilization: 0.5, resets_at: reset },
      seven_day: { utilization: null, resets_at: null },
      seven_day_opus: { utilization: 75, resets_at: reset },
      model_scoped: [
        { display_name: 'Fable', utilization: 19, resets_at: reset },
        { display_name: 'Opus', utilization: 75, resets_at: reset },
      ],
      extra_usage: { is_enabled: true, used_credits: 900 },
    },
  });
  assert.equal(quota.windows[0].usedPercent, 0.5, '0.5 means half a percent, not 50 percent');
  assert.equal(quota.windows[0].resetsAt, Date.parse(reset) / 1000);
  assert.equal(quota.windows[1].usedPercent, undefined);
  assert.equal(quota.windows.filter((w) => w.scope === 'Opus').length, 1);
  assert.equal(quota.windows.find((w) => w.scope === 'Fable')?.usedPercent, 19);
  assert.ok(!JSON.stringify(quota).includes('transcripts'));
  assert.ok(!JSON.stringify(quota).includes('credits'));
  for (const raw of [
    null,
    {},
    { rate_limits_available: false, rate_limits: { five_hour: { utilization: 0 } } },
  ])
    assert.deepEqual(claudeQuota(raw).windows, []);
  for (const bad of [-1, 101, NaN, Infinity, '0', null])
    assert.equal(
      claudeQuota({
        rate_limits_available: true,
        rate_limits: { five_hour: { utilization: bad, resets_at: 'bad' } },
      }).windows[0].usedPercent,
      undefined,
    );
});

test('Codex multi-bucket windows supersede the legacy mirror and retain model labels', () => {
  const windows = quotaWindows('codex', {
    ...codexQuota,
    rateLimitsByLimitId: {
      codex: { primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: 123 } },
      astra: {
        limitName: 'Astra',
        normalModelSlug: 'gpt-6-astra',
        secondary: { usedPercent: 80, windowDurationMins: 10080 },
      },
    },
  });
  assert.equal(windows.length, 2);
  assert.equal(windows[0].usedPercent, 30);
  assert.equal(windows[1].scope, 'Astra');
  assert.equal(windows[1].label, '7 days');
  assert.deepEqual(quotaWindows('codex', { rateLimits: null }), []);
});

test('stale, expired, disconnected and missing readings cannot claim current remaining capacity or trigger low-usage notices', () => {
  const health = {
    provider: 'codex',
    ready: true,
    quota: codexQuota,
    quotaCheckedAt: new Date(at).toISOString(),
  };
  const fresh = subscriptionView('codex', health, at);
  assert.match(subscriptionHeadline(fresh), /5 hours · 5% left/);
  assert.equal(
    usageAttention([fresh], { day: 0, month: 0 }, { dailyLimit: 5, monthlyLimit: 25 }).length,
    1,
  );
  for (const h of [
    { ...health, quotaCheckedAt: new Date(at - 16 * 60_000).toISOString() },
    { ...health, usageError: 'Unavailable' },
    { ...health, ready: false },
    { ...health, quotaCheckedAt: undefined },
    { ...health, quotaCheckedAt: new Date(at + 3600_000).toISOString() },
  ]) {
    const view = subscriptionView('codex', h, at);
    assert.doesNotMatch(subscriptionHeadline(view), /% left/);
    assert.deepEqual(
      usageAttention([view], { day: 0, month: 0 }, { dailyLimit: 0, monthlyLimit: 0 }),
      [],
    );
  }
  const expired = subscriptionView('codex', health, Date.parse(reset) + 1);
  assert.equal(expired.windows[0].state, 'reset');
  const missing = subscriptionView(
    'claude',
    { provider: 'claude', ready: true, quota: { state: 'unknown' } },
    at,
  );
  assert.equal(missing.windows.length, 0);
  assert.doesNotMatch(subscriptionHeadline(missing), /100%/);
  assert.deepEqual(usageAttention([], { day: 5, month: 10 }, { dailyLimit: 5, monthlyLimit: 25 }), [
    'API budget reached',
  ]);
});

test('Claude usage uses only the SDK control request, skips transcript scans, and degrades on runtime changes or timeout', async () => {
  let calls = 0;
  const q = {
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async (opts: {
      skipBehaviors: boolean;
    }) => {
      calls++;
      assert.deepEqual(opts, { skipBehaviors: true });
      return {
        rate_limits_available: true,
        rate_limits: { five_hour: { utilization: 42, resets_at: reset } },
      };
    },
  };
  assert.equal((await readClaudeQuota(q)).windows[0].usedPercent, 42);
  assert.equal(calls, 1);
  await assert.rejects(readClaudeQuota({}), /unavailable/);
  await assert.rejects(
    readClaudeQuota(
      { usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: () => new Promise(() => {}) },
      5,
    ),
    /timed out/,
  );
});

test('Codex usage refresh cannot start a thread or turn and always closes its runtime', async () => {
  const requests: string[] = [];
  let closed = false;
  const rpc = {
    init: async () => {},
    close: () => {
      closed = true;
    },
    request: async (method: string) => {
      requests.push(method);
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'account/rateLimits/read') return codexQuota;
      throw new Error('Unexpected runtime method');
    },
  } as unknown as CodexRPC;
  const result = await new CodexWorker('/tmp/usage-fixture', () => rpc).subscription();
  assert.deepEqual(requests, ['account/read', 'account/rateLimits/read']);
  assert.deepEqual(result.quota, codexQuota);
  assert.ok(result.quotaCheckedAt);
  assert.equal(closed, true);
});

test('refresh isolates provider failure, keeps last-known timestamps, deduplicates requests and discards reads across account changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duke-usage-'));
  const store = new Store(join(dir, 'state.sqlite'));
  let calls = 0;
  let resolveRead: () => void = () => {};
  const worker: Worker = {
    run: async () => {
      throw new Error('No inference');
    },
    subscription: async () => {
      calls++;
      await new Promise<void>((resolve) => {
        resolveRead = resolve;
      });
      return { quota: codexQuota, quotaCheckedAt: new Date(at).toISOString() };
    },
  };
  const fail: Worker = {
    run: worker.run,
    subscription: async () => {
      throw new Error('private provider diagnostic');
    },
  };
  const refresh = new SubscriptionRefresh(store, { codex: worker, claude: fail }, () => at);
  try {
    for (const provider of ['codex', 'claude'])
      store.put('health', provider, {
        provider,
        ready: true,
        quota: { state: 'unknown' },
        quotaCheckedAt: reset,
      });
    const one = refresh.refresh(),
      two = refresh.refresh();
    resolveRead();
    await Promise.all([one, two]);
    assert.equal(calls, 1);
    assert.equal(store.get<Health>('health', 'codex')?.quotaCheckedAt, new Date(at).toISOString());
    const claude = store.get<Health>('health', 'claude')!;
    assert.equal(claude.ready, true);
    assert.equal(claude.quotaCheckedAt, reset);
    assert.match(claude.usageError!, /could not be refreshed/);
    assert.ok(!JSON.stringify(claude).includes('private'));
    await refresh.refresh();
    assert.equal(calls, 1);
    refresh.invalidate();
    const oldAccount = refresh.refresh();
    refresh.invalidate();
    store.put('health', 'codex', { provider: 'codex', ready: false });
    resolveRead();
    await oldAccount;
    assert.equal(store.get<Health>('health', 'codex')?.quota, undefined);
    assert.equal(store.get<Health>('health', 'codex')?.ready, false);
  } finally {
    store.db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('usage display preference persists across restart independently of routing settings and budget enforcement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-usage-http-'));
  let r = await createApp({ stateDir: root, serveUI: false });
  try {
    let login = await r.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { token: r.launchToken },
    });
    let cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join(';');
    const settings = r.store.settings();
    assert.equal(
      (
        await r.app.inject({
          method: 'PUT',
          url: '/api/preferences',
          payload: { usageDisplay: 'both' },
        })
      ).statusCode,
      401,
    );
    for (const usageDisplay of ['compact', 'api', 'subscriptions', 'both']) {
      const response = await r.app.inject({
        method: 'PUT',
        url: '/api/preferences',
        headers: { cookie },
        payload: { usageDisplay },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(r.store.settings(), settings);
    }
    for (const payload of [
      { usageDisplay: 'made-up' },
      { usageDisplay: 'compact', dailyLimit: 999 },
    ])
      assert.equal(
        (
          await r.app.inject({
            method: 'PUT',
            url: '/api/preferences',
            headers: { cookie },
            payload,
          })
        ).statusCode,
        400,
      );
    await r.app.close();
    r = await createApp({ stateDir: root, serveUI: false });
    login = await r.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { token: r.launchToken },
    });
    cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join(';');
    const state = (
      await r.app.inject({ method: 'GET', url: '/api/state', headers: { cookie } })
    ).json();
    assert.equal(state.preferences.usageDisplay, 'both');
    assert.deepEqual(state.settings, settings);
    assert.deepEqual(r.store.spending(), []);
    assert.deepEqual(r.store.tasks(), []);
  } finally {
    await r.app.close();
    await rm(root, { recursive: true, force: true });
  }
});
