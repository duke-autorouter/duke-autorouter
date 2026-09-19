import type { GetAccountRateLimitsResponse } from './generated/codex/v2/GetAccountRateLimitsResponse.js';

// Read the pinned runtime's multi-bucket protocol; never add percentages from
// different windows or treat missing telemetry as a zero-usage allowance.
export function exhaustedCapacity(
  quota: Partial<GetAccountRateLimitsResponse> | undefined,
  model: string,
  at = Date.now(),
) {
  if (!quota) return false;
  if (quota.ordinaryUsageAllowed === false) return true;
  const buckets = Object.values(quota.rateLimitsByLimitId ?? {}).filter((b) => !!b);
  const snapshots = buckets.length ? buckets : quota.rateLimits ? [quota.rateLimits] : [];
  return snapshots.some(
    (bucket) =>
      (!bucket.normalModelSlug || bucket.normalModelSlug === model || bucket.limitId === model) &&
      (bucket.spendControlReached === true ||
        [bucket.primary, bucket.secondary].some(
          (window) =>
            window &&
            window.usedPercent >= 100 &&
            (window.resetsAt == null || window.resetsAt * 1000 > at),
        )),
  );
}
