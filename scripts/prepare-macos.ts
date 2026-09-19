import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resource } from '../server/runtime.js';

// The package uses an official relocatable runtime, independent of Homebrew.
export async function prepareMacRuntime() {
  const nodeVersion = '26.0.0';
  const archiveName = `node-v${nodeVersion}-darwin-arm64.tar.gz`;
  const base = `https://nodejs.org/dist/v${nodeVersion}/`;
  const cache = resource('.build/downloads');
  await mkdir(cache, { recursive: true });
  async function download(name: string) {
    const path = resource('.build/downloads', name);
    if (!existsSync(path)) {
      console.log(`Downloading ${name} from nodejs.org`);
      const response = await fetch(base + name, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Node download failed: ${response.status}`);
      const temp = path + `.${process.pid}.partial`;
      try {
        await writeFile(temp, Buffer.from(await response.arrayBuffer()), { flag: 'wx' });
        await rename(temp, path);
      } finally {
        await rm(temp, { force: true });
      }
    }
    return path;
  }
  const sums = await readFile(await download('SHASUMS256.txt'), 'utf8');
  const expected = sums
    .split('\n')
    .find((line) => line.endsWith('  ' + archiveName))
    ?.split(/\s+/)[0];
  if (!expected || !/^[a-f0-9]{64}$/.test(expected))
    throw new Error('Node checksum is missing or invalid.');
  const archive = await download(archiveName);
  const actual = createHash('sha256')
    .update(await readFile(archive))
    .digest('hex');
  if (actual !== expected)
    throw new Error(
      'Official Node archive checksum does not match. Remove the cached archive and try again.',
    );
  return { nodeVersion, archiveName, archive, actual };
}
