import {
  cp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
  readlink,
  chmod,
  symlink,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { appRoot, resource } from '../server/runtime.js';
import { packageApp } from './package-paths.js';
import { prepareMacRuntime } from './prepare-macos.js';
import { buildDocumentTools } from './build-document-tools.js';

if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw new Error('This package target is Apple Silicon macOS.');
const { nodeVersion, archiveName, archive, actual } = await prepareMacRuntime();
const build = resource('.build');
const app = packageApp;
const contents = join(app, 'Contents');
const resources = join(contents, 'Resources');
const code = join(resources, 'app');
const refresh = process.argv.includes('--refresh');
const { version } = JSON.parse(await readFile(resource('package.json'), 'utf8'));
const lockHash = createHash('sha256')
  .update(await readFile(resource('package-lock.json')))
  .digest('hex');
const prior = refresh
  ? JSON.parse(await readFile(join(resources, 'build-manifest.json'), 'utf8'))
  : undefined;
if (refresh && prior.lockHash !== lockHash)
  throw new Error('Dependencies changed; perform a full package build.');
function run(bin: string, args: string[], cwd = appRoot) {
  execFileSync(bin, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      COPYFILE_DISABLE: '1',
      CLANG_MODULE_CACHE_PATH: join(build, 'clang-cache'),
    },
  });
}
await rm(join(build, 'runtime'), { recursive: true, force: true });
run(process.execPath, [
  resource('node_modules/typescript/bin/tsc'),
  '--project',
  'tsconfig.server.json',
]);
if (!refresh) await rm(app, { recursive: true, force: true });
await mkdir(join(contents, 'MacOS'), { recursive: true });
await mkdir(code, { recursive: true });
buildDocumentTools(join(resources, 'DocumentTools'));
// Refresh generated trees exactly, so removed source files and old asset chunks
// cannot remain in a later bundle. Locked dependencies are reused separately.
for (const directory of ['server', 'shared', 'dist', 'skills'])
  await rm(join(code, directory), { recursive: true, force: true });
await cp(resource('.build/runtime/server'), join(code, 'server'), { recursive: true });
await cp(resource('.build/runtime/shared'), join(code, 'shared'), { recursive: true });
await cp(resource('dist'), join(code, 'dist'), { recursive: true });
await cp(resource('skills'), join(code, 'skills'), { recursive: true });
for (const file of ['package.json', 'package-lock.json', 'THIRD_PARTY_NOTICES.md'])
  await cp(resource(file), join(code, file));
for (const file of ['AppIcon.icns', 'MenuBarTemplate.png', 'MenuBarTemplate@2x.png'])
  await writeFile(join(resources, file), await readFile(resource('desktop/Assets/' + file)));

// Copy only the locked production dependency closure. No cache or global installation is required.
const lock = JSON.parse(await readFile(resource('package-lock.json'), 'utf8'));
const copied: string[] = [];
if (!refresh) {
  for (const [path, entry] of Object.entries<any>(lock.packages)) {
    if (!path || entry.dev || !path.startsWith('node_modules/')) continue;
    if (!existsSync(resource(path))) {
      if (entry.optional) continue;
      throw new Error(`Missing installed production dependency: ${path}`);
    }
    copied.push(path);
  }
  // Install from the lockfile into the unsynced bundle. Copying thousands of
  // development files through a File Provider can stall and carries local edits.
  // The pinned runtimes ship their native executables in platform packages and
  // do not require lifecycle scripts during this production install.
  run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], code);
  // Keep package command entry points available to native SDK dependencies.
  for (const path of copied) {
    const pkg = JSON.parse(await readFile(join(code, path, 'package.json'), 'utf8'));
    const bins =
      typeof pkg.bin === 'string' ? { [pkg.name.split('/').pop()]: pkg.bin } : (pkg.bin ?? {});
    const binDir = join(
      code,
      path.slice(0, path.lastIndexOf('node_modules/') + 'node_modules'.length),
      '.bin',
    );
    await mkdir(binDir, { recursive: true });
    for (const [name, target] of Object.entries<string>(bins)) {
      const executable = join(code, path, target);
      if (!existsSync(executable)) continue;
      await chmod(executable, 0o755);
      await symlink(relative(binDir, executable), join(binDir, name)).catch((e) => {
        if (e.code !== 'EEXIST') throw e;
      });
    }
  }
  await mkdir(join(resources, 'runtime'), { recursive: true });
  run('/usr/bin/tar', ['-xzf', archive, '--strip-components=1', '-C', join(resources, 'runtime')]);
  const runtime = join(resources, 'runtime/bin/node');
  const links = execFileSync('/usr/bin/otool', ['-L', runtime], { encoding: 'utf8' });
  if (links.includes('/opt/homebrew') || links.includes('/usr/local/'))
    throw new Error('Bundled Node still depends on a development installation.');

  let browserDirectory = dirname(chromium.executablePath());
  while (!/^chromium-\d+$/.test(basename(browserDirectory))) {
    const parent = dirname(browserDirectory);
    if (parent === browserDirectory) throw new Error('Cannot locate installed Chromium bundle.');
    browserDirectory = parent;
  }
  const browserCache = dirname(browserDirectory);
  const revisions = JSON.parse(
    await readFile(resource('node_modules/playwright-core/browsers.json'), 'utf8'),
  );
  await mkdir(join(resources, 'browsers'), { recursive: true });
  for (const name of ['chromium', 'chromium-headless-shell', 'ffmpeg']) {
    const entry = revisions.browsers.find((b: any) => b.name === name);
    const dir = `${name.replaceAll('-', '_')}-${entry.revision}`;
    if (!existsSync(join(browserCache, dir)))
      throw new Error(`Install the pinned Playwright browser first: ${dir}`);
    await cp(join(browserCache, dir), join(resources, 'browsers', dir), {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    });
  }
}

// Playwright's macOS dependency validation is a no-op, but its first launch
// creates this empty cache marker. Seal it now so using the bundled browser
// cannot add a new resource and invalidate the application signature. Later
// revalidation rewrites the same empty content and preserves the seal.
for (const entry of await readdir(join(resources, 'browsers'), { withFileTypes: true }))
  if (entry.isDirectory() && /^(chromium|chromium_headless_shell|ffmpeg)-\d+$/.test(entry.name))
    await writeFile(join(resources, 'browsers', entry.name, 'DEPENDENCIES_VALIDATED'), '');

run('/usr/bin/xcrun', [
  'swiftc',
  '-O',
  '-parse-as-library',
  '-target',
  'arm64-apple-macosx14.0',
  '-module-cache-path',
  join(build, 'swift-cache'),
  resource('desktop/Launcher.swift'),
  resource('desktop/NavigationPolicy.swift'),
  '-o',
  join(contents, 'MacOS/DUKE Autorouter'),
]);
await writeFile(
  join(contents, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>app.duke.autorouter</string>
<key>CFBundleName</key><string>DUKE Autorouter</string>
<key>CFBundleDisplayName</key><string>DUKE Autorouter</string>
<key>CFBundleExecutable</key><string>DUKE Autorouter</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>4</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><false/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>`,
);
await writeFile(
  join(resources, 'build-manifest.json'),
  JSON.stringify(
    {
      name: 'DUKE Autorouter',
      version,
      platform: 'darwin-arm64',
      builtAt: new Date().toISOString(),
      node: {
        version: nodeVersion,
        sha256: actual,
        source: `https://nodejs.org/dist/v${nodeVersion}/${archiveName}`,
      },
      dependencies: refresh ? prior.dependencies : copied.length,
      lockHash,
      appIconSHA256: createHash('sha256')
        .update(await readFile(join(resources, 'AppIcon.icns')))
        .digest('hex'),
      browsers: ['chromium', 'chromium-headless-shell', 'ffmpeg'],
      signing: 'Ad hoc local development signing; public distribution is not notarized.',
    },
    null,
    2,
  ),
);
async function checkLinks(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = resolve(dir, await readlink(path));
      if (!target.startsWith(app + '/'))
        throw new Error(`External bundle link: ${relative(app, path)}`);
    } else if (entry.isDirectory()) await checkLinks(path);
  }
}
await checkLinks(app);
for (const attribute of ['com.apple.FinderInfo', 'com.apple.ResourceFork']) {
  // Strip Finder metadata on the newly generated package; retain any quarantine attributes.
  try {
    execFileSync('/usr/bin/xattr', ['-dr', attribute, app], { stdio: 'pipe' });
  } catch {}
}
run('/usr/bin/codesign', ['--force', '--sign', '-', app]);
run('/usr/bin/codesign', ['--verify', app]);
await mkdir(resource('release'), { recursive: true });
await writeFile(
  resource('release/package.json'),
  JSON.stringify({ app, builtAt: new Date().toISOString() }, null, 2),
);
console.log(`Built ${app}`);
