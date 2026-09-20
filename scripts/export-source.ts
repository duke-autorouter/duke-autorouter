import { mkdir, readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { appRoot } from '../server/runtime.js';

// Positive list: account data, review scratchpads and downloaded runtimes never enter it.
const entries = [
  '.gitignore',
  '.env.example',
  '.github',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.server.json',
  'vite.config.ts',
  'index.html',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'server',
  'shared',
  'skills',
  'src',
  'tests',
  'scripts',
  'desktop',
  'evals',
  'examples',
  'docs/ARCHITECTURE.md',
  'docs/DECISIONS.md',
  'docs/MAC_DISTRIBUTION.md',
  'docs/TOOL_AUDIT.md',
  'docs/adr',
  'docs/API.md',
  'docs/USAGE.md',
  'docs/NEXT_STEPS.md',
  'docs/NAME.md',
  'docs/SETUP_IMPORT.md',
  'docs/ROUTING_POLICY.md',
  'docs/REVIEW_SCORING.md',
  'docs/BENCHMARK_PROTOCOL.md',
  'docs/LIVE_ACCEPTANCE_TASKS.md',
  'docs/RELEASE_READINESS.md',
  'docs/VERIFICATION.md',
  'docs/assets',
  'docs/evidence',
];
const destination = resolve(process.argv[2] ?? join(appRoot, 'release/source'));
const root = resolve(appRoot);
if (
  destination === root ||
  root.startsWith(destination + '/') ||
  (destination.startsWith(root + '/') && !destination.startsWith(join(root, 'release') + '/'))
)
  throw new Error('Choose a new output directory outside the source tree or under release/.');
await mkdir(destination, { recursive: true });
if ((await readdir(destination)).length)
  throw new Error('Source destination must be empty; nothing was overwritten.');
const hashes: Record<string, string> = {};
async function copy(path: string) {
  const source = join(appRoot, path),
    stat = await lstat(source);
  if (stat.isSymbolicLink()) throw new Error(`Source snapshot rejects symbolic links: ${path}`);
  if (stat.isDirectory()) {
    for (const child of (await readdir(source)).sort()) await copy(join(path, child));
    return;
  }
  if (!stat.isFile()) throw new Error(`Unsupported source entry: ${path}`);
  if (
    /(?:^|\/)(?:node_modules|\.router|\.build|\.git|auth|profiles)(?:\/|$)|(?:^|\/)(?:auth\.json|launch\.json|\.credentials\.json|id_rsa|id_ed25519)$|\.(?:p8|p12|pfx|pem|key|db)$|\.sqlite(?:3)?(?:-|$)|\.log(?:\.|$)/i.test(
      path,
    )
  )
    throw new Error(`Private or generated entry in source list: ${path}`);
  const bytes = await readFile(source);
  if (!/\.(?:png|woff2?|ico|icns)$/.test(path)) {
    const text = bytes.toString('utf8');
    if (
      /(?:sk-(?:proj-|ant-)[A-Za-z0-9_-]{20,}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/.test(text)
    )
      throw new Error(`Potential secret requires review: ${path}`);
  }
  await mkdir(dirname(join(destination, path)), { recursive: true });
  // Export the inspected bytes without machine-specific extended attributes.
  // Fresh files also avoid filesystem-provider stalls in native copy operations.
  await writeFile(join(destination, path), bytes, { flag: 'wx', mode: stat.mode & 0o777 });
  hashes[path] = createHash('sha256').update(bytes).digest('hex');
}
for (const entry of entries) await copy(entry);
await writeFile(
  join(destination, 'SOURCE_MANIFEST.json'),
  JSON.stringify(
    {
      name: 'DUKE Autorouter',
      at: new Date().toISOString(),
      files: hashes,
      note: 'Allowlisted local source snapshot. No publication or model validation implied.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Exported ${Object.keys(hashes).length} files to ${destination}`);
