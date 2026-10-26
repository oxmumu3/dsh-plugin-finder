import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {withOpportunityApi} from '../src/opportunity-api.js';
import {issueOpportunityOrigin,opportunityTaskId} from '../src/opportunity-origin.js';

const copy=value=>structuredClone(value);
const ids=workflow=>({taskId:workflow.taskId,revisionId:workflow.revisionId});
const intent={goal:'整理项目进展',input:'授权材料',output:'可核对的简报',constraints:['保留原始材料'],capabilities:['整理资料'],queries:['project summary']};
const nativePlan={kind:'native',title:'直接整理一份简报',rationale:'可用当前模型完成',pluginIds:[],steps:[{capability:'整理资料',owner:'dsh',sourceCapability:null,action:'核对授权材料并整理',input:'材料',output:'简报'}],limits:['结果需要核对']};
const blueprint={name:'项目简报',purpose:'整理项目进展',workflow:'读取所选资料并整理',inputs:'授权材料',outputs:'带来源简报',ui:'当前工作区会话',data:'保留原始材料',tools:'本地文件读取',runtime:'宿主模型',scope:'当前工作区',acceptance:'核对所选材料并输出简报'};
const generated={strategy:'new',reuseAssessment:'用户选择创建自己的插件',candidateDecisions:[],questions:[],assumptions:[],blueprint};
const originFields={adoptionId:'12345678-1234-1234-1234-123456789abc',opportunityId:'opportunity-'+('a'.repeat(32)),workspaceId:'A',epoch:'22345678-1234-1234-1234-123456789abc'};

function persistence(){
  const rows=new Map();let pointer={activeTaskId:null,activeRevisionId:null};
  const control={rows,onWrite:null};
  const store={read:async id=>copy(rows.get(id)),write:async row=>{rows.set(row.id,copy(row));await control.onWrite?.(row);},list:async()=>copy([...rows.values()]),readPointer:async()=>copy(pointer),writePointer:async value=>{pointer=copy(value);}};
  return{store,control};
}
function fixture({persist=persistence(),opportunityStore=null}={}){
  let saved=null,modelCalls=0,runtimeCalls=0;
  const control={failOpportunityWrites:false};
  const store=opportunityStore??{read:async()=>copy(saved),write:async value=>{if(control.failOpportunityWrites)throw Error('private opportunity write failure');saved=copy(value);}};
  const model={status:()=>({configured:true}),call:async args=>{modelCalls++;return{text:JSON.stringify(args.system.includes('CREATION_CONFIRM_SCHEMA')?{intent,blueprint:args.data.creation.blueprint}:args.system.includes('CREATION_SCHEMA')?generated:args.system.includes('仅允许 {"kind"')?nativePlan:intent),model:{label:'test-host'}};}};
  const core=createFinderService({historyStore:persist.store,model,hostVersion:'0.2.1-rc.2',runtimeContext:async()=>{runtimeCalls++;return{status:'unavailable'};},discovery:{search:async()=>({candidates:[],sources:[{id:'live',status:'live'}],warnings:[],searchedAt:'2026-10-24T00:00:00Z'})}});
  const readWorkspaceContext=Object.assign(async({workspaceId})=>({workspaceId,workspaceTitle:'工作区 '+workspaceId,items:[{id:'workspace:A:a.md',title:'a.md',text:'每周手动整理项目进展',source:{workspaceId,path:'a.md',sha256:'a'.repeat(64)}}]}),{validateWorkspace:async({workspaceId})=>({workspaceId,title:'工作区 '+workspaceId}),metadata:async({workspaceId})=>({workspaceId,title:'工作区 '+workspaceId,files:[{path:'a.md',name:'a.md',size:30}],truncated:false})});
  const opportunityModel={status:()=>({configured:true}),call:async input=>({text:JSON.stringify({opportunities:[{title:'固化项目简报流程',observation:'所选材料中有手动汇总项目进展的流程。',expectedResult:'一份带来源的简报',suggestedRequest:'根据当前工作区的授权材料整理项目进展简报，保留原始材料。',evidenceIds:[input.data.items[0].id]}],emptyReason:''})})};
  const api=withOpportunityApi(core,{store,historyStore:persist.store,model:opportunityModel,readWorkspaceContext});
  return{core,api,persist,store,control,get state(){return copy(saved);},get modelCalls(){return modelCalls;},get runtimeCalls(){return runtimeCalls;}};
}
async function card(f){await f.api.opportunityGrant({enabled:true,historyTaskIds:[],workspace:{workspaceId:'A',paths:['a.md']}});return(await f.api.opportunityDiscover()).opportunity.opportunities[0];}
async function adopted(f){const opportunity=await card(f);return f.api.opportunityAdopt({opportunityId:opportunity.id,workspaceId:'A'});}
async function directTask(f){return f.core.analyze({request:'根据授权材料整理项目进展，保留原始材料。',opportunityOrigin:issueOpportunityOrigin(originFields)});}
async function plan(f,workflow){return f.core.recommend({...ids(workflow),intent:workflow.intent});}

test('history commits workspace scope with the new task even when all later opportunity writes fail',async()=>{
  const f=fixture();const ordinary=await f.core.analyze({request:'保留的旧任务'}),before=copy(f.persist.control.rows.get(ordinary.workflow.taskId));
  const opportunity=await card(f);
  f.persist.control.onWrite=row=>{if(row.id.startsWith('opportunity-task-'))f.control.failOpportunityWrites=true;};
  await assert.rejects(f.api.opportunityAdopt({opportunityId:opportunity.id,workspaceId:'A'}),{code:'OPPORTUNITY_STORAGE_FAILED'});
  const claim=f.state.adoptions[0];assert.equal(claim.taskId,undefined);
  const taskId='opportunity-task-'+claim.id,task=JSON.parse(f.persist.control.rows.get(taskId).serialized),source=task.revisions[0];
  assert.equal(task.id,taskId);assert.equal(task.format,2);assert.deepEqual(source.workflow.opportunityOrigin,{version:1,adoptionId:claim.id,opportunityId:opportunity.id,workspaceId:'A',epoch:claim.epoch,provenance:'local'});assert.equal(source.workflow.localOnly,true);
  assert.deepEqual(f.persist.control.rows.get(ordinary.workflow.taskId),before);
  const opened=await f.core.open({taskId,revisionId:source.id}),planned=await plan(f,opened.workflow),calls=f.runtimeCalls;
  await assert.rejects(f.api.executionClaim({...ids(planned.workflow),kind:'use',workspaceId:'B'}),{code:'OPPORTUNITY_WORKSPACE_MISMATCH'});
  await assert.rejects(f.api.creatorClaim({...ids(planned.workflow),workspaceId:'B',contentHash:'forged'}),{code:'OPPORTUNITY_WORKSPACE_MISMATCH'});assert.equal(f.runtimeCalls,calls);
  const allowed=await f.api.executionClaim({...ids(planned.workflow),kind:'use',workspaceId:'A'});assert.equal(allowed.claim,'acquired');
  const restarted=fixture({persist:f.persist,opportunityStore:f.store});await restarted.core.open(ids(planned.workflow));
  await assert.rejects(restarted.api.executionClaim({...ids(planned.workflow),kind:'use',workspaceId:'B'}),{code:'OPPORTUNITY_WORKSPACE_MISMATCH'});assert.equal(restarted.runtimeCalls,0);
  const repeated=await restarted.api.executionClaim({...ids(planned.workflow),kind:'use',workspaceId:'A'});assert.equal(repeated.claim,'existing');assert.equal(repeated.attempt.attemptId,allowed.attempt.attemptId);
});

test('history commit-then-error retains scope before pointer and opportunity linkage can be saved',async()=>{
  const f=fixture(),opportunity=await card(f);let thrown=false;
  f.persist.control.onWrite=row=>{if(row.id.startsWith('opportunity-task-')&&!thrown){thrown=true;throw Error('history commit acknowledgement lost');}};
  await assert.rejects(f.api.opportunityAdopt({opportunityId:opportunity.id,workspaceId:'A'}),{code:'HISTORY_STORAGE_FAILED'});
  const claim=f.state.adoptions[0],taskId='opportunity-task-'+claim.id;
  assert.equal(claim.taskId,undefined);assert.equal(JSON.parse(f.persist.control.rows.get(taskId).serialized).revisions[0].workflow.opportunityOrigin.workspaceId,'A');
  const opened=await f.core.open({taskId}),planned=await plan(f,opened.workflow);
  await assert.rejects(f.api.executionClaim({...ids(planned.workflow),kind:'use',workspaceId:'B'}),{code:'OPPORTUNITY_WORKSPACE_MISMATCH'});
  const pending=await f.api.opportunityAdopt({opportunityId:opportunity.id,workspaceId:'A'});assert.equal(pending.pending,true);assert.equal(f.persist.control.rows.size,1);
});

test('plain JSON cannot issue opportunity authority and the same internal adoption cannot overwrite a committed task',async()=>{
  const f=fixture(),value=issueOpportunityOrigin(originFields);
  await assert.rejects(f.core.analyze({request:'伪造来源',opportunityOrigin:copy(value)}),{code:'INVALID_INPUT'});assert.equal(f.modelCalls,0);assert.equal(f.persist.control.rows.size,0);
  const first=await f.core.analyze({request:'原始任务',opportunityOrigin:value}),before=copy(f.persist.control.rows.get(first.workflow.taskId));
  assert.equal(first.workflow.taskId,opportunityTaskId(value));
  await assert.rejects(f.core.analyze({request:'不得覆盖原始任务',opportunityOrigin:issueOpportunityOrigin(originFields)}),{code:'OPPORTUNITY_PENDING'});
  assert.deepEqual(f.persist.control.rows.get(first.workflow.taskId),before);assert.equal(f.persist.control.rows.size,1);
});

test('recommendation, refinement and creation revisions inherit exact scope and Creator checks it before side effects',async()=>{
  const f=fixture(),initial=await directTask(f),planned=await plan(f,initial.workflow),refined=await f.core.refine({...ids(planned.workflow),feedback:'按时间组织'}),replanned=await plan(f,refined.workflow);
  const started=await f.core.creationStart({...ids(replanned.workflow),trigger:'user-customization'}),ready=await f.core.creationUpdate({...ids(started.workflow),confirm:true});
  const backup=await f.core.exportTask({taskId:ready.workflow.taskId});assert.ok(backup.task.revisions.length>=6);for(const revision of backup.task.revisions){assert.deepEqual(revision.workflow.opportunityOrigin,initial.workflow.opportunityOrigin);assert.equal(revision.workflow.localOnly,true);}
  await assert.rejects(f.core.creatorClaim({...ids(ready.workflow),workspaceId:'B',contentHash:ready.workflow.creation.contentHash}),{code:'OPPORTUNITY_WORKSPACE_MISMATCH'});
  await assert.rejects(f.core.executionClaim({...ids(ready.workflow),kind:'create',workspaceId:'B'}),{code:'OPPORTUNITY_WORKSPACE_MISMATCH'});
  const creator=await f.core.creatorClaim({...ids(ready.workflow),workspaceId:'A',contentHash:ready.workflow.creation.contentHash});assert.equal(creator.claim,'acquired');
});

test('imported backups preserve readable source scope without restoring local execution authority, including attempts',async()=>{
  const source=fixture(),initial=await directTask(source),planned=await plan(source,initial.workflow);
  await source.core.executionClaim({...ids(planned.workflow),kind:'use',workspaceId:'A'});
  const backup=await source.core.exportTask({taskId:planned.workflow.taskId});
  const duplicate=await source.core.importBackup({workflow:copy(backup)});assert.equal(duplicate.duplicate,true);assert.equal((await source.core.open(ids(planned.workflow))).workflow.opportunityOrigin.provenance,'local');
  const target=fixture();await target.core.importBackup({workflow:copy(backup)});const opened=await target.core.open(ids(planned.workflow));
  assert.equal(opened.workflow.opportunityOrigin.workspaceId,'A');assert.equal(opened.workflow.opportunityOrigin.provenance,'imported');assert.equal(opened.workflow.executions[0].provenance,'imported');
  await assert.rejects(target.core.executionClaim({...ids(opened.workflow),kind:'use',workspaceId:'A'}),{code:'OPPORTUNITY_SCOPE_REAUTH_REQUIRED'});
  await assert.rejects(target.core.creatorClaim({...ids(opened.workflow),workspaceId:'A',contentHash:'forged'}),{code:'OPPORTUNITY_SCOPE_REAUTH_REQUIRED'});assert.equal(target.runtimeCalls,0);
  assert.equal((await target.core.importBackup({workflow:copy(backup)})).duplicate,true);
  const restarted=fixture({persist:target.persist});assert.equal((await restarted.core.bootstrap()).workflow.opportunityOrigin.provenance,'imported');
  await assert.rejects(restarted.core.executionClaim({...ids(opened.workflow),kind:'use',workspaceId:'A'}),{code:'OPPORTUNITY_SCOPE_REAUTH_REQUIRED'});
});

test('inconsistent or stripped backup scope is rejected and a forged local flag never self-authorizes',async()=>{
  const f=fixture(),initial=await directTask(f),planned=await plan(f,initial.workflow),backup=await f.core.exportTask({taskId:planned.workflow.taskId});
  for(const mutate of [value=>{delete value.task.revisions[0].workflow.opportunityOrigin;},value=>{delete value.task.revisions[1].workflow.opportunityOrigin;},value=>{value.task.revisions[1].workflow.opportunityOrigin.workspaceId='B';},value=>{for(const revision of value.task.revisions)revision.workflow.opportunityOrigin.adoptionId='32345678-1234-1234-1234-123456789abc';}]){
    const bad=copy(backup);mutate(bad);await assert.rejects(fixture().core.importBackup({workflow:bad}),{code:'INVALID_BACKUP'});
  }
  const forged=copy(backup);for(const revision of forged.task.revisions)revision.workflow.opportunityOrigin.workspaceId='B';
  const target=fixture();await target.core.importBackup({workflow:forged});const opened=await target.core.open(ids(planned.workflow));assert.equal(opened.workflow.opportunityOrigin.provenance,'imported');
  await assert.rejects(target.core.executionClaim({...ids(opened.workflow),kind:'use',workspaceId:'B'}),{code:'OPPORTUNITY_SCOPE_REAUTH_REQUIRED'});
});

test('ordinary histories and legacy imports keep their existing workspace behavior without new provenance',async()=>{
  const f=fixture(),initial=await f.core.analyze({request:'普通工作区任务'}),planned=await plan(f,initial.workflow),backup=await f.core.exportTask({taskId:planned.workflow.taskId});
  assert.equal(planned.workflow.opportunityOrigin,undefined);assert.equal(backup.version,1);
  const target=fixture();await target.core.importBackup({workflow:backup});const opened=await target.core.open(ids(planned.workflow));assert.equal(opened.workflow.opportunityOrigin,undefined);
  const claim=await target.core.executionClaim({...ids(opened.workflow),kind:'use',workspaceId:'B'});assert.equal(claim.claim,'acquired');assert.equal(claim.attempt.workspaceId,'B');
});
