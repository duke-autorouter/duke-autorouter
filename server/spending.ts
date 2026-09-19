import type { SpendingEntry } from './types.js';

export function summarizeSpending(entries: Pick<SpendingEntry, 'state' | 'actual' | 'reserved'>[]) {
  const verified = entries.filter(
    (e) => e.actual !== null && ['settled', 'reconciled'].includes(e.state),
  );
  const uncertain = entries.filter((e) => !verified.includes(e));
  return {
    apiCostUSD: verified.reduce((n, e) => n + e.actual!, 0) / 1e6,
    reconciledRequests: verified.filter((e) => e.state === 'reconciled').length,
    unreconciledRequests: uncertain.length,
    reservedAPIUSD: uncertain.reduce((n, e) => n + e.reserved, 0) / 1e6,
  };
}
