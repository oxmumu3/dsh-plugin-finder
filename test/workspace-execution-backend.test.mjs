import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {registerFinderRoutes} from '../src/routes.js';

const copy=value=>structuredClone(value);
const request='整理当前工作区的研究资料，原文只读，不上传。';
const intent={goal:'整理本地研究资料',input:'当前工作区 Markdown',output:'研究资料目录',constraints:['原文只读','不上传'],capabilities:['本地检索'],queries:['local markdown search']};
const plugin={id:'library',name:'Library',capabilities:['本地检索'],install:{spec:'library@1.0.0',version:'1.0.0'}};
const plan={kind:'single',title:'本地研究目录',rationale:'候选声明支持，待实际运行',pluginIds:['library'],steps:[{capability:'本地检索',owner:'library',sourceCapability:'本地检索',action:'读取研究资料并整理目录',input:'Markdown',output:'研究目录'}],limits:['需核对安装状态']};
const generated={strategy:'new',reuseAssessment:'用户选择创建自己的插件',candidateDecisions:[],questions:[],assumptions:[],blueprint:{name:'研究目录',purpose:'整理本地资料',workflow:'选择目录后检索',inputs:'Markdown',outputs:'资料目录',ui:'侧栏列表',data:'原文只读',tools:'本地文件读取',runtime:'宿主模型',scope:'当前工作区',acceptance:'两份合成文件能够检索且未修改'}};
function persistence(){const rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null};const control={rows,failWrite:false,writes:0};return{control,store:{read:async id=>copy(rows.get(id)),write:async row=>{if(control.failWrite)throw Error('private storage error');await Promise.resolve();control.writes++;rows.set(row.id,copy(row));},list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>{pointer=copy(value);}}};}
function fixture({persist=persistence(),gap=false,runtimeContext}={}){
  const calls=[];
  const service=createFinderService({historyStore:persist.store,hostVersion:'0.2.1-rc.2',runtimeContext,preparePlugins:async({candidates})=>({status:'ready',plugins:candidates.map(c=>({candidateId:c.id,packageName:c.id,spec:c.install.spec,version:c.install.version,requestId:'install-'+c.id,status:'ready',installed:true,enabled:true,active:true,application:'applied'}))}),discovery:{search:async()=>({candidates:[plugin],sources:[{id:'test',status:'live'}],searchedAt:'2026-10-23T00:00:00Z'})},model:{status:()=>({configured:true}),call:async args=>{calls.push(args);return{text:JSON.stringify(args.system.includes('CREATION_CONFIRM_SCHEMA')?{intent,blueprint:args.data.creation.blueprint}:args.system.includes('CREATION_SCHEMA')?generated:args.system.includes('仅允许 {"kind"')?gap?{...plan,kind:'gap',pluginIds:[],steps:[]}:plan:intent),model:{label:'test'}};}}});
  return{service,persist,calls};
}
const ids=workflow=>({taskId:workflow.taskId,revisionId:workflow.revisionId});
const input=(workflow,kind='use')=>({...ids(workflow),kind,workspaceId:'workspace-a'});
const record=(attempt,status,extra={})=>({taskId:attempt.taskId,revisionId:attempt.revisionId,attemptId:attempt.attemptId,requestId:attempt.requestId,kind:attempt.kind,workspaceId:attempt.workspaceId,status,...extra});
const submission=(attempt,extra={})=>({...record(attempt,undefined),sessionId:attempt.sessionId,...extra});
async function planned(f,userRequest=request){const a=await f.service.analyze({request:userRequest});return f.service.recommend({...ids(a.workflow),intent:a.intent});}
async function ready(f){const p=await planned(f),started=await f.service.creationStart({...ids(p.workflow),trigger:'user-customization'});return f.service.creationUpdate({...ids(started.workflow),confirm:true});}
const prepare=(f,attempt)=>f.service.executionPrepare(submission(attempt,{sessionId:attempt.sessionId||'session-a'}));
async function claimed(f,workflow,kind='use'){return(await f.service.executionClaim(input(workflow,kind))).attempt;}

test('concurrent claims across service instances allocate one durable attempt and one immutable request',async()=>{
  const f=fixture(),p=await planned(f),other=fixture({persist:f.persist});
  const results=await Promise.all(Array.from({length:10},(_,i)=>(i%2?other:f).service.executionClaim(input(p.workflow))));
  assert.equal(results.filter(result=>result.claim==='acquired').length,1);
  assert.equal(new Set(results.map(result=>result.attempt.attemptId)).size,1);
  assert.equal(new Set(results.map(result=>result.attempt.requestId)).size,1);
  assert.equal(results[0].attempt.status,'claimed');assert.equal(results[0].attempt.sessionId,null);
  const restarted=fixture({persist:f.persist}),repeated=await restarted.service.executionClaim(input(p.workflow));
  assert.equal(repeated.claim,'existing');assert.deepEqual(repeated.attempt,results[0].attempt);
  assert.equal((await restarted.service.bootstrap()).workflow.executions.length,1);
  assert.equal(restarted.calls.length,0);
});

test('server binds execution prompt to the source request and ignores client prompt or request id',async()=>{
  const f=fixture(),p=await planned(f),result=await f.service.executionClaim({...input(p.workflow),prompt:'FORGED_PROMPT',requestId:'FORGED_REQUEST',attemptId:'FORGED_ATTEMPT'});
  assert.ok(result.attempt.prompt.includes(request));assert.ok(result.attempt.prompt.includes('原文只读'));assert.ok(result.attempt.prompt.includes('library@1.0.0'));
  assert.match(result.attempt.prompt,/现在按方案使用、配置或组合现有能力/);
  assert.ok(!result.attempt.prompt.includes('nextPrompt'));assert.ok(!result.attempt.prompt.includes('以上是插件推荐方案，尚未执行'));
  assert.ok(!result.attempt.prompt.includes('FORGED_PROMPT'));assert.notEqual(result.attempt.requestId,'FORGED_REQUEST');assert.notEqual(result.attempt.attemptId,'FORGED_ATTEMPT');
  assert.equal((await f.service.exportTask({taskId:p.workflow.taskId})).version,2);
});

test('use execution exposes the existing local-file preview channel without claiming rendered results',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow);
  assert.match(attempt.prompt,/核对[^。]*本地文件[^。]*绝对路径[^。]*Markdown 链接/);
  assert.match(attempt.prompt,/不使用 file:\/\//);
  assert.match(attempt.prompt,/本页[^。]*原生文档预览/);
  assert.match(attempt.prompt,/不得仅为打开文件[^。]*ASAR[^。]*UI API/);
  assert.match(attempt.prompt,/没有实际观察[^。]*不得声称[^。]*渲染/);
  assert.equal(JSON.parse(attempt.prompt.slice(attempt.prompt.indexOf('\n\n{')+2)).originalRequest,request);
});

test('getting started execution preserves the actual request instead of treating the suggested plan as a full audit mandate',async()=>{
 const userRequest='我想了解这个插件怎样开始使用，尚未选定材料。',f=fixture(),p=await planned(f,userRequest),attempt=await claimed(f,p.workflow);
 const data=JSON.parse(attempt.prompt.slice(attempt.prompt.indexOf('\n\n{')+2));
 assert.equal(data.originalRequest,userRequest);assert.deepEqual(data.plan.steps,plan.steps);
 assert.match(attempt.prompt,/用户原始需求[^。]*优先于[^。]*模型[^。]*验收/);
 assert.match(attempt.prompt,/开始使用[^。]*必要配置[^。]*最小可用入口/);
 assert.match(attempt.prompt,/不能假设[^。]*文件/);
 assert.match(attempt.prompt,/不得[^。]*\/tmp[^。]*旧验收日志/);
 assert.match(attempt.prompt,/实际[^。]*阻碍[^。]*当前任务[^。]*必要/);
 assert.match(attempt.prompt,/已安装启用[^。]*实际任务验证[^。]*先使用/);
 assert.match(attempt.prompt,/状态接口不可用[^。]*边界[^。]*实际任务结果/);
});

test('new execution uses only server runtime context and preserves that snapshot when resumed',async()=>{
  const reads=[];
  const f=fixture({runtimeContext:async args=>{reads.push(args);return{status:'available',profile:{name:'isolated-web',dir:'/tmp/finder-isolated/profiles/web',dshHome:'/tmp/finder-isolated',credentials:'SECRET_PROFILE'},pluginScope:'selected',matching:'exact-package',api:{service:'pluginManager',readMethods:['listBundles','listPlugins','SECRET_METHOD'],token:'SECRET_API'},pluginsComplete:true,plugins:[{name:'library',version:'1.0.0',installed:true,enabled:true,availability:'installed',source:'https://user:SECRET_SOURCE@example.org/library?token=SECRET_QUERY',token:'SECRET_PLUGIN'}],credentials:'SECRET_RUNTIME',launchUrl:'SECRET_LAUNCH',notes:['SECRET_NOTE']};}});
  const p=await planned(f),result=await f.service.executionClaim({...input(p.workflow),runtimeContext:{profile:{name:'FORGED_DESKTOP'}},trustedRuntime:{status:'available'}});
  const data=JSON.parse(result.attempt.prompt.slice(result.attempt.prompt.indexOf('\n\n{')+2));
  assert.equal(reads.length,1);assert.deepEqual(reads[0].pluginIds,['library']);assert.equal(reads[0].selectedPlugins[0].install.spec,'library@1.0.0');
  assert.deepEqual(data.trustedRuntime.profile,{name:'isolated-web',dir:'/tmp/finder-isolated/profiles/web',dshHome:'/tmp/finder-isolated'});
  assert.equal(data.trustedRuntime.plugins[0].installed,true);assert.equal(data.trustedRuntime.plugins[0].enabled,true);
  assert.equal(data.trustedRuntime.pluginScope,'selected');assert.equal(data.trustedRuntime.matching,'exact-package');assert.deepEqual(data.trustedRuntime.api,{service:'pluginManager',readMethods:['listBundles','listPlugins']});assert.equal(data.trustedRuntime.plugins[0].source,'https://example.org/library');
  assert.doesNotMatch(result.attempt.prompt,/SECRET_|FORGED_DESKTOP/);
  const reopened=fixture({persist:f.persist,runtimeContext:async()=>{throw Error('must not refresh saved execution');}});
  const repeated=await reopened.service.executionClaim(input(p.workflow));
  assert.equal(repeated.claim,'existing');assert.equal(repeated.attempt.prompt,result.attempt.prompt);
});

test('unavailable runtime remains unknown and cannot expose provider errors or infer another profile',async()=>{
  for(const runtimeContext of [undefined,async()=>{throw Error('SECRET_PROVIDER');}]){
    const f=fixture({runtimeContext}),p=await planned(f),attempt=await claimed(f,p.workflow);
    const data=JSON.parse(attempt.prompt.slice(attempt.prompt.indexOf('\n\n{')+2));
    assert.equal(data.trustedRuntime.status,'unknown');assert.equal(data.trustedRuntime.profile,null);
    assert.equal(data.trustedRuntime.pluginsComplete,false);assert.deepEqual(data.trustedRuntime.plugins,[]);
    assert.doesNotMatch(attempt.prompt,/SECRET_PROVIDER/);assert.match(attempt.prompt,/不得猜测[^。]*desktop/);
  }
});

test('cancelled runtime lookup cannot persist an execution attempt',async()=>{
  const abort=new AbortController(),f=fixture({runtimeContext:async()=>{abort.abort();return{status:'unknown'};}}),p=await planned(f),writes=f.persist.control.writes;
  await assert.rejects(f.service.executionClaim({...input(p.workflow),signal:abort.signal}),error=>error.code==='MODEL_ABORTED');
  assert.equal(f.persist.control.writes,writes);assert.equal((await f.service.bootstrap()).workflow.executions.length,0);
});

test('ready creation gets execution evidence without legacy unsent draft handoff instruction',async()=>{
  const f=fixture(),p=await ready(f),attempt=await claimed(f,p.workflow,'create');
  assert.equal(attempt.kind,'create');assert.match(attempt.prompt,/现在开始创建用户自己的插件/);
  assert.match(attempt.prompt,/官方开发 Skill/);assert.ok(attempt.prompt.includes(generated.blueprint.acceptance));
  assert.ok(!attempt.prompt.includes('Finder 仅准备未发送草稿'));assert.ok(!attempt.prompt.includes('不代表我已授权发送'));
  assert.equal(JSON.parse(attempt.prompt.slice(attempt.prompt.indexOf('\n\n{')+2)).trustedRuntime.status,'unknown');
  assert.doesNotMatch(attempt.prompt,/用户只是了解用途并开始使用/);
  assert.equal(p.workflow.creation.status,'ready');assert.equal(p.workflow.creation.supply.status,'current');
});

test('claim requires the exact active valid source revision and current ready creation',async()=>{
  const f=fixture(),a=await f.service.analyze({request});
  await assert.rejects(f.service.executionClaim(input(a.workflow)),error=>error.code==='INVALID_INPUT');
  const p=await f.service.recommend({...ids(a.workflow),intent:a.intent});
  await assert.rejects(f.service.executionClaim(input(p.workflow,'create')),error=>error.code==='CREATION_NOT_READY');
  const started=await f.service.creationStart({...ids(p.workflow),trigger:'user-customization'});
  await assert.rejects(f.service.executionClaim(input(started.workflow,'create')),error=>error.code==='CREATION_NOT_READY');
  await assert.rejects(f.service.executionClaim(input(p.workflow)),error=>error.code==='STALE_WORKFLOW');
  await assert.rejects(f.service.executionClaim({kind:'use',workspaceId:'workspace-a'}),error=>error.code==='STALE_WORKFLOW');
  const g=fixture({gap:true}),gap=await planned(g);await assert.rejects(g.service.executionClaim(input(gap.workflow)),error=>error.code==='INVALID_INPUT');
  assert.equal((await f.service.bootstrap()).workflow.executions.length,0);
});

test('records advance one persisted session through send stages and duplicate acknowledgements do not write',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow);
  await assert.rejects(f.service.executionRecord(record(attempt,'submitting',{sessionId:'session-a'})),error=>error.code==='EXECUTION_ATTEMPT_CONFLICT');
  const created=await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}));assert.equal(created.attempt.sessionId,'session-a');
  await assert.rejects(f.service.executionRecord(record(attempt,'submitted')),error=>error.code==='EXECUTION_ATTEMPT_CONFLICT');
  await prepare(f,attempt);
  await f.service.executionRecord(record(attempt,'submitting'));
  const submitted=await f.service.executionRecord(record(attempt,'submitted')),writes=f.persist.control.writes;
  assert.equal(submitted.attempt.status,'submitted');
  assert.deepEqual((await f.service.executionRecord(record(attempt,'submitted'))).attempt,submitted.attempt);
  assert.deepEqual((await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}))).attempt,submitted.attempt);
  assert.equal(f.persist.control.writes,writes);
  assert.equal((await fixture({persist:f.persist}).service.bootstrap()).workflow.executions[0].sessionId,'session-a');
});

test('created but unsent execution grants first submission to one concurrent caller and keeps the original session and request',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow);
  const created=(await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}))).attempt;
  // The original UI failed to mount here. A later explicit resume must be able
  // to submit once without creating a second session or a new request id.
  await prepare(f,created);
  const reopened=fixture({persist:f.persist});
  const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?reopened:f).service.executionSubmitClaim(submission(created))));
  assert.equal(results.filter(result=>result.claim==='acquired').length,1);
  for(const result of results){assert.equal(result.attempt.status,'submitting');assert.equal(result.attempt.attemptId,attempt.attemptId);assert.equal(result.attempt.requestId,attempt.requestId);assert.equal(result.attempt.sessionId,'session-a');assert.ok(result.attempt.prompt.startsWith(attempt.prompt));assert.match(result.attempt.prompt,/已核实的插件安装回执/);}
  const writes=f.persist.control.writes;
  const resumed=await fixture({persist:f.persist}).service.executionSubmitClaim(submission(created));
  assert.equal(resumed.claim,'existing');assert.equal(resumed.attempt.status,'submitting');assert.equal(f.persist.control.writes,writes);
});

test('stopping a created execution grants one durable cancellation and never leaves it ready to submit',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow),created=(await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}))).attempt,other=fixture({persist:f.persist});
  const results=await Promise.all(Array.from({length:12},(_,i)=>(i%2?other:f).service.executionCancelClaim(submission(created))));
  assert.equal(results.filter(result=>result.claim==='acquired').length,1);
  for(const result of results){assert.equal(result.attempt.status,'cancelled');assert.equal(result.attempt.sessionId,'session-a');assert.equal(result.attempt.requestId,attempt.requestId);}
  const reopened=fixture({persist:f.persist}),writes=f.persist.control.writes;
  assert.equal((await reopened.service.executionSubmitClaim(submission(created))).claim,'existing');
  assert.equal((await reopened.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}))).attempt.status,'cancelled');
  assert.equal((await reopened.service.bootstrap()).workflow.executions[0].status,'cancelled');assert.equal(f.persist.control.writes,writes);
});

test('cancel and first submission compete in the same queue and cannot both acquire authority',async()=>{
  for(const first of ['executionCancelClaim','executionSubmitClaim']){
    const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow),created=(await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}))).attempt,other=fixture({persist:f.persist}),second=first==='executionCancelClaim'?'executionSubmitClaim':'executionCancelClaim';
    await prepare(f,created);
    const [winner,loser]=await Promise.all([f.service[first](submission(created)),other.service[second](submission(created))]);
    assert.equal(winner.claim,'acquired');assert.equal(loser.claim,'existing');
    const expected=first==='executionCancelClaim'?'cancelled':'submitting';
    assert.equal(winner.attempt.status,expected);assert.equal(loser.attempt.status,expected);
    assert.equal((await f.service.bootstrap()).workflow.executions[0].status,expected);
  }
});

test('submission and cancellation claims reject forged identities, missing session, and imported authority',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow);
  for(const method of ['executionSubmitClaim','executionCancelClaim'])await assert.rejects(f.service[method](submission(attempt,{sessionId:'session-a'})),error=>error.code==='EXECUTION_ATTEMPT_CONFLICT');
  const created=(await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}))).attempt,before=copy([...f.persist.control.rows.values()]);
  for(const method of ['executionSubmitClaim','executionCancelClaim'])for(const changed of [{attemptId:'forged'},{requestId:'forged'},{revisionId:'forged'},{workspaceId:'different'},{kind:'create'},{sessionId:'session-b'},{sessionId:null},{sessionId:undefined}])await assert.rejects(f.service[method](submission(created,changed)),error=>error.code==='EXECUTION_ATTEMPT_CONFLICT');
  assert.deepEqual([...f.persist.control.rows.values()],before);
  const imported=fixture();await imported.service.importBackup({workflow:await f.service.exportTask({taskId:p.workflow.taskId})});
  for(const method of ['executionSubmitClaim','executionCancelClaim'])await assert.rejects(imported.service[method](submission(created)),error=>error.code==='EXECUTION_ATTEMPT_CONFLICT');
});

test('submission claims never reopen unknown sends or terminal executions, including legacy records',async()=>{
  for(const end of ['submitting','submitted','failed','cancelled']){
    const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow),created=(await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}))).attempt;
    await prepare(f,attempt);
    await f.service.executionRecord(record(attempt,'submitting',{message:'回执尚未确认'}));
    if(end!=='submitting')await f.service.executionRecord(record(attempt,end));
    // Pre-upgrade executions have no preparation receipt and must remain observable.
    const stored=f.persist.control.rows.get(attempt.taskId),legacy=JSON.parse(stored.serialized);delete legacy.executions[0].preparation;stored.serialized=JSON.stringify(legacy);
    const writes=f.persist.control.writes;
    for(const method of ['executionSubmitClaim','executionCancelClaim']){const result=await f.service[method](submission(created));assert.equal(result.claim,'existing');assert.equal(result.attempt.status,end);assert.equal(result.attempt.requestId,attempt.requestId);assert.equal(f.persist.control.writes,writes);}
  }
});

test('submission must persist before granting authority and never changes the active task pointer',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow),created=(await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}))).attempt;
  await prepare(f,created);
  f.persist.control.failWrite=true;
  await assert.rejects(f.service.executionSubmitClaim(submission(created)),error=>error.code==='HISTORY_STORAGE_FAILED');
  f.persist.control.failWrite=false;assert.equal((await f.service.bootstrap()).workflow.executions[0].status,'created');
  await f.service.reset(ids(p.workflow));const other=await f.service.analyze({request:'另外一项任务'});
  const granted=await f.service.executionSubmitClaim(submission(created));
  assert.equal(granted.claim,'acquired');assert.equal(granted.workflow.taskId,other.workflow.taskId);assert.equal(granted.attempt.taskId,p.workflow.taskId);
  assert.equal((await f.service.bootstrap()).workflow.taskId,other.workflow.taskId);
});

test('cancellation persists before confirmation and leaves newer active work untouched',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow),created=(await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}))).attempt;
  f.persist.control.failWrite=true;
  await assert.rejects(f.service.executionCancelClaim(submission(created)),error=>error.code==='HISTORY_STORAGE_FAILED');
  f.persist.control.failWrite=false;assert.equal((await f.service.bootstrap()).workflow.executions[0].status,'created');
  await f.service.reset(ids(p.workflow));const other=await f.service.analyze({request:'另外一项任务'});
  const result=await f.service.executionCancelClaim(submission(created));
  assert.equal(result.claim,'acquired');assert.equal(result.attempt.status,'cancelled');assert.equal(result.workflow.taskId,other.workflow.taskId);
  assert.equal((await f.service.bootstrap()).workflow.taskId,other.workflow.taskId);
});

test('forged request, source, workspace, kind and replacement session never mutate an execution',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow);await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}));
  const before=copy([...f.persist.control.rows.values()]);
  for(const changed of [{attemptId:'forged'},{requestId:'forged'},{revisionId:'forged'},{workspaceId:'different'},{kind:'create'},{sessionId:'session-b'},{sessionId:null}])await assert.rejects(f.service.executionRecord(record(attempt,'submitting',changed)),error=>error.code==='EXECUTION_ATTEMPT_CONFLICT');
  assert.deepEqual([...f.persist.control.rows.values()],before);
});

test('late local execution results retain the exact original association without changing current work',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow);await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}));
  await f.service.reset(ids(p.workflow));const other=await f.service.analyze({request:'另一项需求'});
  await prepare(f,attempt);
  const recorded=await f.service.executionRecord(record(attempt,'submitting'));
  assert.equal(recorded.workflow.taskId,other.workflow.taskId);assert.equal(recorded.attempt.taskId,p.workflow.taskId);
  assert.equal((await f.service.bootstrap()).workflow.taskId,other.workflow.taskId);
  const old=await f.service.open(ids(p.workflow));assert.equal(old.workflow.executions[0].status,'submitting');assert.equal(old.workflow.executions[0].sessionId,'session-a');
});

test('unknown submission, failure and cancellation never reopen claim authority',async()=>{
  for(const end of ['submitting','failed','cancelled']){
    const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow);await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}));
    await prepare(f,attempt);
    await f.service.executionRecord(record(attempt,'submitting',{message:'回执尚未确认'}));
    if(end!=='submitting')await f.service.executionRecord(record(attempt,end));
    const repeated=await f.service.executionClaim(input(p.workflow));assert.equal(repeated.claim,'existing');assert.equal(repeated.attempt.status,end);assert.equal(repeated.attempt.requestId,attempt.requestId);
    if(end!=='submitting')assert.equal((await f.service.executionRecord(record(attempt,'submitted'))).attempt.status,end);
  }
});

test('failed claim storage cannot grant authority and failed records preserve last acknowledged stage',async()=>{
  const f=fixture(),p=await planned(f);f.persist.control.failWrite=true;
  await assert.rejects(f.service.executionClaim(input(p.workflow)),error=>error.code==='HISTORY_STORAGE_FAILED');f.persist.control.failWrite=false;
  assert.equal((await f.service.bootstrap()).workflow.executions.length,0);
  const attempt=await claimed(f,p.workflow);f.persist.control.failWrite=true;
  await assert.rejects(f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'})),error=>error.code==='HISTORY_STORAGE_FAILED');f.persist.control.failWrite=false;
  assert.equal((await f.service.executionClaim(input(p.workflow))).attempt.status,'claimed');
});

test('cancellation in another tab preserves late created session without regaining submission authority',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow),other=fixture({persist:f.persist});
  await other.service.executionRecord(record(attempt,'cancelled'));
  const late=await f.service.executionRecord(record(attempt,'created',{sessionId:'late-created-session'}));
  assert.equal(late.attempt.status,'cancelled');assert.equal(late.attempt.sessionId,'late-created-session');
  assert.equal((await f.service.executionClaim(input(p.workflow))).claim,'existing');
  assert.equal((await f.service.executionRecord(record(attempt,'submitting'))).attempt.status,'cancelled');
  await assert.rejects(f.service.executionRecord(record(attempt,'created',{sessionId:'second-session'})),error=>error.code==='EXECUTION_ATTEMPT_CONFLICT');
  assert.equal((await fixture({persist:f.persist}).service.bootstrap()).workflow.executions[0].sessionId,'late-created-session');
});

test('backup roundtrip preserves execution data but never imports local execution authority',async()=>{
  const f=fixture(),p=await planned(f),attempt=await claimed(f,p.workflow);await f.service.executionRecord(record(attempt,'created',{sessionId:'session-a'}));
  const bundle=await f.service.exportTask({taskId:p.workflow.taskId}),g=fixture();
  await g.service.importBackup({workflow:bundle});assert.equal((await g.service.importBackup({workflow:bundle})).duplicate,true);
  await g.service.open(ids(p.workflow));const claim=await g.service.executionClaim(input(p.workflow));
  assert.equal(claim.claim,'existing');assert.equal(claim.attempt.provenance,'imported');assert.equal(claim.attempt.prompt,attempt.prompt);
  await assert.rejects(g.service.executionRecord(record(attempt,'submitting')),error=>error.code==='EXECUTION_ATTEMPT_CONFLICT');
  const exported=await g.service.exportTask({taskId:p.workflow.taskId});assert.equal(exported.task.executions[0].sessionId,'session-a');assert.equal(g.calls.length,0);
});

test('backup rejects duplicate execution request ids or impossible session and source identities',async()=>{
  const f=fixture(),p=await planned(f);await claimed(f,p.workflow);const bundle=await f.service.exportTask({taskId:p.workflow.taskId});
  const corruptions=[task=>task.executions.push({...task.executions[0],attemptId:'other',workspaceId:'workspace-b'}),task=>{task.executions[0].status='submitted';},task=>{task.executions[0].contentHash='0'.repeat(64);},task=>{task.format=1;},task=>{task.executions[0].revisionId='missing';}];
  for(const corrupt of corruptions){const bad=copy(bundle);corrupt(bad.task);await assert.rejects(fixture().service.importBackup({workflow:bad}),error=>error.code==='INVALID_BACKUP');}
});

test('execution routes pass exact identities with authentication-owned paths and safe conflict messages',async()=>{
  const f=fixture(),p=await planned(f),routes=[];
  registerFinderRoutes({get:()=>({fetch:{register:route=>{routes.push(route);return()=>{};}}}),effect:()=>{}},f.service);
  const post=async(endpoint,body)=>routes.find(route=>route.path.endsWith('/'+endpoint)).fetch(new Request('http://local/api/plugin_finder/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  const response=await post('execution-claim',input(p.workflow));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const {attempt}=await response.json();const conflict=await post('execution-record',record(attempt,'created',{requestId:'forged',sessionId:'session-a'}));assert.equal(conflict.status,409);
  const body=await conflict.json();assert.equal(body.error.code,'EXECUTION_ATTEMPT_CONFLICT');assert.match(body.error.message,/执行/);
  const created=await(await post('execution-record',record(attempt,'created',{sessionId:'session-a'}))).json();
  const preparationResponse=await post('execution-prepare',submission(created.attempt));assert.equal(preparationResponse.status,200);assert.equal((await preparationResponse.json()).ready,true);
  const submissionResponse=await post('execution-submit-claim',submission(created.attempt));assert.equal(submissionResponse.status,200);assert.equal(submissionResponse.headers.get('cache-control'),'no-store');
  const granted=await submissionResponse.json();assert.equal(granted.claim,'acquired');assert.equal(granted.attempt.sessionId,'session-a');
  assert.equal((await(await post('execution-submit-claim',submission(created.attempt))).json()).claim,'existing');
  const cancelResponse=await post('execution-cancel-claim',submission(created.attempt));assert.equal(cancelResponse.status,200);assert.equal(cancelResponse.headers.get('cache-control'),'no-store');
  const alreadySubmitting=await cancelResponse.json();assert.equal(alreadySubmitting.claim,'existing');assert.equal(alreadySubmitting.attempt.status,'submitting');
  const second=await(await post('execution-claim',{...input(p.workflow),workspaceId:'workspace-b'})).json();
  const secondCreated=await(await post('execution-record',record(second.attempt,'created',{sessionId:'session-b'}))).json();
  const cancelled=await(await post('execution-cancel-claim',submission(secondCreated.attempt))).json();assert.equal(cancelled.claim,'acquired');assert.equal(cancelled.attempt.status,'cancelled');
});
