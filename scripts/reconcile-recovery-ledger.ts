import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}.`);
  return args[index + 1];
};
const ledgerPath = resolve(value('--ledger'));
const receiptPath = resolve(value('--receipt'));
const runId = value('--run-id');
const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
const reservation = ledger.reservations?.find((entry: any) => entry.id === runId);
const entry = ledger.entries?.find((candidate: any) => candidate.id === runId);
if (!reservation || reservation.status !== 'uncertain')
  throw new Error('Expected one uncertain recovery reservation.');
if (!entry || entry.resultsFound !== true || entry.unresolvedRequests !== 0)
  throw new Error('Ledger entry does not prove a readable receipt with zero unresolved requests.');
if (receipt.kind !== 'review-only-recovery' || receipt.workerRerun !== false)
  throw new Error('Receipt is not a review-only recovery with no worker rerun.');
if (JSON.stringify(receipt.evidenceBefore) !== JSON.stringify(receipt.evidenceAfter))
  throw new Error('Receipt does not prove unchanged review evidence.');
if (!(receipt.addedEvents ?? []).some((event: any) => event.kind === 'jev_review'))
  throw new Error('Receipt does not contain a completed Jev review event.');
if (
  !Array.isArray(receipt.results) ||
  receipt.results.length !== 1 ||
  receipt.results[0].unreconciledRequests !== 0 ||
  Number(receipt.results[0].apiCostUSD) !== Number(entry.settledUSD)
)
  throw new Error('Receipt cost does not reconcile to the settled ledger entry.');

ledger.reservations = ledger.reservations.filter((candidate: any) => candidate.id !== runId);
entry.reconciledAfterNonzeroExit = true;
entry.reconciledAt = new Date().toISOString();
entry.reconciliationNote =
  'Wrapper rejected a valid unverified judgment status after the Jev review completed; receipt proves unchanged evidence, no worker rerun, settled cost and zero unresolved provider requests.';
ledger.reconciliations ??= [];
ledger.reconciliations.push({
  id: randomUUID(),
  runId,
  at: entry.reconciledAt,
  releasedReservationUSD: Number(reservation.amountUSD),
  retainedPriorUncertainty: receipt.priorUncertaintyRetained,
  receiptPath,
});
const temporary = join(dirname(ledgerPath), `.${randomUUID()}.tmp`);
await writeFile(temporary, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 });
await rename(temporary, ledgerPath);
console.log(`Reconciled ${runId}; prior unrelated uncertainty remains untouched.`);
