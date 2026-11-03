import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {registerFinderRoutes} from '../src/routes.js';
import {parseIntent} from '../src/contracts.js';
import {creationContentHash,creationModelData,parseConfirmedCreation,parseCreation,parseGeneratedCreation} from '../src/creation.js';

const copy=structuredClone;
const canonical={
  goal:'建立保留原单位的工作区尺寸对照本',input:'120厘米和2.5米的合成材料',output:'统一毫米的尺寸记录界面',
  constraints:['保留原值和单位','统一换算为毫米','只用当前工作区','不修改原材料','复用现成换算器','不发布不外发'],
  capabilities:['长度单位换算','保存尺寸记录','查看尺寸列表','新增尺寸记录','修改尺寸记录','删除尺寸记录'],queries:['length converter','persistent CRUD'],
};
const synonyms=['将长度归一到毫米','持久化尺寸数据','浏览尺寸条目','添加尺寸条目','编辑尺寸条目','移除尺寸条目'];
const extraConstraints=Array.from({length:6},(_,index)=>'本次明确补充限制'+index);
const candidate={id:'converter',name:'长度换算器',capabilities:['换算长度'],install:{type:'npm',spec:'converter@1.0.0',version:'1.0.0'},evidence:{metadata:'manifest-checked'}};
const blueprint={name:'尺寸对照本',purpose:canonical.goal,workflow:'打开列表，新增、修改或删除记录',inputs:canonical.input,outputs:canonical.output,ui:'当前工作区尺寸列表',data:'独立持久保存原值、原单位和毫米值',tools:'调用现成换算器，只新增记录工具',runtime:'使用当前宿主真实会话和工作区',scope:canonical.constraints.join('；'),acceptance:'两条合成材料换算后保留原值，并可持久增删改查'};
const planFor=intent=>({kind:'hybrid',title:'复用换算器，只创建尺寸记录界面',rationale:'保留现成换算工具，仅补尺寸记录能力',pluginIds:['converter'],
  gaps:intent.capabilities.slice(1).map(capability=>({capability,reason:'本轮供给未确认具备独立工作区记录接口'})),
  steps:intent.capabilities.map((capability,index)=>({capability,owner:index?'create':'converter',sourceCapability:index?null:'换算长度',action:index?'提供工作区记录能力':'调用现成换算器',input:intent.input,output:intent.output})),limits:['候选声明尚待运行核验']});
const ids=value=>({taskId:value.taskId,revisionId:value.revisionId});
function persistence(){
  const rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null};
  return {rows,store:{read:async id=>copy(rows.get(id)),write:async row=>rows.set(row.id,copy(row)),list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>{pointer=copy(value);}}};
}
function fixture({persist=persistence(),initial=canonical,refined,confirmationConstraints=[],confirmationCapabilities,questions=[],regeneratedBlueprint}={}){
  const calls=[],searches=[],routes=[];let generations=0,confirmations=0;
  const generated=value=>({strategy:'extend',reuseAssessment:'复用精确版本换算器，只补记录能力',candidateDecisions:[{pluginId:'converter',decision:'reuse',reason:'作者声明支持换算长度'}],questions,assumptions:[],blueprint:value});
  const service=createFinderService({historyStore:persist.store,hostVersion:'0.2.1-rc.5',
    discovery:{search:async args=>{searches.push(copy({...args,signal:undefined}));return{candidates:[candidate],sources:[{id:'synthetic-supply',status:'live'}],searchedAt:'2026-11-03T10:00:00Z'};}},
    model:{status:()=>({configured:true}),call:async args=>{
      calls.push(args);let value;
      if(args.system.includes('CREATION_CONFIRM_SCHEMA'))value={intent:{...args.data.priorIntent,goal:'模型重述后的标题',input:'模型重述材料',output:'模型重述结果',capabilities:typeof confirmationCapabilities==='function'?confirmationCapabilities(++confirmations):confirmationCapabilities??synonyms.slice(0,args.data.priorIntent.capabilities.length),constraints:confirmationConstraints,queries:['millimetre conversion','workspace records']},blueprint:args.data.creation.blueprint};
      else if(args.system.includes('CREATION_REFINE_SCHEMA'))value={...generated({...args.data.priorCreation.blueprint,tools:'调用换算器，记录工具和CSV导出',scope:canonical.constraints.join('；')+'；CSV仅保存在当前工作区',acceptance:'尺寸记录可导出CSV并保留原单位'}),constraints:['CSV仅保存在当前工作区']};
      else if(args.system.includes('CREATION_SCHEMA'))value=generated(generations++&&regeneratedBlueprint?regeneratedBlueprint:blueprint);
      else if(args.system.includes('仅允许 {"kind"'))value=planFor(args.data.intent);
      else value=args.data.feedback&&refined?refined:initial;
      return{text:JSON.stringify(value),model:{label:'synthetic-host'}};
    }}});
  registerFinderRoutes({get:()=>({fetch:{register:route=>{routes.push(route);return()=>{};}}}),effect:()=>{}},service);
  const request=async(endpoint,body)=>{
    const route=routes.find(item=>item.path.endsWith('/'+endpoint));
    const response=await route.fetch(new Request('http://local'+route.path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})}));
    return {status:response.status,value:await response.json()};
  };
  return{service,persist,calls,searches,request};
}
async function planned(f){
  const understood=await f.request('analyze',{request:[canonical.goal,...canonical.constraints].join('；')});assert.equal(understood.status,200);
  const planned=await f.request('recommend',{...ids(understood.value.workflow),intent:understood.value.intent});assert.equal(planned.status,200);return planned.value;
}
async function started(f,source){const result=await f.request('creation-start',{...ids(source.workflow),trigger:'user-customization'});assert.equal(result.status,200);return result.value;}

test('hybrid confirmation retains all six canonical capabilities instead of unioning six model synonyms',async()=>{
  assert.equal(new Set([...canonical.capabilities,...synonyms]).size,12);
  assert.throws(()=>parseIntent({...canonical,capabilities:[...canonical.capabilities,...synonyms]},'MODEL_INVALID_OUTPUT'),{code:'MODEL_INVALID_OUTPUT'});
  const f=fixture(),before=await planned(f),draft=await started(f,before),original=await f.service.exportTask({taskId:before.workflow.taskId});
  const confirmed=await f.request('creation-update',{...ids(draft.workflow),blueprint:copy(draft.workflow.creation.blueprint),answers:[],assumptions:[],confirm:true});
  assert.equal(confirmed.status,200,JSON.stringify(confirmed.value.error));
  const workflow=confirmed.value.workflow;
  assert.equal(draft.workflow.creation.scopeEditPending,false);assert.equal(workflow.creation.scopeEditPending,false);
  assert.equal(workflow.taskId,draft.workflow.taskId);assert.equal(workflow.revisionNumber,draft.workflow.revisionNumber+1);
  for(const key of ['goal','input','output','capabilities'])assert.deepEqual(workflow.intent[key],canonical[key]);
  assert.deepEqual(workflow.intent.constraints,canonical.constraints);
  assert.deepEqual(workflow.intent.queries,['millimetre conversion','workspace records']);
  assert.deepEqual(f.searches.at(-1).intent,workflow.intent);assert.deepEqual(workflow.plan.gaps.map(item=>item.capability),canonical.capabilities.slice(1));
  assert.equal(workflow.creation.status,'ready');assert.equal(workflow.creation.supply.status,'current');assert.match(workflow.creation.draft,/converter@1\.0\.0/);
  assert.equal(f.calls.length,5);assert.equal(f.searches.length,2);
  const saved=await f.service.exportTask({taskId:workflow.taskId});assert.deepEqual(saved.task.revisions.slice(0,original.task.revisions.length),original.task.revisions);
  const bytes=copy([...f.persist.rows.values()]),restarted=fixture({persist:f.persist});
  assert.deepEqual((await restarted.service.bootstrap()).workflow.intent,workflow.intent);assert.equal(restarted.calls.length,0);assert.deepEqual([...f.persist.rows.values()],bytes);
  const restored=fixture();await restored.service.importBackup({workflow:saved});assert.deepEqual((await restored.service.open(ids(workflow))).workflow.intent,workflow.intent);
  f.service.close();restarted.service.close();restored.service.close();
});

test('explicit task refinement becomes the current canonical scope and survives later hybrid confirmation',async()=>{
  const initial={...canonical,capabilities:canonical.capabilities.slice(0,5)},feedback='增加CSV导出，导出保留原值和原单位。',refined={...initial,goal:canonical.goal+'并导出CSV',output:canonical.output+'和CSV文件',capabilities:[...initial.capabilities,'导出CSV记录'],constraints:['CSV仅保存在当前工作区']};
  const f=fixture({initial,refined,confirmationConstraints:[]}),first=await planned(f);
  const changed=await f.request('refine',{...ids(first.workflow),feedback:feedback+'CSV仅保存在当前工作区'});assert.equal(changed.status,200);assert.deepEqual(changed.value.intent.capabilities,refined.capabilities);
  const replanned=await f.request('recommend',{...ids(changed.value.workflow),intent:changed.value.intent});assert.equal(replanned.status,200);
  const draft=await started(f,replanned.value),confirmed=await f.request('creation-update',{...ids(draft.workflow),confirm:true});
  assert.equal(confirmed.status,200,JSON.stringify(confirmed.value.error));
  assert.deepEqual(confirmed.value.workflow.intent.capabilities,refined.capabilities);assert.equal(confirmed.value.workflow.intent.goal,refined.goal);assert.equal(confirmed.value.workflow.intent.output,refined.output);
  assert.ok(confirmed.value.workflow.plan.gaps.some(item=>item.capability==='导出CSV记录'));assert.deepEqual(f.searches.at(-1).intent.capabilities,refined.capabilities);
  assert.deepEqual(confirmed.value.workflow.intent.constraints,[...canonical.constraints,'CSV仅保存在当前工作区']);
  assert.ok(f.calls.find(call=>call.system.includes('CREATION_CONFIRM_SCHEMA')).data.userFeedbackContext.includes(feedback+'CSV仅保存在当前工作区'));
  const old=await f.service.open(ids(first.workflow));assert.deepEqual(old.workflow.intent.capabilities,initial.capabilities);
  f.service.close();
});

test('creation feedback adds CSV to the bounded canonical scope used for live supply recheck',async()=>{
  const initial={...canonical,capabilities:canonical.capabilities.slice(0,5)},updated=[...initial.capabilities,'导出CSV记录'];
  const f=fixture({initial,confirmationCapabilities:updated,confirmationConstraints:['CSV仅保存在当前工作区']}),draft=await started(f,await planned(f));
  const revised=await f.request('creation-refine',{...ids(draft.workflow),feedback:'增加CSV导出，CSV仅保存在当前工作区'});assert.equal(revised.status,200);
  assert.equal(revised.value.workflow.creation.scopeEditPending,true);
  assert.deepEqual(revised.value.workflow.intent.capabilities,initial.capabilities);assert.match(revised.value.workflow.creation.blueprint.tools,/CSV导出/);
  const confirmed=await f.request('creation-update',{...ids(revised.value.workflow),confirm:true});assert.equal(confirmed.status,200,JSON.stringify(confirmed.value.error));
  assert.deepEqual(confirmed.value.workflow.intent.capabilities,updated);assert.ok(confirmed.value.workflow.plan.gaps.some(item=>item.capability==='导出CSV记录'));assert.deepEqual(f.searches.at(-1).intent.capabilities,updated);
  for(const key of ['goal','input','output'])assert.equal(confirmed.value.workflow.intent[key],initial[key]);
  assert.deepEqual(confirmed.value.workflow.intent.constraints,[...canonical.constraints,'CSV仅保存在当前工作区']);assert.match(confirmed.value.workflow.creation.draft,/CSV导出/);
  assert.equal(confirmed.value.workflow.creation.scopeEditPending,false);
  assert.ok(f.calls.findLast(call=>call.system.includes('CREATION_CONFIRM_SCHEMA')).data.userFeedbackContext.includes('增加CSV导出，CSV仅保存在当前工作区'));
  f.service.close();
});

test('saved manual blueprint changes remain scope changes after restart rather than reverting to first-draft capabilities',async()=>{
  const initial={...canonical,capabilities:canonical.capabilities.slice(0,5)},updated=[...initial.capabilities,'导出CSV记录'];
  const f=fixture({initial}),draft=await started(f,await planned(f)),count=f.calls.length;
  const saved=await f.request('creation-update',{...ids(draft.workflow),blueprint:{...draft.workflow.creation.blueprint,tools:'调用换算器并导出CSV',scope:[...canonical.constraints,...extraConstraints].join('；')}});assert.equal(saved.status,200);assert.equal(f.calls.length,count);
  assert.equal(saved.value.workflow.creation.scopeEditPending,true);
  const bytes=copy([...f.persist.rows.values()]),restarted=fixture({persist:f.persist,initial,confirmationCapabilities:updated,confirmationConstraints:extraConstraints});await restarted.service.bootstrap();assert.deepEqual([...f.persist.rows.values()],bytes);
  const confirmed=await restarted.request('creation-update',{...ids(saved.value.workflow),confirm:true});assert.equal(confirmed.status,200,JSON.stringify(confirmed.value.error));
  assert.deepEqual(confirmed.value.workflow.intent.capabilities,updated);assert.deepEqual(restarted.searches.at(-1).intent.capabilities,updated);assert.ok(confirmed.value.workflow.plan.gaps.some(item=>item.capability==='导出CSV记录'));
  assert.deepEqual(confirmed.value.workflow.intent.constraints,[...canonical.constraints,...extraConstraints]);assert.match(confirmed.value.workflow.creation.draft,/导出CSV/);
  assert.deepEqual((await f.service.open(ids(draft.workflow))).workflow.intent.capabilities,initial.capabilities);
  f.service.close();restarted.service.close();
});

for(const change of ['blueprint','answers','assumptions'])test(`an explicit ${change} edit uses the confirmed complete scope without unioning labels`,async()=>{
  const initial={...canonical,capabilities:canonical.capabilities.slice(0,5)},updated=[...initial.capabilities,'导出CSV记录'],questions=change==='answers'?[{id:'format',question:'还需要怎样使用记录？',options:['CSV导出'],reason:'确定记录的使用方式'}]:[];
  const f=fixture({initial,confirmationCapabilities:updated,questions}),draft=await started(f,await planned(f));
  const patch=change==='blueprint'?{blueprint:{...draft.workflow.creation.blueprint,tools:'调用换算器并导出CSV'}}:change==='answers'?{answers:[{id:'format',answer:'CSV导出',assumed:false}]}:{assumptions:['提供CSV导出，运行前核对实际宿主接口']};
  const confirmed=await f.request('creation-update',{...ids(draft.workflow),...patch,confirm:true});assert.equal(confirmed.status,200,JSON.stringify(confirmed.value.error));
  assert.deepEqual(confirmed.value.workflow.intent.capabilities,updated);assert.deepEqual(f.searches.at(-1).intent.capabilities,updated);assert.equal(confirmed.value.workflow.creation.status,'ready');
  f.service.close();
});

test('feedback on a sibling creation branch does not change automatic confirmation scope',async()=>{
  const f=fixture(),draft=await started(f,await planned(f));
  const sibling=await f.request('creation-refine',{...ids(draft.workflow),feedback:'仅此分支增加CSV导出'});assert.equal(sibling.status,200);
  await f.service.open(ids(draft.workflow));
  const confirmed=await f.request('creation-update',{...ids(draft.workflow),confirm:true});assert.equal(confirmed.status,200,JSON.stringify(confirmed.value.error));
  assert.deepEqual(confirmed.value.workflow.intent.capabilities,canonical.capabilities);assert.deepEqual(f.searches.at(-1).intent.capabilities,canonical.capabilities);
  assert.ok(!f.calls.findLast(call=>call.system.includes('CREATION_CONFIRM_SCHEMA')).data.userFeedbackContext.some(note=>note.includes('仅此分支')));
  f.service.close();
});

for(const edited of [false,true])test(`confirmation still rejects seven model capabilities with ${edited?'an explicit edit':'automatic scope'}`,async()=>{
  const f=fixture({confirmationCapabilities:[...synonyms,'第七项能力']}),draft=await started(f,await planned(f)),before=copy([...f.persist.rows.values()]),searches=f.searches.length;
  const result=await f.request('creation-update',{...ids(draft.workflow),...(edited?{blueprint:{...draft.workflow.creation.blueprint,tools:'手动调整工具'}}:{}),confirm:true});
  assert.equal(result.status,502);assert.equal(result.value.error.code,'MODEL_INVALID_OUTPUT');assert.equal(result.value.error.details.stage,'creation.confirm.parse');
  assert.equal(f.searches.length,searches);assert.deepEqual([...f.persist.rows.values()],before);assert.equal((await f.service.bootstrap()).workflow.revisionId,draft.workflow.revisionId);
  f.service.close();
});

test('saved model-only regeneration does not turn later automatic confirmation into a scope change',async()=>{
  const f=fixture({regeneratedBlueprint:{...blueprint,ui:'当前工作区的尺寸条目列表'},confirmationCapabilities:canonical.capabilities.slice(0,2)}),draft=await started(f,await planned(f));
  const regenerated=await f.request('creation-update',{...ids(draft.workflow),regenerate:true});assert.equal(regenerated.status,200);assert.notEqual(regenerated.value.workflow.creation.blueprint.ui,draft.workflow.creation.blueprint.ui);
  const confirmed=await f.request('creation-update',{...ids(regenerated.value.workflow),confirm:true});assert.equal(confirmed.status,200,JSON.stringify(confirmed.value.error));
  assert.deepEqual(confirmed.value.workflow.intent.capabilities,canonical.capabilities);assert.deepEqual(f.searches.at(-1).intent.capabilities,canonical.capabilities);
  f.service.close();
});

test('a confirmed user scope is consumed once and survives later model-only regeneration',async()=>{
  const initial={...canonical,capabilities:canonical.capabilities.slice(0,5)},updated=[...initial.capabilities,'导出CSV记录'];
  const f=fixture({initial,regeneratedBlueprint:{...blueprint,ui:'重新表述尺寸记录列表'},confirmationCapabilities:count=>count===1?updated:updated.slice(0,2)}),draft=await started(f,await planned(f));
  const saved=await f.request('creation-update',{...ids(draft.workflow),blueprint:{...blueprint,tools:'换算记录并CSV导出'}});assert.equal(saved.status,200);assert.equal(saved.value.workflow.creation.scopeEditPending,true);
  const confirmed=await f.request('creation-update',{...ids(saved.value.workflow),confirm:true});assert.equal(confirmed.status,200);assert.equal(confirmed.value.workflow.creation.scopeEditPending,false);assert.deepEqual(confirmed.value.workflow.intent.capabilities,updated);
  const regenerated=await f.request('creation-update',{...ids(confirmed.value.workflow),regenerate:true});assert.equal(regenerated.status,200);assert.equal(regenerated.value.workflow.creation.scopeEditPending,false);
  const next=await f.request('creation-update',{...ids(regenerated.value.workflow),confirm:true});assert.equal(next.status,200);assert.deepEqual(next.value.workflow.intent.capabilities,updated);assert.deepEqual(f.searches.at(-1).intent.capabilities,updated);assert.equal(next.value.workflow.creation.scopeEditPending,false);
  f.service.close();
});

test('scope provenance is strictly typed, cannot come from model output, and does not rewrite legacy hashes',async()=>{
  const f=fixture(),draft=await started(f,await planned(f)),creation=draft.workflow.creation;
  assert.equal(creation.scopeEditPending,false);
  assert.equal(creationContentHash({...creation,scopeEditPending:true}),creation.contentHash);
  for(const value of [undefined,null,0,1,'false',{}]){const bad={...creation,scopeEditPending:value};bad.contentHash=creationContentHash(bad);assert.throws(()=>parseCreation(bad),{code:'INVALID_BACKUP'});}
  const generated=Object.fromEntries(['strategy','reuseAssessment','candidateDecisions','questions','assumptions','blueprint'].map(key=>[key,creation[key]]));
  assert.throws(()=>parseGeneratedCreation({...generated,scopeEditPending:true},[candidate]),{code:'MODEL_INVALID_OUTPUT'});
  assert.throws(()=>parseConfirmedCreation({intent:canonical,blueprint,scopeEditPending:true}),{code:'MODEL_INVALID_OUTPUT'});
  const data=creationModelData({task:{originalRequest:canonical.goal},revision:{workflow:{intent:canonical,plan:planFor(canonical),candidates:[candidate]}}},creation);assert.equal(Object.hasOwn(data.priorCreation,'scopeEditPending'),false);
  const bundle=await f.service.exportTask({taskId:draft.workflow.taskId});
  for(const revision of bundle.task.revisions)if(revision.workflow.creation){delete revision.workflow.creation.scopeEditPending;revision.workflow.creation.contentHash=creationContentHash(revision.workflow.creation);}
  const legacy=copy(bundle.task.revisions.at(-1).workflow.creation),legacyBytes=JSON.stringify(legacy);assert.equal(JSON.stringify(parseCreation(legacy)),legacyBytes);
  const restored=fixture();await restored.service.importBackup({workflow:bundle});const persisted=copy([...restored.persist.rows.values()]);
  const opened=await restored.service.open(ids(draft.workflow));assert.equal(JSON.stringify(opened.workflow.creation),legacyBytes);await restored.service.bootstrap();assert.deepEqual([...restored.persist.rows.values()],persisted);
  const saved=await restored.request('creation-update',ids(opened.workflow));assert.equal(saved.status,200);assert.equal(Object.hasOwn(saved.value.workflow.creation,'scopeEditPending'),false);assert.equal(saved.value.workflow.creation.contentHash,legacy.contentHash);
  f.service.close();restored.service.close();
});

test('failed confirmation leaves a saved scope edit pending and recoverable after restart',async()=>{
  const initial={...canonical,capabilities:canonical.capabilities.slice(0,5)},updated=[...initial.capabilities,'导出CSV记录'];
  const f=fixture({initial,confirmationCapabilities:[...synonyms,'第七项能力']}),draft=await started(f,await planned(f));
  const saved=await f.request('creation-update',{...ids(draft.workflow),blueprint:{...blueprint,tools:'换算记录并CSV导出'}});assert.equal(saved.status,200);assert.equal(saved.value.workflow.creation.scopeEditPending,true);
  const before=copy([...f.persist.rows.values()]),failed=await f.request('creation-update',{...ids(saved.value.workflow),confirm:true});assert.equal(failed.status,502);assert.deepEqual([...f.persist.rows.values()],before);assert.equal((await f.service.bootstrap()).workflow.creation.scopeEditPending,true);
  const restarted=fixture({persist:f.persist,initial,confirmationCapabilities:updated}),confirmed=await restarted.request('creation-update',{...ids(saved.value.workflow),confirm:true});assert.equal(confirmed.status,200);assert.equal(confirmed.value.workflow.creation.scopeEditPending,false);assert.deepEqual(confirmed.value.workflow.intent.capabilities,updated);
  f.service.close();restarted.service.close();
});

test('legacy actual refinement feedback is consumed by confirmation rather than authorizing later model rewrites',async()=>{
  const initial={...canonical,capabilities:canonical.capabilities.slice(0,5)},updated=[...initial.capabilities,'导出CSV记录'];
  const f=fixture({initial}),draft=await started(f,await planned(f)),revised=await f.request('creation-refine',{...ids(draft.workflow),feedback:'增加CSV导出'});assert.equal(revised.status,200);
  const bundle=await f.service.exportTask({taskId:draft.workflow.taskId});for(const revision of bundle.task.revisions)if(revision.workflow.creation){delete revision.workflow.creation.scopeEditPending;revision.workflow.creation.contentHash=creationContentHash(revision.workflow.creation);}
  const restored=fixture({initial,confirmationCapabilities:count=>count===1?updated:updated.slice(0,2),regeneratedBlueprint:{...blueprint,ui:'重新表述记录列表'}});await restored.service.importBackup({workflow:bundle});await restored.service.open(ids(revised.value.workflow));
  const confirmed=await restored.request('creation-update',{...ids(revised.value.workflow),confirm:true});assert.equal(confirmed.status,200);assert.deepEqual(confirmed.value.workflow.intent.capabilities,updated);
  const regenerated=await restored.request('creation-update',{...ids(confirmed.value.workflow),regenerate:true});assert.equal(regenerated.status,200);
  const next=await restored.request('creation-update',{...ids(regenerated.value.workflow),confirm:true});assert.equal(next.status,200);assert.deepEqual(next.value.workflow.intent.capabilities,updated);
  f.service.close();restored.service.close();
});

test('confirming a cosmetic name edit consumes provenance while reusing still-current supply',async()=>{
  const f=fixture({regeneratedBlueprint:{...blueprint,ui:'重新表述尺寸列表'},confirmationCapabilities:canonical.capabilities.slice(0,2)}),draft=await started(f,await planned(f));
  const ready=await f.request('creation-update',{...ids(draft.workflow),confirm:true});assert.equal(ready.status,200);
  const saved=await f.request('creation-update',{...ids(ready.value.workflow),blueprint:{...ready.value.workflow.creation.blueprint,name:'我的尺寸对照本'}});assert.equal(saved.status,200);assert.equal(saved.value.workflow.creation.scopeEditPending,true);assert.equal(saved.value.workflow.creation.supply.status,'current');
  const count=f.calls.length,confirmed=await f.request('creation-update',{...ids(saved.value.workflow),confirm:true});assert.equal(confirmed.status,200);assert.equal(f.calls.length,count);assert.equal(confirmed.value.workflow.creation.scopeEditPending,false);
  const regenerated=await f.request('creation-update',{...ids(confirmed.value.workflow),regenerate:true});assert.equal(regenerated.status,200);
  const next=await f.request('creation-update',{...ids(regenerated.value.workflow),confirm:true});assert.equal(next.status,200);assert.deepEqual(next.value.workflow.intent.capabilities,canonical.capabilities);
  f.service.close();
});
