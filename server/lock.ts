import { open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Blocked } from './types.js';
export async function acquireInstanceLock(dir: string) {
  const path = join(dir, 'instance.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, 'wx', 0o600);
      await file.writeFile(String(process.pid));
      await file.close();
      return async () => {
        try {
          if ((await readFile(path, 'utf8')).trim() === String(process.pid)) await unlink(path);
        } catch {}
      };
    } catch (e: any) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(await readFile(path, 'utf8'));
      let alive = true;
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new Blocked('Invalid instance lock; inspect it before removing it.');
      try {
        process.kill(pid, 0);
      } catch (err: any) {
        if (err.code === 'ESRCH') alive = false;
      }
      if (alive)
        throw new Blocked(
          'This data directory already has a running router. Open its existing launch link.',
        );
      await unlink(path);
    }
  }
  throw new Blocked('Could not acquire the router instance lock.');
}
