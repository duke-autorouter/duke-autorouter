import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { Store } from '../server/store.js';
import { ToolService } from '../server/tools.js';
import { Approvals } from '../server/approval.js';
import { TaskInput } from '../server/types.js';
import { calculateWorkbook, makeSpreadsheet } from '../server/spreadsheets.js';
import {
  codexToolContent,
  claudeToolContent,
  splitToolResult,
  toolReceipt,
} from '../server/tool-results.js';
import { requestBudget } from '../server/request-budget.js';
import { coreSkills } from '../server/core-skills.js';
import { searchPublic, parsePublicContent } from '../server/web.js';
import { isolatedPage } from '../server/previews.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'duke-default-tools-')),
    path = join(root, 'work');
  await mkdir(path);
  const store = new Store(join(root, 'state', 'db'));
  store.put('workspace', 'w', {
    id: 'w',
    name: 'test',
    path,
    providers: ['codex'],
    instructions: [],
  });
  store.save({
    ...TaskInput.parse({
      prompt: 'Check standard tools',
      workspaceId: 'w',
      required: ['files', 'artifacts'],
    }),
    id: 't',
    title: 'test',
    status: 'running',
    attempt: 0,
    createdAt: '',
    updatedAt: '',
  });
  const tools = new ToolService(store, new Approvals(store), join(root, 'state'));
  return {
    root,
    path,
    store,
    call: (name: string, args: unknown) =>
      tools.call('t', name, args, new AbortController().signal),
    close: async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('bounded reads, search and precise edits preserve project boundaries and prior bytes', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.path, 'readme.md'), 'First\nneedle\nThird\nneedle');
    await writeFile(join(f.path, '.env'), 'needle SECRET');
    await writeFile(join(f.root, 'outside.txt'), 'needle OUTSIDE');
    await symlink(join(f.root, 'outside.txt'), join(f.path, 'link.txt'));
    const read = await f.call('read_file', { path: 'readme.md', start_line: 2, max_lines: 1 });
    assert.equal(read.content, 'needle');
    assert.equal(read.truncated, true);
    assert.equal(read.totalLines, 4);
    const search = await f.call('search_files', { query: 'needle' });
    assert.deepEqual(
      search.matches.map((m: any) => m.line),
      [2, 4],
    );
    assert.equal(search.truncated, false);
    await assert.rejects(
      f.call('edit_file', { path: 'readme.md', old_text: 'needle', new_text: 'x' }),
      /exactly once/,
    );
    assert.match(await readFile(join(f.path, 'readme.md'), 'utf8'), /First\nneedle/);
    await f.call('edit_file', {
      path: 'readme.md',
      old_text: 'First\nneedle',
      new_text: 'First\nreplacement',
    });
    const backup = f.store.events('t').find((e) => e.kind === 'backup')!;
    assert.equal(await readFile(backup.data.recovery, 'utf8'), 'First\nneedle\nThird\nneedle');
    await assert.rejects(f.call('read_file', { path: 'link.txt' }), /Symlink/);
    await assert.rejects(f.call('search_files', { path: '..', query: 'needle' }), /outside/);
    await writeFile(join(f.path, 'binary.bin'), Buffer.from([0, 255, 0]));
    await assert.rejects(f.call('read_file', { path: 'binary.bin' }), /binary/);
  } finally {
    await f.close();
  }
});

test('directory listings expose a stable next page and packaged skills are readable', async () => {
  const f = await fixture();
  try {
    await Promise.all(
      Array.from({ length: 503 }, (_, i) =>
        writeFile(join(f.path, `${String(i).padStart(3, '0')}.txt`), 'sample'),
      ),
    );
    const first = await f.call('list_files', {}),
      last = await f.call('list_files', { offset: first.nextOffset });
    assert.equal(first.entries.length, 500);
    assert.equal(first.total, 503);
    assert.equal(last.entries.length, 3);
    assert.equal(last.nextOffset, null);
    const skills = await f.call('setup_list', {});
    assert.equal(skills.defaultSkills.length, 4);
    for (const skill of coreSkills)
      assert.match((await f.call('setup_read', { id: skill.id })).content, /\S/);
  } finally {
    await f.close();
  }
});

test('workbook formulas recalculate from inputs, across sheets, while formula-like text stays text', async () => {
  const { bytes, calculation } = await makeSpreadsheet('', undefined, [
    {
      name: 'Inputs',
      rows: [
        ['Item', 'Count'],
        ['Hammer', 8],
        ['Drill', 4],
        ['Sander', 3],
        ['Total', { formula: 'SUM(B2:B4)' }],
      ],
    },
    {
      name: 'Summary',
      rows: [
        ['Total', { formula: 'Inputs!B5*2' }],
        ['Literal', '=1+1'],
        ['Zero', { formula: '1-1' }],
      ],
    },
  ]);
  assert.equal(calculation.formulas, 3);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as any);
  assert.equal(book.getWorksheet('Inputs')!.getCell('B5').result, 15);
  assert.equal(book.getWorksheet('Summary')!.getCell('B1').result, 30);
  assert.equal(book.getWorksheet('Summary')!.getCell('B2').value, '=1+1');
  assert.equal(book.getWorksheet('Summary')!.getCell('B3').result, 0);
  book.getWorksheet('Inputs')!.getCell('B2').value = 10;
  await calculateWorkbook(book);
  assert.equal(book.getWorksheet('Summary')!.getCell('B1').result, 34);
  for (const formula of ['UNKNOWN_FUNCTION(1)', '[external.xlsx]Sheet1!A1', '1/0', 'A1'])
    await assert.rejects(makeSpreadsheet('', [[{ formula }]]));
});

test('saved document inputs and PDF pages expose content, Unicode, limits and real image payloads', async () => {
  const f = await fixture();
  try {
    const markdown =
      '# Sample résumé\n\n**Invented** café inventory. 日本語\n\n| Item | Count |\n|---|---:|\n| Hammer | 8 |\n';
    for (const format of ['docx', 'pdf']) {
      await f.call('create_artifact', { path: `sample.${format}`, format, content: markdown });
      const read = await f.call('read_file', { path: `sample.${format}` });
      assert.match(read.content, /Hammer/);
      assert.doesNotMatch(read.content, /# Sample|\*\*Invented|\|---/);
    }
    await f.call('create_artifact', {
      path: 'sample.xlsx',
      format: 'xlsx',
      content: '',
      rows: [
        ['A', 8],
        ['B', { formula: 'B1*2' }],
      ],
    });
    const sheet = await f.call('read_file', { path: 'sample.xlsx' });
    assert.match(sheet.content, /B2: 16/);
    assert.match(sheet.notes.join(' '), /1 formulas recalculated/);
    const preview = await f.call('preview_file', { path: 'sample.pdf' });
    assert.equal(preview.pages, 1);
    assert.equal(preview.images[0].mimeType, 'image/png');
    assert.equal(
      Buffer.from(preview.images[0].data, 'base64').subarray(0, 8).toString('hex'),
      '89504e470d0a1a0a',
    );
    assert.equal(codexToolContent(preview)[1].type, 'inputImage');
    assert.equal(claudeToolContent(preview)[1].type, 'image');
    assert.ok(!JSON.stringify(toolReceipt(preview)).includes(preview.images[0].data));
    assert.equal(splitToolResult([1, 2]).text, '[1,2]');
    await assert.rejects(f.call('preview_file', { path: 'sample.pdf', page: 2 }), /page/i);
    const saved = f.store
      .events('t')
      .findLast((e) => e.kind === 'tool_completed' && e.data.name === 'preview_file');
    assert.equal(saved!.data.result.images[0].data, undefined);
  } finally {
    await f.close();
  }
});

test('ordinary spreadsheet aggregation and conditional formulas match independently specified results', async () => {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet('Budget');
  sheet.addRows([
    ['Group', 'Amount'],
    ['Tools', 8],
    ['Tools', 4],
    ['Other', 3],
  ]);
  const cases: [string, number | string][] = [
    ['SUM(B2:B4)', 15],
    ['AVERAGE(B2:B4)', 5],
    ['SUMIF(A2:A4,"Tools",B2:B4)', 12],
    ['COUNTIF(A2:A4,"Tools")', 2],
    ['IF(SUM(B2:B4)>10,"Over","Under")', 'Over'],
    ['ROUND(10/3,2)', 3.33],
    ['MAX(B2:B4)-MIN(B2:B4)', 5],
  ];
  cases.forEach(([formula], i) => {
    sheet.getCell(`D${i + 1}`).value = { formula };
  });
  await calculateWorkbook(book);
  cases.forEach(([, expected], i) => assert.equal(sheet.getCell(`D${i + 1}`).result, expected));
});

test('long PDF tables paginate and preserve final rows and Unicode from the saved output', async () => {
  const f = await fixture();
  try {
    const content =
      '# Résumé table\n\n| Item | Notes |\n|---|---|\n' +
      Array.from(
        { length: 100 },
        (_, i) =>
          `| Entry ${i + 1} | Invented café information, with a longer sentence that should wrap inside the table. |`,
      ).join('\n');
    await f.call('create_artifact', { path: 'long.pdf', format: 'pdf', content });
    const preview = await f.call('preview_file', { path: 'long.pdf' });
    assert.ok(preview.pages > 1);
    const read = await f.call('read_file', { path: 'long.pdf', max_lines: 2000 });
    assert.match(read.content, /Entry 100/);
    assert.match(read.content, /café/);
    assert.equal(read.truncated, false);
  } finally {
    await f.close();
  }
});

test('image requests reserve the full approved input context instead of treating compressed bytes as tokens', () => {
  const model = {
    inputPrice: 1,
    outputPrice: 2,
    providerSlug: 'fixture',
    maxOutput: 1000,
    contextLimit: 32000,
    requestPrice: 0,
  } as any;
  const estimate = requestBudget(
    model,
    [
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }],
      },
    ],
    [],
  );
  assert.equal(estimate, 0.034);
});

test('partly unreadable PDF pages and unsupported cached formulas remain incomplete evidence', async () => {
  const f = await fixture();
  try {
    await f.call('create_artifact', {
      path: 'partial.pdf',
      format: 'pdf',
      content: '# Readable first page',
    });
    const pdf = await PDFDocument.load(await readFile(join(f.path, 'partial.pdf')));
    pdf.addPage();
    await writeFile(join(f.path, 'partial.pdf'), await pdf.save());
    const read = await f.call('read_file', { path: 'partial.pdf' });
    assert.match(read.content, /Readable first page/);
    assert.equal(read.truncated, true);
    assert.match(read.notes.join(' '), /Pages 2 have no extractable text/);

    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Cached').getCell('A1').value = {
      formula: 'UNSUPPORTED_TEST(1)',
      result: 42,
    };
    await workbook.xlsx.writeFile(join(f.path, 'cached.xlsx'));
    const cached = await f.call('read_file', { path: 'cached.xlsx' });
    assert.equal(cached.truncated, true);
    assert.match(cached.notes.join(' '), /Formula calculation unverified/);
  } finally {
    await f.close();
  }
});

test('static HTML rendering blocks scripts and network or local subresources', async () => {
  const result = await isolatedPage(
    '<h1>Saved preview</h1><script>document.body.dataset.executed="yes"</script><img id="remote" src="https://example.com/tracking.png"><iframe src="file:///etc/passwd"></iframe>',
    undefined,
    async (page) => {
      return page.evaluate(() => ({
        heading: document.querySelector('h1')?.textContent,
        executed: document.body.dataset.executed,
        imageLoaded: (document.getElementById('remote') as HTMLImageElement).naturalWidth > 0,
        frameText: document.querySelector('iframe')?.contentDocument?.body?.textContent ?? '',
      }));
    },
  );
  assert.equal(result.heading, 'Saved preview');
  assert.equal(result.executed, undefined);
  assert.equal(result.imageLoaded, false);
  assert.equal(result.frameText, '');
});

test('public source extraction reads PDF bytes and preserves literal plain-text content', async () => {
  const f = await fixture(),
    signal = new AbortController().signal;
  try {
    await f.call('create_artifact', {
      path: 'source.pdf',
      format: 'pdf',
      content: '# Public source\n\nInvented PDF research text.',
    });
    const pdf = await parsePublicContent(
      'https://example.org/source.pdf',
      await readFile(join(f.path, 'source.pdf')),
      'application/pdf',
      signal,
    );
    assert.equal(pdf.url, 'https://example.org/source.pdf');
    assert.match(pdf.text, /Invented PDF research text/);
    assert.equal(pdf.truncated, false);
    const plain = await parsePublicContent(
      'https://example.org/source.txt',
      Buffer.from('Use <value>\nnext line'),
      'text/plain',
      signal,
    );
    assert.equal(plain.text, 'Use <value>\nnext line');
    await assert.rejects(
      parsePublicContent(
        'https://example.org/image.png',
        Buffer.from([0, 255]),
        'image/png',
        signal,
      ),
      /unsupported/,
    );
  } finally {
    await f.close();
  }
});

test('workbook preview exposes a chosen sheet and range without claiming native Excel layout', async () => {
  const f = await fixture();
  try {
    await f.call('create_artifact', {
      path: 'sheets.xlsx',
      format: 'xlsx',
      content: '',
      sheets: [
        {
          name: 'Inventory',
          rows: [
            ['Item', 'Count'],
            ['Hammer', 8],
            ['Drill', 4],
            ['Total', { formula: 'SUM(B2:B3)' }],
          ],
        },
        { name: 'Summary', rows: [['Total', { formula: 'Inventory!B4' }]] },
      ],
    });
    const preview = await f.call('preview_file', {
      path: 'sheets.xlsx',
      sheet: 'Summary',
      range: 'A1:B1',
    });
    assert.equal(preview.sheet, 'Summary');
    assert.equal(preview.range, 'A1:B1');
    assert.deepEqual(preview.sheets, ['Inventory', 'Summary']);
    assert.match(preview.coverage, /does not reproduce native Excel layout/);
    assert.equal(
      Buffer.from(preview.images[0].data, 'base64').subarray(0, 8).toString('hex'),
      '89504e470d0a1a0a',
    );
    for (const options of [
      { sheet: 'Missing' },
      { range: 'A1:B9999' },
      { range: 'B2:A1' },
      { range: '<script>' },
    ])
      await assert.rejects(f.call('preview_file', { path: 'sheets.xlsx', ...options }));
  } finally {
    await f.close();
  }
});

test('keyless search returns bounded original sources without paid credentials or answer synthesis', async () => {
  const signal = new AbortController().signal;
  let request: RequestInit | undefined;
  const transport: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://api.tavily.com/search');
    request = init;
    return Response.json({
      results: [
        { url: 'https://example.org/source', title: 'Primary source', content: 'A'.repeat(2000) },
        { url: 'https://example.org/source', title: 'Duplicate' },
        { url: 'http://example.org/insecure', title: 'Insecure' },
        { url: 'https://127.0.0.1/private', title: 'Private' },
      ],
    });
  };
  const result = await searchPublic('public question', signal, transport);
  const headers = new Headers(request!.headers);
  assert.equal(headers.get('X-Tavily-Access-Mode'), 'keyless');
  assert.equal(headers.get('Authorization'), null);
  const body = JSON.parse(String(request!.body));
  assert.equal(body.include_answer, false);
  assert.equal(body.auto_parameters, false);
  assert.equal(body.query, 'public question');
  assert.deepEqual(result.links, [{ url: 'https://example.org/source', text: 'Primary source' }]);
  assert.ok(result.text.length < 800);
  assert.match(result.note, /Read each original source/);
});

test('search errors, empty responses and service limits never become successful discovery', async () => {
  const signal = new AbortController().signal;
  for (const status of [429, 432, 433]) {
    let calls = 0;
    await assert.rejects(
      searchPublic('test', signal, async () => {
        calls++;
        return new Response('', { status });
      }),
      /rate-limited/,
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    searchPublic('test', signal, async () => Response.json({ results: [] })),
    /no usable results/,
  );
  await assert.rejects(
    searchPublic('test', signal, async () => Response.json({ error: { code: 'limit' } })),
    /error or an unreadable/,
  );
  await assert.rejects(
    searchPublic('test', signal, async () => new Response('x'.repeat(2_000_001))),
    /exceeds 2 MB/,
  );
});
