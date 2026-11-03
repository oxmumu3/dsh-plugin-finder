import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlan} from '../src/contracts.js';
import {validateWorkflow} from '../src/history.js';
import {createFinderService} from '../src/service.js';
import {createAgentFinderService} from '../src/agent-finder-service.js';
import {buildCreatorPrompt} from '../src/agent-creator.js';

const copy=structuredClone;
const intent={goal:'保留看板，增加本工作区的审计计数',input:'当前工作区',output:'看板和审计计数',constraints:[],capabilities:['读取看板','持久审计计数'],queries:['kanban','audit counter']};
const candidate={id:'board',name:'board',capabilities:['读取看板'],install:{type:'npm',spec:'board@1.0.0',version:'1.0.0'},evidence:{metadata:'manifest-checked'}};
const plan={kind:'hybrid',title:'看板加审计计数',rationale:'保留作者看板，仅补审计计数工具',pluginIds:['board'],gaps:[{capability:'持久审计计数',reason:'已查范围未确认具备本工作区的持久计数接口'}],steps:[{capability:'读取看板',owner:'board',sourceCapability:'读取看板',action:'读取原看板',input:'工作区',output:'当前卡片'},{capability:'持久审计计数',owner:'create',sourceCapability:null,action:'只增加审计计数',input:'当前卡片',output:'本工作区审计记录'}],limits:['公开声明不等于运行验收']};
const receipt=(status='ready')=>({candidateId:'board',packageName:'board',spec:'board@1.0.0',version:'1.0.0',requestId:'install-board',status,installed:true,enabled:status==='ready',active:status==='ready',application:'applied'});
const blueprint=Object.fromEntries(['name','purpose','workflow','inputs','outputs','ui','data','tools','runtime','scope','acceptance'].map(key=>[key,'只补工作区审计计数 '+key]));
const caller={sessionId:'session-a',workspaceId:'workspace-a',directory:'/workspace/a'};
const authorization={authorize:async()=>true};
function fixture(options={}){
 const rows=options.rows??new Map(),events=[],calls=[];
 const model={status:()=>({configured:true}),call:async args=>{calls.push(args);if(args.system.includes('本阶段只抽取'))return{text:JSON.stringify(intent)};if(args.system.includes('CREATION_CONFIRM_SCHEMA'))return{text:JSON.stringify({intent:options.shrinkConfirmation?{...intent,goal:'只造计数',input:'计数值',output:'计数',capabilities:['持久审计计数']}:intent,blueprint:args.data.creation.blueprint})};if(args.data.trigger)return{text:JSON.stringify({strategy:'extend',reuseAssessment:'保留看板，仅补计数',candidateDecisions:[{pluginId:'board',decision:'reuse',reason:'读取看板'}],questions:[],assumptions:[],blueprint})};return{text:JSON.stringify(plan)};}};
 const historyData={rows:new Map(),pointer:{activeTaskId:null,activeRevisionId:null}};
 const historyStore={read:async id=>copy(historyData.rows.get(id)),write:async row=>historyData.rows.set(row.id,copy(row)),list:async()=>copy([...historyData.rows.values()]),readPointer:async()=>copy(historyData.pointer),writePointer:async pointer=>{historyData.pointer=copy(pointer);}};
 const coreOptions={model,discovery:{search:async()=>({candidates:[candidate],sources:[{id:'fixture',status:'live'}],searchedAt:'2026-11-03T10:00:00Z'})},hostVersion:'0.2.1-rc.5'};
 const preparePlugins=async args=>{events.push(['existing',args.operationId,copy(args.previous)]);if(options.prepareExisting)return options.prepareExisting(args,events);await args.save([receipt()]);return{status:'ready',plugins:[receipt()]};};
 const prepareGeneratedPlugins=async args=>{events.push(['generated',args.operationId]);if(options.prepareGenerated)return options.prepareGenerated(args,events);const plugins=[{candidateId:'generated-a',packageName:'@local/audit',version:'0.1.0',requestId:'install-generated',status:'ready',installed:true,enabled:true,active:true}];await args.save(plugins);return{status:'ready',plugins};};
 const store={read:async id=>copy(rows.get(id)),write:async row=>{events.push(['write',JSON.parse(row.serialized).status]);if(options.failWrite?.(row))throw Error('write failed');rows.set(row.id,copy(row));if(options.failAfterCommit?.(row))throw Error('write acknowledgement lost');}};
 const readInstalled=options.readInstalled??(async()=>({installed:true,enabled:true,active:true,conflict:false}));
 const factory=()=>createAgentFinderService({store,createCore:({historyStore})=>createFinderService({...coreOptions,historyStore}),preparePlugins,prepareGeneratedPlugins,readInstalled,reviewGeneratedArtifact:options.reviewGeneratedArtifact});
 return{rows,events,calls,factory,service:factory(),core:createFinderService({...coreOptions,historyStore,preparePlugins}),historyData};
}
async function found(f){return f.service.find({goal:intent.goal,acceptance:'读回看板，并让计数持久化'},caller,{callId:'call-a'});}
async function prepared(f){const r=await found(f);await f.service.activate({requestId:r.requestId},caller,authorization);return f.service.prepareCreation({requestId:r.requestId},caller);}
async function completedCreation(f){const p=await prepared(f),claim=await f.service.claimCreation({requestId:p.requestId},caller);return f.service.recordCreation({requestId:p.requestId,childId:claim.childId,status:'completed',result:JSON.stringify({pluginDirectory:'/workspace/a/new-audit',summary:'仅补审计计数'})},caller);}
test('hybrid plan validates retained owners and exact, separately owned missing capabilities',()=>{
 assert.deepEqual(parsePlan(plan,[candidate],intent),plan);
 const mutations=[p=>{p.gaps=[];},p=>{p.gaps[0].capability='无关能力';},p=>{p.steps[1].owner='human';},p=>{p.steps[0].owner='create';},p=>{p.pluginIds=[];},p=>{p.steps[1].sourceCapability='伪造';}];
 for(const mutate of mutations){const p=copy(plan);mutate(p);assert.throws(()=>parsePlan(p,[candidate],intent),{code:'MODEL_INVALID_OUTPUT'});}
});
test('old plans retain their shape while bounded combinations accept three actual providers',()=>{
 const old={...plan,kind:'single',steps:[plan.steps[0]],gaps:undefined};delete old.gaps;
 assert.equal(Object.hasOwn(parsePlan(old,[candidate],{...intent,capabilities:['读取看板']}),'gaps'),false);
 const plugins=['one','two','three'].map(id=>({...candidate,id,name:id}));const combo={...old,kind:'combo',pluginIds:plugins.map(p=>p.id),steps:plugins.map(p=>({...plan.steps[0],owner:p.id}))};
 assert.equal(parsePlan(combo,plugins,{...intent,capabilities:['读取看板']}).pluginIds.length,3);
});
test('hybrid workflow and gap data survive a real history validation roundtrip',()=>{
 const value={stage:'plan',request:intent.goal,intent,candidates:[candidate],plan};
 assert.deepEqual(validateWorkflow(value).plan.gaps,plan.gaps);
});
test('hybrid Agent prepares existing plugins before authorizing any Creator claim',async()=>{
 const f=fixture(),r=await found(f);assert.equal(r.plan.kind,'hybrid');assert.deepEqual(r.plan.gaps,plan.gaps);assert.equal(r.nextTool.name,'finder_activate');
 await assert.rejects(f.service.claimCreation({requestId:r.requestId},caller),{code:'AGENT_CREATION_NOT_READY'});
 const bypass=await f.service.prepareCreation({requestId:r.requestId},caller);assert.equal(bypass.nextTool.name,'finder_activate');assert.equal(f.calls.some(c=>c.data.trigger),false);
 const reuse=await f.service.activate({requestId:r.requestId},caller,authorization);assert.equal(reuse.status,'reuse_ready');assert.equal(reuse.nextTool.name,'finder_create');assert.equal(reuse.existingPreparation.status,'ready');
 const p=await f.service.prepareCreation({requestId:r.requestId},caller);assert.equal(p.status,'creation_ready');assert.equal(p.existingPreparation.plugins[0].spec,'board@1.0.0');
});
test('hybrid child receives exact retained interfaces and may only implement the missing portion',async()=>{
 const f=fixture(),p=await prepared(f),prompt=buildCreatorPrompt(p,caller);
 assert.match(prompt,/只.*缺失|仅.*缺失/u);assert.match(prompt,/board@1\.0\.0/);assert.match(prompt,/读取看板/);assert.match(prompt,/持久审计计数/);
 assert.match(prompt,/existingPreparation|retained/u);
});
test('hybrid preparation retains receipts through reload and rechecks existing before installing supplement',async()=>{
 const f=fixture(),c=await completedCreation(f);const reloaded=f.factory();const r=await reloaded.activate({requestId:c.requestId},caller,authorization);
 assert.equal(r.status,'ready');assert.equal(r.nextAction,'continue_original_task');assert.equal(r.existingPreparation.status,'ready');assert.equal(r.preparation.kind,'generated');
 const stages=f.events.filter(x=>['existing','generated'].includes(x[0]));assert.deepEqual(stages.map(x=>x[0]),['existing','existing','generated']);assert.equal(stages[1][2][0].requestId,'install-board');
 assert.match(r.callerInstruction,/现成|复用/u);
});
test('hybrid existing activation requires authorization, retaining the original request on refusal',async()=>{
 const f=fixture(),r=await found(f);await assert.rejects(f.service.activate({requestId:r.requestId},caller,{authorize:async()=>false}),{code:'AGENT_AUTHORIZATION_REQUIRED'});assert.equal(f.events.some(x=>x[0]==='existing'),false);assert.equal(f.calls.some(c=>c.data.trigger),false);
});
test('uncertain existing preparation cannot publish a Creator or overwrite retained install facts',async()=>{
 const f=fixture({prepareExisting:async args=>{await args.save([receipt('unknown')]);throw Object.assign(Error(),{code:'PLUGIN_INSTALL_PENDING'});}}),r=await found(f);
 const blocked=await f.service.activate({requestId:r.requestId},caller,authorization);assert.equal(blocked.status,'installation_unknown');assert.equal(blocked.existingPreparation.plugins[0].status,'unknown');
 const again=await f.service.prepareCreation({requestId:r.requestId},caller);assert.equal(again.nextTool.name,'finder_status');assert.equal(f.calls.some(c=>c.data.trigger),false);
});
test('drift in an existing provider after creation blocks generated installation',async()=>{
 let passes=0;const f=fixture({prepareExisting:async args=>{passes++;await args.save([receipt(passes===1?'ready':'failed')]);if(passes>1)throw Object.assign(Error(),{code:'PLUGIN_INSTALL_CONFLICT'});return{status:'ready',plugins:[receipt()]};}});
 const c=await completedCreation(f),r=await f.service.activate({requestId:c.requestId},caller,authorization);assert.notEqual(r.status,'ready');assert.equal(f.events.some(e=>e[0]==='generated'),false);assert.equal(r.creation.runStatus,'completed');assert.equal(r.existingPreparation.plugins[0].status,'failed');
});
test('workbench hybrid cannot bypass missing creation with use, and prepares retained sources before create submission',async()=>{
 const f=fixture(),a=await f.core.analyze({request:intent.goal}),p=await f.core.recommend({taskId:a.workflow.taskId,revisionId:a.workflow.revisionId,intent});
 await assert.rejects(f.core.executionClaim({taskId:p.workflow.taskId,revisionId:p.workflow.revisionId,kind:'use',workspaceId:'workspace-a'}),e=>['INVALID_INPUT','CREATION_NOT_READY'].includes(e.code));
 let c=await f.core.creationStart({taskId:p.workflow.taskId,revisionId:p.workflow.revisionId,trigger:'user-customization'});c=await f.core.creationUpdate({taskId:c.workflow.taskId,revisionId:c.workflow.revisionId,confirm:true});
 const claimed=await f.core.executionClaim({taskId:c.workflow.taskId,revisionId:c.workflow.revisionId,kind:'create',workspaceId:'workspace-a'}),row={...claimed.attempt,sessionId:'session-create'};
 await f.core.executionRecord({...row,status:'created'});await assert.rejects(f.core.executionSubmitClaim(row),{code:'EXECUTION_PLUGINS_NOT_READY'});
 const ready=await f.core.executionPrepare(row);assert.equal(ready.ready,true);assert.equal(ready.attempt.preparation.plugins[0].spec,'board@1.0.0');const submitted=await f.core.executionSubmitClaim(row);assert.match(submitted.attempt.prompt,/只.*缺失|仅.*缺失/u);assert.match(submitted.attempt.prompt,/board@1\.0\.0/);
});
test('confirmation cannot shrink a hybrid full task into only the new component',async()=>{
 const f=fixture({shrinkConfirmation:true}),p=await prepared(f);
 assert.equal(p.intent.goal,intent.goal);assert.equal(p.intent.input,intent.input);assert.equal(p.intent.output,intent.output);assert.deepEqual(p.intent.capabilities,intent.capabilities);
 assert.deepEqual(f.calls.filter(call=>call.system.includes('仅允许 {"kind"')).at(-1).data.intent.capabilities,intent.capabilities);
});
test('read-only status detects retained-provider drift without changing receipts or calling installers',async()=>{
 let active=true;const f=fixture({readInstalled:async()=>({installed:true,enabled:active,active,conflict:false})}),c=await completedCreation(f);await f.service.activate({requestId:c.requestId},caller,authorization);
 const bytes=f.rows.get(c.requestId).serialized,installs=f.events.filter(e=>e[0]==='existing'||e[0]==='generated').length;
 active=false;const result=await f.factory().status({requestId:c.requestId},caller);assert.equal(result.status,'recheck_required');assert.equal(result.nextTool.name,'finder_activate');assert.equal(f.rows.get(c.requestId).serialized,bytes);assert.equal(f.events.filter(e=>e[0]==='existing'||e[0]==='generated').length,installs);
 active=true;assert.equal((await f.factory().status({requestId:c.requestId},caller)).status,'ready');
});
test('Creator claim is refused after retained-provider drift even if an old prepared receipt was ready',async()=>{
 let active=true;const f=fixture({readInstalled:async()=>({installed:true,enabled:active,active,conflict:false})}),p=await prepared(f);
 active=false;const result=await f.service.claimCreation({requestId:p.requestId},caller);assert.equal(result.claim,'stale');assert.equal(result.status,'recheck_required');assert.equal(result.nextTool.name,'finder_activate');assert.equal(result.creation.childId,undefined);
});
test('cancellation during retained preparation preserves the receipt and never starts creation',async()=>{
 const controller=new AbortController();const f=fixture({prepareExisting:async args=>{await args.save([receipt('unknown')]);controller.abort();return{status:'ready',plugins:[receipt()]};}}),r=await found(f);
 const result=await f.service.activate({requestId:r.requestId},caller,{...authorization,signal:controller.signal});assert.equal(result.status,'installation_unknown');assert.equal(result.existingPreparation.plugins[0].status,'unknown');assert.equal(result.creation,undefined);assert.equal(result.nextTool.name,'finder_status');
});
test('a generated known failure and bounded repair preserve independent retained receipts',async()=>{
 const f=fixture({prepareGenerated:async args=>{const row={candidateId:'@local/audit',packageName:'@local/audit',version:'0.1.0',requestId:'generated-request',status:'failed',active:false,code:'PLUGIN_INSTALL_NOT_ACTIVE'};await args.save([row]);throw Object.assign(Error(),{code:'PLUGIN_INSTALL_NOT_ACTIVE'});}}),c=await completedCreation(f),blocked=await f.service.activate({requestId:c.requestId},caller,authorization);
 assert.equal(blocked.status,'blocked');assert.equal(blocked.existingPreparation.status,'ready');const retained=copy(blocked.existingPreparation);
 const repaired=await f.service.prepareCreation({requestId:c.requestId,feedback:'补件自身注册失败，请定点修复'},caller);assert.equal(repaired.status,'creation_ready');assert.deepEqual(repaired.existingPreparation,retained);assert.equal(repaired.preparation,undefined);assert.equal(repaired.repairCount,1);
});
test('a slow read-only status cannot return old ready over a newer preparation',async()=>{
 let paused=false,holdInstall=false,entered,release,installEntered,finishInstall;const started=new Promise(r=>{entered=r;}),wait=new Promise(r=>{release=r;}),installStarted=new Promise(r=>{installEntered=r;}),installWait=new Promise(r=>{finishInstall=r;});
 const f=fixture({readInstalled:async()=>{if(paused){paused=false;entered();await wait;}return{installed:true,enabled:true,active:true,conflict:false};},prepareGenerated:async args=>{if(holdInstall){installEntered();await installWait;}const plugins=[{candidateId:'generated-a',packageName:'@local/audit',version:'0.1.0',requestId:'install-generated',status:'ready',installed:true,enabled:true,active:true}];await args.save(plugins);return{status:'ready',plugins};}}),c=await completedCreation(f);await f.service.activate({requestId:c.requestId},caller,authorization);
 paused=true;const pending=f.service.status({requestId:c.requestId},caller);await started;holdInstall=true;const activating=f.service.activate({requestId:c.requestId},caller,authorization);await installStarted;release();assert.equal((await pending).status,'activating');finishInstall();assert.equal((await activating).status,'ready');
});
test('malformed new preparation records fail closed without exposing stored content',async()=>{
 const f=fixture(),r=await found(f),row=f.rows.get(r.requestId),data=JSON.parse(row.serialized);data.existingPreparation={kind:'existing',status:'ready',plugins:'PRIVATE_BAD_RECORD'};row.serialized=JSON.stringify(data);f.rows.set(row.id,row);
 await assert.rejects(f.service.status({requestId:r.requestId},caller),e=>e.code==='AGENT_STORAGE_FAILED'&&!e.message.includes('PRIVATE'));
});
test('interrupted model preparation is read-only retryable after restart, preserving reuse before explicit retry',async()=>{
 const f=fixture(),r=await found(f);await f.service.activate({requestId:r.requestId},caller,authorization);
 const record=JSON.parse(f.rows.get(r.requestId).serialized),retained=copy(record.existingPreparation);record.status='creation_preparing';f.rows.set(record.id,{id:record.id,serialized:JSON.stringify(record)});
 const restarted=fixture({rows:f.rows}),before=f.rows.get(record.id).serialized,status=await restarted.service.status({requestId:record.id},caller);
 assert.equal(status.status,'creation_retryable');assert.equal(status.nextTool.name,'finder_create');assert.equal(status.creation,undefined);assert.deepEqual(status.existingPreparation,retained);assert.equal(restarted.calls.length,0);assert.equal(f.rows.get(record.id).serialized,before);
 const retried=await restarted.service.prepareCreation({requestId:record.id},caller);assert.equal(retried.status,'creation_ready');assert.deepEqual(retried.existingPreparation,retained);assert.ok(restarted.calls.length>0);assert.equal(retried.creation.childId,undefined);
});
test('explicit retry settles an already committed preparation without rerunning models',async()=>{
 const f=fixture(),p=await prepared(f),record=JSON.parse(f.rows.get(p.requestId).serialized);record.status='creation_preparing';f.rows.set(record.id,{id:record.id,serialized:JSON.stringify(record)});
 const restarted=fixture({rows:f.rows});assert.equal((await restarted.service.status({requestId:record.id},caller)).nextTool.name,'finder_create');const result=await restarted.service.prepareCreation({requestId:record.id},caller);assert.equal(result.status,'creation_ready');assert.equal(restarted.calls.length,0);assert.equal(result.creation.childId,undefined);
});
test('a reserved unknown Creator is never relabeled as model-only retryable preparation',async()=>{
 const f=fixture(),p=await prepared(f),claim=await f.service.claimCreation({requestId:p.requestId},caller);await f.service.recordCreation({requestId:p.requestId,childId:claim.childId,status:'unknown'},caller);
 const restarted=fixture({rows:f.rows}),status=await restarted.service.status({requestId:p.requestId},caller);assert.equal(status.status,'creation_unknown');assert.equal(status.nextTool.name,'finder_status');assert.equal(status.creation.childId,claim.childId);assert.equal(restarted.calls.length,0);
});

const absentReview=(artifact,actor)=>({kind:'observed_absent',directory:artifact.pluginDirectory,root:actor.directory,packageName:'@local/'+artifact.pluginDirectory.split('/').at(-1),version:'0.1.0',fingerprint:'a'.repeat(64),observedAt:'2026-11-03T22:00:00.000Z'});
test('explicit pre-install review keeps the original hybrid task and retires no unsubmitted artifact',async()=>{
 const reviews=[],generated=[];const f=fixture({reviewGeneratedArtifact:async args=>{reviews.push(copy(args));return absentReview(args.artifact,args.caller);},prepareGenerated:async args=>{generated.push(copy(args.superseded));const plugins=[{status:'ready',active:true}];await args.save(plugins);return{status:'ready',plugins};}});
 const completed=await completedCreation(f),before=JSON.parse(f.rows.get(completed.requestId).serialized),feedback='调用方审查：各入口核验工作区；读取前拒绝目录符号链接；并发添加须串行化。';
 const revised=await f.service.prepareCreation({requestId:completed.requestId,feedback},caller);
 assert.equal(revised.requestId,completed.requestId);assert.equal(revised.status,'creation_ready');assert.equal(revised.repairPhase,'preinstall');assert.equal(revised.repairCount,1);
 assert.equal(revised.creation.childId,undefined);assert.equal(revised.preparation,undefined);assert.deepEqual(revised.existingPreparation,completed.existingPreparation);
 assert.equal(revised.intent.goal,intent.goal);assert.deepEqual(revised.intent.capabilities,intent.capabilities);
 const after=JSON.parse(f.rows.get(completed.requestId).serialized),attempt=after.repairAttempts[0];
 assert.deepEqual(after.history,before.history);assert.deepEqual(attempt.creator,before.creator);assert.equal(attempt.phase,'preinstall');assert.equal(attempt.kind,'caller_reported_review');assert.equal(attempt.preparation,undefined);
 assert.deepEqual(attempt.review,absentReview({pluginDirectory:'/workspace/a/new-audit'},caller));assert.equal(attempt.error,undefined);
 assert.equal(revised.repairContext.previousPluginDirectory,'/workspace/a/new-audit');assert.equal(revised.repairContext.previousPackageName,'@local/new-audit');assert.equal(reviews.length,1);
 assert.equal((await f.service.claimCreation({requestId:completed.requestId},caller,{expectedRevisionId:completed.revisionId,expectedContentHash:completed.creation.contentHash})).claim,'stale');
 const claimed=await f.service.claimCreation({requestId:completed.requestId},caller,{expectedRevisionId:revised.revisionId,expectedContentHash:revised.creation.contentHash});
 assert.equal(claimed.claim,'acquired');assert.notEqual(claimed.childId,before.creator.childId);assert.equal(reviews.length,2);assert.equal(reviews[1].expected.fingerprint,attempt.review.fingerprint);
 await assert.rejects(f.service.recordCreation({requestId:completed.requestId,childId:before.creator.childId,status:'completed',result:'{}'},caller),{code:'AGENT_CREATION_CONFLICT'});
 await f.service.recordCreation({requestId:completed.requestId,childId:claimed.childId,status:'completed',result:JSON.stringify({pluginDirectory:'/workspace/a/revised-audit',summary:'独立修订'})},caller);
 await f.service.activate({requestId:completed.requestId},caller,authorization);
 assert.equal(generated[0][0].phase,'preinstall');assert.equal(generated[0][0].preparation,undefined);assert.equal(generated[0][0].review.kind,'observed_absent');
 assert.equal(f.calls.filter(call=>call.system.includes('本阶段只抽取')).length,1);
});
test('pre-install review accepts settled authorization refusal without calling it a code failure',async()=>{
 for(const thrown of [false,true]){
  let observed=0;const f=fixture({reviewGeneratedArtifact:async args=>{observed++;return absentReview(args.artifact,args.caller);}}),completed=await completedCreation(f);
  await assert.rejects(f.service.activate({requestId:completed.requestId},caller,{authorize:async()=>{if(thrown)throw Error('approval denied');return false;}}));
  const before=JSON.parse(f.rows.get(completed.requestId).serialized);assert.equal(before.preparation,undefined);assert.equal(before.creator.status,'completed');
  assert.equal(before.status,thrown?'creation_completed':'blocked');
  const revised=await f.service.prepareCreation({requestId:completed.requestId,feedback:'调用方要求修订源码中的已知边界问题'},caller);
  assert.equal(revised.repairCount,1);assert.equal(observed,1);assert.equal(f.events.some(event=>event[0]==='generated'),false);
  const attempt=JSON.parse(f.rows.get(completed.requestId).serialized).repairAttempts[0];assert.equal(attempt.kind,'caller_reported_review');assert.equal(attempt.preparation,undefined);
  if(!thrown)assert.equal(attempt.error.code,'AGENT_AUTHORIZATION_REQUIRED');
 }
});
test('pre-install review never reissues pending unknown running installed or stale creations',async()=>{
 const mutations=[
  record=>{record.status='activating';record.preparation={kind:'generated',status:'pending',plugins:[]};},
  record=>{record.status='installation_unknown';record.preparation={kind:'generated',status:'pending',plugins:[]};},
  record=>{record.status='creation_unknown';record.creator.status='unknown';},
  record=>{record.status='creating';record.creator.status='running';},
  record=>{record.status='creation_starting';record.creator.status='starting';},
  record=>{record.status='ready';record.preparation={kind:'generated',status:'ready',plugins:[{status:'ready',active:true}]};},
  record=>{record.status='blocked';record.error={code:'PLUGIN_INSTALL_APPROVAL_REQUIRED'};record.preparation={kind:'generated',status:'pending',plugins:[]};},
  record=>{record.creator.revisionId='another-revision';},
  record=>{const taskId=record.history.pointer.activeTaskId,task=JSON.parse(record.history.rows[taskId].serialized);task.revisions.find(revision=>revision.id===record.history.pointer.activeRevisionId).workflow.creation.supply.status='stale';record.history.rows[taskId].serialized=JSON.stringify(task);},
 ];
 for(const mutate of mutations){
  const f=fixture({reviewGeneratedArtifact:async()=>assert.fail('ineligible state must not inspect or revise')}),completed=await completedCreation(f),row=f.rows.get(completed.requestId),record=JSON.parse(row.serialized);mutate(record);row.serialized=JSON.stringify(record);f.rows.set(row.id,row);const before=row.serialized;
  const result=await f.service.prepareCreation({requestId:completed.requestId,feedback:'不能重派不确定或已安装的产物'},caller);
  assert.equal(result.repairCount,0);assert.equal(f.rows.get(completed.requestId).serialized,before);
 }
});
test('unavailable invalid or changed artifact observations do not clear the completed child',async()=>{
 const options=[{},
  {reviewGeneratedArtifact:async()=>{throw Error('PRIVATE_MODEL_OR_HOST_DETAILS');}},
  {reviewGeneratedArtifact:async args=>({...absentReview(args.artifact,args.caller),kind:'unknown'})},
  {reviewGeneratedArtifact:async args=>({...absentReview(args.artifact,args.caller),directory:'/outside/escape'})},
  {reviewGeneratedArtifact:async args=>({...absentReview(args.artifact,args.caller),root:'/other/workspace'})},
  {reviewGeneratedArtifact:async args=>({...absentReview(args.artifact,args.caller),fingerprint:'not-a-fingerprint'})},
 ];
 for(const option of options){const f=fixture(option),completed=await completedCreation(f),before=f.rows.get(completed.requestId).serialized;
  await assert.rejects(f.service.prepareCreation({requestId:completed.requestId,feedback:'显式请求有界修订'},caller),cause=>cause.code==='AGENT_PREINSTALL_REVIEW_UNAVAILABLE'&&!cause.message.includes('PRIVATE_'));
  assert.equal(f.rows.get(completed.requestId).serialized,before);
 }
 let changed=false;const f=fixture({reviewGeneratedArtifact:async args=>({...absentReview(args.artifact,args.caller),fingerprint:(changed?'b':'a').repeat(64)})}),completed=await completedCreation(f);
 await f.service.prepareCreation({requestId:completed.requestId,feedback:'修订但保留原件'},caller);changed=true;const before=f.rows.get(completed.requestId).serialized;
 await assert.rejects(f.service.claimCreation({requestId:completed.requestId},caller),{code:'AGENT_PREINSTALL_REVIEW_UNAVAILABLE'});assert.equal(f.rows.get(completed.requestId).serialized,before);
});
test('pre-install feedback deduplicates durably, has a shared two-revision cap, and survives write uncertainty',async()=>{
 const options={reviewGeneratedArtifact:async args=>absentReview(args.artifact,args.caller)},f=fixture(options),completed=await completedCreation(f),feedback='第一轮调用方审查意见';
 const [one,two]=await Promise.all([f.service.prepareCreation({requestId:completed.requestId,feedback},caller),f.service.prepareCreation({requestId:completed.requestId,feedback},caller)]);assert.equal(one.repairCount,1);assert.equal(two.repairCount,1);
 for(let n=1;n<=2;n++){
  const claim=await f.service.claimCreation({requestId:completed.requestId},caller);assert.equal(claim.claim,'acquired');
  await f.service.recordCreation({requestId:completed.requestId,childId:claim.childId,status:'completed',result:JSON.stringify({pluginDirectory:'/workspace/a/revision-'+n,summary:'有界修订'})},caller);
  if(n===1)assert.equal((await f.service.prepareCreation({requestId:completed.requestId,feedback:'第二轮调用方审查'},caller)).repairCount,2);
 }
 const before=f.rows.get(completed.requestId).serialized,result=await f.service.prepareCreation({requestId:completed.requestId,feedback:'第三轮不得触发'},caller);assert.equal(result.repairCount,2);assert.equal(f.rows.get(completed.requestId).serialized,before);
 for(const committed of [false,true]){
  const options={reviewGeneratedArtifact:async args=>absentReview(args.artifact,args.caller)},f=fixture(options),completed=await completedCreation(f),prior=JSON.parse(f.rows.get(completed.requestId).serialized).creator;
  options[committed?'failAfterCommit':'failWrite']=row=>JSON.parse(row.serialized).repairAttempts?.length===1;
  await assert.rejects(f.service.prepareCreation({requestId:completed.requestId,feedback:'修订记录先落盘'},caller),{code:'AGENT_STORAGE_FAILED'});
  const saved=JSON.parse(f.rows.get(completed.requestId).serialized);assert.equal(saved.repairAttempts?.length,committed?1:undefined);assert.equal(saved.creator?.childId,committed?undefined:prior.childId);
  options.failWrite=undefined;options.failAfterCommit=undefined;const recovered=await f.factory().prepareCreation({requestId:completed.requestId,feedback:'修订记录先落盘'},caller);assert.equal(recovered.repairCount,1);assert.equal(recovered.creation.childId,undefined);
 }
});
