import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { Store } from '../server/store.js';
import { ToolService } from '../server/tools.js';
import { Approvals } from '../server/approval.js';
import { TaskInput } from '../server/types.js';
test('PDF and XLSX artifacts reopen with expected content structure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-artifacts-')),
    path = join(root, 'workspace');
  await mkdir(path);
  const s = new Store(join(root, 'state', 'db'));
  s.put('workspace', 'w', { id: 'w', name: 'test', path, providers: ['codex'], instructions: [] });
  s.save({
    ...TaskInput.parse({ prompt: 'Create files', workspaceId: 'w', required: ['artifacts'] }),
    id: 't',
    title: 'test',
    status: 'running',
    attempt: 0,
    createdAt: '',
    updatedAt: '',
  });
  const tools = new ToolService(s, new Approvals(s), join(root, 'state'));
  try {
    await tools.call(
      't',
      'create_artifact',
      { path: 'out.pdf', format: 'pdf', content: 'One\nTwo\nThree' },
      new AbortController().signal,
    );
    const pdf = await PDFDocument.load(await readFile(join(path, 'out.pdf')));
    assert.equal(pdf.getPageCount(), 1);
    await tools.call(
      't',
      'create_artifact',
      {
        path: 'out.xlsx',
        format: 'xlsx',
        content: '',
        rows: [
          ['Name', 'Count'],
          ['One', 42],
        ],
      },
      new AbortController().signal,
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(join(path, 'out.xlsx'));
    assert.equal(book.worksheets[0].getCell('B2').value, 42);
  } finally {
    s.close();
    await rm(root, { recursive: true, force: true });
  }
});
