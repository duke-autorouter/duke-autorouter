import { lstat, realpath, mkdir } from 'node:fs/promises';
import { resolve, relative, sep, dirname } from 'node:path';
import { Blocked } from './types.js';
export const sensitive = (name: string) =>
  name === '.git' ||
  name === '.router' ||
  name === '.ssh' ||
  name === '.aws' ||
  ['.docker', '.kube', '.gcloud', '.gitconfig'].includes(name.toLowerCase()) ||
  /^\.env(?:\.|$)/i.test(name) ||
  /^(auth\.json|credentials(?:\.json)?|\.npmrc|\.netrc|id_rsa|id_ed25519)$/i.test(name);
export function within(root: string, path: string) {
  const r = relative(root, path);
  return r === '' || (!r.startsWith('..' + sep) && r !== '..' && !r.startsWith(sep));
}
export async function scoped(root: string, input: string, write = false) {
  const realRoot = await realpath(root),
    target = resolve(realRoot, input);
  if (!within(realRoot, target)) throw new Blocked('Path is outside the selected workspace.');
  const parts = relative(realRoot, target).split(sep).filter(Boolean);
  if (parts.some(sensitive))
    throw new Blocked('Credential and application-state paths are excluded.');
  let walk = realRoot;
  for (const part of parts) {
    walk = resolve(walk, part);
    try {
      const s = await lstat(walk);
      if (s.isSymbolicLink()) throw new Blocked('Symlink paths are not allowed.');
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  if (write) await mkdir(dirname(target), { recursive: true });
  return target;
}
