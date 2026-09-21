import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compareDevelopmentPilot } from '../evals/pilot-comparison.js';

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--out');
if (outputIndex < 0 || !args[outputIndex + 1])
  throw new Error('Provide --out <summary.json> after the three run receipts.');
const paths = args.slice(0, outputIndex);
if (paths.length !== 3) throw new Error('Provide strong, rules and Jev receipts in that order.');
const runs = await Promise.all(
  paths.map(async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))),
);
const summary = compareDevelopmentPilot(runs);
await writeFile(resolve(args[outputIndex + 1]), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
