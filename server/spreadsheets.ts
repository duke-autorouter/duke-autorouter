import ExcelJS from 'exceljs';
import { Worker } from 'node:worker_threads';

export type SheetCell = string | number | boolean | null | { formula: string };
export type SheetInput = { name: string; rows: SheetCell[][] };
type CalculationBook = { Sheets: Record<string, Record<string, any>> };

// Formulas run in a bounded worker so a large or cyclic calculation cannot hang
// the task service. Formula text is parsed by the library, never evaluated as JS.
export async function calculateWorkbook(book: ExcelJS.Workbook, signal?: AbortSignal) {
  const data: CalculationBook = { Sheets: {} };
  let formulas = 0,
    cells = 0;
  for (const sheet of book.worksheets) {
    const values: Record<string, any> = {};
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (++cells > 50000) throw new Error('Workbook exceeds the 50,000-cell calculation limit.');
        if (cell.type === ExcelJS.ValueType.Error)
          throw new Error(`Error cell at ${sheet.name}!${cell.address}: ${cell.text}`);
        if (cell.type === ExcelJS.ValueType.Formula) {
          const formula = cell.formula;
          if (
            !formula ||
            formula.length > 4000 ||
            /\[|\]|\b(?:WEBSERVICE|RTD|DDE|HYPERLINK)\s*\(/i.test(formula)
          )
            throw new Error(
              `Unsupported formula at ${sheet.name}!${cell.address}. External links and structured references are not evaluated.`,
            );
          values[cell.address] = { f: formula };
          formulas++;
        } else if (
          typeof cell.value === 'number' ||
          typeof cell.value === 'boolean' ||
          typeof cell.value === 'string'
        )
          values[cell.address] = {
            v: cell.value,
            t: typeof cell.value === 'number' ? 'n' : typeof cell.value === 'boolean' ? 'b' : 's',
          };
        else if (cell.value !== null) values[cell.address] = { v: cell.text, t: 's' };
      }),
    );
    data.Sheets[sheet.name] = values;
  }
  if (!formulas) return { formulas: 0, cells, engine: 'No formulas' };
  signal?.throwIfAborted();
  const calculated = await new Promise<CalculationBook>((resolve, reject) => {
    const worker = new Worker(
      `
      const {parentPort, workerData} = require('node:worker_threads');
      const {createRequire} = require('node:module');
      const local = createRequire(workerData.moduleBase);
      const calc = local('xlsx-calc');
      calc.import_functions(local('@formulajs/formulajs'), {override: true});
      try { calc(workerData.book); parentPort.postMessage({book: workerData.book}); }
      catch (e) { parentPort.postMessage({error: String(e.message || e)}); }
    `,
      {
        eval: true,
        execArgv: [],
        workerData: { book: data, moduleBase: import.meta.url },
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
      },
    );
    const abort = () => finish(new Error('Calculation cancelled.'));
    const timer = setTimeout(
      () => finish(new Error('Workbook calculation exceeded its time limit.')),
      5000,
    );
    let done = false;
    function finish(error?: Error, value?: CalculationBook) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      void worker.terminate();
      error ? reject(error) : resolve(value!);
    }
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', (result) =>
      finish(result.error ? new Error(result.error) : undefined, result.book),
    );
    worker.once('error', (error) =>
      finish(error instanceof Error ? error : new Error(String(error))),
    );
    worker.once('exit', (code) => {
      if (!done) finish(new Error(`Calculation worker exited (${code}).`));
    });
  });
  for (const sheet of book.worksheets)
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (cell.type !== ExcelJS.ValueType.Formula) return;
        const computed = calculated.Sheets[sheet.name][cell.address];
        if (
          computed.t === 'e' ||
          computed.v === undefined ||
          (typeof computed.v === 'number' && !Number.isFinite(computed.v))
        )
          throw new Error(
            `Formula error at ${sheet.name}!${cell.address}: ${String(computed.v ?? 'no result')}`,
          );
        cell.value = { formula: cell.formula, result: computed.v };
      }),
    );
  return { formulas, cells, engine: 'xlsx-calc 0.9.2 with Formula.js 4.6.1; not native Excel' };
}

export function sizeWorksheet(sheet: ExcelJS.Worksheet) {
  const widths: number[] = [];
  sheet.columns.forEach((column, index) => {
    let width = 12;
    column.eachCell?.((cell) => {
      width = Math.max(width, cell.text.length + 2);
    });
    column.width = Math.min(width, 56);
    widths[index] = column.width;
  });
  let headerFound = false;
  sheet.eachRow((row, index) => {
    let lines = 1,
      populated = 0,
      allText = true;
    row.eachCell((cell, col) => {
      if (cell.value !== '') populated++;
      if (typeof cell.value !== 'string') allText = false;
      cell.font = { name: 'Arial', size: 11 };
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          typeof cell.value === 'number' || typeof cell.result === 'number' ? 'right' : 'left',
        wrapText: true,
      };
      lines = Math.max(
        lines,
        ...cell.text
          .split('\n')
          .map((line) => Math.ceil(line.length / Math.max(8, widths[col - 1] - 3))),
      );
    });
    if (index === 1 || (!headerFound && populated > 1 && allText)) {
      row.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true };
      });
      if (populated > 1 && allText) headerFound = true;
    }
    row.height = Math.max(22, lines * 16 + 8);
  });
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

export async function makeSpreadsheet(
  content: string,
  rows?: SheetCell[][],
  sheets?: SheetInput[],
  signal?: AbortSignal,
) {
  const inputs = sheets?.length
    ? sheets
    : [{ name: 'Sheet 1', rows: rows?.length ? rows : [[content]] }];
  if (
    inputs.reduce((sum, sheet) => sum + sheet.rows.reduce((n, row) => n + row.length, 0), 0) > 50000
  )
    throw new Error('Workbook exceeds the 50,000-cell creation limit.');
  const book = new ExcelJS.Workbook();
  for (const input of inputs) book.addWorksheet(input.name).addRows(input.rows);
  const calculation = await calculateWorkbook(book, signal);
  book.worksheets.forEach(sizeWorksheet);
  book.calcProperties.fullCalcOnLoad = true;
  return { bytes: Buffer.from(await book.xlsx.writeBuffer()), calculation };
}
