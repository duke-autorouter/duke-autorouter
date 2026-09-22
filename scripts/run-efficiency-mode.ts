import { chmod, copyFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { createApp } from '../server/app.js';
import { CodexWorker } from '../server/adapters/codex.js';
import { recordCatalog } from '../server/model-profiles.js';
import type { Model } from '../server/types.js';

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}.`);
  return args[index + 1];
};
const mode = value('--mode');
if (!['strong', 'rules', 'jev'].includes(mode)) throw new Error('Invalid pilot mode.');
const stateDir = resolve(value('--state-dir'));
const out = resolve(value('--out'));
const authSource = resolve(value('--auth-source'));
const existing = await readdir(stateDir).catch(() => []);
if (existing.length) throw new Error(`Disposable state directory is not empty: ${stateDir}`);
await mkdir(join(stateDir, 'codex'), { recursive: true, mode: 0o700 });
// The validated source profile is read-only. Copy only the supported Codex login
// receipt into this disposable profile; do not copy projects, tasks or history.
const copiedAuth = join(stateDir, 'codex', 'auth.json');
await copyFile(join(authSource, 'codex', 'auth.json'), copiedAuth);
await chmod(copiedAuth, 0o600);

const { app, store, approvals, launchToken } = await createApp({ stateDir, serveUI: false });
let launchPath: string | undefined;
const headlessApprovalDecisions: {
  taskId: string;
  operation: string;
  allowed: false;
  reason: string;
}[] = [];
const approvalMonitor = setInterval(() => {
  for (const pending of store.approvals().filter((approval) => approval.status === 'pending')) {
    headlessApprovalDecisions.push({
      taskId: pending.taskId,
      operation: pending.operation,
      allowed: false,
      reason:
        'The frozen evaluation fixtures authorize file tools, read-only shell checks, public-source reads and artifact creation only. Deletion, writable shell and browser mutation are outside scope.',
    });
    try {
      approvals.decide(pending.id, pending.hash, false);
    } catch {
      // A concurrent cancellation may expire the request before this bounded denial.
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
  const wanted = new Set([
    'codex:gpt-6-astra',
    'codex:gpt-5.6-sol',
    'codex:gpt-5.6-luna',
  ]);
  if ([...wanted].some((id) => !discovered.some((model) => model.id === id)))
    throw new Error('The frozen Astra, Sol and Luna roster is not available in this profile.');
  for (const model of store.list<Model>('model'))
    store.put('model', model.id, { ...model, enabled: wanted.has(model.id) });
  store.put('roster', 'main', {
    version: 1,
    needsReview: false,
    savedAt: new Date().toISOString(),
  });
  store.put('settings', 'main', {
    ...store.settings(),
    dailyLimit: 1,
    monthlyLimit: 1,
    jevMode: mode === 'rules' ? 'off' : 'assist',
    jevFallbackModel: 'codex:gpt-5.6-luna',
    jevInputPrice: 0.042,
    jevValidated: true,
    workPreferences: {},
  });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  launchPath = join(stateDir, 'launch.json');
  await writeFile(launchPath, JSON.stringify({ url, token: launchToken, pid: process.pid }), {
    mode: 0o600,
  });
  const evalArgs = [
    '--import',
    'tsx',
    'scripts/evaluate.ts',
    '--run',
    '--mode',
    mode,
    '--split',
    'development',
    '--limit',
    '4',
    '--out',
    out,
  ];
  if (mode === 'strong')
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
  if (exitCode !== 0) throw new Error(`Evaluation mode ${mode} exited ${exitCode}.`);
  const receipt = JSON.parse(await readFile(join(out, 'results.json'), 'utf8'));
  if (receipt.mode !== mode || receipt.results?.length !== 4)
    throw new Error(`Evaluation mode ${mode} did not produce four results.`);
  receipt.headlessApprovalPolicy = {
    default: 'deny',
    authorizedWithoutApproval: [
      'file reads and writes through scoped file tools',
      'read-only shell verification',
      'public-source reads',
      'artifact creation and inspection',
    ],
    denied: ['file removal', 'writable shell', 'browser mutation', 'other approval requests'],
  };
  receipt.headlessApprovalDecisions = headlessApprovalDecisions;
  await writeFile(join(out, 'results.json'), JSON.stringify(receipt, null, 2) + '\n');
} finally {
  clearInterval(approvalMonitor);
  await app.close().catch(() => {});
  if (launchPath) await unlink(launchPath).catch(() => {});
}
