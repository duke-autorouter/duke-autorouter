import type { AllowanceWindow, Event, SubscriptionAttempt, SubscriptionUsage } from './types.js';

type CapacityWindow = Omit<
  AllowanceWindow,
  'status' | 'beforeUsedPercent' | 'afterUsedPercent' | 'changePercentagePoints'
> & { usedPercent?: number };
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const percent = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;

// Read only the supported quota fields. Null/missing telemetry stays unknown.
export function capacityWindows(quota: any, model?: string): CapacityWindow[] {
  const keyed = Object.entries(quota?.rateLimitsByLimitId ?? {}).filter(([, b]) => !!b);
  const buckets = keyed.length ? keyed : quota?.rateLimits ? [['legacy', quota.rateLimits]] : [];
  return buckets.flatMap(([key, raw]) => {
    const bucket = raw as any;
    if (
      model &&
      bucket.normalModelSlug &&
      bucket.normalModelSlug !== model &&
      bucket.limitId !== model
    )
      return [];
    return (['primary', 'secondary'] as const).flatMap((window) => {
      const value = bucket[window];
      if (!value) return [];
      return [
        {
          limitId: String(bucket.limitId ?? key),
          window,
          durationMins: positive(value.windowDurationMins) ? value.windowDurationMins : undefined,
          resetsAt: positive(value.resetsAt) ? value.resetsAt : undefined,
          usedPercent: percent(value.usedPercent) ? value.usedPercent : undefined,
        },
      ];
    });
  });
}

export function summarizeSubscriptionUsage(
  events: Pick<Event, 'kind' | 'data' | 'at'>[],
): SubscriptionUsage {
  const attempts = new Map<
    string,
    SubscriptionAttempt & { before?: CapacityWindow[]; after?: CapacityWindow[]; model?: string }
  >();
  let route: any;
  for (const event of events) {
    const d = event.data;
    if (event.kind === 'route') route = d;
    if (event.kind === 'usage_started' && d.role === 'worker') {
      const provider = d.provider ?? route?.provider;
      if (provider === 'codex' || provider === 'claude')
        attempts.set(d.id, {
          id: d.id,
          provider,
          modelId: d.modelId,
          model: d.model ?? route?.model,
          windows: [],
        });
    }
    if (event.kind === 'allowance_snapshot') {
      const attempt = attempts.get(d.usageId);
      if (!attempt || !['before', 'after'].includes(d.phase)) continue;
      const phase = d.phase as 'before' | 'after';
      attempt[phase] = capacityWindows(d.quota, attempt.model);
      attempt[phase === 'before' ? 'beforeAt' : 'afterAt'] = d.at ?? event.at;
    }
  }
  const results: SubscriptionAttempt[] = [];
  for (const attempt of attempts.values()) {
    const { before = [], after = [], model: _model, ...result } = attempt;
    const key = (w: CapacityWindow) => JSON.stringify([w.limitId, w.window]);
    const keys = new Set([...before, ...after].map(key));
    const started = Date.parse(attempt.beforeAt ?? ''),
      ended = Date.parse(attempt.afterAt ?? '');
    result.windows = [...keys].map((k) => {
      const a = before.find((w) => key(w) === k),
        b = after.find((w) => key(w) === k);
      const identity = (a ?? b)!;
      const window: AllowanceWindow = {
        limitId: identity.limitId,
        window: identity.window,
        durationMins: identity.durationMins,
        resetsAt: identity.resetsAt,
        beforeUsedPercent: a?.usedPercent,
        afterUsedPercent: b?.usedPercent,
        status: 'unknown',
      };
      if (
        !a ||
        !b ||
        a.usedPercent === undefined ||
        b.usedPercent === undefined ||
        !a.resetsAt ||
        !b.resetsAt ||
        !a.durationMins ||
        !b.durationMins ||
        !Number.isFinite(started) ||
        !Number.isFinite(ended) ||
        ended < started
      )
        return window;
      if (a.durationMins !== b.durationMins) window.status = 'window_changed';
      else if (a.resetsAt !== b.resetsAt || ended >= a.resetsAt * 1000) window.status = 'reset';
      else if (b.usedPercent < a.usedPercent) window.status = 'decreased';
      else {
        window.status = 'observed';
        window.changePercentagePoints = b.usedPercent - a.usedPercent;
      }
      return window;
    });
    results.push(result);
  }
  return {
    attempts: results,
    unobservedAttempts: results.filter(
      (a) => !a.windows.length || a.windows.some((w) => w.status !== 'observed'),
    ).length,
    attribution: 'account-window-change',
  };
}
