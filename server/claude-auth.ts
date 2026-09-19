import { join } from 'node:path';
import { runProcess, safeEnv } from './process.js';
import { claudeExecutable } from './runtime.js';
import type { ClaudeConnection } from '../shared/claude-connection.js';

export async function claudeConnection(
  stateDir: string,
  signal?: AbortSignal,
  run: typeof runProcess = runProcess,
): Promise<ClaudeConnection> {
  // SDK AccountInfo can omit tokenSource even for a signed-in Claude Pro account.
  // The bundled CLI reports the active authentication method explicitly.
  const result = await run(claudeExecutable(), ['auth', 'status'], {
    cwd: stateDir,
    env: { ...safeEnv(), CLAUDE_CONFIG_DIR: join(stateDir, 'claude') },
    signal,
    timeout: 15000,
  });
  let status: { loggedIn?: boolean; authMethod?: string; apiProvider?: string };
  try {
    status = JSON.parse(result.stdout);
    if (!status || typeof status !== 'object') throw new Error();
  } catch {
    throw new Error('Claude could not report its sign-in status. Check the connection again.');
  }
  if (result.code !== 0 || status.loggedIn !== true) return { signedIn: false, billing: 'unknown' };
  if (status.apiProvider === 'firstParty') {
    if (status.authMethod === 'claude.ai') return { signedIn: true, billing: 'subscription' };
    if (['api_key', 'apiKey', 'console', 'anthropic_profile'].includes(status.authMethod ?? ''))
      return { signedIn: true, billing: 'api' };
  }
  if (['bedrock', 'vertex', 'vertexAi', 'foundry', 'gateway'].includes(status.apiProvider ?? ''))
    return { signedIn: true, billing: 'external' };
  return { signedIn: true, billing: 'unknown' };
}

export async function claudeSubscriptionConnected(
  stateDir: string,
  signal?: AbortSignal,
  run: typeof runProcess = runProcess,
): Promise<boolean> {
  const connection = await claudeConnection(stateDir, signal, run);
  return connection.signedIn && connection.billing === 'subscription';
}

export function claudeConnectionMessage(connection: ClaudeConnection): string {
  if (!connection.signedIn) return 'Sign in through Claude Code to connect your account.';
  if (connection.billing === 'subscription') return 'Subscription connected';
  if (connection.billing === 'api')
    return 'Claude Console connected · separately billed. DUKE currently routes Claude tasks through subscriptions; API execution is not enabled.';
  if (connection.billing === 'external')
    return 'Provider account connected in Claude Code. DUKE currently routes Claude tasks through subscriptions; provider billing is not enabled.';
  return 'Claude Code is signed in. Billing could not be identified, so DUKE has not enabled routing.';
}
