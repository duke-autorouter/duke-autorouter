import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// File Provider folders can recreate FinderInfo while codesign is sealing an app.
// Assemble the installable bundle in the user's private, unsynced build directory.
export const packageDirectory = resolve(process.env.DUKE_PACKAGE_DIR ?? join(tmpdir(), 'duke-autorouter-package'));
export const packageApp = join(packageDirectory, 'DUKE Autorouter.app');
