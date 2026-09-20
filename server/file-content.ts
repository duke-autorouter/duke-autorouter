import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { scoped } from './paths.js';
import { inspectFile } from './task-evidence.js';
import type { Workspace } from './types.js';

export function decodeText(bytes: Buffer): string {
  if (bytes.includes(0))
    throw new Error('This is a binary file. Use a supported document or image inspection tool.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('This file is not UTF-8 text. Convert it or use a supported document reader.');
  }
}

export async function fileContent(
  workspace: Workspace,
  path: string,
  signal?: AbortSignal,
): Promise<{
  content: string;
  format: string;
  truncated: boolean;
  notes: string[];
}> {
  signal?.throwIfAborted();
  const target = await scoped(workspace.path, path),
    metadata = await stat(target),
    format = extname(path).toLowerCase();
  if (!metadata.isFile() || metadata.size > 2_000_000)
    throw new Error('Read a file under 2 MB, or provide a smaller excerpt.');
  const notes: string[] = [];
  let content = '',
    truncated = false;
  if (['.pdf', '.docx', '.xlsx'].includes(format)) {
    const result = await inspectFile(workspace, path, signal);
    if (!result.text)
      throw new Error(result.detail + ' Use preview_file if visual inspection is needed.');
    content = result.text;
    truncated = result.incomplete;
    notes.push(result.detail);
  } else content = decodeText(await readFile(target, { signal }));
  signal?.throwIfAborted();
  if (content.length > 200000) {
    content = content.slice(0, 200000);
    truncated = true;
  }
  return { content, format, truncated, notes };
}
