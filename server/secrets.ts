import { runProcess } from './process.js';
import { Blocked } from './types.js';
export class Secrets {
  async get(provider: 'openrouter' | 'jev'): Promise<string | undefined> {
    const env = process.env[provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'TYPESAFE_API_KEY'];
    if (env?.trim()) return env.trim();
    if (process.platform !== 'darwin') return undefined;
    const r = await runProcess(
      '/usr/bin/security',
      ['find-generic-password', '-a', 'duke-router', '-s', `duke-router/${provider}`, '-w'],
      { timeout: 5000 },
    );
    return r.code === 0 ? r.stdout.trim() : undefined;
  }
  async set(provider: 'openrouter' | 'jev', key: string) {
    if (process.platform !== 'darwin')
      throw new Blocked(
        'Keychain storage requires macOS. Use the documented environment variable on other platforms.',
      );
    if (!key.trim() || /[\r\n\0]/.test(key) || key.length > 4096)
      throw new Blocked('Invalid key format');
    // Pass the secret on stdin, never as a process argument or in logs.
    const quoted = '"' + key.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    const r = await runProcess('/usr/bin/security', ['-i'], {
      input: `add-generic-password -U -a duke-router -s duke-router/${provider} -w ${quoted}\n`,
      timeout: 10000,
    });
    if (r.code !== 0 || /SecKeychain|Error:/i.test(r.stderr))
      throw new Blocked(
        'Keychain could not save the key. Unlock your login keychain and try again.',
      );
  }
}
