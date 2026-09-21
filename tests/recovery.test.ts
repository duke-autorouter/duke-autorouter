import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRecoveryEffort, sameEffortCorrectionAllowed } from '../server/recovery.js';
import { ModelInput, defaults, type Task } from '../server/types.js';
import { Store } from '../server/store.js';
import { Jev } from '../server/adapters/jev.js';
const model = {
  ...ModelInput.parse({
    id: 'luna',
    model: 'luna',
    provider: 'codex',
    label: 'Luna',
    capabilities: ['files'],
    quality: { coding: 0.8, research: 0.8, writing: 0.8 },
    supportedEfforts: ['low', 'medium', 'high'],
  }),
  effort: 'low' as const,
};

test('recovery advances one advertised effort only within the user ceiling and attempt cap', () => {
  assert.equal(nextRecoveryEffort({ attempt: 0 }, model, defaults), 'medium');
  assert.equal(
    nextRecoveryEffort({ attempt: 0 }, { ...model, effort: 'medium' }, defaults),
    undefined,
  );
  assert.equal(
    nextRecoveryEffort({ attempt: 0 }, { ...model, supportedEfforts: ['low', 'high'] }, defaults),
    undefined,
  );
  assert.equal(
    nextRecoveryEffort({ attempt: 0 }, { ...model, effort: undefined }, defaults),
    undefined,
  );
  assert.equal(
    nextRecoveryEffort({ attempt: 0, effortOverride: 'low' }, model, defaults),
    undefined,
  );
  assert.equal(nextRecoveryEffort({ attempt: 2 }, model, defaults), undefined);
  assert.equal(
    nextRecoveryEffort({ attempt: 0 }, model, { ...defaults, maxRecovery: 0 }),
    undefined,
  );
  assert.equal(
    nextRecoveryEffort(
      { attempt: 1 },
      { ...model, effort: 'medium' },
      { ...defaults, recoveryEffortCeiling: 'high' },
    ),
    'high',
  );
});

test('Jev recovery gates the selected probability, records review usage and fails closed', async () => {
  for (const [p, concentration, expected] of [
    [0.9, 0.3, 'reasoning'],
    [0.89, 1, 'unknown'],
  ] as const) {
    const store = new Store(':memory:');
    try {
      const jev = new Jev(store, { get: async () => 'fixture' } as any, async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        assert.equal(Object.keys(body.questions).join(), 'recovery');
        assert.match(body.questions.recovery.instructions, /untrusted data/);
        return Response.json({
          answers: {
            recovery: {
              type: 'choice',
              choice: 'reasoning',
              confidence: concentration,
              probabilities: {
                reasoning: p,
                missing_context: 0,
                tool_failure: 0,
                unknown: 1 - p,
              },
            },
          },
          usage: { input_tokens: 10 },
        });
      });
      const task = {
        id: 'fixture',
        prompt: 'Write a note',
        expectedResult: '',
        attachments: [],
        revision: 0,
      } as unknown as Task;
      assert.equal((await jev.recovery(task, {}, new AbortController().signal)).cause, expected);
      assert.equal(
        store.events('fixture').find((e) => e.kind === 'usage_started')?.data.role,
        'review',
      );
      store.put('settings', 'main', { ...defaults, jevMode: 'off' });
      assert.equal((await jev.recovery(task, {}, new AbortController().signal)).cause, 'unknown');
    } finally {
      store.close();
    }
  }
});

test('same-effort correction honors retry limits, fixed effort and changed effort support', () => {
  assert.equal(
    sameEffortCorrectionAllowed({ attempt: 0, effortOverride: 'low' }, model, model, defaults),
    true,
  );
  assert.equal(sameEffortCorrectionAllowed({ attempt: 2 }, model, model, defaults), false);
  assert.equal(
    sameEffortCorrectionAllowed(
      { attempt: 0 },
      model,
      { ...model, supportedEfforts: ['medium'] },
      defaults,
    ),
    false,
  );
  assert.equal(
    sameEffortCorrectionAllowed({ attempt: 0 }, { ...model, effort: undefined }, model, defaults),
    false,
  );
});

test('correction asks about available evidence at unchanged effort and retains the probability gate', async () => {
  for (const probability of [0.9, 0.89]) {
    const store = new Store(':memory:');
    try {
      const jev = new Jev(store, { get: async () => 'fixture' } as any, async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        assert.equal(body.state.recoveryStage, 'correction');
        assert.ok(!body.questions.recovery.criteria.reasoning);
        assert.match(
          body.questions.recovery.instructions,
          /not a judgment that more reasoning effort/,
        );
        return Response.json({
          answers: {
            recovery: {
              type: 'choice',
              choice: 'correction',
              confidence: 1,
              probabilities: {
                correction: probability,
                missing_context: 0,
                tool_failure: 0,
                unknown: 1 - probability,
              },
            },
          },
          usage: { input_tokens: 10 },
        });
      });
      const task = {
        id: 'fixture',
        prompt: 'Write a note',
        expectedResult: '',
        attachments: [],
        revision: 0,
      } as unknown as Task;
      const result = await jev.recovery(task, {}, new AbortController().signal, 'correction');
      assert.equal(result.cause, probability === 0.9 ? 'correction' : 'unknown');
      assert.equal(
        store.events(task.id).find((e) => e.kind === 'recovery_judged')?.data.stage,
        'correction',
      );
    } finally {
      store.close();
    }
  }
});
