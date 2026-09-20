import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { scoped, sensitive } from './paths.js';
import { decodeText } from './file-content.js';

// Literal, bounded search. Never follow symlinks or include credentials, caches,
// or dependency trees. A partial search is explicitly reported as partial.
export async function searchFiles(root: string, path: string, query: string, signal: AbortSignal) {
  root = await scoped(root, '.');
  const start = await scoped(root, path),
    matches: { path: string; line: number; text: string }[] = [];
  let scanned = 0,
    bytes = 0,
    truncated = false,
    skipped = 0;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      signal.throwIfAborted();
      if (scanned >= 1000 || bytes >= 10_000_000 || matches.length >= 100) {
        truncated = true;
        return;
      }
      if (
        sensitive(entry.name) ||
        entry.isSymbolicLink() ||
        ['node_modules', '.build', 'dist', '.cache'].includes(entry.name)
      )
        continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(file);
        continue;
      }
      if (!entry.isFile()) continue;
      scanned++;
      // Recheck scope in case a directory was replaced during the walk.
      await scoped(root, relative(root, file));
      if ((await stat(file)).size > 500000) {
        skipped++;
        continue;
      }
      const content = await readFile(file);
      bytes += content.length;
      let text: string;
      try {
        text = decodeText(content);
      } catch {
        skipped++;
        continue;
      }
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++)
        if (lines[i].includes(query)) {
          if (matches.length >= 100) {
            truncated = true;
            return;
          }
          matches.push({ path: relative(root, file), line: i + 1, text: lines[i].slice(0, 1000) });
        }
    }
  };
  await visit(start);
  return {
    matches,
    scanned,
    skipped,
    truncated,
    limits:
      'Literal text search; 1,000 files, 10 MB, 100 matches. Binary and files over 500 KB are skipped.',
  };
}
