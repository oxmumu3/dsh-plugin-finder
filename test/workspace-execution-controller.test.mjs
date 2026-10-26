import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinderController } from '../src/client.js';
const intent={goal:'只读整理',input:'demo.md',output:'摘要',constraints:['不修改原文件'],capabilities:['读取'],queries:['read']};
const plan={kind:'native',title:'用现成能力完成',rationale:'只需阅读',pluginIds:[],steps:[{capability:'读取',owner:'dsh',action:'读取当前文件',input:'demo.md',output:'摘要'}],limits:[],nextPrompt:'只读'};
const workflow=(revisionId='r1',extra={})=>({taskId:'t1',revisionId,stage:'plan',request:'只读整理demo.md',intent,plan,candidates:[],revisions:[],...extra});
function setup({initial=workflow(),routes={},execute,hostVersion='0.2.1-rc.2'}={}){
 const calls=[],storage=new Map();let current=initial;
 const ctx={workspaces:{list:{getSnapshot:()=>({phase:'ready',items:[{workspaceId:'w1',title:'当前项目',sessionIds:['original']}] }),subscribe:()=>()=>{}}},sessions:{list:{getSnapshot:()=>({phase:'ready',ids:['original'],byId:{original:{id:'original',retainedBy:{mainView:1}}}}),subscribe:()=>()=>{}}},uiSession:{sessionStatus:{getSnapshot:()=>new Map()}}};
 const c=createFinderController(ctx,{draftStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},waitForExecutionUI:async()=>{},executeInWorkspace:execute||(async()=>({dispose(){},cancel:async()=>true,completion:new Promise(()=>{})})),fetch:async(url,options)=>{
 const path=url.split('/').at(-1),body=options.body?JSON.parse(options.body):null;calls.push({path,body});
 if(routes[path])return routes[path](body);
 let value={};
 if(path==='bootstrap')value={model:{configured:true},hostVersion,workflow:current};
 if(path==='execution-claim')value={claim:'acquired',attempt:{...body,attemptId:'a1',requestId:'q1',status:'claimed',provenance:'local',sessionId:null,prompt:'服务器保存的明确执行请求'},workflow:current};
 if(path==='creation-update'){current=workflow('r2',{creation:{...current.creation,status:'ready',supply:{status:'current'}}});value={workflow:current};}
 return {ok:true,json:async()=>value};
 }});return {c,calls,storage};
}
test('official rc.3 can execute a saved plan with the required Host APIs',async()=>{
 let executions=0;const {c}=setup({hostVersion:'0.2.1-rc.3',execute:async()=>{executions++;return{dispose(){},completion:new Promise(()=>{})};}});
 await c.bootstrap();assert.equal(await c.runCurrentPlan(),true);assert.equal(executions,1);c.close();
});
test('one use action adopts current workspace and executes canonical prompt without a handoff call',async()=>{
 let seen;const {c,calls}=setup({execute:async(ctx,options)=>{seen=options;options.onStatus({phase:'submitted',terminal:false,summary:'已接收',sessionId:'s1'});return {dispose(){},completion:new Promise(()=>{})};}});
 await c.bootstrap();assert.equal(c.getSnapshot().workspaceId,'w1');assert.equal(await c.runCurrentPlan(),true);
 assert.equal(seen.attempt.prompt,'服务器保存的明确执行请求');assert.equal(seen.attempt.workspaceId,'w1');assert.equal(seen.acquired,true);
 assert.deepEqual(calls.map(x=>x.path),['bootstrap','execution-claim']);assert.equal(c.getSnapshot().execution.phase,'running');
 assert.equal(await c.runCurrentPlan(),false);c.close();
});
test('one create action internally confirms and uses the returned exact revision',async()=>{
 const creation={status:'draft',contentHash:'hash',blueprint:Object.fromEntries(['name','purpose','workflow','inputs','outputs','ui','data','tools','runtime','scope','acceptance'].map(x=>[x,'说明'])),answers:[],assumptions:[],questions:[],supply:{status:'current'}};
 const {c,calls}=setup({initial:workflow('r1',{creation})});await c.bootstrap();assert.equal(await c.createInWorkspace(),true);
 assert.deepEqual(calls.map(x=>x.path),['bootstrap','creation-update','execution-claim']);assert.equal(calls[1].body.confirm,true);assert.equal(calls[2].body.revisionId,'r2');assert.equal(calls[2].body.kind,'create');c.close();
});
test('unknown or waiting permission states never become completion; actual cancellation delegates to exact handle',async()=>{
 let emit,cancelled=0;const {c}=setup({execute:async(ctx,options)=>{emit=options.onStatus;return {dispose(){},cancel:async()=>{cancelled++;return {accepted:true};},completion:new Promise(()=>{})};}});
 await c.bootstrap();await c.runCurrentPlan();emit({phase:'waiting-user',terminal:false,summary:'需要确认'});assert.equal(c.getSnapshot().execution.phase,'waiting');
 await c.cancelExecution();assert.equal(cancelled,1);assert.equal(c.getSnapshot().execution.phase,'waiting');
 emit({phase:'completed',terminal:true,summary:'实际结果'});assert.equal(c.getSnapshot().execution.summary,'实际结果');assert.equal(c.getSnapshot().busy,null);c.close();
});
test('repeated server claim is observe-only and never receives acquired permission',async()=>{
 let acquired;const {c}=setup({routes:{'execution-claim':async body=>({ok:true,json:async()=>({claim:'existing',attempt:{...body,attemptId:'a1',requestId:'q1',status:'submitting',sessionId:'s1',provenance:'local',prompt:'same'}})})},execute:async(ctx,options)=>{acquired=options.acquired;return {dispose(){},completion:new Promise(()=>{})};}});
 await c.bootstrap();await c.runCurrentPlan();assert.equal(acquired,false);c.close();
});
test('misassociated execution claim cannot reach the Host adapter',async()=>{
 let executed=0;const {c}=setup({routes:{'execution-claim':async body=>({ok:true,json:async()=>({claim:'acquired',attempt:{...body,workspaceId:'other',attemptId:'a1',requestId:'q1'}})})},execute:async()=>{executed++;}});
 await c.bootstrap();assert.equal(await c.runCurrentPlan(),false);assert.equal(executed,0);assert.match(c.getSnapshot().error,/不一致/);c.close();
});

test('created preparation resumes only on explicit continue and obtains an atomic grant for the same identity',async()=>{
 let executions=0,canonical;
 const {c,calls}=setup({routes:{
  'execution-record':async row=>({ok:true,json:async()=>({saved:true,attempt:canonical={...row,provenance:'local',prompt:'canonical'}})}),
  'execution-submit-claim':async row=>({ok:true,json:async()=>({claim:'acquired',attempt:{...canonical,...row,status:'submitting'}})}),
 },execute:async(ctx,options)=>{
  executions++;
  if(executions===1){await options.record({...options.attempt,status:'created',sessionId:'s1'});options.onStatus({phase:'blocked',canContinue:true,sessionId:'s1',summary:'挂载暂未就绪'});}
  else {assert.equal(options.acquired,false);assert.equal(options.allowSubmit,true);assert.equal(options.attempt.sessionId,'s1');const {prompt,provenance,status,...row}=options.attempt;const grant=await options.claimSubmission(row);assert.equal(grant.claim,'acquired');options.onStatus({phase:'submitted',sessionId:'s1',summary:'已接受'});}
  return {dispose(){},completion:new Promise(()=>{})};
 }});
 await c.bootstrap();await c.runCurrentPlan();assert.equal(c.getSnapshot().busy,null);assert.equal(c.getSnapshot().execution.canContinue,true);
 assert.equal(await c.continueExecution(),true);
 assert.equal(calls.filter(call=>call.path==='execution-claim').length,1);assert.equal(calls.filter(call=>call.path==='execution-submit-claim').length,1);c.close();
});

test('automatic reopening of a created execution remains read-only until explicit continuation',async()=>{
 const attempt={taskId:'t1',revisionId:'r1',kind:'use',workspaceId:'w1',attemptId:'a1',requestId:'q1',sessionId:'s1',status:'created',provenance:'local',prompt:'canonical'};
 let seen;const {c,calls}=setup({initial:workflow('r1',{executions:[attempt]}),execute:async(ctx,options)=>{seen=options;options.onStatus({phase:'ready',canContinue:true,summary:'尚未发送'});return {dispose(){},completion:new Promise(()=>{})};}});
 await c.bootstrap();c.showFind();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(seen.acquired,false);assert.equal(seen.allowSubmit,false);assert.equal(calls.filter(call=>call.path==='execution-submit-claim').length,0);c.close();
});

test('close disposes an early execution handle before aborting a still-pending submission wait',async()=>{
 let disposed=false,cancelled=0,started;
 const startedPromise=new Promise(resolve=>{started=resolve;});
 const {c}=setup({execute:async(ctx,options)=>{
  const handle={dispose(){disposed=true;},completion:new Promise(()=>{})};options.onHandle(handle);started();
  await new Promise(resolve=>options.signal.addEventListener('abort',()=>{if(!disposed)cancelled++;resolve();},{once:true}));return handle;
 }});
 await c.bootstrap();const running=c.runCurrentPlan();await startedPromise;c.close();await running;
 assert.equal(disposed,true);assert.equal(cancelled,0);
});

test('stopping a created preparation sends its exact saved identity to the atomic cancellation route',async()=>{
 const attempt={taskId:'t1',revisionId:'r1',kind:'use',workspaceId:'w1',attemptId:'a1',requestId:'q1',sessionId:'s1',status:'created',provenance:'local',prompt:'canonical'};
 const {prompt,provenance,status,...row}=attempt;
 const {c,calls}=setup({routes:{
  'execution-claim':async()=>({ok:true,json:async()=>({claim:'existing',attempt})}),
  'execution-cancel-claim':async body=>({ok:true,json:async()=>({claim:'acquired',attempt:{...attempt,...body,status:'cancelled'}})}),
 },execute:async(ctx,options)=>{
  const handle={dispose(){},completion:new Promise(()=>{}),async cancel(){const value=await options.claimCancellation(row);assert.equal(value.attempt.status,'cancelled');options.onStatus({phase:'cancelled',terminal:true,summary:'尚未发送，已停止'});return{confirmed:true};}};
  options.onHandle(handle);options.onStatus({phase:'preparing',sessionId:'s1',summary:'准备执行'});return handle;
 }});
 try{await c.bootstrap();await c.runCurrentPlan();assert.equal((await c.cancelExecution()).confirmed,true);
  assert.deepEqual(calls.find(call=>call.path==='execution-cancel-claim').body,row);assert.equal(c.getSnapshot().execution.phase,'cancelled');assert.equal(c.getSnapshot().busy,null);
 }finally{c.close();}
});

test('plugin preparation uses its exact session and operation cancellation signal without a submit timeout',async()=>{
 let checked=false;
 const {c,calls}=setup({routes:{'execution-prepare':async row=>({ok:true,json:async()=>({ready:true,attempt:{...row,status:'created',provenance:'local'}})})},execute:async(_ctx,options)=>{
  const row={attemptId:options.attempt.attemptId,requestId:options.attempt.requestId,taskId:'t1',revisionId:'r1',kind:'use',workspaceId:'w1',sessionId:'s1'};
  const local=new AbortController();const result=await options.prepareExecution(row,local.signal);
  assert.equal(result.ready,true);assert.equal(result.attempt.sessionId,'s1');checked=true;
  return{dispose(){},completion:new Promise(()=>{})};
 }});
 await c.bootstrap();await c.runCurrentPlan();assert.equal(checked,true);const prepare=calls.find(x=>x.path==='execution-prepare');assert.equal(prepare.body.workspaceId,'w1');assert.equal(prepare.body.sessionId,'s1');assert.ok(!Object.hasOwn(prepare.body,'spec'));c.close();
});
