import { claudeQuota } from '../shared/usage-display.js';

export type ClaudeUsageQuery = {
  usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET?: (options: {
    skipBehaviors: boolean;
  }) => Promise<unknown>;
};

export async function readClaudeQuota(query: ClaudeUsageQuery, timeoutMs = 8000) {
  const read = query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET;
  if (typeof read !== 'function') throw new Error('Claude usage is unavailable in this runtime.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      read.call(query, { skipBehaviors: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Claude usage timed out.')), timeoutMs);
      }),
    ]);
    return claudeQuota(result);
  } finally {
    clearTimeout(timer);
  }
}
