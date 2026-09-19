import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claudeSubscriptionConnected,
  claudeConnection,
  claudeConnectionMessage,
} from '../server/claude-auth.js';
import type { runProcess } from '../server/process.js';

const fixture =
  (status: unknown, code = 0): typeof runProcess =>
  async () => ({
    stdout: JSON.stringify(status),
    stderr: '',
    code,
  });

test('Claude connection status distinguishes subscription, API, provider and unknown billing without copying identity', async () => {
  for (const [status, billing] of [
    [{ authMethod: 'claude.ai', apiProvider: 'firstParty' }, 'subscription'],
    [{ authMethod: 'api_key', apiProvider: 'firstParty' }, 'api'],
    [{ authMethod: 'console', apiProvider: 'firstParty' }, 'api'],
    [{ authMethod: 'new_method', apiProvider: 'firstParty' }, 'unknown'],
    [{ authMethod: 'cloud', apiProvider: 'bedrock' }, 'external'],
  ] as const) {
    const connection = await claudeConnection(
      '/tmp/duke-profile',
      undefined,
      fixture({
        ...status,
        loggedIn: true,
        email: 'invented@example.com',
        token: 'invented-private-token',
      }),
    );
    assert.deepEqual(connection, { signedIn: true, billing });
    assert.equal(JSON.stringify(connection).includes('invented'), false);
  }
  assert.match(claudeConnectionMessage({ signedIn: true, billing: 'api' }), /separately billed/);
  assert.match(
    claudeConnectionMessage({ signedIn: true, billing: 'unknown' }),
    /not enabled routing/,
  );
  assert.deepEqual(
    await claudeConnection('/tmp/duke-profile', undefined, fixture({ loggedIn: false })),
    { signedIn: false, billing: 'unknown' },
  );
});

test('Claude subscription login is recognized when SDK token-source fields are absent', async () => {
  // Shape observed from the bundled CLI for the affected account. No tokenSource/apiKeySource.
  const connected = {
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    subscriptionType: 'pro',
  };
  const ready = await claudeSubscriptionConnected(
    '/tmp/duke-profile',
    undefined,
    async (command, args, options) => {
      assert.match(command, /claude$/);
      assert.deepEqual(args, ['auth', 'status']);
      assert.equal(options?.env?.CLAUDE_CONFIG_DIR, '/tmp/duke-profile/claude');
      assert.equal(options?.env?.ANTHROPIC_API_KEY, undefined);
      return { stdout: JSON.stringify(connected), stderr: '', code: 0 };
    },
  );
  assert.equal(ready, true);
});

test('Claude API, gateway, signed-out and incomplete auth states do not enable subscription routing', async () => {
  for (const status of [
    { loggedIn: true, authMethod: 'api_key', apiProvider: 'firstParty', subscriptionType: 'pro' },
    { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'gateway' },
    { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'bedrock' },
    { loggedIn: false, authMethod: 'none', apiProvider: 'firstParty', subscriptionType: 'pro' },
    { apiProvider: 'firstParty', subscriptionType: 'Claude Pro' },
    {},
  ])
    assert.equal(
      await claudeSubscriptionConnected('/tmp/duke-profile', undefined, fixture(status)),
      false,
    );
  assert.equal(
    await claudeSubscriptionConnected(
      '/tmp/duke-profile',
      undefined,
      fixture({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' }, 1),
    ),
    false,
  );
});

test('Claude status errors and cancellation cannot be mistaken for a connected account', async () => {
  const invalid: typeof runProcess = async () => ({
    stdout: 'unparseable private diagnostic',
    stderr: '',
    code: 1,
  });
  await assert.rejects(claudeSubscriptionConnected('/tmp/duke-profile', undefined, invalid), {
    message: 'Claude could not report its sign-in status. Check the connection again.',
  });
  const controller = new AbortController();
  controller.abort(new Error('Cancelled'));
  const cancelled: typeof runProcess = async (_command, _args, options) => {
    options?.signal?.throwIfAborted();
    throw new Error('Unexpected continuation');
  };
  await assert.rejects(
    claudeSubscriptionConnected('/tmp/duke-profile', controller.signal, cancelled),
    /Cancelled/,
  );
});
