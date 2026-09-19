import { createHash, randomUUID } from 'node:crypto';
import { Store } from './store.js';
import { Blocked, now } from './types.js';
function canonical(x: any): any {
  return Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonical(x[k])]),
        )
      : x;
}
export const fingerprint = (op: string, args: unknown) =>
  createHash('sha256')
    .update(JSON.stringify([op, canonical(args)]))
    .digest('hex');
export class Approvals {
  pending = new Map<string, { resolve: () => void; reject: (e: Error) => void; hash: string }>();
  constructor(public store: Store) {}
  async request(taskId: string, operation: string, args: unknown, signal: AbortSignal) {
    signal.throwIfAborted();
    const id = randomUUID(),
      hash = fingerprint(operation, args);
    this.store.approval({ id, taskId, operation, args, hash, status: 'pending', createdAt: now() });
    this.store.update(taskId, { status: 'awaiting_approval' });
    this.store.event(taskId, 'approval_requested', { id, operation, args });
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        this.pending.delete(id);
        const a = this.store.approvals().find((x) => x.id === id)!;
        this.store.approval({ ...a, status: 'expired' });
        reject(new Blocked('Task cancelled'));
      };
      this.pending.set(id, {
        hash,
        resolve: () => {
          signal.removeEventListener('abort', abort);
          resolve();
        },
        reject: (e) => {
          signal.removeEventListener('abort', abort);
          reject(e);
        },
      });
      signal.addEventListener('abort', abort, { once: true });
    });
    signal.throwIfAborted();
    this.store.update(taskId, { status: 'running' });
  }
  decide(id: string, hash: string, allow: boolean) {
    const p = this.pending.get(id),
      a = this.store.approvals().find((x) => x.id === id);
    if (!p || !a || a.status !== 'pending' || p.hash !== hash)
      throw new Blocked('This approval is stale or its operation changed.');
    this.pending.delete(id);
    this.store.approval({ ...a, status: allow ? 'approved' : 'denied' });
    this.store.event(a.taskId, 'approval_decided', { id, allow });
    allow ? p.resolve() : p.reject(new Blocked('Operation declined by you.'));
  }
}
