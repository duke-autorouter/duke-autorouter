import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const prices: Record<string, { input: number; cachedInput: number; cacheWrite: number; output: number }> = {
  'codex:gpt-6-astra': { input: 10, cachedInput: 1, cacheWrite: 12.5, output: 50 },
  'codex:gpt-5.6-sol': { input: 4, cachedInput: 0.4, cacheWrite: 5, output: 20 },
  'codex:gpt-5.6-luna': { input: 0.2, cachedInput: 0.02, cacheWrite: 0.25, output: 1.2 },
};

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--out');
if (outputIndex < 0 || !args[outputIndex + 1] || outputIndex === 0)
  throw new Error('Provide one or more receipts followed by --out <summary.json>.');
const receiptPaths: string[] = [];
const recoveryPaths: string[] = [];
let reviewsPath: string | undefined;
for (let index = 0; index < outputIndex; index++) {
  if (args[index] === '--recovery') {
    if (!args[index + 1]) throw new Error('Provide a path after --recovery.');
    recoveryPaths.push(args[++index]);
  } else if (args[index] === '--reviews') {
    if (!args[index + 1]) throw new Error('Provide a path after --reviews.');
    reviewsPath = args[++index];
  } else receiptPaths.push(args[index]);
}
const receipts = await Promise.all(
  receiptPaths.map(async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))),
);
const recoveries = await Promise.all(
  recoveryPaths.map(async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))),
);
const independentReviews = reviewsPath
  ? JSON.parse(await readFile(resolve(reviewsPath), 'utf8'))
  : undefined;

const money = (amount: number) => Number(amount.toFixed(9));
function workerAttempts(row: any) {
  const starts = new Map<string, any>();
  const finals = new Map<string, any>();
  for (const event of row.events ?? []) {
    if (event.kind === 'usage_started' && event.data?.role === 'worker')
      starts.set(event.data.id, event.data);
    if (event.kind === 'usage_report' && event.data?.usage?.complete === true)
      finals.set(event.data.id, event.data.usage);
  }
  return [...starts].map(([id, start]) => {
    const usage = finals.get(id);
    if (!usage) throw new Error(`${row.caseId}: worker attempt ${id} has no complete usage record.`);
    const modelId = start.modelId;
    const rate = prices[modelId];
    if (!rate) throw new Error(`${row.caseId}: no dated price for ${modelId}.`);
    const input = Number(usage.inputTokens ?? 0);
    const cached = Number(usage.cachedInputTokens ?? 0);
    const cacheWrite = Number(usage.cacheWriteInputTokens ?? 0);
    const output = Number(usage.outputTokens ?? 0);
    const uncached = input - cached - cacheWrite;
    if ([input, cached, cacheWrite, output, uncached].some((value) => !Number.isFinite(value) || value < 0))
      throw new Error(`${row.caseId}: invalid token accounting for ${id}.`);
    const apiEquivalentUSD =
      (uncached * rate.input + cached * rate.cachedInput + cacheWrite * rate.cacheWrite + output * rate.output) /
      1_000_000;
    return { id, modelId, usage, apiEquivalentUSD: money(apiEquivalentUSD) };
  });
}

const baseline = receipts[0];
for (const receipt of receipts.slice(1)) {
  if (receipt.split !== baseline.split || receipt.caseSetHash !== baseline.caseSetHash)
    throw new Error('Receipts do not use the same split and frozen case set.');
  if (receipt.profileHash !== baseline.profileHash)
    throw new Error('Receipts do not use the same frozen profile.');
  if (receipt.policyHash !== baseline.policyHash || receipt.toolchainHash !== baseline.toolchainHash)
    throw new Error('Receipts do not use the same policy and toolchain.');
}

const modes = receipts.map((receipt) => {
  const modeReviews = independentReviews?.modes?.find((candidate: any) => candidate.mode === receipt.mode);
  const cases = receipt.results.map((row: any) => {
    const attempts = workerAttempts(row);
    const workerAPIEquivalentUSD = attempts.reduce((sum: number, attempt: any) => sum + attempt.apiEquivalentUSD, 0);
    const matchingRecoveries = recoveries.filter((recovery) => recovery.taskId === row.taskId);
    const actualBilledAPIUSD =
      Number(row.apiCostUSD ?? 0) +
      matchingRecoveries.reduce(
        (sum, recovery) =>
          sum + recovery.results.reduce((inner: number, result: any) => inner + Number(result.apiCostUSD ?? 0), 0),
        0,
      );
    const unresolvedAPIRequests =
      Number(row.unreconciledRequests ?? 0) +
      matchingRecoveries.reduce(
        (sum, recovery) =>
          sum +
          recovery.results.reduce(
            (inner: number, result: any) => inner + Number(result.unreconciledRequests ?? 0),
            0,
          ),
        0,
      );
    const providerReservedAPIUSD =
      Number(row.reservedAPIUSD ?? 0) +
      matchingRecoveries.reduce(
        (sum, recovery) =>
          sum + recovery.results.reduce((inner: number, result: any) => inner + Number(result.reservedAPIUSD ?? 0), 0),
        0,
      );
    const jevReviewObserved =
      (row.events ?? []).some((event: any) => event.kind === 'jev_review') ||
      matchingRecoveries.some((recovery) =>
        (recovery.addedEvents ?? []).some((event: any) => event.kind === 'jev_review'),
      );
    const subscriptionWindows = (row.subscriptionUsage?.attempts ?? []).flatMap((attempt: any) =>
      (attempt.windows ?? []).map((window: any) => ({
        modelId: attempt.modelId,
        limitId: window.limitId,
        window: window.window,
        beforeUsedPercent: window.beforeUsedPercent,
        afterUsedPercent: window.afterUsedPercent,
        changePercentagePoints: window.changePercentagePoints,
        status: window.status,
      })),
    );
    const independentReview = modeReviews?.cases?.find(
      (candidate: any) => candidate.caseId === row.caseId,
    );
    return {
      caseId: row.caseId,
      status: row.status,
      independentlyAccepted:
        independentReview?.accepted === true ||
        (independentReview === undefined && row.review?.accepted === true),
      independentCriticalFailure:
        independentReview?.criticalFailure === true ||
        (independentReview === undefined && row.review?.criticalFailure === true),
      independentReviewSource: independentReview ? 'review-overlay' : 'run-receipt',
      independentCorrections: independentReview?.corrections ?? row.review?.corrections ?? null,
      independentNotes: independentReview?.notes ?? row.review?.notes ?? '',
      workerAttempts: attempts,
      workerAPIEquivalentUSD: money(workerAPIEquivalentUSD),
      actualBilledAPIUSD: money(actualBilledAPIUSD),
      combinedCostProxyUSD: money(workerAPIEquivalentUSD + actualBilledAPIUSD),
      unresolvedAPIRequests,
      providerReservedAPIUSD: money(providerReservedAPIUSD),
      combinedCostProxyUpperBoundUSD: money(
        workerAPIEquivalentUSD + actualBilledAPIUSD + providerReservedAPIUSD,
      ),
      jevReviewObserved,
      reviewRecoveryReceipts: matchingRecoveries.length,
      subscriptionWindows,
    };
  });
  const accepted = cases.filter((row: any) => row.status === 'completed' && row.independentlyAccepted).length;
  const workerAPIEquivalentUSD = cases.reduce((sum: number, row: any) => sum + row.workerAPIEquivalentUSD, 0);
  const actualBilledAPIUSD = cases.reduce((sum: number, row: any) => sum + row.actualBilledAPIUSD, 0);
  const providerReservedAPIUSD = cases.reduce(
    (sum: number, row: any) => sum + row.providerReservedAPIUSD,
    0,
  );
  const unresolvedAPIRequests = cases.reduce(
    (sum: number, row: any) => sum + row.unresolvedAPIRequests,
    0,
  );
  const combinedCostProxyUSD = workerAPIEquivalentUSD + actualBilledAPIUSD;
  return {
    mode: receipt.mode,
    testedCommit: receipt.source?.testedCommit,
    sourceDirty: receipt.source?.dirty,
    acceptedCompletedTasks: accepted,
    totalTasks: cases.length,
    workerAPIEquivalentUSD: money(workerAPIEquivalentUSD),
    actualBilledAPIUSD: money(actualBilledAPIUSD),
    unresolvedAPIRequests,
    providerReservedAPIUSD: money(providerReservedAPIUSD),
    combinedCostProxyUSD: money(combinedCostProxyUSD),
    combinedCostProxyUpperBoundUSD: money(combinedCostProxyUSD + providerReservedAPIUSD),
    combinedCostProxyPerAcceptedTaskUSD: accepted ? money(combinedCostProxyUSD / accepted) : null,
    allCasesReceivedJevReview: cases.every((row: any) => row.jevReviewObserved),
    cases,
  };
});

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  pricing: {
    asOf: '2026-09-20',
    tier: 'Standard, short context',
    unit: 'USD per 1M tokens',
    source: 'https://developers.openai.com/api/docs/pricing/',
    rates: prices,
    note: 'Output includes visible and reasoning tokens. These prices estimate subscription-worker API equivalents; they are not Codex subscription charges.',
  },
  primaryMetric: 'combinedCostProxyUSD / independently accepted completed tasks; all attempts and failures remain in the numerator',
  actualBillingBoundary: 'actualBilledAPIUSD contains only metered API charges recorded by the harness.',
  subscriptionBoundary: 'Subscription window observations are reported without dollar conversion or quota-multiplier inference.',
  independentReview: independentReviews?.evaluator,
  modes,
};
await writeFile(resolve(args[outputIndex + 1]), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
