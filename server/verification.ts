import type { Store } from './store.js';
import type { ToolService } from './tools.js';
import type { Jev } from './adapters/jev.js';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { marked } from 'marked';
import { scoped } from './paths.js';
import { inspectFile, type ReviewEvidence, type RoutingContext } from './task-evidence.js';
import { REVIEW_POLICY } from './outcomes.js';
import { currentEvents, taskInputKey } from './task-revisions.js';
import { countWords, statedWordRange } from './word-count.js';
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
  const urls = new Set<string>();
  const collect = (value: string) => {
    for (const url of value.match(/https?:\/\/[^\s<>"`]+/g) ?? [])
      urls.add(urlKey(url.replace(/[)\],.;!?]+$/, '')));
  };
  // Parse prose so example URLs in fenced, indented or inline code are not
  // mistaken for research citations. The reviewer still sees the full content.
  marked.walkTokens(marked.lexer(text), (token) => {
    if (token.type === 'link') collect(token.href);
    else if (token.type === 'text' && !token.tokens) collect(token.text);
    else if (token.type === 'html') collect(token.text);
  });
  return [...urls];
}
function repeatableTest(command: string) {
  return (
    !/[;&|`$<>\n]/.test(command) &&
    /^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?test(?:\s|:|$)|(?:pytest|vitest|jest)\b|(?:cargo|go)\s+test\b|python3?\s+-m\s+(?:pytest|unittest)\b|node\s+(?:--test\b|[^ ]*(?:test|verify)[^ ]*\.[cm]?js\b))/.test(
      command.trim(),
    )
  );
}

export async function assertReviewEvidence(task: Task, workspace: Workspace, signal: AbortSignal) {
  const evidence = task.review?.evidence;
  if (!evidence) return false;
  if (evidence.inputKey !== taskInputKey(task))
    throw new Blocked(
      'The task requirements changed. Continue the task before checking the result again.',
    );
  for (const file of evidence.files) {
    signal.throwIfAborted();
    try {
      const path = await scoped(workspace.path, file.path);
      if (
        (await stat(path)).size > 2_000_000 ||
        createHash('sha256')
          .update(await readFile(path, { signal }))
          .digest('hex') !== file.sha256
      )
        throw new Blocked(
          `${file.path} changed after the last review. Describe the change in a follow-up before checking it again.`,
        );
    } catch (error) {
      signal.throwIfAborted();
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw new Blocked(
          `${file.path} is missing. Restore it or describe the change in a follow-up before checking it again.`,
        );
      throw error;
    }
  }
  signal.throwIfAborted();
  return evidence.complete;
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
  const revisionEvents = currentEvents(events);
  const lastRoute = events.findLastIndex((e) => e.kind === 'route');
  const stageEvents = events.slice(lastRoute + 1);
  const artifacts = store.list<any>('artifact').filter((a) => a.taskId === task.id);
  const touched = new Set(
    revisionEvents.filter((e) => e.kind === 'artifact').map((e) => e.data.path),
  );
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
        (p) => !removed(p) && (!task.continuation || touched.has(p)),
      ),
    ]),
  ];
  const receipt: NonNullable<TaskReview['evidence']> = {
    inputKey: taskInputKey(task),
    files: [],
    complete: false,
  };
  store.put('review_evidence', task.id, receipt);
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
  if (task.continuation?.uncertain) {
    evidence.incomplete = true;
    limitations.push(
      'The follow-up could not be reconciled confidently with earlier completion requirements. Those requirements were retained; clarify which result, files, or tests the follow-up replaces.',
    );
  }
  if (context?.privateGuidancePresent)
    limitations.push(
      'Private operating instructions were kept with the worker; adherence to those instructions was not independently assessed.',
    );
  const inputs = new Map<string, string>();
  for (const event of revisionEvents)
    if (
      event.kind === 'tool_completed' &&
      event.data.name === 'read_file' &&
      typeof event.data.result?.content === 'string'
    ) {
      if (!inputs.has(event.data.result.path))
        inputs.set(event.data.result.path, event.data.result.content);
      if (event.data.result.truncated) {
        evidence.incomplete = true;
        limitations.push(
          `${event.data.result.path}: the worker read a bounded or incomplete excerpt.`,
        );
      }
    }
  let inputBudget = 16000;
  evidence.resolutionSources = [...inputs]
    .filter(([path]) => !paths.includes(path))
    .map(([path, text]) => ({
      path,
      text: text.slice(0, 32000),
      incomplete: text.length > 32000,
    }));
  for (const [path, text] of inputs) {
    if (paths.includes(path)) continue;
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
      const file = await inspectFile(workspace, path, signal);
      if (file.text && file.text.length > textBudget) {
        file.text = file.text.slice(0, textBudget);
        file.incomplete = true;
      }
      textBudget -= file.text?.length ?? 0;
      evidence.incomplete ||= file.incomplete;
      evidence.files.push(file);
      signal.throwIfAborted();
      if (file.sha256) receipt.files.push({ path, sha256: file.sha256 });
      store.put('review_evidence', task.id, receipt);
      checks.push({
        name: path,
        status: file.incomplete ? 'unverified' : 'passed',
        detail: file.detail,
      });
      if (['.pdf', '.docx', '.xlsx'].includes(file.format)) {
        const previews = events.filter(
          (e) =>
            e.kind === 'tool_completed' &&
            e.data.name === 'preview_file' &&
            e.data.result?.path === path &&
            e.data.result?.sha256 === file.sha256,
        );
        limitations.push(
          previews.length
            ? `${path}: generated ${previews.length} preview(s). ${previews.at(-1)!.data.result.coverage} Layout was not independently judged.`
            : `${path}: rendered layout was not inspected.`,
        );
      }
    } catch (e) {
      // Unsafe paths are policy failures; a verifier must never broaden file access to retry.
      if (e instanceof Blocked) throw e;
      signal.throwIfAborted();
      const unavailable = [
        'EACCES',
        'EPERM',
        'EIO',
        'EMFILE',
        'ENFILE',
        'EBUSY',
        'ENOMEM',
      ].includes((e as NodeJS.ErrnoException).code ?? '');
      evidence.incomplete ||= unavailable;
      checks.push({
        name: path,
        status: unavailable ? 'unverified' : 'failed',
        detail: (e as Error).message,
      });
    }
  }
  receipt.complete = paths.length <= 20 && receipt.files.length === paths.length;
  // A word limit is enforceable only when the user's own task fields give one
  // exact range and there is one complete, inspectable text deliverable.
  const textPaths = paths.filter((p) => /\.(?:md|markdown|txt)$/i.test(p));
  const promptRange = statedWordRange(task.prompt, textPaths[0] ?? '');
  const expectedRange = statedWordRange(task.expectedResult, textPaths[0] ?? '', true);
  const mentionsRange = (text: string) => /\b\d{1,4}\s*[-–—]\s*\d{1,4}\s*words?\b|\bbetween\s+\d{1,4}\s+and\s+\d{1,4}\s+words\b/i.test(text);
  const ambiguousRange = (mentionsRange(task.prompt) && !promptRange) ||
    (mentionsRange(task.expectedResult) && !expectedRange);
  const range = task.continuation || ambiguousRange ? undefined : (
    promptRange && expectedRange && (promptRange.min !== expectedRange.min || promptRange.max !== expectedRange.max)
      ? undefined
      : promptRange ?? expectedRange
  );
  if (range && paths.length === 1 && textPaths.length === 1 && !task.continuation?.uncertain) {
    const file = evidence.files.find((f) => f.path === range.path);
    if (file && !file.incomplete && typeof file.text === 'string' && !/<\/?[a-z][^>]*>|&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(file.text)) {
      const words = countWords(file.text);
      checks.push({
        name: 'Word count',
        status: words >= range.min && words <= range.max ? 'passed' : 'failed',
        detail: `${range.path}: ${words} words; required ${range.min}–${range.max}. Markdown syntax is excluded.`,
      });
    }
  }
  signal.throwIfAborted();
  store.put('review_evidence', task.id, receipt);
  const previousTest = stageEvents.findLast(
    (e) =>
      e.kind === 'tool_started' &&
      e.data.name === 'shell' &&
      !e.data.args.writable &&
      repeatableTest(e.data.args.command),
  );
  const command = task.verification.command || previousTest?.data.args.command;
  const sourcePath =
    /\.(?:[cm]?[jt]sx?|py|pyw|rb|go|rs|swift|java|kt|c|cc|cpp|h|hpp|cs|sh|bash|zsh|sql|vue|svelte)$/i;
  const changedCode = revisionEvents.some(
    (e) =>
      (e.kind === 'artifact' && sourcePath.test(e.data.path ?? '')) ||
      (e.kind === 'tool_completed' &&
        e.data.name === 'remove_file' &&
        sourcePath.test(e.data.result?.removed ?? '')) ||
      (e.kind === 'tool_started' && e.data.name === 'shell' && e.data.args?.writable),
  );
  const requestedBehavior =
    task.route?.kind === 'coding' &&
    /\b(?:implement|debug|fix|repair|refactor|test)\b[^.!?\n]{0,120}\b(?:code|function|script|bug|test|application|app|api|endpoint|component|module|system|server)\b/i.test(
      task.continuation?.text ?? task.prompt,
    );
  if (command && task.required.includes('shell')) {
    const test = await tools.shell(workspace, command, false, signal);
    checks.push({
      name: 'Tests',
      status: test.status !== 'exited' ? 'unverified' : test.code === 0 ? 'passed' : 'failed',
      detail: `${command}\n${test.status === 'exited' ? `Exit ${test.code}` : `Check incomplete: ${test.status}`}\n${String(test.stdout ?? '').slice(-4000)}\n${String(test.stderr ?? '').slice(-2000)}`,
    });
    if (test.status !== 'exited') {
      evidence.incomplete = true;
      limitations.push(
        `Test execution was incomplete (${test.status}); this is not a model quality failure.`,
      );
    }
  } else if (command || changedCode || requestedBehavior) {
    checks.push({
      name: 'Tests',
      status: 'unverified',
      detail: !task.required.includes('shell')
        ? 'Executable checks need shell access, which this task does not allow.'
        : 'Executable behavior needs checking, but no repeatable test command was provided or run. Continue the task to add an appropriate check.',
    });
    evidence.incomplete = true;
    limitations.push('Executable behavior has not been verified.');
  }
  const readSources = events
    .filter((e) => e.kind === 'tool_completed' && ['web_read', 'browser'].includes(e.data.name))
    .map((e) => e.data.result)
    .filter((s) => s?.url && typeof s.text === 'string');
  const citationText = [
    result,
    ...evidence.files
      .filter((f) =>
        ['.md', '.markdown', '.txt', '.html', '.htm', '.pdf', '.docx', '.xlsx'].includes(f.format),
      )
      .map((f) => f.text ?? ''),
  ].join('\n');
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
  evidence.resolutionSources.push(
    ...relevant.slice(-6).map((s) => ({
      path: s.url,
      text: s.text.slice(0, 32000),
      incomplete: s.text.length > 32000,
    })),
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
  const status =
    changedDuringReview || task.continuation?.uncertain
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
    evidence: receipt,
    summary:
      status === 'failed'
        ? checks
            .filter((c) => c.status === 'failed')
            .map((c) => `${c.name}: ${c.detail}`)
            .join('\n')
            .slice(0, 2500)
        : status === 'passed'
          ? 'Automatic checks passed for the inspected work.'
          : 'The result is saved; some checks could not be completed.',
  };
}
