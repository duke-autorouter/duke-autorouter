import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Historical receipts keep their original file hashes. An exemption requires
// actual matching file bytes, either current or reachable at the recorded path.
export function recordedChecksumVerifier(root: string, git: (args: string[]) => Buffer) {
  const cache = new Map<string, Set<string>>();
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  return async (path: string, digest: string, commit?: string) => {
    if (
      !path ||
      path.startsWith('/') ||
      path.split('/').includes('..') ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      return false;
    try {
      const bytes = commit ? git(['show', `${commit}:${path}`]) : await readFile(join(root, path));
      if (hash(bytes) === digest) return true;
    } catch {}
    const key = `${commit ?? '--all'}\0${path}`;
    if (!cache.has(key)) {
      const hashes = new Set<string>();
      const commits = git(['log', commit ?? '--all', '--format=%H', '--', path])
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);
      for (const revision of commits) {
        try {
          hashes.add(hash(git(['show', `${revision}:${path}`])));
        } catch {}
      }
      cache.set(key, hashes);
    }
    return cache.get(key)!.has(digest);
  };
}
