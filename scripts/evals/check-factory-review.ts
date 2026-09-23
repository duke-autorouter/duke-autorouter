import { mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Store } from '../../server/store.js';
import { Secrets } from '../../server/secrets.js';
import { Jev } from '../../server/adapters/jev.js';
import { TaskInput, type Task } from '../../server/types.js';
import { summarizeSpending } from '../../server/spending.js';
import { reviewRequirementClauses } from '../../server/review-focus.js';
import { probes as initialProbes, scopeProbes } from '../../evals/factory-cycle-2/fixtures.js';
const scopeControls=process.argv.includes('--scope-controls');
const probes=scopeControls ? scopeProbes : initialProbes;
if (!process.argv.includes('--run')) {
  console.log('No provider calls. Frozen Jev-only probes:', probes.map(p=>({id:p.id,expected:p.expected,clauses:reviewRequirementClauses(p.expectedResult).length})));
  process.exit(0);
}
const i=process.argv.indexOf('--out');
if(i<0 || !process.argv[i+1]) throw Error('--out required');
const out=resolve(process.argv[i+1]);
await mkdir(out,{recursive:false});
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const receipt:any={scope:'Fresh Jev-only review probes; no worker or efficiency claim',cohort:scopeControls?'explicit-scope-controls':'initial-seven',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixtureSHA256:sha(JSON.stringify(probes)),startedAt:new Date().toISOString(),results:[]};
const save=async()=>{await writeFile(join(out,'.results.tmp'),JSON.stringify(receipt,null,2)+'\n');await rename(join(out,'.results.tmp'),join(out,'results.json'));};
await save();
const store=new Store(join(out,'private.sqlite'));
store.put('settings','main',{...store.settings(),dailyLimit:0.02,monthlyLimit:0.02,jevMode:'assist',jevValidated:true,jevInputPrice:0.042,maxRecovery:0});
const jev=new Jev(store,new Secrets());
try{
 for(const probe of probes){
  const missing='missing' in probe && probe.missing;
  const task:Task={...TaskInput.parse({prompt:probe.prompt,expectedResult:probe.expectedResult,workspaceId:'fixture'}),id:probe.id,title:probe.id,status:'running',attempt:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const row:any={id:probe.id,expected:probe.expected,clauses:reviewRequirementClauses(probe.expectedResult).length,observed:'running'};
  receipt.results.push(row);await save();
  try{
   const checks=await jev.review(task,{result:'See card.txt.',files:[{path:'card.txt',bytes:Buffer.byteLength(probe.text),sha256:sha(probe.text),format:'text',text:probe.text,incomplete:false,detail:'Frozen diagnostic artifact, not a worker output.'}],inputs:missing?[]:[{path:'brief.txt',text:probe.source}],sources:[],checks:[],incomplete:!!missing,limitations:missing?['Reference intentionally withheld']:[]},AbortSignal.timeout(90000));
   row.checks=checks;row.observed=checks.some(c=>c.status==='failed')?'failed':checks.some(c=>c.status==='unverified')?'unverified':'passed';
   row.observations=store.events(task.id).filter(e=>['jev_review','jev_review_resolution','jev_review_unavailable'].includes(e.kind)).map(e=>({kind:e.kind,data:e.data}));
  }finally{Object.assign(row,summarizeSpending(store.spending().filter(s=>s.taskId===task.id)));await save();}
 }
}finally{receipt.finishedAt=new Date().toISOString();await save();store.close();}
