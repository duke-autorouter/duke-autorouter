import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { CodexWorker } from '../server/adapters/codex.js';
import { ClaudeWorker } from '../server/adapters/claude.js';
import { chromium } from 'playwright';
const dir = resolve(process.env.ROUTER_DATA_DIR ?? '.router');
await mkdir(dir, { recursive: true, mode: 0o700 });
const checks = [
  {
    name: 'Node',
    ok: Number(process.versions.node.split('.')[0]) >= 24,
    detail: process.versions.node,
  },
  {
    name: 'Platform',
    ok: process.platform === 'darwin',
    detail: `${process.platform}/${process.arch}; macOS is the supported first-release platform`,
  },
  {
    name: 'Chromium',
    ok: existsSync(chromium.executablePath()),
    detail: 'Install with npx playwright install chromium if missing.',
  },
];
const results = await Promise.allSettled([
  new CodexWorker(dir).health(),
  new ClaudeWorker(dir).health(),
]);
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  checks.push({
    name: i ? 'Claude runtime' : 'Codex app-server',
    ok: r.status === 'fulfilled' && !!r.value.models?.length,
    detail:
      r.status === 'fulfilled'
        ? `${r.value.version ?? ''}; ${r.value.message}; ${r.value.models?.length ?? 0} models`
        : (r.reason?.message ?? 'Unavailable'),
  });
}
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'SETUP'} ${c.name}: ${c.detail}`);
console.log('No model inference or paid API call was made by this diagnostic.');
