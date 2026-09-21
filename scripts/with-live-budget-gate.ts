import { readFile, rename, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const configuredCoordinationDir = process.env.DUKE_COORDINATION_DIR;
if (!configuredCoordinationDir)
  throw new Error('Set DUKE_COORDINATION_DIR to the private coordination receipt directory.');
const coordinationDir = resolve(configuredCoordinationDir);
const rawArgs = process.argv.slice(2);
const held = rawArgs.includes('--lock-held');
const args = rawArgs.filter((arg) => arg !== '--lock-held');
const separator = args.indexOf('--');
if (separator < 0 || separator === args.length - 1)
  throw new Error('Provide the live command after --.');
const options = args.slice(0, separator);
const command = args.slice(separator + 1);
const value = (name: string) => {
  const index = options.indexOf(name);
  if (index < 0 || !options[index + 1]) throw new Error(`Missing ${name}.`);
  return options[index + 1];
};
const runId = value('--run-id');
const reservationUSD = Number(value('--reservation-usd'));
const resultPath = resolve(value('--results'));
if (!Number.isFinite(reservationUSD) || reservationUSD <= 0)
  throw new Error('Reservation must be a positive dollar amount.');

const lockPath = join(coordinationDir, 'live-provider.lock');
if (!held) {
  const child = spawnSync(
    '/usr/bin/lockf',
    [
      '-k',
      '-t',
      '0',
      lockPath,
      process.execPath,
      '--import',
      'tsx',
      fileURLToPath(import.meta.url),
      '--lock-held',
      ...args,
    ],
    { cwd: process.cwd(), env: process.env, stdio: 'inherit' },
  );
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path: string, data: unknown) => {
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, path);
};
const coordinationPath = join(coordinationDir, 'coordination.json');
const workflowPath = join(coordinationDir, 'workflow-live-finished.json');
const ledgerPath = join(coordinationDir, 'api-ledger.json');
const coordination = await readJson(coordinationPath);
const cap = coordination?.budgetAuthorization?.newApiCapUSD;
if (coordination?.budgetAuthorization?.status !== 'approved' || !Number.isFinite(cap) || cap < 0)
  throw new Error('Fresh shared API cap is not approved with a numeric value.');
const workflow = await readJson(workflowPath).catch(() => undefined);
const workflowStatus = String(workflow?.status ?? '').toLowerCase();
const workflowComplete =
  workflow?.completed === true ||
  ['complete', 'completed', 'finished', 'passed'].includes(workflowStatus) ||
  workflow?.outcome === 'blocked' ||
  String(workflow?.outcome ?? '').toLowerCase().startsWith('passed');
const noActiveProviderWork =
  workflow?.noActiveProviderWork === true ||
  workflow?.activeProviderWork === false ||
  workflow?.providerWork?.active === false ||
  workflow?.providerWorkActive === false;
if (!workflowComplete || !noActiveProviderWork)
  throw new Error('Workflow-first receipt does not confirm completion with no active provider work.');

const ledger = await readJson(ledgerPath);
ledger.reservations ??= [];
ledger.entries ??= [];
if (
  ledger.reservations.some((entry: any) => entry.id === runId) ||
  ledger.entries.some((entry: any) => entry.id === runId)
)
  throw new Error(`Run ID ${runId} already exists in the shared ledger.`);
const settledBefore = Number(ledger.settledUSD ?? 0);
const outstandingBefore = ledger.reservations.reduce((sum: number, entry: any) => {
  if (['released', 'settled'].includes(entry.status)) return sum;
  const amount = Number(entry.amountUSD ?? entry.reservedUSD ?? 0);
  return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
}, 0);
if (settledBefore + outstandingBefore + reservationUSD > cap + 1e-12)
  throw new Error(
    `Reservation would exceed the combined cap: ${settledBefore} settled + ${outstandingBefore} outstanding + ${reservationUSD} requested > ${cap}.`,
  );
const startedAt = new Date().toISOString();
ledger.reservations.push({
  id: runId,
  owner: 'efficiency',
  status: 'outstanding',
  amountUSD: reservationUSD,
  createdAt: startedAt,
  resultPath,
});
await writeJson(ledgerPath, ledger);

const execution = spawnSync(command[0], command.slice(1), {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});
const exitCode = execution.status ?? 1;
const finalLedger = await readJson(ledgerPath);
const reservation = finalLedger.reservations.find((entry: any) => entry.id === runId);
let settledUSD = 0;
let unresolvedRequests: number | null = null;
let resultsFound = false;
try {
  const receipt = await readJson(resultPath);
  resultsFound = Array.isArray(receipt.results);
  if (resultsFound) {
    settledUSD = receipt.results.reduce((sum: number, row: any) => {
      const amount = Number(row.apiCostUSD);
      return sum + (Number.isFinite(amount) && amount >= 0 ? amount : 0);
    }, 0);
    unresolvedRequests = receipt.results.reduce((sum: number, row: any) => {
      const count = Number(row.unreconciledRequests);
      return sum + (Number.isFinite(count) && count >= 0 ? count : 0);
    }, 0);
  }
} catch {
  // A missing or unreadable receipt keeps the full reservation uncertain.
}
if (reservation) {
  if (exitCode === 0 && resultsFound && unresolvedRequests === 0) {
    finalLedger.reservations = finalLedger.reservations.filter((entry: any) => entry.id !== runId);
  } else {
    reservation.status = 'uncertain';
    reservation.amountUSD = Math.max(0, reservationUSD - settledUSD);
    reservation.updatedAt = new Date().toISOString();
    reservation.note = resultsFound
      ? 'Run ended with unresolved provider requests or a nonzero command status.'
      : 'Run ended without a readable machine receipt; reservation remains uncertain.';
  }
}
finalLedger.settledUSD = Number(finalLedger.settledUSD ?? 0) + settledUSD;
finalLedger.entries.push({
  id: runId,
  owner: 'efficiency',
  startedAt,
  finishedAt: new Date().toISOString(),
  commandExitCode: exitCode,
  resultPath,
  resultsFound,
  settledUSD,
  unresolvedRequests,
});
await writeJson(ledgerPath, finalLedger);
if (execution.error) throw execution.error;
process.exit(exitCode);
