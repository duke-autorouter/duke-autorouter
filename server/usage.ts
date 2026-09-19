import type { Event, Provider, ReportedUsage, TaskUsage } from './types.js';

const count = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined;
const total = (...v: (number | undefined)[]) =>
  v.every((n) => n !== undefined) ? v.reduce<number>((a, b) => a + b!, 0) : undefined;

export function normalizeUsage(provider: Provider | 'jev', raw: any): ReportedUsage {
  if (!raw || typeof raw !== 'object') return { complete: false };
  let inputTokens: number | undefined,
    outputTokens: number | undefined,
    cachedInputTokens: number | undefined,
    cacheWriteInputTokens: number | undefined,
    reasoningOutputTokens: number | undefined,
    totalTokens: number | undefined;
  if (provider === 'codex') {
    const v = raw.total;
    if (!v) return { complete: false };
    inputTokens = count(v.inputTokens);
    outputTokens = count(v.outputTokens);
    cachedInputTokens = count(v.cachedInputTokens);
    cacheWriteInputTokens = count(v.cacheWriteInputTokens);
    reasoningOutputTokens = count(v.reasoningOutputTokens);
    totalTokens = count(v.totalTokens);
  } else if (provider === 'claude') {
    // modelUsage includes the query's auxiliary calls; usage alone covers only
    // the main loop. Both are cumulative within this fresh query() invocation.
    const values: any[] = Object.values(raw.modelUsage ?? {});
    if (!values.length) {
      const v = raw.usage;
      if (!v) return { complete: false };
      inputTokens = total(
        count(v.input_tokens),
        count(v.cache_read_input_tokens),
        count(v.cache_creation_input_tokens),
      );
      outputTokens = count(v.output_tokens);
      return {
        inputTokens,
        outputTokens,
        totalTokens: total(inputTokens, outputTokens),
        complete: false,
      };
    }
    cachedInputTokens = total(...values.map((v) => count(v.cacheReadInputTokens)));
    cacheWriteInputTokens = total(...values.map((v) => count(v.cacheCreationInputTokens)));
    inputTokens = total(
      total(...values.map((v) => count(v.inputTokens))),
      cachedInputTokens,
      cacheWriteInputTokens,
    );
    outputTokens = total(...values.map((v) => count(v.outputTokens)));
    reasoningOutputTokens = total(...values.map((v) => count(v.thinkingTokens)));
    totalTokens = total(inputTokens, outputTokens);
  } else {
    inputTokens = count(provider === 'jev' ? raw.input_tokens : raw.prompt_tokens);
    outputTokens = count(provider === 'jev' ? (raw.output_tokens ?? 0) : raw.completion_tokens);
    cachedInputTokens = count(raw.prompt_tokens_details?.cached_tokens);
    reasoningOutputTokens = count(raw.completion_tokens_details?.reasoning_tokens);
    totalTokens = total(inputTokens, outputTokens);
  }
  // Cached input and reasoning are subsets, never added to the total twice.
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    reasoningOutputTokens,
    complete:
      totalTokens !== undefined &&
      inputTokens !== undefined &&
      outputTokens !== undefined &&
      totalTokens === inputTokens + outputTokens,
  };
}

export class WorkerUsage {
  private reports = new Map<string, ReportedUsage>();
  private sequence = 0;
  constructor(private provider: Provider) {}
  accept(kind: string, data: any) {
    if (kind === 'api_request_started') this.reports.set(data.reservation, { complete: false });
    if (kind === 'api_usage')
      this.reports.set(
        data.reservation ?? data.reference ?? String(++this.sequence),
        normalizeUsage('openrouter', data.usage),
      );
    if (kind === 'subscription_usage')
      this.reports.set('runtime', normalizeUsage(this.provider, data));
  }
  snapshot(finished: boolean): ReportedUsage {
    const values = [...this.reports.values()];
    if (!values.length) return { complete: false };
    const sum = (key: keyof ReportedUsage) => {
      const known = values
        .map((v) =>
          key === 'totalTokens'
            ? (v.totalTokens ??
              (v.inputTokens !== undefined || v.outputTokens !== undefined
                ? (v.inputTokens ?? 0) + (v.outputTokens ?? 0)
                : undefined))
            : count(v[key]),
        )
        .filter((v): v is number => v !== undefined);
      return known.length ? known.reduce((a, b) => a + b, 0) : undefined;
    };
    return {
      inputTokens: sum('inputTokens'),
      outputTokens: sum('outputTokens'),
      totalTokens: sum('totalTokens'),
      cachedInputTokens: sum('cachedInputTokens'),
      cacheWriteInputTokens: sum('cacheWriteInputTokens'),
      reasoningOutputTokens: sum('reasoningOutputTokens'),
      complete: finished && values.every((v) => v.complete),
    };
  }
}

export function summarizeUsage(events: Event[]): TaskUsage {
  const records = new Map<
    string,
    { role: 'routing' | 'worker' | 'review'; provider?: Provider | 'jev'; usage: ReportedUsage }
  >();
  for (const e of events) {
    if (e.kind === 'usage_started')
      records.set(e.data.id, {
        role: e.data.role,
        provider: e.data.provider,
        usage: { complete: false },
      });
    if (e.kind === 'usage_report' && records.has(e.data.id))
      records.get(e.data.id)!.usage = e.data.usage;
  }
  const result: TaskUsage = {
    reportedTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    reasoningOutputTokens: 0,
    complete: true,
    missingReports: 0,
    records: records.size,
    byRole: { routing: 0, worker: 0, review: 0 },
    byProvider: {},
  };
  for (const { role, provider, usage } of records.values()) {
    const n = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
    result.reportedTokens += n;
    result.byRole[role] += n;
    if (provider) result.byProvider![provider] = (result.byProvider![provider] ?? 0) + n;
    for (const key of [
      'inputTokens',
      'outputTokens',
      'cachedInputTokens',
      'cacheWriteInputTokens',
      'reasoningOutputTokens',
    ] as const)
      result[key] += usage[key] ?? 0;
    if (!usage.complete) {
      result.complete = false;
      result.missingReports++;
    }
  }
  return result;
}
