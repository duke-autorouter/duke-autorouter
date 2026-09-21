import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDevelopmentPilot } from '../evals/pilot-comparison.js';

const kinds = ['coding', 'research', 'writing', 'documents'];
const run = (mode: string, tokens = 100) => ({
  mode,
  split: 'development',
  source: { testedCommit: 'commit', dirty: false },
  corpusHash: 'corpus',
  caseSetHash: 'cases',
  profileHash: 'profile',
  policyHash: 'policy',
  toolchainHash: 'tools',
  coreSkillsHash: 'skills',
  requestedConfiguration: { mode },
  results: kinds.map((kind) => ({
    caseId: `${kind}-case`,
    inputHash: `${kind}-hash`,
    kind,
    status: 'completed',
    fixturesUnchanged: true,
    review: { accepted: true, criticalFailure: false },
    usage: { complete: true, records: 1, reportedTokens: tokens },
    work: { workerAttempts: 1, retries: 0, stages: 1 },
    latencyMs: 10,
    apiCostUSD: 0.001,
    unreconciledRequests: 0,
  })),
});

test('development pilot compares only matched independently reviewed four-case receipts', () => {
  const summary = compareDevelopmentPilot([run('strong', 100), run('rules', 80), run('jev', 70)]);
  assert.ok(Math.abs(summary.modes[2].observedTokenDifferenceVsStrong! + 0.3) < 1e-12);
  assert.equal(summary.modes[2].accepted, 4);
  assert.match(summary.conclusionBoundary, /do not establish general savings/);
});

test('development pilot rejects changed inputs, dirty source and incomplete review', () => {
  const rules = run('rules');
  rules.results[0].inputHash = 'changed';
  assert.throws(() => compareDevelopmentPilot([run('strong'), rules, run('jev')]), /input hashes/);
  const dirty = run('jev');
  dirty.source.dirty = true;
  assert.throws(() => compareDevelopmentPilot([run('strong'), run('rules'), dirty]), /clean/);
  const unreviewed = run('jev');
  (unreviewed.results[0].review.accepted as any) = null;
  assert.throws(
    () => compareDevelopmentPilot([run('strong'), run('rules'), unreviewed]),
    /review is incomplete/,
  );
});
