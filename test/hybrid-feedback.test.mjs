import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryRepository} from '../src/history.js';
import {createFinderService} from '../src/service.js';
import {validateTelemetryEvent} from '../src/telemetry-contract.js';

const copy=structuredClone;
function memory(){const rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null};const store={read:async id=>copy(rows.get(id)),write:async row=>rows.set(row.id,copy(row)),list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async v=>{pointer=copy(v);}};return{rows,store,repo:createHistoryRepository({store})};}
function workflow(count,kind='combo'){
 const candidates=Array.from({length:count},(_,i)=>({id:'provider-'+i,name:'provider-'+i,capabilities:['能力'+i],install:{type:'npm',spec:'provider-'+i+'@1.0.0',version:'1.0.0'}}));
 const capabilities=candidates.map(p=>p.capabilities[0]),steps=candidates.map(p=>({capability:p.capabilities[0],owner:p.id,sourceCapability:p.capabilities[0],action:'执行原能力',input:'工作区',output:'结果'}));
 if(kind==='hybrid'){capabilities.push('补齐审计');steps.push({capability:'补齐审计',owner:'create',sourceCapability:null,action:'只补审计',input:'结果',output:'审计记录'});}
 return{stage:'plan',request:'保留现成能力完成任务',intent:{goal:'完成任务',input:'当前工作区',output:'可用结果',constraints:[],capabilities,queries:['workflow']},candidates,plan:{kind,title:'复用方案',rationale:'保留已有能力',pluginIds:candidates.map(p=>p.id),...(kind==='hybrid'?{gaps:[{capability:'补齐审计',reason:'现成能力尚缺持久审计'}]}:{}),steps,limits:[]}};
}
for(const count of [3,4])for(const kind of ['combo','hybrid'])test(`${count}-provider ${kind} completion and refinement remain readable across list/export/import`,async()=>{
 const m=memory(),old=await m.repo.append(workflow(1,'single')),original=m.rows.get(old.task.id).serialized;
 const base=await m.repo.append(workflow(count,kind));await m.repo.feedback(base,{outcome:'complete',note:'原任务已核对',pluginIds:base.revision.workflow.plan.pluginIds});
 const read=await m.repo.read(base.task.id);assert.deepEqual(read.feedback[0].pluginIds,base.revision.workflow.plan.pluginIds);assert.equal((await m.repo.list()).historyTotal,2);
 const current=await m.repo.context({taskId:base.task.id,revisionId:base.revision.id});const refined=await m.repo.append(current.revision.workflow,current,{feedbackText:'保留所有原插件，调整展示标题'});
 const after=await m.repo.read(base.task.id);assert.deepEqual(after.feedback.at(-1).pluginIds,base.revision.workflow.plan.pluginIds);assert.equal(after.feedback.at(-1).type,'refinement');assert.equal((await m.repo.list()).historyTotal,2);
 const backup=await m.repo.exportTask({taskId:base.task.id}),destination=memory();await destination.repo.importBackup({workflow:backup});
 const restored=await destination.repo.read(base.task.id);assert.deepEqual(restored.feedback,backup.task.feedback);assert.equal(restored.revisions.length,refined.task.revisions.length);assert.equal((await destination.repo.list()).historyTotal,1);assert.deepEqual((await destination.repo.exportTask({taskId:base.task.id})).task.feedback,backup.task.feedback);
 assert.equal(m.rows.get(old.task.id).serialized,original,'old unrelated history must remain byte-identical');
});
test('legacy feedback accepts four known providers, still rejects five or invented ids before writing',async()=>{
 const plugins=workflow(4).candidates,rows=[],service=createFinderService({catalog:{plugins:[...plugins,{id:'fifth',name:'fifth'}]},model:{status:()=>({configured:true})},feedbackStore:{append:async row=>rows.push(copy(row))}});
 assert.equal((await service.feedback({outcome:'complete',pluginIds:plugins.map(p=>p.id)})).saved,true);assert.equal(rows[0].pluginIds.length,4);
 for(const pluginIds of [[...plugins.map(p=>p.id),'fifth'],['invented']])await assert.rejects(service.feedback({outcome:'complete',pluginIds}),{code:'INVALID_INPUT'});assert.equal(rows.length,1);
});
test('legacy format-2 hybrid restore preserves gaps and does not rewrite stored bytes',async()=>{
 const value={format:2,...workflow(4,'hybrid')};value.plan.nextPrompt='旧草稿';const serialized=JSON.stringify(value);let writes=0;
 const service=createFinderService({model:{status:()=>({configured:true})},workflowStore:{read:async()=>({serialized}),write:async()=>{writes++;}}});
 const result=await service.bootstrap();assert.equal(result.workflowWarning,undefined);assert.deepEqual(result.workflow.plan.gaps,value.plan.gaps);assert.equal(result.workflow.plan.pluginIds.length,4);assert.equal(writes,0);assert.equal(serialized,JSON.stringify(value));
});
test('sanitized telemetry supports four selected providers and hybrid without claiming verified success',()=>{
 const v=workflow(4,'hybrid'),event={schemaVersion:1,eventId:'a'.repeat(64),epochId:'11111111-1111-4111-8111-111111111111',taskId:'b'.repeat(64),revisionId:'c'.repeat(64),type:'feedback_submitted',occurredAt:'2026-11-03T12:00:00Z',clientVersion:'0.12.0-preview.1',hostVersion:'0.2.1-rc.5',data:{plan:{kind:'hybrid',title:v.plan.title,rationale:v.plan.rationale,steps:v.plan.steps.map(s=>({owner:s.owner,action:s.action}))},plugins:v.candidates.map(p=>({name:p.name,version:p.install.version,commit:null,repository:null,sourceType:'npm',modelSelected:true,userSelected:false,installationStatus:'unknown'})),feedback:{outcome:'complete',note:'任务层自报',stage:'result',evidence:'user_reported'}}};
 assert.equal(validateTelemetryEvent(event).data.plugins.length,4);assert.equal(event.data.feedback.evidence,'user_reported');assert.ok(event.data.plugins.every(p=>p.installationStatus==='unknown'));
});
