import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countWords, statedWordRange } from '../server/word-count.js';
import { verifyTask } from '../server/verification.js';
import { Store } from '../server/store.js';
import { TaskInput, type Task, type Workspace } from '../server/types.js';

test('counts visible Markdown words without standalone syntax', () => {
  assert.equal(countWords('# Title\n\n- **One** [two](https://example.com) three'), 4);
  assert.equal(countWords('one two three'), 3);
});

test('saved factory cycle 3 status is below the required minimum', async () => {
  const saved = await readFile(new URL('../docs/evidence/factory-cycle-3-20260923/ownership-status/status.md', import.meta.url), 'utf8');
  assert.ok(countWords(saved) < 90);
});

test('extracts one explicit range from authoritative expected result', () => {
  assert.deepEqual(
    statedWordRange('90–130 words with exact title and three headings; factual status', 'status.md', true),
    { min: 90, max: 130, path: 'status.md' },
  );
  assert.deepEqual(statedWordRange('Write 90–130 words in status.md.', 'status.md'), { min: 90, max: 130, path: 'status.md' });
  const range = statedWordRange('Write a 2-3 word summary.', 'status.md');
  assert.ok(range);
  for (const [body, status] of [['one', 'short'], ['one two', 'within'], ['one two three', 'within'], ['one two three four', 'long']] as const) {
    const count = countWords(body);
    assert.equal(count >= range.min && count <= range.max, status === 'within');
  }
});

test('ignores examples, negation, approximate and conflicting ranges', () => {
  for (const text of [
    'Example: write 90-130 words.',
    'Do not write 90-130 words.',
    'Write about 90-130 words.',
    'Write 90-130 words. Write 50-60 words.',
    '"Write 90-130 words" is an example.',
    'You are not required to write 90-130 words.',
    'Optional: write 90-130 words.',
    'If useful, write 90-130 words.',
    'Example. Write 90-130 words.',
    'Write a 90-130 word introduction.',
    'Write 90-130 words excluding the title.',
    '> Write 90-130 words.',
  ]) assert.equal(statedWordRange(text, 'status.md'), undefined);
});

test('real task verification fails short status file from expected result and leaves ambiguous targets alone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'duke-words-'));
  try {
    const work = join(root, 'work');
    await mkdir(work);
    await writeFile(join(work, 'status.md'), '# Status\n\n' + Array(78).fill('word').join(' '));
    const store = new Store(join(root, 'state', 'db'));
    const workspace = { id: 'w', name: 'Test', path: work, providers: [], instructions: [] } as Workspace;
    const base = TaskInput.parse({
      prompt: 'Read brief.md and write status.md.', workspaceId: 'w',
      expectedResult: '90–130 words with exact title and three headings',
      verification: { files: ['status.md'], command: '' },
    });
    const task = { ...base, id: 't', title: 'Status', status: 'running', createdAt: '', updatedAt: '', attempt: 1 } as Task;
    const jev = { review: async () => [] } as any;
    const verify = (t: Task) => verifyTask(store, {} as any, jev, t, workspace, 'Done', new AbortController().signal);
    const short = await verify(task);
    assert.equal(short.status, 'failed');
    assert.match(short.checks.find((c) => c.name === 'Word count')?.detail ?? '', /79 words; required 90–130/);
    await writeFile(join(work, 'status.md'), '# Status\n\n' + Array(89).fill('word').join(' '));
    assert.equal((await verify(task)).checks.find((c) => c.name === 'Word count')?.status, 'passed');
    await writeFile(join(work, 'status.md'), '<p>one&nbsp;two</p>');
    assert.equal((await verify(task)).checks.find((c) => c.name === 'Word count'), undefined);
    await writeFile(join(work, 'status.md'), 'word '.repeat(10000));
    assert.equal((await verify(task)).checks.find((c) => c.name === 'Word count'), undefined);
    const multiple = { ...task, verification: { files: ['status.md', 'other.md'], command: '' } };
    assert.equal((await verify(multiple)).checks.find((c) => c.name === 'Word count'), undefined);
    const changed = { ...task, continuation: { text: 'Ignore the earlier word count; keep it concise.', previousLength: task.prompt.length, resolved: true, supersededFiles: [] } };
    assert.equal((await verify(changed)).checks.find((c) => c.name === 'Word count'), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
