import { evalKinds } from './selection.js';
import { resourceSummary } from './resources.js';

const expectedModes = ['strong', 'rules', 'jev'];

export function compareDevelopmentPilot(runs: any[]) {
  if (runs.length !== 3 || runs.some((run, index) => run.mode !== expectedModes[index]))
    throw new Error('Pass exactly strong, rules and Jev receipts in that order.');
  const baseline = runs[0];
  const completeUsage = (row: any) =>
    row.usage?.complete === true &&
    row.usage.records > 0 &&
    Number.isSafeInteger(row.usage.reportedTokens) &&
    row.usage.reportedTokens >= 0;
  const accepted = (run: any, kind?: string) =>
    run.results.filter(
      (row: any) =>
        (!kind || row.kind === kind) &&
        row.status === 'completed' &&
        row.fixturesUnchanged &&
        row.review.accepted &&
        !row.review.criticalFailure,
    ).length;
  const tokens = (run: any) =>
    run.results.reduce((sum: number, row: any) => sum + row.usage.reportedTokens, 0);
  for (const run of runs) {
    if (run.split !== 'development' || run.results?.length !== 4)
      throw new Error('The pilot requires exactly four development results per mode.');
    if (evalKinds.some((kind) => run.results.filter((row: any) => row.kind === kind).length !== 1))
      throw new Error('Each mode requires one result from every work family.');
    for (const field of [
      'corpusHash',
      'caseSetHash',
      'profileHash',
      'policyHash',
      'toolchainHash',
      'coreSkillsHash',
    ])
      if (!run[field] || run[field] !== baseline[field])
        throw new Error(`${field} differs between modes.`);
    if (run.source?.testedCommit !== baseline.source?.testedCommit || run.source?.dirty)
      throw new Error('All modes require the same clean tested commit.');
    const identity = (row: any) => `${row.caseId}:${row.inputHash}`;
    if (
      JSON.stringify(run.results.map(identity).sort()) !==
      JSON.stringify(baseline.results.map(identity).sort())
    )
      throw new Error('Case IDs or input hashes differ between modes.');
    if (
      run.results.some(
        (row: any) =>
          typeof row.review?.accepted !== 'boolean' ||
          typeof row.review?.criticalFailure !== 'boolean',
      )
    )
      throw new Error('Independent acceptance and critical-failure review is incomplete.');
    if (
      run.results.some(
        (row: any) =>
          !Number.isFinite(row.latencyMs) ||
          row.latencyMs < 0 ||
          !Number.isFinite(row.apiCostUSD) ||
          row.apiCostUSD < 0 ||
          !Number.isFinite(row.unreconciledRequests) ||
          row.unreconciledRequests < 0,
      )
    )
      throw new Error('Latency, settled charges and unresolved reservations are required.');
  }
  return {
    schemaVersion: 1,
    scope: 'Four matched development cases; not a held-out release comparison.',
    sourceCommit: baseline.source.testedCommit,
    caseSetHash: baseline.caseSetHash,
    profileHash: baseline.profileHash,
    modes: runs.map((run) => {
      const matchesBaselineQuality =
        evalKinds.every((kind) => accepted(run, kind) >= accepted(baseline, kind)) &&
        !run.results.some((row: any) => row.review.criticalFailure);
      const usageComplete = run.results.every(completeUsage);
      const baselineUsageComplete = baseline.results.every(completeUsage);
      return {
        mode: run.mode,
        requestedConfiguration: run.requestedConfiguration,
        accepted: accepted(run),
        byKind: Object.fromEntries(
          evalKinds.map((kind) => [
            kind,
            { accepted: accepted(run, kind), baselineAccepted: accepted(baseline, kind) },
          ]),
        ),
        criticalFailures: run.results.filter((row: any) => row.review.criticalFailure).length,
        matchesObservedBaselineQuality: matchesBaselineQuality,
        resources: resourceSummary(run.results),
        reportedTokens: usageComplete ? tokens(run) : null,
        incompleteTokenReports: run.results.filter((row: any) => !completeUsage(row)).length,
        observedTokenDifferenceVsStrong:
          usageComplete &&
          baselineUsageComplete &&
          tokens(baseline) > 0 &&
          matchesBaselineQuality
            ? tokens(run) / tokens(baseline) - 1
            : null,
        totalLatencyMs: run.results.reduce(
          (sum: number, row: any) => sum + row.latencyMs,
          0,
        ),
        settledAPIUSD: run.results.reduce(
          (sum: number, row: any) => sum + row.apiCostUSD,
          0,
        ),
        unresolvedReservations: run.results.reduce(
          (sum: number, row: any) => sum + row.unreconciledRequests,
          0,
        ),
      };
    }),
    conclusionBoundary:
      'Differences describe these four development cases only. They do not establish general savings, account-attributed quota savings, calibrated routing quality or the held-out release threshold.',
  };
}
