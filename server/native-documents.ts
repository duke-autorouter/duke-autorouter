import { access } from 'node:fs/promises';
import { resource } from './runtime.js';
import { runProcess } from './process.js';

export async function nativeDocument(
  args: {
    operation: 'pdf_text' | 'pdf_image' | 'thumbnail';
    path: string;
    output?: string;
    page?: number;
  },
  signal?: AbortSignal,
) {
  if (process.platform !== 'darwin')
    throw new Error('Native document inspection requires the supported Mac release.');
  let executable = resource('../DocumentTools');
  try {
    await access(executable);
  } catch {
    executable = resource('.build/DocumentTools');
  }
  try {
    await access(executable);
  } catch {
    throw new Error(
      'Document helper is missing. Build the source with npm run build, or reinstall the Mac app.',
    );
  }
  const result = await runProcess(executable, [], {
    input: JSON.stringify(args),
    signal,
    timeout: 30000,
  });
  let output: any;
  try {
    output = JSON.parse(result.stdout);
  } catch {
    throw new Error('The native document helper did not return a readable result.');
  }
  if (result.code !== 0 || output.error)
    throw new Error(output.error ?? 'Document inspection failed.');
  return output;
}
