import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { recordedChecksumVerifier } from '../scripts/recorded-checksum.js';

test('secret-scan checksum exceptions require real bytes at the recorded current or historical path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-checksum-'));
  const git = (args: string[]) =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  try {
    git(['init', '-q', '--template=']);
    git(['config', 'user.name', 'Synthetic Fixture']);
    git(['config', 'user.email', 'fixture@example.invalid']);
    await writeFile(join(root, 'source.txt'), 'old source');
    git(['add', 'source.txt']);
    git(['commit', '-qm', 'Fixture']);
    const old = git(['rev-parse', 'HEAD']).toString().trim();
    await writeFile(join(root, 'source.txt'), 'new source');
    git(['commit', '-qam', 'Update fixture']);
    const verify = recordedChecksumVerifier(root, git);
    assert.equal(await verify('source.txt', hash('old source')), true);
    assert.equal(await verify('source.txt', hash('new source')), true);
    assert.equal(await verify('source.txt', hash('old source'), old), true);
    assert.equal(await verify('source.txt', hash('new source'), old), false);
    assert.equal(await verify('wrong.txt', hash('old source')), false);
    assert.equal(await verify('../source.txt', hash('old source')), false);
    assert.equal(await verify('/source.txt', hash('old source')), false);
    assert.equal(await verify('source.txt', 'a'.repeat(64)), false);
    assert.equal(await verify('source.txt', 'invented-key-value'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
