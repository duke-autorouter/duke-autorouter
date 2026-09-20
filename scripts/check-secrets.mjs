import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, lstat, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';

// Run locally: repository contents and findings are never sent to a scanning service.
const version = '8.30.1';
const checksums = {
  darwin_arm64: 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
  darwin_x64: 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  linux_arm64: 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  linux_x64: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
};
const root = await realpath(process.cwd());
const git = (args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (await realpath(git(['rev-parse', '--show-toplevel']).toString().trim()) !== root)
  throw new Error('Run this check from the release repository root.');
if (git(['rev-parse', '--is-shallow-repository']).toString().trim() !== 'false')
  throw new Error('Full history is required. Fetch with --unshallow before scanning.');

const temporary = await mkdtemp(join(tmpdir(), 'duke-secret-check-'));
try {
  let scanner = process.env.GITLEAKS_BIN;
  if (!scanner) {
    const platform = `${process.platform}_${process.arch}`;
    if (!checksums[platform]) throw new Error('Set GITLEAKS_BIN to a trusted Gitleaks 8.30.1 executable on this platform.');
    const asset = `gitleaks_${version}_${platform}.tar.gz`;
    const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${version}/${asset}`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Scanner download returned ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== checksums[platform]) throw new Error('Scanner checksum mismatch.');
    const archive = join(temporary, asset);
    await writeFile(archive, bytes);
    execFileSync('tar', ['-xzf', archive, '-C', temporary, 'gitleaks']);
    scanner = join(temporary, 'gitleaks');
  }
  if (execFileSync(scanner, ['version'], { encoding: 'utf8' }).trim() !== version)
    throw new Error(`Use Gitleaks ${version}; review scanner upgrades explicitly.`);
  const commits = git(['rev-list', '--all']).toString().trim().split('\n').filter(Boolean);
  const privatePath = /(?:^|\/)(?:\.router|\.git|\.build|node_modules|outputs|profiles|auth)(?:\/|$)|(?:^|\/)(?:auth\.json|launch\.json|\.credentials\.json|id_rsa|id_ed25519)$|(?:^|\/)\.env(?:\.(?!example$).*)?$|\.(?:p8|p12|pfx|pem|key|db)$|\.sqlite(?:3)?(?:-|$)|\.log(?:\.|$)/i;
  const blockedPaths = new Set();
  for (const commit of commits)
    for (const path of git(['ls-tree', '-rz', '--name-only', commit]).toString().split('\0').filter(Boolean))
      if (privatePath.test(path)) blockedPaths.add(path);
  const tree = join(temporary, 'tracked');
  await mkdir(tree);
  const tracked = git(['ls-files', '-z']).toString().split('\0').filter(Boolean);
  let copied = 0;
  for (const path of tracked) {
    if (privatePath.test(path)) blockedPaths.add(path);
    let info;
    try { info = await lstat(join(root, path)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!info.isFile()) throw new Error(`Review nonregular tracked entry: ${path}`);
    await mkdir(dirname(join(tree, path)), { recursive: true });
    await writeFile(join(tree, path), await readFile(join(root, path)));
    copied++;
  }
  const config = join(temporary, 'scanner.toml');
  const ignore = join(temporary, 'empty-ignore');
  await writeFile(config, '[extend]\nuseDefault = true\n');
  await writeFile(ignore, '');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GITLEAKS_')));
  const metadata = join(temporary, 'commit-metadata.txt');
  await writeFile(metadata, git(['log', '--all', '--format=fuller', '--no-patch']));
  const findings = [];
  const scans = [];
  for (const [scope, args] of [
    ['history', ['git', root, '--log-opts=--all --full-history']],
    ['tracked-files', ['dir', tree]],
    ['commit-metadata', ['dir', metadata]],
  ]) {
    const report = join(temporary, `${scope}.json`);
    const result = spawnSync(scanner, [...args, '--config', config, '--gitleaks-ignore-path', ignore, '--ignore-gitleaks-allow', '--redact=100', '--no-banner', '--no-color', '--max-archive-depth', '3', '--max-decode-depth', '5', '--report-format', 'json', '--report-path', report], { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (![0, 1].includes(result.status)) throw new Error(`Secret scanner failed in ${scope}; no clean result was established.`);
    const candidates = JSON.parse(await readFile(report, 'utf8'));
    let verifiedChecksums = 0;
    for (const finding of candidates) {
      const path = scope === 'history' ? finding.File : relative(tree, finding.File);
      let verified = false;
      if (finding.RuleID === 'generic-api-key' && (path === 'SOURCE_MANIFEST.json' || /^docs\/evidence\/[^/]+\.json$/.test(path))) {
        try {
          const content = scope === 'history' ? git(['show', `${finding.Commit}:${path}`]) : await readFile(join(root, path));
          const line = content.toString().split('\n')[finding.StartLine - 1];
          const match = /^\s*"([^"\n]+)": "([a-f0-9]{64})",?\s*$/.exec(line);
          if (match && !match[1].startsWith('/') && !match[1].split('/').includes('..')) {
            const source = scope === 'history' ? git(['show', `${finding.Commit}:${match[1]}`]) : await readFile(join(root, match[1]));
            verified = hash(source) === match[2];
          }
        } catch { /* Unverifiable findings require review. */ }
      }
      if (verified) verifiedChecksums++;
      else findings.push({ scope, path, rule: finding.RuleID, line: finding.StartLine, commit: finding.Commit || undefined });
    }
    scans.push({ scope, candidates: candidates.length, verifiedFileChecksums: verifiedChecksums });
  }
  const result = {
    scanner: `Gitleaks ${version}`,
    commit: git(['rev-parse', 'HEAD']).toString().trim(),
    commits: commits.length,
    trackedFiles: copied,
    scans,
    blockedPaths: [...blockedPaths].sort(),
    findings,
    passed: !findings.length && !blockedPaths.size,
    limits: 'Text, decoded content and supported archives. Review images, rendered documents and the final app separately before release.',
  };
  await mkdir(join(root, 'outputs'), { recursive: true });
  await writeFile(join(root, 'outputs', 'secret-check.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
