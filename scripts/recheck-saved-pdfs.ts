// Review fixed artifacts without rerunning or editing their workers.
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.js';
import { Secrets } from '../server/secrets.js';
import { Jev } from '../server/adapters/jev.js';
import { inspectFile } from '../server/task-evidence.js';
import type { Task, Workspace } from '../server/types.js';
const value = (name: string) => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing ${name}`);
  return resolve(process.argv[i + 1]);
};
const root = value('--root'),
  output = value('--out');
if (process.env.DUKE_REVIEW_DETECTION_AUTHORIZED !== '1')
  throw new Error('Explicit live review authorization required.');
const state = await mkdtemp(join(tmpdir(), 'duke-pdf-recheck-'));
const store = new Store(join(state, 'db'));
store.put('settings', 'main', { ...store.settings(), dailyLimit: 0.01, monthlyLimit: 0.01 });
const jev = new Jev(store, new Secrets());
const results: any[] = [];
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const persist = async () => {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify({ source, savedArtifactRecheck: true, workersRerun: 0, results }, null, 2) +
      '\n',
  );
};
try {
  for (const mode of ['jev', 'astra']) {
    const path = join(root, mode, 'documents-checklist-pdf');
    const workspace = {
      id: mode,
      name: 'Saved invented PDF fixture',
      path,
      providers: [],
      instructions: [],
    } as Workspace;
    const signal = AbortSignal.timeout(75000);
    const file = await inspectFile(workspace, 'checklist.pdf', signal);
    const brief = await readFile(join(path, 'brief.md'), 'utf8');
    const task = {
      id: mode,
      prompt:
        'Read brief.md. Create a one-page launch checklist with explicit unresolved items. Save an actual checklist.pdf file. Preserve the supplied facts and label any invented examples.',
      expectedResult: '',
      required: ['files', 'artifacts'],
      verification: { files: ['checklist.pdf'], command: '' },
      route: { kind: 'documents' },
    } as unknown as Task;
    const checks = await jev.review(
      task,
      {
        result: 'Saved checklist.pdf.',
        files: [file],
        inputs: [{ path: 'brief.md', text: brief }],
        sources: [],
        checks: [],
        incomplete: file.incomplete,
        limitations: [],
      },
      signal,
    );
    const spending = store.spending().filter((s) => s.taskId === mode);
    const after = createHash('sha256')
      .update(await readFile(join(path, 'checklist.pdf')))
      .digest('hex');
    if (after !== file.sha256) throw new Error('Saved artifact changed during review.');
    results.push({
      caseId: mode,
      expected: mode === 'jev' ? 'fail' : 'pass',
      status: checks.some((c) => c.status === 'failed')
        ? 'failed'
        : checks.some((c) => c.status === 'unverified')
          ? 'unverified'
          : 'passed',
      artifactSHA256: after,
      sourceSHA256: createHash('sha256').update(brief).digest('hex'),
      checks,
      events: store.events(mode),
      apiCostUSD: spending.reduce((n, s) => n + Number(s.actual ?? 0) / 1e6, 0),
      unreconciledRequests: spending.filter((s) => s.actual === null).length,
    });
    await persist();
    console.log(`${mode}: ${results.at(-1).status}`);
  }
} finally {
  await persist();
  store.close();
}
