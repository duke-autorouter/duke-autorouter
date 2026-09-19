import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
// Both the source checkout and installed bundle keep server/ beside dist/ and node_modules/.
export const appRoot = fileURLToPath(new URL('../', import.meta.url));
export const resource = (...parts: string[]) => join(appRoot, ...parts);
export const codexExecutable = () => require.resolve('@openai/codex/bin/codex.js');
export const claudeExecutable = () =>
  require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude`);
export const shellRunnerArgs = () =>
  import.meta.url.endsWith('.ts')
    ? ['--import', pathToFileURL(require.resolve('tsx')).href, resource('server/shell-runner.ts')]
    : [resource('server/shell-runner.js')];
