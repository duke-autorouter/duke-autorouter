import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cases } from '../evals/gpt6/fixtures.js';
import { check } from '../evals/gpt6/check.js';

test('frozen writing checks count words and detect missing structure and changed source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duke-gpt6-check-'));
  try {
    const item = cases.find(c => c.id === 'writing-invite')!;
    await writeFile(join(dir, 'brief.md'), item.files['brief.md']);
    const sample = 'Subject: Workshop\nHi team,\nOctober 8, 2026. Please reply. ' + 'sample '.repeat(90) + '\nBest,\nSender';
    await writeFile(join(dir, 'draft.md'), sample);
    const good = await check('writing-invite', dir);
    assert.equal(good.fixturesUnchanged, true);
    assert.equal(good.words, sample.trim().split(/\s+/).length);
    assert.ok(Object.values(good.structuralChecks!).every(Boolean));
    await writeFile(join(dir, 'draft.md'), 'Too short.');
    await writeFile(join(dir, 'brief.md'), 'Changed');
    const bad = await check('writing-invite', dir);
    assert.equal(bad.fixturesUnchanged, false);
    assert.equal(bad.words, 2);
    assert.ok(Object.values(bad.structuralChecks!).every(value => value === false));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
