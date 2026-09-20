import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { spawn } from 'node:child_process';
import { createApp } from '../server/app.js';
import type { Health, Worker } from '../server/types.js';

const root = await mkdtemp(join(tmpdir(), 'duke-claude-setup-browser-'));
let connection: Health = {
  provider: 'claude',
  ready: true,
  message: 'Subscription connected',
  connection: { signedIn: true, billing: 'subscription' },
};
let opens = 0,
  inference = 0;
const calls: { args: string[]; child: any }[] = [];
const launch = ((_command: string, args: string[]) => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  calls.push({ args, child });
  queueMicrotask(() => child.stdout.write('https://claude.ai/oauth/authorize?synthetic=true\n'));
  return child;
}) as unknown as typeof spawn;
const worker: Worker = {
  run: async () => {
    inference++;
    throw new Error('Inference forbidden in setup verification');
  },
  health: async () => structuredClone(connection),
};
const r = await createApp({
  stateDir: root,
  workers: { claude: worker, codex: worker, openrouter: worker },
  claudeLoginLaunch: launch,
  claudeSetupOpen: async () => {
    opens++;
    return { opened: true };
  },
});
// Account checks stay synthetic, including key-presence checks.
r.engine.jev.secrets.get = async () => undefined;
r.store.put('health', 'claude', connection);
const baseline = { settings: r.store.settings(), models: r.store.list('model') };
const url = await r.app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors: string[] = [],
  checks: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const pass = (message: string) => {
  checks.push(message);
  console.log('PASS ' + message);
};
try {
  await mkdir('outputs', { recursive: true });
  await page.goto(url + '/#launch=' + r.launchToken);
  await page.getByRole('button', { name: 'Connections & setup', exact: true }).click();
  const card = page
    .locator('.provider-card')
    .filter({ has: page.getByRole('heading', { name: 'Claude', exact: true }) });
  const main = card.getByRole('button', { name: 'Connect subscription', exact: true });
  await main.waitFor();
  assert.equal(
    await card.getByRole('button', { name: 'Claude Console sign-in' }).isVisible(),
    false,
  );
  await main.click();
  await page.getByRole('button', { name: 'Cancel sign-in' }).waitFor();
  assert.deepEqual(calls.at(-1)!.args, ['auth', 'login']);
  assert.equal(
    await page.getByRole('link', { name: 'Open secure login →' }).getAttribute('href'),
    'https://claude.ai/oauth/authorize?synthetic=true',
  );
  await page.getByRole('button', { name: 'Cancel sign-in' }).click();
  await card.getByText('Subscription connected', { exact: true }).waitFor();
  pass('Existing one-click subscription login and cancellation preserve a connected subscription');

  await card.getByText('Other sign-in options', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await card.getByRole('button', { name: 'Organization SSO' }).click();
  await page.getByRole('button', { name: 'Cancel sign-in' }).waitFor();
  assert.deepEqual(calls.at(-1)!.args, ['auth', 'login', '--sso']);
  await page.getByRole('button', { name: 'Cancel sign-in' }).click();
  await card.getByText('Subscription connected', { exact: true }).waitFor();
  await card.getByRole('button', { name: 'Claude Console sign-in' }).click();
  await page
    .getByText('Finish your Claude Console sign-in in the browser', { exact: true })
    .waitFor();
  assert.deepEqual(calls.at(-1)!.args, ['auth', 'login', '--console']);
  connection = {
    provider: 'claude',
    ready: false,
    message:
      'Claude Console connected · separately billed. DUKE currently routes Claude tasks through subscriptions; API execution is not enabled.',
    connection: { signedIn: true, billing: 'api' },
  };
  calls.at(-1)!.child.emit('exit', 0);
  await card.getByText(connection.message, { exact: true }).waitFor();
  assert.equal(
    await card.getByRole('button', { name: 'Disconnect', exact: true }).isVisible(),
    true,
  );
  assert.equal(await card.locator('.connected-dot').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Cancel sign-in' }).count(), 0);
  pass(
    'Keyboard-accessible SSO and Console choices use official login; API connection is not subscription-ready',
  );
  await page.locator('.usage-trigger').click();
  const usage = page.getByRole('dialog', { name: 'Usage', exact: true });
  await usage.getByText('API account', { exact: true }).waitFor();
  assert.equal(await usage.getByLabel('Claude subscription').getByRole('progressbar').count(), 0);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'outputs/claude-setup-desktop.png', fullPage: true });

  if (process.platform === 'darwin') {
    await card.getByRole('button', { name: 'Open full Claude Code setup' }).click();
    await page
      .getByRole('status')
      .filter({ hasText: 'Claude Code setup opened in Terminal' })
      .waitFor();
    assert.equal(opens, 1);
    connection = {
      provider: 'claude',
      ready: true,
      message: 'Subscription connected',
      connection: { signedIn: true, billing: 'subscription' },
    };
    await page.getByRole('button', { name: 'Check connections ↻' }).click();
    await card.getByText('Subscription connected', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    pass('Full setup entry and explicit connection refresh restore subscription readiness');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'outputs/claude-setup-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual({ settings: r.store.settings(), models: r.store.list('model') }, baseline);
  assert.equal(r.store.tasks().length, 0);
  assert.equal(r.store.spending().length, 0);
  assert.equal(inference, 0);
  assert.deepEqual(errors, []);
  pass('Narrow layout fits; settings, model roster, tasks and spending remain unchanged');
  await writeFile(
    'outputs/claude-setup-browser-verification.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        result: 'passed',
        checks,
        browserErrors: errors,
        modelPromptsSubmitted: inference,
        auth: 'Synthetic official-process fixture; no account sign-in performed',
        nativeSetup: 'Launch request emulated; interactive provider setup not performed',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
  await r.app.close();
  await rm(root, { recursive: true, force: true });
}
