import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {createPluginInstaller} from '../src/plugin-installation.js';

const copy=structuredClone;
const intent={goal:'整理阅读材料',input:'当前工作区',output:'阅读目录',constraints:[],capabilities:['检索'],queries:['reading']};
const candidate={id:'reading-tool',name:'reading-tool',capabilities:['检索'],install:{type:'npm',spec:'reading-tool@1.0.0',version:'1.0.0',readiness:'metadata-only'},evidence:{metadata:'manifest-checked'}};
const plan={kind:'single',title:'阅读目录',rationale:'使用阅读工具',pluginIds:['reading-tool'],steps:[{capability:'检索',owner:'reading-tool',sourceCapability:'检索',action:'检索材料',input:'工作区',output:'目录'}],limits:[]};
const receipt=(patch={})=>({candidateId:'reading-tool',packageName:'reading-tool',spec:'reading-tool@1.0.0',version:'1.0.0',requestId:'install-a',status:'ready',installed:true,enabled:true,active:true,application:'applied',...patch});
function fixture({persist,preparePlugins,native=false}={}){
 const data=persist??{rows:new Map(),pointer:{activeTaskId:null,activeRevisionId:null},failWrite:false};
 data.store??={read:async id=>copy(data.rows.get(id)),write:async row=>{if(data.failWrite)throw Error('PRIVATE_STORAGE');data.rows.set(row.id,copy(row));},list:async()=>copy([...data.rows.values()]),readPointer:async()=>copy(data.pointer),writePointer:async value=>{data.pointer=copy(value);}};
 const service=createFinderService({historyStore:data.store,hostVersion:'0.2.1-rc.2',preparePlugins,
  discovery:{search:async()=>({candidates:[candidate],sources:[{id:'test',status:'live'}],searchedAt:'2026-10-24T00:00:00Z'})},
  model:{status:()=>({configured:true}),call:async args=>({text:JSON.stringify(args.system.includes('仅允许 {"kind"')?(native?{...plan,kind:'native',pluginIds:[],steps:plan.steps.map(step=>({...step,owner:'dsh',sourceCapability:null}))}:plan):intent)})}});
 return{data,service};
}
const row=a=>Object.fromEntries(['attemptId','requestId','taskId','revisionId','kind','workspaceId','sessionId'].map(k=>[k,a[k]]));
async function created(f){const a=await f.service.analyze({request:'整理阅读材料'}),p=await f.service.recommend({taskId:a.workflow.taskId,revisionId:a.workflow.revisionId,intent});const c=await f.service.executionClaim({taskId:p.workflow.taskId,revisionId:p.workflow.revisionId,kind:'use',workspaceId:'ws'});return(await f.service.executionRecord({...row(c.attempt),status:'created',sessionId:'session-a'})).attempt;}
test('use submission cannot bypass durable preparation through claim or record',async()=>{
 const f=fixture(),a=await created(f);
 await assert.rejects(f.service.executionSubmitClaim(row(a)),e=>e.code==='EXECUTION_PLUGINS_NOT_READY');
 await assert.rejects(f.service.executionRecord({...row(a),status:'submitting'}),e=>e.code==='EXECUTION_PLUGINS_NOT_READY');
 assert.equal((await f.service.bootstrap()).workflow.executions[0].status,'created');
});
test('prepare derives exact saved candidates, persists before side effects, and appends verified receipt only on submit',async()=>{
 let f,seen;
 f=fixture({preparePlugins:async args=>{seen=args;await args.save([receipt({status:'installing'})]);const saved=(await f.service.exportTask({taskId:a.taskId})).task.executions[0];assert.equal(saved.preparation.status,'pending');assert.equal(saved.preparation.plugins[0].status,'installing');return{status:'ready',plugins:[receipt()]};}});
 const a=await created(f),result=await f.service.executionPrepare({...row(a),candidates:[{id:'FORGED'}],plugins:[{name:'FORGED'}]});
 assert.equal(result.ready,true);assert.equal(seen.candidates.length,1);assert.equal(seen.candidates[0].id,candidate.id);assert.deepEqual(seen.candidates[0].install,candidate.install);assert.equal(seen.operationId,a.attemptId);
 assert.equal(result.attempt.prompt,a.prompt);assert.equal(result.attempt.preparation.status,'ready');
 const granted=await f.service.executionSubmitClaim(row(a));assert.equal(granted.claim,'acquired');assert.match(granted.attempt.prompt,/已核实的插件安装回执/);assert.match(granted.attempt.prompt,/reading-tool@1.0.0/);assert.doesNotMatch(granted.attempt.prompt,/FORGED/);
 const repeated=await f.service.executionSubmitClaim(row(a));assert.equal(repeated.claim,'existing');assert.equal(repeated.attempt.prompt,granted.attempt.prompt);
});
test('prepare rejects forged session/workspace and imported authority without calling installer',async()=>{
 let calls=0;const f=fixture({preparePlugins:async()=>{calls++;return{status:'ready',plugins:[receipt()]};}}),a=await created(f);
 for(const patch of [{requestId:'wrong'},{attemptId:'wrong'},{workspaceId:'wrong'},{sessionId:'wrong'},{kind:'create'}])await assert.rejects(f.service.executionPrepare({...row(a),...patch}),e=>e.code==='EXECUTION_ATTEMPT_CONFLICT');
 const imported=fixture({preparePlugins:async()=>{calls++;}});await imported.service.importBackup({workflow:await f.service.exportTask({taskId:a.taskId})});
 await assert.rejects(imported.service.executionPrepare(row(a)),e=>e.code==='EXECUTION_ATTEMPT_CONFLICT');assert.equal(calls,0);
});
test('failed or unknown installs leave exact created attempt resumable and retain pending receipt',async()=>{
 const f=fixture({preparePlugins:async args=>{await args.save([receipt({status:'unknown'})]);throw Error('PRIVATE_TOKEN');}}),a=await created(f);
 await assert.rejects(f.service.executionPrepare(row(a)),e=>e.code==='EXECUTION_PLUGIN_PREPARATION_FAILED'&&!e.message.includes('PRIVATE'));
 const saved=(await f.service.bootstrap()).workflow.executions[0];assert.equal(saved.status,'created');assert.equal(saved.requestId,a.requestId);assert.equal(saved.preparation.status,'pending');assert.equal(saved.preparation.plugins[0].status,'unknown');
 await assert.rejects(f.service.executionSubmitClaim(row(a)),e=>e.code==='EXECUTION_PLUGINS_NOT_READY');
});
test('concurrent prepare coalesces and recovered prepare receives previous receipts instead of losing unknown state',async()=>{
 let calls=0,release;const wait=new Promise(r=>{release=r;});const f=fixture({preparePlugins:async args=>{calls++;await args.save([receipt({status:'installing'})]);await wait;return{status:'ready',plugins:[receipt()]};}}),a=await created(f);
 const other=fixture({persist:f.data,preparePlugins:async()=>{throw Error('duplicate installer');}});
 const pending=[f.service.executionPrepare(row(a)),other.service.executionPrepare(row(a))];await new Promise(r=>setTimeout(r,5));release();const results=await Promise.all(pending);assert.equal(calls,1);assert.ok(results.every(r=>r.ready));
 const restarted=fixture({persist:f.data,preparePlugins:async args=>{assert.deepEqual(args.previous,[receipt()]);return{status:'ready',plugins:[receipt()]};}});
 assert.equal((await restarted.service.executionPrepare(row(a))).ready,true);assert.equal((await restarted.service.bootstrap()).workflow.executions.length,1);
});
test('cancel during slow preparation is not held behind installation and prevents late submit',async()=>{
 let started,release;const start=new Promise(r=>{started=r;}),wait=new Promise(r=>{release=r;});const f=fixture({preparePlugins:async args=>{await args.save([receipt({status:'installing'})]);started();await wait;return{status:'ready',plugins:[receipt()]};}}),a=await created(f);
 const preparing=f.service.executionPrepare(row(a));await start;const cancelled=await f.service.executionCancelClaim(row(a));assert.equal(cancelled.attempt.status,'cancelled');release();await assert.rejects(preparing,e=>e.code==='EXECUTION_ATTEMPT_CONFLICT');assert.equal((await f.service.executionSubmitClaim(row(a))).claim,'existing');
});
test('preparation storage failure prevents installer side effect and forged ready receipts are rejected',async()=>{
 let calls=0;const f=fixture({preparePlugins:async()=>{calls++;return{status:'ready',plugins:[receipt({packageName:'other'})]};}}),a=await created(f);f.data.failWrite=true;
 await assert.rejects(f.service.executionPrepare(row(a)),e=>e.code==='HISTORY_STORAGE_FAILED');assert.equal(calls,0);f.data.failWrite=false;
 await assert.rejects(f.service.executionPrepare(row(a)),e=>e.code==='EXECUTION_PLUGINS_NOT_READY');assert.equal((await f.service.bootstrap()).workflow.executions[0].status,'created');
});
test('native plans need no installation and leave history preparation absent',async()=>{
 const f=fixture({native:true,preparePlugins:async()=>{throw Error('native must not install');}}),a=await created(f);
 const prepared=await f.service.executionPrepare(row(a));assert.equal(prepared.ready,true);assert.equal(prepared.attempt.preparation,undefined);
 const granted=await f.service.executionSubmitClaim(row(a));assert.equal(granted.claim,'acquired');assert.equal(granted.attempt.prompt,a.prompt);
});
test('ready receipts survive export import as read-only data; malformed or incomplete ready evidence is rejected',async()=>{
 const f=fixture({preparePlugins:async()=>({status:'ready',plugins:[receipt()]})}),a=await created(f);await f.service.executionPrepare(row(a));
 const exported=await f.service.exportTask({taskId:a.taskId}),imported=fixture();await imported.service.importBackup({workflow:exported});
 const restored=(await imported.service.exportTask({taskId:a.taskId})).task.executions[0];assert.deepEqual(restored.preparation,exported.task.executions[0].preparation);assert.equal(restored.provenance,'imported');
 await assert.rejects(imported.service.executionSubmitClaim(row(a)),e=>e.code==='EXECUTION_ATTEMPT_CONFLICT');
 for(const mutate of [p=>{p.plugins=[];},p=>{p.plugins[0].active=false;},p=>{p.plugins[0].spec='other@1.0.0';},p=>{p.plugins[0].version='2.0.0';}]){const bad=copy(exported);mutate(bad.task.executions[0].preparation);await assert.rejects(fixture().service.importBackup({workflow:bad}),e=>e.code==='INVALID_BACKUP');}
});
test('aborted preparation retains its pre-side-effect receipt and cannot authorize model submission',async()=>{
 const abort=new AbortController();const f=fixture({preparePlugins:async args=>{await args.save([receipt({status:'installing'})]);abort.abort();return{status:'ready',plugins:[receipt()]};}}),a=await created(f);
 await assert.rejects(f.service.executionPrepare({...row(a),signal:abort.signal}),e=>e.code==='MODEL_ABORTED');
 const saved=(await f.service.exportTask({taskId:a.taskId})).task.executions[0];assert.equal(saved.preparation.status,'pending');assert.equal(saved.preparation.plugins[0].status,'installing');assert.equal(saved.status,'created');
 await assert.rejects(f.service.executionSubmitClaim(row(a)),e=>e.code==='EXECUTION_PLUGINS_NOT_READY');
});
test('real installer and service gate integrate one durable install into one prepared submission',async()=>{
 let installed=false,calls=0,f,a;
 const manager={listBundles:async()=>installed?[{name:'reading-tool',version:'1.0.0',source:'reading-tool@1.0.0',installed:true,enabled:true,availability:'profile',rows:[{entryId:'reading',moduleName:'reading-tool'}]}]:[],listPlugins:async()=>installed?[{entryId:'reading',moduleName:'reading-tool',enabled:true,fiberPhase:'active'}]:[],inspect:async()=>({status:'accepted',kind:'registry',name:'reading-tool',version:'1.0.0',bundle:true}),setBundleEnabled:async()=>{throw Error('not needed');},installBundle:async(spec,options)=>{calls++;assert.equal(spec,'reading-tool@1.0.0');assert.equal(options.enabled,true);assert.equal(options.saveExact,true);const before=(await f.service.exportTask({taskId:a.taskId})).task.executions[0];assert.equal(before.preparation.status,'pending');assert.equal(before.preparation.plugins[0].requestId,options.requestId);assert.equal(before.status,'created');installed=true;return{application:'applied',bundle:'reading-tool',version:'1.0.0'};}};
 f=fixture({preparePlugins:createPluginInstaller({get:()=>manager})});a=await created(f);
 const first=await f.service.executionPrepare(row(a));assert.equal(first.ready,true);assert.equal(first.attempt.preparation.plugins[0].active,true);assert.equal(calls,1);
 assert.equal((await f.service.executionPrepare(row(a))).ready,true);assert.equal(calls,1);
 const granted=await f.service.executionSubmitClaim(row(a));assert.equal(granted.claim,'acquired');assert.equal((await f.service.executionSubmitClaim(row(a))).claim,'existing');assert.equal(calls,1);
});
test('cancelled follower of shared preparation cannot receive a ready grant',async()=>{
 let release,started;const wait=new Promise(r=>{release=r;}),start=new Promise(r=>{started=r;});
 const f=fixture({preparePlugins:async()=>{started();await wait;return{status:'ready',plugins:[receipt()]};}}),a=await created(f);
 const leader=f.service.executionPrepare(row(a));await start;const abort=new AbortController();const follower=f.service.executionPrepare({...row(a),signal:abort.signal});await new Promise(r=>setImmediate(r));abort.abort();release();
 await assert.rejects(follower,e=>e.code==='MODEL_ABORTED');assert.equal((await leader).ready,true);
});
