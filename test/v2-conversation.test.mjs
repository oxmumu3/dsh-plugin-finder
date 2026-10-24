import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {registerFinderRoutes} from '../src/routes.js';
import {digest} from '../src/creation.js';

const copy=value=>structuredClone(value);
const request='整理本地研究资料，原文只读';
const intent={goal:'整理本地研究资料',input:'Markdown',output:'研究资料库',constraints:['原文只读'],capabilities:['检索资料'],queries:['local research search']};
const candidate={id:'library',name:'Library',capabilities:['检索资料'],limitations:['人工标注支持未知'],documentation:{text:'作者资料尚待任务验收'}};
const plan={kind:'single',title:'本地研究方案',rationale:'作者声明支持检索，实际效果待验收',pluginIds:['library'],steps:[{capability:'检索资料',owner:'library',sourceCapability:'检索资料',action:'检索所选目录',input:'Markdown',output:'匹配的资料'}],limits:['尚未安装验收']};
const blueprint={name:'研究资料库',purpose:'整理本地研究',workflow:'选择目录并检索',inputs:'Markdown',outputs:'检索结果',ui:'侧栏列表',data:'原文只读，标注另存',tools:'本地检索',runtime:'宿主默认模型',scope:'所选目录',acceptance:'两篇资料可定位原文'};
const generated={strategy:'new',reuseAssessment:'用户主动定制，未证明没有现成供给',candidateDecisions:[{pluginId:'library',decision:'unknown',reason:'标注能力未知'}],questions:[{id:'usage',question:'需要如何使用资料库？',options:['侧栏列表','会话提问'],reason:'决定界面'}],assumptions:['运行前核对宿主工具'],blueprint};
const refined={...generated,constraints:[]};
function persistence(){
  const rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null};
  const controls={rows,failWrite:false};
  return{controls,store:{read:async id=>copy(rows.get(id)),write:async row=>{if(controls.failWrite)throw Error('write failed');rows.set(row.id,copy(row));},list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>{pointer=copy(value);}}};
}
function fixture({persist=persistence(),answer,telemetry}={}){
  const calls=[],searches=[];
  const service=createFinderService({historyStore:persist.store,telemetry,model:{status:()=>({configured:true}),call:async args=>{calls.push(args);const value=answer?await answer(args):undefined;return{text:JSON.stringify(value??(args.data.creation?{intent,blueprint:args.data.creation.blueprint}:args.system.includes('CREATION_REFINE_SCHEMA')?refined:args.system.includes('CREATION_SCHEMA')?generated:args.system.includes('仅允许 {"kind"')?plan:intent)),model:{label:'host'}};}},discovery:{search:async args=>{searches.push(args);return{candidates:[candidate],sources:[{id:'catalog',status:'live'}],warnings:[],searchedAt:'2026-10-23T00:00:00Z'};}}});
  return{service,persist,calls,searches};
}
const ids=workflow=>({taskId:workflow.taskId,revisionId:workflow.revisionId});
async function planned(f){const analyzed=await f.service.analyze({request});return f.service.recommend({...ids(analyzed.workflow),intent:analyzed.intent});}
async function started(f){const prior=await planned(f);return f.service.creationStart({...ids(prior.workflow),trigger:'user-customization'});}

test('conversation restores the selected ancestry without sibling messages or storage migration',async()=>{
  const f=fixture(),original=await planned(f);
  assert.ok(Array.isArray(original.workflow.conversation));
  assert.equal(original.workflow.conversation[0].role,'user');
  assert.equal(original.workflow.conversation[0].text,request);
  assert.ok(original.workflow.conversation.some(turn=>turn.role==='assistant'&&turn.text.includes(plan.rationale)));
  const sibling=await f.service.refine({...ids(original.workflow),feedback:'只属于分支甲'});
  await f.service.recommend({...ids(sibling.workflow),intent:sibling.intent});
  await f.service.open(ids(original.workflow));
  const branch=await f.service.refine({...ids(original.workflow),feedback:'只属于分支乙'});
  const before=copy([...f.persist.controls.rows.values()]);
  const restarted=fixture({persist:f.persist}),restored=await restarted.service.bootstrap();
  assert.deepEqual(restored.workflow.conversation,branch.workflow.conversation);
  assert.deepEqual([...f.persist.controls.rows.values()],before);
  assert.ok(branch.workflow.conversation.some(turn=>turn.role==='user'&&turn.text==='只属于分支乙'));
  assert.ok(!JSON.stringify(branch.workflow.conversation).includes('只属于分支甲'));
  assert.equal(new Set(branch.workflow.conversation.map(turn=>turn.id)).size,branch.workflow.conversation.length);
  for(const turn of branch.workflow.conversation){assert.ok(['user','assistant'].includes(turn.role));assert.equal(typeof turn.revisionId,'string');assert.ok(Number.isInteger(turn.revisionNumber));}
  assert.ok(!JSON.stringify((await f.service.exportTask({taskId:branch.workflow.taskId})).task).includes('"conversation"'));
});

test('saving manual creation edits never invents an assistant message',async()=>{
  const f=fixture(),prior=await started(f);
  assert.ok(Array.isArray(prior.workflow.conversation));
  assert.ok(prior.workflow.conversation.some(turn=>turn.role==='assistant'&&turn.text.includes(blueprint.name)));
  const saved=await f.service.creationUpdate({...ids(prior.workflow),blueprint:{...blueprint,purpose:'仅人工保存的措辞'}});
  assert.deepEqual(saved.workflow.conversation,prior.workflow.conversation);
});

test('creation refinement uses unsaved edits and appends a private stale draft with the original source',async()=>{
  const edited={...blueprint,inputs:'未保存的 PDF 输入',acceptance:'保留人工验收标准'};
  const f=fixture({answer:args=>args.data.feedback?{...refined,blueprint:{...args.data.priorCreation.blueprint,ui:'可筛选的侧栏列表'},assumptions:args.data.priorCreation.assumptions}:undefined}),prior=await started(f);
  assert.equal(typeof f.service.creationRefine,'function');
  const old=await f.service.exportTask({taskId:prior.workflow.taskId}),searchCount=f.searches.length;
  const next=await f.service.creationRefine({...ids(prior.workflow),feedback:'侧栏增加筛选',blueprint:edited,answers:[{id:'usage',answer:'侧栏列表',assumed:false}],assumptions:['我手工保留的前提']});
  assert.deepEqual(f.calls.at(-1).data.priorCreation.blueprint,edited);
  assert.deepEqual(f.calls.at(-1).data.priorCreation.answers,[{id:'usage',answer:'侧栏列表',assumed:false}]);
  assert.equal(f.calls.at(-1).data.feedback,'侧栏增加筛选');
  assert.match(f.calls.at(-1).system,/不可信/);
  assert.equal(next.workflow.creation.blueprint.inputs,edited.inputs);
  assert.equal(next.workflow.creation.blueprint.acceptance,edited.acceptance);
  assert.equal(next.workflow.creation.blueprint.ui,'可筛选的侧栏列表');
  assert.deepEqual(next.workflow.creation.answers,[{id:'usage',answer:'侧栏列表',assumed:false}]);
  assert.deepEqual(next.workflow.creation.assumptions,['我手工保留的前提']);
  assert.equal(next.workflow.creation.status,'draft');
  assert.equal(next.workflow.creation.supply.status,'stale');
  assert.equal(next.workflow.localOnly,true);
  assert.deepEqual(next.workflow.creation.source,prior.workflow.creation.source);
  assert.deepEqual(next.workflow.intent,prior.workflow.intent);
  assert.notEqual(next.workflow.creation.contentHash,prior.workflow.creation.contentHash);
  assert.equal(f.searches.length,searchCount);
  const current=await f.service.exportTask({taskId:prior.workflow.taskId});
  assert.deepEqual(current.task.revisions.slice(0,-1),old.task.revisions);
  assert.equal(current.task.revisions.at(-1).feedbackText,'侧栏增加筛选');
  assert.deepEqual(next.workflow.creation.userFeedbackContext,['侧栏增加筛选']);
  assert.ok(next.workflow.conversation.some(turn=>turn.role==='user'&&turn.text==='侧栏增加筛选'));
  assert.ok(next.workflow.conversation.some(turn=>turn.role==='assistant'&&turn.revisionId===next.workflow.revisionId));
});

test('natural answers update the generated blueprint and never make it ready before confirmation',async()=>{
  const f=fixture({answer:args=>args.data.feedback?{...refined,questions:[],blueprint:{...args.data.priorCreation.blueprint,ui:'会话提问，无需侧栏'}}:undefined}),prior=await started(f);
  assert.equal(typeof f.service.creationRefine,'function');
  const next=await f.service.creationRefine({...ids(prior.workflow),feedback:'选会话提问，不要侧栏'});
  assert.equal(next.workflow.creation.blueprint.ui,'会话提问，无需侧栏');
  assert.equal(next.workflow.creation.questions.length,0);
  assert.equal(next.workflow.creation.status,'draft');
  assert.equal(next.workflow.creation.supply.status,'stale');
  await assert.rejects(f.service.creatorClaim({...ids(next.workflow),workspaceId:'w',contentHash:next.workflow.creation.contentHash}),error=>error.code==='CREATION_NOT_READY');
  const confirmed=await f.service.creationUpdate({...ids(next.workflow),confirm:true});
  assert.equal(confirmed.workflow.creation.status,'ready');
  assert.ok(f.calls.at(-2).data.userFeedbackContext.includes('选会话提问，不要侧栏'));
});

test('confirmation accepts explicit restrictions from creation chat as user evidence',async()=>{
  const restriction='禁止把资料上传第三方';
  const f=fixture({answer:args=>args.data.creation?{intent:{...intent,constraints:[restriction]},blueprint:args.data.creation.blueprint}:args.data.feedback?{...refined,questions:[],blueprint:{...blueprint,data:'只在本机处理资料'}}:undefined}),prior=await started(f);
  const revised=await f.service.creationRefine({...ids(prior.workflow),feedback:restriction});
  const confirmed=await f.service.creationUpdate({...ids(revised.workflow),confirm:true});
  assert.deepEqual(confirmed.workflow.intent.constraints,['原文只读',restriction]);
  assert.deepEqual(f.searches.at(-1).intent.constraints,['原文只读',restriction]);
});

test('changed question meaning cannot inherit an answer with the same id',async()=>{
  const f=fixture({answer:args=>args.data.feedback?{...refined,questions:[{...generated.questions[0],options:['独立窗口','无界面']}]}:undefined}),prior=await started(f);
  assert.equal(typeof f.service.creationRefine,'function');
  const next=await f.service.creationRefine({...ids(prior.workflow),feedback:'换一种展示方式',answers:[{id:'usage',answer:'侧栏列表',assumed:false}]});
  assert.deepEqual(next.workflow.creation.answers,[]);
  assert.equal(next.workflow.creation.status,'clarify');
});

test('invalid editor input and feedback fail before the model and do not change history',async()=>{
  const f=fixture(),prior=await started(f);
  assert.equal(typeof f.service.creationRefine,'function');
  const before=copy([...f.persist.controls.rows.values()]),count=f.calls.length;
  for(const patch of [{feedback:''},{feedback:'x'.repeat(1501)},{blueprint:{...blueprint,extra:'no'}},{answers:[{id:'unknown',answer:'回答',assumed:false}]},{assumptions:['']},{assumptions:Array(21).fill('前提')}]){
    await assert.rejects(f.service.creationRefine({...ids(prior.workflow),feedback:'调整',...patch}),error=>error.code==='INVALID_INPUT');
  }
  assert.equal(f.calls.length,count);
  assert.deepEqual([...f.persist.controls.rows.values()],before);
});

test('stale and already-cancelled creation refinements do not call the model',async()=>{
  const f=fixture(),prior=await started(f);
  assert.equal(typeof f.service.creationRefine,'function');
  const controller=new AbortController();controller.abort();const count=f.calls.length;
  await assert.rejects(f.service.creationRefine({...ids(prior.workflow),feedback:'取消的修改',signal:controller.signal}),error=>error.code==='MODEL_ABORTED');
  await f.service.reset(ids(prior.workflow));
  await assert.rejects(f.service.creationRefine({...ids(prior.workflow),feedback:'旧的修改'}),error=>error.code==='STALE_WORKFLOW');
  assert.equal(f.calls.length,count);
});

test('late model responses cannot save after cancellation or an active-pointer change',async()=>{
  for(const mode of ['cancel','pointer']){
    let release,began;const held=new Promise(resolve=>release=resolve),begins=new Promise(resolve=>began=resolve);
    const f=fixture({answer:async args=>{if(args.data.feedback){began();await held;return refined;}}}),prior=await started(f);
    assert.equal(typeof f.service.creationRefine,'function');
    const before=copy([...f.persist.controls.rows.values()]),controller=new AbortController();
    const pending=f.service.creationRefine({...ids(prior.workflow),feedback:'迟到的修改',signal:controller.signal});
    await begins;
    if(mode==='cancel')controller.abort();else await f.persist.store.writePointer({activeTaskId:null,activeRevisionId:null});
    release();await assert.rejects(pending,error=>error.code===(mode==='cancel'?'MODEL_ABORTED':'STALE_WORKFLOW'));
    assert.deepEqual([...f.persist.controls.rows.values()],before);
  }
});

test('model and save failures preserve prior creation history',async()=>{
  for(const mode of ['schema','save']){
    const f=fixture({answer:args=>args.data.feedback&&mode==='schema'?{...refined,blueprint:{...blueprint,extra:'no'}}:undefined}),prior=await started(f);
    assert.equal(typeof f.service.creationRefine,'function');
    const before=copy([...f.persist.controls.rows.values()]);if(mode==='save')f.persist.controls.failWrite=true;
    await assert.rejects(f.service.creationRefine({...ids(prior.workflow),feedback:'保存的新改动'}),error=>error.code===(mode==='schema'?'MODEL_INVALID_OUTPUT':'HISTORY_STORAGE_FAILED'));
    assert.deepEqual([...f.persist.controls.rows.values()],before);
  }
});

test('creation refinement stays local and its feedback survives export and import',async()=>{
  const events=[],f=fixture({telemetry:{capture:async()=>({epochId:'consented'}),createEvent:async value=>{events.push(value);return null;}}}),prior=await started(f);
  assert.equal(typeof f.service.creationRefine,'function');
  const count=events.length,next=await f.service.creationRefine({...ids(prior.workflow),feedback:'私有共创原句'});
  assert.equal(events.length,count);
  const bundle=await f.service.exportTask({taskId:next.workflow.taskId}),other=fixture();
  await other.service.importBackup({workflow:bundle});
  const restored=await other.service.open(ids(next.workflow));
  assert.deepEqual(restored.workflow.conversation,next.workflow.conversation);
  assert.deepEqual(restored.workflow.creation,next.workflow.creation);
});

test('creation-refine route accepts the bounded full editor and forwards request cancellation',async()=>{
  const routes=[];let seen;
  registerFinderRoutes({get:()=>({fetch:{register:route=>{routes.push(route);return()=>{};}}}),effect:()=>{}},{creationRefine:async input=>{seen=input;return{saved:true};}});
  const route=routes.find(item=>item.path.endsWith('/creation-refine'));
  assert.ok(route);
  const body=JSON.stringify({taskId:'t',revisionId:'r',feedback:'修改',blueprint:Object.fromEntries(Object.keys(blueprint).map(key=>[key,'汉'.repeat(4000)]))});
  assert.ok(Buffer.byteLength(body)>32768);
  const request=new Request('http://local'+route.path,{method:'POST',headers:{'content-type':'application/json'},body});
  const response=await route.fetch(request);
  assert.equal(response.status,200);
  assert.equal(seen.revisionId,'r');
  assert.equal(seen.signal,request.signal);
});

test('creation chat protects a new restriction after eight turns even when later models omit it',async()=>{
  const restriction='禁止上传任何原文';
  const f=fixture({answer:args=>args.data.feedback?{...refined,questions:[],constraints:args.data.feedback===restriction?[restriction]:[],blueprint}:args.data.creation?{intent:{...intent,constraints:[]},blueprint}:undefined});
  let current=await started(f);const originalIntent=copy(current.workflow.intent),originalPlan=copy(current.workflow.plan),calls=f.calls.length;
  for(let index=0;index<8;index++){
    current=await f.service.creationRefine({...ids(current.workflow),feedback:index===0?restriction:'只修改展示 '+index});
    assert.deepEqual(current.workflow.intent,{...originalIntent,constraints:['原文只读',restriction]});
    const {nextPrompt,...savedPlan}=current.workflow.plan,{nextPrompt:oldPrompt,...expectedPlan}=originalPlan;
    assert.deepEqual(savedPlan,expectedPlan);
    assert.equal(current.workflow.creation.supply.status,'stale');
    assert.equal(current.workflow.creation.supply.intentHash,digest(current.workflow.intent));
  }
  assert.equal(f.calls.length,calls+8);
  assert.ok(!current.workflow.creation.userFeedbackContext.includes(restriction));
  assert.ok(!JSON.stringify(current.workflow.creation.blueprint).includes(restriction));
  const restarted=fixture({persist:f.persist,answer:args=>args.data.creation?{intent:{...intent,constraints:[]},blueprint}:undefined});
  const confirmed=await restarted.service.creationUpdate({...ids(current.workflow),confirm:true});
  assert.deepEqual(confirmed.workflow.intent.constraints,['原文只读',restriction]);
  const creatorData=JSON.parse(confirmed.workflow.creation.draft.split('\n\n').at(-1));
  assert.deepEqual(creatorData.currentAssessment.intent.constraints,['原文只读',restriction]);
  assert.equal(confirmed.workflow.creation.status,'ready');
});

test('creation refinement does not promote generated assumptions or blueprint text into restrictions',async()=>{
  const invented='不得联网';
  const f=fixture({answer:args=>args.data.feedback?{...refined,constraints:[invented],assumptions:[invented],blueprint:{...blueprint,runtime:invented}}:undefined}),prior=await started(f);
  const next=await f.service.creationRefine({...ids(prior.workflow),feedback:'把字号调大一点',assumptions:[invented]});
  assert.deepEqual(next.workflow.intent.constraints,['原文只读']);
  assert.match(next.workflow.analysisWarning,/没有明确提出/);
});

test('creation refinement rejects the 25th restriction without truncating or saving a revision',async()=>{
  const constraints=Array.from({length:24},(_,index)=>'已有明确限制'+index),extra='新增的第二十五条明确限制';
  const f=fixture({answer:args=>args.data.feedback?{...refined,constraints:[extra]}:undefined});
  const imported=await f.service.importBackup({workflow:{format:2,stage:'plan',request:'累计限制需求',intent:{...intent,constraints},plan:{...plan,nextPrompt:'原草稿'},candidates:[candidate]}});
  const opened=await f.service.open({taskId:imported.importedTaskId}),prior=await f.service.creationStart({...ids(opened.workflow),trigger:'user-customization'}),before=copy([...f.persist.controls.rows.values()]);
  await assert.rejects(f.service.creationRefine({...ids(prior.workflow),feedback:extra}),error=>error.code==='CONSTRAINT_CAPACITY'&&error.details?.stage==='creation.refine.constraints');
  assert.deepEqual([...f.persist.controls.rows.values()],before);
  assert.deepEqual((await f.service.bootstrap()).workflow.intent.constraints,constraints);
});

test('invalid refinement constraint output rolls back without changing the current creation',async()=>{
  for(const constraints of [undefined,null,'限制',Array(7).fill('限制'),['限'.repeat(351)]]){
    const f=fixture({answer:args=>args.data.feedback?{...refined,constraints}:undefined}),prior=await started(f),before=copy([...f.persist.controls.rows.values()]);
    await assert.rejects(f.service.creationRefine({...ids(prior.workflow),feedback:'限制'}),error=>error.code==='MODEL_INVALID_OUTPUT');
    assert.deepEqual([...f.persist.controls.rows.values()],before);
  }
});

test('confirmation grounds older ancestral chat restrictions without accepting a sibling statement',async()=>{
  const ancestor='祖先明确禁止上传',sibling='兄弟分支明确禁止搜索';
  const f=fixture({answer:args=>args.data.feedback?{...refined,questions:[]}:args.data.creation?{intent:{...intent,constraints:[ancestor,sibling]},blueprint}:undefined}),prior=await started(f);
  await f.service.creationRefine({...ids(prior.workflow),feedback:sibling});
  let current=await f.service.open(ids(prior.workflow));
  for(let index=0;index<8;index++)current=await f.service.creationRefine({...ids(current.workflow),feedback:index===0?ancestor:'修改颜色 '+index});
  assert.deepEqual(current.workflow.intent.constraints,['原文只读']);
  assert.ok(!current.workflow.creation.userFeedbackContext.includes(ancestor));
  const confirmed=await f.service.creationUpdate({...ids(current.workflow),confirm:true});
  assert.deepEqual(confirmed.workflow.intent.constraints,['原文只读',ancestor]);
});
