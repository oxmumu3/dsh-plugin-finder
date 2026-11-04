import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {registerFinderRoutes} from '../src/routes.js';
import {createFinderController} from '../src/client.js';
import {FinderError} from '../src/contracts.js';

const copy=structuredClone;
const intent={goal:'制作当前工作区的尺寸对照本',input:'120厘米和2.5米',output:'保留原单位的持久尺寸列表',constraints:['只用当前工作区','不发布不外发'],capabilities:['换算长度','持久尺寸交互'],queries:['length converter','persistent records']};
const candidate={id:'converter',name:'换算器',capabilities:['长度换算'],install:{type:'npm',spec:'converter@1.0.0',version:'1.0.0'},evidence:{metadata:'manifest-checked'}};
const hybrid={kind:'hybrid',title:'复用换算器，只补尺寸列表',rationale:'保留现成长度换算能力',pluginIds:['converter'],gaps:[{capability:'持久尺寸交互',reason:'本轮供给未确认工作区持久列表'}],steps:[{capability:'换算长度',owner:'converter',sourceCapability:'长度换算',action:'调用现成长度换算器',input:'原值和单位',output:'毫米'},{capability:'持久尺寸交互',owner:'create',sourceCapability:null,action:'只补记录和界面',input:'原值单位和毫米',output:'持久尺寸列表'}],limits:['实际运行仍待核验']};
const blueprint=Object.fromEntries(['name','purpose','workflow','inputs','outputs','ui','data','tools','runtime','scope','acceptance'].map(key=>[key,'复用精确版本换算器，只补当前工作区尺寸记录 '+key]));
const ids=workflow=>({taskId:workflow.taskId,revisionId:workflow.revisionId});
const exact=attempt=>Object.fromEntries(['attemptId','requestId','taskId','revisionId','kind','workspaceId','sessionId'].map(key=>[key,attempt[key]]));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function observable(value){const listeners=new Set();return{getSnapshot:()=>value,subscribe:callback=>{listeners.add(callback);return()=>listeners.delete(callback);},set(next){value=next;for(const callback of [...listeners])callback();}};}
function fixture({gap=false,failPreparation=false}={}){
  const rows=new Map(),preferences=new Map(),apiCalls=[],hostCalls={create:[],prompt:[],cancel:0},preparations=[];
  let pointer={activeTaskId:null,activeRevisionId:null},installed=false,firstInstalls=0,fail=failPreparation;
  const store={read:async id=>copy(rows.get(id)),write:async row=>rows.set(row.id,copy(row)),list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>{pointer=copy(value);}};
  const factory=()=>createFinderService({historyStore:store,hostVersion:'0.2.1-rc.5',
    discovery:{search:async()=>({candidates:[candidate],sources:[{id:'synthetic-supply',status:'live'}],searchedAt:'2026-11-03T10:00:00Z'})},
    model:{status:()=>({configured:true}),call:async args=>({text:JSON.stringify(args.system.includes('CREATION_CONFIRM_SCHEMA')?{intent,blueprint:args.data.creation.blueprint}:args.system.includes('CREATION_SCHEMA')?{strategy:'extend',reuseAssessment:'保留现成换算，只补独立持久界面',candidateDecisions:[{pluginId:'converter',decision:'reuse',reason:'声明支持长度换算'}],questions:[],assumptions:[],blueprint}:args.system.includes('仅允许 {"kind"')?gap?{...hybrid,kind:'gap',pluginIds:[],gaps:undefined,steps:[]}:hybrid:intent)})},
    preparePlugins:async args=>{
      preparations.push({operationId:args.operationId,candidates:copy(args.candidates),previous:copy(args.previous)});
      assert.equal(args.candidates.length,1);assert.equal(args.candidates[0].install.spec,'converter@1.0.0');
      if(fail){await args.save([{candidateId:'converter',packageName:'converter',spec:'converter@1.0.0',version:'1.0.0',requestId:'install-converter',status:'failed',active:false,code:'PLUGIN_INSTALL_NOT_ACTIVE'}]);throw new FinderError('PLUGIN_INSTALL_NOT_ACTIVE');}
      if(!installed){firstInstalls++;installed=true;}
      const plugins=[{candidateId:'converter',packageName:'converter',spec:'converter@1.0.0',version:'1.0.0',requestId:'install-converter',status:'ready',installed:true,enabled:true,active:true,application:'applied'}];await args.save(plugins);return{status:'ready',plugins};
    }});
  const state=observable({running:false,openState:'open',blank:true}),events=observable({entries:[],hasMore:false}),inbox=observable({'next-turn':[],'next-step':[]});
  const workspace=observable({phase:'ready',items:[{workspaceId:'workspace-a',title:'当前项目',sessionIds:['main','execution-session']}]});
  const binding={sessionId:'execution-session',eventSource:events,session:{...state,projections:{faceOf:key=>key==='inbox'?inbox:observable('cordis')},
    prompt:async(...args)=>{hostCalls.prompt.push(args);return{ok:true,value:{accepted:true}};},cancel:async()=>{hostCalls.cancel++;return{ok:true,value:{accepted:true}};}}};
  const ctx={sessions:{list:observable({phase:'ready',ids:['main'],byId:{main:{id:'main',retainedBy:{mainView:1}}}}),create:async args=>{hostCalls.create.push(args);return'execution-session';},retain:()=>({binding,ready:Promise.resolve(binding),release(){}}),binding:()=>binding},workspaces:{list:workspace},uiSession:{sessionStatus:observable(new Map())}};
  const connect=service=>{
    const routes=[];registerFinderRoutes({get:()=>({fetch:{register:route=>{routes.push(route);return()=>{};}}}),effect:()=>{}},service);
    const controller=createFinderController(ctx,{waitForExecutionUI:async()=>{},draftStorage:{getItem:key=>preferences.get(key)??null,setItem:(key,value)=>preferences.set(key,value),removeItem:key=>preferences.delete(key)},fetch:async(url,options={})=>{
      const path=new URL(url,'http://local').pathname,route=routes.find(item=>item.path===path);assert.ok(route);
      const response=await route.fetch(new Request('http://local'+path,options));apiCalls.push({path:path.split('/').at(-1),status:response.status,...(options.body?{body:JSON.parse(options.body)}:{})});return response;
    }});return controller;
  };
  const ready=async service=>{const a=await service.analyze({request:intent.goal+'，'+intent.constraints.join('；')}),p=await service.recommend({...ids(a.workflow),intent:a.intent}),d=await service.creationStart({...ids(p.workflow),trigger:'user-customization'});return(await service.creationUpdate({...ids(d.workflow),confirm:true})).workflow;};
  return{rows,apiCalls,hostCalls,preparations,factory,connect,ready,ctx,events,get firstInstalls(){return firstInstalls;},allowPreparation(){fail=false;}};
}

test('Human hybrid create prepares first installation through real controller and backend before submitting the original task',async()=>{
  const f=fixture(),service=f.factory(),workflow=await f.ready(service),controller=f.connect(service);await controller.bootstrap();
  assert.equal(await controller.createInWorkspace(),true);
  assert.deepEqual(f.apiCalls.map(call=>[call.path,call.status]),[['bootstrap',200],['execution-claim',200],['execution-record',200],['execution-prepare',200],['execution-submit-claim',200],['execution-record',200]]);
  assert.equal(f.firstInstalls,1);assert.equal(f.hostCalls.prompt.length,1);assert.deepEqual(f.hostCalls.create,[{workspaceId:'workspace-a',agentPreset:'cordis'}]);
  const prepare=f.apiCalls.find(call=>call.path==='execution-prepare'),submit=f.apiCalls.find(call=>call.path==='execution-submit-claim');assert.deepEqual(prepare.body,submit.body);assert.equal(prepare.body.sessionId,'execution-session');assert.equal(prepare.body.kind,'create');
  const saved=(await service.bootstrap()).workflow.executions[0];assert.equal(saved.status,'submitted');assert.equal(saved.preparation.status,'ready');assert.equal(saved.preparation.plugins[0].spec,'converter@1.0.0');assert.equal(saved.revisionId,workflow.revisionId);
  assert.match(f.hostCalls.prompt[0][0][0].text,/只.*缺失|仅.*缺失/u);assert.match(f.hostCalls.prompt[0][0][0].text,/converter@1\.0\.0/);assert.match(f.hostCalls.prompt[0][0][0].text,/已核实的插件安装回执/);
  controller.close();service.close();
});

test('an already created Human hybrid session stays read-only on reopen and explicitly resumes in the same session',async()=>{
  const f=fixture(),service=f.factory(),workflow=await f.ready(service),claim=await service.executionClaim({...ids(workflow),kind:'create',workspaceId:'workspace-a'}),created=await service.executionRecord({...exact(claim.attempt),sessionId:'execution-session',status:'created'});service.close();
  const restarted=f.factory(),controller=f.connect(restarted);await controller.bootstrap();controller.showCreation();await tick();await tick();
  assert.equal(f.apiCalls.length,1);assert.equal(f.preparations.length,0);assert.equal(f.hostCalls.create.length,0);assert.equal(f.hostCalls.prompt.length,0);assert.equal(controller.getSnapshot().execution.canContinue,true);
  assert.equal(await controller.continueExecution(),true);
  assert.deepEqual(f.apiCalls.map(call=>call.path),['bootstrap','execution-prepare','execution-submit-claim','execution-record']);assert.equal(f.firstInstalls,1);assert.equal(f.hostCalls.create.length,0);assert.equal(f.hostCalls.prompt.length,1);
  const saved=(await restarted.bootstrap()).workflow.executions[0];assert.equal(saved.attemptId,created.attempt.attemptId);assert.equal(saved.requestId,created.attempt.requestId);assert.equal(saved.sessionId,'execution-session');assert.equal(saved.status,'submitted');
  controller.close();restarted.close();
});

test('failed retained-plugin preparation stays created and can be retried without a new session or duplicate task',async()=>{
  const f=fixture({failPreparation:true}),service=f.factory();await f.ready(service);const controller=f.connect(service);await controller.bootstrap();await controller.createInWorkspace();
  assert.equal(f.apiCalls.some(call=>call.path==='execution-prepare'),true);assert.equal(f.apiCalls.some(call=>call.path==='execution-submit-claim'),false);assert.equal(f.hostCalls.prompt.length,0);assert.equal(controller.getSnapshot().execution.canContinue,true);
  const before=(await service.bootstrap()).workflow.executions[0];assert.equal(before.status,'created');assert.equal(before.preparation.plugins[0].status,'failed');
  f.allowPreparation();assert.equal(await controller.continueExecution(),true);assert.equal(f.hostCalls.create.length,1);assert.equal(f.hostCalls.prompt.length,1);assert.equal(f.firstInstalls,1);assert.equal(f.preparations.length,2);assert.equal(f.preparations[1].previous[0].requestId,'install-converter');
  const after=(await service.bootstrap()).workflow.executions[0];assert.equal(after.attemptId,before.attemptId);assert.equal(after.sessionId,before.sessionId);assert.equal(after.status,'submitted');
  controller.close();service.close();
});

for(const status of ['submitting','submitted'])test(`reopening ${status} Human hybrid execution never reinstalls or replays`,async()=>{
  const f=fixture(),service=f.factory(),workflow=await f.ready(service),claim=await service.executionClaim({...ids(workflow),kind:'create',workspaceId:'workspace-a'}),created=await service.executionRecord({...exact(claim.attempt),sessionId:'execution-session',status:'created'});
  await service.executionPrepare(exact(created.attempt));await service.executionSubmitClaim(exact(created.attempt));if(status==='submitted')await service.executionRecord({...exact(created.attempt),status:'submitted'});service.close();
  const count=f.preparations.length,restarted=f.factory(),controller=f.connect(restarted);await controller.bootstrap();controller.showCreation();await tick();await tick();
  assert.equal(await controller.continueExecution(),false);assert.equal(f.preparations.length,count);assert.deepEqual(f.apiCalls.map(call=>call.path),['bootstrap']);assert.equal(f.hostCalls.create.length,0);assert.equal(f.hostCalls.prompt.length,0);
  controller.close();restarted.close();
});

test('pure creation with no retained plugins uses the preparation boundary without installing anything',async()=>{
  const f=fixture({gap:true}),service=f.factory();await f.ready(service);const controller=f.connect(service);await controller.bootstrap();assert.equal(await controller.createInWorkspace(),true);
  assert.equal(f.apiCalls.find(call=>call.path==='execution-prepare')?.status,200);assert.equal(f.preparations.length,0);assert.equal(f.firstInstalls,0);assert.equal(f.hostCalls.prompt.length,1);
  controller.close();service.close();
});
