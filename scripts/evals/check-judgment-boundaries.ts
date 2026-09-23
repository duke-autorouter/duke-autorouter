// Frozen, invented development probes. This exercises Jev, not worker ability.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { Store } from '../../server/store.js';
import { Secrets } from '../../server/secrets.js';
import { Jev } from '../../server/adapters/jev.js';
import { TaskInput, ModelInput, type Task } from '../../server/types.js';
import { summarizeSpending } from '../../server/spending.js';
if (!process.argv.includes('--run')) {
  console.log('No calls made. --run and an empty output directory are required.');
  process.exit(0);
}
const outIndex = process.argv.indexOf('--out');
if (outIndex < 0 || !process.argv[outIndex + 1]) throw Error('--out required');
const out = resolve(process.argv[outIndex + 1]);
await mkdir(out, { recursive: false });
const store = new Store(join(out, 'private.sqlite'));
store.put('settings', 'main', { ...store.settings(), dailyLimit: 0.01, monthlyLimit: 0.01,
  jevMode: 'assist', jevValidated: true, jevInputPrice: 0.042, maxRecovery: 0 });
const jev = new Jev(store, new Secrets());
const dependent = process.argv.includes('--dependent-only');
const source = dependent ? 'The fictional Delta club meets on December 3. No follow-up update has been promised.' : 'The fictional Cedar club meets on November 12. Nia coordinates invitations. The room has not been confirmed. No one has committed to another update.';
const prompt = dependent ? 'Write a one-sentence announcement of the fictional Delta club meeting using the supplied facts. Do not add a greeting; a signoff; or a promise of a future update.' : 'Write a two-sentence update for the fictional Cedar club using only the supplied facts. State the meeting date and that the room is unconfirmed. Do not invent facts or commitments.';
const expectedResult = dependent ? 'State the Delta club meeting date. Do not add a greeting; a signoff; or a promise of a future update.' : 'State November 12; say the room is unconfirmed; do not invent commitments';
const cases = dependent ? [
  { id: 'dependent-supported', expected: 'passed', text: 'The Delta club meets on December 3.', missing: false },
  { id: 'dependent-promise', expected: 'failed', text: 'The Delta club meets on December 3, and we will send another update tomorrow.', missing: false },
  { id: 'dependent-greeting', expected: 'failed', text: 'Hello everyone, the Delta club meets on December 3.', missing: false },
] : [
  { id: 'supported', expected: 'passed', text: 'The Cedar club meets on November 12. The room is not yet confirmed.' },
  { id: 'contradicted-date', expected: 'failed', text: 'The Cedar club meets on November 19. The room is not yet confirmed.' },
  { id: 'invented-commitment', expected: 'failed', text: 'The Cedar club meets on November 12. The room is unconfirmed, and Nia will send everyone an update tomorrow.' },
  { id: 'missing-source', expected: 'unverified', text: 'The Cedar club meets on November 12. The room is not yet confirmed.', missing: true },
];
const results: any[] = [];
try {
  if (process.argv.includes('--routing-only')) {
    const models = [
      ['gpt-6-luna', 'Small efficient model for routine and bounded work'],
      ['gpt-6-sol', 'General purpose model for coding and writing'],
      ['gpt-6-astra', 'Strong model for demanding reasoning'],
    ].map(([name, description]) => ModelInput.parse({ id: `codex:${name}`, provider: 'codex',
      model: name, label: name, enabled: true, evaluated: false, quality: { coding: 0, research: 0, writing: 0 },
      catalog: { description, discoveredAt: new Date().toISOString() },
      capabilities: ['files'], supportedEfforts: ['low', 'medium'], routingNotes: description }));
    for (const model of models) store.put('model', model.id, model);
    for (const [id, brief] of [
      ['route-copy', 'Rewrite these three labels in sentence case, retaining the order: ACCOUNT SETTINGS, TEAM MEMBERS, SAVE CHANGES. Return only the three revised labels.'],
      ['route-code', 'Implement a pure JavaScript function that groups an array of strings by their first character. Return a Map, skip empty strings, preserve input order within groups, and include tests for an empty array and repeated first characters.'],
    ]) {
      const task: Task = { ...TaskInput.parse({ prompt: brief, workspaceId: 'fixture' }),
        id, title: id, status: 'running', attempt: 1,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const decision = await jev.decide(task, models, AbortSignal.timeout(30000), {
        attachments: [], project: { entries: 0, fileTypes: {}, hasTests: false }, incomplete: false,
      });
      results.push({ id, brief, decision, observations: store.events(id).filter(e => ['jev_assessment', 'jev_selection', 'jev_unavailable'].includes(e.kind)).map(e => ({kind:e.kind,data:e.data})),
        ...summarizeSpending(store.spending().filter(s => s.taskId === id)) });
      await writeFile(join(out, 'results.json'), JSON.stringify({ scope: 'Fresh invented Jev-only routing probes; no worker execution or suitability proof', results }, null, 2));
    }
  }
  for (const probe of process.argv.includes('--routing-only') ? [] : cases) {
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
