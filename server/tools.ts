import { z } from 'zod';
import { readFile, writeFile, readdir, stat, rename, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { Document, Packer, Paragraph } from 'docx';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Store } from './store.js';
import { Approvals, fingerprint } from './approval.js';
import { scoped, sensitive } from './paths.js';
import { runProcess } from './process.js';
import { shellRunnerArgs } from './runtime.js';
import { fetchPublic, publicURL } from './web.js';
import { Blocked, UncertainEffect, now, type Task, type Workspace, type Cap } from './types.js';
import { SetupImporter } from './setup-import.js';
import type { SetupSnapshot } from '../shared/setup.js';

export const toolSchemas = {
  setup_list: z.object({}),
  setup_read: z.object({ id: z.string().min(1).max(100) }),
  list_files: z.object({ path: z.string().default('.') }),
  read_file: z.object({ path: z.string() }),
  write_file: z.object({ path: z.string(), content: z.string().max(500000) }),
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
    rows: z
      .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
      .max(5000)
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
  setup_list: [null, 'List the approved setup instructions, skills, roles and references captured for this task.'],
  setup_read: [null, 'Read an approved setup document by its exact ID from setup_list. Uses the task snapshot, not a filesystem path.'],
  list_files: ['files', 'List workspace files; excludes credentials and application state.'],
  read_file: ['files', 'Read a UTF-8 file in the workspace.'],
  write_file: ['files', 'Write a workspace text file with a retained prior version.'],
  remove_file: ['files', 'Move a file to recoverable storage after user approval.'],
  shell: [
    'shell',
    'Run a network-isolated command. Workspace is read-only unless writable=true, which requires approval. Use file tools for ordinary edits.',
  ],
  web_read: ['web', 'Read a public HTTPS page; returns source URL and links.'],
  web_search: ['web', 'Search the public web and return results with source URLs.'],
  browser: [
    'browser',
    'Use an isolated browser. Click and fill require approval. External writes are restricted to the approved action.',
  ],
  create_artifact: [
    'artifacts',
    'Create a Markdown, HTML, PDF, Word, or Excel artifact. XLSX uses rows; other formats use content.',
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
    { browser: Browser; context: BrowserContext; page: Page; permit?: { origin: string } }
  >();
  constructor(
    public store: Store,
    public approvals: Approvals,
    public stateDir: string,
  ) { this.setups = new SetupImporter(store, stateDir); }
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
        result = { files: snapshot?.files.map(({ content, sourceHash, ...f }) => f) ?? [], warnings: snapshot?.warnings ?? [] };
        break;
      }
      case 'setup_read': {
        const file = this.store.get<SetupSnapshot>('setup_snapshot', taskId)?.files.find(f => f.id === args.id);
        if (!file) throw new Blocked('Document is not part of this task’s approved setup snapshot.');
        result = { id: file.id, setup: file.setupName, path: file.path, content: file.content, sha256: file.sha256 };
        break;
      }
      case 'list_files':
        result = (await readdir(await path(), { withFileTypes: true }))
          .filter((f) => !sensitive(f.name) && !f.isSymbolicLink())
          .slice(0, 500)
          .map((f) => ({ name: f.name, directory: f.isDirectory() }));
        break;
      case 'read_file': {
        const p = await path();
        if ((await stat(p)).size > 500000)
          throw new Blocked('File is larger than 500 KB. Narrow the read using shell.');
        result = { path: args.path, content: await readFile(p, 'utf8') };
        break;
      }
      case 'write_file': {
        const p = await path();
        await this.backup(taskId, p);
        signal.throwIfAborted();
        await writeFile(p, args.content, { mode: 0o600 });
        result = await this.recordArtifact(taskId, workspace.path, p);
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
        result = await fetchPublic(
          'https://www.google.com/search?q=' + encodeURIComponent(args.query),
          signal,
        );
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
          await writeFile(p, args.content, { mode: 0o600 });
        if (args.format === 'docx') {
          const d = new Document({
            sections: [
              { children: args.content.split('\n').map((text: string) => new Paragraph(text)) },
            ],
          });
          await writeFile(p, await Packer.toBuffer(d));
        }
        if (args.format === 'xlsx') {
          const book = new ExcelJS.Workbook();
          book.addWorksheet('Sheet 1').addRows(args.rows ?? [[args.content]]);
          await book.xlsx.writeFile(p);
          const check = new ExcelJS.Workbook();
          await check.xlsx.readFile(p);
        }
        if (args.format === 'pdf') {
          const pdf = await PDFDocument.create(),
            font = await pdf.embedFont(StandardFonts.Helvetica);
          let page = pdf.addPage(),
            y = 790;
          for (const line of args.content.split('\n')) {
            const words = line.split(/\s+/);
            let wrapped = '';
            for (const word of words) {
              if (font.widthOfTextAtSize(wrapped + ' ' + word, 11) > 490) {
                if (y < 50) {
                  page = pdf.addPage();
                  y = 790;
                }
                page.drawText(wrapped, { x: 50, y, size: 11, font });
                y -= 16;
                wrapped = '';
              }
              wrapped += (wrapped ? ' ' : '') + word;
            }
            if (y < 50) {
              page = pdf.addPage();
              y = 790;
            }
            page.drawText(wrapped, { x: 50, y, size: 11, font });
            y -= 18;
          }
          await writeFile(p, await pdf.save());
          await PDFDocument.load(await readFile(p));
        }
        result = await this.recordArtifact(taskId, workspace.path, p);
        break;
      }
      case 'checkpoint': {
        for (const a of args.artifacts) await scoped(workspace.path, a);
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
    this.store.event(taskId, 'tool_completed', { name, result });
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
  async recordArtifact(taskId: string, root: string, path: string) {
    const data = await readFile(path),
      a = {
        id: randomUUID(),
        taskId,
        path: relative(root, path),
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        at: now(),
      };
    this.store.put('artifact', a.id, a);
    this.store.event(taskId, 'artifact', a);
    return a;
  }
  async shell(w: Workspace, command: string, writable: boolean, signal: AbortSignal) {
    if (process.platform !== 'darwin' && process.platform !== 'linux')
      throw new Blocked('The sandbox is not supported on this platform.');
    const r = await runProcess(
      process.execPath,
      shellRunnerArgs(),
      { input: JSON.stringify({ workspace: w.path, command, writable }), signal, timeout: 100000 },
    );
    try {
      return JSON.parse(r.stdout);
    } catch {
      throw new Blocked('Sandbox failed to initialize; command was not run.');
    }
  }
  async browse(task: Task, w: Workspace, args: any, signal: AbortSignal) {
    let state = this.browsers.get(task.id);
    if (!state) {
      const browser = await chromium.launch({ headless: true }),
        context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' }),
        page = await context.newPage();
      state = { browser, context, page };
      this.browsers.set(task.id, state);
      const s = state;
      await context.route('**/*', async (route) => {
        try {
          await publicURL(route.request().url());
          if (
            !['GET', 'HEAD'].includes(route.request().method()) &&
            new URL(route.request().url()).origin !== s.permit?.origin
          )
            return route.abort();
          return route.continue();
        } catch {
          return route.abort();
        }
      });
      context.on('page', async (p) => {
        if (p !== page) await p.close();
      });
    }
    const { page } = state;
    const abort = () => void this.close(task.id);
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (args.action === 'open') {
        await publicURL(args.url);
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
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
      if (args.action === 'screenshot') {
        const p = await scoped(w.path, `artifacts/browser-${Date.now()}.png`, true);
        await page.screenshot({ path: p, fullPage: true });
        return this.recordArtifact(task.id, w.path, p);
      }
      return {
        url: page.url(),
        title: await page.title(),
        text: (await page.locator('body').innerText()).slice(0, 30000),
        links: await page.locator('a').evaluateAll((els) =>
          els.slice(0, 60).map((a) => ({
            text: (a.textContent ?? '').slice(0, 100),
            url: (a as HTMLAnchorElement).href,
          })),
        ),
      };
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
  async close(taskId: string) {
    const s = this.browsers.get(taskId);
    this.browsers.delete(taskId);
    if (s) await s.browser.close().catch(() => {});
  }
}
