import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capacityWindows, summarizeSubscriptionUsage } from '../server/subscription-usage.js';
import { resourceSummary } from '../evals/resources.js';

const at = '2026-09-19T10:00:00Z',
  later = '2026-09-19T10:01:00Z';
const reset = Date.parse('2026-09-19T15:00:00Z') / 1000;
const quota = (usedPercent: number, resetsAt: number | null = reset, duration = 300) => ({
  rateLimitsByLimitId: {
    core: {
      limitId: 'core',
      normalModelSlug: null,
      primary: { usedPercent, windowDurationMins: duration, resetsAt },
      secondary: { usedPercent: 50, windowDurationMins: 10080, resetsAt: reset + 86400 * 5 },
    },
    otherModel: {
      limitId: 'separate',
      normalModelSlug: 'different-model',
      primary: { usedPercent: 99, windowDurationMins: 300, resetsAt: reset },
    },
  },
});
function events(before: any, after: any, end = later) {
  return [
    {
      kind: 'usage_started',
      at,
      data: { id: 'u', role: 'worker', provider: 'codex', modelId: 'model-a', model: 'model-a' },
    },
    { kind: 'allowance_snapshot', at, data: { usageId: 'u', phase: 'before', quota: before, at } },
    {
      kind: 'allowance_snapshot',
      at: end,
      data: { usageId: 'u', phase: 'after', quota: after, at: end },
    },
  ];
}

test('subscription receipts separate account windows and include every worker attempt without token conversion', () => {
  const list = events(quota(10), quota(12));
  list.push({
    kind: 'usage_started',
    at: later,
    data: {
      id: 'claude',
      role: 'worker',
      provider: 'claude',
      modelId: 'model-c',
      model: 'model-c',
    },
  });
  const receipt = summarizeSubscriptionUsage(list);
  assert.equal(receipt.attribution, 'account-window-change');
  assert.equal(receipt.attempts.length, 2);
  assert.equal(receipt.unobservedAttempts, 1);
  assert.equal(receipt.attempts[0].windows.length, 2);
  assert.equal(receipt.attempts[0].windows[0].changePercentagePoints, 2);
  assert.equal(receipt.attempts[0].windows[1].changePercentagePoints, 0);
  assert.deepEqual(receipt.attempts[1].windows, []);
  const summary = resourceSummary([
    { subscriptionUsage: receipt, work: { workerAttempts: 2, retries: 1, stages: 1 } },
  ]);
  assert.equal(summary.workerAttempts, 2);
  assert.equal(summary.retries, 1);
  assert.equal(summary.subscriptionAllowance.windows.length, 2);
  assert.equal(summary.subscriptionAllowance.windows[0].observedChangePercentagePoints, 2);
  assert.equal(summary.subscriptionAllowance.windows[1].observedChangePercentagePoints, 0);
  assert.match(summary.subscriptionAllowance.note, /rounding or delayed/);
});

test('resets, missing telemetry, decreased percentages, changing windows and reversed time cannot report a saving', () => {
  for (const [before, after, end, expected] of [
    [quota(10), undefined, later, 'unknown'],
    [undefined, quota(12), later, 'unknown'],
    [quota(10, null), quota(12, null), later, 'unknown'],
    [quota(99), quota(1, reset + 3600), later, 'reset'],
    [quota(10), quota(10), '2026-09-19T15:00:01Z', 'reset'],
    [quota(10), quota(9), later, 'decreased'],
    [quota(10), quota(12, reset, 600), later, 'window_changed'],
    [quota(10), quota(12), '2026-09-19T09:59:00Z', 'unknown'],
    [quota(Number.NaN), quota(12), later, 'unknown'],
  ] as const) {
    const receipt = summarizeSubscriptionUsage(events(before, after, end));
    assert.equal(receipt.unobservedAttempts, 1);
    assert.equal(receipt.attempts[0].windows[0].status, expected);
    assert.equal(receipt.attempts[0].windows[0].changePercentagePoints, undefined);
  }
  assert.deepEqual(capacityWindows({ state: 'unknown' }), []);
  assert.equal(
    capacityWindows({ rateLimits: { limitId: 'legacy', primary: { usedPercent: null } } })[0]
      .usedPercent,
    undefined,
  );
});

test('benchmark preserves missing allowance receipts and refuses to sum overlapping account intervals', () => {
  const a = summarizeSubscriptionUsage(events(quota(10), quota(12)));
  const b = summarizeSubscriptionUsage(events(quota(10), quota(12)));
  let resources = resourceSummary([{ subscriptionUsage: a }, { subscriptionUsage: b }, {}]);
  assert.equal(resources.subscriptionAllowance.missingAllowanceReceipts, 1);
  assert.equal(resources.workerAttempts, undefined);
  assert.equal(resources.subscriptionAllowance.windows[0].overlappingIntervals, true);
  assert.equal(
    resources.subscriptionAllowance.windows[0].observedChangePercentagePoints,
    undefined,
  );
  b.attempts[0].beforeAt = later;
  b.attempts[0].afterAt = '2026-09-19T10:02:00Z';
  resources = resourceSummary([{ subscriptionUsage: a }, { subscriptionUsage: b }]);
  assert.equal(resources.subscriptionAllowance.windows[0].observedChangePercentagePoints, 4);
  // Reset periods stay separate even when the account uses the same named limit.
  b.attempts[0].windows[0].resetsAt! += 3600;
  resources = resourceSummary([{ subscriptionUsage: a }, { subscriptionUsage: b }]);
  assert.equal(resources.subscriptionAllowance.windows.length, 3);
});

test('legacy task events reconstruct unknown subscription allowance after a restart', () => {
  const receipt = summarizeSubscriptionUsage([
    { kind: 'route', data: { provider: 'claude', model: 'legacy' }, at },
    { kind: 'usage_started', data: { id: 'old', role: 'worker', modelId: 'legacy' }, at },
  ]);
  assert.equal(receipt.attempts.length, 1);
  assert.equal(receipt.unobservedAttempts, 1);
});
