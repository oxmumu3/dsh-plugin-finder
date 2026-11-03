import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFinderService} from '../src/service.js';
import {FinderError} from '../src/contracts.js';

const {createAgentFinderService}=await import('../src/agent-finder-service.js').catch(()=>({}));
const caller={sessionId:'session-a',workspaceId:'workspace-a',directory:'/workspace/a'};
const other={sessionId:'session-b',workspaceId:'workspace-b',directory:'/workspace/b'};
const input={goal:'使用专用预览',acceptance:'预览有内容',constraints:['不读取其他项目'],knownCapabilities:['普通文本读取']};
const plugins=['preview','render'].map(id=>({id,name:id,title:id,summary:'预览材料',capabilities:['预览'],requirements:{},install:{type:'npm',spec:id+'@1.0.0',version:'1.0.0'},evidence:{metadata:'manifest-checked',installation:'not-tested',task:'not-tested',sources:[]}}));
const blueprint=Object.fromEntries(['name','purpose','workflow','inputs','outputs','ui','data','tools','runtime','scope','acceptance'].map(key=>[key,key==='name'?'本地预览':key+' 原始范围']));
const fail=code=>Object.assign(new Error(code),{code});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function harness(options={}){
  const rows=new Map(),events=[],calls=[],cores=[];
  let writes=0,installs=0;
  const store={async read(id){return structuredClone(rows.get(id));},async write(row){writes++;events.push(['write',JSON.parse(row.serialized).status]);if(options.failWrite?.(row,writes))throw Error('private storage detail');rows.set(row.id,structuredClone(row));if(options.failAfterCommit?.(row,writes))throw Error('private committed acknowledgement lost');}};
  const discovery={search:async()=>({candidates:structuredClone(plugins),sources:[{id:'fixture',status:'live'}],coverage:{matched:2,inspected:2,uninspected:0},sourceCoverage:[],warnings:options.partial?['一个来源未完成']:[],searchedAt:'2026-10-26T12:00:00Z'})};
  const model={status:()=>({configured:true}),async call(args){
    calls.push(args);events.push(['model',args.system.includes('本阶段只抽取')?'analyze':'other']);await options.beforeModel?.(args,calls.length);
    const data=args.data;
    if(args.system.includes('本阶段只抽取'))return{text:JSON.stringify({goal:data.request,input:'fixture.md',output:'预览',constraints:[],capabilities:['预览'],queries:['preview']})};
    if(args.system.includes('CREATION_CONFIRM_SCHEMA'))return{text:JSON.stringify({intent:data.priorIntent,blueprint:data.creation.blueprint})};
    if(data.trigger)return{text:JSON.stringify({strategy:'new',reuseAssessment:'已查范围仍缺专门能力',candidateDecisions:[],questions:options.questions??[],assumptions:[],blueprint})};
    const kind=options.reuseAfterCreation&&data.userFeedbackContext!==undefined&&calls.some(call=>call.data.trigger)?'single':data.intent.goal.includes('缺口')?'gap':data.intent.goal.includes('原生')?'native':data.intent.goal.includes('组合')?'combo':'single';
    const ids=kind==='combo'?['preview','render']:kind==='single'?['preview']:[];
    return{text:JSON.stringify({kind,title:'执行方案',rationale:'作者资料有相关能力，实际效果待验证',pluginIds:ids,steps:kind==='gap'?[]:ids.length?ids.map(owner=>({capability:'预览',owner,sourceCapability:'预览',action:'预览',input:'材料',output:'结果'})):[{capability:'预览',owner:'dsh',sourceCapability:null,action:'原生预览',input:'材料',output:'结果'}],limits:['实际任务尚待验证']})};
  }};
  const createCore=({historyStore})=>{const core=createFinderService({historyStore,model,discovery,hostVersion:'0.2.1-rc.5'});cores.push(core);return core;};
  const preparePlugins=async args=>{
    installs++;events.push(['install',args.candidates.map(p=>p.id)]);
    if(options.prepare)return options.prepare(args);
    const saved=args.candidates.map(p=>({candidateId:p.id,packageName:p.name,version:p.install.version,spec:p.install.spec,requestId:'install-'+p.id,status:'ready',installed:true,enabled:true,active:true}));
    await args.save(saved);return{status:'ready',plugins:saved};
  };
  const factory=()=>createAgentFinderService({store,createCore,preparePlugins,...(options.prepareGeneratedPlugins?{prepareGeneratedPlugins:options.prepareGeneratedPlugins}:{}),clock:()=>new Date('2026-10-26T12:00:00Z')});
  const service=factory();return{service,factory,rows,events,calls,cores,store,get installs(){return installs;},get writes(){return writes;}};
}
const find=(h,value=input,actor=caller,callId='call-a')=>h.service.find(value,actor,{callId});
const authorized={authorize:async()=>true};
test('agent entry is a separate scoped service',()=>assert.equal(typeof createAgentFinderService,'function'));
test('find persists before model work, keeps one private task and returns only selected candidates',async()=>{
  const h=harness(),result=await find(h);
  assert.equal(h.events[0][0],'write');assert.equal(result.status,'planned');assert.equal(result.plan.kind,'single');
  assert.deepEqual(result.candidates.map(p=>p.id),['preview']);assert.equal(result.history,undefined);assert.equal(result.workflow,undefined);
  assert.deepEqual(result.intent.constraints,input.constraints);assert.equal(result.discovery.coverage.inspected,2);
  const row=JSON.parse(h.rows.get(result.requestId).serialized);assert.equal(Object.keys(row.history.rows).length,1);
  const task=JSON.parse(Object.values(row.history.rows)[0].serialized);assert.ok(task.revisions.every(rev=>rev.workflow.localOnly===true));
});
test('same session and call id are durable idempotent, including concurrent invocations',async()=>{
  const h=harness(),[a,b]=await Promise.all([find(h),find(h)]);assert.equal(a.requestId,b.requestId);assert.equal(h.calls.length,2);
  const reloaded=h.factory();assert.equal((await reloaded.find(input,caller,{callId:'call-a'})).requestId,a.requestId);assert.equal(h.calls.length,2);
  await assert.rejects(find(h,{...input,acceptance:'不同结果'}),{code:'AGENT_REQUEST_CONFLICT'});assert.equal(h.calls.length,2);
});
test('different requests run concurrently without a shared active task',async()=>{
  const barrier=deferred();let entered=0;
  const h=harness({beforeModel:async args=>{if(args.system.includes('本阶段只抽取')){entered++;if(entered===2)barrier.resolve();await barrier.promise;}}});
  const [a,b]=await Promise.all([find(h),find(h,{...input,goal:'组合预览'},other)]);
  assert.notEqual(a.requestId,b.requestId);assert.equal(a.plan.kind,'single');assert.equal(b.plan.kind,'combo');
  assert.equal((await h.service.status({requestId:a.requestId},caller)).plan.kind,'single');
});
test('cross-session, workspace and directory access is refused for every mutating entry',async()=>{
  const h=harness(),result=await find(h);
  for(const wrong of [other,{...caller,workspaceId:'foreign'},{...caller,directory:'/workspace/else'}]){
    for(const action of ['status','activate','prepareCreation','claimCreation'])await assert.rejects(h.service[action]({requestId:result.requestId},wrong,action==='activate'?authorized:undefined),{code:'AGENT_REQUEST_UNAVAILABLE'});
    await assert.rejects(h.service.recordCreation({requestId:result.requestId,childId:'guessed',status:'completed',result:'{}'},wrong),{code:'AGENT_REQUEST_UNAVAILABLE'});
  }
  assert.equal(h.installs,0);
});
test('unknown request and another identity have indistinguishable unavailable errors',async()=>{
  const h=harness(),result=await find(h);
  const rejected=async id=>{try{await h.service.status({requestId:id},other);}catch(error){return{code:error.code,message:error.message};}};
  assert.deepEqual(await rejected(result.requestId),await rejected('agent-finder-'+'a'.repeat(40)));
});
test('invalid or oversized requests fail before writing, without trimming constraints',async()=>{
  const h=harness();
  for(const value of [{...input,userId:'forged'},{...input,goal:''},{...input,goal:'x'.repeat(6000),acceptance:'y'.repeat(3000)},{...input,constraints:Array(25).fill('限制')}])await assert.rejects(find(h,value));
  assert.equal(h.writes,0);assert.equal(h.calls.length,0);
});
test('first durable save failure prevents model, installation and creation',async()=>{
  const h=harness({failWrite:()=>true});await assert.rejects(find(h),{code:'AGENT_STORAGE_FAILED'});assert.equal(h.calls.length,0);assert.equal(h.installs,0);
});
test('persisted interrupted discovery does not automatically repeat model requests',async()=>{
  const h=harness({beforeModel:()=>{throw fail('MODEL_TIMEOUT');}}),result=await find(h);
  assert.equal(result.status,'discovery_failed');assert.equal(result.error.code,'MODEL_TIMEOUT');
  await find(h);assert.equal(h.calls.length,1);
});
test('activation authorizes profile impact, prepares selected source and rechecks prior readiness',async()=>{
  const h=harness(),result=await find(h);let grants=0;
  const ready=await h.service.activate({requestId:result.requestId},caller,{authorize:async info=>{grants++;assert.equal(info.workspaceId,caller.workspaceId);assert.match(info.profileImpact,/profile/);return true;}});
  assert.equal(ready.status,'ready');assert.equal(ready.nextAction,'continue_original_task');assert.equal(h.installs,1);
  assert.deepEqual(h.events.find(row=>row[0]==='install')[1],['preview']);
  await h.service.activate({requestId:result.requestId},caller,{authorize:async()=>{grants++;return true;}});assert.equal(h.installs,2);assert.equal(grants,2);
});
test('native activation needs no package installation or install authorization',async()=>{
  const h=harness(),result=await find(h,{...input,goal:'原生预览'});
  const ready=await h.service.activate({requestId:result.requestId},caller);assert.equal(ready.status,'ready');assert.equal(h.installs,0);
});
test('denied install authorization and preparation save failure both prevent side effects',async()=>{
  const h=harness(),result=await find(h);
  await assert.rejects(h.service.activate({requestId:result.requestId},caller,{authorize:async()=>false}),{code:'AGENT_AUTHORIZATION_REQUIRED'});assert.equal(h.installs,0);
  const broken=harness({failWrite:row=>JSON.parse(row.serialized).status==='activating'}),found=await find(broken);
  await assert.rejects(broken.service.activate({requestId:found.requestId},caller,authorized),{code:'AGENT_STORAGE_FAILED'});assert.equal(broken.installs,0);
});
test('unknown installation without a durable manager receipt is not retried',async()=>{
  const h=harness({prepare:async()=>{throw fail('PLUGIN_INSTALL_PENDING');}}),result=await find(h);
  const unknown=await h.service.activate({requestId:result.requestId},caller,authorized);assert.equal(unknown.status,'installation_unknown');
  await h.service.activate({requestId:result.requestId},caller,authorized);assert.equal(h.installs,1);
});
test('installation reconciliation carries the same durable previous receipt',async()=>{
  let count=0;const h=harness({prepare:async args=>{count++;if(count===1){await args.save([{candidateId:'preview',packageName:'preview',version:'1.0.0',spec:'preview@1.0.0',requestId:'receipt-a',status:'unknown'}]);throw fail('PLUGIN_INSTALL_PENDING');}assert.equal(args.previous[0].requestId,'receipt-a');const saved=[{...args.previous[0],status:'ready',installed:true,enabled:true,active:true}];await args.save(saved);return{status:'ready',plugins:saved};}});
  const result=await find(h);await h.service.activate({requestId:result.requestId},caller,authorized);
  assert.equal((await h.service.activate({requestId:result.requestId},caller,authorized)).status,'ready');assert.equal(count,2);
});
test('pre-aborted find or activate never starts work',async()=>{
  const h=harness(),controller=new AbortController();controller.abort();
  await assert.rejects(h.service.find(input,caller,{callId:'abort',signal:controller.signal}),{code:'MODEL_ABORTED'});assert.equal(h.calls.length,0);
  const result=await find(h);await assert.rejects(h.service.activate({requestId:result.requestId},caller,{...authorized,signal:controller.signal}),{code:'MODEL_ABORTED'});assert.equal(h.installs,0);
});
test('source warnings and concrete gap remain evidence rather than automatic creation',async()=>{
  const h=harness({partial:true}),result=await find(h,{...input,goal:'缺口预览'});
  assert.equal(result.plan.kind,'gap');assert.deepEqual(result.discovery.warnings,['一个来源未完成']);assert.equal(result.nextAction,'review_supply_gap');assert.equal(result.creation,undefined);assert.equal(h.calls.length,2);
  await assert.rejects(h.service.activate({requestId:result.requestId},caller,authorized),{code:'AGENT_CREATION_REQUIRED'});assert.equal(h.installs,0);
});
test('creation preparation reuses core questions and confirmation, and durable claim never respawns',async()=>{
  const question={id:'layout',question:'使用哪种布局',options:['简洁'],reason:'尚未明确'};
  const h=harness({questions:[question]}),found=await find(h,{...input,goal:'缺口预览'});
  const draft=await h.service.prepareCreation({requestId:found.requestId},caller);assert.equal(draft.status,'creation_draft');assert.equal(draft.creation.questions[0].id,'layout');
  await assert.rejects(h.service.claimCreation({requestId:found.requestId},caller),{code:'AGENT_CREATION_NOT_READY'});
  const ready=await h.service.prepareCreation({requestId:found.requestId,answers:[{id:'layout',answer:'简洁',assumed:false}]},caller);assert.equal(ready.status,'creation_ready');
  const calls=h.calls.length;await h.service.prepareCreation({requestId:found.requestId,answers:[{id:'layout',answer:'简洁',assumed:false}]},caller);assert.equal(h.calls.length,calls);
  const [a,b]=await Promise.all([h.service.claimCreation({requestId:found.requestId},caller),h.service.claimCreation({requestId:found.requestId},caller)]);
  assert.equal(a.claim,'acquired');assert.equal(b.claim,'existing');assert.equal(a.childId,b.childId);
  assert.equal((await h.factory().claimCreation({requestId:found.requestId},caller)).childId,a.childId);
});
test('invalid creation answers recover the original request without searching or generating a new draft',async()=>{
  const questions=['layout','storage','scope'].map(id=>({id,question:id,options:['沿用原需求'],reason:'尚未明确'}));
  const h=harness({questions}),found=await find(h,{...input,goal:'缺口预览'});
  const rejectAnswers=async answers=>{
    const serialized=h.rows.get(found.requestId).serialized,count=h.calls.length;
    await assert.rejects(h.service.prepareCreation({requestId:found.requestId,answers},caller),cause=>{
      assert.equal(cause.code,'AGENT_CREATION_ANSWERS_INVALID');assert.equal(cause.requestId,found.requestId);
      assert.deepEqual(cause.nextTool,{name:'finder_status',arguments:{requestId:found.requestId}});
      assert.match(cause.message,/creation\.questions/u);assert.match(cause.message,/最多3/u);assert.doesNotMatch(cause.message,/目标和可检查的验收/u);return true;
    });
    assert.equal(h.rows.get(found.requestId).serialized,serialized);assert.equal(h.calls.length,count);
  };
  await rejectAnswers([...questions,{id:'invented'}].map(({id})=>({id,answer:'沿用原需求'})));
  await rejectAnswers([{id:'invented',answer:'不应在问题签发前自填'}]);
  const draft=await h.service.prepareCreation({requestId:found.requestId},caller);assert.equal(draft.status,'creation_draft');
  await rejectAnswers([{id:'invented',answer:'未知问题'}]);
  await rejectAnswers([{id:'layout',answer:'A'},{id:'layout',answer:'B'}]);
  await rejectAnswers([{id:'layout',answer:'x'.repeat(2001)}]);
  const answers=questions.map(({id})=>({id,answer:'沿用原需求'})),ready=await h.factory().prepareCreation({requestId:found.requestId,answers},caller);
  assert.equal(ready.requestId,found.requestId);assert.equal(ready.status,'creation_ready');assert.equal(h.rows.size,1);
  assert.deepEqual(ready.creation.answers,answers.map(answer=>({...answer,assumed:true})));
  assert.equal(h.calls.filter(call=>call.system.includes('本阶段只抽取')).length,1);
  assert.equal(ready.intent.goal,found.intent.goal);
});
test('claim storage failure prevents caller from obtaining creation authority',async()=>{
  const h=harness({failWrite:row=>JSON.parse(row.serialized).status==='creation_starting'}),found=await find(h,{...input,goal:'缺口预览'});
  await h.service.prepareCreation({requestId:found.requestId},caller);
  await assert.rejects(h.service.claimCreation({requestId:found.requestId},caller),{code:'AGENT_STORAGE_FAILED'});
});
test('creation records require the exact reserved child and terminal completion is stable',async()=>{
  const h=harness(),found=await find(h,{...input,goal:'缺口预览'});await h.service.prepareCreation({requestId:found.requestId},caller);
  const claim=await h.service.claimCreation({requestId:found.requestId},caller);
  await assert.rejects(h.service.recordCreation({requestId:found.requestId,childId:'foreign',status:'completed',result:'{}'},caller),{code:'AGENT_CREATION_CONFLICT'});
  await h.service.recordCreation({requestId:found.requestId,childId:claim.childId,status:'completed',result:'{"pluginDirectory":"local-plugin","summary":"built"}',stopReason:'completed'},caller);
  const late=await h.service.recordCreation({requestId:found.requestId,childId:claim.childId,status:'running'},caller);assert.equal(late.status,'creation_completed');assert.match(late.creation.result,/pluginDirectory/);
});
test('completed creator artifact activation goes through the generated installer validator',async()=>{
  const seen=[];const h=harness({prepareGeneratedPlugins:async args=>{seen.push(args);assert.equal(args.caller.workspaceId,caller.workspaceId);assert.equal(args.artifact.pluginDirectory,'local-plugin');await args.save([{requestId:'generated-a',status:'ready'}]);return{status:'ready',plugins:[{requestId:'generated-a',status:'ready'}]};}});
  const found=await find(h,{...input,goal:'缺口预览'});await h.service.prepareCreation({requestId:found.requestId},caller);const claim=await h.service.claimCreation({requestId:found.requestId},caller);
  await h.service.recordCreation({requestId:found.requestId,childId:claim.childId,status:'completed',result:'{"pluginDirectory":"local-plugin","summary":"built"}'},caller);
  const ready=await h.service.activate({requestId:found.requestId},caller,authorized);assert.equal(ready.status,'ready');assert.equal(seen.length,1);assert.equal(h.installs,0);
});
test('non-JSON child output and missing generated installer do not become readiness',async()=>{
  const h=harness(),found=await find(h,{...input,goal:'缺口预览'});await h.service.prepareCreation({requestId:found.requestId},caller);const claim=await h.service.claimCreation({requestId:found.requestId},caller);
  await h.service.recordCreation({requestId:found.requestId,childId:claim.childId,status:'completed',result:'I think done'},caller);
  await assert.rejects(h.service.activate({requestId:found.requestId},caller,authorized));assert.equal(h.installs,0);
});
test('previously ready plugins are rechecked and version conflicts remove readiness',async()=>{
  let active=true,calls=0;
  const h=harness({prepare:async args=>{calls++;if(!active)throw fail('PLUGIN_INSTALL_CONFLICT');const rows=[{candidateId:'preview',packageName:'preview',version:'1.0.0',spec:'preview@1.0.0',requestId:'fixed-receipt',status:'ready',active:true}];await args.save(rows);return{status:'ready',plugins:rows};}});
  const found=await find(h);assert.equal((await h.service.activate({requestId:found.requestId},caller,authorized)).status,'ready');
  active=false;const stale=await h.service.activate({requestId:found.requestId},caller,authorized);
  assert.equal(stale.status,'blocked');assert.equal(stale.error.code,'PLUGIN_INSTALL_CONFLICT');assert.equal(calls,2);assert.equal((await h.service.status({requestId:found.requestId},caller)).status,'blocked');
});
test('disabled exact plugin can be enabled only through the adapter and applicable authorization',async()=>{
  let enabled=true,changes=0;
  const h=harness({prepare:async args=>{if(!enabled){enabled=true;changes++;}const rows=[{candidateId:'preview',packageName:'preview',version:'1.0.0',spec:'preview@1.0.0',requestId:'existing-source',status:'ready',active:enabled}];await args.save(rows);return{status:'ready',plugins:rows};}});
  const found=await find(h);await h.service.activate({requestId:found.requestId},caller,authorized);enabled=false;
  await assert.rejects(h.service.activate({requestId:found.requestId},caller,{authorize:async()=>false}),{code:'AGENT_AUTHORIZATION_REQUIRED'});assert.equal(enabled,false);assert.equal(changes,0);
  assert.equal((await h.service.activate({requestId:found.requestId},caller,authorized)).status,'ready');assert.equal(changes,1);
});
test('status can observe an in-flight installation without waiting for the mutation lock',async()=>{
  const started=deferred(),finish=deferred();const h=harness({prepare:async args=>{started.resolve();await finish.promise;const rows=[{candidateId:'preview',status:'ready'}];await args.save(rows);return{status:'ready',plugins:rows};}});
  const found=await find(h),pending=h.service.activate({requestId:found.requestId},caller,authorized);await started.promise;
  const current=await h.service.status({requestId:found.requestId},caller);assert.equal(current.status,'activating');
  finish.resolve();assert.equal((await pending).status,'ready');
});
test('generic adapter failure with no receipt remains unknown and cannot be replayed',async()=>{
  const h=harness({prepare:async()=>{throw Error('credential-bearing private fault');}}),found=await find(h);
  const unknown=await h.service.activate({requestId:found.requestId},caller,authorized);assert.equal(unknown.status,'installation_unknown');assert.doesNotMatch(JSON.stringify(unknown),/credential-bearing/);
  await h.service.activate({requestId:found.requestId},caller,authorized);assert.equal(h.installs,1);
});
test('fresh confirmation that discovers a reusable plugin returns to activation without a creator claim',async()=>{
  const h=harness({reuseAfterCreation:true}),found=await find(h,{...input,goal:'缺口预览'});
  const revised=await h.service.prepareCreation({requestId:found.requestId},caller);
  assert.equal(revised.plan.kind,'single');assert.equal(revised.status,'planned');assert.equal(revised.nextAction,'activate_plan');
  await assert.rejects(h.service.claimCreation({requestId:found.requestId},caller),{code:'AGENT_CREATION_NOT_READY'});
});
test('partial creation answers persist without confirming unanswered questions',async()=>{
  const questions=[{id:'one',question:'布局',options:['简洁'],reason:'未知'},{id:'two',question:'数量',options:['二'],reason:'未知'}];
  const h=harness({questions}),found=await find(h,{...input,goal:'缺口预览'});await h.service.prepareCreation({requestId:found.requestId},caller);const count=h.calls.length;
  const partial=await h.service.prepareCreation({requestId:found.requestId,answers:[{id:'one',answer:'简洁',assumed:false}]},caller);
  assert.equal(partial.status,'creation_draft');assert.equal(partial.creation.answers.length,1);assert.equal(h.calls.length,count);
});
test('public tool answers without assumed are recorded as Agent assumptions rather than user confirmations',async()=>{
  const questions=[{id:'layout',question:'布局',options:['简洁'],reason:'尚未明确'}];
  const h=harness({questions}),found=await find(h,{...input,goal:'缺口预览'});await h.service.prepareCreation({requestId:found.requestId},caller);
  const ready=await h.service.prepareCreation({requestId:found.requestId,answers:[{id:'layout',answer:'简洁'}]},caller);
  assert.equal(ready.status,'creation_ready');assert.equal(ready.creation.answers[0].assumed,true);
  const count=h.calls.length;await h.service.prepareCreation({requestId:found.requestId,answers:[{id:'layout',answer:'简洁'}]},caller);assert.equal(h.calls.length,count);
});
test('stale in-flight installation without a receipt becomes explicit unknown after process recreation',async()=>{
  const h=harness(),found=await find(h),row=h.rows.get(found.requestId),record=JSON.parse(row.serialized);
  record.status='activating';record.preparation={kind:'existing',status:'pending',plugins:[]};h.rows.set(found.requestId,{...row,serialized:JSON.stringify(record)});
  const recovered=await h.factory().activate({requestId:found.requestId},caller,authorized);assert.equal(recovered.status,'installation_unknown');assert.equal(recovered.error.code,'AGENT_INTERRUPTED');assert.equal(h.installs,0);
});
test('history write committed before lost acknowledgement is not overwritten by discovery error reporting',async()=>{
  let failed=false;
  const h=harness({failAfterCommit:row=>{const record=JSON.parse(row.serialized);if(!failed&&Object.keys(record.history.rows).length===1&&!record.history.pointer.activeTaskId){failed=true;return true;}return false;}});
  await assert.rejects(find(h),{code:'HISTORY_STORAGE_FAILED'});
  const row=JSON.parse([...h.rows.values()][0].serialized),task=JSON.parse(Object.values(row.history.rows)[0].serialized);
  assert.equal(task.revisions.length,1);assert.equal(task.revisions[0].workflow.stage,'understand');assert.equal(h.calls.length,1);
  const loaded=await find(h);assert.equal(loaded.status,'discovery_failed');assert.equal(h.calls.length,1);
  assert.equal(Object.keys(JSON.parse(h.rows.get(loaded.requestId).serialized).history.rows).length,1);
});
test('committed creation history survives lost acknowledgement without a stale error write',async()=>{
  let failed=false;
  const h=harness({failAfterCommit:row=>{const record=JSON.parse(row.serialized),task=Object.values(record.history.rows)[0];if(task&&!failed&&JSON.parse(task.serialized).revisions.at(-1).workflow.creation){failed=true;return true;}return false;}});
  const found=await find(h,{...input,goal:'缺口预览'});
  await assert.rejects(h.service.prepareCreation({requestId:found.requestId},caller),{code:'HISTORY_STORAGE_FAILED'});
  const record=JSON.parse(h.rows.get(found.requestId).serialized),task=JSON.parse(Object.values(record.history.rows)[0].serialized);
  assert.equal(task.revisions.length,3);assert.ok(task.revisions.at(-1).workflow.creation);assert.equal(record.creator,undefined);assert.equal(h.installs,0);
});
test('planned results give a machine-callable controlled activation step for native, single and combo',async()=>{
  for(const goal of ['原生预览','专用预览','组合预览']){
    const h=harness(),found=await find(h,{...input,goal});
    assert.deepEqual(found.nextTool,{name:'finder_activate',arguments:{requestId:found.requestId}});
    assert.match(found.callerInstruction,/不要.*profile.*CLI/u);assert.match(found.callerInstruction,/依赖.*Finder/u);
    const ready=await h.service.activate({requestId:found.requestId},caller,authorized);
    assert.equal(ready.nextTool,undefined);assert.equal(ready.nextAction,'continue_original_task');assert.match(ready.callerInstruction,/原任务.*真实.*验收/u);
  }
});
test('gap and Creator lifecycle expose exact next tools without claiming universal supply absence or respawning unknown work',async()=>{
  const questions=[{id:'layout',question:'布局',options:['简洁'],reason:'未明确'}];
  const h=harness({questions,partial:true}),found=await find(h,{...input,goal:'缺口预览'});
  assert.deepEqual(found.nextTool,{name:'finder_create',arguments:{requestId:found.requestId}});assert.match(found.callerInstruction,/复核供给|供给复核/u);assert.match(found.callerInstruction,/不能.*全市场/u);
  const draft=await h.service.prepareCreation({requestId:found.requestId},caller);assert.equal(draft.nextTool.name,'finder_create');assert.match(draft.callerInstruction,/原任务.*answers.*假设/u);
  const prepared=await h.service.prepareCreation({requestId:found.requestId,answers:[{id:'layout',answer:'简洁'}]},caller);assert.equal(prepared.nextTool.name,'finder_create');
  const claimed=await h.service.claimCreation({requestId:found.requestId},caller);assert.equal(claimed.nextTool.name,'finder_status');
  const running=await h.service.recordCreation({requestId:found.requestId,childId:claimed.childId,status:'running'},caller);assert.equal(running.nextTool.name,'finder_status');assert.match(running.callerInstruction,/不.*重派/u);
  const unknown=await h.service.recordCreation({requestId:found.requestId,childId:claimed.childId,status:'unknown'},caller);assert.equal(unknown.nextTool.name,'finder_status');
  const completed=await h.service.recordCreation({requestId:found.requestId,childId:claimed.childId,status:'completed',result:'{"pluginDirectory":"source","summary":"fixture"}'},caller);assert.equal(completed.nextTool.name,'finder_activate');
});
test('uncertain installation routes to observation rather than another install or CLI workaround',async()=>{
  const h=harness({prepare:async()=>{throw fail('PLUGIN_INSTALL_PENDING');}}),found=await find(h);
  const unknown=await h.service.activate({requestId:found.requestId},caller,authorized);
  assert.deepEqual(unknown.nextTool,{name:'finder_status',arguments:{requestId:found.requestId}});assert.match(unknown.callerInstruction,/不.*重复.*安装/u);assert.equal(h.installs,1);
});
test('Agent projections omit the internal handoff draft while retaining its exact stored history bytes and all task facts',async()=>{
  const h=harness(),found=await find(h,{...input,goal:'缺口预览'}),prepared=await h.service.prepareCreation({requestId:found.requestId},caller);
  const serialized=h.rows.get(found.requestId).serialized,record=JSON.parse(serialized),task=JSON.parse(Object.values(record.history.rows)[0].serialized),stored=task.revisions.at(-1).workflow.creation;
  assert.equal(typeof stored.draft,'string');assert.ok(stored.draft.length>0);assert.equal(prepared.creation.draft,undefined);
  assert.equal(prepared.originalRequest,task.originalRequest);assert.ok(prepared.originalRequest.includes('缺口预览'));assert.ok(prepared.originalRequest.includes(input.acceptance));assert.ok(prepared.originalRequest.includes(input.constraints[0]));
  const expected=Object.fromEntries(Object.entries(stored).filter(([key])=>key!=='draft'));assert.deepEqual(prepared.creation,expected);
  assert.equal((await h.service.status({requestId:found.requestId},caller)).creation.draft,undefined);
  assert.equal(h.rows.get(found.requestId).serialized,serialized);assert.equal(JSON.parse(Object.values(JSON.parse(serialized).history.rows)[0].serialized).revisions.at(-1).workflow.creation.draft,stored.draft);
});
test('creation claim preserves the first immutable prompt fingerprint across replay, completion and scope checks',async()=>{
  const h=harness(),found=await find(h,{...input,goal:'缺口预览'});await h.service.prepareCreation({requestId:found.requestId},caller);
  const before=JSON.parse(h.rows.get(found.requestId).serialized),draft=JSON.parse(Object.values(before.history.rows)[0].serialized).revisions.at(-1).workflow.creation.draft;
  const firstHash='a'.repeat(64),claim=await h.service.claimCreation({requestId:found.requestId},caller,{promptHash:firstHash});
  assert.equal(claim.creation.promptHash,firstHash);
  const repeated=await h.service.claimCreation({requestId:found.requestId},caller,{promptHash:'b'.repeat(64)});assert.equal(repeated.claim,'existing');assert.equal(repeated.childId,claim.childId);assert.equal(repeated.creation.promptHash,firstHash);
  await assert.rejects(h.service.claimCreation({requestId:found.requestId},other,{promptHash:firstHash}),{code:'AGENT_REQUEST_UNAVAILABLE'});
  await h.service.recordCreation({requestId:found.requestId,childId:claim.childId,status:'completed',result:'{"pluginDirectory":"local","summary":"fixture"}'},caller);
  assert.equal((await h.service.status({requestId:found.requestId},caller)).creation.promptHash,firstHash);
  const after=JSON.parse(h.rows.get(found.requestId).serialized);assert.equal(JSON.parse(Object.values(after.history.rows)[0].serialized).revisions.at(-1).workflow.creation.draft,draft);
});
test('malformed internal prompt fingerprints cannot acquire a creation claim',async()=>{
  const h=harness(),found=await find(h,{...input,goal:'缺口预览'});await h.service.prepareCreation({requestId:found.requestId},caller);
  await assert.rejects(h.service.claimCreation({requestId:found.requestId},caller,{promptHash:'not-a-sha256'}),{code:'AGENT_INVALID_INPUT'});
  assert.equal(JSON.parse(h.rows.get(found.requestId).serialized).creator,undefined);
});

test('a creation claim compares its prepared revision and specification inside the request lock before reserving',async()=>{
  const question={id:'layout',question:'使用哪种布局',options:['A','B'],reason:'需要明确'};
  const h=harness({questions:[question]}),found=await find(h,{...input,goal:'缺口预览'});
  await h.service.prepareCreation({requestId:found.requestId},caller);
  const first=await h.service.prepareCreation({requestId:found.requestId,answers:[{id:'layout',answer:'A'}]},caller);
  const current=await h.service.prepareCreation({requestId:found.requestId,answers:[{id:'layout',answer:'B'}]},caller);
  const serialized=h.rows.get(found.requestId).serialized;
  const options={promptHash:'a'.repeat(64),expectedRevisionId:first.revisionId,expectedContentHash:first.creation.contentHash};
  const stale=await h.service.claimCreation({requestId:found.requestId},caller,options);
  assert.equal(stale.claim,'stale');assert.equal(stale.childId,undefined);
  assert.deepEqual(stale.creation.answers,current.creation.answers);
  assert.equal(h.rows.get(found.requestId).serialized,serialized,'stale preparation must not create a durable reservation');
  assert.equal(JSON.parse(serialized).creator,undefined);
  const fresh=await h.service.claimCreation({requestId:found.requestId},caller,{...options,expectedRevisionId:current.revisionId,expectedContentHash:current.creation.contentHash});
  assert.equal(fresh.claim,'acquired');assert.ok(fresh.childId);
});

test('creation CAS rejects a mismatched revision even when its content fingerprint is current',async()=>{
  const h=harness(),found=await find(h,{...input,goal:'缺口预览'}),ready=await h.service.prepareCreation({requestId:found.requestId},caller);
  const before=h.rows.get(found.requestId).serialized;
  const result=await h.service.claimCreation({requestId:found.requestId},caller,{promptHash:'a'.repeat(64),expectedRevisionId:'old-revision',expectedContentHash:ready.creation.contentHash});
  assert.equal(result.claim,'stale');assert.equal(h.rows.get(found.requestId).serialized,before);
  for(const options of [{expectedRevisionId:'x'},{expectedContentHash:ready.creation.contentHash},{expectedRevisionId:ready.revisionId,expectedContentHash:'bad-hash'}])await assert.rejects(h.service.claimCreation({requestId:found.requestId},caller,options),{code:'AGENT_INVALID_INPUT'});
});

test('a stale creation claim returns a newly found existing solution instead of reserving or hiding its next step',async()=>{
  const options={questions:[{id:'layout',question:'使用哪种布局',options:['A','B'],reason:'需要明确'}]};
  const h=harness(options),found=await find(h,{...input,goal:'缺口预览'});
  await h.service.prepareCreation({requestId:found.requestId},caller);
  const first=await h.service.prepareCreation({requestId:found.requestId,answers:[{id:'layout',answer:'A'}]},caller);
  options.reuseAfterCreation=true;
  const current=await h.service.prepareCreation({requestId:found.requestId,answers:[{id:'layout',answer:'B'}]},caller);
  assert.equal(current.status,'planned');assert.equal(current.plan.kind,'single');
  const before=h.rows.get(found.requestId).serialized;
  const result=await h.service.claimCreation({requestId:found.requestId},caller,{promptHash:'a'.repeat(64),expectedRevisionId:first.revisionId,expectedContentHash:first.creation.contentHash});
  assert.equal(result.claim,'stale');assert.equal(result.nextTool.name,'finder_activate');assert.equal(result.childId,undefined);
  assert.equal(h.rows.get(found.requestId).serialized,before);
});

const injectionHint={kind:'missing-injection',service:'webServer'};
async function failedGenerated(options={},actor=caller){
  const calls=[];
  const h=harness({...options,failWrite:(...args)=>options.failWrite?.(...args),failAfterCommit:(...args)=>options.failAfterCommit?.(...args),prepareGeneratedPlugins:async args=>{
    calls.push(args);
    if(options.generated)return options.generated(args,calls.length);
    const row={requestId:'install-'+calls.length,packageName:'generated-preview-'+calls.length,version:'0.1.0',sourceDirectory:args.artifact.pluginDirectory,fingerprint:'a'.repeat(64),spec:'file:/workspace/archive.tgz',status:'failed',application:'failed',code:'PLUGIN_INSTALL_FAILED',failureHint:injectionHint};
    await args.save([row]);throw Object.assign(fail(row.code),{failureHint:injectionHint});
  }});
  const found=await find(h,{...input,goal:'缺口预览'},actor);
  const prepare=async(directory='/workspace/a/first')=>{
    const snapshot=await h.service.prepareCreation({requestId:found.requestId},actor);
    const claim=await h.service.claimCreation({requestId:found.requestId},actor,{expectedRevisionId:snapshot.revisionId,expectedContentHash:snapshot.creation.contentHash,promptHash:'b'.repeat(64)});
    await h.service.recordCreation({requestId:found.requestId,childId:claim.childId,status:'completed',result:JSON.stringify({pluginDirectory:directory,summary:'fixture'})},actor);
    return claim;
  };
  const claim=await prepare(options.directory);const blocked=await h.service.activate({requestId:found.requestId},actor,authorized);
  return{...h,requestId:found.requestId,claim,blocked,generatedCalls:calls,complete:prepare,actor};
}
test('known generated failure offers bounded repair and durably retains the old artifact without copying or mutating Core history',async()=>{
  const h=await failedGenerated();assert.equal(h.blocked.status,'blocked');
  assert.deepEqual(h.blocked.error.failureHint,injectionHint);assert.equal(h.blocked.nextTool.name,'finder_create');assert.match(h.blocked.nextTool.arguments.feedback,/webServer/);
  assert.match(h.blocked.nextTool.arguments.feedback,/宿主报告.*上下文问题/u);assert.match(h.blocked.nextTool.arguments.feedback,/优先.*已核.*公开接口/u);assert.doesNotMatch(h.blocked.nextTool.arguments.feedback,/插件缺少显式服务注入声明/u);
  const before=JSON.parse(h.rows.get(h.requestId).serialized),feedback=h.blocked.nextTool.arguments.feedback;
  const repaired=await h.service.prepareCreation({requestId:h.requestId,feedback},caller);
  assert.equal(repaired.status,'creation_ready');assert.equal(repaired.repairCount,1);assert.equal(repaired.repairFeedback,feedback);assert.equal(repaired.creation.childId,undefined);assert.equal(repaired.preparation,undefined);
  const after=JSON.parse(h.rows.get(h.requestId).serialized);assert.deepEqual(after.history,before.history);assert.equal(after.repairAttempts.length,1);assert.deepEqual(after.repairAttempts[0].creator,before.creator);assert.deepEqual(after.repairAttempts[0].preparation,before.preparation);assert.equal(after.repairAttempts[0].history,undefined);assert.equal(repaired.repairAttempts,undefined);
  assert.notEqual(repaired.revisionId,h.claim.revisionId);
  assert.equal((await h.service.claimCreation({requestId:h.requestId},caller,{expectedRevisionId:h.claim.revisionId,expectedContentHash:h.claim.creation.contentHash})).claim,'stale');
});
test('concurrent duplicate repair feedback reserves one new child and late old completions cannot attach',async()=>{
  const h=await failedGenerated(),feedback=h.blocked.nextTool.arguments.feedback;
  const [a,b]=await Promise.all([h.service.prepareCreation({requestId:h.requestId,feedback},caller),h.service.prepareCreation({requestId:h.requestId,feedback},caller)]);
  assert.equal(a.repairCount,1);assert.equal(b.repairCount,1);
  const [c,d]=await Promise.all([h.service.claimCreation({requestId:h.requestId},caller),h.service.claimCreation({requestId:h.requestId},caller)]);assert.equal(c.childId,d.childId);assert.notEqual(c.childId,h.claim.childId);
  const active=await h.service.prepareCreation({requestId:h.requestId,feedback:'another failure'},caller);assert.equal(active.creation.childId,c.childId);assert.equal(active.repairCount,1);
  await assert.rejects(h.service.recordCreation({requestId:h.requestId,childId:h.claim.childId,status:'completed',result:'{}'},caller),{code:'AGENT_CREATION_CONFLICT'});
});
test('at most two generated repairs use distinct operation ids and server-owned superseded snapshots',async()=>{
  const h=await failedGenerated();
  for(let number=1;number<=2;number++){
    const current=await h.service.status({requestId:h.requestId},caller);assert.equal(current.nextTool.name,'finder_create');
    await h.service.prepareCreation(current.nextTool.arguments,caller);await h.complete('/workspace/a/repair-'+number);
    const blocked=await h.service.activate({requestId:h.requestId},caller,authorized);assert.equal(blocked.status,'blocked');assert.equal(blocked.repairCount,number);
  }
  const before=h.rows.get(h.requestId).serialized,last=await h.service.status({requestId:h.requestId},caller);assert.equal(last.nextTool,undefined);
  const result=await h.service.prepareCreation({requestId:h.requestId,feedback:'third repair'},caller);assert.equal(result.status,'blocked');assert.equal(h.rows.get(h.requestId).serialized,before);
  assert.equal(new Set(h.generatedCalls.map(args=>args.operationId)).size,3);
  assert.equal(h.generatedCalls[0].superseded.length,0);assert.equal(h.generatedCalls[2].superseded.length,2);
  const previous=h.generatedCalls[2].superseded[0];assert.equal(previous.sessionId,caller.sessionId);assert.equal(previous.workspaceId,caller.workspaceId);assert.equal(previous.directory,caller.directory);assert.equal(previous.requestId,h.requestId);assert.equal(previous.preparation.plugins[0].requestId,'install-1');
});
test('legacy failed conflict can receive explicit repair feedback but cannot fabricate automatic evidence or ownership',async()=>{
  const h=await failedGenerated({generated:async args=>{await args.save([{requestId:'legacy',packageName:'legacy-preview',version:'1.0.0',status:'failed',code:'PLUGIN_INSTALL_CONFLICT'}]);throw fail('PLUGIN_INSTALL_CONFLICT');}});
  assert.equal(h.blocked.nextTool,undefined);const repaired=await h.service.prepareCreation({requestId:h.requestId,feedback:'已核对旧版未激活，请在独立新产物中修复'},caller);assert.equal(repaired.repairCount,1);
  const old=JSON.parse(h.rows.get(h.requestId).serialized).repairAttempts[0].preparation.plugins[0];assert.equal(old.initiallyAbsent,undefined);assert.equal(old.failureHint,undefined);
});
test('unknown, active and approval or restart failures never authorize a new repair',async()=>{
  for(const [code,status,application] of [['PLUGIN_INSTALL_PENDING','unknown','failed'],['PLUGIN_INSTALL_FAILED','installing','failed'],['PLUGIN_INSTALL_APPROVAL_REQUIRED','failed','failed'],['PLUGIN_INSTALL_RESTART_REQUIRED','failed','restart-required']]){
    const h=await failedGenerated({generated:async args=>{await args.save([{requestId:'inflight',status,application,code,failureHint:injectionHint}]);throw Object.assign(fail(code),{failureHint:injectionHint});}}),before=h.rows.get(h.requestId).serialized;
    const result=await h.service.prepareCreation({requestId:h.requestId,feedback:'尝试修复'},caller);assert.equal(result.creation.childId,h.claim.childId);assert.equal(result.repairCount,0);assert.equal(h.rows.get(h.requestId).serialized,before);assert.notEqual(result.nextTool?.name,'finder_create');
  }
});
test('repair persists before clearing authority, and storage ACK uncertainty cannot overwrite the committed attempt',async()=>{
  for(const after of [false,true]){
    const options={},h=await failedGenerated(options);options[after?'failAfterCommit':'failWrite']=row=>JSON.parse(row.serialized).repairAttempts?.length===1;
    await assert.rejects(h.service.prepareCreation({requestId:h.requestId,feedback:'针对已知失败独立修复'},caller),{code:'AGENT_STORAGE_FAILED'});
    const record=JSON.parse(h.rows.get(h.requestId).serialized);assert.equal(record.repairAttempts?.length,after?1:undefined);assert.equal(record.creator?.childId,after?undefined:h.claim.childId);
    options.failAfterCommit=undefined;options.failWrite=undefined;
    const recovered=await h.factory().prepareCreation({requestId:h.requestId,feedback:'针对已知失败独立修复'},caller);assert.equal(recovered.repairCount,1);
  }
});
test('repair context references only an existing non-symlink directory inside the trusted workspace',async()=>{
  const root=await mkdtemp(join(tmpdir(),'finder-repair-'));
  try{
    const directory=join(root,'old');await mkdir(directory);const actor={...caller,directory:root};
    const h=await failedGenerated({directory},actor);const repaired=await h.service.prepareCreation({requestId:h.requestId,feedback:'定点修复'},actor);
    assert.deepEqual(repaired.repairContext,{previousPluginDirectory:directory,previousPackageName:'generated-preview-1',previousVersion:'0.1.0',previousSourceDirectory:directory,previousFingerprint:'a'.repeat(64),failureHint:injectionHint});
    await symlink(directory,join(root,'linked'));
    for(const invalid of ['/outside/plugin',join(root,'linked')]){
      const bad=await failedGenerated({directory:invalid},actor),snapshot=await bad.service.prepareCreation({requestId:bad.requestId,feedback:'定点修复'},actor);assert.equal(snapshot.repairContext,undefined);
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
test('failure hints never echo unrecognized service payloads or raw SDK diagnostics',async()=>{
  const h=await failedGenerated({generated:async args=>{
    const failureHint={kind:'missing-injection',service:'/private/secret service',diagnostic:'credential private detail'};
    await args.save([{requestId:'bad',status:'failed',code:'PLUGIN_INSTALL_FAILED'}]);throw Object.assign(fail('PLUGIN_INSTALL_FAILED'),{failureHint,diagnostic:'credential private detail'});
  }});
  assert.equal(h.blocked.error.failureHint,undefined);assert.equal(h.blocked.nextTool,undefined);assert.ok(!JSON.stringify(h.blocked).includes('credential private detail'));
  const snapshot=await h.service.prepareCreation({requestId:h.requestId,feedback:'修复已知源码故障'},caller);assert.equal(snapshot.repairCount,1);
  await assert.rejects(h.service.prepareCreation({requestId:h.requestId,feedback:'x'.repeat(3001)},caller),{code:'AGENT_INVALID_INPUT'});
  await assert.rejects(h.service.prepareCreation({requestId:h.requestId,feedback:'safe',sourceDirectory:'/forged'},caller),{code:'AGENT_INVALID_INPUT'});
});
test('generated validation before the first mutation can be repaired without inventing an installation receipt',async()=>{
  const h=await failedGenerated({generated:async()=>{throw new FinderError('PLUGIN_INSTALL_INVALID');}});
  assert.equal(h.blocked.status,'blocked');assert.equal(h.blocked.preparation.plugins.length,0);assert.equal(h.blocked.error.code,'PLUGIN_INSTALL_INVALID');
  const result=await h.service.prepareCreation({requestId:h.requestId,feedback:'修复已核对的打包校验问题'},caller);assert.equal(result.status,'creation_ready');assert.equal(result.repairCount,1);
  const old=JSON.parse(h.rows.get(h.requestId).serialized).repairAttempts[0];assert.deepEqual(old.preparation.plugins,[]);
});
test('a currently active artifact never becomes a repair claim even if an adapter reports another failure',async()=>{
  const h=await failedGenerated({generated:async args=>{await args.save([{requestId:'active',status:'failed',active:true,code:'PLUGIN_INSTALL_FAILED',failureHint:injectionHint}]);throw Object.assign(fail('PLUGIN_INSTALL_FAILED'),{failureHint:injectionHint});}});
  const before=h.rows.get(h.requestId).serialized,result=await h.service.prepareCreation({requestId:h.requestId,feedback:'不能重建已激活结果'},caller);assert.equal(result.repairCount,0);assert.equal(h.rows.get(h.requestId).serialized,before);assert.equal(result.nextTool,undefined);
});
test('syntactically valid service strings outside known SDK services cannot become repair instructions',async()=>{
  const h=await failedGenerated({generated:async args=>{await args.save([{requestId:'bad',status:'failed',code:'PLUGIN_INSTALL_FAILED'}]);throw Object.assign(fail('PLUGIN_INSTALL_FAILED'),{failureHint:{kind:'missing-injection',service:'AKIASecretToken'}});}});
  assert.equal(h.blocked.error.failureHint,undefined);assert.equal(h.blocked.nextTool,undefined);assert.ok(!JSON.stringify(h.blocked).includes('AKIASecretToken'));
});
test('ready generated capability preserves only the fixed safe retirement blocker without blocking the original task',async()=>{
  const receipt={requestId:'new-install',status:'ready',active:true,retirements:[{status:'unknown',code:'PLUGIN_RETIREMENT_READBACK_REQUIRED'}]},retirement={status:'blocked',code:'PLUGIN_RETIREMENT_PERSISTENCE_UNAVAILABLE'};
  const h=harness({prepareGeneratedPlugins:async args=>{await args.save([receipt]);return{status:'ready',plugins:[receipt],retirement:{...retirement,diagnostic:'private SDK detail',sourceDirectory:'/private/secret'}};}});
  const found=await find(h,{...input,goal:'缺口预览'});await h.service.prepareCreation({requestId:found.requestId},caller);const claim=await h.service.claimCreation({requestId:found.requestId},caller);
  await h.service.recordCreation({requestId:found.requestId,childId:claim.childId,status:'completed',result:'{"pluginDirectory":"/workspace/a/generated","summary":"fixture"}'},caller);
  const ready=await h.service.activate({requestId:found.requestId},caller,authorized);assert.equal(ready.status,'ready');assert.equal(ready.nextAction,'continue_original_task');assert.deepEqual(ready.preparation.retirement,retirement);assert.deepEqual(ready.preparation.plugins[0].retirements,receipt.retirements);
  const stored=JSON.parse(h.rows.get(found.requestId).serialized);assert.deepEqual(stored.preparation.retirement,retirement);assert.ok(!h.rows.get(found.requestId).serialized.includes('private SDK detail'));assert.ok(!h.rows.get(found.requestId).serialized.includes('/private/secret'));
  assert.deepEqual((await h.factory().status({requestId:found.requestId},caller)).preparation.retirement,retirement);
});
test('unknown retirement shapes never enter a ready preparation or change its next action',async()=>{
  for(const retirement of [{status:'blocked',code:'PRIVATE_ERROR',diagnostic:'private detail'},{status:'unknown',code:'PLUGIN_RETIREMENT_PERSISTENCE_UNAVAILABLE'},{status:'blocked',code:'PLUGIN_RETIREMENT_PERSISTENCE_UNAVAILABLE extra'},null,'private detail']){
    const h=harness({prepareGeneratedPlugins:async()=>({status:'ready',plugins:[{status:'ready',active:true}],retirement})});
    const found=await find(h,{...input,goal:'缺口预览'});await h.service.prepareCreation({requestId:found.requestId},caller);const claim=await h.service.claimCreation({requestId:found.requestId},caller);
    await h.service.recordCreation({requestId:found.requestId,childId:claim.childId,status:'completed',result:'{"pluginDirectory":"/workspace/a/generated","summary":"fixture"}'},caller);
    const result=await h.service.activate({requestId:found.requestId},caller,authorized);assert.equal(result.status,'ready');assert.equal(result.preparation.retirement,undefined);assert.equal(result.nextAction,'continue_original_task');assert.ok(!h.rows.get(found.requestId).serialized.includes('private detail'));
  }
});
