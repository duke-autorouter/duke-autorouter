// Frozen, invented development probes. This exercises Jev, not worker ability.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { Store } from '../../server/store.js';
import { Secrets } from '../../server/secrets.js';
import { Jev } from '../../server/adapters/jev.js';
import { TaskInput, type Task } from '../../server/types.js';
import { summarizeSpending } from '../../server/spending.js';
if (!process.argv.includes('--run')) {
  console.log('No calls made. --run and an empty output directory are required.');
  process.exit(0);
}
const out = resolve(process.argv[process.argv.indexOf('--out') + 1]);
await mkdir(out, { recursive: false });
const store = new Store(join(out, 'private.sqlite'));
store.put('settings', 'main', { ...store.settings(), dailyLimit: 0.01, monthlyLimit: 0.01,
  jevMode: 'assist', jevValidated: true, jevInputPrice: 0.042, maxRecovery: 0 });
const jev = new Jev(store, new Secrets());
const source = 'The fictional Cedar club meets on November 12. Nia coordinates invitations. The room has not been confirmed. No one has committed to another update.';
const prompt = 'Write a two-sentence update for the fictional Cedar club using only the supplied facts. State the meeting date and that the room is unconfirmed. Do not invent facts or commitments.';
const expectedResult = 'State November 12; say the room is unconfirmed; do not invent commitments';
const cases = [
  { id: 'supported', expected: 'passed', text: 'The Cedar club meets on November 12. The room is not yet confirmed.' },
  { id: 'contradicted-date', expected: 'failed', text: 'The Cedar club meets on November 19. The room is not yet confirmed.' },
  { id: 'invented-commitment', expected: 'failed', text: 'The Cedar club meets on November 12. The room is unconfirmed, and Nia will send everyone an update tomorrow.' },
  { id: 'missing-source', expected: 'unverified', text: 'The Cedar club meets on November 12. The room is not yet confirmed.', missing: true },
];
const results: any[] = [];
try {
  for (const probe of cases) {
    const task: Task = { ...TaskInput.parse({ prompt, expectedResult, workspaceId: 'fixture' }),
      id: probe.id, title: probe.id, status: 'running', attempt: 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const checks = await jev.review(task, {
      result: probe.text, files: [{ path: 'update.txt', bytes: Buffer.byteLength(probe.text),
        sha256: createHash('sha256').update(probe.text).digest('hex'), format: 'text', text: probe.text,
        incomplete: false, detail: 'Frozen fixture, not a worker output.' }],
      inputs: probe.missing ? [] : [{ path: 'brief.txt', text: source }], sources: [], checks: [],
      incomplete: !!probe.missing, limitations: probe.missing ? ['Source intentionally withheld'] : [],
    }, AbortSignal.timeout(90000));
    const observed = checks.some(c => c.status === 'failed') ? 'failed' : checks.some(c => c.status === 'unverified') ? 'unverified' : 'passed';
    results.push({ id: probe.id, expected: probe.expected, observed, checks,
      ...summarizeSpending(store.spending().filter(s => s.taskId === task.id)) });
    await writeFile(join(out, 'results.json'), JSON.stringify({ scope: 'Fresh invented Jev-only probes; no worker, efficiency, or calibration claim', source, prompt, expectedResult, cases, results }, null, 2));
  }
} finally { store.close(); }
