import { mkdir, readFile, writeFile, copyFile, chmod, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createApp } from '../server/app.js';
import { CodexWorker } from '../server/adapters/codex.js';
import { recordCatalog } from '../server/model-profiles.js';
import { assessLocally } from '../server/router.js';
import { summarizeSpending } from '../server/spending.js';
import { inspectFile } from '../server/task-evidence.js';
import { RECOVERY_POLICY } from '../server/recovery.js';
import { ROUTING_POLICY, REVIEW_POLICY } from '../server/outcomes.js';
import type { Model, Task, Workspace } from '../server/types.js';

const arg = (name: string) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
};
const out = resolve(arg('--out')),
  stateDir = resolve(arg('--state-dir'));
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (process.env.DUKE_CORRECTION_VALIDATION_AUTHORIZED !== '1')
  throw new Error('Live authorization required');
if (git('status', '--porcelain')) throw new Error('Commit protocol and source before calls');
if ((await readdir(stateDir).catch(() => [])).length) throw new Error('State must be empty');
await mkdir(out, { recursive: true });
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const { app, store, engine, approvals } = await createApp({ stateDir, serveUI: false });
const source = git('rev-parse', 'HEAD'),
  results: any[] = [],
  approvalsDenied: any[] = [];
let copiedAuth: string | undefined;
const persist = () =>
  writeFile(
    join(out, 'results.json'),
    JSON.stringify(
      {
        source,
        recoveryPolicy: RECOVERY_POLICY,
        routingPolicy: ROUTING_POLICY,
        reviewPolicy: REVIEW_POLICY,
        developmentOnly: true,
        initialPDFWorkerSynthetic: true,
        results,
        approvalsDenied,
      },
      null,
      2,
    ) + '\n',
  );
store.put('settings', 'main', {
  ...store.settings(),
  dailyLimit: 0.03,
  monthlyLimit: 0.03,
  maxRecovery: 2,
  recoveryEffortCeiling: 'medium',
  jevMode: 'assist',
  jevFallbackModel: 'codex:gpt-5.6-luna',
  jevInputPrice: 0.042,
  jevValidated: true,
  workPreferences: {},
});
const monitor = setInterval(() => {
  for (const p of store.approvals().filter((p) => p.status === 'pending')) {
    approvalsDenied.push({ taskId: p.taskId, operation: p.operation, allowed: false });
    try {
      approvals.decide(p.id, p.hash, false);
    } catch {}
  }
}, 100);
await persist();
try {
  // Negative and positive decision controls have known evidence; no worker is invoked.
  for (const control of [
    {
      id: 'arithmetic',
      expected: 'correction',
      prompt: 'Using the supplied costs, write their total.',
      source: 'Printing costs $120 and signs cost $80.',
      output: 'The total is $250.',
      failure: 'The sum must be $200; the output says $250.',
    },
    {
      id: 'missing-decision',
      expected: 'missing_context',
      prompt:
        'Name the person the user has selected as the final workshop owner. Do not propose an owner or leave this required decision unspecified.',
      source: 'The user has not selected an owner. Only the user can make this decision.',
      output: 'The owner is unspecified.',
      failure: 'The required owner decision is absent.',
    },
    {
      id: 'unavailable-tool',
      expected: 'tool_failure',
      prompt: 'Read the supplied PDF and summarize its contents.',
      source:
        'The native PDF reader is unavailable. No PDF text or alternate permitted reader is available.',
      output: 'I could not read the PDF.',
      failure: 'Execution receipt: PDF reader unavailable; no content was extracted.',
    },
  ]) {
    const task = {
      id: control.id,
      prompt: control.prompt,
      expectedResult: '',
      attachments: [],
      required: ['files'],
      revision: 0,
      verification: { files: [], command: '' },
      result: control.output,
      review: {
        status: 'failed',
        summary: control.failure,
        checks: [{ name: 'Controlled defect', status: 'failed', detail: control.failure }],
        limitations: [],
      },
    } as unknown as Task;
    const judgment = await engine.jev.recovery(
      task,
      { inputs: [{ path: 'brief.md', text: control.source, incomplete: false }] },
      AbortSignal.timeout(45000),
      'correction',
    );
    results.push({
      caseId: control.id,
      expected: control.expected,
      judgment,
      events: store.events(task.id),
      ...summarizeSpending(store.spending().filter((s) => s.taskId === task.id)),
    });
    await persist();
    console.log(`${control.id}: ${judgment.cause}`);
  }
  await mkdir(join(stateDir, 'codex'), { recursive: true, mode: 0o700 });
  copiedAuth = join(stateDir, 'codex', 'auth.json');
  await copyFile(join(resolve(arg('--auth-source')), 'codex', 'auth.json'), copiedAuth);
  await chmod(copiedAuth, 0o600);
  const health = await new CodexWorker(stateDir).health();
  if (!health.ready || !health.models?.length) throw new Error('Codex subscription unavailable');
  store.put('health', 'codex', {
    ...health,
    checkedAt: new Date().toISOString(),
    quotaCheckedAt: new Date().toISOString(),
  });
  const catalog = recordCatalog(store, 'codex', health.models);
  const luna = catalog.find((m) => m.id === 'codex:gpt-5.6-luna');
  if (!luna?.supportedEfforts?.includes('low')) throw new Error('Luna Low unavailable');
  for (const m of store.list<Model>('model'))
    store.put('model', m.id, { ...m, enabled: m.id === luna.id });
  store.put('roster', 'main', {
    version: 1,
    needsReview: false,
    savedAt: new Date().toISOString(),
  });
  let injected = false,
    realWorkers = 0;
  const real = engine.workers.codex;
  engine.jev.decide = async (task) => ({
    assessment: assessLocally(task),
    modelId: luna.id,
    effort: 'low',
    confidence: 1,
  });
  engine.workers.codex = {
    health: real.health?.bind(real),
    run: async (ctx) => {
      if (injected) {
        realWorkers++;
        return real.run(ctx);
      }
      injected = true;
      await ctx.tool('read_file', { path: 'brief.md' });
      await copyFile(
        'evals/fixtures/ownership-probe/checklist.pdf',
        join(ctx.workspace.path, 'checklist.pdf'),
      );
      ctx.emit('controlled_failure_injected', {
        reason: 'Original flawed PDF and initial Luna Low route, no initial worker inference',
      });
      ctx.emit('subscription_usage', {
        total: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
      return 'Saved checklist.pdf.';
    },
  };
  const path = join(out, 'ownership-probe');
  await mkdir(path);
  const brief = await readFile('evals/fixtures/ownership-probe/brief.md', 'utf8');
  await writeFile(join(path, 'brief.md'), brief);
  const workspace: Workspace = {
    id: randomUUID(),
    name: 'Correction validation',
    path,
    providers: ['codex'],
    instructions: [],
  };
  store.put('workspace', workspace.id, workspace);
  const task = await engine.create({
    workspaceId: workspace.id,
    prompt:
      'Read brief.md. Create a one-page launch checklist with explicit unresolved items. Save an actual checklist.pdf file. Preserve the supplied facts and label any invented examples.',
    required: ['files', 'artifacts'],
    expectedResult: '',
    verification: { files: ['checklist.pdf'], command: '' },
    evaluation: true,
  });
  const started = Date.now();
  while (
    !['completed', 'blocked', 'cancelled', 'interrupted'].includes(store.task(task.id).status)
  ) {
    if (Date.now() - started > 15 * 60 * 1000) {
      engine.cancel(task.id);
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  while (engine.active.has(task.id)) await new Promise((r) => setTimeout(r, 100));
  const final = store.task(task.id),
    events = store.events(task.id);
  let artifact: unknown;
  try {
    artifact = await inspectFile(workspace, 'checklist.pdf', AbortSignal.timeout(30000));
  } catch (error) {
    artifact = { error: (error as Error).message };
  }
  results.push({
    caseId: 'original-ownership-probe',
    status: final.status,
    error: final.error,
    realWorkers,
    route: final.route,
    review: final.review,
    result: final.result,
    artifact,
    usage: final.usage,
    subscriptionUsage: final.subscriptionUsage,
    events,
    inputUnchanged: (await readFile(join(path, 'brief.md'), 'utf8')) === brief,
    seedSHA256: hash(await readFile('evals/fixtures/ownership-probe/checklist.pdf')),
    ...summarizeSpending(store.spending().filter((s) => s.taskId === task.id)),
  });
  await persist();
  console.log(
    `ownership-probe: ${final.status}; real workers ${realWorkers}; review ${final.review?.status}`,
  );
} finally {
  clearInterval(monitor);
  await engine.shutdown().catch(() => {});
  await persist();
  await app.close().catch(() => {});
  if (copiedAuth) await rm(copiedAuth, { force: true });
}
