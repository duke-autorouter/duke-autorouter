import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createApp } from './app.js';
import { createRemoteApp } from './remote.js';
import { brand } from '../shared/brand.js';
const { app, engine, approvals, remoteAccess, store, launchToken, stateDir } = await createApp();
const url = await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 4318) });
const remoteApp =
  process.env.DUKE_REMOTE_ENABLE === '1'
    ? createRemoteApp({
        store,
        engine,
        approvals,
        access: remoteAccess,
        requireTailscaleIdentity: process.env.DUKE_REMOTE_REQUIRE_TAILSCALE !== '0',
      })
    : undefined;
if (remoteApp) {
  await remoteApp.listen({
    host: '127.0.0.1',
    port: Number(process.env.DUKE_REMOTE_PORT ?? 4319),
  });
}
const launchFile = join(stateDir, 'launch.json');
await writeFile(launchFile, JSON.stringify({ url, token: launchToken, pid: process.pid }), {
  mode: 0o600,
});
console.log(process.env.DUKE_DESKTOP_EXECUTABLE
  ? `${brand.name} is running locally.`
  : `${brand.name} is running locally. Open ${url}/#launch=${launchToken}`);
if (remoteApp)
  console.log('The iPhone gateway is listening on loopback. Keep it behind an approved private HTTPS transport.');
void engine.drain();
let closing = false;
for (const event of ['SIGINT', 'SIGTERM'])
  process.on(event, () => {
    if (closing) return;
    closing = true;
    void (remoteApp ? remoteApp.close() : Promise.resolve())
      .then(() => app.close())
      .then(async () => {
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
