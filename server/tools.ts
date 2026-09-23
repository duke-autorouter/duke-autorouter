import { z } from 'zod';
import { readFile, writeFile, readdir, stat, rename, mkdir, copyFile, rm } from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { researchBrowser } from './research-browser.js';
import { wordArtifact, pdfArtifact } from './artifacts.js';
import { makeSpreadsheet } from './spreadsheets.js';
import { fileContent, decodeText } from './file-content.js';
import { countWords, countableText } from './word-count.js';
import { searchFiles } from './file-search.js';
import { previewFile, imageResult } from './previews.js';
import { toolReceipt } from './tool-results.js';
import { coreSkills } from './core-skills.js';
import { Store } from './store.js';
import { Approvals, fingerprint } from './approval.js';
import { scoped, sensitive } from './paths.js';
import { runProcess, type ProcessResult } from './process.js';
import { shellRunnerArgs } from './runtime.js';
import { fetchPublic, publicURL, searchPublic } from './web.js';
import { Blocked, UncertainEffect, now, type Task, type Workspace, type Cap } from './types.js';
import { SetupImporter } from './setup-import.js';
import type { SetupSnapshot } from '../shared/setup.js';

const sheetCell = z.union([
  z.string().max(20000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.object({ formula: z.string().min(1).max(4000) }),
]);
const sheetRows = z.array(z.array(sheetCell).max(100)).max(5000);
export const toolSchemas = {
  setup_list: z.object({}),
  setup_read: z.object({ id: z.string().min(1).max(100) }),
  list_files: z.object({
    path: z.string().default('.'),
    offset: z.number().int().min(0).default(0),
  }),
  read_file: z.object({
    path: z.string(),
    start_line: z.number().int().min(1).default(1),
    max_lines: z.number().int().min(1).max(2000).default(500),
  }),
  count_words: z.object({ path: z.string() }),
  search_files: z.object({ path: z.string().default('.'), query: z.string().min(1).max(500) }),
  write_file: z.object({ path: z.string(), content: z.string().max(500000) }),
  edit_file: z.object({
    path: z.string(),
    old_text: z.string().min(1).max(500000),
    new_text: z.string().max(500000),
  }),
  preview_file: z.object({
    path: z.string(),
    page: z.number().int().min(1).max(1000).default(1),
    sheet: z.string().min(1).max(31).optional(),
    range: z.string().min(1).max(40).optional(),
  }),
  remove_file: z.object({ path: z.string() }),
  shell: z.object({ command: z.string().min(1).max(8000), writable: z.boolean().default(false) }),
  web_read: z.object({ url: z.string() }),
  web_search: z.object({ query: z.string().min(1).max(500) }),
  browser: z.object({
    action: z.enum(['open', 'read', 'click', 'fill', 'screenshot']),
    url: z.string().optional(),
    selector: z.string().optional(),
    text: z.string().optional(),
  }),
  create_artifact: z.object({
    path: z.string(),
    format: z.enum(['markdown', 'html', 'pdf', 'docx', 'xlsx']),
    content: z.string().max(300000),
    rows: sheetRows.optional(),
    sheets: z
      .array(z.object({ name: z.string().min(1).max(31), rows: sheetRows }))
      .min(1)
      .max(10)
      .optional(),
  }),
  checkpoint: z.object({
    summary: z.string().max(8000),
    remaining: z.string().max(4000),
    artifacts: z.array(z.string()).max(30),
    nextStage: z.boolean().default(false),
  }),
};
const info: Record<keyof typeof toolSchemas, [Cap | null, string]> = {
  setup_list: [
    null,
    'List the approved setup instructions, skills, roles and references captured for this task.',
  ],
  setup_read: [
    null,
    'Read an approved setup document by its exact ID from setup_list. Uses the task snapshot, not a filesystem path.',
  ],
  list_files: [
    'files',
    'List up to 500 directory entries with a nextOffset when more remain. Excludes credentials and application state.',
  ],
  read_file: [
    'files',
    'Read bounded lines of UTF-8 text, PDF text, Word main text or spreadsheet cell values/formulas. Returns extraction notes and truncation. Use preview_file for images or layout.',
  ],
  count_words: ['files', 'Count words in one complete saved UTF-8 .txt, .md or .markdown workspace file. Uses the verifier Markdown convention; unavailable for partial or unsupported text. Returns the file hash and count, not a task verdict.'],
  search_files: [
    'files',
    'Search literal text recursively in project files. Returns line numbers and explicit coverage limits; skips binary files, credentials and dependency trees.',
  ],
  write_file: ['files', 'Write a workspace text file with a retained prior version.'],
  edit_file: [
    'files',
    'Replace one exact, unique text match in a UTF-8 file, retaining a backup. Read first; an absent or ambiguous match fails without editing.',
  ],
  preview_file: [
    'files',
    'Return an image of a saved PDF page, PNG/JPEG, static HTML viewport, Word Quick Look thumbnail or XLSX saved-cell grid. For XLSX, select sheet by name and range such as A1:D12 (at most 50 rows/12 columns). Grid previews do not reproduce native Excel layout; use read_file to recalculate formulas. Word previews may cover only the first page. Report coverage limits.',
  ],
  remove_file: ['files', 'Move a file to recoverable storage after user approval.'],
  shell: [
    'shell',
    'Run a network-isolated command. Workspace is read-only unless writable=true, which requires approval. Use file tools for ordinary edits.',
  ],
  web_read: [
    'web',
    'Read a public HTTPS text page or text-based PDF under 2 MB; returns source URL, text, links and explicit coverage limits. Scanned PDFs require OCR, which is not included.',
  ],
  web_search: ['web', 'Search the public web and return results with source URLs.'],
  browser: [
    'browser',
    'Use an isolated browser. Click and fill require approval. External writes are restricted to the approved action.',
  ],
  create_artifact: [
    'artifacts',
    'Create Markdown, HTML, PDF, Word, or Excel. PDF/Word render basic Markdown headings, lists and tables. XLSX supports typed rows or named sheets and explicit {formula:"SUM(B2:B4)"} cells; supported formulas are recalculated. Formula-like strings remain text. Reopen and preview the saved output; complex Office preservation is not supported.',
  ],
  checkpoint: [
    null,
    'Save concise completed work, evidence, remaining work and artifact paths. Use nextStage=true only when ending this stage and returning to the harness for another stage.',
  ],
};
export const definitions = (caps: Cap[]) =>
  Object.entries(toolSchemas)
    .filter(
      ([name]) =>
        !info[name as keyof typeof info][0] || caps.includes(info[name as keyof typeof info][0]!),
    )
    .map(([name, schema]) => ({
      name,
      description: info[name as keyof typeof info][1],
      parameters: z.toJSONSchema(schema, { target: 'draft-7' }),
    }));

export class ToolService {
  setups: SetupImporter;
  browsers = new Map<
    string,
    Awaited<ReturnType<typeof researchBrowser>> & {
      permit?: { origin: string };
    }
  >();
  constructor(
    public store: Store,
    public approvals: Approvals,
    public stateDir: string,
  ) {
    this.setups = new SetupImporter(store, stateDir);
  }
  async call(taskId: string, name: string, raw: unknown, signal: AbortSignal): Promise<any> {
    signal.throwIfAborted();
    const task = this.store.task(taskId),
      workspace = this.store.get<Workspace>('workspace', task.workspaceId)!;
    if (!Object.hasOwn(toolSchemas, name)) throw new Blocked('Unknown tool');
    const cap = info[name as keyof typeof info][0];
    if (cap && !task.required.includes(cap))
      throw new Blocked(`Task does not grant the ${cap} tool capability.`);
    const args = (toolSchemas as any)[name].parse(raw);
    this.store.event(taskId, 'tool_started', { name, args });
    let result: any;
    const path = () =>
      scoped(workspace.path, args.path, name === 'write_file' || name === 'create_artifact');
    switch (name) {
      case 'setup_list': {
        const snapshot = this.store.get<SetupSnapshot>('setup_snapshot', taskId);
        result = {
          defaultSkills: coreSkills.map(({ content, ...s }) => s),
          files: snapshot?.files.map(({ content, sourceHash, ...f }) => f) ?? [],
          warnings: snapshot?.warnings ?? [],
        };
        break;
      }
      case 'setup_read': {
        const file =
          coreSkills.find((s) => s.id === args.id) ??
          this.store
            .get<SetupSnapshot>('setup_snapshot', taskId)
            ?.files.find((f) => f.id === args.id);
        if (!file)
          throw new Blocked('Document is not part of this task’s approved setup snapshot.');
        result = {
          id: file.id,
          setup: 'setupName' in file ? file.setupName : 'DUKE default skills',
          path: file.path,
          content: file.content,
          sha256: file.sha256,
        };
        break;
      }
      case 'list_files': {
        const entries = (await readdir(await path(), { withFileTypes: true }))
          .filter((f) => !sensitive(f.name) && !f.isSymbolicLink())
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((f) => ({ name: f.name, directory: f.isDirectory() }));
        result = {
          entries: entries.slice(args.offset, args.offset + 500),
          total: entries.length,
          nextOffset: args.offset + 500 < entries.length ? args.offset + 500 : null,
        };
        break;
      }
      case 'read_file': {
        const file = await fileContent(workspace, args.path, signal),
          lines = file.content.split('\n');
        const excerpt = lines
          .slice(args.start_line - 1, args.start_line - 1 + args.max_lines)
          .join('\n');
        result = {
          ...file,
          path: args.path,
          content: excerpt.slice(0, 50000),
          startLine: args.start_line,
          totalLines: lines.length,
          truncated:
            file.truncated ||
            args.start_line > 1 ||
            args.start_line - 1 + args.max_lines < lines.length ||
            excerpt.length > 50000,
        };
        break;
      }
      case 'count_words': {
        const p = await path();
        if (!/\.(?:txt|md|markdown)$/i.test(p))
          throw new Blocked('Word measurement supports saved .txt, .md and .markdown files only.');
        const file = await fileContent(workspace, args.path, signal);
        if (file.truncated || !countableText(file.content))
          throw new Blocked('Word measurement unavailable for partial text, HTML or entities.');
        result = {
          path: args.path,
          words: countWords(file.content),
          sha256: createHash('sha256').update(file.content).digest('hex'),
          convention: 'Markdown syntax excluded; Unicode letters and numbers, with internal apostrophes and hyphens, count as words.',
        };
        break;
      }
      case 'search_files':
        result = await searchFiles(workspace.path, args.path, args.query, signal);
        break;
      case 'preview_file':
        result = await previewFile(workspace.path, args.path, args.page, signal, {
          sheet: args.sheet,
          range: args.range,
        });
        break;
      case 'edit_file': {
        const p = await path();
        if ((await stat(p)).size > 500000)
          throw new Error('Precise edits are limited to UTF-8 files under 500 KB.');
        const content = decodeText(await readFile(p)),
          first = content.indexOf(args.old_text);
        if (first < 0 || content.indexOf(args.old_text, first + 1) >= 0)
          throw new Error(
            'The old_text must match exactly once. Read the current file and include more surrounding text.',
          );
        const next =
          content.slice(0, first) + args.new_text + content.slice(first + args.old_text.length);
        if (Buffer.byteLength(next) > 500000) throw new Error('Edited file would exceed 500 KB.');
        await this.backup(taskId, p);
        signal.throwIfAborted();
        await this.saveFile(p, next, signal);
        result = await this.recordArtifact(taskId, workspace.path, p, signal);
        break;
      }
      case 'write_file': {
        const p = await path();
        await this.backup(taskId, p);
        signal.throwIfAborted();
        await this.saveFile(p, args.content, signal);
        result = await this.recordArtifact(taskId, workspace.path, p, signal);
        break;
      }
      case 'remove_file': {
        const p = await path();
        if (!(await stat(p)).isFile())
          throw new Blocked('Only individual file removal is supported.');
        const hash = createHash('sha256')
          .update(await readFile(p))
          .digest('hex');
        await this.approvals.request(taskId, 'Remove file', { path: p, sha256: hash }, signal);
        if (
          createHash('sha256')
            .update(await readFile(p))
            .digest('hex') !== hash
        )
          throw new Blocked('File changed after approval.');
        const target = join(this.stateDir, 'backups', taskId, randomUUID());
        await mkdir(resolve(target, '..'), { recursive: true });
        signal.throwIfAborted();
        await rename(p, target);
        result = { removed: args.path, recovery: target };
        break;
      }
      case 'shell': {
        if (args.writable)
          await this.approvals.request(
            taskId,
            'Shell with workspace write access',
            { workspace: workspace.path, command: args.command, network: 'disabled' },
            signal,
          );
        result = await this.shell(workspace, args.command, args.writable, signal);
        break;
      }
      case 'web_read':
        result = await fetchPublic(args.url, signal);
        result.requestedUrl = args.url;
        this.store.event(taskId, 'source', { url: result.url });
        break;
      case 'web_search':
        result = await searchPublic(args.query, signal);
        this.store.event(taskId, 'source', { url: result.url, query: args.query });
        break;
      case 'browser':
        result = await this.browse(task, workspace, args, signal);
        break;
      case 'create_artifact': {
        const p = await path();
        const extensions: Record<string, string[]> = {
          markdown: ['.md'],
          html: ['.html'],
          pdf: ['.pdf'],
          docx: ['.docx'],
          xlsx: ['.xlsx'],
        };
        if (!extensions[args.format].includes(extname(p).toLowerCase()))
          throw new Blocked('Artifact filename extension must match its format.');
        await this.backup(taskId, p);
        signal.throwIfAborted();
        if (args.format === 'markdown' || args.format === 'html')
          await this.saveFile(p, args.content, signal);
        if (args.format === 'docx') {
          await this.saveFile(p, await wordArtifact(args.content), signal);
        }
        if (args.format === 'xlsx') {
          const workbook = await makeSpreadsheet(args.content, args.rows, args.sheets, signal);
          await this.saveFile(p, workbook.bytes, signal);
          result = { calculation: workbook.calculation };
        }
        if (args.format === 'pdf') {
          await this.saveFile(p, await pdfArtifact(args.content, signal), signal);
        }
        result = {
          ...(await this.recordArtifact(taskId, workspace.path, p, signal)),
          ...result,
        };
        break;
      }
      case 'checkpoint': {
        for (const a of args.artifacts) await scoped(workspace.path, a);
        signal.throwIfAborted();
        const old = this.store.task(taskId).checkpoint;
        this.store.update(taskId, {
          checkpoint: {
            summary: args.summary,
            remaining: args.remaining,
            repairDifficulty: old?.repairDifficulty,
            artifacts: args.artifacts,
            session: old?.session,
            at: now(),
          },
        });
        this.store.put('nextStage', taskId, args.nextStage);
        result = { saved: true, nextStage: args.nextStage };
        break;
      }
    }
    signal.throwIfAborted();
    this.store.event(taskId, 'tool_completed', { name, result: toolReceipt(result) });
    return result;
  }
  async backup(taskId: string, path: string) {
    try {
      if (!(await stat(path)).isFile()) throw new Blocked('Destination is not a file');
      const dest = join(this.stateDir, 'backups', taskId, randomUUID());
      await mkdir(resolve(dest, '..'), { recursive: true });
      await copyFile(path, dest);
      this.store.event(taskId, 'backup', { path, recovery: dest });
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  private async saveFile(path: string, bytes: string | Uint8Array, signal: AbortSignal) {
    signal.throwIfAborted();
    const staging = `${path}.duke-${randomUUID()}.tmp`;
    try {
      await writeFile(staging, bytes, { mode: 0o600, flag: 'wx', signal });
      signal.throwIfAborted();
      await rename(staging, path);
    } finally {
      await rm(staging, { force: true });
    }
  }
  async recordArtifact(taskId: string, root: string, path: string, signal?: AbortSignal) {
    root = await scoped(root, '.');
    const data = await readFile(path),
      a = {
        id: randomUUID(),
        taskId,
        path: relative(root, path),
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        at: now(),
      };
    signal?.throwIfAborted();
    this.store.put('artifact', a.id, a);
    this.store.event(taskId, 'artifact', a);
    return a;
  }
  async shell(
    w: Workspace,
    command: string,
    writable: boolean,
    signal: AbortSignal,
  ): Promise<ProcessResult> {
    if (process.platform !== 'darwin' && process.platform !== 'linux')
      return {
        status: 'unavailable',
        code: null,
        stdout: '',
        stderr: 'The sandbox is not supported on this platform.',
      };
    const r = await runProcess(process.execPath, shellRunnerArgs(), {
      input: JSON.stringify({ workspace: w.path, command, writable }),
      signal,
      timeout: 100000,
      // The inner 250k-character output may expand sixfold when JSON-escaped.
      maxOutput: 2_000_000,
    });
    if (r.status !== 'exited' || r.code !== 0)
      return {
        ...r,
        status: r.status === 'exited' ? 'unavailable' : r.status,
        code: null,
        stdout: '',
        stderr: `The sandbox runner did not return a complete result (${r.status}). ${r.stderr}`,
      };
    try {
      return z
        .object({
          status: z.enum(['exited', 'timed_out', 'output_limit', 'unavailable', 'interrupted']),
          code: z.number().int().nullable(),
          stdout: z.string(),
          stderr: z.string(),
        })
        .refine((v) => v.status !== 'exited' || v.code !== null)
        .parse(JSON.parse(r.stdout));
    } catch {
      return {
        status: 'unavailable',
        code: null,
        stdout: '',
        stderr: 'The sandbox runner returned an unreadable result. Command completion is unknown.',
      };
    }
  }
  async browse(task: Task, w: Workspace, args: any, signal: AbortSignal) {
    let state = this.browsers.get(task.id);
    if (!state) {
      state = await researchBrowser(() => state?.permit?.origin);
      if (signal.aborted) {
        await state.close();
        signal.throwIfAborted();
      }
      this.browsers.set(task.id, state);
    }
    const { page } = state;
    const abort = () => void this.close(task.id);
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (args.action === 'open') {
        await publicURL(args.url);
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await publicURL(page.url());
        this.store.event(task.id, 'source', { url: page.url() });
      }
      if (args.action === 'click' || args.action === 'fill') {
        if (!args.selector) throw new Blocked('A selector is required');
        const describeTarget = async () => ({
          url: page.url(),
          action: args.action,
          selector: args.selector,
          text: args.text ?? '',
          element: (
            await page
              .locator(args.selector)
              .first()
              .innerText({ timeout: 3000 })
              .catch(() => '')
          ).slice(0, 500),
          form: await page
            .locator(args.selector)
            .first()
            .evaluate((element) => {
              const form = element.closest('form');
              if (!form) return null;
              return {
                action: form.action,
                method: form.method,
                fields: [...form.querySelectorAll('input,select,textarea')]
                  .map((e) => ({
                    name: (e as HTMLInputElement).name,
                    type: (e as HTMLInputElement).type,
                    value:
                      (e as HTMLInputElement).type === 'password'
                        ? '[password withheld]'
                        : (e as HTMLInputElement).value,
                  }))
                  .slice(0, 40),
              };
            }),
        });
        const target = await describeTarget();
        const operationHash = fingerprint('browser', target);
        const prior = this.store
          .list<any>('effect')
          .find((e) => e.taskId === task.id && e.operationHash === operationHash);
        if (prior?.state === 'completed')
          return {
            alreadyDispatched: true,
            url: page.url(),
            note: 'This exact browser action was already dispatched; inspect its result rather than repeating it.',
          };
        if (prior?.state === 'pending')
          throw new UncertainEffect(
            'This browser action has an uncertain outcome. Review it before resuming.',
          );
        await this.approvals.request(task.id, 'Browser action', target, signal);
        if (page.url() !== target.url) throw new Blocked('Page changed after approval.');
        if (fingerprint('browser', await describeTarget()) !== operationHash)
          throw new Blocked('The target or form contents changed after approval.');
        const effectId = randomUUID();
        this.store.put('effect', effectId, {
          id: effectId,
          operationHash,
          taskId: task.id,
          target,
          state: 'pending',
          at: now(),
        });
        state.permit = { origin: new URL(page.url()).origin };
        try {
          if (args.action === 'click')
            await page.locator(args.selector).first().click({ timeout: 10000 });
          else
            await page
              .locator(args.selector)
              .first()
              .fill(args.text ?? '', { timeout: 10000 });
          this.store.put('effect', effectId, {
            id: effectId,
            operationHash,
            taskId: task.id,
            target,
            state: 'completed',
            at: now(),
          });
        } catch {
          throw new UncertainEffect(
            'Browser action outcome is uncertain. Review the page before resuming.',
          );
        } finally {
          state.permit = undefined;
        }
      }
      await publicURL(page.url());
      if (args.action === 'screenshot') {
        const p = await scoped(w.path, `artifacts/browser-${Date.now()}.png`, true);
        const bytes = await page.screenshot({ path: p });
        return {
          ...(await this.recordArtifact(task.id, w.path, p)),
          coverage: 'Current browser viewport only',
          images: [imageResult(bytes, 'image/png', page.url())],
        };
      }
      const body = await page.locator('body').innerText();
      return {
        url: page.url(),
        title: await page.title(),
        text: body.slice(0, 30000),
        truncated: body.length > 30000,
        links: await page.locator('a').evaluateAll((els) =>
          els.slice(0, 60).map((a) => ({
            text: (a.textContent ?? '').slice(0, 100),
            url: (a as HTMLAnchorElement).href,
          })),
        ),
      };
    } catch (error) {
      await this.close(task.id);
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
  async close(taskId: string) {
    const s = this.browsers.get(taskId);
    this.browsers.delete(taskId);
    if (s) await s.close();
  }
}
