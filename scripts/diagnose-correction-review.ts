// Recheck saved development evidence; no worker execution or artifact mutation.
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.js';
import { Secrets } from '../server/secrets.js';
import { Jev } from '../server/adapters/jev.js';
import { summarizeSpending } from '../server/spending.js';
import type { ReviewEvidence } from '../server/task-evidence.js';
import type { Task } from '../server/types.js';
const arg = (name: string) => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i+1]) throw Error(`Missing ${name}`); return resolve(process.argv[i+1]); };
if (process.env.DUKE_CORRECTION_VALIDATION_AUTHORIZED !== '1') throw Error('Live authorization required');
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) throw Error('Commit before calls');
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const raw = await readFile(arg('--receipt'));
const row = JSON.parse(raw.toString()).results.find((r: any) => r.caseId === 'deterministic-arithmetic');
if (!row || !row.inputUnchanged || !row.verifierUnchanged) throw Error('Original inputs must be intact');
const inputs = new Map<string, string>();
for (const e of row.events) if (e.kind === 'tool_completed' && e.data.name === 'read_file' && typeof e.data.result?.content === 'string' && e.data.result.path !== row.artifact.path && !inputs.has(e.data.result.path)) inputs.set(e.data.result.path, e.data.result.content);
const evidence: ReviewEvidence = { result: row.result, files: [row.artifact], inputs: [...inputs].map(([path,text]) => ({path,text})), sources: [], checks: row.review.checks.filter((c: any) => !c.name.startsWith('Jev:')), incomplete: false, limitations: [] };
const out = arg('--out'); await mkdir(dirname(out), {recursive:true});
const state = await mkdtemp(join(tmpdir(), 'duke-correction-review-'));
const store = new Store(join(state, 'db'));
store.put('settings', 'main', { ...store.settings(), dailyLimit: .01, monthlyLimit: .01, jevMode: 'assist', jevInputPrice: .042, jevValidated: true });
const jev = new Jev(store, new Secrets());
const results: any[] = [];
const persist = () => writeFile(out, JSON.stringify({ source, workerRerun: false, inputReceiptSHA256: createHash('sha256').update(raw).digest('hex'), results },null,2)+'\n');
try {
  for (const changed of [false, true]) {
    const id = changed ? 'wrong-total-control' : 'saved-correct-total';
    const e = changed ? { ...evidence, result:'Saved total.json.', files:[{...row.artifact,text:'{"printing":120,"signs":80,"total":250}',sha256:'synthetic-negative-control'}], checks:evidence.checks.map(c => c.name === 'Tests' ? {...c,status:'failed' as const,detail:'node verify-total.mjs\nExit 1\nAssertion: total must equal 200; actual 250.'} : c) } : evidence;
    const task = {id,prompt:row.events.find((e:any)=>e.kind==='created').data.prompt,expectedResult:'',required:['files','shell','artifacts'],verification:{files:['total.json'],command:'node verify-total.mjs'}} as unknown as Task;
    let checks:any[] = [], error:string|undefined;
    try { checks = await jev.review(task,e,AbortSignal.timeout(75000),{attachments:[],project:{entries:3,fileTypes:{'.json':1,'.md':1,'.mjs':1},hasTests:true},progress:{summary:'Earlier total was 250.',remaining:'Earlier attempt failed its test.'},incomplete:false}); }
    catch (ex) {error=(ex as Error).message;}
    results.push({caseId:id,status:error?'unverified':checks.some(c=>c.status==='failed')?'failed':checks.some(c=>c.status==='unverified')?'unverified':'passed',checks,error,events:store.events(id),...summarizeSpending(store.spending().filter(s=>s.taskId===id))});
    await persist(); console.log(id,results.at(-1).status);
  }
} finally {await persist(); store.close();}
