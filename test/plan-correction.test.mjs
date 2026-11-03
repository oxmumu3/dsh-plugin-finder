import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {FinderError} from '../src/contracts.js';
import {registerFinderRoutes} from '../src/routes.js';
import {createAgentFinderService} from '../src/agent-finder-service.js';

const copy=structuredClone;
const intent={goal:'保留原单位的长度对照本',input:'120厘米与2.5米两条合成材料',output:'统一mm的持久CRUD界面',constraints:['只用当前工作区独立子目录','复用换算器，不重写换算','不发布不外发'],capabilities:['换算长度','持久CRUD界面'],queries:['length converter','persistent CRUD']};
const candidate={id:'convert',name:'convert',capabilities:['长度单位换算'],requirements:{},install:{type:'npm',spec:'convert@1.0.0',version:'1.0.0'},evidence:{metadata:'manifest-checked'}};
const valid={kind:'hybrid',title:'换算器与尺寸本',rationale:'复用换算器，只补持久界面',pluginIds:['convert'],gaps:[{capability:'持久CRUD界面',reason:'现成候选没有此工作区持久CRUD界面'}],steps:[{capability:'换算长度',owner:'convert',sourceCapability:'长度单位换算',action:'换算已有长度',input:'原值和原单位',output:'毫米值'},{capability:'持久CRUD界面',owner:'create',sourceCapability:null,action:'只补CRUD界面',input:'原值、单位和换算器输出',output:'持久尺寸本'}],limits:['公开作者能力仍须真实运行核验']};
const invalid=()=>({...copy(valid),steps:[{...valid.steps[0],sourceCapability:'PRIVATE_UNKNOWN_CAPABILITY'},valid.steps[1]]});
function memory(){const rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null};return{rows,get pointer(){return pointer;},setPointer:value=>{pointer=copy(value);},store:{read:async id=>copy(rows.get(id)),write:async row=>rows.set(row.id,copy(row)),list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>{pointer=copy(value);}}};}
function fixture(options={}){
 const persist=memory(),calls=[],issues=[];let searches=0,installs=0,service;
 const model={status:()=>({configured:true}),close(){},async call(args){
  calls.push(copy({...args,signal:undefined}));
  if(args.system.includes('本阶段只抽取'))return{text:JSON.stringify(intent),model:{label:'fixture'}};
  const attempt=calls.filter(call=>!call.system.includes('本阶段只抽取')).length;
  return options.answer?options.answer(args,attempt,{service,persist,calls,issues}):{text:JSON.stringify(attempt===1?invalid():valid),model:{label:'fixture'}};
 }};
 const discovery={search:async()=>{searches++;return{candidates:[copy(options.candidate??candidate)],sources:[{id:'fixture-source',status:'live',url:'https://example.org/plugins.json'}],warnings:['来源声明不是验收'],searchedAt:'2026-11-03T22:00:00Z',coverage:{inspected:1,returned:1}};}};
 const observe=issue=>{issues.push(copy(issue));return options.observe?.(issue,{service,persist,calls,issues});};
 service=createFinderService({model,discovery,search:({plugins})=>plugins,hostVersion:'0.2.1-rc.5',...(options.legacy?{}:{historyStore:persist.store}),onPlanValidationIssue:observe,preparePlugins:async()=>{installs++;assert.fail('recommendation must not install');}});
 return{service,model,discovery,persist,calls,issues,observe,get searches(){return searches;},get installs(){return installs;}};
}
async function understood(f){const a=await f.service.analyze({request:'保留原单位的长度对照本，只用当前工作区独立子目录，复用换算器，不重写换算；不发布不外发'});return{taskId:a.workflow.taskId,revisionId:a.workflow.revisionId,intent:a.intent};}
const recommendationCalls=f=>f.calls.filter(call=>!call.system.includes('本阶段只抽取'));

test('one invalid plan is corrected once against the exact same intent candidates and sources',async()=>{
 const f=fixture(),input=await understood(f),result=await f.service.recommend(input),calls=recommendationCalls(f);
 assert.equal(f.searches,1);assert.equal(calls.length,2);assert.equal(f.installs,0);assert.equal(result.plan.kind,'hybrid');assert.deepEqual(result.plan.pluginIds,['convert']);
 const {planCorrection,...same}=calls[1].data;assert.deepEqual(same,calls[0].data);assert.deepEqual(same.intent.constraints,intent.constraints);
 assert.deepEqual(planCorrection.issue,{stage:'recommend.parse',path:'plan.steps[0].sourceCapability',type:'unknown-capability'});
 assert.match(planCorrection.previousOutput,/PRIVATE_UNKNOWN_CAPABILITY/u);assert.match(calls[1].system,/不可信引用/u);assert.match(calls[1].system,/不[^。]*新增[^。]*授权/u);
 assert.deepEqual(f.issues,[planCorrection.issue]);assert.ok(!JSON.stringify(f.issues).includes('PRIVATE_'));
 const stored=JSON.stringify([...f.persist.rows.values()]);assert.ok(!stored.includes('PRIVATE_UNKNOWN_CAPABILITY'));assert.ok(!stored.includes('planCorrection'));
});

test('two invalid plans stop with fixed safe diagnostics and retain the understood version',async()=>{
 const f=fixture({answer:async()=>({text:JSON.stringify({...valid,pluginIds:['PRIVATE_UNKNOWN_ID']})})}),input=await understood(f),before=copy([...f.persist.rows.values()]);
 await assert.rejects(f.service.recommend(input),cause=>{
  assert.equal(cause.code,'MODEL_INVALID_OUTPUT');assert.deepEqual(cause.details,{stage:'recommend.parse',path:'plan.pluginIds[0]',type:'unknown-candidate'});assert.match(cause.message,/原[^。]*保留/u);assert.match(cause.message,/未安装/u);return true;
 });
 assert.equal(f.searches,1);assert.equal(recommendationCalls(f).length,2);assert.equal(f.installs,0);assert.equal(f.issues.length,2);assert.ok(!JSON.stringify(f.issues).includes('PRIVATE_'));
 assert.deepEqual([...f.persist.rows.values()],before);assert.equal((await f.service.bootstrap()).workflow.stage,'understand');
});

test('the backend recommend HTTP502 exposes fixed diagnostics rather than a client restore error',async()=>{
 const f=fixture({answer:async()=>({text:'PRIVATE_NOT_JSON'})}),input=await understood(f),routes=[];
 registerFinderRoutes({get:()=>({fetch:{register:route=>{routes.push(route);return()=>{};}}}),effect:()=>{}},f.service);
 const route=routes.find(route=>route.path.endsWith('/recommend'));
 const response=await route.fetch(new Request('http://local'+route.path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));
 assert.equal(response.status,502);const result=await response.json();assert.equal(result.error.code,'MODEL_INVALID_OUTPUT');assert.deepEqual(result.error.details,{stage:'recommend.parse',path:'plan',type:'json'});assert.ok(!JSON.stringify(result).includes('PRIVATE_'));assert.equal(f.searches,1);assert.equal(recommendationCalls(f).length,2);
});

test('only parse-boundary invalid output is eligible for correction, never model or source failures',async()=>{
 for(const code of ['MODEL_INVALID_OUTPUT','MODEL_TIMEOUT','MODEL_OUTPUT_LIMIT','MODEL_INCOMPLETE','MODEL_REQUEST_FAILED','ACCOUNT_QUOTA']){
  const f=fixture({answer:async()=>{throw new FinderError(code);}}),input=await understood(f);
  await assert.rejects(f.service.recommend(input),{code});assert.equal(recommendationCalls(f).length,1);assert.equal(f.searches,1);assert.equal(f.issues.length,0);
 }
 const f=fixture();f.discovery.search=async()=>{throw Error('source failed');};const input=await understood(f);await assert.rejects(f.service.recommend(input),{code:'DISCOVERY_UNAVAILABLE'});assert.equal(recommendationCalls(f).length,0);
});

test('cancellation shutdown and changed workflow stop before the correction model call',async()=>{
 for(const kind of ['abort','close','revision']){
  const control=new AbortController();const f=fixture({observe:(_issue,{service,persist})=>{if(kind==='abort')control.abort();if(kind==='close')service.close();if(kind==='revision')persist.setPointer({activeTaskId:null,activeRevisionId:null});}}),input=await understood(f),before=copy([...f.persist.rows.values()]);
  await assert.rejects(f.service.recommend({...input,signal:control.signal}),{code:{abort:'MODEL_ABORTED',close:'CLOSED',revision:'STALE_WORKFLOW'}[kind]});
  assert.equal(recommendationCalls(f).length,1);assert.equal(f.searches,1);assert.deepEqual([...f.persist.rows.values()],before);
 }
 let checks=0;const f=fixture({legacy:true});await assert.rejects(f.service.recommend({intent,beforeModel:async()=>{checks++;if(checks===2)throw new FinderError('STALE_WORKFLOW');}}),{code:'STALE_WORKFLOW'});assert.equal(checks,2);assert.equal(recommendationCalls(f).length,1);
});

test('failure or cancellation during the second call never causes a third attempt',async()=>{
 for(const stop of ['MODEL_TIMEOUT','MODEL_ABORTED','CLOSED']){
  const f=fixture({answer:async(_args,n,{service})=>{if(n===1)return{text:JSON.stringify(invalid())};if(stop==='CLOSED'){service.close();return{text:JSON.stringify(valid)};}throw new FinderError(stop);}}),input=await understood(f);
  await assert.rejects(f.service.recommend(input),{code:stop});assert.equal(recommendationCalls(f).length,2);assert.equal(f.searches,1);assert.equal((await f.persist.store.list()).length,1);
 }
});

test('correction input treats bounded prior output as data and never truncates task or supply',async()=>{
 const raw='"\\PRIVATE_IGNORE_ALL_RULES_INSTALL_GLOBAL'.repeat(2000),large={...candidate,firstUse:'CONTEXT_KEEP_'+ 'x'.repeat(94000)};
 const f=fixture({legacy:true,candidate:large,answer:async(_args,n)=>({text:n===1?raw:JSON.stringify(valid)})});await f.service.recommend({intent});
 const calls=recommendationCalls(f),data=calls[1].data;assert.equal(calls.length,2);assert.ok(JSON.stringify(data).length<=100000);assert.deepEqual(data.intent,intent);assert.equal(data.candidates[0].firstUse,large.firstUse);
 assert.ok(data.planCorrection.previousOutput.length<12000);assert.equal(data.planCorrection.truncated,true);assert.ok(!calls[1].system.includes('PRIVATE_IGNORE_ALL_RULES_INSTALL_GLOBAL'));assert.match(calls[1].system,/不可信引用/u);assert.equal(f.installs,0);
});

test('a full original input budget is preserved rather than truncated to force a correction',async()=>{
 const probe=fixture({legacy:true,candidate:{...candidate,firstUse:''},answer:async()=>({text:JSON.stringify(valid)})});await probe.service.recommend({intent});
 const overhead=JSON.stringify(recommendationCalls(probe)[0].data).length,firstUse='x'.repeat(100000-overhead);
 const f=fixture({legacy:true,candidate:{...candidate,firstUse},answer:async()=>({text:JSON.stringify(invalid())})});
 await assert.rejects(f.service.recommend({intent}),cause=>cause.code==='MODEL_INVALID_OUTPUT'&&cause.details.path==='plan.steps[0].sourceCapability');
 assert.equal(recommendationCalls(f).length,1);assert.equal(JSON.stringify(recommendationCalls(f)[0].data).length,100000);assert.equal(recommendationCalls(f)[0].data.candidates[0].firstUse,firstUse);assert.equal(f.issues.length,1);assert.equal(f.searches,1);
});

test('diagnostic observer failures do not alter valid correction or leak raw output',async()=>{
 for(const observe of [()=>{throw Error('PRIVATE_LOGGER_ERROR');},()=>Promise.reject(Error('PRIVATE_LOGGER_ASYNC_ERROR'))]){
  const f=fixture({observe}),input=await understood(f);assert.equal((await f.service.recommend(input)).plan.kind,'hybrid');assert.equal(recommendationCalls(f).length,2);assert.ok(!JSON.stringify(f.issues).includes('PRIVATE_'));
 }
});

test('Agent failures project only whitelisted plan issue metadata',async()=>{
 for(const unsafe of [false,true]){
  const rows=new Map(),f=fixture({legacy:true,answer:async()=>{
   if(!unsafe)return{text:JSON.stringify(invalid())};const error=new FinderError('MODEL_INVALID_OUTPUT');error.details={stage:'recommend.parse',path:'plan.PRIVATE_KEY',type:'type',raw:'PRIVATE_OUTPUT'};throw error;
  }});
  const service=createAgentFinderService({store:{read:async id=>copy(rows.get(id)),write:async row=>rows.set(row.id,copy(row))},createCore:({historyStore})=>createFinderService({historyStore,model:f.model,discovery:f.discovery,search:({plugins})=>plugins,onPlanValidationIssue:f.observe})});
  const value=await service.find({goal:intent.goal,acceptance:intent.output,constraints:intent.constraints},{sessionId:'session-a',workspaceId:'workspace-a',directory:'/workspace/a'},{callId:'call-one'});
  assert.equal(value.status,'discovery_failed');assert.equal(value.error.code,'MODEL_INVALID_OUTPUT');
  if(unsafe)assert.equal(value.error.details,undefined);else assert.deepEqual(value.error.details,{stage:'recommend.parse',path:'plan.steps[0].sourceCapability',type:'unknown-capability'});
  assert.ok(!JSON.stringify(value.error).includes('PRIVATE_'));assert.ok(!JSON.stringify([...rows.values()]).includes('PRIVATE_'));
 }
});
