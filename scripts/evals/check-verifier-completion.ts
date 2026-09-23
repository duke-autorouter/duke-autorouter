// A separately frozen diagnostic: real file inspection, fixture-authored content.
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Store } from '../../server/store.js';
import { Secrets } from '../../server/secrets.js';
import { Jev } from '../../server/adapters/jev.js';
import { ToolService } from '../../server/tools.js';
import { Approvals } from '../../server/approval.js';
import { verifyTask } from '../../server/verification.js';
import { TaskInput, type Task, type Workspace } from '../../server/types.js';
import { summarizeSpending } from '../../server/spending.js';
const source='For the fictional Willow records room, Sora owns the intake audit. The intake audit is pending. Tom owns the shelf-label design.';
const prompt='Save handoff.txt containing exactly one line about the intake audit only, naming its owner and status. Do not include shelf-label design or other work. That file is the entire deliverable. Use only brief.txt.';
const expectedResult='Identify Sora as intake audit owner; state that the intake audit is pending';
const correct='Intake audit — Owner: Sora. Status: pending.';
const cases=[
 {id:'correct-short-response',expected:'passed',text:correct,result:'See handoff.txt.'},
 {id:'correct-descriptive-response',expected:'passed',text:correct,result:'Saved handoff.txt with the intake audit owner and pending status.'},
 {id:'missing-file',expected:'failed',text:null,result:'Saved handoff.txt.'},
 {id:'placeholder',expected:'failed',text:'TODO: add the audit owner and status.',result:'See handoff.txt.'},
 {id:'wrong-owner',expected:'failed',text:'Intake audit — Owner: Tom. Status: pending.',result:'See handoff.txt.'},
 {id:'missing-status',expected:'failed',text:'Intake audit — Owner: Sora.',result:'See handoff.txt.'},
];
if(!process.argv.includes('--run')){console.log('No provider calls. Frozen production-verifier cases:',cases.map(({id,expected})=>({id,expected})));process.exit(0);}
const i=process.argv.indexOf('--out');if(i<0||!process.argv[i+1])throw Error('--out required');
const out=resolve(process.argv[i+1]);await mkdir(out,{recursive:false});
const receipt:any={scope:'Real DUKE file inspection and Jev review of fixture-authored files; no generation worker or recovery',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixtureSHA256:createHash('sha256').update(JSON.stringify({source,prompt,expectedResult,cases})).digest('hex'),source,prompt,expectedResult,cases,startedAt:new Date().toISOString(),results:[]};
const save=async()=>{await writeFile(join(out,'.results.tmp'),JSON.stringify(receipt,null,2)+'\n');await rename(join(out,'.results.tmp'),join(out,'results.json'));};await save();
const store=new Store(join(out,'private.sqlite'));store.put('settings','main',{...store.settings(),dailyLimit:0.01,monthlyLimit:0.01,jevMode:'assist',jevValidated:true,jevInputPrice:0.042,maxRecovery:0});
const tools=new ToolService(store,new Approvals(store),out),jev=new Jev(store,new Secrets());
try{
 for(const c of cases){
  const dir=join(out,c.id);await mkdir(dir);await writeFile(join(dir,'brief.txt'),source);if(c.text!==null)await writeFile(join(dir,'handoff.txt'),c.text);
  const workspace:Workspace={id:c.id,name:c.id,path:dir,providers:['codex'],instructions:[]};store.put('workspace',workspace.id,workspace);
  const task:Task={...TaskInput.parse({workspaceId:workspace.id,prompt,expectedResult,required:['files'],verification:{files:['handoff.txt'],command:''}}),id:c.id,title:c.id,status:'running',attempt:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};store.save(task);
  const row:any={id:c.id,expected:c.expected,observed:'running'};receipt.results.push(row);await save();
  try{
   const signal=AbortSignal.timeout(90000);await tools.call(task.id,'read_file',{path:'brief.txt'},signal);
   const review=await verifyTask(store,tools,jev,task,workspace,c.result,signal);
   row.observed=review.status;row.checks=review.checks;row.evidenceComplete=review.evidence?.complete;
  }finally{Object.assign(row,summarizeSpending(store.spending().filter(s=>s.taskId===task.id)));await save();}
 }
}finally{receipt.finishedAt=new Date().toISOString();await save();store.close();}
