import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { claudeExecutable } from './runtime.js';
import { safeEnv, runProcess } from './process.js';
import { Blocked } from './types.js';

const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

// This opens the published interactive runtime. It neither automates its menus
// nor reads credentials; the user has access to Claude Code's complete setup.
export async function openClaudeSetup(
  stateDir: string,
  run: typeof runProcess = runProcess,
  executable = claudeExecutable(),
) {
  if (process.platform !== 'darwin')
    throw new Blocked('Opening Claude Code setup from DUKE is available on macOS.');
  const cwd = join(stateDir, 'runtime');
  const profile = join(stateDir, 'claude');
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  await mkdir(profile, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(cwd, 'claude-setup-'));
  const script = join(directory, 'Claude Code setup.command');
  const env = { ...safeEnv(), TERM: 'xterm-256color', CLAUDE_CONFIG_DIR: profile };
  const assignments = Object.entries(env)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => quote(`${key}=${value}`));
  await writeFile(
    script,
    [
      '#!/bin/zsh',
      'umask 077',
      'trap \'/bin/rm -f -- "$0"; /bin/rmdir -- "${0:h}" 2>/dev/null\' EXIT',
      'print -r -- "Claude Code setup for DUKE. Use /login to choose an account or provider."',
      'print -r -- "When finished, close this window and choose Check connections in DUKE."',
      `cd -- ${quote(cwd)} || exit 1`,
      `/usr/bin/env -i ${assignments.join(' ')} ${quote(executable)}`,
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o700 },
  );
  try {
    const result = await run('/usr/bin/open', ['-a', 'Terminal', script], { timeout: 10000 });
    if (result.code !== 0) throw new Error('Terminal did not open');
  } catch {
    await rm(directory, { recursive: true, force: true });
    throw new Blocked('Claude Code setup could not open. Your existing connection is unchanged.');
  }
  return { opened: true };
}
