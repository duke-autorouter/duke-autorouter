import { evalKinds } from './selection.js';
import { resourceSummary } from './resources.js';

export function compareRuns(runs: any[]) {
  if (runs.length < 2 || runs[0].mode !== 'strong')
    throw new Error('Start with a strong fixed-model baseline and at least one candidate run.');
  const base = runs[0];
  const completeUsage = (r: any) =>
    r.usage?.complete === true &&
    r.usage.records > 0 &&
    Number.isSafeInteger(r.usage.reportedTokens) &&
    r.usage.reportedTokens >= 0;
  const tokens = (run: any) =>
    run.results.reduce(
      (n: number, r: any) =>
        n +
        (Number.isSafeInteger(r.usage?.reportedTokens) && r.usage.reportedTokens >= 0
          ? r.usage.reportedTokens
          : 0),
      0,
    );
  const accepted = (run: any, kind?: string) =>
    run.results.filter(
      (r: any) =>
        (!kind || r.kind === kind) &&
        r.status === 'completed' &&
        r.fixturesUnchanged &&
        r.review.accepted &&
        !r.review.criticalFailure,
    ).length;
  for (const run of runs) {
    if (run.split !== 'held-out' || !Array.isArray(run.results) || !run.results.length)
      throw new Error('Release comparison requires nonempty held-out runs.');
    if (!run.corpusHash || run.corpusHash !== base.corpusHash)
      throw new Error('Corpus differs between runs.');
    if (!run.profileHash || run.profileHash !== base.profileHash)
      throw new Error('Routing profiles differ between runs. Start from the same profiles.');
    const ids = run.results.map((r: any) => r.caseId);
    if (new Set(ids).size !== ids.length)
      throw new Error('Duplicate cases cannot inflate evaluation evidence.');
    if (
      JSON.stringify([...ids].sort()) !==
      JSON.stringify(base.results.map((r: any) => r.caseId).sort())
    )
      throw new Error('Compare the same cases.');
    if (evalKinds.some((kind) => run.results.filter((r: any) => r.kind === kind).length < 5))
      throw new Error('Use at least five held-out cases in each of the four work types.');
    if (
      run.results.some(
        (r: any) =>
          typeof r.review?.accepted !== 'boolean' || typeof r.review?.criticalFailure !== 'boolean',
      )
    )
      throw new Error(
        'Complete independent acceptance and critical-failure review first. Automatic Jev checks are not the release benchmark judge.',
      );
    if (
      run.results.some(
        (r: any) =>
          !Number.isFinite(r.latencyMs) ||
          r.latencyMs < 0 ||
          !Number.isFinite(r.apiCostUSD) ||
          r.apiCostUSD < 0 ||
          !Number.isFinite(r.unreconciledRequests),
      )
    )
      throw new Error('Latency, settled API costs and unresolved reservations are required.');
  }
  return runs.map((run) => ({
    path: run.path,
    resources: resourceSummary(run.results),
    mode: run.mode,
    cases: run.results.length,
    accepted: accepted(run),
    byKind: Object.fromEntries(
      evalKinds.map((kind) => [
        kind,
        { accepted: accepted(run, kind), baselineAccepted: accepted(base, kind) },
      ]),
    ),
    criticalFailures: run.results.filter((r: any) => r.review.criticalFailure).length,
    meetsObservedBaseline:
      evalKinds.every((kind) => accepted(run, kind) >= accepted(base, kind)) &&
      !run.results.some((r: any) => r.review.criticalFailure),
    reportedTokens: tokens(run),
    incompleteTokenReports: run.results.filter((r: any) => !completeUsage(r)).length,
    tokensPerAcceptedTask:
      run.results.every(completeUsage) && accepted(run) > 0
        ? tokens(run) / accepted(run)
        : undefined,
    observedTokenReduction:
      run.results.every(completeUsage) &&
      base.results.every(completeUsage) &&
      tokens(base) > 0 &&
      evalKinds.every((kind) => accepted(run, kind) >= accepted(base, kind)) &&
      !run.results.some((r: any) => r.review.criticalFailure)
        ? 1 - tokens(run) / tokens(base)
        : undefined,
    totalLatencyMs: run.results.reduce((n: number, r: any) => n + r.latencyMs, 0),
    settledAPIUSD: run.results.reduce((n: number, r: any) => n + r.apiCostUSD, 0),
    apiUSDPerAcceptedTask:
      accepted(run) > 0 && run.results.every((r: any) => r.unreconciledRequests === 0)
        ? run.results.reduce((n: number, r: any) => n + r.apiCostUSD, 0) / accepted(run)
        : undefined,
    unreconciledRequests: run.results.reduce((n: number, r: any) => n + r.unreconciledRequests, 0),
    confidenceBands: [
      [0.8, 0.9],
      [0.9, 1.01],
    ].map(([lower, upper]) => {
      const rows = run.results.filter(
        (r: any) => r.selectionConfidence >= lower && r.selectionConfidence < upper,
      );
      return {
        lower,
        upper: Math.min(1, upper),
        tasks: rows.length,
        accepted: rows.filter(
          (r: any) =>
            r.status === 'completed' &&
            r.fixturesUnchanged &&
            r.review.accepted &&
            !r.review.criticalFailure,
        ).length,
      };
    }),
    note: 'One objective for subscriptions and APIs: required quality with minimal necessary resources. Observed comparison only; small samples do not prove superiority. Whole-task tokens include routing, attempts and review. Missing reports cannot establish savings. API dollars and observed subscription-window changes remain separate resource measurements. Confidence is not a success probability.',
  }));
}
