import { marked, type Token } from 'marked';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TableLayoutType,
  type ParagraphChild,
} from 'docx';
import { isolatedPage } from './previews.js';
import { makeSpreadsheet, type SheetCell } from './spreadsheets.js';

type Block =
  | {
      kind: 'text';
      text: string;
      tokens?: Token[];
      depth?: number;
      code?: boolean;
      prefix?: string;
    }
  | { kind: 'table'; rows: string[][]; cells: Token[][][] };

function plain(tokens: Token[]): string {
  return tokens
    .map((t): string => {
      if ('tokens' in t && t.tokens) return plain(t.tokens as Token[]);
      if (t.type === 'br') return '\n';
      if (t.type === 'image') return t.text;
      if ('text' in t) return String(t.text).replace(/<[^>]*>/g, '');
      return '';
    })
    .join('');
}

function blocks(content: string): Block[] {
  const result: Block[] = [];
  const visit = (tokens: Token[], prefix = '') => {
    for (const token of tokens) {
      if (token.type === 'space' || token.type === 'hr') continue;
      if (token.type === 'table') {
        const cells: Token[][][] = [token.header, ...token.rows].map((row) =>
          row.map((c: { tokens: Token[] }) => c.tokens),
        );
        result.push({ kind: 'table', cells, rows: cells.map((r) => r.map(plain)) });
      } else if (token.type === 'list') {
        token.items.forEach(
          (item: { tokens: Token[]; task?: boolean; checked?: boolean }, index: number) => {
            const label = token.ordered ? `${Number(token.start) + index}. ` : '- ';
            visit(item.tokens, label + (item.task ? `[${item.checked ? 'x' : ' '}] ` : ''));
          },
        );
      } else if (token.type === 'blockquote') visit(token.tokens ?? []);
      else if (token.type === 'code')
        token.text
          .split('\n')
          .forEach((text: string) => result.push({ kind: 'text', text, code: true }));
      else {
        const inline = 'tokens' in token ? (token.tokens as Token[] | undefined) : undefined;
        const text = inline
          ? plain(inline)
          : 'text' in token
            ? String(token.text).replace(/<[^>]*>/g, '')
            : '';
        result.push({
          kind: 'text',
          text,
          tokens: inline,
          prefix,
          ...(token.type === 'heading' ? { depth: token.depth } : {}),
        });
      }
    }
  };
  visit(marked.lexer(content));
  return result;
}

function runs(
  tokens: Token[],
  style: { bold?: boolean; italics?: boolean } = {},
): ParagraphChild[] {
  return tokens.flatMap((t): ParagraphChild[] => {
    if (t.type === 'br') return [new TextRun({ break: 1 })];
    if ('tokens' in t && t.tokens)
      return runs(t.tokens as Token[], {
        ...style,
        ...(t.type === 'strong' ? { bold: true } : {}),
        ...(t.type === 'em' ? { italics: true } : {}),
      });
    return [
      new TextRun({
        text: plain([t]).replace(/\n/g, ' '),
        font: 'Arial',
        ...style,
        ...(t.type === 'codespan' ? { font: 'Courier New' } : {}),
      }),
    ];
  });
}

export async function wordArtifact(content: string): Promise<Buffer> {
  const headings = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ];
  const children = blocks(content).map((b) =>
    b.kind === 'table'
      ? new Table({
          width: { size: 10080, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          columnWidths: Array.from({ length: Math.max(...b.cells.map((row) => row.length)) }, () =>
            Math.floor(10080 / Math.max(...b.cells.map((row) => row.length))),
          ),
          rows: b.cells.map(
            (row, index) =>
              new TableRow({
                tableHeader: index === 0,
                children: row.map(
                  (cell) =>
                    new TableCell({
                      width: {
                        size: Math.floor(10080 / Math.max(...b.cells.map((r) => r.length))),
                        type: WidthType.DXA,
                      },
                      margins: { top: 100, bottom: 100, left: 120, right: 120 },
                      children: [new Paragraph({ children: runs(cell, { bold: index === 0 }) })],
                    }),
                ),
              }),
          ),
        })
      : new Paragraph({
          ...(b.depth ? { heading: headings[b.depth - 1] } : {}),
          spacing: { after: b.code ? 0 : 160, before: b.depth ? 160 : 0 },
          children: b.code
            ? [new TextRun({ text: b.text, font: 'Courier New', size: 20 })]
            : [new TextRun(b.prefix ?? ''), ...(b.tokens ? runs(b.tokens) : [new TextRun(b.text)])],
        }),
  );
  return Packer.toBuffer(
    new Document({
      styles: {
        default: {
          document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { line: 276 } } },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
            },
          },
          children,
        },
      ],
    }),
  );
}

export async function spreadsheetArtifact(content: string, rows?: SheetCell[][]): Promise<Buffer> {
  return (await makeSpreadsheet(content, rows)).bytes;
}

const escapeHTML = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function inlineHTML(tokens: Token[]): string {
  return tokens
    .map((t): string => {
      if (t.type === 'br') return '<br>';
      const body =
        'tokens' in t && t.tokens ? inlineHTML(t.tokens as Token[]) : escapeHTML(plain([t]));
      const tag =
        t.type === 'strong'
          ? 'strong'
          : t.type === 'em'
            ? 'em'
            : t.type === 'codespan'
              ? 'code'
              : '';
      return tag ? `<${tag}>${body}</${tag}>` : body;
    })
    .join('');
}
export async function pdfArtifact(content: string, signal?: AbortSignal): Promise<Buffer> {
  // Render only our escaped Markdown AST. Raw HTML, scripts, remote images and
  // subresource fetches are never executed during document generation.
  const body = blocks(content)
    .map((b) => {
      if (b.kind === 'table')
        return (
          '<table>' +
          b.cells
            .map(
              (row, i) =>
                `${i === 0 ? '<thead>' : i === 1 ? '<tbody>' : ''}<tr>` +
                row
                  .map((cell) => `<${i ? 'td' : 'th'}>${inlineHTML(cell)}</${i ? 'td' : 'th'}>`)
                  .join('') +
                `</tr>${i === 0 ? '</thead>' : ''}`,
            )
            .join('') +
          (b.cells.length > 1 ? '</tbody>' : '') +
          '</table>'
        );
      const tag = b.depth ? `h${b.depth}` : b.code ? 'pre' : 'p';
      return `<${tag}>${escapeHTML(b.prefix ?? '')}${b.tokens ? inlineHTML(b.tokens) : escapeHTML(b.text)}</${tag}>`;
    })
    .join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    @page { size: Letter; margin: 0.75in; }
    body { font: 11pt/1.45 Arial, sans-serif; color: #152337; overflow-wrap: anywhere; }
    h1 { font-size: 21pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
    h1,h2,h3,h4,h5,h6 { line-height: 1.2; break-after: avoid; margin: 16pt 0 8pt; }
    p { margin: 0 0 9pt; orphans: 3; widows: 3; }
    table { width: 100%; border-collapse: collapse; margin: 12pt 0; table-layout: fixed; }
    th,td { text-align: left; border-bottom: 1px solid #bcc6d2; padding: 7pt; vertical-align: top; }
    th { background: #eef2f6; } thead { display: table-header-group; } tr { break-inside: avoid; }
    pre { white-space: pre-wrap; font: 9pt/1.4 monospace; margin: 0; } code { font-size: 10pt; }
  </style>${body}`;
  return isolatedPage(html, signal, (page) =>
    page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true }),
  );
}
