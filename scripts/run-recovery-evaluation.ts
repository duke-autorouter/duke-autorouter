import { chmod, copyFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { createApp } from '../server/app.js';
import { CodexWorker } from '../server/adapters/codex.js';
import { recordCatalog } from '../server/model-profiles.js';
import { assessLocally } from '../server/router.js';
import type { Model } from '../server/types.js';

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}.`);
  return args[index + 1];
};
const mode = value('--mode');
if (!['strong-medium', 'jev', 'probe'].includes(mode))
  throw new Error('Invalid corrected pilot mode.');
const stateDir = resolve(value('--state-dir'));
const out = resolve(value('--out'));
const caseIds = value('--case-ids');
if (!caseIds || new Set(caseIds.split(',')).size !== caseIds.split(',').length)
  throw new Error('Unique case IDs required.');
if (mode === 'probe' && caseIds !== 'coding-chunks')
  throw new Error('The controlled probe is only coding-chunks.');
const authSource = resolve(value('--auth-source'));
const existing = await readdir(stateDir).catch(() => []);
if (existing.length) throw new Error(`Disposable state directory is not empty: ${stateDir}`);
await mkdir(join(stateDir, 'codex'), { recursive: true, mode: 0o700 });
const copiedAuth = join(stateDir, 'codex', 'auth.json');
await copyFile(join(authSource, 'codex', 'auth.json'), copiedAuth);
await chmod(copiedAuth, 0o600);

const { app, store, engine, approvals, launchToken } = await createApp({
  stateDir,
  serveUI: false,
});
let launchPath: string | undefined;
const decisions: Array<Record<string, unknown>> = [];
const monitor = setInterval(() => {
  for (const pending of store.approvals().filter((approval) => approval.status === 'pending')) {
    decisions.push({
      taskId: pending.taskId,
      operation: pending.operation,
      allowed: false,
      reason:
        'The frozen evaluation permits scoped file tools, read-only checks, public-source reads and artifact creation only.',
    });
    try {
      approvals.decide(pending.id, pending.hash, false);
    } catch {
      // A concurrent cancellation may expire the request.
    }
  }
}, 100);

try {
  const health = await new CodexWorker(stateDir).health();
  if (!health.ready || !health.models?.length)
    throw new Error(`Codex subscription unavailable: ${health.message}`);
  store.put('health', 'codex', {
    ...health,
    checkedAt: new Date().toISOString(),
    quotaCheckedAt: new Date().toISOString(),
  });
  const discovered = recordCatalog(store, 'codex', health.models);
  const wanted = new Set(['codex:gpt-6-astra', 'codex:gpt-5.6-sol', 'codex:gpt-5.6-luna']);
  if ([...wanted].some((id) => !discovered.some((candidate) => candidate.id === id)))
    throw new Error('The frozen Astra, Sol and Luna roster is not available.');
  for (const candidate of store.list<Model>('model'))
    store.put('model', candidate.id, {
      ...candidate,
      enabled: wanted.has(candidate.id),
    });
  store.put('roster', 'main', {
    version: 1,
    needsReview: false,
    savedAt: new Date().toISOString(),
  });
  store.put('settings', 'main', {
    ...store.settings(),
    dailyLimit: 0.02,
    monthlyLimit: 0.02,
    maxRecovery: 2,
    recoveryEffortCeiling: 'medium',
    jevMode: 'assist',
    jevFallbackModel: 'codex:gpt-5.6-luna',
    jevInputPrice: 0.042,
    jevValidated: true,
    workPreferences: {},
  });
  if (mode === 'probe') {
    // Deliberately injected first route and broken worker output. This checks the
    // recovery mechanism; it is never part of the natural-task efficiency cohort.
    const realWorker = engine.workers.codex;
    let injected = false;
    const decide = engine.jev.decide.bind(engine.jev);
    engine.jev.decide = async (task, models, signal, context) =>
      !injected
        ? {
            assessment: assessLocally(task),
            modelId: 'codex:gpt-5.6-luna',
            effort: 'low',
            confidence: 1,
          }
        : decide(task, models, signal, context);
    engine.workers.codex = {
      ...realWorker,
      health: realWorker.health?.bind(realWorker),
      run: async (context) => {
        if (injected) return realWorker.run(context);
        injected = true;
        context.emit('controlled_failure_injected', {
          reason: 'A deliberately wrong empty-array implementation; no first worker inference.',
        });
        context.emit('subscription_usage', {
          total: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
        await context.tool('write_file', {
          path: 'solution.mjs',
          content: 'export function solve() { return []; }\n',
        });
        return 'Saved solution.mjs.';
      },
    };
  }
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  launchPath = join(stateDir, 'launch.json');
  await writeFile(launchPath, JSON.stringify({ url, token: launchToken, pid: process.pid }), {
    mode: 0o600,
  });
  const executionMode = mode === 'strong-medium' ? 'strong' : 'jev';
  const evalArgs = [
    '--import',
    'tsx',
    'scripts/evaluate.ts',
    '--run',
    '--mode',
    executionMode,
    '--receipt-mode',
    mode === 'probe' ? 'jev' : mode,
    '--split',
    'development',
    '--case-ids',
    caseIds,
    '--out',
    out,
  ];
  if (executionMode === 'strong')
    evalArgs.push('--model', 'codex:gpt-6-astra', '--effort', 'medium');
  const child = spawn(process.execPath, evalArgs, {
    cwd: process.cwd(),
    env: { ...process.env, ROUTER_DATA_DIR: stateDir },
    stdio: 'inherit',
  });
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Recovery evaluation mode ${mode} exited ${exitCode}.`);
  const receipt = JSON.parse(await readFile(join(out, 'results.json'), 'utf8'));
  receipt.controlledFailureProbe = mode === 'probe';
  if (receipt.results?.length !== caseIds.split(',').length)
    throw new Error(`Recovery mode ${mode} did not produce all labeled results.`);
  receipt.headlessApprovalPolicy = {
    default: 'deny',
    authorizedWithoutApproval: [
      'scoped file tools',
      'read-only shell verification',
      'public-source reads',
      'artifact creation',
    ],
    denied: ['file removal', 'writable shell', 'browser mutation', 'other approval requests'],
  };
  receipt.headlessApprovalDecisions = decisions;
  await writeFile(join(out, 'results.json'), JSON.stringify(receipt, null, 2) + '\n');
} finally {
  clearInterval(monitor);
  await app.close().catch(() => {});
  if (launchPath) await unlink(launchPath).catch(() => {});
}
