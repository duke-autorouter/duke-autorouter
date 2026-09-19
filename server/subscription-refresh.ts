import type { Health, SubscriptionStatus, Worker } from './types.js';
import type { Store } from './store.js';

// Refreshes only account telemetry. Single-flight and a one-minute cooldown
// protect provider endpoints when several windows open the usage panel.
export class SubscriptionRefresh {
  private pending?: Promise<void>;
  private last = -Infinity;
  private generation = 0;
  constructor(
    private store: Store,
    private workers: Record<string, Worker>,
    private clock = Date.now,
  ) {}
  invalidate() {
    this.generation++;
    this.last = -Infinity;
  }
  async refresh() {
    if (this.pending) return this.pending;
    if (this.clock() - this.last < 60_000) return;
    this.last = this.clock();
    const generation = this.generation;
    this.pending = Promise.all(
      ['codex', 'claude'].map(async (provider) => {
        const previous = this.store.get<Health>('health', provider);
        const worker = this.workers[provider];
        if (!previous?.ready || !worker?.subscription) return;
        let status: SubscriptionStatus;
        try {
          status = await worker.subscription();
        } catch {
          status = { usageError: 'Usage could not be refreshed. Try again in a minute.' };
        }
        // Sign-in/out during the read must not restore another account's data.
        if (generation !== this.generation) return;
        const current = this.store.get<Health>('health', provider);
        if (!current?.ready) return;
        this.store.put('health', provider, { ...current, ...status });
      }),
    )
      .then(() => {})
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
}
