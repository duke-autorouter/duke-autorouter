import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { Jev } from '../server/adapters/jev.js';
import { focusReview, sourceWindows, ownershipClaim } from '../server/review-focus.js';
import type { ReviewEvidence } from '../server/task-evidence.js';
import type { Task } from '../server/types.js';

const evidence = (text = 'Internal workshop owner: Ana.'): ReviewEvidence => ({
  result: 'Saved checklist.md',
  files: [
    {
      path: 'checklist.md',
      bytes: text.length,
      sha256: 'fixture',
      format: '.md',
      text,
      incomplete: false,
      detail: 'Fixture',
    },
  ],
  inputs: [
    {
      path: 'brief.md',
      text: 'Ana owns the outline. Workshop owner is not assigned.',
    },
    { path: 'checklist.md', text: 'Earlier incorrect draft' },
  ],
  sources: [],
  checks: [],
  incomplete: false,
  limitations: [],
});
const answer = (v: string) => ({
  type: 'choice',
  choice: v,
  confidence: 1,
  probabilities: {
    pass: +(v === 'pass'),
    fail: +(v === 'fail'),
    unknown: +(v === 'unknown'),
  },
});
const claim = (v: string) => {
  const selected = v === 'pass' ? 'supported' : v === 'fail' ? 'contradicted' : v;
  return {
    type: 'choice',
    choice: selected,
    confidence: 1,
    probabilities: Object.fromEntries(
      ['supported', 'contradicted', 'unsupported', 'not_factual', 'unknown'].map((k) => [
        k,
        +(k === selected),
      ]),
    ),
  };
};
async function fixture(t: any, reply: (body: any, count: number) => any) {
  const root = await mkdtemp(join(tmpdir(), 'duke-focus-'));
  const store = new Store(join(root, 'db'));
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const calls: any[] = [];
  const jev = new Jev(store, { get: async () => 'synthetic' } as any, async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    calls.push(body);
    const verdicts = reply(body, calls.length);
    return Response.json({
      answers: Object.fromEntries(
        Object.keys(body.questions).map((id) => [
          id,
          verdicts[id] ?? (id.startsWith('claim_') ? claim('pass') : answer('pass')),
        ]),
      ),
      usage: { input_tokens: 10 },
    });
  });
  const task = {
    id: 't',
    prompt:
      'Create a factual checklist from brief.md. Label proposals. Leave unknown owners unresolved.',
    expectedResult: '',
    verification: { files: [], command: '' },
    required: ['files'],
  } as unknown as Task;
  return { store, calls, jev, task };
}
test('focused evidence preserves literal references and never uses earlier output as source', () => {
  const f = focusReview(evidence());
  assert.equal(f.passages[0].text, 'Internal workshop owner: Ana.');
  assert.deepEqual(
    f.sources.map((s) => s.path),
    ['brief.md'],
  );
  const source = 'Unrelated background. '.repeat(150) + 'Workshop owner: not assigned.';
  const windows = sourceWindows('Workshop owner Ana', [{ path: 'brief.md', text: source }], true);
  assert.ok(windows.some((w) => w.text.includes('not assigned')));
  assert.ok(windows.every((w) => source.slice(w.offset, w.offset + w.text.length) === w.text));
});
test('a specific failed claim survives broad passing judgments and does not solicit another opinion', async (t) => {
  const f = await fixture(t, () => ({ claim_0: claim('fail') }));
  const checks = await f.jev.review(f.task, evidence(), new AbortController().signal);
  assert.equal(checks.find((c) => c.name === 'Jev: claim_0')?.status, 'failed');
  assert.match(checks.find((c) => c.name === 'Jev: claim_0')!.detail, /checklist.md.*Ana/);
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].state.focusedPassages[0].sourceCoverageComplete);
});
test('uncertainty receives exactly one expanded pass, with both calls billed as review', async (t) => {
  const f = await fixture(t, (_b, n) => ({
    claim_0: claim(n === 1 ? 'unknown' : 'fail'),
  }));
  const e = evidence();
  e.resolutionSources = [
    {
      path: 'brief.md',
      text: 'Background '.repeat(120) + 'Workshop owner unknown.',
    },
  ];
  const checks = await f.jev.review(f.task, e, new AbortController().signal);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(Object.keys(f.calls[1].questions), ['claim_0']);
  assert.equal(f.calls[1].state.resolutionPass, 1);
  assert.equal(f.calls[0].state.evidence.resolutionSources, undefined);
  assert.equal(checks.find((c) => c.name === 'Jev: claim_0')?.status, 'failed');
  assert.equal(
    f.store.events('t').filter((e) => e.kind === 'usage_started' && e.data.role === 'review')
      .length,
    2,
  );
});
test('continued uncertainty and passage overflow cannot become verified success', async (t) => {
  const f = await fixture(t, () => ({ claim_0: claim('unknown') }));
  const checks = await f.jev.review(
    f.task,
    evidence(Array.from({ length: 25 }, (_, i) => `Item ${i}`).join('\n')),
    new AbortController().signal,
  );
  assert.equal(f.calls.length, 2);
  assert.equal(checks.find((c) => c.name === 'Jev: claim_0')?.status, 'unverified');
  assert.equal(checks.find((c) => c.name === 'Focused review coverage')?.status, 'unverified');
});
test('an uncorroborated broad failure stays neutral when a claim is malformed', async (t) => {
  const f = await fixture(t, () => ({
    brief: answer('fail'),
    claim_0: { type: 'choice' },
  }));
  const checks = await f.jev.review(f.task, evidence(), new AbortController().signal);
  assert.equal(checks.find((c) => c.name === 'Jev: brief')?.status, 'unverified');
  assert.equal(checks.find((c) => c.name === 'Jev: claim_0')?.status, 'unverified');
  assert.equal(f.calls.length, 2);
});
test('cancellation prevents a resolution request', async (t) => {
  const ac = new AbortController();
  const f = await fixture(t, () => {
    ac.abort();
    return { claim_0: claim('unknown') };
  });
  await assert.rejects(f.jev.review(f.task, evidence(), ac.signal));
  assert.equal(f.calls.length, 1);
});

test('unsupported claims with incomplete source coverage stay neutral even at probability one', async (t) => {
  const f = await fixture(t, () => ({ claim_0: claim('unsupported') }));
  const e = evidence();
  e.incomplete = true;
  const checks = await f.jev.review(f.task, e, new AbortController().signal);
  assert.equal(checks.find((c) => c.name === 'Jev: claim_0')?.status, 'unverified');
  assert.equal(f.calls.length, 2);
});
test('literal requirements are checked separately and findings cannot waive them', async (t) => {
  const f = await fixture(t, () => ({ requirement_1: answer('fail') }));
  const checks = await f.jev.review(f.task, evidence(), new AbortController().signal);
  assert.equal(checks.find((c) => c.name === 'Jev: requirement_1')?.status, 'failed');
  assert.match(f.calls[0].questions.requirement_1.instructions, /Label proposals/);
});

test('supported passages and literal requirements pass without an unnecessary second request', async (t) => {
  const f = await fixture(t, () => ({}));
  const checks = await f.jev.review(
    f.task,
    evidence('Internal workshop owner: unknown.'),
    new AbortController().signal,
  );
  assert.ok(checks.every((c) => c.status === 'passed'));
  assert.equal(f.calls.length, 1);
});
test('missing source keeps broad negative judgments neutral', async (t) => {
  const f = await fixture(t, () => ({
    brief: answer('fail'),
    support: answer('fail'),
    requirement_0: answer('fail'),
    claim_0: claim('unknown'),
  }));
  const e = evidence();
  e.incomplete = true;
  const checks = await f.jev.review(f.task, e, new AbortController().signal);
  assert.ok(checks.every((c) => c.status !== 'failed'));
  assert.equal(f.calls.length, 2);
});

test('PDF continuation lines retain their relation and empty checkbox rows are not claims', () => {
  const e = evidence(
    '☐ Small internal workshop: completion, owner and\ndate not supplied.\n- [ ]\nBudget $900.',
  );
  const plan = focusReview(e);
  assert.equal(
    plan.passages[0].text,
    '☐ Small internal workshop: completion, owner and date not supplied.',
  );
  assert.equal(plan.passages[1].facet, 'ownership');
  assert.ok(!plan.passages.some((p) => p.text === '- [ ]'));
});

test('ownership extraction separates a person-to-item assertion from role and status', () => {
  assert.deepEqual(
    ownershipClaim('- [ ] Internal workshop before invitations — Ana (delivery); unresolved'),
    { item: 'Internal workshop before invitations', person: 'Ana' },
  );
  assert.equal(ownershipClaim('- [ ] Readiness review — TBD; unresolved'), undefined);
  assert.equal(ownershipClaim('Proposal: review meeting owner: Sam.'), undefined);
});
test('an unresolved checklist action without an assigned owner is not an unsupported-fact failure', async (t) => {
  const f = await fixture(t, () => ({ claim_0: claim('unsupported') }));
  const checks = await f.jev.review(
    f.task,
    evidence('- [ ] Readiness review — TBD; unresolved'),
    new AbortController().signal,
  );
  assert.equal(checks.find((c) => c.name === 'Jev: claim_0')?.status, 'unverified');
});
