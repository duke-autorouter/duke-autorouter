import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { Jev } from '../server/adapters/jev.js';
import { ModelInput, type Worker } from '../server/types.js';

const root = await realpath(await mkdtemp(join(tmpdir(), 'duke-import-browser-')));
const source = join(root, 'sample-setup'),
  workspace = join(root, 'workspace');
await mkdir(join(source, 'skills', 'brief'), { recursive: true });
await mkdir(workspace);
await mkdir('outputs', { recursive: true });
await writeFile(
  join(source, 'AGENTS.md'),
  '# Working instructions\nRead [[VOICE_GUIDE]] and use the brief skill when writing a brief.',
);
await writeFile(join(source, 'CLAUDE.md'), '# Alternate entry\nOther host instructions.');
await writeFile(
  join(source, 'VOICE_GUIDE.md'),
  '# Voice guide\nState the recommendation first. Use warm, concise language.',
);
await writeFile(
  join(source, 'skills/brief/SKILL.md'),
  '---\nname: Decision brief\ndescription: Turn a decision into a short recommendation and evidence summary.\nallowed-tools: [Read, Write]\n---\nUse [this template](template.md).',
);
await writeFile(
  join(source, 'skills/brief/template.md'),
  '# Recommendation\nA concrete recommendation.\n\n## Evidence\nA short supporting explanation.',
);
// Fixture picker helper: validates UI/API wiring, without opening a native dialog in a headless test.
const helper = join(root, 'picker');
await writeFile(
  helper,
  '#!/bin/sh\nprintf "%s\\n" ' + "'" + source.replaceAll("'", "'\\''") + "'\n",
  { mode: 0o700 },
);
const previousHelper = process.env.DUKE_DESKTOP_EXECUTABLE;
process.env.DUKE_DESKTOP_EXECUTABLE = helper;
const worker: Worker = {
  run: async (c) => {
    assert.match(c.prompt, /recommendation first/);
    const index = await c.tool('setup_list', {});
    const template = index.files.find((f: any) => f.path.endsWith('template.md'));
    const result = await c.tool('setup_read', { id: template.id });
    await c.tool('write_file', { path: 'brief.md', content: result.content });
    return 'Created a brief using your imported setup.';
  },
};
const r = await createApp({
  stateDir: join(root, 'state'),
  workers: { codex: worker, claude: worker, openrouter: worker },
});
r.engine.jev = new Jev(r.store, { get: async () => undefined } as any);
r.store.put('workspace', 'work', {
  id: 'work',
  name: 'Example project',
  path: workspace,
  providers: ['codex'],
  instructions: [],
});
r.store.put(
  'model',
  'fixture',
  ModelInput.parse({
    id: 'fixture',
    provider: 'codex',
    model: 'fixture',
    label: 'Local test worker',
    enabled: true,
    evaluated: true,
    evidence: 'Synthetic importer test',
    maxDifficulty: 'complex',
    capabilities: ['files', 'shell', 'web', 'browser', 'artifacts'],
    quality: { coding: 1, research: 1, writing: 1 },
  }),
);
const url = await r.app.listen({ host: '127.0.0.1', port: 0 });
if (process.argv.includes('--preview')) {
  await writeFile(
    '.build/importer-preview.json',
    JSON.stringify({ url, token: r.launchToken, pid: process.pid, source }),
    { mode: 0o600 },
  );
  console.log('Synthetic importer preview is running on ' + url);
  await new Promise<void>((resolve) => {
    process.once('SIGTERM', resolve);
    process.once('SIGINT', resolve);
  });
  await r.app.close();
  await rm(root, { recursive: true, force: true });
  process.exit(0);
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.setDefaultTimeout(15000);
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const dialog = () => page.getByRole('dialog');
async function setup() {
  await page.getByRole('button', { name: 'Connections & setup' }).click();
}
async function remove(name: string) {
  await page
    .locator('.setup-saved')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  await dialog().getByRole('button', { name: 'Remove from DUKE', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
}
try {
  await page.goto(url + '/#launch=' + r.launchToken);
  await setup();
  await page.getByRole('button', { name: 'Bring your setup', exact: true }).click();
  await dialog().getByRole('button', { name: 'Choose setup folder…', exact: true }).click();
  await dialog().getByRole('button', { name: 'Review folder', exact: true }).click();
  await dialog().getByRole('heading', { name: 'Review your setup' }).waitFor();
  await dialog().getByLabel('Setup name', { exact: true }).fill('Linked example');
  assert.ok(
    await dialog().getByRole('checkbox', { name: 'Include AGENTS.md', exact: true }).isChecked(),
  );
  assert.ok(
    !(await dialog().getByRole('checkbox', { name: 'Include CLAUDE.md', exact: true }).isChecked()),
  );
  await dialog().getByRole('checkbox', { name: 'Include CLAUDE.md', exact: true }).check();
  assert.ok(
    !(await dialog().getByRole('checkbox', { name: 'Include AGENTS.md', exact: true }).isChecked()),
  );
  await dialog().getByRole('checkbox', { name: 'Include AGENTS.md', exact: true }).check();
  await page.screenshot({ path: 'outputs/importer-review-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'outputs/importer-review-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await dialog().getByRole('button', { name: 'Use this setup', exact: true }).click();
  await page.locator('.setup-saved').filter({ hasText: 'Linked example' }).waitFor();
  assert.equal(r.store.list<any>('setup')[0].files.length, 4);
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Describe your task').fill('Write a brief using my setup');
  await page.getByRole('button', { name: 'Start task', exact: true }).click();
  await page
    .locator('.result-text')
    .getByText('Created a brief using your imported setup.', { exact: true })
    .waitFor();
  await page.getByText('Setup used for this task · 4 files', { exact: true }).click();
  assert.match(await readFile(join(workspace, 'brief.md'), 'utf8'), /Recommendation/);
  await page.screenshot({ path: 'outputs/importer-task-context.png', fullPage: true });
  console.log('PASS Link import, model context, skill retrieval and task receipt');
  await setup();
  await remove('Linked example');
  await page.getByRole('button', { name: 'Bring your setup', exact: true }).click();
  await dialog()
    .getByRole('radio', { name: /Copy into DUKE/ })
    .check();
  await dialog().getByRole('button', { name: 'Choose setup folder…', exact: true }).click();
  await dialog().getByRole('button', { name: 'Review folder', exact: true }).click();
  await dialog().getByLabel('Setup name', { exact: true }).fill('Copied example');
  await dialog().getByRole('button', { name: 'Use this setup', exact: true }).click();
  const copied = page.locator('.setup-saved').filter({ hasText: 'Copied example' });
  await copied.getByRole('button', { name: 'View files', exact: true }).click();
  const file = dialog().locator('.setup-file').filter({ hasText: 'AGENTS.md' });
  await file.locator('summary').press('Enter');
  await file.getByRole('button', { name: 'Edit copy', exact: true }).click();
  await dialog().getByLabel('Copied file content').fill('Independent copy edited in DUKE.');
  await dialog().getByRole('button', { name: 'Save copy', exact: true }).click();
  await dialog().getByRole('button', { name: 'Export selected files', exact: true }).waitFor();
  const downloaded = page.waitForEvent('download', { timeout: 15000 });
  await dialog().getByRole('button', { name: 'Export selected files', exact: true }).click();
  const download = await downloaded;
  const bundle = JSON.parse(await readFile((await download.path())!, 'utf8'));
  assert.equal(
    bundle.files.find((f: any) => f.path === 'AGENTS.md').content,
    'Independent copy edited in DUKE.',
  );
  assert.doesNotMatch(JSON.stringify(bundle), /duke-import-browser-|\/Users\/|workspaceId/);
  await dialog().getByRole('button', { name: 'Close setup files' }).click();
  await writeFile(join(source, 'AGENTS.md'), 'Changed in source folder.');
  await copied.getByRole('button', { name: 'Review updates / locate folder' }).click();
  await dialog().getByRole('button', { name: 'Review folder', exact: true }).click();
  await dialog().getByText('0 new · 1 changed · 0 removed', { exact: true }).waitFor();
  await dialog().getByRole('button', { name: 'Apply reviewed update', exact: true }).click();
  await dialog().waitFor({ state: 'hidden' });
  assert.equal(
    r.store.list<any>('setup')[0].files.find((f: any) => f.path === 'AGENTS.md').content,
    'Changed in source folder.',
  );
  await remove('Copied example');
  await page.getByRole('button', { name: 'Bring your setup', exact: true }).click();
  await dialog()
    .locator('input[type=file]')
    .setInputFiles({
      name: 'sample.duke-setup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bundle)),
    });
  await dialog().getByRole('button', { name: 'Use this setup', exact: true }).click();
  await page.locator('.setup-saved').filter({ hasText: 'Copied example' }).waitFor();
  assert.equal(r.store.list<any>('setup')[0].root, undefined);
  assert.equal(r.store.list<any>('setup')[0].mode, 'copy');
  assert.deepEqual(errors, []);
  assert.deepEqual(r.store.spending(), []);
  await writeFile(
    'outputs/importer-browser-verification.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks: [
          'folder picker wiring (fixture helper)',
          'entry point alternatives',
          'desktop and mobile layout',
          'Link import',
          'task context and skill retrieval',
          'Copy import',
          'edit copy',
          'review refresh',
          'export download',
          'portable bundle reimport',
          'remove setup',
        ],
        browserErrors: errors,
        liveInference: false,
        spend: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS importer browser workflow: Link, Copy, scoped context, edit, refresh, remove, export/reimport; no live inference.',
  );
} catch (error) {
  await page.screenshot({ path: 'outputs/importer-browser-failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
  await r.app.close();
  if (previousHelper === undefined) delete process.env.DUKE_DESKTOP_EXECUTABLE;
  else process.env.DUKE_DESKTOP_EXECUTABLE = previousHelper;
  await rm(root, { recursive: true, force: true });
}
