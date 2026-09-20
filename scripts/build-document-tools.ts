import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resource } from '../server/runtime.js';

export function buildDocumentTools(output = resource('.build/DocumentTools')) {
  if (process.platform !== 'darwin') return;
  mkdirSync(dirname(output), { recursive: true });
  execFileSync(
    '/usr/bin/xcrun',
    [
      'swiftc',
      '-O',
      '-parse-as-library',
      '-target',
      `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx14.0`,
      '-module-cache-path',
      resource('.build/swift-cache'),
      resource('desktop/DocumentTools.swift'),
      '-o',
      output,
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, CLANG_MODULE_CACHE_PATH: resource('.build/clang-cache') },
    },
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) buildDocumentTools();
