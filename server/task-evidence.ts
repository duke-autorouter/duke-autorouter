import { readFile, readdir, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync, crc32 } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { scoped, sensitive } from './paths.js';
import type { Task, Workspace, Check } from './types.js';

export type FileEvidence = {
  path: string;
  bytes: number;
  sha256: string;
  format: string;
  text?: string;
  incomplete: boolean;
  detail: string;
};
export type RoutingContext = {
  attachments: {
    path: string;
    bytes: number;
    lines: number;
    excerpt: string;
    truncated: boolean;
  }[];
  project: { entries: number; fileTypes: Record<string, number>; hasTests: boolean };
  progress?: { summary: string; remaining: string };
  privateGuidancePresent?: boolean;
  incomplete: boolean;
};
export type ReviewEvidence = {
  result: string;
  files: FileEvidence[];
  inputs: { path: string; text: string }[];
  sources: { url: string; text: string }[];
  checks: Check[];
  incomplete: boolean;
  limitations: string[];
};

export async function routingContext(
  task: Task,
  workspace: Workspace,
  attachments: { path: string; content: string }[],
): Promise<RoutingContext> {
  let budget = 8000;
  const bounded = attachments.map((a) => {
    const binary = /\x00|\uFFFD/.test(a.content);
    const excerpt = binary ? '' : a.content.slice(0, Math.min(2000, budget));
    budget -= excerpt.length;
    return {
      path: a.path,
      bytes: Buffer.byteLength(a.content),
      lines: a.content.split('\n').length,
      excerpt,
      truncated: excerpt.length < a.content.length,
    };
  });
  // Only aggregate project structure; private setup documents are never copied to Jev.
  const entries = (await readdir(workspace.path, { withFileTypes: true })).filter(
    (e) => !sensitive(e.name) && !e.name.startsWith('.') && !e.isSymbolicLink(),
  );
  const fileTypes: Record<string, number> = {};
  for (const e of entries)
    if (e.isFile()) {
      const ext = extname(e.name).toLowerCase() || '(no extension)';
      fileTypes[ext] = (fileTypes[ext] ?? 0) + 1;
    }
  return {
    attachments: bounded,
    project: {
      entries: entries.length,
      fileTypes,
      hasTests: entries.some((e) => /^(tests?|__tests__|specs?)(\.|$)/i.test(e.name)),
    },
    progress: task.checkpoint
      ? {
          summary: task.checkpoint.summary.slice(0, 1500),
          remaining: task.checkpoint.remaining.slice(0, 2500),
        }
      : undefined,
    privateGuidancePresent: workspace.instructions.length > 0,
    incomplete:
      bounded.some((a) => a.truncated) ||
      (!!task.checkpoint &&
        (task.checkpoint.summary.length > 1500 || task.checkpoint.remaining.length > 2500)),
  };
}

const xmlText = (s: string) =>
  s
    .replace(/<\/(?:w:p|row|si|c)>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

// Read Office XML without executing macros, resolving external relationships, or extracting
// files. Bound both compressed and expanded size before decompression; reject ZIP64/encryption.
class InspectionLimit extends Error {}
function officeXML(bytes: Buffer): Map<string, string> {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6))
    throw new Error('Unsupported ZIP archive');
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16),
    expanded = 0;
  if (count > 2000) throw new InspectionLimit('Office archive exceeds inspection limits');
  if (cursor >= end) throw new Error('Invalid Office archive directory');
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error('Invalid Office directory');
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20),
      size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32);
    const offset = bytes.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameLength + extra + comment > end) throw new Error('Invalid Office entry');
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    expanded += size;
    if (flags & 1 || size > 2_000_000 || expanded > 6_000_000 || ![0, 8].includes(method))
      throw new InspectionLimit(
        'Office archive exceeds inspection limits or uses unsupported encryption/compression',
      );
    if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50)
      throw new Error('Invalid Office entry');
    const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    if (start + compressed > bytes.length) throw new Error('Invalid Office entry size');
    if (
      /^(?:\[Content_Types\]\.xml|word\/document\.xml|xl\/(?:workbook|sharedStrings|worksheets\/sheet\d+)\.xml)$/.test(
        name,
      )
    ) {
      const data = bytes.subarray(start, start + compressed);
      const xml = method === 8 ? inflateRawSync(data, { maxOutputLength: 2_000_000 }) : data;
      if (xml.length !== size || crc32(xml) !== bytes.readUInt32LE(cursor + 16) || files.has(name))
        throw new Error('Invalid Office XML checksum, size or duplicate entry');
      files.set(name, xml.toString('utf8'));
    }
    cursor += 46 + nameLength + extra + comment;
  }
  if (!files.has('[Content_Types].xml')) throw new Error('Missing Office content types');
  return files;
}

export async function inspectFile(workspace: Workspace, path: string): Promise<FileEvidence> {
  const p = await scoped(workspace.path, path),
    metadata = await stat(p);
  if (!metadata.isFile() || !metadata.size) throw new Error(`${path} is missing or empty`);
  if (metadata.size > 2_000_000)
    return {
      path,
      bytes: metadata.size,
      sha256: '',
      format: extname(path),
      incomplete: true,
      detail: 'File exceeds the 2 MB inspection limit.',
    };
  const bytes = await readFile(p),
    format = extname(path).toLowerCase();
  const result: FileEvidence = {
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    format,
    incomplete: false,
    detail: 'Read file contents.',
  };
  if (format === '.pdf') {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    if (!pdf.getPageCount()) throw new Error('PDF has no pages');
    return {
      ...result,
      incomplete: true,
      detail: `PDF opens with ${pdf.getPageCount()} pages; rendered layout and extracted text are not checked.`,
    };
  }
  if (format === '.docx' || format === '.xlsx') {
    let files: Map<string, string>;
    try {
      files = officeXML(bytes);
    } catch (e) {
      if (e instanceof InspectionLimit) return { ...result, incomplete: true, detail: e.message };
      throw e;
    }
    if (format === '.docx') {
      const main = files.get('word/document.xml');
      if (!main || !/<w:document\b/.test(main) || !/<\/w:document>/.test(main))
        throw new Error('Missing Word document body');
      result.text = xmlText(main);
    } else {
      if (!files.has('xl/workbook.xml')) throw new Error('Missing Excel workbook');
      const sheets = [...files].filter(([name]) => name.startsWith('xl/worksheets/'));
      if (!sheets.length) throw new Error('Workbook has no worksheets');
      if (!sheets.some(([, xml]) => /<(?:v|t)>[^<]+<\//.test(xml)))
        throw new Error('Workbook has no readable cells');
      const strings = [
        ...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g),
      ].map((m) => xmlText(m[1]));
      result.text = sheets
        .map(
          ([name, xml]) =>
            name +
            '\n' +
            [...xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)]
              .map((m) => {
                const value = m[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? xmlText(m[2]);
                if (/\bt="s"/.test(m[1]) && strings[Number(value)] === undefined)
                  throw new Error('Invalid spreadsheet shared string reference');
                return /\bt="s"/.test(m[1]) ? strings[Number(value)] : value;
              })
              .join(' | '),
        )
        .join('\n');
    }
    if (!result.text.trim()) throw new Error('Office document has no readable text or cells');
    result.detail =
      'Core Office XML and text inspected; opening in Office, rendered layout and formula correctness are not checked.';
  } else if (!bytes.includes(0)) result.text = bytes.toString('utf8');
  else {
    result.incomplete = true;
    result.detail = 'Binary content is not supported by the text verifier.';
  }
  return result;
}
