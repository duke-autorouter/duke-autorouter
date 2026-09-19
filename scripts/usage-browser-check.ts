import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { claudeQuota } from '../shared/usage-display.js';
import type { Worker } from '../server/types.js';

const root = await mkdtemp(join(tmpdir(), 'duke-usage-browser-'));
const resetsAt = Math.floor(Date.now() / 1000) + 4 * 3600;
const codex = {
  rateLimits: {
    primary: { usedPercent: 30, windowDurationMins: 300, resetsAt },
    secondary: { usedPercent: 41, windowDurationMins: 10080, resetsAt: resetsAt + 4 * 86400 },
  },
};
const claude = claudeQuota({
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: 24, resets_at: new Date(resetsAt * 1000).toISOString() },
    seven_day: {
      utilization: 58,
      resets_at: new Date((resetsAt + 4 * 86400) * 1000).toISOString(),
    },
    model_scoped: [
      {
        display_name: 'Fable',
        utilization: 46,
        resets_at: new Date((resetsAt + 4 * 86400) * 1000).toISOString(),
      },
    ],
  },
});
let reads = 0,
  inference = 0;
const worker = (quota: unknown): Worker => ({
  run: async () => {
    inference++;
    throw new Error('No model tasks in usage verification');
  },
  subscription: async () => {
    reads++;
    return { quota, quotaCheckedAt: new Date().toISOString(), usageError: undefined };
  },
});
const r = await createApp({
  stateDir: root,
  workers: { codex: worker(codex), claude: worker(claude), openrouter: worker(undefined) },
});
for (const provider of ['codex', 'claude'])
  r.store.put('health', provider, {
    provider,
    ready: true,
    message: 'Synthetic connection',
    quota: provider === 'codex' ? codex : claude,
    quotaCheckedAt: new Date().toISOString(),
  });
const settingsBefore = r.store.settings();
const url = await r.app.listen({ host: '127.0.0.1', port: 0 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors: string[] = [],
  checks: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const pass = (s: string) => {
  checks.push(s);
  console.log('PASS ' + s);
};
const panel = page.getByRole('dialog', { name: 'Usage', exact: true });
async function open() {
  await page.locator('.usage-trigger').click();
  await panel.waitFor();
}
try {
  await mkdir('outputs', { recursive: true });
  await page.goto(url + '/#launch=' + r.launchToken);
  await page.getByRole('heading', { name: 'What are we working on?' }).waitFor();
  assert.equal(await page.locator('.usage-pins').innerText(), '');
  const font = await page.getByLabel('Describe your task').evaluate((el) => ({
    family: getComputedStyle(el).fontFamily,
    size: getComputedStyle(el).fontSize,
  }));
  assert.match(font.family, /DM Sans/);
  assert.equal(font.size, '16px');
  await page.screenshot({ path: 'outputs/usage-home-desktop.png' });
  pass('Quiet default header and readable DM Sans input');
  await page.locator('.usage-trigger').focus();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/usage/refresh')),
    page.keyboard.press('Enter'),
  ]);
  await panel.getByRole('button', { name: 'Refresh usage', exact: true }).waitFor();
  assert.equal(reads, 2);
  await panel.getByText('70% left', { exact: true }).waitFor();
  await panel.getByText('76% left', { exact: true }).waitFor();
  await panel.getByText('Model allowances (1)', { exact: true }).click();
  await panel.getByText('Fable · 7 days', { exact: true }).waitFor();
  assert.equal(await panel.getByRole('progressbar').count(), 5);
  await panel.getByText('Model allowances (1)', { exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await panel.isVisible(), false);
  assert.equal(
    await page.locator('.usage-trigger').evaluate((el) => document.activeElement === el),
    true,
  );
  pass(
    'Keyboard opening, distinct provider windows, model-specific limits, Escape and focus return',
  );
  for (const mode of ['api', 'subscriptions', 'both', 'compact']) {
    await open();
    await panel.getByLabel('Show in header').selectOption(mode);
    await page.waitForFunction(
      (m) =>
        document.querySelector<HTMLSelectElement>('#usage-overview select')?.value === m &&
        !document.querySelector<HTMLSelectElement>('#usage-overview select')?.disabled,
      mode,
    );
    await page.keyboard.press('Escape');
    await page.reload();
    await page.locator('.usage-trigger').waitFor();
    assert.equal(r.store.get<any>('preferences', 'main').usageDisplay, mode);
    const pinned = await page.locator('.usage-pins').innerText();
    assert.equal(pinned.includes('API'), mode === 'api' || mode === 'both');
    assert.equal(pinned.includes('Codex'), mode === 'subscriptions' || mode === 'both');
    assert.deepEqual(r.store.settings(), settingsBefore);
  }
  pass('All four display modes survive reload without changing budgets or routing');
  await open();
  await panel.getByLabel('Show in header').selectOption('both');
  await panel.getByRole('button', { name: 'Refresh usage', exact: true }).click();
  await panel.getByRole('button', { name: 'Refresh usage', exact: true }).waitFor();
  assert.equal(reads, 2, 'reopening and repeated refreshes within a minute reuse the account read');
  await page.screenshot({ path: 'outputs/usage-overview-desktop.png' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  await panel.getByLabel('Show in header').scrollIntoViewIfNeeded();
  const bounds = await panel.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.locator('.usage-pins').isVisible(), false);
  await page.screenshot({ path: 'outputs/usage-overview-mobile.png' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1080 });
  pass('Refresh cooldown and usable mobile popover without horizontal overflow');
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  r.store.put('health', 'codex', {
    provider: 'codex',
    ready: true,
    quota: codex,
    quotaCheckedAt: old,
    usageError: 'Usage could not be refreshed. Try again in a minute.',
  });
  r.store.put('health', 'claude', { provider: 'claude', ready: true, quota: { state: 'unknown' } });
  await page.reload();
  await open();
  await panel.getByText('70% left (last known)', { exact: true }).waitFor();
  await panel.getByText(/Allowance unavailable/).waitFor();
  assert.doesNotMatch(await page.locator('.usage-pins').innerText(), /% left/);
  await page.keyboard.press('Escape');
  pass('Stale and unavailable telemetry is explicit and cannot masquerade as current capacity');
  r.store.put('health', 'codex', {
    provider: 'codex',
    ready: true,
    quota: { rateLimits: { primary: { usedPercent: 96, windowDurationMins: 300, resetsAt } } },
    quotaCheckedAt: new Date().toISOString(),
  });
  r.store.put('preferences', 'main', { usageDisplay: 'compact' });
  await page.reload();
  await page.locator('.usage-attention').waitFor();
  assert.equal(await page.locator('.usage-pins').innerText(), '');
  await open();
  await panel.getByRole('button', { name: 'Usage & routing settings' }).click();
  await page.getByRole('heading', { name: 'Make every route count.' }).waitFor();
  await page
    .getByLabel('Show in header', { exact: true })
    .filter({ visible: true })
    .selectOption('api');
  await page.getByRole('heading', { name: 'Subscription capacity', exact: true }).waitFor();
  assert.deepEqual(r.store.settings(), settingsBefore);
  assert.equal(inference, 0);
  assert.deepEqual(r.store.tasks(), []);
  assert.deepEqual(r.store.spending(), []);
  assert.deepEqual(errors, []);
  pass(
    'Capacity attention remains available in compact mode; settings link works and no inference or charges occur',
  );
  await writeFile(
    'outputs/usage-browser-verification.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        mode: 'Synthetic account telemetry; real UI, API and SQLite',
        checks,
        inferenceCalls: inference,
        providerMetadataCalls: reads,
        errors,
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
