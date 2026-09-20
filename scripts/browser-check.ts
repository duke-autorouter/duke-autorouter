import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../server/app.js';
import { Jev } from '../server/adapters/jev.js';
import { ModelInput, type Worker } from '../server/types.js';
import { recordCatalog } from '../server/model-profiles.js';

const root = await realpath(await mkdtemp(join(tmpdir(), 'duke-browser-'))),
  workspace = join(root, 'workspace');
await mkdir(workspace);
await mkdir('outputs', { recursive: true });
await writeFile(join(workspace, 'instructions.md'), 'Use concise, source-backed writing.');
// Injected only into this test app. Production has no simulated-worker switch.
const synthetic: Worker = {
  run: async (c) => {
    const reset = Date.now() / 1000 + 5 * 3600;
    const quota = (usedPercent: number) => ({
      rateLimits: {
        limitId: 'fixture',
        primary: { usedPercent, windowDurationMins: 300, resetsAt: reset },
      },
    });
    c.emit('allowance_snapshot', {
      phase: 'before',
      quota: quota(10),
      at: new Date().toISOString(),
    });
    c.emit('subscription_usage', {
      total: { inputTokens: 80, outputTokens: 20, totalTokens: 100 },
    });
    if (c.task.prompt.includes('Wait'))
      return new Promise((_, reject) =>
        c.signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true }),
      );
    if (c.task.prompt.includes('Remove')) {
      await c.tool('remove_file', { path: 'note.md' });
      return 'Removed the file to recoverable storage.';
    }
    if (c.task.prompt.includes('formats')) {
      for (const format of ['markdown', 'html', 'pdf', 'docx', 'xlsx']) {
        const ext = format === 'markdown' ? 'md' : format;
        await c.tool('create_artifact', {
          path: `artifacts/example.${ext}`,
          format,
          content:
            format === 'html'
              ? '<html><body><h1>Verified artifact</h1><p>Local browser check.</p><script>parent.document.body.innerHTML="UNSAFE"</script></body></html>'
              : 'Verified artifact\nLocal browser check.',
          rows: [
            ['Task', 'Status'],
            ['Example', 'Verified'],
          ],
        });
      }
      return 'Created all five artifact formats.';
    }
    const research = c.task.route?.kind === 'research';
    if (research)
      c.emit('tool_completed', {
        name: 'web_read',
        result: {
          url: 'https://example.org/synthetic-source',
          text: 'Invented browser-test evidence comparing distributed architecture.',
        },
      });
    await c.tool('write_file', {
      path: 'note.md',
      content: research
        ? '# Synthetic research\nA fixture comparison. [Source](https://example.org/synthetic-source)'
        : '# Verified\nA real file created by the test tool broker.',
    });
    await c.tool('checkpoint', { summary: 'Saved note.md', remaining: '', artifacts: ['note.md'] });
    c.emit('allowance_snapshot', {
      phase: 'after',
      quota: quota(11),
      at: new Date().toISOString(),
    });
    return 'Created note.md and readied it for review.';
  },
};
const r = await createApp({
  stateDir: join(root, 'state'),
  workers: { codex: synthetic, claude: synthetic, openrouter: synthetic },
});
// Local checks must never read the user's saved Jev key or make inference calls.
r.engine.jev = new Jev(r.store, { get: async () => undefined } as any);
r.store.put('settings', 'main', { ...r.store.settings(), jevFallbackModel: 'fixture' });
r.store.put(
  'model',
  'fixture',
  ModelInput.parse({
    id: 'fixture',
    provider: 'codex',
    model: 'fixture',
    label: 'Synthetic verification worker',
    enabled: false,
    evaluated: true,
    evidence: 'Browser test injection only',
    maxDifficulty: 'complex',
    capabilities: ['files', 'shell', 'web', 'browser', 'artifacts'],
    supportedEfforts: ['low', 'high'],
    quality: { coding: 1, research: 1, writing: 1, documents: 1 },
  }),
);
const url = await r.app.listen({ host: '127.0.0.1', port: 0 }),
  browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
async function waitFor(fn: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((res) => setTimeout(res, 100));
  }
  const t = r.store.tasks()[0];
  throw new Error(
    'Browser assertion timed out: ' +
      JSON.stringify({ status: t?.status, error: t?.error, review: t?.review }),
  );
}
async function start(prompt: string) {
  const previousId = r.store.tasks()[0]?.id;
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Describe your task').fill(prompt);
  await page.getByRole('button', { name: 'Start task', exact: true }).click();
  await waitFor(async () => !!r.store.tasks()[0] && r.store.tasks()[0].id !== previousId);
}
try {
  await page.goto(url + '/#launch=' + r.launchToken);
  await page.getByRole('heading', { name: 'What are we working on?', exact: true }).waitFor();
  assert.equal(await page.title(), 'DUKE Autorouter');
  await page.getByRole('link', { name: 'DUKE Autorouter', exact: true }).waitFor();
  await page.screenshot({ path: 'outputs/home-desktop.png', fullPage: false });
  const draft = 'A draft preserved while adding a project.';
  await page.getByLabel('Describe your task').fill(draft);
  await page.getByRole('button', { name: '+ Task options', exact: true }).click();
  assert.equal(await page.getByLabel('Model routing').count(), 0);
  assert.equal(await page.getByLabel('Test command', { exact: true }).isVisible(), false);
  await page.getByRole('button', { name: '＋ Add a project', exact: true }).click();
  const projectDialog = page.getByRole('dialog', { name: 'Add a project', exact: true });
  await projectDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.getByLabel('Describe your task').inputValue(), draft);
  assert.equal(r.store.list('workspace').length, 0);
  await page.getByRole('button', { name: '＋ Add a project', exact: true }).click();
  await projectDialog.getByLabel('Project name', { exact: true }).fill('Browser verification');
  await projectDialog.getByLabel('Project folder', { exact: true }).fill(join(root, 'missing'));
  await projectDialog.getByRole('button', { name: 'Add project', exact: true }).click();
  await projectDialog.getByRole('alert').waitFor();
  await projectDialog.getByLabel('Project folder', { exact: true }).fill(workspace);
  await projectDialog.getByRole('button', { name: 'Add project', exact: true }).click();
  await projectDialog.waitFor({ state: 'hidden' });
  assert.equal(await page.getByLabel('Describe your task').inputValue(), draft);
  assert.equal(
    await page.getByLabel('Project', { exact: true }).inputValue(),
    r.store.list<any>('workspace')[0].id,
  );
  await page.getByLabel('Project', { exact: true }).selectOption('__add_project__');
  await projectDialog.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(
    await page.getByLabel('Project', { exact: true }).inputValue(),
    r.store.list<any>('workspace')[0].id,
  );
  assert.equal(await page.getByLabel('Describe your task').inputValue(), draft);
  console.log(
    'PASS first project creation, invalid-path recovery, cancel, selection and draft preservation',
  );
  await page.getByRole('button', { name: 'Connections & setup' }).click();
  assert.equal(await page.getByRole('checkbox', { name: /Jev/ }).count(), 0);
  await page.getByText('Choose at least one model to start routing.', { exact: true }).waitFor();
  recordCatalog(r.store, 'openrouter', [
    { id: 'fixture/api', name: 'Fixture API model', supported_parameters: ['tools'] },
  ]);
  await page.getByRole('button', { name: 'Choose models', exact: true }).click();
  const roster = page.getByRole('dialog', { name: 'Choose models', exact: true });
  await roster.getByRole('checkbox', { name: /Synthetic verification worker/ }).check();
  await roster.getByRole('button', { name: 'Save model selection' }).click();
  await waitFor(async () => r.store.get<any>('model', 'fixture')?.enabled === true);
  assert.equal(r.store.get<any>('model', 'openrouter:fixture/api')?.enabled, false);
  await page.getByText('Starting preferences', { exact: false }).click();
  await page.getByLabel('Writing and drafting', { exact: true }).selectOption('fixture');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await waitFor(async () => r.store.settings().workPreferences?.writing === 'fixture');
  recordCatalog(r.store, 'openrouter', [
    { id: 'fixture/new', name: 'New catalog choice', supported_parameters: ['tools'] },
  ]);
  assert.equal(r.store.get<any>('model', 'openrouter:fixture/new')?.enabled, false);
  await page.getByRole('button', { name: 'Choose models', exact: true }).click();
  await roster.getByLabel('Connection', { exact: true }).selectOption('openrouter');
  await roster.getByLabel('Search models', { exact: true }).fill('Fixture API');
  await roster.getByRole('checkbox', { name: /Fixture API model/ }).check();
  await page.screenshot({ path: 'outputs/model-roster-picker.png', fullPage: false });
  await roster.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(r.store.get<any>('model', 'openrouter:fixture/api')?.enabled, false);
  await page.screenshot({ path: 'outputs/model-roster-desktop.png', fullPage: true });
  console.log(
    'PASS explicit model selection, searchable optional catalog, saved starting preferences and cancelled draft isolation',
  );
  assert.equal(Object.hasOwn(r.store.list<any>('workspace')[0], 'jevAllowed'), false);
  await page.getByText(workspace, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Project settings', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { name: /Jev/ }).count(), 0);
  await page
    .locator('.modal')
    .getByRole('group', { name: 'Accounts for this project', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Save project settings', exact: true }).click();
  await page.getByRole('button', { name: 'Import instructions', exact: true }).click();
  await page.getByLabel('File path', { exact: true }).fill(join(workspace, 'instructions.md'));
  await page.getByRole('button', { name: 'Preview file', exact: true }).click();
  await page.getByRole('button', { name: 'Import this copy' }).click();
  await page.getByText('1 instruction file', { exact: false }).waitFor();
  const reviewedModel = r.store.get<any>('model', 'fixture');
  r.store.put('model', 'fixture', { ...reviewedModel, evaluated: false, evidence: '' });
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Describe your task').fill('Write a note for the first manual trial');
  const routePreview = page.getByRole('status', { name: 'Route preview' });
  await routePreview.getByText(/Auto route needs reviewed results/).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Start task', exact: true }).isDisabled());
  assert.equal(r.store.tasks().length, 0);
  assert.deepEqual(r.store.spending(), []);
  await page.screenshot({ path: 'outputs/route-preview-blocked.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'outputs/route-preview-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '+ Task options', exact: true }).click();
  await page.getByLabel('Model routing').selectOption('fixture');
  await routePreview.getByText('Estimated model: Synthetic verification worker').waitFor();
  await page.screenshot({ path: 'outputs/route-preview-manual.png', fullPage: true });
  await page.getByRole('button', { name: 'Start task', exact: true }).click();
  await waitFor(async () => r.store.tasks()[0].status === 'completed');
  assert.equal(r.store.tasks()[0].modelOverride, 'fixture');
  assert.equal(r.store.tasks()[0].route?.modelId, 'fixture');
  r.store.put('model', 'fixture', reviewedModel);
  console.log(
    'PASS blocked auto-route preview, explicit manual trial, no preview spend, mobile preview',
  );
  await start('Write a verified note');
  await waitFor(async () => r.store.tasks()[0].status === 'completed');
  await page
    .locator('.result-text')
    .filter({ hasText: 'Created note.md and readied it for review.' })
    .waitFor();
  assert.match(await readFile(join(workspace, 'note.md'), 'utf8'), /Verified/);
  await page.getByRole('button', { name: 'Worked', exact: true }).click();
  await page.getByText('Saved.', { exact: true }).waitFor();
  assert.equal(r.store.get<any>('feedback', r.store.tasks()[0].id)?.rating, 'worked');
  console.log('PASS workspace, instruction import, task execution, real artifact, checkpoint');
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Describe your task').fill('Write a short note');
  await page.getByRole('button', { name: '+ Task options', exact: true }).click();
  await page
    .getByLabel('Result instructions (optional)')
    .fill('Compare distributed system architecture');
  await page
    .getByRole('status', { name: 'Route preview' })
    .getByText(/complex research.*local rules estimate/i)
    .waitFor();
  await page.getByRole('button', { name: 'Start task', exact: true }).click();
  await waitFor(
    async () =>
      r.store.tasks()[0].status === 'completed' &&
      r.store.tasks()[0].prompt === 'Write a short note',
  );
  assert.equal(r.store.tasks()[0].route?.assessment.difficulty, 'complex');
  assert.equal(r.store.tasks()[0].route?.kind, 'research');
  console.log(
    'PASS first-party feedback and consistent difficulty preview including success criteria',
  );
  await start('Create all formats');
  await waitFor(async () => r.store.tasks()[0].status === 'completed');
  await page
    .locator('.result-text')
    .filter({ hasText: 'Created all five artifact formats.' })
    .waitFor();
  await page.screenshot({ path: 'outputs/task-deliverables.png', fullPage: false });
  const artifact = page.locator('.artifact').filter({ hasText: 'artifacts/example.html' });
  await artifact.getByRole('button', { name: 'Preview' }).click();
  await page.frameLocator('iframe').getByText('Verified artifact', { exact: true }).waitFor();
  assert.equal(await page.locator('.app-shell').count(), 1);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  console.log('PASS five artifact formats, sandboxed HTML preview');
  for (const format of ['pdf', 'docx', 'xlsx']) {
    await page.locator('.artifact').filter({ hasText: `artifacts/example.${format}` })
      .getByRole('button', { name: 'Preview' }).click();
    const previewImage = page.locator('.document-preview img');
    await previewImage.waitFor();
    await waitFor(() => previewImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 10));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }
  console.log('PASS PDF, Word and spreadsheet previews render images');
  await start('Remove the note');
  await page.getByRole('button', { name: 'Approve this action' }).waitFor();
  await page.screenshot({ path: 'outputs/approval.png', fullPage: true });
  await page.getByRole('button', { name: 'Approve this action' }).click();
  await waitFor(async () => r.store.tasks()[0].status === 'completed');
  await assert.rejects(() => readFile(join(workspace, 'note.md')));
  console.log('PASS approval through real UI and recoverable removal');
  await start('Wait for cancellation');
  await page.getByRole('button', { name: 'Stop task' }).waitFor();
  await page.getByRole('button', { name: 'Stop task' }).click();
  await waitFor(async () => r.store.tasks()[0].status === 'cancelled');
  console.log('PASS cancellation through real UI');
  await page.getByRole('button', { name: 'Usage & routing' }).click();
  await page.getByLabel('Daily API limit ($)', { exact: true }).fill('4');
  await page.getByLabel(/^Jev fallback model/).selectOption('');
  await page.getByRole('button', { name: 'Save routing policy' }).click();
  await waitFor(async () => r.store.settings().dailyLimit === 4);
  assert.equal(r.store.settings().jevFallbackModel, '');
  await page.reload();
  await page.getByRole('button', { name: 'Usage & routing' }).click();
  assert.equal(await page.getByLabel(/^Jev fallback model/).inputValue(), '');
  await page.getByLabel(/^Jev fallback model/).selectOption('fixture');
  await page.getByRole('button', { name: 'Save routing policy' }).click();
  await waitFor(async () => r.store.settings().jevFallbackModel === 'fixture');
  // Exercise the actual Jev adapter and UI using a synthetic transport in this
  // temporary test app. No remote inference or personal workspace permission changes.
  let jevCalls = 0;
  r.engine.jev = new Jev(
    r.store,
    { get: async () => 'fixture-key' } as any,
    async (_url, options) => {
      jevCalls++;
      const body = JSON.parse(String(options?.body));
      const answers = body.questions.difficulty
        ? {
            kind: {
              type: 'choice',
              choice: 'coding',
              confidence: 1,
              probabilities: { coding: 1, research: 0, writing: 0, documents: 0 },
            },
            difficulty: {
              type: 'score',
              score: 2,
              confidence: 1,
              probabilities: { '0': 0, '1': 0, '2': 1 },
            },
          }
        : body.questions.brief
          ? Object.fromEntries(
              ['brief', 'support', 'completion'].map((id) => [
                id,
                {
                  type: 'choice',
                  choice: 'pass',
                  confidence: 1,
                  probabilities: { pass: 1, fail: 0, unknown: 0 },
                },
              ]),
            )
          : {
              model: {
                type: 'choice',
                choice: 'candidate_0',
                confidence: 1,
                probabilities: Object.fromEntries(
                  Object.keys(body.questions.model.criteria).map((key) => [
                    key,
                    Number(key === 'candidate_0'),
                  ]),
                ),
              },
            };
      return Response.json({ model: 'fixture-jev', answers, usage: { input_tokens: 10 } });
    },
  );
  assert.equal(r.store.settings().jevMode, 'assist');
  assert.equal(r.store.settings().jevValidated, false);
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Describe your task').fill('Debug a distributed system');
  await page
    .getByRole('status', { name: 'Route preview' })
    .getByText(/Jev may choose another model/)
    .waitFor();
  assert.equal(jevCalls, 0);
  await page.getByRole('button', { name: 'Start task', exact: true }).click();
  await waitFor(
    async () =>
      r.store.tasks()[0]?.route?.selectionSource === 'jev' &&
      r.store.tasks()[0]?.status === 'completed',
  );
  await page
    .locator('.route-card')
    .getByText(/Complex coding task · Jev selected this model/)
    .waitFor();
  assert.equal(r.store.tasks()[0].modelOverride, undefined);
  assert.equal(r.store.tasks()[0].route?.effort, 'low');
  await page.locator('.route-card').getByText('fixture · Low effort', { exact: true }).waitFor();
  assert.equal(jevCalls, 3);
  await page
    .getByRole('group', { name: 'Resource receipts', exact: true })
    .locator(':scope > summary')
    .click();
  await page
    .getByRole('group', { name: 'Token usage' })
    .getByText('130 reported tokens', { exact: true })
    .click();
  await page.getByText('Routing 20 · Workers 100 · Review 10', { exact: true }).waitFor();
  assert.equal(r.store.tasks()[0].usage?.complete, true);
  console.log(
    'PASS token receipt includes routing, worker and review without double-counting snapshots',
  );
  const allowance = page.getByRole('group', { name: 'Subscription allowance', exact: true });
  await allowance.locator('summary').click();
  await allowance.getByText(/reported use changed from 10% to 11%/).waitFor();
  await allowance.getByText(/Other apps may contribute/).waitFor();
  assert.equal(r.store.tasks()[0].subscriptionUsage?.unobservedAttempts, 0);
  await page.screenshot({ path: 'outputs/resource-receipts-desktop.png', fullPage: false });
  console.log(
    'PASS subscription allowance receipt reports observed account change separately from tokens',
  );
  assert.equal(
    await page.getByRole('group', { name: 'Automatic checks' }).getAttribute('open'),
    null,
  );
  await page.getByRole('group', { name: 'Automatic checks' }).locator(':scope > summary').click();
  await page
    .getByText('No repeatable test command was provided or run by the worker.', { exact: true })
    .last()
    .waitFor();
  assert.equal(r.store.tasks()[0].review?.status, 'unverified');
  await page.getByText('Saved · checks incomplete', { exact: true }).waitFor();
  await page.screenshot({ path: 'outputs/jev-automatic-selection.png', fullPage: false });
  console.log(
    'PASS Jev difficulty assessment, automatic selection and dispatch through the UI, zero preview inference',
  );
  await page.getByRole('button', { name: 'Usage & routing' }).click();
  await page.screenshot({ path: 'outputs/usage.png', fullPage: false });
  const uncertainId = r.store.reserve('stopped-synthetic-task', 'jev', 0.02);
  await page.getByRole('button', { name: 'Review request ledger', exact: true }).click();
  const ledger = page.getByRole('region', { name: 'API request ledger' });
  await ledger.getByRole('button', { name: 'Review charge', exact: true }).click();
  const reviewCharge = page.getByRole('form', { name: 'Review uncertain charge' });
  assert.equal(await reviewCharge.getByLabel('Verified charge (USD)').inputValue(), '');
  await reviewCharge.getByLabel('Verified charge (USD)').fill('0.001234');
  await reviewCharge
    .getByLabel('Billing reference or verification note')
    .fill('Synthetic provider billing record 123');
  await reviewCharge.getByRole('button', { name: 'Record verified charge', exact: true }).click();
  await ledger.getByText('Synthetic provider billing record 123', { exact: true }).waitFor();
  assert.equal(r.store.spending().find((row) => row.id === uncertainId)?.actual, 1234);
  await page.screenshot({ path: 'outputs/spending-reconciliation.png', fullPage: false });
  console.log(
    'PASS explicit billing correction, empty initial charge, persisted audit and exact microdollar display',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Connections & setup' }).click();
  await page.screenshot({ path: 'outputs/setup-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS settings, mobile layout, no JavaScript errors');
  await writeFile(
    'outputs/browser-verification.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        mode: 'Synthetic Jev transport and workers; real server, UI, SQLite, file tools, artifact creation, approvals and cancellation',
        checks: 13,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await r.app.close();
  await rm(root, { recursive: true, force: true });
}
