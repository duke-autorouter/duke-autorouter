import type { SubscriptionUsage, AllowanceWindow } from '../server/types.js';

// These are observed account changes, not task-attributed quota debits. Keep
// every provider, limit, window and reset period separate; never sum percentages
// across different allowances or double-count overlapping intervals.
export function resourceSummary(results: any[]) {
  const tokensByProvider: Record<string, number> = {},
    tokensByRole: Record<string, number> = {};
  const sum = (target: Record<string, number>, raw: any) => {
    for (const [key, n] of Object.entries(raw ?? {}))
      if (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)
        target[key] = (target[key] ?? 0) + n;
  };
  let subscriptionAttempts = 0,
    unobservedAttempts = 0,
    missingAllowanceReceipts = 0;
  const windows = new Map<
    string,
    {
      provider: string;
      limitId: string;
      window: string;
      durationMins?: number;
      resetsAt?: number;
      observations: { value: AllowanceWindow; start: number; end: number }[];
    }
  >();
  for (const r of results) {
    sum(tokensByProvider, r.usage?.byProvider);
    sum(tokensByRole, r.usage?.byRole);
    const receipt = r.subscriptionUsage as SubscriptionUsage | undefined;
    if (
      !receipt ||
      receipt.attribution !== 'account-window-change' ||
      !Array.isArray(receipt.attempts)
    ) {
      missingAllowanceReceipts++;
      continue;
    }
    subscriptionAttempts += receipt.attempts.length;
    for (const a of receipt.attempts) {
      const observed = (w: AllowanceWindow) =>
        w.status === 'observed' &&
        typeof w.changePercentagePoints === 'number' &&
        Number.isFinite(w.changePercentagePoints) &&
        w.changePercentagePoints >= 0 &&
        w.changePercentagePoints <= 100;
      if (!a.windows.length || a.windows.some((w) => !observed(w))) unobservedAttempts++;
      for (const w of a.windows) {
        const key = JSON.stringify([a.provider, w.limitId, w.window, w.durationMins, w.resetsAt]);
        const group = windows.get(key) ?? {
          provider: a.provider,
          limitId: w.limitId,
          window: w.window,
          durationMins: w.durationMins,
          resetsAt: w.resetsAt,
          observations: [],
        };
        group.observations.push({
          value: observed(w) ? w : { ...w, status: 'unknown' },
          start: Date.parse(a.beforeAt ?? ''),
          end: Date.parse(a.afterAt ?? ''),
        });
        windows.set(key, group);
      }
    }
  }
  const counters = (field: string) =>
    results.every((r) => Number.isSafeInteger(r.work?.[field]) && r.work[field] >= 0)
      ? results.reduce((sum, r) => sum + r.work[field], 0)
      : undefined;
  return {
    tokensByProvider,
    tokensByRole,
    workerAttempts: counters('workerAttempts'),
    retries: counters('retries'),
    stages: counters('stages'),
    subscriptionAllowance: {
      subscriptionAttempts,
      unobservedAttempts,
      missingAllowanceReceipts,
      windows: [...windows.values()].map(({ observations, ...identity }) => {
        const sorted = observations.toSorted((a, b) => a.start - b.start);
        let lastEnd = -Infinity,
          overlap = false;
        for (const row of sorted) {
          if (row.start < lastEnd) overlap = true;
          lastEnd = Math.max(lastEnd, row.end);
        }
        const complete =
          !overlap &&
          sorted.every(
            (o) =>
              o.value.status === 'observed' &&
              Number.isFinite(o.start) &&
              Number.isFinite(o.end) &&
              o.end >= o.start,
          );
        return {
          ...identity,
          samples: observations.length,
          unobservedSamples: observations.filter((o) => o.value.status !== 'observed').length,
          overlappingIntervals: overlap,
          observedChangePercentagePoints: complete
            ? observations.reduce((sum, o) => sum + o.value.changePercentagePoints!, 0)
            : undefined,
        };
      }),
      note: 'Account-window changes can include other applications. Zero can reflect rounding or delayed updates. Unknown is not zero. Different windows, providers and reset periods are separate; no task-attributed quota saving is claimed.',
    },
  };
}
