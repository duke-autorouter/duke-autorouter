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

// No total runtime cap: active tools (including user approval waits) own their
// deadlines. Silence between provider events is bounded and late callbacks fenced.
export async function whileActive<T>(
  parent: AbortSignal,
  milliseconds: number,
  operation: (
    signal: AbortSignal,
    activity: () => void,
    tool: <R>(run: () => Promise<R>) => Promise<R>,
  ) => Promise<T>,
): Promise<T> {
  return bounded(parent, milliseconds, 'Waiting for the model', async (signal, ready) => {
    ready();
    const controller = new AbortController();
    const lease = AbortSignal.any([signal, controller.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeTools = 0;
    const activity = () => {
      lease.throwIfAborted();
      clearTimeout(timer);
      if (!activeTools)
        timer = setTimeout(
          () => controller.abort(new PhaseTimeout('Waiting for the model')),
          milliseconds,
        );
    };
    let abort = () => {};
    activity();
    try {
      return await Promise.race([
        new Promise<never>((_, reject) => {
          abort = () => reject(lease.reason);
          lease.addEventListener('abort', abort, { once: true });
        }),
        Promise.resolve().then(() => {
          lease.throwIfAborted();
          return operation(lease, activity, async (run) => {
            lease.throwIfAborted();
            activeTools++;
            clearTimeout(timer);
            try {
              return await run();
            } finally {
              activeTools--;
              if (!lease.aborted) activity();
            }
          });
        }),
      ]);
    } finally {
      clearTimeout(timer);
      lease.removeEventListener('abort', abort);
      controller.abort(new Error('This operation has ended.'));
    }
  });
}
