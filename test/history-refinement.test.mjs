import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
const copy=value=>structuredClone(value);
const request='把 AI 研究整理成资料库，原文只读，不上传第三方。';
const intent={goal:'整理本地研究',input:'Markdown',output:'本地资料库',constraints:['原文只读','不上传第三方'],capabilities:['本地检索'],queries:['local markdown search']};
const candidate={id:'local-library',name:'local-library',summary:'本地检索',capabilities:['本地检索'],requirements:{extraApiKey:'not-required'},install:{spec:'local-library@1.0.0',version:'1.0.0'},evidence:{metadata:'manifest-checked',installation:'not-tested',task:'not-tested'}};
const plan={kind:'single',title:'本地研究库方案',rationale:'作者资料声明支持，实际任务仍待验证',pluginIds:[candidate.id],steps:[{capability:'本地检索',owner:candidate.id,sourceCapability:'本地检索',action:'配置指定目录',input:'Markdown',output:'检索结果'}],limits:['尚未运行']};
const legacyWorkflow={format:2,stage:'plan',request,intent,plan:{...plan,nextPrompt:'旧草稿'},candidates:[candidate],model:{label:'host'}};
function memory(){
  const rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null};
  const controls={failWrite:false,failPointer:false,rows,pointer:()=>copy(pointer)};
  const historyStore={read:async id=>copy(rows.get(id)),write:async row=>{if(controls.failWrite)throw Error('private path');rows.set(row.id,copy(row));},list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>{if(controls.failPointer)throw Error('private path');pointer=copy(value);}};
  return{historyStore,controls};
}
function fixture(options={}){
  const persistence=options.persistence||memory(),calls=[],searches=[];
  const service=createFinderService({...options,historyStore:persistence.historyStore,
    discovery:{search:async arg=>{searches.push(arg);return{candidates:[candidate],sources:[{id:'live',status:'live'}],warnings:[],searchedAt:'2026-10-20T00:00:00Z'};}},
    model:{status:()=>({configured:true}),call:async arg=>{calls.push(arg);return{text:JSON.stringify(options.answer?options.answer(arg):arg.system.includes('仅允许 {"kind"')?plan:intent),model:{label:'host'}};}}});
  return{service,calls,searches,historyStore:persistence.historyStore,controls:persistence.controls};
}
const ids=w=>({taskId:w.taskId,revisionId:w.revisionId});
async function planned(f){const a=await f.service.analyze({request});return f.service.recommend({intent:a.intent,...ids(a.workflow)});}

test('A, new request, B and restart retain both task histories without clearing legacy data',async()=>{
  let clears=0;const f=fixture({workflowStore:{read:async()=>null,clear:async()=>{clears++;}}});const a=await planned(f);
  const reset=await f.service.reset(ids(a.workflow));assert.equal(reset.cleared,true);assert.equal(reset.workflow,null);assert.equal(reset.historyTotal,1);assert.equal(clears,0);
  const b=await f.service.analyze({request:'另一项研究，原文只读，不上传第三方。'});assert.notEqual(a.workflow.taskId,b.workflow.taskId);
  const next=fixture({persistence:f});const restored=await next.service.bootstrap();assert.equal(restored.historyTotal,2);assert.equal(restored.workflow.taskId,b.workflow.taskId);
  const old=await next.service.open(ids(a.workflow));assert.equal(old.workflow.plan.title,plan.title);assert.equal(old.workflow.request,request);assert.equal(next.calls.length,0);assert.equal(next.searches.length,0);
});
test('feedback and refinement append revisions while preserving the original request, constraints and plan',async()=>{
  const f=fixture({answer:arg=>arg.system.includes('仅允许 {"kind"')?plan:arg.data.feedback?{...intent,goal:'更窄的本地研究库',constraints:[]}:intent});const first=await planned(f),selected=ids(first.workflow);
  const saved=await f.service.feedback({...selected,outcome:'partial',pluginIds:[candidate.id],note:'平台筛选不准确',stage:'result'});assert.equal(saved.saved,true);assert.equal(saved.workflow.feedback[0].revisionId,selected.revisionId);
  const refined=await f.service.refine({...selected,feedback:'更简洁的关键词检索，不要扩大扫描范围'});assert.equal(refined.workflow.stage,'understand');assert.equal(refined.workflow.request,request);assert.notEqual(refined.workflow.revisionId,selected.revisionId);assert.deepEqual(refined.workflow.intent.constraints,intent.constraints);assert.equal(f.searches.length,1);
  const prior=await f.service.open(selected);assert.equal(prior.workflow.plan.title,plan.title);assert.equal(prior.workflow.feedback.filter(row=>row.type!=='refinement').length,1);
  const latest=await f.service.open(ids(refined.workflow));await f.service.recommend({...ids(latest.workflow),intent:latest.workflow.intent});assert.equal(f.searches.length,2);
});
test('stale task/revision writes cannot alter another active task or call a model',async()=>{
  const f=fixture();const a=await planned(f);await f.service.reset(ids(a.workflow));await f.service.analyze({request});const count=f.calls.length;
  for(const fn of [()=>f.service.recommend({...ids(a.workflow),intent}),()=>f.service.refine({...ids(a.workflow),feedback:'修改'}),()=>f.service.feedback({...ids(a.workflow),outcome:'partial',pluginIds:[candidate.id]}),()=>f.service.handoff({...ids(a.workflow),workspaceId:'workspace-a',sessionId:'session-a',status:'applied'})])await assert.rejects(fn(),e=>e.code==='STALE_WORKFLOW');
  assert.equal(f.calls.length,count);assert.equal((await f.service.history()).historyTotal,2);
});
test('failed task or new-request pointer saves are not acknowledged and preserve old persisted work',async()=>{
  const f=fixture();const a=await planned(f),before=copy([...f.controls.rows.values()]);f.controls.failWrite=true;
  await assert.rejects(f.service.refine({...ids(a.workflow),feedback:'再简洁些'}),e=>e.code==='HISTORY_STORAGE_FAILED');assert.deepEqual([...f.controls.rows.values()],before);
  f.controls.failWrite=false;f.controls.failPointer=true;await assert.rejects(f.service.reset(ids(a.workflow)),e=>e.code==='HISTORY_STORAGE_FAILED');assert.equal(f.controls.pointer().activeTaskId,a.workflow.taskId);
});
test('exact native session links persist by revision without a model call',async()=>{
  const f=fixture();const a=await planned(f);await f.service.handoff({...ids(a.workflow),workspaceId:'workspace-a',sessionId:'session-a',status:'applied'});
  const next=fixture({persistence:f});const b=await next.service.bootstrap();assert.equal(b.workflow.handoff.sessionId,'session-a');assert.equal(b.workflow.handoff.workspaceId,'workspace-a');assert.equal(b.workflow.handoff.status,'applied');assert.equal(next.calls.length,0);
  await assert.rejects(next.service.handoff({...ids(b.workflow),workspaceId:'workspace-a',sessionId:'session-b',status:'sent'}));
});
test('legacy current migrates once without deletion or revival after a new request',async()=>{
  let deletes=0;const row={id:'current',serialized:JSON.stringify(legacyWorkflow)},f=fixture({workflowStore:{read:async()=>row,clear:async()=>{deletes++;}}});
  const migrated=await f.service.bootstrap();assert.equal(migrated.workflow.plan.title,plan.title);assert.equal(migrated.workflow.origin.type,'legacy-current');assert.equal(migrated.historyTotal,1);await f.service.reset(ids(migrated.workflow));
  const restarted=fixture({persistence:f,workflowStore:{read:async()=>row}});const b=await restarted.service.bootstrap();assert.equal(b.workflow,null);assert.equal(b.historyTotal,1);assert.equal(deletes,0);assert.equal(restarted.calls.length,0);
});
test('checkpoint import is idempotent, marked restored and never replaces active work',async()=>{
  const f=fixture();const active=await f.service.analyze({request:'新需求，原文只读，不上传第三方。'});
  const first=await f.service.importBackup({workflow:legacyWorkflow,origin:'真实试跑checkpoint'});assert.equal(first.imported,true);assert.equal(first.duplicate,false);assert.equal(first.workflow.taskId,active.workflow.taskId);assert.equal(first.historyTotal,2);
  const again=await f.service.importBackup({workflow:legacyWorkflow,origin:'重复选择同一备份'});assert.equal(again.duplicate,true);assert.equal(again.importedTaskId,first.importedTaskId);assert.equal(again.historyTotal,2);
  const restored=await f.service.open({taskId:first.importedTaskId});assert.equal(restored.workflow.origin.type,'backup');assert.equal(restored.workflow.origin.label,'真实试跑checkpoint');assert.equal(restored.workflow.handoff,null);
});
test('full export/import preserves revisions and feedback without a model call',async()=>{
  const f=fixture();const a=await planned(f);await f.service.feedback({...ids(a.workflow),outcome:'partial',pluginIds:[candidate.id],note:'待改进'});
  const exported=await f.service.exportTask({taskId:a.workflow.taskId});assert.equal(exported.format,'plugin-finder-task');assert.equal(exported.version,1);
  const other=fixture();const imported=await other.service.importBackup({workflow:exported,origin:'手动导入'});assert.equal(imported.workflow,null);
  const opened=await other.service.open({taskId:imported.importedTaskId});assert.equal(opened.workflow.plan.title,plan.title);assert.equal(opened.workflow.feedback[0].note,'待改进');assert.equal(opened.workflow.revisions.length,2);assert.equal(other.calls.length,0);
  assert.equal((await other.service.importBackup({workflow:exported,origin:'再导入'})).duplicate,true);
});
test('legacy feedback stays explicitly unlinked rather than matched by plugin or time',async()=>{
  const old={id:'old',createdAt:'2026-10-20T00:00:00Z',pluginIds:[candidate.id],outcome:'partial',note:'旧反馈'},f=fixture({feedbackStore:{list:async()=>[old]}});const a=await planned(f),b=await f.service.bootstrap();assert.deepEqual(b.unlinkedFeedback,[old]);assert.deepEqual(a.workflow.feedback,[]);
});
test('oversized UTF-8 task imports are refused without evicting history',async()=>{
  const f=fixture();const a=await planned(f);const bundle=await f.service.exportTask({taskId:a.workflow.taskId});bundle.task.originalRequest='汉'.repeat(3_000_000);
  await assert.rejects(f.service.importBackup({workflow:bundle,origin:'过大备份'}),e=>e.code==='HISTORY_CAPACITY');assert.equal((await f.service.history()).historyTotal,1);
});

test('production mutation requests with missing task identities never use the active task implicitly',async()=>{
  const f=fixture();await planned(f);const before=copy([...f.controls.rows.values()]),count=f.calls.length;
  for(const fn of [()=>f.service.recommend({intent}),()=>f.service.refine({feedback:'调整'}),()=>f.service.feedback({outcome:'partial',pluginIds:[candidate.id]}),()=>f.service.handoff({workspaceId:'w',sessionId:'s',status:'applied'}),()=>f.service.reset()])await assert.rejects(fn(),e=>e.code==='STALE_WORKFLOW');
  assert.deepEqual([...f.controls.rows.values()],before);assert.equal(f.calls.length,count);
});
test('malformed or dangling persisted pointers are reported without deleting task records',async()=>{
  for(const pointer of [{activeTaskId:'task',activeRevisionId:null},{activeTaskId:null,activeRevisionId:'revision'},{activeTaskId:'missing',activeRevisionId:'missing'}]){
    const p=memory();await p.historyStore.writePointer(pointer);const f=fixture({persistence:p});
    await assert.rejects(f.service.bootstrap(),error=>['HISTORY_STORAGE_FAILED','WORKFLOW_NOT_FOUND'].includes(error.code));assert.equal(p.controls.rows.size,0);
  }
  const f=fixture();const a=await planned(f);await f.historyStore.writePointer({activeTaskId:a.workflow.taskId,activeRevisionId:'missing-version'});
  const before=copy([...f.controls.rows.values()]);await assert.rejects(f.service.bootstrap(),e=>e.code==='WORKFLOW_NOT_FOUND');assert.deepEqual([...f.controls.rows.values()],before);
});
test('corrupt history rows fail visibly instead of silently disappearing from the history list',async()=>{
  const f=fixture();await planned(f);await f.historyStore.write({id:'corrupt',serialized:'{broken'});
  await assert.rejects(f.service.history(),e=>e.code==='HISTORY_STORAGE_FAILED');assert.equal(f.controls.rows.has('corrupt'),true);
});
test('a snapshot persisted before pointer failure remains discoverable and can be explicitly reopened',async()=>{
  const f=fixture();const a=await planned(f);f.controls.failPointer=true;
  await assert.rejects(f.service.refine({...ids(a.workflow),feedback:'只要关键词'}),e=>e.code==='HISTORY_STORAGE_FAILED');f.controls.failPointer=false;
  const boot=await f.service.bootstrap();assert.equal(boot.workflow.revisionId,a.workflow.revisionId);assert.equal(boot.history[0].revisionCount,3);
  const opened=await f.service.open({taskId:a.workflow.taskId});assert.equal(opened.workflow.revisionNumber,3);assert.equal(opened.workflow.stage,'understand');assert.equal(opened.workflow.request,request);
});
test('near-limit Unicode task exports reimport completely with sanitized provenance and no eviction',async()=>{
  const f=fixture();const a=await planned(f),bundle=await f.service.exportTask({taskId:a.workflow.taskId});
  bundle.task.revisions[1].workflow.candidates[0].documentation={url:'https://example.org/readme?token=private',text:'汉'.repeat(2_600_000)};
  const next=fixture();const imported=await next.service.importBackup({workflow:bundle,origin:'Unicode完整备份'});const exported=await next.service.exportTask({taskId:imported.importedTaskId});
  const bytes=Buffer.byteLength(JSON.stringify(exported),'utf8');assert.ok(bytes<8_100_000&&bytes>7_800_000);
  const third=fixture();const restored=await third.service.importBackup({workflow:exported,origin:'导出再导入'});const opened=await third.service.open({taskId:restored.importedTaskId});
  assert.equal(opened.workflow.candidates[0].documentation.text.length,2_600_000);assert.equal(opened.workflow.candidates[0].documentation.url,'https://example.org/readme');assert.equal(opened.historyTotal,1);
});
test('new-request reset checks the selected version and is idempotent only after becoming blank',async()=>{
  const f=fixture();const a=await planned(f);await f.service.reset(ids(a.workflow));assert.equal((await f.service.reset()).workflow,null);
  const b=await f.service.analyze({request});await assert.rejects(f.service.reset(ids(a.workflow)),e=>e.code==='STALE_WORKFLOW');assert.equal((await f.service.bootstrap()).workflow.taskId,b.workflow.taskId);
});
test('refining an old version excludes feedback that belongs to later branches',async()=>{
  const f=fixture();const a=await planned(f);const changed=await f.service.refine({...ids(a.workflow),feedback:'后续分支才提出的意见'});await f.service.recommend({...ids(changed.workflow),intent:changed.intent});
  await f.service.open(ids(a.workflow));await f.service.refine({...ids(a.workflow),feedback:'从原版重新考虑'});
  assert.deepEqual(f.calls.at(-1).data.userFeedbackHistory,[]);assert.equal(f.calls.at(-1).data.feedback,'从原版重新考虑');
});
test('an 8 MB existing task can be exported and duplicate-imported under the larger wrapper bound',async()=>{
  const f=fixture();const a=await planned(f),bundle=await f.service.exportTask({taskId:a.workflow.taskId});
  bundle.task.revisions[1].workflow.candidates[0].documentation={text:''};
  const missing=7_999_995-Buffer.byteLength(JSON.stringify(bundle.task),'utf8');bundle.task.revisions[1].workflow.candidates[0].documentation.text='x'.repeat(missing);
  f.controls.rows.set(bundle.task.id,{id:bundle.task.id,serialized:JSON.stringify(bundle.task)});
  const exported=await f.service.exportTask({taskId:bundle.task.id});assert.ok(Buffer.byteLength(JSON.stringify(exported),'utf8')>8_000_000);
  const imported=await f.service.importBackup({workflow:exported,origin:'同一导出包'});assert.equal(imported.duplicate,true);assert.equal(imported.historyTotal,1);
});
test('maximum new task payload reserves enough space for a later restored-origin label',async()=>{
  const f=fixture();const a=await planned(f),bundle=await f.service.exportTask({taskId:a.workflow.taskId});bundle.task.revisions[1].workflow.candidates[0].documentation={text:''};
  const missing=7_998_976-Buffer.byteLength(JSON.stringify(bundle.task),'utf8');bundle.task.revisions[1].workflow.candidates[0].documentation.text='x'.repeat(missing);
  const next=fixture();const imported=await next.service.importBackup({workflow:bundle,origin:'a'});const exported=await next.service.exportTask({taskId:imported.importedTaskId});
  const third=fixture();const restored=await third.service.importBackup({workflow:exported,origin:'汉'.repeat(200)});assert.equal(restored.imported,true);assert.ok(Buffer.byteLength([...third.controls.rows.values()][0].serialized,'utf8')<=8_000_000);
});
test('recommendation after refinement receives known failed-candidate feedback without rewriting the old plan',async()=>{
  const rejected='已核对 local-library@1.0.0 全局自动入库无法限定工作区，这次不要安装它。';
  const adjustment='继续使用原来的八篇材料，寻找只读检索方案。';
  const native={...plan,kind:'native',title:'先用已具备的本地能力',pluginIds:[],steps:plan.steps.map(step=>({...step,owner:'dsh',sourceCapability:null}))};
  const f=fixture({answer:arg=>arg.system.includes('仅允许 {"kind"')?(arg.data.userFeedbackContext?.includes(rejected)?native:plan):intent});
  const a=await planned(f);await f.service.feedback({...ids(a.workflow),outcome:'blocked',note:rejected});
  const changed=await f.service.refine({...ids(a.workflow),feedback:adjustment});
  const result=await f.service.recommend({...ids(changed.workflow),intent:changed.intent});
  assert.ok(f.calls.at(-1).data.userFeedbackContext?.includes(rejected));assert.ok(f.calls.at(-1).data.userFeedbackContext.includes(adjustment));
  assert.match(f.calls.at(-1).system,/用户反馈原文/);assert.match(f.calls.at(-1).system,/不是安装或运行验收/);assert.equal(result.plan.kind,'native');
  const old=await f.service.open(ids(a.workflow));assert.equal(old.workflow.plan.kind,'single');assert.deepEqual(old.workflow.plan.pluginIds,[candidate.id]);
});
test('recommendation feedback context is bounded to recent ancestor notes and excludes sibling branches',async()=>{
  const f=fixture();const original=await planned(f);await f.service.feedback({...ids(original.workflow),outcome:'partial',note:'原版本的共同问题'});
  const branch=await f.service.refine({...ids(original.workflow),feedback:'仅后续分支的调整'});const branchPlan=await f.service.recommend({...ids(branch.workflow),intent:branch.intent});
  await f.service.feedback({...ids(branchPlan.workflow),outcome:'blocked',note:'仅后续分支的结果'});
  await f.service.open(ids(original.workflow));
  for(let index=0;index<8;index++)await f.service.feedback({...ids(original.workflow),outcome:'partial',note:`共同问题${index}：`+'汉'.repeat(1490)});
  const revised=await f.service.refine({...ids(original.workflow),feedback:'从原版本重新选择'});await f.service.recommend({...ids(revised.workflow),intent:revised.intent});
  const notes=f.calls.at(-1).data.userFeedbackContext;assert.equal(notes?.length,6);assert.ok(notes.every(note=>typeof note==='string'&&note.length<=1500));assert.ok(notes.includes('从原版本重新选择'));
  assert.ok(notes.some(note=>note.startsWith('共同问题7：')));assert.ok(notes.every(note=>!note.includes('仅后续分支')));assert.ok(notes.every(note=>!note.startsWith('共同问题0：')));
});

test('reset replay after a lost acknowledgment succeeds only while active remains blank',async()=>{
 const f=fixture();const a=await planned(f);const original=await f.service.exportTask({taskId:a.workflow.taskId});
 // Server committed the first request; pretend its acknowledgment never reached the client.
 await f.service.reset(ids(a.workflow));
 const replay=await f.service.reset(ids(a.workflow));assert.equal(replay.cleared,true);assert.equal(replay.workflow,null);
 assert.deepEqual(await f.service.exportTask({taskId:a.workflow.taskId}),original);
 const b=await f.service.analyze({request});await assert.rejects(f.service.reset(ids(a.workflow)),e=>e.code==='STALE_WORKFLOW');assert.equal((await f.service.bootstrap()).workflow.taskId,b.workflow.taskId);
});
