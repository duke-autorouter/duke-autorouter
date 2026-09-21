import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const json = (value: unknown) => JSON.stringify(value, null, 2);

test('live gate requires both approvals, holds the OS lock and reconciles its reservation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duke-live-gate-'));
  const result = join(dir, 'results.json');
  await Promise.all([
    writeFile(
      join(dir, 'coordination.json'),
      json({ budgetAuthorization: { status: 'approved', newApiCapUSD: 0.1 } }),
    ),
    writeFile(
      join(dir, 'workflow-live-finished.json'),
      json({ status: 'completed', activeProviderWork: false }),
    ),
    writeFile(join(dir, 'api-ledger.json'), json({ settledUSD: 0, reservations: [], entries: [] })),
    writeFile(
      result,
      json({ results: [{ apiCostUSD: 0.002, unreconciledRequests: 0 }] }),
    ),
    writeFile(join(dir, 'live-provider.lock'), ''),
  ]);
  const run = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/with-live-budget-gate.ts',
      '--run-id',
      'test-run',
      '--reservation-usd',
      '0.01',
      '--results',
      result,
      '--',
      process.execPath,
      '-e',
      'process.exit(0)',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DUKE_COORDINATION_DIR: dir },
      encoding: 'utf8',
    },
  );
  assert.equal(run.status, 0, run.stderr);
  const ledger = JSON.parse(await readFile(join(dir, 'api-ledger.json'), 'utf8'));
  assert.equal(ledger.settledUSD, 0.002);
  assert.deepEqual(ledger.reservations, []);
  assert.equal(ledger.entries[0].id, 'test-run');
  assert.equal(ledger.entries[0].unresolvedRequests, 0);
  await access(join(dir, 'live-provider.lock'));
});

test('live gate refuses a run before touching the ledger when the combined cap is insufficient', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duke-live-gate-'));
  const result = join(dir, 'results.json');
  await Promise.all([
    writeFile(
      join(dir, 'coordination.json'),
      json({ budgetAuthorization: { status: 'approved', newApiCapUSD: 0.01 } }),
    ),
    writeFile(
      join(dir, 'workflow-live-finished.json'),
      json({ status: 'completed', noActiveProviderWork: true }),
    ),
    writeFile(
      join(dir, 'api-ledger.json'),
      json({ settledUSD: 0.006, reservations: [], entries: [] }),
    ),
    writeFile(result, json({ results: [] })),
    writeFile(join(dir, 'live-provider.lock'), ''),
  ]);
  const run = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/with-live-budget-gate.ts',
      '--run-id',
      'over-cap',
      '--reservation-usd',
      '0.005',
      '--results',
      result,
      '--',
      process.execPath,
      '-e',
      'process.exit(0)',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DUKE_COORDINATION_DIR: dir },
      encoding: 'utf8',
    },
  );
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /exceed the combined cap/);
  const ledger = JSON.parse(await readFile(join(dir, 'api-ledger.json'), 'utf8'));
  assert.deepEqual(ledger.reservations, []);
  assert.deepEqual(ledger.entries, []);
});

test('live gate accepts a terminal blocked workflow receipt only when provider work is inactive', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duke-live-gate-'));
  const result = join(dir, 'results.json');
  await Promise.all([
    writeFile(
      join(dir, 'coordination.json'),
      json({ budgetAuthorization: { status: 'approved', newApiCapUSD: 1 } }),
    ),
    writeFile(
      join(dir, 'workflow-live-finished.json'),
      json({ outcome: 'blocked', providerWorkActive: false }),
    ),
    writeFile(join(dir, 'api-ledger.json'), json({ settledUSD: 0, reservations: [], entries: [] })),
    writeFile(result, json({ results: [] })),
    writeFile(join(dir, 'live-provider.lock'), ''),
  ]);
  const run = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/with-live-budget-gate.ts',
      '--run-id',
      'after-blocked-workflow',
      '--reservation-usd',
      '0.01',
      '--results',
      result,
      '--',
      process.execPath,
      '-e',
      'process.exit(0)',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DUKE_COORDINATION_DIR: dir },
      encoding: 'utf8',
    },
  );
  assert.equal(run.status, 0, run.stderr);
});
