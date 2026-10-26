import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpportunityEngine,parseOpportunityOutput} from '../src/opportunities.js';
import {withOpportunityApi} from '../src/opportunity-api.js';
import {FinderError} from '../src/contracts.js';
import {createFinderService} from '../src/service.js';

const copy=value=>structuredClone(value),ids=value=>({taskId:value.workflow.taskId,revisionId:value.workflow.revisionId});
const intent={goal:'整理项目进展',input:'授权材料',output:'可核对的简报',constraints:[],capabilities:['整理资料'],queries:['project summary']};
const nativePlan={kind:'native',title:'直接整理一份简报',rationale:'可用当前模型完成',pluginIds:[],steps:[{capability:'整理资料',owner:'dsh',action:'核对授权材料并整理',input:'材料',output:'简报'}],limits:['结果需要核对']};
const material=(id,request)=>({id,serialized:JSON.stringify({id,originalRequest:request,updatedAt:'2026-10-24T00:00:00Z',revisions:[{id:id+'-r1',workflow:{intent,plan:{title:'项目简报'},stage:'plan'}}]})});
function fixture(options={}){
 let state=options.state??null,writes=0,reads=0,modelCalls=0;const rows=new Map([['selected',material('selected','项目每次手动整理进展')],['private',material('private','NEVER_SEND_PRIVATE_TASK')]]);
 const store={read:async()=>copy(state),write:async value=>{writes++;if(options.failWrite?.(writes))throw Error('PRIVATE_STORAGE_ERROR');state=copy(value);}};
 const historyStore={read:async id=>{reads++;return copy(rows.get(id));},list:async()=>copy([...rows.values()])};
 const readWorkspaceContext=Object.assign(async input=>options.readContext?options.readContext(input):({workspaceId:input.workspaceId,items:[{id:'file:a',title:'a.md',text:'项目材料',source:{path:'a.md',sha256:'a'.repeat(64)}}]}),{validateWorkspace:async({workspaceId})=>({workspaceId,title:'本工作区'}),metadata:async({workspaceId})=>({workspaceId,title:'本工作区',files:[{path:'a.md',name:'a.md',size:12}],truncated:false})});
 const answer=data=>({opportunities:[{title:'复用项目简报流程',observation:'选定材料里包含进展整理，可以固化为一份模板。',expectedResult:'一份带来源的简报',suggestedRequest:'根据授权材料整理可复用的项目进展简报。',evidenceIds:[data.items[0].id]}],emptyReason:''});
 const model={status:()=>({configured:true}),call:async input=>{modelCalls++;return options.model?options.model(input,modelCalls):{text:JSON.stringify(answer(input.data)),model:{label:'host-real-interface'}};}};
 const engine=createOpportunityEngine({store,historyStore,model,readWorkspaceContext,clock:options.clock??(()=>new Date('2026-10-24T12:00:00Z'))});
 return{engine,store,historyStore,rows,readWorkspaceContext,model,answer,get state(){return copy(state);},get writes(){return writes;},get reads(){return reads;},get modelCalls(){return modelCalls;}};
}
const grant=engine=>engine.grant({enabled:true,historyTaskIds:['selected']});

test('no consent means no model call, no selected content read and no storage mutation',async()=>{
 const f=fixture();await assert.rejects(f.engine.discover(),{code:'OPPORTUNITY_CONSENT_REQUIRED'});assert.equal(f.modelCalls,0);assert.equal(f.reads,0);assert.equal(f.writes,0);
});
test('selected history alone enters model data; metadata choices omit requests, and history stays byte exact',async()=>{
 let seen;const f=fixture({model:async input=>{seen=input;return{text:JSON.stringify(f.answer(input.data)),model:{label:'host'}};}});const before=copy([...f.rows.values()]);
 const choices=(await f.engine.status()).historyChoices;assert.equal(choices.length,2);assert.ok(choices.every(row=>Object.keys(row).sort().join(',')==='taskId,title,updatedAt'));assert.doesNotMatch(JSON.stringify(choices),/NEVER_SEND_PRIVATE_TASK/);
 await grant(f.engine);const result=await f.engine.discover();assert.equal(result.opportunities.length,1);assert.match(JSON.stringify(seen.data),/每次手动整理/);assert.doesNotMatch(JSON.stringify(seen.data),/NEVER_SEND_PRIVATE_TASK/);assert.match(seen.system,/不可信数据/);assert.equal(seen.signal instanceof AbortSignal,true);assert.deepEqual([...f.rows.values()],before);
 assert.equal(result.opportunities[0].evidenceRefs[0].source.taskId,'selected');assert.equal(result.model.label,'host');
});
test('workspace payload is truncated honestly and omits absolute root and obvious credentials',async()=>{
 let seen;const f=fixture({readContext:async()=>({workspaceId:'w',root:'/Users/name/private',items:[{id:'file:a',title:'a.md',text:'Bearer PRIVATE_SECRET '+('资料'.repeat(8000)),source:{path:'a.md',sha256:'a'.repeat(64)}}]}),model:async input=>{seen=input.data;return{text:JSON.stringify(f.answer(input.data))};}});
 await f.engine.grant({enabled:true,historyTaskIds:[],workspace:{workspaceId:'w',paths:['a.md']}});await f.engine.discover();assert.equal(seen.items[0].text.length,4000);assert.equal(seen.items[0].truncated,true);assert.doesNotMatch(JSON.stringify(seen),/PRIVATE_SECRET|Users|root/);assert.ok(JSON.stringify(seen).length<60000);
});
test('unknown evidence and malformed model output fail without fixed recommendation fallback',async()=>{
 const f=fixture({model:async()=>({text:JSON.stringify({opportunities:[{title:'编造',observation:'编造',expectedResult:'编造',suggestedRequest:'编造需求',evidenceIds:['invented']}],emptyReason:''})})});await grant(f.engine);await assert.rejects(f.engine.discover(),{code:'OPPORTUNITY_INVALID_OUTPUT'});const state=await f.engine.status();assert.equal(state.status,'failed');assert.equal(state.opportunities.length,0);assert.equal(state.lastError.code,'OPPORTUNITY_INVALID_OUTPUT');
});
test('a valid empty result is represented as empty, not an error or curated fallback',async()=>{
 const f=fixture({model:async()=>({text:JSON.stringify({opportunities:[],emptyReason:'没有足够证据。'})})});await grant(f.engine);const value=await f.engine.discover();assert.equal(value.status,'empty');assert.equal(value.emptyReason,'没有足够证据。');assert.deepEqual(value.opportunities,[]);
});
test('same authorized content uses cache; explicit force invokes the model again',async()=>{
 const f=fixture();await grant(f.engine);const a=await f.engine.discover(),b=await f.engine.discover();assert.equal(f.modelCalls,1);assert.equal(a.opportunities[0].id,b.opportunities[0].id);await f.engine.discover({force:true});assert.equal(f.modelCalls,2);assert.equal(a.expiresAt,'2026-10-25T12:00:00.000Z');
});
test('revocation aborts discovery, discards late output, and prevents old opportunity adoption',async()=>{
 let release,entered;const started=new Promise(resolve=>entered=resolve);const f=fixture({model:async input=>{entered();return new Promise(resolve=>release=()=>resolve({text:JSON.stringify(f.answer(input.data))}));}});await grant(f.engine);const pending=f.engine.discover();await started;await f.engine.grant({enabled:false});release();await assert.rejects(pending,{code:'MODEL_ABORTED'});const state=await f.engine.status();assert.equal(state.consent.enabled,false);assert.equal(state.status,'idle');assert.deepEqual(state.opportunities,[]);
});
test('changed source during model generation or before adoption invalidates the opportunity',async()=>{
 const f=fixture({model:async input=>{f.rows.set('selected',material('selected','已经不同的材料'));return{text:JSON.stringify(f.answer(input.data))};}});await grant(f.engine);await assert.rejects(f.engine.discover(),{code:'OPPORTUNITY_STALE'});
 const g=fixture();await grant(g.engine);const value=await g.engine.discover();g.rows.set('selected',material('selected','材料已更新'));await assert.rejects(g.engine.currentOpportunity(value.opportunities[0].id),{code:'OPPORTUNITY_STALE'});
});
test('regrant changes epoch and old card id cannot be adopted',async()=>{
 const f=fixture();await grant(f.engine);const old=(await f.engine.discover()).opportunities[0];await grant(f.engine);await assert.rejects(f.engine.currentOpportunity(old.id),{code:'OPPORTUNITY_NOT_FOUND'});
});
test('dismissal suppresses rewritten suggestions from the same evidence and context',async()=>{
 const f=fixture({model:async(input,n)=>{const reply=f.answer(input.data);reply.opportunities[0].suggestedRequest+=String(n);return{text:JSON.stringify(reply)};}});await grant(f.engine);const old=(await f.engine.discover()).opportunities[0];await f.engine.feedback({opportunityId:old.id,feedback:'irrelevant'});const result=await f.engine.discover({force:true});assert.equal(result.status,'empty');assert.equal(result.opportunities.length,0);assert.match(result.emptyReason,/已处理/);
});
test('restart preserves consent, feedback and cache, but an interrupted run is not shown as running',async()=>{
 const f=fixture();await grant(f.engine);await f.engine.discover();const g=fixture({state:f.state});assert.equal((await g.engine.status()).consent.enabled,true);await g.engine.discover();assert.equal(g.modelCalls,0);
 const h=fixture({state:{...f.state,status:'running',runId:'interrupted'}});const status=await h.engine.status();assert.equal(status.status,'failed');assert.equal(status.lastError.code,'OPPORTUNITY_INTERRUPTED');
});

function apiFixture(options={}){
 const f=fixture(options);let analyses=0,recommends=0,opens=0;const workflows=new Map();
 const core={bootstrap:async()=>({workflow:null,history:[]}),close(){},analyze:async input=>{analyses++;options.seenAnalyze?.(input);if(options.analyze)return options.analyze(input);const workflow={taskId:'adopted-task',revisionId:'analysis-r1',intent,request:input.request,localOnly:input.localOnly};workflows.set(workflow.revisionId,workflow);return{intent,workflow};},recommend:async input=>{recommends++;if(options.recommend)return options.recommend(input,recommends);const workflow={taskId:input.taskId,revisionId:'plan-r2',intent,plan:nativePlan};workflows.set(workflow.revisionId,workflow);return{workflow};},open:async input=>{opens++;return{workflow:workflows.get(input.revisionId)??{taskId:input.taskId,revisionId:input.revisionId,intent}};}};
 const api=withOpportunityApi(core,{store:f.store,model:f.model,historyStore:f.historyStore,readWorkspaceContext:f.readWorkspaceContext});
 return{...f,api,core,get analyses(){return analyses;},get recommends(){return recommends;},get opens(){return opens;}};
}
async function opportunity(api){await api.opportunityGrant({enabled:true,historyTaskIds:['selected']});return(await api.opportunityDiscover()).opportunity.opportunities[0];}
test('explicit adoption creates one private analysis task and one plan, even under concurrent double click',async()=>{
 let analyzeInput;const f=apiFixture({seenAnalyze:input=>analyzeInput=input});const card=await opportunity(f.api);const input={opportunityId:card.id,workspaceId:'workspace'};
 const [a,b]=await Promise.all([f.api.opportunityAdopt(input),f.api.opportunityAdopt(input)]);assert.equal(a.workflow.taskId,b.workflow.taskId);assert.equal(f.analyses,1);assert.equal(f.recommends,1);assert.equal(analyzeInput.localOnly,true);assert.match(analyzeInput.request,/仅是资料/);assert.match(analyzeInput.request,/保留原始材料/);assert.equal(a.adoption.status,'ready');
 await f.api.opportunityAdopt(input);assert.equal(f.analyses,1);assert.equal(f.recommends,1);assert.equal(f.opens,1);
});
test('failed recommendation resumes exact bound task without repeating analysis',async()=>{
 const f=apiFixture({recommend:async(input,n)=>{if(n===1)throw new FinderError('MODEL_REQUEST_FAILED');return{workflow:{taskId:input.taskId,revisionId:'plan-r2',intent,plan:nativePlan}};}});const card=await opportunity(f.api);const input={opportunityId:card.id,workspaceId:'workspace'};
 await assert.rejects(f.api.opportunityAdopt(input),{code:'MODEL_REQUEST_FAILED'});const status=(await f.api.opportunityStatus()).opportunity;assert.equal(status.adoptions[0].taskId,'adopted-task');assert.equal(status.adoptions[0].status,'failed');const result=await f.api.opportunityAdopt(input);assert.equal(result.workflow.taskId,'adopted-task');assert.equal(f.analyses,1);assert.equal(f.recommends,2);
});
test('unknown analysis result remains pending and never guesses another matching-text task',async()=>{
 const f=apiFixture({analyze:async()=>{throw new FinderError('HISTORY_STORAGE_FAILED');}});const card=await opportunity(f.api),input={opportunityId:card.id,workspaceId:'workspace'};await assert.rejects(f.api.opportunityAdopt(input),{code:'HISTORY_STORAGE_FAILED'});const result=await f.api.opportunityAdopt(input);assert.equal(result.pending,true);assert.equal(result.adoption.status,'claimed');assert.equal(f.analyses,1);assert.equal(f.recommends,0);
});
test('workspace-bound opportunity cannot move to a different current workspace',async()=>{
 const f=apiFixture();await f.api.opportunityGrant({enabled:true,historyTaskIds:[],workspace:{workspaceId:'bound',paths:['a.md']}});const card=(await f.api.opportunityDiscover()).opportunity.opportunities[0];await assert.rejects(f.api.opportunityAdopt({opportunityId:card.id,workspaceId:'different'}),{code:'OPPORTUNITY_WORKSPACE_MISMATCH'});assert.equal(f.analyses,0);
});
test('storage failure is reported without changing original history or making an unauthorized model call',async()=>{
 const f=fixture({failWrite:()=>true});const before=copy([...f.rows]);await assert.rejects(grant(f.engine),{code:'OPPORTUNITY_STORAGE_FAILED'});assert.equal(f.modelCalls,0);assert.deepEqual([...f.rows],before);
});
test('opportunity-derived real service revisions remain private and cannot enter accepted central telemetry',async()=>{
 let pointer={activeTaskId:null,activeRevisionId:null};const rows=new Map(),events=[];
 const historyStore={read:async id=>copy(rows.get(id)),write:async row=>rows.set(row.id,copy(row)),list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async v=>pointer=copy(v)};
 const core=createFinderService({historyStore,model:{status:()=>({configured:true}),call:async input=>({text:JSON.stringify(input.system.includes('仅允许 {"kind"')?nativePlan:intent)})},discovery:{search:async()=>({candidates:[],sources:[{id:'live',status:'live'}],warnings:[],searchedAt:'2026-10-24T00:00:00Z'})},telemetry:{capture:async()=>({epochId:'accepted',acceptedAt:'2020-01-01T00:00:00Z'}),createEvent:async value=>{events.push(value);return null;}}});
 const analyzed=await core.analyze({request:'整理项目材料，保留来源。',localOnly:true});assert.equal(analyzed.workflow.localOnly,true);const planned=await core.recommend({intent:analyzed.intent,...ids(analyzed)});assert.equal(planned.workflow.localOnly,true);assert.equal(events.length,0);assert.equal(rows.size,1);assert.equal(JSON.parse([...rows.values()][0].serialized).format,2);
});

test('all source constraints survive model discovery and deterministic adoption quoting',async()=>{
 let modelInput,adoptedInput;const f=apiFixture({model:async input=>{modelInput=input;return{text:JSON.stringify(f.answer(input.data))};},seenAnalyze:input=>adoptedInput=input});
 const task=JSON.parse(f.rows.get('selected').serialized),constraints=Array.from({length:12},(_,i)=>'来源限制'+(i+1)+'：保留该条已确认范围。');task.originalConstraints=constraints;task.revisions[0].workflow.intent={...intent,constraints};f.rows.set('selected',{id:task.id,serialized:JSON.stringify(task)});
 const card=await opportunity(f.api);assert.deepEqual(modelInput.data.items[0].constraints,constraints);await f.api.opportunityAdopt({opportunityId:card.id,workspaceId:'workspace'});for(const restriction of constraints)assert.ok(adoptedInput.request.includes(restriction));assert.match(adoptedInput.request,/需核对对本次任务的适用范围/);
});
test('too many complete source restrictions exceed the budget explicitly instead of silently dropping them',async()=>{
 const f=fixture();const selected=[];for(let i=0;i<8;i++){const row=material('task-'+i,'项目材料');const task=JSON.parse(row.serialized);task.originalConstraints=Array.from({length:24},(_,j)=>'限制'+j+'：'+('范围'.repeat(160)));row.serialized=JSON.stringify(task);f.rows.set(row.id,row);selected.push(row.id);}
 await f.engine.grant({enabled:true,historyTaskIds:selected});await assert.rejects(f.engine.discover(),{code:'CONTEXT_LIMIT'});assert.equal(f.modelCalls,0);
});
test('later feedback has a seven-day cooldown and changed source can be reconsidered sooner',async()=>{
 let now=new Date('2026-10-24T12:00:00Z');const f=fixture({clock:()=>new Date(now)});await grant(f.engine);let card=(await f.engine.discover()).opportunities[0];await f.engine.feedback({opportunityId:card.id,feedback:'later'});assert.equal((await f.engine.status()).opportunities.length,0);assert.equal((await f.engine.status()).restorableFeedbackCount,1);
 now=new Date('2026-10-31T12:00:00Z');assert.equal((await f.engine.discover()).opportunities.length,1);
 card=(await f.engine.status()).opportunities[0];await f.engine.feedback({opportunityId:card.id,feedback:'later'});f.rows.set('selected',material('selected','材料已经有实质更新'));assert.equal((await f.engine.discover({force:true})).opportunities.length,1);
});
test('restore is scoped to the active epoch, performs no model call, and keeps history intact',async()=>{
 const f=fixture();await grant(f.engine);const card=(await f.engine.discover()).opportunities[0],epoch=(await f.engine.status()).consent.epoch;const before=copy([...f.rows]);await f.engine.feedback({opportunityId:card.id,feedback:'known'});
 await assert.rejects(f.engine.feedback({feedback:'restore',epoch:'old'}),{code:'OPPORTUNITY_STALE'});await assert.rejects(f.engine.feedback({feedback:'restore'}),{code:'OPPORTUNITY_STALE'});assert.equal((await f.engine.status()).opportunities.length,0);
 const calls=f.modelCalls,result=await f.engine.feedback({feedback:'restore',epoch});assert.equal(result.opportunities.length,1);assert.equal(result.restorableFeedbackCount,0);assert.equal(f.modelCalls,calls);assert.deepEqual([...f.rows],before);
});
test('durable workspace binding guards execution and legacy Creator claims after consent is revoked',async()=>{
 const f=apiFixture();let executions=0,creators=0;f.core.executionClaim=async()=>{executions++;return{ok:true};};f.core.creatorClaim=async()=>{creators++;return{ok:true};};const card=await opportunity(f.api);await f.api.opportunityAdopt({opportunityId:card.id,workspaceId:'original'});await f.api.opportunityGrant({enabled:false});
 await assert.rejects(f.api.executionClaim({taskId:'adopted-task',workspaceId:'other'}),{code:'OPPORTUNITY_WORKSPACE_MISMATCH'});await assert.rejects(f.api.creatorClaim({taskId:'adopted-task',workspaceId:'other'}),{code:'OPPORTUNITY_WORKSPACE_MISMATCH'});assert.equal(executions,0);assert.equal(creators,0);
 assert.equal((await f.api.executionClaim({taskId:'adopted-task',workspaceId:'original'})).ok,true);assert.equal((await f.api.creatorClaim({taskId:'ordinary-old-task',workspaceId:'other'})).ok,true);assert.equal(executions,1);assert.equal(creators,1);
 const restarted=withOpportunityApi(f.core,{store:f.store,model:f.model,historyStore:f.historyStore,readWorkspaceContext:f.readWorkspaceContext});await assert.rejects(restarted.executionClaim({taskId:'adopted-task',workspaceId:'other'}),{code:'OPPORTUNITY_WORKSPACE_MISMATCH'});
});
test('adoption capacity fails without dropping older bindings or unknown claims',async()=>{
 const f=fixture();await grant(f.engine);const card=(await f.engine.discover()).opportunities[0];const state=f.state;state.adoptions=Array.from({length:100},(_,i)=>({id:'claim-'+i,opportunityId:'old-'+i,epoch:state.consent.epoch,workspaceId:'w',status:'claimed',phase:'analyze',request:'未知结果必须保留',createdAt:'2026-10-24T12:00:00Z',updatedAt:'2026-10-24T12:00:00Z'}));const g=fixture({state});await assert.rejects(g.engine.claimAdoption(card,'w'),{code:'OPPORTUNITY_CAPACITY'});assert.equal(g.state.adoptions.length,100);assert.equal(g.state.adoptions[0].id,'claim-0');
});
for(const mode of ['before-write','commit-then-error'])test('revocation fails closed in runtime after '+mode,async()=>{
 const f=fixture();await grant(f.engine);const card=(await f.engine.discover()).opportunities[0];const original=f.store.write;f.store.write=async value=>{if(value.consent.enabled===false){if(mode==='commit-then-error')await original(value);throw Error('PRIVATE_DISK_FAILURE');}return original(value);};
 await assert.rejects(f.engine.grant({enabled:false}),{code:'OPPORTUNITY_STORAGE_FAILED'});const status=await f.engine.status();assert.equal(status.consent.enabled,false);assert.equal(status.lastError.code,'OPPORTUNITY_REVOCATION_NOT_SAVED');const calls=f.modelCalls;await assert.rejects(f.engine.discover(),{code:'OPPORTUNITY_CONSENT_REQUIRED'});await assert.rejects(f.engine.currentOpportunity(card.id),{code:'OPPORTUNITY_CONSENT_REQUIRED'});assert.equal(f.modelCalls,calls);
 f.store.write=original;await grant(f.engine);assert.equal((await f.engine.status()).consent.enabled,true);
});
test('authorized old history remains in choices beyond the newest twenty; missing material is explicit',async()=>{
 const f=fixture();for(let i=0;i<25;i++){const row=material('new-'+i,'新任务');const value=JSON.parse(row.serialized);value.updatedAt='2026-10-25T12:'+String(i).padStart(2,'0')+':00Z';row.serialized=JSON.stringify(value);f.rows.set(row.id,row);}
 await grant(f.engine);let status=await f.engine.status();assert.equal(status.historyChoices.length,20);assert.equal(status.historyChoices[0].taskId,'selected');f.rows.delete('selected');status=await f.engine.status();assert.equal(status.historyChoices[0].taskId,'selected');assert.equal(status.historyChoices[0].unavailable,true);await assert.rejects(f.engine.discover(),{code:'WORKFLOW_NOT_FOUND'});assert.equal(f.modelCalls,0);await f.engine.grant({enabled:false});assert.equal((await f.engine.status()).consent.enabled,false);
});

test('source restrictions are not silently redacted; obvious secrets in selected history fail before the model',async()=>{
 for(const restriction of ['API_KEY=abcdefghijklmnop123456','只能处理 /Users/someone/private/path 中的资料']){
  const f=fixture(),task=JSON.parse(f.rows.get('selected').serialized);task.originalConstraints=[restriction];f.rows.set('selected',{id:task.id,serialized:JSON.stringify(task)});await grant(f.engine);await assert.rejects(f.engine.discover(),{code:'CONTEXT_FILE_BLOCKED'});assert.equal(f.modelCalls,0);
 }
 const f=fixture();f.rows.set('selected',material('selected','sk-'+('x'.repeat(30))));await grant(f.engine);await assert.rejects(f.engine.discover(),{code:'CONTEXT_FILE_BLOCKED'});assert.equal(f.modelCalls,0);
});

test('corrupt persisted authorization cannot become an unbounded context read',async()=>{
 const f=fixture();await grant(f.engine);const state=f.state;state.consent.historyTaskIds=Array.from({length:9},(_,i)=>'too-many-'+i);const g=fixture({state});await assert.rejects(g.engine.discover(),{code:'OPPORTUNITY_STORAGE_FAILED'});assert.equal(g.reads,0);assert.equal(g.modelCalls,0);
});

for(const code of ['MODEL_UNAVAILABLE','MODEL_TIMEOUT','MODEL_REQUEST_FAILED','MODEL_INVALID_OUTPUT','MODEL_INCOMPLETE','MODEL_OUTPUT_LIMIT','ACCOUNT_SIGN_IN_REQUIRED','ACCOUNT_QUOTA','ACCOUNT_TOKEN_INVALID'])test('explicit retry of pre-append '+code+' reuses one adoption claim',async()=>{
 let count=0;const f=apiFixture({analyze:async input=>{count++;if(count===1)throw new FinderError(code);return{intent,workflow:{taskId:'safe-retry-task',revisionId:'analysis-r1',intent,request:input.request,localOnly:true}};}});const card=await opportunity(f.api),input={opportunityId:card.id,workspaceId:'workspace'};
 await assert.rejects(f.api.opportunityAdopt(input),{code});let status=(await f.api.opportunityStatus()).opportunity,first=status.adoptions[0];assert.equal(first.status,'failed');assert.equal(first.phase,'analyze');assert.equal(first.retryableAnalysis,true);assert.equal(first.taskId,undefined);assert.equal(f.analyses,1);
 const [result,duplicate]=await Promise.all([f.api.opportunityAdopt(input),f.api.opportunityAdopt(input)]);assert.equal(result.adoption.id,first.id);assert.equal(duplicate.adoption.id,first.id);assert.equal(result.adoption.status,'ready');assert.equal(f.analyses,2);assert.equal(f.recommends,1);status=(await f.api.opportunityStatus()).opportunity;assert.equal(status.adoptions.length,1);assert.equal(status.adoptions[0].retryableAnalysis,false);
});
for(const cause of [new FinderError('MODEL_ABORTED'),new FinderError('CLOSED'),new FinderError('HISTORY_STORAGE_FAILED'),new FinderError('OPPORTUNITY_STORAGE_FAILED'),Object.assign(new Error('unknown provider failure'),{code:'MODEL_TIMEOUT'}),new Error('unknown')])test('uncertain '+(cause.code??cause.name)+' result remains pending with no reanalysis',async()=>{
 const f=apiFixture({analyze:async()=>{throw cause;}});const card=await opportunity(f.api),input={opportunityId:card.id,workspaceId:'workspace'};await assert.rejects(f.api.opportunityAdopt(input));const first=(await f.api.opportunityStatus()).opportunity.adoptions[0];assert.equal(first.status,'claimed');assert.equal(first.retryableAnalysis,false);const again=await f.api.opportunityAdopt(input);assert.equal(again.pending,true);assert.equal(again.adoption.id,first.id);assert.equal(f.analyses,1);assert.equal(f.recommends,0);
});
test('pre-append retry authority is cleared before the retry model call and remains pending across an unknown interruption',async()=>{
 let count=0,entered,release;const waiting=new Promise(resolve=>entered=resolve);const f=apiFixture({analyze:async()=>{count++;if(count===1)throw new FinderError('MODEL_TIMEOUT');entered();return new Promise((_resolve,reject)=>release=()=>reject(new FinderError('CLOSED')));}});const card=await opportunity(f.api),input={opportunityId:card.id,workspaceId:'workspace'};await assert.rejects(f.api.opportunityAdopt(input),{code:'MODEL_TIMEOUT'});const retry=f.api.opportunityAdopt(input);await waiting;const during=(await f.api.opportunityStatus()).opportunity.adoptions[0];assert.equal(during.status,'claimed');assert.equal(during.retryableAnalysis,false);release();await assert.rejects(retry,{code:'CLOSED'});const next=await f.api.opportunityAdopt(input);assert.equal(next.pending,true);assert.equal(f.analyses,2);
});
test('real service timeout has zero history writes; explicit retry then creates exactly one private task',async()=>{
 let pointer={activeTaskId:null,activeRevisionId:null},modelCalls=0;const rows=new Map();const historyStore={read:async id=>copy(rows.get(id)),write:async row=>rows.set(row.id,copy(row)),list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>pointer=copy(value)};
 const model={status:()=>({configured:true}),call:async input=>{modelCalls++;if(modelCalls===1)throw new FinderError('MODEL_TIMEOUT');return{text:JSON.stringify(input.system.includes('仅允许 {"kind"')?nativePlan:intent)};}};
 const core=createFinderService({historyStore,model,discovery:{search:async()=>({candidates:[],sources:[{id:'live',status:'live'}],warnings:[],searchedAt:'2026-10-24T00:00:00Z'})}}),f=fixture();const api=withOpportunityApi(core,{store:f.store,model:f.model,historyStore,readWorkspaceContext:f.readWorkspaceContext});await api.opportunityGrant({enabled:true,historyTaskIds:[],workspace:{workspaceId:'workspace',paths:['a.md']}});const card=(await api.opportunityDiscover()).opportunity.opportunities[0],input={opportunityId:card.id,workspaceId:'workspace'};
 await assert.rejects(api.opportunityAdopt(input),{code:'MODEL_TIMEOUT'});assert.equal(rows.size,0);assert.deepEqual(pointer,{activeTaskId:null,activeRevisionId:null});const claim=(await api.opportunityStatus()).opportunity.adoptions[0];const result=await api.opportunityAdopt(input);assert.equal(rows.size,1);assert.equal(modelCalls,3);assert.equal(result.adoption.id,claim.id);assert.equal(result.workflow.localOnly,true);assert.equal(pointer.activeTaskId,result.workflow.taskId);
});
