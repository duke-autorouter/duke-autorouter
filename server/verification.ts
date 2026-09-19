import type { Store } from './store.js';
import type { ToolService } from './tools.js';
import type { Jev } from './adapters/jev.js';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { scoped } from './paths.js';
import { inspectFile, type ReviewEvidence, type RoutingContext } from './task-evidence.js';
import { REVIEW_POLICY } from './outcomes.js';
import { Blocked, now, type Task, type Workspace, type TaskReview, type Check } from './types.js';

function urlKey(raw: string) {
  try {
    const url = new URL(raw);
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return raw;
  }
}
export function citedURLs(text: string) {
  return [
    ...new Set(
      (text.match(/https?:\/\/[^\s<>"`]+/g) ?? []).map((url) =>
        urlKey(url.replace(/[)\],.;!?]+$/, '')),
      ),
    ),
  ];
}
function repeatableTest(command: string) {
  return (
    !/[;&|`$<>\n]/.test(command) &&
    /^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?test(?:\s|:|$)|(?:pytest|vitest|jest)\b|(?:cargo|go)\s+test\b|python3?\s+-m\s+(?:pytest|unittest)\b|node\s+(?:--test\b|[^ ]*(?:test|verify)[^ ]*\.[cm]?js\b))/.test(
      command.trim(),
    )
  );
}

export async function verifyTask(
  store: Store,
  tools: ToolService,
  jev: Pick<Jev, 'review'>,
  task: Task,
  workspace: Workspace,
  result: string,
  signal: AbortSignal,
  context?: RoutingContext,
): Promise<TaskReview> {
  const checks: Check[] = [],
    limitations: string[] = [];
  const events = store.events(task.id);
  const lastRoute = events.findLastIndex((e) => e.kind === 'route');
  const stageEvents = events.slice(lastRoute + 1);
  const artifacts = store.list<any>('artifact').filter((a) => a.taskId === task.id);
  const removed = (path: string) => {
    const removal = events.findLastIndex(
      (e) =>
        e.kind === 'tool_completed' &&
        e.data.name === 'remove_file' &&
        e.data.result?.removed === path,
    );
    const write = events.findLastIndex((e) => e.kind === 'artifact' && e.data.path === path);
    return removal >= 0 && removal > write;
  };
  const paths = [
    ...new Set([
      ...task.verification.files,
      ...[...artifacts.map((a) => a.path), ...(task.checkpoint?.artifacts ?? [])].filter(
        (p) => !removed(p),
      ),
    ]),
  ];
  const evidence: ReviewEvidence = {
    result: result.slice(0, 12000),
    files: [],
    inputs: [],
    sources: [],
    checks,
    incomplete:
      result.length > 12000 ||
      task.prompt.length > 6000 ||
      task.expectedResult.length > 1000 ||
      !!context?.incomplete,
    limitations,
  };
  if (evidence.incomplete)
    limitations.push('Some task or response context exceeds the review excerpt limits.');
  if (context?.privateGuidancePresent)
    limitations.push(
      'Private operating instructions were kept with the worker; adherence to those instructions was not independently assessed.',
    );
  const inputs = new Map<string, string>();
  for (const event of events)
    if (
      event.kind === 'tool_completed' &&
      event.data.name === 'read_file' &&
      typeof event.data.result?.content === 'string'
    )
      inputs.set(event.data.result.path, event.data.result.content);
  let inputBudget = 16000;
  for (const [path, text] of inputs) {
    const excerpt = text.slice(0, Math.min(4000, inputBudget));
    inputBudget -= excerpt.length;
    if (excerpt) evidence.inputs.push({ path, text: excerpt });
    if (excerpt.length < text.length) {
      evidence.incomplete = true;
      limitations.push(`${path}: only an excerpt of the task input was reviewed.`);
    }
  }
  checks.push({
    name: 'Response',
    status: result.trim() || paths.length ? 'passed' : 'failed',
    detail:
      result.trim() || paths.length
        ? 'The worker returned a response or deliverable.'
        : 'No response or deliverable was returned.',
  });
  if (paths.length > 20) {
    evidence.incomplete = true;
    limitations.push('Only the first 20 deliverables were inspected.');
  }
  let textBudget = 24000;
  for (const path of paths.slice(0, 20)) {
    signal.throwIfAborted();
    try {
      const file = await inspectFile(workspace, path);
      if (file.format === '.pdf') {
        // The generator's exact input is usable text evidence only while the saved bytes
        // still match its receipt. This does not establish rendered layout quality.
        const receipt = artifacts.findLast((a) => a.path === path && a.sha256 === file.sha256);
        const start =
          receipt && events.findLastIndex((e) => e.kind === 'artifact' && e.data.id === receipt.id);
        const generation =
          typeof start === 'number' && start >= 0
            ? events
                .slice(0, start)
                .findLast(
                  (e) =>
                    e.kind === 'tool_started' &&
                    e.data.name === 'create_artifact' &&
                    e.data.args.path === path &&
                    e.data.args.format === 'pdf',
                )
            : undefined;
        if (generation) {
          file.text = generation.data.args.content;
          file.incomplete = false;
        }
      }
      if (file.text && file.text.length > textBudget) {
        file.text = file.text.slice(0, textBudget);
        file.incomplete = true;
      }
      textBudget -= file.text?.length ?? 0;
      evidence.incomplete ||= file.incomplete;
      evidence.files.push(file);
      checks.push({
        name: path,
        status: file.incomplete ? 'unverified' : 'passed',
        detail: file.detail,
      });
      if (['.pdf', '.docx', '.xlsx'].includes(file.format))
        limitations.push(`${path}: rendered layout was not inspected.`);
      if (file.format === '.xlsx') limitations.push(`${path}: formulas were not recalculated.`);
    } catch (e) {
      // Unsafe paths are policy failures; a verifier must never broaden file access to retry.
      if (e instanceof Blocked) throw e;
      checks.push({ name: path, status: 'failed', detail: (e as Error).message });
    }
  }
  const previousTest = stageEvents.findLast(
    (e) =>
      e.kind === 'tool_started' &&
      e.data.name === 'shell' &&
      !e.data.args.writable &&
      repeatableTest(e.data.args.command),
  );
  const command = task.verification.command || previousTest?.data.args.command;
  if (command) {
    if (!task.required.includes('shell'))
      throw new Blocked('The verification command requires the shell capability.');
    const test = await tools.shell(workspace, command, false, signal);
    checks.push({
      name: 'Tests',
      status: test.code === 0 ? 'passed' : 'failed',
      detail: `${command}\nExit ${test.code}\n${String(test.stdout ?? '').slice(-4000)}\n${String(test.stderr ?? '').slice(-2000)}`,
    });
  } else if (task.route?.kind === 'coding') {
    checks.push({
      name: 'Tests',
      status: 'unverified',
      detail: 'No repeatable test command was provided or run by the worker.',
    });
    evidence.incomplete = true;
  }
  const readSources = events
    .filter((e) => e.kind === 'tool_completed' && ['web_read', 'browser'].includes(e.data.name))
    .map((e) => e.data.result)
    .filter((s) => s?.url && typeof s.text === 'string');
  const citationText = [result, ...evidence.files.map((f) => f.text ?? '')].join('\n');
  const citations = citedURLs(citationText);
  if (
    task.route?.kind === 'research' &&
    task.required.some((c) => ['web', 'browser'].includes(c))
  ) {
    const untraced = citations.filter(
      (url) =>
        !readSources.some((s) => urlKey(s.url) === url || urlKey(s.requestedUrl ?? '') === url),
    );
    checks.push({
      name: 'Citations',
      status: !citations.length || untraced.length ? 'failed' : 'passed',
      detail: !citations.length
        ? 'Research has no source URLs.'
        : untraced.length
          ? `These citations were not read with the source tool: ${untraced.join(', ')}`
          : 'Cited URLs have retrieved source receipts. Jev also checks support for the claims.',
    });
  }
  const relevant = readSources.filter((s) =>
    citations.some((url) => urlKey(s.url) === url || urlKey(s.requestedUrl ?? '') === url),
  );
  evidence.sources = relevant.slice(-6).map((s) => ({ url: s.url, text: s.text.slice(0, 6000) }));
  if (relevant.length > 6) {
    evidence.incomplete = true;
    limitations.push('Only six cited source excerpts fit in the review.');
  }
  if (relevant.some((s) => s.text.length > 6000))
    limitations.push('Source support was assessed using excerpts.');
  if (
    task.route?.kind === 'documents' &&
    !evidence.files.some((f) => ['.pdf', '.docx', '.xlsx', '.md', '.html'].includes(f.format))
  )
    checks.push({
      name: 'Document',
      status: 'failed',
      detail: 'No document deliverable was found.',
    });
  signal.throwIfAborted();
  if (!checks.some((c) => c.status === 'failed')) {
    const judged = await jev.review(task, evidence, signal, context);
    checks.push(...judged);
  }
  let changedDuringReview = false;
  for (const file of evidence.files.filter((f) => f.sha256)) {
    // A response about yesterday's bytes must not establish quality for a file edited
    // while the remote judge was running. Such races are neutral evidence.
    try {
      const path = await scoped(workspace.path, file.path),
        size = (await stat(path)).size;
      if (
        size > 2_000_000 ||
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex') !== file.sha256
      ) {
        changedDuringReview = true;
        checks.push({
          name: file.path,
          status: 'unverified',
          detail: 'The file changed while checks were running.',
        });
      }
    } catch (e) {
      if (e instanceof Blocked) throw e;
      changedDuringReview = true;
      checks.push({
        name: file.path,
        status: 'unverified',
        detail: 'The checked file is no longer readable.',
      });
    }
  }
  signal.throwIfAborted();
  const status = changedDuringReview
    ? 'unverified'
    : checks.some((c) => c.status === 'failed')
      ? 'failed'
      : evidence.incomplete || checks.some((c) => c.status === 'unverified')
        ? 'unverified'
        : 'passed';
  return {
    status,
    checks,
    limitations: [...new Set(limitations)],
    at: now(),
    policy: REVIEW_POLICY,
    summary:
      status === 'failed'
        ? checks
            .filter((c) => c.status === 'failed')
            .map((c) => `${c.name}: ${c.detail}`)
            .join('\n')
            .slice(0, 2500)
        : status === 'passed'
          ? 'Automatic checks passed for the inspected work.'
          : 'The work is saved; some checks could not be completed.',
  };
}
