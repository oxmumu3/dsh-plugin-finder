import test from 'node:test';
import assert from 'node:assert/strict';
import * as contracts from '../src/contracts.js';
import {createFinderService} from '../src/service.js';
import {registerFinderRoutes} from '../src/routes.js';
import {createFinderController} from '../src/client.js';

const copy=structuredClone;
const intent={goal:'保留原始单位的尺寸对照本',input:'120厘米与2.5米合成材料',output:'持久CRUD尺寸本，统一mm',constraints:['只写当前工作区独立子目录','复用换算器，不重写换算'],capabilities:['换算长度','持久CRUD'],queries:['length converter','persistent CRUD']};
const plugin={id:'converter',name:'converter',capabilities:['长度单位换算'],requirements:{},install:{type:'npm',spec:'converter@1.0.0',version:'1.0.0'},evidence:{metadata:'manifest-checked'}};
const plan={kind:'hybrid',title:'复用换算器，只补尺寸本',rationale:'现成工具换算，新部件记录',pluginIds:['converter'],gaps:[{capability:'持久CRUD',reason:'只补工作区持久交互'}],steps:[{capability:'换算长度',owner:'converter',sourceCapability:'长度单位换算',action:'换算',input:'原值与单位',output:'mm'},{capability:'持久CRUD',owner:'create',sourceCapability:null,action:'添加持久交互',input:'原值、单位和mm结果',output:'尺寸记录'}],limits:Array.from({length:8},(_,i)=>'模型前提'+i)};
const request='保留原始单位的尺寸对照本，只写当前工作区独立子目录，复用换算器，不重写换算。';
function fixture(){
 const rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null},modelCalls=0,searches=0,installs=0;
 const store={read:async id=>copy(rows.get(id)),write:async row=>rows.set(row.id,copy(row)),list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>{pointer=copy(value);}};
 const model={status:()=>({configured:true}),close(){},call:async({system})=>{modelCalls++;return{text:JSON.stringify(system.includes('本阶段只抽取')?intent:plan),model:{label:'synthetic'}};}};
 const warnings=['来源附加说明一','来源附加说明二','长来源说明'+ 'x'.repeat(1100)];
 const factory=()=>createFinderService({historyStore:store,model,discovery:{search:async()=>{searches++;return{candidates:[plugin],sources:[{id:'synthetic',status:'live'}],warnings,searchedAt:'2026-11-03T22:00:00Z'};}},hostVersion:'0.2.1-rc.5',search:({plugins})=>plugins,preparePlugins:async()=>{installs++;assert.fail('restoration must not install');}});
 return{rows,factory,get modelCalls(){return modelCalls;},get searches(){return searches;},get installs(){return installs;},warnings};
}
function connect(service,transform=value=>value){
 const routes=[],calls=[],preferences=new Map();registerFinderRoutes({get:()=>({fetch:{register:route=>{routes.push(route);return()=>{};}}}),effect:()=>{}},service);
 const fetch=async(url,options={})=>{const route=routes.find(route=>new URL(url,'http://local').pathname===route.path);assert.ok(route);const response=await route.fetch(new Request('http://local'+route.path,options)),value=await response.json();calls.push({path:route.path,status:response.status});return{ok:response.ok,status:response.status,json:async()=>transform(copy(value))};};
 const controller=createFinderController({},{fetch,draftStorage:{getItem:key=>preferences.get(key)??null,setItem:(key,value)=>preferences.set(key,value),removeItem:key=>preferences.delete(key)}});
 return{controller,calls};
}

test('real service risk enrichment survives history and client recommendation plus refresh without model retry',async()=>{
 const f=fixture(),service=f.factory(),first=connect(service);await first.controller.bootstrap();first.controller.setHomeRequest(request);
 assert.equal(await first.controller.searchHome(),true);const shown=first.controller.getSnapshot();assert.equal(shown.error,'');assert.equal(shown.stage,'plan');assert.equal(shown.plan.kind,'hybrid');assert.equal(shown.plan.limits.length,14);
 assert.deepEqual(shown.plan.limits.slice(0,8),plan.limits);for(const warning of f.warnings)assert.ok(shown.plan.limits.includes(warning));assert.ok(shown.plan.limits.some(value=>value.length>500));
 assert.equal(first.calls.find(call=>call.path.endsWith('/recommend')).status,200);assert.equal(f.modelCalls,2);assert.equal(f.searches,1);assert.equal(f.installs,0);
 assert.throws(()=>contracts.parsePlan({...plan,limits:shown.plan.limits},[plugin],intent),cause=>cause.code==='MODEL_INVALID_OUTPUT'&&cause.details.path==='plan.limits');
 const bytes=copy([...f.rows.values()]);first.controller.close();service.close();
 const restored=connect(f.factory());await restored.controller.bootstrap();const state=restored.controller.getSnapshot();
 assert.equal(state.error,'');assert.equal(state.stage,'plan');assert.deepEqual(state.plan.limits,shown.plan.limits);assert.deepEqual(state.plan.steps,shown.plan.steps);assert.deepEqual(state.plan.gaps,shown.plan.gaps);
 assert.equal(state.taskId,shown.taskId);assert.equal(state.revisionId,shown.revisionId);assert.equal(f.modelCalls,2);assert.equal(f.searches,1);assert.equal(f.installs,0);assert.deepEqual([...f.rows.values()],bytes);restored.controller.close();
});

test('stored plan bounds are distinct from raw model limits while strict core references remain enforced',()=>{
 assert.equal(typeof contracts.parseStoredPlan,'function');
 const limits=[...plan.limits,...Array.from({length:92},()=> 'x'.repeat(4000))],stored={...copy(plan),limits,nextPrompt:'保留的执行提示'};
 assert.equal(contracts.parseStoredPlan(stored,[plugin],intent).limits.length,100);assert.equal(contracts.parseStoredPlan(stored,[plugin],intent).limits.at(-1).length,4000);
 assert.throws(()=>contracts.parsePlan({...plan,limits},[plugin],intent),{code:'MODEL_INVALID_OUTPUT'});
 for(const mutate of [
  value=>value.limits.push('第101条'),value=>value.limits[8]='x'.repeat(4001),value=>value.steps[0].owner='unknown-owner',
  value=>value.steps.pop(),value=>value.gaps[0].capability='不属于原任务',value=>value.steps[0].sourceCapability='不存在的工具能力',
 ]){const value=copy(stored);mutate(value);assert.throws(()=>contracts.parseStoredPlan(value,[plugin],intent),{code:'INVALID_BACKUP'});}
});

test('client restoration still refuses unknown owners and missing coverage after risk enrichment',async()=>{
 const f=fixture(),service=f.factory(),understood=await service.analyze({request});await service.recommend({taskId:understood.workflow.taskId,revisionId:understood.workflow.revisionId,intent});const bytes=copy([...f.rows.values()]);
 for(const mutate of [value=>value.steps[0].owner='unknown-owner',value=>value.steps.pop(),value=>value.limits.push(...Array(101).fill('oversize'))]){
  const linked=connect(service,value=>{if(value.workflow?.plan)mutate(value.workflow.plan);return value;});await linked.controller.bootstrap();assert.equal(linked.controller.getSnapshot().plan,null);assert.match(linked.controller.getSnapshot().notice,/格式无法恢复/u);linked.controller.close();
 }
 assert.deepEqual([...f.rows.values()],bytes);assert.equal(f.modelCalls,2);assert.equal(f.installs,0);service.close();
});
