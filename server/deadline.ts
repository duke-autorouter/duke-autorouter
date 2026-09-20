import { Blocked } from './types.js';

export class PhaseTimeout extends Blocked {
  constructor(public phase: string) {
    super(
      `${phase} took too long. Your work is saved. Try again when the connection or files are available.`,
    );
  }
}

// Race even dependencies which ignore AbortSignal. Callers must also fence writes
// and callbacks with the supplied signal, since a late promise can still settle.
export async function bounded<T>(
  parent: AbortSignal,
  milliseconds: number,
  phase: string,
  operation: (signal: AbortSignal, ready: () => void) => Promise<T>,
): Promise<T> {
  parent.throwIfAborted();
  const controller = new AbortController();
  const signal = AbortSignal.any([parent, controller.signal]);
  const timer = setTimeout(() => controller.abort(new PhaseTimeout(phase)), milliseconds);
  const ready = () => clearTimeout(timer);
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
      }),
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return operation(signal, ready);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    // Revoke callbacks even when a provider returned before all its callbacks did.
    controller.abort(new Error('This operation has ended.'));
  }
}
