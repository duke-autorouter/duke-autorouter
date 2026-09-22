import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApp } from '../server/app.js';
import { summarizeSpending } from '../server/spending.js';

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}.`);
  return args[index + 1];
};
const stateDir = resolve(value('--state-dir'));
const taskId = value('--task-id');
const expectedEvidenceKey = value('--expected-evidence-key');
const out = resolve(value('--out'));
const { app, store, engine } = await createApp({ stateDir, serveUI: false });

try {
  const beforeTask = store.task(taskId);
  if (beforeTask.status !== 'completed' || beforeTask.review?.status !== 'unverified')
    throw new Error('Review recovery requires a completed task with an unverified saved review.');
  if (beforeTask.review.evidence?.inputKey !== expectedEvidenceKey)
    throw new Error('Saved review evidence does not match the expected immutable input key.');
  const evidenceBefore = JSON.parse(JSON.stringify(beforeTask.review.evidence));
  const eventsBefore = store.events(taskId);
  const spendingBefore = store.spending().filter((entry) => entry.taskId === taskId);
  const spendingBeforeIds = new Set(spendingBefore.map((entry) => entry.id));
  const priorUncertainty = summarizeSpending(spendingBefore);

  engine.retryReview(taskId);
  const started = Date.now();
  for (;;) {
    const current = store.task(taskId);
    if (current.status === 'completed' && current.pendingOperation === undefined) break;
    if (Date.now() - started > 2 * 60_000) {
      engine.cancel(taskId);
      throw new Error('Review-only recovery timed out.');
    }
    await new Promise((done) => setTimeout(done, 250));
  }

  const afterTask = store.task(taskId);
  const evidenceAfter = afterTask.review?.evidence;
  if (JSON.stringify(evidenceAfter) !== JSON.stringify(evidenceBefore))
    throw new Error('Saved evidence changed during review-only recovery.');
  const addedEvents = store.events(taskId).slice(eventsBefore.length);
  if (addedEvents.some((event) => event.kind === 'usage_started' && event.data.role === 'worker'))
    throw new Error('Review-only recovery unexpectedly started a worker.');
  const completedJevReview = addedEvents.some((event) => event.kind === 'jev_review');
  const addedSpending = store
    .spending()
    .filter((entry) => entry.taskId === taskId && !spendingBeforeIds.has(entry.id));
  const recoverySpending = summarizeSpending(addedSpending);
  let testedCommit = 'unknown';
  let sourceDirty = true;
  try {
    testedCommit = (await execFileAsync('git', ['rev-parse', 'HEAD'])).stdout.trim();
    sourceDirty = !!(await execFileAsync('git', ['status', '--porcelain'])).stdout.trim();
  } catch {
    // Unknown source identity remains explicit.
  }
  const receipt = {
    schemaVersion: 1,
    kind: 'review-only-recovery',
    generatedAt: new Date().toISOString(),
    source: { testedCommit, dirty: sourceDirty },
    taskId,
    expectedEvidenceKey,
    evidenceBefore,
    evidenceAfter,
    workerRerun: false,
    completedJevReview,
    priorUncertaintyRetained: priorUncertainty,
    addedEvents,
    results: [
      {
        caseId: 'research-sqlite-wal',
        status: afterTask.status,
        automaticReview: afterTask.review,
        apiCostUSD: recoverySpending.apiCostUSD,
        unreconciledRequests: recoverySpending.unreconciledRequests,
        reservedAPIUSD: recoverySpending.reservedAPIUSD,
      },
    ],
  };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(receipt, null, 2) + '\n');
  if (!completedJevReview)
    throw new Error('Review-only recovery did not produce a Jev review event; receipt preserves the outcome.');
  console.log(`Recovered ${taskId} review as ${afterTask.review?.status}; no worker was rerun.`);
} finally {
  await app.close().catch(() => {});
}
