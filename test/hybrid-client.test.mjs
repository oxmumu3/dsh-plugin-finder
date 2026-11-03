import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderController} from '../src/client.js';
import {supportsCreatorHost} from '../src/creator-handoff.js';

const intent={goal:'把项目看板和风险处理放在同一工作台',input:'项目记录',output:'可操作工作台',constraints:['保留已有看板'],capabilities:['管理任务','风险处理记录'],queries:['kanban risk']};
const candidate={id:'board',name:'project-board',capabilities:['管理任务']};
const hybrid={kind:'hybrid',title:'保留看板，只补风险处理',rationale:'已有看板可用，缺少持久风险记录。',pluginIds:['board'],gaps:[{capability:'风险处理记录',reason:'现成候选不提供这项持久状态。'}],steps:[{capability:'管理任务',owner:'board',sourceCapability:'管理任务',action:'读取看板',input:'项目记录',output:'任务'},{capability:'风险处理记录',owner:'create',sourceCapability:null,action:'增加独立风险记录组件',input:'任务',output:'风险记录'}],limits:[]};
const workflow=(plan=hybrid,extra={})=>({taskId:'t1',revisionId:'r1',stage:'plan',request:intent.goal,intent,candidates:[candidate],plan,revisions:[],...extra});
const blueprint=Object.fromEntries(['name','purpose','workflow','inputs','outputs','ui','data','tools','runtime','scope','acceptance'].map(key=>[key,'只补风险记录，保留现成看板']));
function setup({initial=workflow(),questions=[],routes={}}={}){
 const calls=[],drafts=new Map();let current=initial,executions=0;
 const ctx={workspaces:{list:{getSnapshot:()=>({phase:'ready',items:[{workspaceId:'w1',title:'当前项目',sessionIds:['original']}]}),subscribe:()=>()=>{}}},sessions:{list:{getSnapshot:()=>({phase:'ready',ids:['original'],byId:{original:{id:'original',retainedBy:{mainView:1}}}}),subscribe:()=>()=>{}}},uiSession:{sessionStatus:{getSnapshot:()=>({}),subscribe:()=>()=>{}}}};
 const c=createFinderController(ctx,{draftStorage:{getItem:k=>drafts.get(k)??null,setItem:(k,v)=>drafts.set(k,v),removeItem:k=>drafts.delete(k)},waitForExecutionUI:async()=>{},executeInWorkspace:async()=>{executions++;return{dispose(){},completion:new Promise(()=>{})};},fetch:async(url,options)=>{
  const path=url.split('/').at(-1),body=options.body?JSON.parse(options.body):null;calls.push({path,body});
  if(routes[path]){const response=await routes[path](body),value=await response.json();if(value.workflow)current=value.workflow;return{...response,json:async()=>value};}
  let value={};
  if(path==='bootstrap')value={model:{configured:true},hostVersion:'0.2.1-rc.5',workflow:current};
  if(path==='creation-start'){current={...current,revisionId:'r2',creation:{status:'draft',contentHash:'hybrid-blueprint',blueprint,questions,answers:[],assumptions:[],supply:{status:'current'}}};value={workflow:current};}
  if(path==='creation-update'){current={...current,revisionId:'r3',creation:{...current.creation,status:'ready',supply:{status:'current'}}};value={workflow:current};}
  if(path==='execution-claim')value={claim:'acquired',attempt:{...body,attemptId:'a1',requestId:'q1',status:'claimed',provenance:'local',sessionId:null,prompt:'保留现成看板，只补风险能力并完成原任务。'},workflow:current};
  return{ok:true,json:async()=>value};
 }});return{c,calls,drafts,executions:()=>executions};
}

test('hybrid saved plan restores its retained plugins and concrete missing capability',async()=>{
 const {c}=setup();await c.bootstrap();assert.equal(c.getSnapshot().plan?.kind,'hybrid');assert.deepEqual(c.getSnapshot().plan.pluginIds,['board']);assert.deepEqual(c.getSnapshot().plan.gaps,hybrid.gaps);c.close();
});
test('one hybrid action prepares the supplement and executes the exact saved child revision',async()=>{
 const f=setup();await f.c.bootstrap();assert.equal(typeof f.c.completeHybridPlan,'function');assert.equal(await f.c.completeHybridPlan(),true);
 assert.deepEqual(f.calls.map(x=>x.path),['bootstrap','creation-start','creation-update','execution-claim']);assert.equal(f.calls[2].body.confirm,true);assert.equal(f.calls[3].body.revisionId,'r3');assert.equal(f.calls[3].body.kind,'create');assert.equal(f.executions(),1);f.c.close();
});
test('hybrid does not start ordinary use and silently omit the missing component',async()=>{
 const f=setup();await f.c.bootstrap();assert.equal(await f.c.runCurrentPlan(),false);assert.equal(f.calls.filter(x=>x.path==='execution-claim').length,0);f.c.close();
});
test('a real unanswered creation question stays in the current context without executing',async()=>{
 const f=setup({questions:[{id:'policy',question:'风险规则采用哪份标准？',options:[],reason:'原输入未给出'}]});await f.c.bootstrap();assert.equal(typeof f.c.completeHybridPlan,'function');assert.equal(await f.c.completeHybridPlan(),false);
 assert.equal(f.c.getSnapshot().view,'create');assert.equal(f.c.getSnapshot().creation.questions[0].id,'policy');assert.equal(f.calls.some(x=>x.path==='execution-claim'),false);f.c.close();
});
test('a malformed missing-capability claim cannot restore as a valid hybrid workflow',async()=>{
 const f=setup({initial:workflow({...hybrid,gaps:[{capability:'外部转账',reason:'不属于原始目标'}]})});await f.c.bootstrap();assert.equal(f.c.getSnapshot().plan,null);assert.equal(f.calls.some(x=>x.path==='execution-claim'),false);f.c.close();
});
test('a pure gap with a Creator-owned step restores without losing its saved request',async()=>{
 const plan={kind:'gap',title:'在当前工作区补齐能力',rationale:'需要持久交互。',pluginIds:[],steps:hybrid.steps.map(step=>({...step,owner:'create',sourceCapability:null})),limits:[]};
 const f=setup({initial:workflow(plan,{candidates:[]})});await f.c.bootstrap();assert.equal(f.c.getSnapshot().plan?.kind,'gap');assert.equal(f.c.getSnapshot().request,intent.goal);f.c.close();
});
for(const kind of ['single','gap'])test(`hybrid supply recheck becoming ${kind} chooses the matching execution without forcing creation`,async()=>{
 const single={kind:'single',title:'现成看板已能完成',rationale:'重新核对后已覆盖。',pluginIds:['board'],steps:hybrid.steps.map(step=>({...step,owner:'board',sourceCapability:step.capability})),limits:[]};
 const gap={kind:'gap',title:'缺失能力需要创建',rationale:'原候选不再适合。',pluginIds:[],steps:hybrid.steps.map(step=>({...step,owner:'create',sourceCapability:null})),limits:[]};
 const next=workflow(kind==='single'?single:gap,{revisionId:'r3',candidates:kind==='single'?[{...candidate,capabilities:intent.capabilities}]:[],creation:{status:'ready',contentHash:'rechecked',blueprint,questions:[],answers:[],assumptions:[],supply:{status:'current'}}});
 const f=setup({routes:{'creation-update':async()=>({ok:true,json:async()=>({workflow:next})})}});await f.c.bootstrap();assert.equal(await f.c.completeHybridPlan(),true);assert.equal(f.calls.find(x=>x.path==='execution-claim').body.kind,kind==='single'?'use':'create');assert.equal(f.executions(),1);f.c.close();
});
test('new release only enables creation on its exact validated rc.5 host',()=>{
 assert.equal(supportsCreatorHost('0.2.1-rc.5'),true);for(const version of ['0.2.1-rc.2','0.2.1-rc.3','0.2.1-rc.4','0.2.2-alpha.3','0.2.1',''])assert.equal(supportsCreatorHost(version),false,version);
});
