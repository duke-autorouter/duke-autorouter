import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createApp } from './app.js';
import { brand } from '../shared/brand.js';
const { app, engine, launchToken, stateDir } = await createApp();
const url = await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 4318) });
const launchFile = join(stateDir, 'launch.json');
await writeFile(launchFile, JSON.stringify({ url, token: launchToken, pid: process.pid }), {
  mode: 0o600,
});
console.log(process.env.DUKE_DESKTOP_EXECUTABLE
  ? `${brand.name} is running locally.`
  : `${brand.name} is running locally. Open ${url}/#launch=${launchToken}`);
void engine.drain();
let closing = false;
for (const event of ['SIGINT', 'SIGTERM'])
  process.on(event, () => {
    if (closing) return;
    closing = true;
    void app.close().then(async () => {
      await unlink(launchFile).catch(() => {});
      process.exit(0);
    });
  });
// The launcher owns this process. Recoverable work is stopped if its parent crashes.
if (process.env.DUKE_PARENT_PID) {
  const parent = Number(process.env.DUKE_PARENT_PID);
  setInterval(() => {
    if (process.ppid !== parent) process.kill(process.pid, 'SIGTERM');
  }, 2000).unref();
}
