import { readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { scoped } from './paths.js';
import { nativeDocument } from './native-documents.js';
import type { ToolImage } from './tool-results.js';
import { officeXML } from './task-evidence.js';

const escapeHTML = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

async function spreadsheetPreview(
  source: Buffer,
  options: { sheet?: string; range?: string },
  signal: AbortSignal,
) {
  if (source.length > 2_000_000) throw new Error('Spreadsheet cell previews are limited to 2 MB.');
  officeXML(source);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(source as any);
  const sheet = options.sheet ? book.getWorksheet(options.sheet) : book.worksheets[0];
  if (!sheet) throw new Error('Worksheet not found. Read the workbook to get its sheet names.');
  const requested = options.range?.match(/^([A-Z]{1,3})([1-9]\d*):([A-Z]{1,3})([1-9]\d*)$/i);
  if (options.range && !requested) throw new Error('Use a cell range such as A1:D12.');
  const column = (letters: string) =>
    [...letters.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const firstRow = requested ? Number(requested[2]) : 1,
    lastRow = requested ? Number(requested[4]) : Math.min(sheet.rowCount, 50);
  const firstColumn = requested ? column(requested[1]) : 1,
    lastColumn = requested ? column(requested[3]) : Math.min(sheet.columnCount, 12);
  if (
    firstRow > lastRow ||
    firstColumn > lastColumn ||
    lastRow > 1048576 ||
    lastColumn > 16384 ||
    lastRow - firstRow >= 50 ||
    lastColumn - firstColumn >= 12
  )
    throw new Error('Choose a nonempty range of at most 50 rows and 12 columns.');
  let clippedCells = 0;
  let table = '<table><thead><tr><th></th>';
  for (let col = firstColumn; col <= lastColumn; col++)
    table += `<th>${sheet.getColumn(col).letter}</th>`;
  table += '</tr></thead><tbody>';
  for (let row = firstRow; row <= lastRow; row++) {
    table += `<tr><th>${row}</th>`;
    for (let col = firstColumn; col <= lastColumn; col++) {
      const cell = sheet.getCell(row, col),
        text = cell.text;
      if (text.length > 300) clippedCells++;
      table += `<td style="${cell.font?.bold ? 'font-weight:700;' : ''}${typeof cell.value === 'number' || typeof cell.result === 'number' ? 'text-align:right;' : ''}">${escapeHTML(text.slice(0, 300))}${text.length > 300 ? '…' : ''}</td>`;
    }
    table += '</tr>';
  }
  const range = `${sheet.getCell(firstRow, firstColumn).address}:${sheet.getCell(lastRow, lastColumn).address}`;
  const content = `<style>body{font:16px Arial,sans-serif;color:#18263b;padding:20px}h1{font-size:22px}p{color:#516277}table{border-collapse:collapse;table-layout:fixed;width:1120px}th,td{border:1px solid #cbd5e1;padding:9px;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#eef2f6}th:first-child{width:42px}td{vertical-align:top}</style><h1>${escapeHTML(sheet.name)} · ${range}</h1><p>Saved cell values. Sheet ${book.worksheets.indexOf(sheet) + 1} of ${book.worksheets.length}.</p>${table}</tbody></table>`;
  const bytes = await isolatedPage(content, signal, (p) =>
    p.screenshot({ type: 'png', fullPage: true }),
  );
  return {
    bytes,
    sheet: sheet.name,
    range,
    sheets: book.worksheets.map((s) => s.name),
    coverage: `Saved-cell grid for ${sheet.name}!${range}. Formula values are the saved cache; use read_file for recalculation. ${clippedCells ? `${clippedCells} cells shortened to 300 characters. ` : ''}This preview does not reproduce native Excel layout, charts, drawings or merged-cell styling. Select another sheet/range to inspect more cells.`,
  };
}

export async function isolatedPage<T>(
  content: string,
  signal: AbortSignal | undefined,
  action: (page: import('playwright').Page) => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  const browser = await chromium.launch({ headless: true });
  const abort = () => {
    void browser.close().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
      viewport: { width: 1200, height: 900 },
    });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const isolation = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">`;
    await page.setContent(isolation + content, { waitUntil: 'domcontentloaded', timeout: 10000 });
    return await action(page);
  } finally {
    signal?.removeEventListener('abort', abort);
    await browser.close();
  }
}

export function imageResult(
  bytes: Buffer,
  mimeType: ToolImage['mimeType'],
  label: string,
): ToolImage {
  if (bytes.length > 2_000_000)
    throw new Error('Preview exceeds 2 MB. Use a smaller page or image.');
  return { mimeType, data: bytes.toString('base64'), label };
}

export async function previewFile(
  root: string,
  path: string,
  page: number,
  signal: AbortSignal,
  options: { sheet?: string; range?: string } = {},
) {
  const target = await scoped(root, path),
    meta = await stat(target),
    format = extname(path).toLowerCase();
  if (!meta.isFile() || meta.size > 10_000_000)
    throw new Error('Preview requires a file under 10 MB.');
  const source = await readFile(target),
    sha256 = createHash('sha256').update(source).digest('hex');
  let bytes: Buffer, coverage: string, pages: number | undefined;
  let spreadsheet: { sheet: string; range: string; sheets: string[] } | undefined;
  let mimeType: ToolImage['mimeType'] = 'image/png';
  if (format !== '.xlsx' && (options.sheet || options.range))
    throw new Error('Sheet and range apply only to XLSX previews.');
  if (
    format === '.png' &&
    source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    bytes = source;
    coverage = 'Complete image';
  } else if (['.jpg', '.jpeg'].includes(format) && source[0] === 255 && source[1] === 216) {
    bytes = source;
    mimeType = 'image/jpeg';
    coverage = 'Complete image';
  } else if (['.html', '.htm'].includes(format)) {
    if (source.length > 500000) throw new Error('HTML preview is limited to 500 KB.');
    bytes = await isolatedPage(source.toString('utf8'), signal, (p) =>
      p.screenshot({ type: 'png' }),
    );
    coverage =
      'First 1200 × 900 viewport only; scripts and all network/local subresources blocked. This is not an interactive app test.';
  } else if (format === '.xlsx') {
    const rendered = await spreadsheetPreview(source, options, signal);
    bytes = rendered.bytes;
    coverage = rendered.coverage;
    spreadsheet = { sheet: rendered.sheet, range: rendered.range, sheets: rendered.sheets };
  } else if (['.pdf', '.docx'].includes(format)) {
    const temporary = await mkdtemp(join(tmpdir(), 'duke-preview-'));
    try {
      const output = join(temporary, 'preview.png');
      const result = await nativeDocument(
        { operation: format === '.pdf' ? 'pdf_image' : 'thumbnail', path: target, page, output },
        signal,
      );
      bytes = await readFile(output);
      pages = result.pages;
      coverage =
        format === '.pdf'
          ? `PDF page ${page} of ${pages}; call again for other pages.`
          : result.coverage;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  } else throw new Error('Preview supports PDF, DOCX, XLSX, PNG, JPEG and static HTML.');
  signal.throwIfAborted();
  if (
    createHash('sha256')
      .update(await readFile(target))
      .digest('hex') !== sha256
  )
    throw new Error('The file changed during preview. Read it again.');
  return {
    path,
    sha256,
    page: format === '.pdf' ? page : undefined,
    pages,
    ...spreadsheet,
    coverage,
    images: [imageResult(bytes, mimeType, path)],
  };
}
