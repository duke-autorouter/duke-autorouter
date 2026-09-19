import type { ClaudeConnection } from './claude-connection.js';

export const usageDisplays = ['compact', 'api', 'subscriptions', 'both'] as const;
export type UsageDisplay = (typeof usageDisplays)[number];
export type UsagePreferences = { usageDisplay: UsageDisplay };
export const defaultUsagePreferences: UsagePreferences = { usageDisplay: 'compact' };

export type UsageWindow = {
  id: string;
  label: string;
  scope?: string;
  usedPercent?: number;
  resetsAt?: number;
};
export type ClaudeQuota = {
  source: 'claude-sdk-usage';
  state: 'available' | 'unavailable';
  windows: UsageWindow[];
};
export type UsageHealth = {
  provider: string;
  ready: boolean;
  quota?: unknown;
  checkedAt?: string;
  quotaCheckedAt?: string;
  usageError?: string;
  connection?: ClaudeConnection;
};
export const USAGE_FRESH_MS = 15 * 60 * 1000;
const object = (v: unknown): Record<string, any> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
const percent = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : undefined;
const epoch = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
const label = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 100) : '');

// The pinned Claude SDK's get_usage result uses percentages (0–100), unlike
// rate_limit_event's utilization. Only retain plan windows, never transcripts,
// account identity, session costs or credentials from the SDK response.
export function claudeQuota(input: unknown): ClaudeQuota {
  const data = object(input),
    limits = object(data.rate_limits);
  if (data.rate_limits_available !== true || !Object.keys(limits).length)
    return { source: 'claude-sdk-usage', state: 'unavailable', windows: [] };
  const windows: UsageWindow[] = [];
  const add = (id: string, name: string, raw: unknown, scope?: string) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const row = object(raw);
    const reset = typeof row.resets_at === 'string' ? Date.parse(row.resets_at) / 1000 : NaN;
    windows.push({
      id,
      label: name,
      scope,
      usedPercent: percent(row.utilization),
      resetsAt: epoch(reset),
    });
  };
  add('five_hour', '5 hours', limits.five_hour);
  add('seven_day', '7 days', limits.seven_day);
  add('seven_day_oauth_apps', '7 days', limits.seven_day_oauth_apps, 'OAuth apps');
  add('seven_day_opus', '7 days', limits.seven_day_opus, 'Opus');
  add('seven_day_sonnet', '7 days', limits.seven_day_sonnet, 'Sonnet');
  if (Array.isArray(limits.model_scoped)) {
    for (const [i, raw] of limits.model_scoped.entries()) {
      const name = label(object(raw).display_name);
      if (name && !windows.some((w) => w.scope?.toLowerCase() === name.toLowerCase()))
        add('model_' + i, '7 days', raw, name);
    }
  }
  return {
    source: 'claude-sdk-usage',
    state: windows.length ? 'available' : 'unavailable',
    windows,
  };
}

function durationLabel(minutes: unknown, fallback: string) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return fallback;
  if (minutes % 1440 === 0) return `${minutes / 1440} days`;
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} minutes`;
}
export function quotaWindows(provider: string, input: unknown): UsageWindow[] {
  const quota = object(input);
  if (provider === 'claude') {
    if (quota.source !== 'claude-sdk-usage' || !Array.isArray(quota.windows)) return [];
    return quota.windows.slice(0, 30).flatMap((raw: unknown, i: number) => {
      const row = object(raw);
      if (!label(row.label)) return [];
      return [
        {
          id: label(row.id) || String(i),
          label: label(row.label),
          scope: label(row.scope) || undefined,
          usedPercent: percent(row.usedPercent),
          resetsAt: epoch(row.resetsAt),
        },
      ];
    });
  }
  if (provider !== 'codex') return [];
  const keyed = Object.entries(object(quota.rateLimitsByLimitId)).filter(
    ([, b]) => b && typeof b === 'object',
  );
  const buckets = keyed.length ? keyed : quota.rateLimits ? [['codex', quota.rateLimits]] : [];
  return buckets.flatMap(([id, raw]) => {
    const bucket = object(raw);
    const scope =
      label(bucket.limitName) || label(bucket.normalModelSlug) || (id === 'codex' ? '' : label(id));
    return ['primary', 'secondary'].flatMap((key) => {
      if (!bucket[key] || typeof bucket[key] !== 'object') return [];
      const window = object(bucket[key]);
      return [
        {
          id: `${id}:${key}`,
          label: durationLabel(
            window.windowDurationMins,
            key === 'primary' ? 'Primary window' : 'Secondary window',
          ),
          scope: scope.toLowerCase() === 'codex' ? undefined : scope || undefined,
          usedPercent: percent(window.usedPercent),
          resetsAt: epoch(window.resetsAt),
        },
      ];
    });
  });
}

export function subscriptionView(
  provider: 'codex' | 'claude',
  health: UsageHealth | undefined,
  at = Date.now(),
) {
  const otherBilling =
    provider === 'claude' &&
    health?.connection?.signedIn &&
    health.connection.billing !== 'subscription'
      ? health.connection.billing
      : undefined;
  const connectionLabel =
    otherBilling === 'api'
      ? 'API account'
      : otherBilling === 'external'
        ? 'Provider account'
        : otherBilling === 'unknown'
          ? 'Billing unknown'
          : undefined;
  const connectionNote =
    otherBilling === 'unknown'
      ? 'Claude Code is signed in, but the billing method could not be identified. Check the connection in Setup.'
      : otherBilling
        ? 'Claude Code is signed in with separate billing. DUKE subscription routing and allowance readings are unavailable for this connection.'
        : undefined;
  const checkedAt =
    health?.quotaCheckedAt ?? (provider === 'codex' ? health?.checkedAt : undefined);
  const checked = checkedAt ? Date.parse(checkedAt) : NaN;
  const fresh =
    Number.isFinite(checked) &&
    checked <= at + 60_000 &&
    at - checked <= USAGE_FRESH_MS &&
    !health?.usageError;
  const windows = health?.ready
    ? quotaWindows(provider, health.quota).map((w) => ({
        ...w,
        state:
          w.resetsAt !== undefined && w.resetsAt * 1000 <= at
            ? ('reset' as const)
            : w.usedPercent === undefined
              ? ('unknown' as const)
              : fresh
                ? ('current' as const)
                : ('stale' as const),
      }))
    : [];
  const blocked =
    provider === 'codex' &&
    fresh &&
    health?.ready &&
    object(health.quota).ordinaryUsageAllowed === false;
  return {
    provider,
    name: provider === 'codex' ? 'Codex' : 'Claude',
    connected: !!health?.ready,
    connectionLabel,
    connectionNote,
    checkedAt: Number.isFinite(checked) ? checkedAt : undefined,
    fresh,
    windows,
    blocked: !!blocked,
    error: health?.usageError,
    experimental: provider === 'claude',
  };
}
export type SubscriptionView = ReturnType<typeof subscriptionView>;

export function subscriptionHeadline(view: SubscriptionView) {
  if (view.connectionLabel) return `${view.name} · ${view.connectionLabel}`;
  if (!view.connected) return `${view.name} · not connected`;
  if (view.blocked) return `${view.name} · limit reached`;
  // Show a named window, never add together percentages or imply that a single
  // model bucket represents the whole subscription.
  const window = view.windows.find((w) => !w.scope && w.state === 'current');
  if (window)
    return `${view.name} · ${window.label} · ${Math.floor(100 - window.usedPercent!)}% left`;
  if (view.windows.some((w) => w.state === 'stale' || w.state === 'reset'))
    return `${view.name} · refresh needed`;
  return `${view.name} · view usage`;
}

export function usageAttention(
  views: SubscriptionView[],
  spend: { day: number; month: number },
  limits: { dailyLimit: number; monthlyLimit: number },
) {
  const notices: string[] = [];
  // A zero budget is a deliberate setting, not a permanent warning banner.
  if (
    (limits.dailyLimit > 0 && spend.day >= limits.dailyLimit) ||
    (limits.monthlyLimit > 0 && spend.month >= limits.monthlyLimit)
  )
    notices.push('API budget reached');
  for (const view of views) {
    if (view.blocked) {
      notices.push(`${view.name} subscription limit reached`);
      continue;
    }
    const low = view.windows.filter((w) => w.state === 'current' && w.usedPercent! >= 90);
    if (low.length)
      notices.push(
        `${view.name}${low[0].scope ? ' ' + low[0].scope : ''} ${low[0].label}: ${Math.floor(100 - low[0].usedPercent!)}% left`,
      );
  }
  return notices;
}
