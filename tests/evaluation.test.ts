import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cases } from '../evals/cases.js';
import { balancedCases, evalKinds } from '../evals/selection.js';
import { compareRuns } from '../evals/comparison.js';

test('small evaluation runs cover all four work types; held-out selection is balanced and independent', () => {
  assert.deepEqual(
    balancedCases(cases, 'development', 4).map((c) => c.kind),
    [...evalKinds],
  );
  const heldout = balancedCases(cases, 'held-out', 40);
  assert.equal(heldout.length, 40);
  for (const kind of evalKinds) assert.equal(heldout.filter((c) => c.kind === kind).length, 10);
  assert.ok(
    !heldout.some((c) => balancedCases(cases, 'development', 40).some((d) => d.id === c.id)),
  );
});

function run(mode: string) {
  return {
    mode,
    split: 'held-out',
    corpusHash: 'same-corpus',
    profileHash: 'same-profiles',
    results: balancedCases(cases, 'held-out', 20).map((c) => ({
      caseId: c.id,
      kind: c.kind,
      status: 'completed',
      fixturesUnchanged: true,
      latencyMs: 100,
      apiCostUSD: 0.001,
      unreconciledRequests: 0,
      selectionConfidence: 0.85,
      review: { accepted: true, criticalFailure: false },
    })),
  };
}
test('release comparison rejects incomplete, duplicate, changed-profile and self-graded evidence', () => {
  const base = run('strong');
  assert.throws(() => compareRuns([base, { ...run('jev'), results: [] }]), /nonempty/);
  assert.throws(() => compareRuns([base, { ...run('jev'), profileHash: 'different' }]), /profiles/);
  const duplicate = run('jev');
  duplicate.results[1] = duplicate.results[0];
  assert.throws(() => compareRuns([base, duplicate]), /Duplicate/);
  const selfGraded = run('jev');
  (selfGraded.results[0].review as any).accepted = null;
  assert.throws(() => compareRuns([base, selfGraded]), /independent/);
  assert.throws(
    () =>
      compareRuns([
        { ...base, results: base.results.slice(0, 4) },
        { ...run('jev'), results: base.results.slice(0, 4) },
      ]),
    /five/,
  );
});
test('a gain in one work type cannot hide a regression in another; unsettled spend stays visible', () => {
  const base = run('strong'),
    candidate = run('jev');
  base.results.find((r) => r.kind === 'writing')!.review.accepted = false;
  candidate.results.find((r) => r.kind === 'research')!.review.accepted = false;
  candidate.results[0].unreconciledRequests = 1;
  const result = compareRuns([base, candidate]);
  assert.equal(result[0].accepted, result[1].accepted);
  assert.equal(result[1].meetsObservedBaseline, false);
  assert.equal(result[1].unreconciledRequests, 1);
  assert.equal(result[1].apiUSDPerAcceptedTask, undefined);
  assert.equal(result[1].resources.subscriptionAllowance.missingAllowanceReceipts, 20);
  assert.equal(result[1].confidenceBands[0].tasks, 20);
});

test('resource comparison reports subscription and API work under the same quality benchmark', () => {
  const base: any = run('strong'),
    candidate: any = run('jev');
  for (const r of candidate.results) {
    r.usage = {
      complete: true,
      records: 3,
      reportedTokens: 80,
      byRole: { routing: 10, worker: 60, review: 10 },
      byProvider: { codex: 60, jev: 20 },
    };
    r.work = { workerAttempts: 2, retries: 1, stages: 1 };
    r.subscriptionUsage = {
      attempts: [{ id: r.caseId, provider: 'codex', modelId: 'fixture', windows: [] }],
      attribution: 'account-window-change',
      unobservedAttempts: 1,
    };
  }
  const result = compareRuns([base, candidate])[1];
  assert.equal(result.meetsObservedBaseline, true);
  assert.equal(result.resources.tokensByProvider.codex, 1200);
  assert.equal(result.resources.tokensByRole.worker, 1200);
  assert.equal(result.resources.workerAttempts, 40);
  assert.equal(result.resources.retries, 20);
  assert.equal(result.resources.subscriptionAllowance.unobservedAttempts, 20);
  assert.equal(result.resources.subscriptionAllowance.subscriptionAttempts, 20);
  assert.deepEqual(result.resources.subscriptionAllowance.windows, []);
  assert.ok(Math.abs(result.apiUSDPerAcceptedTask! - 0.001) < 1e-9);
  // Complete candidate counts alone do not establish a reduction against an unknown baseline.
  assert.equal(result.observedTokenReduction, undefined);
});

test('token comparisons count failed work and suppress savings when reports or quality are incomplete', () => {
  const base: any = run('strong'),
    candidate: any = run('jev');
  base.results.forEach((r: any) => (r.usage = { complete: true, records: 1, reportedTokens: 100 }));
  candidate.results.forEach(
    (r: any) => (r.usage = { complete: true, records: 3, reportedTokens: 60 }),
  );
  let compared = compareRuns([base, candidate])[1];
  assert.equal(compared.tokensPerAcceptedTask, 60);
  assert.equal(compared.observedTokenReduction, 0.4);
  candidate.results[0].review.accepted = false;
  compared = compareRuns([base, candidate])[1];
  assert.equal(compared.tokensPerAcceptedTask, 1200 / 19);
  assert.equal(compared.observedTokenReduction, undefined);
  candidate.results[0].review.accepted = true;
  candidate.results[0].usage.complete = false;
  compared = compareRuns([base, candidate])[1];
  assert.equal(compared.incompleteTokenReports, 1);
  assert.equal(compared.tokensPerAcceptedTask, undefined);
  assert.equal(compared.observedTokenReduction, undefined);
});
