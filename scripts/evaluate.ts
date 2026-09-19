import { cases } from '../evals/cases.js';
import { balancedCases, evalKinds } from '../evals/selection.js';
import { ROUTING_POLICY, REVIEW_POLICY } from '../server/outcomes.js';
import { EFFICIENCY_POLICY } from '../server/efficiency.js';
import { summarizeSpending } from '../server/spending.js';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2),
  value = (key: string) => args[args.indexOf(key) + 1],
  has = (key: string) => args.includes(key);
if (cases.length !== 80 || new Set(cases.map((c) => c.id)).size !== 80)
  throw new Error('Corpus must contain 80 unique cases');
for (const kind of evalKinds)
  for (const split of ['development', 'held-out'])
    if (cases.filter((c) => c.kind === kind && c.split === split).length !== 10)
      throw new Error('Corpus split mismatch');
if (!has('--run')) {
  console.log(
    'Validated 80 evaluation cases: 20 each for coding, research, writing and documents; 40 development and 40 held-out.',
  );
  console.log('This is corpus validation, not model-quality evidence.');
  console.log(
    'Run against the local app only when live tests are authorized: npm run eval -- --run --mode strong --model <roster-id> --limit 4',
  );
  console.log(
    'Modes: strong (explicit model), rules (Jev must be off), jev (automatic selection). Add --split held-out for final evaluation.',
  );
} else {
  const mode = has('--mode') ? value('--mode') : 'rules',
    split = has('--split') ? value('--split') : 'development',
    limit = has('--limit') ? Number(value('--limit')) : 4;
  if (
    !['strong', 'rules', 'jev'].includes(mode) ||
    !['development', 'held-out'].includes(split) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 40
  )
    throw new Error('Invalid evaluation mode, split, or limit');
  if (mode === 'strong' && !has('--model'))
    throw new Error('Strong baseline requires --model <roster-id>');
  const stateDir = resolve(process.env.ROUTER_DATA_DIR ?? '.router'),
    launch = JSON.parse(await readFile(join(stateDir, 'launch.json'), 'utf8'));
  const auth = await fetch(launch.url + '/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: launch.token }),
  });
  if (!auth.ok) throw new Error('Start the local app first.');
  const cookie = auth.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join(';');
  async function api(path: string, body?: any) {
    const r = await fetch(launch.url + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }
  const state = await api('/state');
  if (
    state.tasks.some((t: any) =>
      ['queued', 'routing', 'running', 'verifying', 'awaiting_approval'].includes(t.status),
    )
  )
    throw new Error('Wait for active tasks to finish before evaluation.');
  if (mode === 'rules' && state.settings.jevMode !== 'off')
    throw new Error('Select Jev Off in the app for the rules baseline.');
  if (mode === 'jev' && state.settings.jevMode !== 'assist')
    throw new Error(
      'Select Automatic selection for the Jev routing comparison. Shadow decisions do not test Jev dispatch.',
    );
  const profileHash = createHash('sha256')
    .update(
      JSON.stringify({
        models: state.models
          .filter((m: any) => m.enabled)
          .map((m: any) => ({
            ...m,
            catalog: m.catalog ? { ...m.catalog, discoveredAt: undefined } : undefined,
          })),
        workPreferences: state.settings.workPreferences,
        qualityFloor: state.settings.qualityFloor,
        maxRecovery: state.settings.maxRecovery,
        maxSteps: state.settings.maxSteps,
        routingPolicy: ROUTING_POLICY,
        reviewPolicy: REVIEW_POLICY,
        efficiencyPolicy: EFFICIENCY_POLICY,
      }),
    )
    .digest('hex');
  const runId = new Date().toISOString().replace(/[:.]/g, '-'),
    out = resolve('outputs/evaluations', runId);
  await mkdir(out, { recursive: true });
  const results: any[] = [];
  const selected = balancedCases(cases, split === 'held-out' ? 'held-out' : 'development', limit);
  for (const c of selected) {
    const path = join(out, c.id);
    await mkdir(path);
    for (const [file, content] of Object.entries(c.files))
      await writeFile(join(path, file), content);
    const workspace = await api('/workspaces', {
      name: `Eval ${c.id}`,
      path: await realpath(path),
      providers: ['codex', 'claude', 'openrouter'],
    });
    const start = Date.now(),
      task = await api('/tasks', {
        workspaceId: workspace.id,
        prompt: c.prompt,
        required: c.required,
        expectedResult: c.rubric.join('; '),
        modelOverride: mode === 'strong' ? value('--model') : undefined,
        verification: { files: c.expectedFiles, command: c.command },
        evaluation: true,
      });
    let detail: any;
    for (;;) {
      detail = await api('/tasks/' + task.id);
      if (['completed', 'blocked', 'cancelled', 'interrupted'].includes(detail.task.status)) break;
      if (Date.now() - start > 30 * 60 * 1000) {
        await api('/tasks/' + task.id + '/cancel', {});
        throw new Error('Evaluation task timed out.');
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    let fixturesUnchanged = true;
    for (const [file, original] of Object.entries(c.files))
      if (file === 'verify.mjs') {
        fixturesUnchanged = original === (await readFile(join(path, file), 'utf8'));
      }
    const spending = (await api('/spending')).filter((s: any) => s.taskId === task.id);
    const selection = detail.events.findLast(
      (e: any) => e.kind === 'jev_selection' && e.data.forExecution,
    );
    results.push({
      caseId: c.id,
      kind: c.kind,
      split: c.split,
      taskId: task.id,
      mode,
      status: detail.task.status,
      route: detail.task.route,
      latencyMs: Date.now() - start,
      fixturesUnchanged,
      automaticReview: detail.task.review,
      usage: detail.task.usage,
      subscriptionUsage: detail.task.subscriptionUsage,
      work: {
        workerAttempts: detail.events.filter(
          (e: any) => e.kind === 'usage_started' && e.data.role === 'worker',
        ).length,
        retries: detail.events.filter((e: any) => e.kind === 'attempt_failed').length,
        stages:
          detail.events.filter((e: any) => e.kind === 'stage_completed').length +
          (detail.task.status === 'completed' ? 1 : 0),
      },
      selectionConfidence:
        detail.task.route?.selectionSource === 'jev' ? selection?.data.confidence : undefined,
      ...summarizeSpending(spending),
      rubric: c.rubric,
      review: { accepted: null, criticalFailure: null, corrections: null, notes: '' },
      events: detail.events,
    });
    await writeFile(
      join(out, 'results.json'),
      JSON.stringify(
        {
          runId,
          mode,
          split,
          settings: state.settings,
          profileHash,
          routingPolicy: ROUTING_POLICY,
          reviewPolicy: REVIEW_POLICY,
          efficiencyPolicy: EFFICIENCY_POLICY,
          models: state.models,
          corpusHash: createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
          results,
        },
        null,
        2,
      ),
    );
    console.log(`${c.id}: ${detail.task.status}`);
  }
  console.log(
    `Saved ${results.length} runs to ${out}/results.json. Independent rubric review is required before reporting release quality. Benchmark tasks do not train the normal routing history.`,
  );
}
