import { execFileSync } from 'node:child_process';
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  readlink,
  open,
  rm,
  symlink,
  access,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, basename } from 'node:path';
import { resource } from '../server/runtime.js';
import { packageApp, packageDirectory } from './package-paths.js';

// Maintainer-only local release preparation. No GitHub publication, credential
// export or unsigned fallback is performed by this script.
const mode = process.argv[2];
if (
  !['sign', 'submit', 'status', 'finalize'].includes(mode) ||
  process.platform !== 'darwin'
)
  throw new Error('Use distribute-macos.ts sign|submit|status|finalize on macOS.');
const { version } = JSON.parse(await readFile(resource('package.json'), 'utf8'));
const directory = resolve(
  process.env.DUKE_DISTRIBUTION_DIR ?? join(packageDirectory, `distribution-${version}`),
);
await mkdir(directory, { recursive: true });
const receiptPath = join(directory, 'notarization.json');
const submission = join(directory, 'submission.zip');
const run = (bin: string, args: string[]) =>
  execFileSync(bin, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 10_000_000,
    // The first signature may wait for the owner's macOS Keychain prompt.
    timeout: 300000,
  }).trim();
const hash = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
const claudeRelativePath =
  'Contents/Resources/app/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude';
async function verifyClaudeRuntime(app: string, expectedHash?: string) {
  const binary = join(app, claudeRelativePath);
  const sha256 = await hash(binary);
  const upstreamHash =
    expectedHash ??
    (await hash(
      resource('node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude'),
    ));
  if (sha256 !== upstreamHash)
    throw new Error(
      'Claude runtime differs from the pinned upstream binary. Repackage before signing.',
    );
  run('/usr/bin/codesign', [
    '--verify',
    '--strict',
    '-R=anchor apple generic and certificate leaf[subject.OU] = "Q6L2SF6YDW"',
    binary,
  ]);
  return {
    path: claudeRelativePath,
    sha256,
    publisher: 'Anthropic PBC',
    signaturePreserved: true,
  };
}
const auth = () => {
  if (process.env.DUKE_NOTARY_PROFILE)
    return ['--keychain-profile', process.env.DUKE_NOTARY_PROFILE];
  if (
    process.env.DUKE_NOTARY_KEY &&
    process.env.DUKE_NOTARY_KEY_ID &&
    process.env.DUKE_NOTARY_ISSUER
  )
    return [
      '--key',
      process.env.DUKE_NOTARY_KEY,
      '--key-id',
      process.env.DUKE_NOTARY_KEY_ID,
      '--issuer',
      process.env.DUKE_NOTARY_ISSUER,
    ];
  throw new Error(
    'Set DUKE_NOTARY_PROFILE, or the existing DUKE_NOTARY_KEY file path, DUKE_NOTARY_KEY_ID and DUKE_NOTARY_ISSUER. Never put private keys in the repository.',
  );
};
async function save(value: unknown) {
  await writeFile(receiptPath, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
  });
}

if (mode === 'sign') {
  const identity = process.env.DUKE_SIGNING_IDENTITY;
  if (!identity)
    throw new Error(
      'DUKE_SIGNING_IDENTITY must identify a Developer ID Application certificate. No unsigned release is produced.',
    );
  try {
    await access(submission);
    throw new Error(
      'A submission archive already exists. Use a new distribution directory; do not overwrite an Apple submission.',
    );
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Keep Anthropic's published bytes and signature intact. Re-signing this
  // already signed executable would violate our unmodified-runtime invariant.
  const preservedClaude = await verifyClaudeRuntime(packageApp);
  const manifestPath = join(packageApp, 'Contents/Resources/build-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.signing = 'Developer ID Application; Apple notarization pending.';
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const binaries: string[] = [],
    bundles: string[] = [];
  const walk = async (path: string) => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isSymbolicLink()) continue;
      // An interrupted codesign can leave scratch Mach-O files behind. They
      // belong only to this disposable candidate, never an accepted archive.
      if (entry.isFile() && entry.name.endsWith('.cstemp')) {
        await rm(child);
        continue;
      }
      if (entry.isDirectory()) {
        await walk(child);
        if (/\.(app|framework|xpc|bundle)$/.test(entry.name)) bundles.push(child);
      } else if (entry.isFile()) {
        const file = await open(child, 'r');
        try {
          const bytes = Buffer.alloc(4);
          await file.read(bytes, 0, 4, 0);
          if (
            [
              'feedface',
              'cefaedfe',
              'feedfacf',
              'cffaedfe',
              'cafebabe',
              'bebafeca',
              'cafebabf',
              'bfbafeca',
            ].includes(bytes.toString('hex'))
          )
            binaries.push(child);
        } finally {
          await file.close();
        }
      }
    }
  };
  await walk(packageApp);
  const deepest = (a: string, b: string) => b.split('/').length - a.split('/').length;
  for (const binary of binaries.sort(deepest)) {
    if (binary === join(packageApp, claudeRelativePath)) continue;
    run('/usr/bin/codesign', [
      '--force',
      '--sign',
      identity,
      '--timestamp',
      '--options',
      'runtime',
      '--entitlements',
      resource('desktop/Runtime.entitlements.plist'),
      binary,
    ]);
  }
  for (const bundle of bundles.sort(deepest))
    run('/usr/bin/codesign', [
      '--force',
      '--sign',
      identity,
      '--timestamp',
      '--options',
      'runtime',
      '--entitlements',
      resource('desktop/Runtime.entitlements.plist'),
      bundle,
    ]);
  run('/usr/bin/codesign', [
    '--force',
    '--sign',
    identity,
    '--timestamp',
    '--options',
    'runtime',
    packageApp,
  ]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', packageApp]);
  // A requirement check fails if an ad hoc or development identity was supplied.
  run('/usr/bin/codesign', [
    '--verify',
    '-R=anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists',
    packageApp,
  ]);
  run('/usr/bin/ditto', [
    '-c',
    '-k',
    '--keepParent',
    '--sequesterRsrc',
    packageApp,
    submission,
  ]);
  await verifyClaudeRuntime(packageApp, preservedClaude.sha256);
  await save({
    version,
    signedAt: new Date().toISOString(),
    archiveSHA256: await hash(submission),
    binaries: binaries.length,
    signedBinaries: binaries.length - 1,
    bundles: bundles.length,
    preservedRuntime: preservedClaude,
    status: 'Prepared; not submitted',
  });
  console.log(`Signed app and immutable Apple submission prepared in ${directory}`);
} else {
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  if (receipt.archiveSHA256 !== (await hash(submission)))
    throw new Error('Submission archive changed. Use a new release preparation.');
  if (mode === 'submit') {
    if (receipt.id) throw new Error('Already submitted; use status or finalize.');
    const result = JSON.parse(
      run('/usr/bin/xcrun', [
        'notarytool',
        'submit',
        submission,
        ...auth(),
        '--no-wait',
        '--output-format',
        'json',
      ]),
    );
    await save({
      ...receipt,
      id: result.id,
      status: 'Submitted',
      submittedAt: new Date().toISOString(),
    });
    console.log(
      `Submitted to Apple: ${result.id}. Use status; this does not publish the app.`,
    );
  } else {
    if (!receipt.id)
      throw new Error('Submit the signed archive before checking or finalizing it.');
    const result = JSON.parse(
      run('/usr/bin/xcrun', [
        'notarytool',
        'info',
        receipt.id,
        ...auth(),
        '--output-format',
        'json',
      ]),
    );
    await save({
      ...receipt,
      status: result.status,
      checkedAt: new Date().toISOString(),
    });
    console.log(`Apple notarization: ${result.status}`);
    if (mode === 'status') process.exit(0);
    if (result.status !== 'Accepted')
      throw new Error(
        'Apple has not accepted this exact archive. No distributable download was created.',
      );
    const staging = join(directory, 'accepted-app');
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging);
    run('/usr/bin/ditto', ['-x', '-k', submission, staging]);
    const app = join(staging, basename(packageApp));
    if (!receipt.preservedRuntime?.sha256)
      throw new Error(
        'Missing upstream Claude verification; prepare a new signed release.',
      );
    await verifyClaudeRuntime(app, receipt.preservedRuntime.sha256);
    run('/usr/bin/xcrun', ['stapler', 'staple', app]);
    run('/usr/bin/xcrun', ['stapler', 'validate', app]);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
    const assets = join(directory, 'downloads');
    await mkdir(assets, { recursive: true });
    const name = `DUKE-Autorouter-${version}-mac-arm64`;
    const zip = join(assets, name + '.zip'),
      dmg = join(assets, name + '.dmg');
    await rm(zip, { force: true });
    await rm(dmg, { force: true });
    run('/usr/bin/ditto', ['-c', '-k', '--keepParent', '--sequesterRsrc', app, zip]);
    await symlink('/Applications', join(staging, 'Applications'));
    await writeFile(
      join(staging, 'Install.txt'),
      `DUKE Autorouter ${version}\n\nDrag DUKE Autorouter into Applications, then open it.\nRequires an Apple Silicon Mac with macOS 14 or newer.\nThe app includes its runtimes; no terminal or development tools are required.\n\nSource and release notes: https://github.com/duke-autorouter/duke-autorouter\n`,
    );
    run('/usr/bin/hdiutil', [
      'create',
      '-srcfolder',
      staging,
      '-volname',
      'DUKE Autorouter',
      '-fs',
      'HFS+',
      '-format',
      'UDZO',
      dmg,
    ]);
    run('/usr/bin/hdiutil', ['verify', dmg]);
    // Check the delivered image, not only the source staging directory.
    const mount = join(directory, 'mounted-dmg');
    await mkdir(mount, { recursive: true });
    run('/usr/bin/hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-mountpoint',
      mount,
      dmg,
    ]);
    try {
      if ((await readlink(join(mount, 'Applications'))) !== '/Applications')
        throw new Error('Installer is missing the Applications shortcut.');
      const delivered = join(mount, basename(packageApp));
      await verifyClaudeRuntime(delivered, receipt.preservedRuntime.sha256);
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', delivered]);
      run('/usr/bin/xcrun', ['stapler', 'validate', delivered]);
      run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', delivered]);
    } finally {
      run('/usr/bin/hdiutil', ['detach', mount]);
    }
    const checksums = [
      { path: basename(dmg), sha256: await hash(dmg) },
      { path: basename(zip), sha256: await hash(zip) },
    ];
    await writeFile(
      join(assets, 'SHA256SUMS.txt'),
      checksums.map((x) => `${x.sha256}  ${x.path}`).join('\n') + '\n',
    );
    await writeFile(
      join(assets, 'release-manifest.json'),
      JSON.stringify(
        {
          name: 'DUKE Autorouter',
          version,
          platform: 'darwin-arm64',
          minimumMacOS: '14',
          notarization: 'Accepted and stapled',
          submissionId: receipt.id,
          createdAt: new Date().toISOString(),
          assets: checksums,
          sourceLockHash: JSON.parse(
            await readFile(join(app, 'Contents/Resources/build-manifest.json'), 'utf8'),
          ).lockHash,
          preservedRuntime: receipt.preservedRuntime,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `Verified, notarized downloads prepared in ${assets}. Publication is a separate step.`,
    );
  }
}
