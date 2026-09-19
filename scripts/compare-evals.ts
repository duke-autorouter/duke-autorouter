import { readFile } from 'node:fs/promises';
import { compareRuns } from '../evals/comparison.js';
const runs = await Promise.all(
  process.argv.slice(2).map(async (path) => ({
    path,
    ...JSON.parse(await readFile(path, 'utf8')),
  })),
);
console.log(JSON.stringify(compareRuns(runs), null, 2));
