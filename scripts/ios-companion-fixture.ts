import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { createRemoteApp } from '../server/remote.js';
import { TaskInput, now } from '../server/types.js';

const root = await mkdtemp(join(tmpdir(), 'duke-ios-fixture-'));
const project = join(root, 'sample-project');
await mkdir(project);
const core = await createApp({ stateDir: join(root, 'state'), serveUI: false });
core.engine.stopped = true;
core.store.put('workspace', 'sample', {
  id: 'sample',
  name: 'Sample project',
  path: project,
  providers: ['codex'],
  instructions: [],
});
const task = {
  ...TaskInput.parse({
    workspaceId: 'sample',
    prompt: 'Prepare the saved project note.',
  }),
  id: 'sample-complete',
  title: 'Saved project note',
  status: 'completed' as const,
  attempt: 1,
  createdAt: now(),
  updatedAt: now(),
  result: 'The synthetic note is saved and ready to inspect.',
  checkpoint: {
    summary: 'Saved phone-note.md.',
    remaining: '',
    artifacts: ['phone-note.md'],
    at: now(),
  },
};
core.store.save(task);
const bytes = Buffer.from('# DUKE iOS companion\n\nSynthetic simulator fixture.\n');
await writeFile(join(project, 'phone-note.md'), bytes);
core.store.put('artifact', 'sample-artifact', {
  id: 'sample-artifact',
  taskId: task.id,
  path: 'phone-note.md',
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  at: now(),
});
const interrupted = {
  ...TaskInput.parse({
    workspaceId: 'sample',
    prompt: 'Continue after the Mac wakes.',
  }),
  id: 'sample-interrupted',
  title: 'Continue after the Mac wakes',
  status: 'interrupted' as const,
  attempt: 1,
  createdAt: now(),
  updatedAt: now(),
  error: 'The Mac app restarted. Review the checkpoint before continuing.',
};
core.store.save(interrupted);
core.store.update(task.id, { status: 'running' });
void core.approvals.request(
  task.id,
  'Share the saved report with the selected destination',
  { artifact: 'phone-note.md' },
  new AbortController().signal,
);
const challenge = core.remoteAccess.createChallenge(['sample'], 30 * 60_000);
const remote = createRemoteApp({
  store: core.store,
  engine: core.engine,
  approvals: core.approvals,
  access: core.remoteAccess,
  allowInsecureForTests: true,
});
await remote.listen({ host: '127.0.0.1', port: 4339 });
console.log(
  JSON.stringify({
    server: 'http://127.0.0.1:4339',
    pairingCode: challenge.code,
    note: 'Synthetic simulator fixture only. No provider calls are made.',
  }),
);

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void remote
      .close()
      .then(() => core.app.close())
      .then(() => rm(root, { recursive: true, force: true }))
      .then(() => process.exit(0));
  });
