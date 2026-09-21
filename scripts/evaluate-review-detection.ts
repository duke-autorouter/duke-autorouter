import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Store } from '../server/store.js';
import { Secrets } from '../server/secrets.js';
import { Jev } from '../server/adapters/jev.js';
import { defaults, type Task } from '../server/types.js';
import { reviewDetectionCases } from '../evals/review-detection.js';
const index = process.argv.indexOf('--out');
if (index < 0)
  throw new Error('Provide --out <results.json>; execute through the shared budget gate.');
const output = resolve(process.argv[index + 1]);
if (process.env.DUKE_REVIEW_DETECTION_AUTHORIZED !== '1')
  throw new Error('Explicit live evaluation authorization required.');
const dir = await mkdtemp(join(tmpdir(), 'duke-review-detection-'));
const store = new Store(join(dir, 'db'));
store.put('settings', 'main', { ...defaults, dailyLimit: 0.02, monthlyLimit: 0.02 });
const jev = new Jev(store, new Secrets());
const results: any[] = [];
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
const persist = async () => {
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        source,
        dirty,
        fixtureHash: createHash('sha256')
          .update(JSON.stringify(reviewDetectionCases))
          .digest('hex'),
        developmentOnly: true,
        results,
      },
      null,
      2,
    ) + '\n',
  );
};
try {
  for (const row of reviewDetectionCases) {
    const requirement =
      'requirement' in row
        ? row.requirement
        : 'Preserve supplied facts, label proposals and leave unknown details unresolved.';
    const task = {
      id: row.id,
      prompt: 'Create a factual note from brief.md.',
      expectedResult: requirement,
      required: ['files'],
      verification: { files: ['note.md'], command: '' },
    } as unknown as Task;
    const checks = await jev.review(
      task,
      {
        result: 'Saved note.md.',
        files: [
          {
            path: 'note.md',
            text: row.output,
            bytes: row.output.length,
            sha256: createHash('sha256').update(row.output).digest('hex'),
            format: '.md',
            incomplete: false,
            detail: 'Fixed development fixture',
          },
        ],
        inputs: [{ path: 'brief.md', text: row.brief }],
        sources: [],
        checks: [],
        limitations: [],
        incomplete: 'incomplete' in row && row.incomplete,
      },
      AbortSignal.timeout(75000),
    );
    const spending = store.spending().filter((s) => s.taskId === row.id);
    const status = checks.some((c) => c.status === 'failed')
      ? 'failed'
      : checks.some((c) => c.status === 'unverified')
        ? 'unverified'
        : 'passed';
    results.push({
      caseId: row.id,
      expected: row.expected,
      status,
      checks,
      events: store.events(row.id),
      apiCostUSD: spending.reduce((s, r) => s + Number(r.actual ?? 0) / 1e6, 0),
      unreconciledRequests: spending.filter((s) => s.actual === null).length,
      reservedAPIUSD: spending
        .filter((s) => s.actual === null)
        .reduce((s, r) => s + r.reserved / 1e6, 0),
    });
    await persist();
    console.log(`${row.id}: ${status} (expected ${row.expected})`);
  }
} finally {
  await persist();
  store.close();
}
