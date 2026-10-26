import {createHash,randomUUID} from 'node:crypto';
import {fail,FinderError,MAX_INTENT_CONSTRAINTS,MAX_MODEL_CONSTRAINTS,parseIntent,parsePlan,record,text} from './contracts.js';
import {publicSourceData,publicSourceText} from './provenance.js';
import {validateTelemetryEvent} from './telemetry-contract.js';
import {parseCreation,parseTrigger,creationContentHash,CREATOR_STATUSES} from './creation.js';
import {assertCommunityPlan} from './community-selection.js';
import {validatePreparation,requirePrepared,preparedPrompt} from './execution-preparation.js';
import {parseOpportunityOrigin,isIssuedOpportunityOrigin,opportunityTaskId,sameOpportunityOrigin,requireOpportunityWorkspace,OPPORTUNITY_TASK_PREFIX} from './opportunity-origin.js';

export const MAX_TASK_BYTES=8_000_000;
export const MAX_IMPORT_BYTES=8_100_000;
export const ORIGIN_RESERVE_BYTES=1024;
export const MAX_TELEMETRY_BYTES=256_000;
export const MAX_STORED_TASK_BYTES=MAX_TASK_BYTES+MAX_TELEMETRY_BYTES;
const TELEMETRY_WARNING='本机记录已保留，但本次集中记录未能完整排队；请查看同步状态后重试。';
const copy=value=>structuredClone(value);
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=value=>text(value,200,'INVALID_BACKUP');
function bounded(value,max=MAX_TASK_BYTES){let serialized;try{serialized=JSON.stringify(value);}catch{fail('INVALID_BACKUP');}if(Buffer.byteLength(serialized,'utf8')>max)fail('HISTORY_CAPACITY');return serialized;}
function array(value,max=10000){if(!Array.isArray(value)||value.length>max)fail('INVALID_BACKUP');return value;}
const withoutTelemetry=task=>{const{telemetryEvents,...business}=task;return business;};
export const EXECUTION_STATUSES=['claimed','created','submitting','submitted','failed','cancelled'];
const EXECUTION_ORDER={claimed:0,created:1,submitting:2,submitted:3};
const MAX_EXECUTION_PROMPT=240000;
const executionConflict=()=>{const error=new FinderError('EXECUTION_ATTEMPT_CONFLICT',409);error.message='这次执行的任务或会话身份不一致，已有执行记录保持不变。请重新打开原方案查看进度。';throw error;};
function executionReady(workflow,kind,code='INVALID_INPUT'){
  if(!['use','create'].includes(kind))fail(code);
  if(kind==='create'){
    if(!workflow?.creation||workflow.creation.status!=='ready'||workflow.creation.supply.status!=='current')fail(code==='INVALID_INPUT'?'CREATION_NOT_READY':code);
  }else {if(workflow?.stage!=='plan'||!workflow.plan||workflow.plan.kind==='gap')fail(code);assertCommunityPlan(workflow,code);}
}

/** Validate imported snapshots as data, retaining the original user request. */
export function validateWorkflow(value){
  if(!record(value)||!['understand','plan'].includes(value.stage))fail('INVALID_BACKUP');
  const request=text(value.request,6000,'INVALID_BACKUP');
  let intent;try{intent=parseIntent(value.intent,'INVALID_BACKUP');}catch{fail('INVALID_BACKUP');}
  const candidates=array(value.candidates??[],8).map(candidate=>{
    if(!record(candidate)||!Array.isArray(candidate.capabilities)||!candidate.capabilities.length||candidate.capabilities.length>20)fail('INVALID_BACKUP');
    id(candidate.id);id(candidate.name);for(const capability of candidate.capabilities)text(capability,1000,'INVALID_BACKUP');
    return publicSourceData(copy(candidate));
  });
  const known=new Set(candidates.map(candidate=>candidate.id));if(known.size!==candidates.length)fail('INVALID_BACKUP');
  const workflow={stage:value.stage,request,intent,candidates};
  if(value.communityEntryId!==undefined)workflow.communityEntryId=text(value.communityEntryId,1000,'INVALID_BACKUP');
  if(value.creation!==undefined){workflow.creation=parseCreation(value.creation);if(workflow.creation.supply.status==='current'&&workflow.creation.supply.intentHash!==hash(intent))fail('INVALID_BACKUP');}
  if(value.localOnly!==undefined){if(value.localOnly!==true)fail('INVALID_BACKUP');workflow.localOnly=true;}
  if(value.opportunityOrigin!==undefined){workflow.opportunityOrigin=parseOpportunityOrigin(value.opportunityOrigin);workflow.localOnly=true;}
  if(workflow.creation)workflow.localOnly=true;
  for(const key of ['model','eligibility','discovery','catalogUpdatedAt','analysisWarning'])if(value[key]!==undefined)workflow[key]=publicSourceData(copy(value[key]),key);
  if(value.warnings!==undefined){workflow.warnings=array(value.warnings,100).map(item=>publicSourceText(text(item,4000,'INVALID_BACKUP')));}
  if(value.stage==='plan'){
    if(!record(value.plan)||!Array.isArray(value.plan.limits))fail('INVALID_BACKUP');
    let parsed;try{parsed=parsePlan({kind:value.plan.kind,title:value.plan.title,rationale:value.plan.rationale,pluginIds:value.plan.pluginIds,steps:value.plan.steps,limits:value.plan.limits.slice(0,8)},candidates,intent);}catch{fail('INVALID_BACKUP');}
    workflow.plan={...parsed,limits:array(value.plan.limits,100).map(item=>publicSourceText(text(item,4000,'INVALID_BACKUP'))),nextPrompt:publicSourceText(typeof value.plan.nextPrompt==='string'?value.plan.nextPrompt:'')};
  }
  assertCommunityPlan(workflow);
  return workflow;
}

function validateTask(value){
  bounded(value,MAX_STORED_TASK_BYTES);
  if(!record(value)||![1,2].includes(value.format)||!stamp(value.createdAt)||!stamp(value.updatedAt))fail('INVALID_BACKUP');
  const task={format:value.format,id:id(value.id),originalRequest:text(value.originalRequest,6000,'INVALID_BACKUP'),originalConstraints:array(value.originalConstraints??[],MAX_INTENT_CONSTRAINTS).map(item=>text(item,350,'INVALID_BACKUP')),createdAt:value.createdAt,updatedAt:value.updatedAt,revisions:[],feedback:[],handoffs:[]};
  if(task.format===1&&task.originalConstraints.length>MAX_MODEL_CONSTRAINTS)fail('INVALID_BACKUP');
  const revisionIds=new Set();
  for(const [index,revision] of array(value.revisions).entries()){
    if(!record(revision)||revision.number!==index+1||!stamp(revision.createdAt)||revisionIds.has(revision.id))fail('INVALID_BACKUP');
    const parent=revision.parentRevisionId??null;if(parent!==null&&!revisionIds.has(parent))fail('INVALID_BACKUP');
    const cleaned={id:id(revision.id),number:revision.number,createdAt:revision.createdAt,parentRevisionId:parent,workflow:validateWorkflow(revision.workflow)};
    const firstOrigin=task.revisions[0]?.workflow.opportunityOrigin;
    if(index===0){
      if(cleaned.workflow.opportunityOrigin&&(task.format!==2||task.id!==opportunityTaskId(cleaned.workflow.opportunityOrigin)))fail('INVALID_BACKUP');
      if(task.id.startsWith(OPPORTUNITY_TASK_PREFIX)&&!cleaned.workflow.opportunityOrigin)fail('INVALID_BACKUP');
    }else if(firstOrigin?!cleaned.workflow.opportunityOrigin||!sameOpportunityOrigin(firstOrigin,cleaned.workflow.opportunityOrigin):cleaned.workflow.opportunityOrigin!==undefined)fail('INVALID_BACKUP');
    if(cleaned.workflow.request!==task.originalRequest)fail('INVALID_BACKUP');
    if(task.originalConstraints.some(constraint=>!cleaned.workflow.intent.constraints.includes(constraint)))fail('INVALID_BACKUP');
    const parentRevision=task.revisions.find(item=>item.id===parent);
    if(parentRevision?.workflow.localOnly)cleaned.workflow.localOnly=true;
    if(parentRevision?.workflow.communityEntryId!==undefined&&parentRevision.workflow.communityEntryId!==cleaned.workflow.communityEntryId)fail('INVALID_BACKUP');
    if(cleaned.workflow.creation){
      const creation=cleaned.workflow.creation,source=task.revisions.find(item=>item.id===creation.source.revisionId);
      if(creation.source.taskId!==task.id||!source)fail('INVALID_BACKUP');
      const ancestors=new Set();let cursor=parentRevision;while(cursor){ancestors.add(cursor.id);cursor=task.revisions.find(item=>item.id===cursor.parentRevisionId);}
      if(!ancestors.has(source.id))fail('INVALID_BACKUP');
      const known=new Set([...source.workflow.candidates,...cleaned.workflow.candidates].map(item=>item.id));
      if(creation.candidateDecisions.some(item=>!known.has(item.pluginId)))fail('INVALID_BACKUP');
      parseTrigger({trigger:creation.trigger.kind,reason:creation.trigger.reason,evidence:creation.trigger.evidence},source.workflow.candidates,'INVALID_BACKUP');
    }
    if(value.format===1&&(cleaned.workflow.localOnly||cleaned.workflow.intent.constraints.length>MAX_MODEL_CONSTRAINTS))fail('INVALID_BACKUP');
    if(revision.feedbackText!==undefined)cleaned.feedbackText=text(revision.feedbackText,1500,'INVALID_BACKUP',true);
    revisionIds.add(cleaned.id);task.revisions.push(cleaned);
  }
  if(!task.revisions.length)fail('INVALID_BACKUP');
  const eventIds=new Set();
  for(const entry of array(value.feedback??[])){
    if(!record(entry)||!revisionIds.has(entry.revisionId)||entry.taskId!==task.id||!stamp(entry.createdAt)||eventIds.has(entry.id))fail('INVALID_BACKUP');
    const type=entry.type??'result';if(!['result','refinement'].includes(type)||type==='result'&&!['complete','partial','blocked'].includes(entry.outcome)||type==='refinement'&&entry.outcome!==null)fail('INVALID_BACKUP');
    const revision=task.revisions.find(item=>item.id===entry.revisionId),allowed=new Set(revision.workflow.plan?.pluginIds??[]);
    const pluginIds=array(entry.pluginIds??[],2).map(id);if(pluginIds.some(pluginId=>!allowed.has(pluginId)))fail('INVALID_BACKUP');
    const cleaned={id:id(entry.id),taskId:task.id,revisionId:entry.revisionId,createdAt:entry.createdAt,type,outcome:entry.outcome,note:text(entry.note??'',1500,'INVALID_BACKUP',true),stage:text(entry.stage??'result',80,'INVALID_BACKUP'),pluginIds};
    eventIds.add(cleaned.id);task.feedback.push(cleaned);
  }
  for(const entry of array(value.handoffs??[])){
    if(!record(entry)||entry.taskId!==task.id||!revisionIds.has(entry.revisionId)||!stamp(entry.createdAt)||!['applied','preserved'].includes(entry.status))fail('INVALID_BACKUP');
    task.handoffs.push({taskId:task.id,revisionId:entry.revisionId,workspaceId:id(entry.workspaceId),sessionId:id(entry.sessionId),status:entry.status,createdAt:entry.createdAt});
  }
  if(value.creatorAttempts!==undefined){
    if(value.format!==2)fail('INVALID_BACKUP');const attemptIds=new Set(),keys=new Set();
    task.creatorAttempts=array(value.creatorAttempts,1000).map(entry=>{
      if(!record(entry)||entry.purpose!=='creator'||entry.taskId!==task.id||!revisionIds.has(entry.revisionId)||!stamp(entry.createdAt)||!stamp(entry.updatedAt)||!CREATOR_STATUSES.includes(entry.status)||!['local','imported'].includes(entry.provenance))fail('INVALID_BACKUP');
      const source=task.revisions.find(item=>item.id===entry.revisionId),creation=source.workflow.creation;
      if(!creation||creation.status!=='ready'||entry.contentHash!==creationContentHash(creation))fail('INVALID_BACKUP');
      const attempt={attemptId:id(entry.attemptId),purpose:'creator',taskId:task.id,revisionId:entry.revisionId,contentHash:entry.contentHash,workspaceId:id(entry.workspaceId),status:entry.status,createdAt:entry.createdAt,updatedAt:entry.updatedAt,provenance:entry.provenance};
      if(entry.sessionId!==undefined)attempt.sessionId=id(entry.sessionId);
      if(['created','applied','preserved','attach-failed','preset-mismatch'].includes(attempt.status)&&!attempt.sessionId)fail('INVALID_BACKUP');
      if(entry.message!==undefined)attempt.message=text(entry.message,2000,'INVALID_BACKUP',true);
      const key=JSON.stringify([attempt.purpose,attempt.taskId,attempt.revisionId,attempt.contentHash,attempt.workspaceId]);
      if(attemptIds.has(attempt.attemptId)||keys.has(key))fail('INVALID_BACKUP');attemptIds.add(attempt.attemptId);keys.add(key);return attempt;
    });
  }
  if(value.executions!==undefined){
    if(value.format!==2)fail('INVALID_BACKUP');const attemptIds=new Set(),requestIds=new Set(),keys=new Set();
    task.executions=array(value.executions,1000).map(entry=>{
      if(!record(entry)||entry.taskId!==task.id||!revisionIds.has(entry.revisionId)||!stamp(entry.createdAt)||!stamp(entry.updatedAt)||!EXECUTION_STATUSES.includes(entry.status)||!['local','imported'].includes(entry.provenance))fail('INVALID_BACKUP');
      const revision=task.revisions.find(item=>item.id===entry.revisionId);executionReady(revision.workflow,entry.kind,'INVALID_BACKUP');
      if(entry.contentHash!==hash(revision.workflow))fail('INVALID_BACKUP');
      const attempt={attemptId:id(entry.attemptId),requestId:id(entry.requestId),taskId:task.id,revisionId:entry.revisionId,kind:entry.kind,workspaceId:id(entry.workspaceId),contentHash:entry.contentHash,prompt:text(entry.prompt,MAX_EXECUTION_PROMPT,'INVALID_BACKUP'),status:entry.status,sessionId:entry.sessionId===null?null:id(entry.sessionId),createdAt:entry.createdAt,updatedAt:entry.updatedAt,provenance:entry.provenance};
      if(['created','submitting','submitted'].includes(attempt.status)&&!attempt.sessionId)fail('INVALID_BACKUP');
      if(attempt.status==='claimed'&&attempt.sessionId!==null)fail('INVALID_BACKUP');
      if(entry.message!==undefined)attempt.message=text(entry.message,2000,'INVALID_BACKUP',true);
      if(entry.preparation!==undefined)attempt.preparation=validatePreparation(entry.preparation,revision.workflow,attempt.kind);
      const key=JSON.stringify([attempt.revisionId,attempt.kind,attempt.workspaceId]);
      if(attemptIds.has(attempt.attemptId)||requestIds.has(attempt.requestId)||keys.has(key))fail('INVALID_BACKUP');
      attemptIds.add(attempt.attemptId);requestIds.add(attempt.requestId);keys.add(key);return attempt;
    });
  }
  if(value.origin!==undefined){const origin=value.origin;if(!record(origin)||!['backup','legacy-current'].includes(origin.type)||!stamp(origin.importedAt)||origin.importedAt.length>40||typeof origin.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(origin.sourceHash)||!['legacy-format-2','plugin-finder-task'].includes(origin.sourceFormat))fail('INVALID_BACKUP');task.origin={type:origin.type,label:text(origin.label,200,'INVALID_BACKUP'),importedAt:origin.importedAt,sourceHash:origin.sourceHash,sourceFormat:origin.sourceFormat};}
  if(value.telemetryEvents!==undefined){
    const seen=new Set();task.telemetryEvents=array(value.telemetryEvents,1000).map(event=>{try{validateTelemetryEvent(event);}catch{fail('INVALID_BACKUP');}if(seen.has(event.eventId))fail('INVALID_BACKUP');seen.add(event.eventId);return copy(event);});
    bounded({telemetryEvents:task.telemetryEvents},MAX_TELEMETRY_BYTES);
  }
  bounded(withoutTelemetry(task));
  return task;
}
const contentHash=task=>{
  const {origin,...content}=withoutTelemetry(task);
  // Import changes authority, not the underlying saved solution. Normalize only
  // that provenance bit when comparing an existing task with its exact backup.
  content.revisions=content.revisions.map(revision=>revision.workflow.opportunityOrigin?{...revision,workflow:{...revision.workflow,opportunityOrigin:{...revision.workflow.opportunityOrigin,provenance:'imported'}}}:revision);
  for(const field of ['creatorAttempts','executions'])if(content[field])content[field]=content[field].map(({provenance,...attempt})=>field==='executions'?{...attempt,contentHash:hash(content.revisions.find(revision=>revision.id===attempt.revisionId).workflow)}:attempt);
  return hash(content);
};

function privateRevision(task,revision){let current=revision;const seen=new Set();while(current&&!seen.has(current.id)){if(current.workflow.creation||current.workflow.localOnly)return true;seen.add(current.id);current=task.revisions.find(item=>item.id===current.parentRevisionId);}return false;}

// This is a read-only presentation of existing records, not a second chat store.
// A refinement belongs to its child; parent feedback also contains sibling branches.
function projectConversation(task,selected){
  const byId=new Map(task.revisions.map(revision=>[revision.id,revision])),lineage=[];
  for(let current=selected;current;current=byId.get(current.parentRevisionId))lineage.push(current);
  lineage.reverse();const first=lineage[0],turns=[];
  const add=(revision,role,suffix,text)=>turns.push({id:revision.id+':'+suffix,role,text,revisionId:revision.id,revisionNumber:revision.number});
  const excerpt=(value,max=600)=>value.length>max?value.slice(0,max)+'…':value;
  add(first,'user','request',task.originalRequest);
  for(const revision of lineage){
    const workflow=revision.workflow,parent=byId.get(revision.parentRevisionId);
    if(revision.feedbackText)add(revision,'user','feedback',revision.feedbackText);
    if(workflow.creation){
      // Old manual saves and confirmation bookkeeping have no recorded model
      // utterance. Keep their outcome in the version card, not fictional chat.
      if(parent?.workflow.creation&&!revision.feedbackText)continue;
      const creation=workflow.creation,blueprint=creation.blueprint;
      add(revision,'assistant','creation',[
        '建造蓝图：'+excerpt(blueprint.name,160),
        '目标：'+excerpt(blueprint.purpose),
        '流程：'+excerpt(blueprint.workflow),
        ...creation.questions.filter(question=>!creation.answers.some(answer=>answer.id===question.id)).map(question=>'待明确：'+question.question+(question.options.length?'\n可选：'+question.options.join('；'):'')),
      ].join('\n'));
    }else if(workflow.stage==='plan'){
      add(revision,'assistant','plan','方案：'+workflow.plan.title+'\n'+workflow.plan.rationale);
    }else{
      add(revision,'assistant','intent','需求理解：'+excerpt(workflow.intent.goal)+'\n输入：'+workflow.intent.input+'\n产出：'+workflow.intent.output);
    }
  }
  return turns;
}

export function projectWorkflow(task,revisionId){
  const revision=revisionId?task.revisions.find(item=>item.id===revisionId):task.revisions.at(-1);if(!revision)fail('WORKFLOW_NOT_FOUND');
  return{...copy(revision.workflow),taskId:task.id,revisionId:revision.id,revisionNumber:revision.number,createdAt:task.createdAt,updatedAt:task.updatedAt,revisionCreatedAt:revision.createdAt,
    conversation:projectConversation(task,revision),
    executions:copy((task.executions??[]).filter(entry=>entry.revisionId===revision.id)),
    revisions:task.revisions.map(item=>({revisionId:item.id,revisionNumber:item.number,stage:item.workflow.stage,title:item.workflow.plan?.title??item.workflow.intent.goal,createdAt:item.createdAt,parentRevisionId:item.parentRevisionId,feedbackCount:task.feedback.filter(entry=>entry.revisionId===item.id).length})),
    feedback:copy(task.feedback.filter(entry=>entry.revisionId===revision.id)),handoff:copy(task.handoffs.filter(entry=>entry.revisionId===revision.id).at(-1)??null),creatorAttempts:copy((task.creatorAttempts??[]).filter(entry=>entry.revisionId===revision.id)),creatorHandoff:copy((task.creatorAttempts??[]).filter(entry=>entry.revisionId===revision.id&&entry.sessionId).at(-1)??null),...(task.origin?{origin:copy(task.origin)}:{})};
}
function summary(task){const latest=task.revisions.at(-1);return{taskId:task.id,title:latest.workflow.plan?.title??latest.workflow.intent.goal,request:task.originalRequest,createdAt:task.createdAt,updatedAt:task.updatedAt,revisionCount:task.revisions.length,latestRevisionId:latest.id,latestRevisionNumber:latest.number,stage:latest.workflow.stage,lastFeedback:copy(task.feedback.filter(entry=>entry.type==='result').at(-1)??null),...(task.origin?{origin:copy(task.origin)}:{})};}

/** Storage adapter owns raw rows; immutable snapshots are serialized per task. */
export function createHistoryRepository({store,clock=()=>new Date(),telemetry}={}){
  if(!store?.read||!store?.write||!store?.list||!store?.readPointer||!store?.writePointer)throw new TypeError('historyStore adapter is incomplete');
  const io=async fn=>{try{return await fn();}catch(error){if(error instanceof FinderError)throw error;fail('HISTORY_STORAGE_FAILED');}};
  const read=async taskId=>{const row=await io(()=>store.read(taskId));if(!row)fail('WORKFLOW_NOT_FOUND');try{if(row.id!==taskId||typeof row.serialized!=='string')throw Error();const task=validateTask(JSON.parse(row.serialized));if(task.id!==taskId)throw Error();return task;}catch(error){if(error?.code==='HISTORY_CAPACITY')throw error;fail('INVALID_BACKUP');}};
  const pointer=async()=>{const value=await io(()=>store.readPointer());if(value==null)return{activeTaskId:null,activeRevisionId:null};if(!record(value)||!(value.activeTaskId===null&&value.activeRevisionId===null||typeof value.activeTaskId==='string'&&typeof value.activeRevisionId==='string'))fail('HISTORY_STORAGE_FAILED');return{activeTaskId:value.activeTaskId,activeRevisionId:value.activeRevisionId};};
  const point=async(taskId,revisionId)=>io(()=>store.writePointer({activeTaskId:taskId??null,activeRevisionId:revisionId??null}));
  const write=async task=>{
    // A future restore may add a UTF-8 label. Reserve its bounded envelope now,
    // rather than making a successfully exported task impossible to reimport.
    const {origin,...content}=withoutTelemetry(task);bounded(content,MAX_TASK_BYTES-ORIGIN_RESERVE_BYTES);
    if(origin&&Buffer.byteLength(JSON.stringify({origin}),'utf8')>ORIGIN_RESERVE_BYTES)fail('HISTORY_CAPACITY');
    if(task.telemetryEvents)bounded({telemetryEvents:task.telemetryEvents},MAX_TELEMETRY_BYTES);
    const serialized=bounded(task,MAX_STORED_TASK_BYTES);await io(()=>store.write({id:task.id,serialized}));return task;
  };
  const addTelemetry=async(task,revision,{context,type,feedback,key,draftStatus}={})=>{
    // Gate the entire branch before a projection callback can inspect its data.
    if(privateRevision(task,revision))return{added:false};
    if(!context||typeof telemetry?.createEvent!=='function')return{added:false};
    try{
      const event=await telemetry.createEvent({context,type,task:{id:task.id},revision,feedback,key,draftStatus});
      if(event==null)return{added:false};validateTelemetryEvent(event);
      if(event.epochId!==context.epochId)throw new Error('Telemetry epoch mismatch');
      const old=task.telemetryEvents??[];if(old.some(item=>item.eventId===event.eventId))return{added:false};
      const events=[...old,copy(event)];if(events.length>1000||Buffer.byteLength(JSON.stringify(event),'utf8')>16_000)throw new Error('Telemetry queue capacity');
      bounded({telemetryEvents:events},MAX_TELEMETRY_BYTES);task.telemetryEvents=events;return{added:true};
    }catch{return{added:false,telemetryWarning:TELEMETRY_WARNING};}
  };
  const committed=result=>{if(result.added)try{const pending=telemetry?.committed?.();pending?.catch?.(()=>{});}catch{return{...result,telemetryWarning:TELEMETRY_WARNING};}return result;};
  const active=async()=>{const p=await pointer();if(!p.activeTaskId)return null;const task=await read(p.activeTaskId),revision=task.revisions.find(item=>item.id===p.activeRevisionId);if(!revision)fail('WORKFLOW_NOT_FOUND');return{task,revision};};
  const context=async({taskId,revisionId}={})=>{
    const current=await active();
    if(taskId!==undefined||revisionId!==undefined){if(typeof taskId!=='string'||typeof revisionId!=='string'||current?.task.id!==taskId||current?.revision.id!==revisionId)fail('STALE_WORKFLOW');}
    return current;
  };
  const list=async({offset=0,limit=100}={})=>{
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail();
    const rows=await io(()=>store.list());if(!Array.isArray(rows))fail('HISTORY_STORAGE_FAILED');const tasks=[];
    for(const row of rows)try{if(typeof row?.serialized!=='string')throw Error();const task=validateTask(JSON.parse(row.serialized));if(task.id!==row.id)throw Error();tasks.push(task);}catch{fail('HISTORY_STORAGE_FAILED');}
    tasks.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));
    return{history:tasks.slice(offset,offset+limit).map(summary),historyTotal:tasks.length};
  };
  const view=async(selected)=>{const selectedContext=selected??await active();return{workflow:selectedContext?projectWorkflow(selectedContext.task,selectedContext.revision.id):null,...await list()};};
  const append=async(workflow,base=null,extra={})=>{
    const inherited=base?.task.revisions[0]?.workflow.opportunityOrigin;
    if(base){
      if(inherited){if(workflow.opportunityOrigin&&!sameOpportunityOrigin(inherited,workflow.opportunityOrigin))fail('INVALID_INPUT');workflow={...workflow,opportunityOrigin:copy(inherited),localOnly:true};}
      else if(workflow.opportunityOrigin!==undefined)fail('INVALID_INPUT');
    }else if(workflow.opportunityOrigin!==undefined&&!isIssuedOpportunityOrigin(workflow.opportunityOrigin))fail('INVALID_INPUT');
    const cleaned=validateWorkflow(workflow),now=clock().toISOString();
    if(base&&privateRevision(base.task,base.revision))cleaned.localOnly=true;
    const task=base?copy(base.task):{format:1,id:cleaned.opportunityOrigin?opportunityTaskId(cleaned.opportunityOrigin):randomUUID(),originalRequest:cleaned.request,originalConstraints:[...cleaned.intent.constraints],createdAt:now,updatedAt:now,revisions:[],feedback:[],handoffs:[]};
    if(!base&&cleaned.opportunityOrigin&&await io(()=>store.read(task.id)))fail('OPPORTUNITY_PENDING');
    if(cleaned.localOnly||cleaned.intent.constraints.length>MAX_MODEL_CONSTRAINTS)task.format=2;
    if(cleaned.request!==task.originalRequest||task.originalConstraints.some(item=>!cleaned.intent.constraints.includes(item)))fail();
    const revision={id:randomUUID(),number:task.revisions.length+1,createdAt:now,parentRevisionId:base?.revision.id??null,workflow:cleaned,...(extra.feedbackText?{feedbackText:extra.feedbackText}:{})};
    if(extra.feedbackText&&base)task.feedback.push({id:randomUUID(),taskId:task.id,revisionId:base.revision.id,createdAt:now,type:'refinement',outcome:null,note:extra.feedbackText,stage:'refine',pluginIds:[...(base.revision.workflow.plan?.pluginIds??[])]});
    task.revisions.push(revision);task.updatedAt=now;
    const feedback=extra.feedbackText?task.feedback.at(-1):undefined;
    const eventRevision=extra.feedbackText&&base?{...revision,workflow:{...revision.workflow,candidates:base.revision.workflow.candidates,plan:base.revision.workflow.plan}}:revision;
    const report=cleaned.stage==='plan'||extra.feedbackText?await addTelemetry(task,eventRevision,{context:extra.telemetryContext,type:extra.feedbackText?'refinement_submitted':'plan_generated',feedback,key:revision.id}):{added:false};
    await write(task);const notification=committed(report);await point(task.id,revision.id);return{task,revision,...(notification.telemetryWarning?{telemetryWarning:notification.telemetryWarning}:{})};
  };
  const importBackup=async({workflow,origin='本机 JSON 备份',type='backup'}={})=>{
    bounded(workflow,MAX_IMPORT_BYTES);const label=text(origin,200,'INVALID_BACKUP');let task,sourceFormat,sourceHash;
    if(record(workflow)&&workflow.format===2){
      if(workflow.creation!==undefined||workflow.localOnly!==undefined||workflow.opportunityOrigin!==undefined)fail('INVALID_BACKUP');
      const cleaned=validateWorkflow(workflow);sourceHash=hash(cleaned);sourceFormat='legacy-format-2';const now=clock().toISOString();
      const sourceTime=stamp(cleaned.discovery?.searchedAt)?cleaned.discovery.searchedAt:stamp(cleaned.catalogUpdatedAt)?cleaned.catalogUpdatedAt:now;
      task={format:cleaned.intent.constraints.length>MAX_MODEL_CONSTRAINTS?2:1,id:'restored-'+sourceHash.slice(0,40),originalRequest:cleaned.request,originalConstraints:[...cleaned.intent.constraints],createdAt:sourceTime,updatedAt:sourceTime,revisions:[{id:'restored-revision-'+sourceHash.slice(0,32),number:1,createdAt:sourceTime,parentRevisionId:null,workflow:cleaned}],feedback:[],handoffs:[]};
    }else if(record(workflow)&&workflow.format==='plugin-finder-task'&&[1,2].includes(workflow.version)){task=validateTask(record(workflow.task)?withoutTelemetry(workflow.task):workflow.task);if(workflow.version!==task.format)fail('INVALID_BACKUP');sourceHash=contentHash(task);sourceFormat='plugin-finder-task';}
    else fail('INVALID_BACKUP');
    const existing=await io(()=>store.read(task.id));
    if(existing){const old=await read(task.id);if(!(sourceFormat==='legacy-format-2'&&old.origin?.sourceHash===sourceHash)&&contentHash(old)!==contentHash(task))fail('INVALID_BACKUP');return{imported:true,duplicate:true,importedTaskId:task.id};}
    // A backup is data, never a locally issued authority for late writes.
    task.revisions=task.revisions.map(revision=>revision.workflow.opportunityOrigin?{...revision,workflow:{...revision.workflow,opportunityOrigin:{...revision.workflow.opportunityOrigin,provenance:'imported'}}}:revision);
    if(task.creatorAttempts)task.creatorAttempts=task.creatorAttempts.map(attempt=>({...attempt,provenance:'imported'}));
    if(task.executions)task.executions=task.executions.map(attempt=>({...attempt,provenance:'imported',contentHash:hash(task.revisions.find(revision=>revision.id===attempt.revisionId).workflow)}));
    task.origin={type,label,importedAt:clock().toISOString(),sourceHash,sourceFormat};await write(task);return{imported:true,duplicate:false,importedTaskId:task.id};
  };
  const executionContext=async(input={})=>{
    if(typeof input.taskId!=='string'||typeof input.revisionId!=='string'||typeof input.attemptId!=='string')fail('STALE_WORKFLOW');
    const task=await read(input.taskId),attempt=task.executions?.find(item=>item.attemptId===input.attemptId);
    if(!attempt||attempt.taskId!==input.taskId||attempt.revisionId!==input.revisionId||attempt.requestId!==input.requestId||attempt.workspaceId!==input.workspaceId||attempt.kind!==input.kind||attempt.provenance!=='local')executionConflict();
    const revision=task.revisions.find(item=>item.id===attempt.revisionId);
    if(!revision||attempt.contentHash!==hash(revision.workflow)||!attempt.sessionId||input.sessionId!==attempt.sessionId)executionConflict();
    return{task,revision,attempt};
  };
  const claimCreatedExecution=async(input={},nextStatus)=>{
    const {task,revision,attempt}=await executionContext(input);
    // The service queue serializes the first send against a stop before send.
    // Neither operation can rewrite an already submitted or unknown request.
    if(attempt.status!=='created')return{task,revision,claim:'existing',attempt:copy(attempt)};
    if(nextStatus==='submitting'){requirePrepared(attempt,revision);attempt.prompt=text(preparedPrompt(attempt),MAX_EXECUTION_PROMPT);}
    attempt.status=nextStatus;attempt.updatedAt=clock().toISOString();task.updatedAt=attempt.updatedAt;
    await write(task);return{task,revision,claim:'acquired',attempt:copy(attempt)};
  };
  return{read,pointer,point,active,context,list,view,append,importBackup,executionContext,
    async recordPreparation(input={},preparation){
      const {task,revision,attempt}=await executionContext(input);
      if(attempt.status!=='created')executionConflict();
      attempt.preparation=validatePreparation({...preparation,updatedAt:clock().toISOString()},revision.workflow,attempt.kind,'EXECUTION_PLUGINS_NOT_READY');
      attempt.updatedAt=clock().toISOString();task.updatedAt=attempt.updatedAt;await write(task);
      return{task,revision,attempt:copy(attempt)};
    },
    async pendingTelemetry(epochId){
      if(typeof epochId!=='string'||!epochId)return[];
      const rows=await io(()=>store.list());if(!Array.isArray(rows))fail('HISTORY_STORAGE_FAILED');const result=[];
      for(const row of rows){const task=await read(row.id);for(const event of task.telemetryEvents??[])if(event.epochId===epochId)result.push(copy(event));}
      return result.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.eventId.localeCompare(b.eventId));
    },
    async recordTelemetry(base,options={}){
      if(!base)fail('WORKFLOW_NOT_FOUND');const task=copy(base.task),revision=task.revisions.find(item=>item.id===base.revision.id);
      const report=await addTelemetry(task,options.revision??revision,options);
      if(report.added)await write(task);
      const notification=committed(report);return{task,revision,...(notification.telemetryWarning?{telemetryWarning:notification.telemetryWarning}:{})};
    },
    async open({taskId,revisionId}={}){const task=await read(id(taskId)),revision=revisionId?task.revisions.find(item=>item.id===revisionId):task.revisions.at(-1);if(!revision)fail('WORKFLOW_NOT_FOUND');await point(task.id,revision.id);return{task,revision};},
    async reset(){await point(null,null);},
    async feedback(base,{outcome,note='',stage='result',pluginIds}={},telemetryContext=null){
      if(!base||!base.revision.workflow.plan||!['complete','partial','blocked'].includes(outcome))fail();
      const selected=[...base.revision.workflow.plan.pluginIds];if(pluginIds!==undefined&&(!Array.isArray(pluginIds)||pluginIds.some(item=>!selected.includes(item))))fail();
      const now=clock().toISOString(),task=copy(base.task),feedback={id:randomUUID(),taskId:task.id,revisionId:base.revision.id,createdAt:now,type:'result',outcome,pluginIds:selected,note:text(note,1500,'INVALID_INPUT',true),stage:text(stage,80)};task.feedback.push(feedback);task.updatedAt=now;
      const revision=task.revisions.find(item=>item.id===base.revision.id),report=await addTelemetry(task,revision,{context:telemetryContext,type:'feedback_submitted',feedback,key:feedback.id});await write(task);const notification=committed(report);return{task,revision,...(notification.telemetryWarning?{telemetryWarning:notification.telemetryWarning}:{})};
    },
    async handoff(base,{workspaceId,sessionId,status}={},telemetryContext=null){
      if(!base?.revision.workflow.plan||!['applied','preserved'].includes(status))fail();
      text(workspaceId,200);text(sessionId,200);const task=copy(base.task),now=clock().toISOString(),old=task.handoffs.filter(item=>item.revisionId===base.revision.id).at(-1);
      let report={added:false};const revision=task.revisions.find(item=>item.id===base.revision.id);
      if(!old||old.workspaceId!==workspaceId||old.sessionId!==sessionId||old.status!==status){task.handoffs.push({taskId:task.id,revisionId:base.revision.id,workspaceId,sessionId,status,createdAt:now});task.updatedAt=now;report=await addTelemetry(task,revision,{context:telemetryContext,type:'handoff_prepared',draftStatus:status,key:revision.id+':'+status});await write(task);}
      const notification=committed(report);return{task,revision,...(notification.telemetryWarning?{telemetryWarning:notification.telemetryWarning}:{})};
    },
    async claimCreator(base,{contentHash,workspaceId}={}){
      requireOpportunityWorkspace(base?.revision.workflow,workspaceId);
      const creation=base?.revision.workflow.creation;
      if(!creation||creation.status!=='ready'||creation.supply.status!=='current')fail('CREATION_NOT_READY');
      if(typeof contentHash!=='string'||contentHash!==creationContentHash(creation))fail('STALE_WORKFLOW');
      workspaceId=text(workspaceId,200);const task=copy(base.task);
      const existing=(task.creatorAttempts??[]).find(attempt=>attempt.purpose==='creator'&&attempt.taskId===task.id&&attempt.revisionId===base.revision.id&&attempt.contentHash===contentHash&&attempt.workspaceId===workspaceId);
      if(existing)return{task,revision:base.revision,claim:'existing',attempt:copy(existing)};
      if((task.creatorAttempts??[]).length>=1000)fail('HISTORY_CAPACITY');
      const now=clock().toISOString(),attempt={attemptId:randomUUID(),purpose:'creator',taskId:task.id,revisionId:base.revision.id,contentHash,workspaceId,status:'creating',createdAt:now,updatedAt:now,provenance:'local'};
      task.creatorAttempts=[...(task.creatorAttempts??[]),attempt];task.updatedAt=now;await write(task);
      return{task,revision:task.revisions.find(item=>item.id===base.revision.id),claim:'acquired',attempt:copy(attempt)};
    },
    async recordCreator(input={}){
      // Local late results are routed by the immutable claim, not the UI pointer.
      if(typeof input.taskId!=='string'||typeof input.revisionId!=='string'||typeof input.attemptId!=='string')fail('STALE_WORKFLOW');
      const task=await read(input.taskId),attempt=task.creatorAttempts?.find(item=>item.attemptId===input.attemptId);
      if(!attempt)fail('CREATOR_ATTEMPT_CONFLICT');
      if(attempt.taskId!==input.taskId||attempt.revisionId!==input.revisionId||attempt.contentHash!==input.contentHash||attempt.workspaceId!==input.workspaceId)fail('CREATOR_ATTEMPT_CONFLICT');
      if(attempt.provenance!=='local')await context(input);
      if(!CREATOR_STATUSES.includes(input.status))fail();
      const sessionId=input.sessionId===undefined?attempt.sessionId:text(input.sessionId,200);
      if(attempt.sessionId&&sessionId!==attempt.sessionId)fail('CREATOR_ATTEMPT_CONFLICT');
      if(['created','applied','preserved','attach-failed','preset-mismatch'].includes(input.status)&&!sessionId)fail();
      const revision=task.revisions.find(item=>item.id===attempt.revisionId);
      if(!revision?.workflow.creation||creationContentHash(revision.workflow.creation)!==attempt.contentHash)fail('CREATOR_ATTEMPT_CONFLICT');
      // Duplicate/delayed acknowledgements must never regress a settled draft.
      if(['applied','preserved','preset-mismatch','attach-failed'].includes(attempt.status)&&input.status!==attempt.status)return{task,revision,attempt:copy(attempt)};
      if(input.status==='creating'&&attempt.status!=='creating')fail('CREATOR_ATTEMPT_CONFLICT');
      attempt.status=input.status;attempt.updatedAt=clock().toISOString();if(sessionId)attempt.sessionId=sessionId;
      if(input.message!==undefined)attempt.message=text(input.message,2000,'INVALID_INPUT',true);
      task.updatedAt=attempt.updatedAt;await write(task);return{task,revision,attempt:copy(attempt)};
    },
    async claimExecution(base,{kind,workspaceId,prompt}={}){
      requireOpportunityWorkspace(base?.revision.workflow,workspaceId);
      executionReady(base?.revision.workflow,kind);workspaceId=text(workspaceId,200);
      const task=copy(base.task),revision=task.revisions.find(item=>item.id===base.revision.id);
      const existing=(task.executions??[]).find(attempt=>attempt.revisionId===revision.id&&attempt.kind===kind&&attempt.workspaceId===workspaceId);
      if(existing)return{task,revision,claim:'existing',attempt:copy(existing)};
      if((task.executions??[]).length>=1000)fail('HISTORY_CAPACITY');
      const now=clock().toISOString(),attempt={attemptId:randomUUID(),requestId:randomUUID(),taskId:task.id,revisionId:revision.id,kind,workspaceId,contentHash:hash(revision.workflow),prompt:text(prompt,MAX_EXECUTION_PROMPT),status:'claimed',sessionId:null,createdAt:now,updatedAt:now,provenance:'local'};
      task.format=2;task.executions=[...(task.executions??[]),attempt];task.updatedAt=now;await write(task);
      return{task,revision,claim:'acquired',attempt:copy(attempt)};
    },
    claimExecutionSubmit:input=>claimCreatedExecution(input,'submitting'),
    claimExecutionCancel:input=>claimCreatedExecution(input,'cancelled'),
    async recordExecution(input={}){
      if(typeof input.taskId!=='string'||typeof input.revisionId!=='string'||typeof input.attemptId!=='string')fail('STALE_WORKFLOW');
      const task=await read(input.taskId),attempt=task.executions?.find(item=>item.attemptId===input.attemptId);
      if(!attempt||attempt.taskId!==input.taskId||attempt.revisionId!==input.revisionId||attempt.requestId!==input.requestId||attempt.workspaceId!==input.workspaceId||attempt.kind!==input.kind||attempt.provenance!=='local')executionConflict();
      if(!EXECUTION_STATUSES.includes(input.status)||input.status==='claimed')fail();
      const revision=task.revisions.find(item=>item.id===attempt.revisionId);
      if(!revision||attempt.contentHash!==hash(revision.workflow))executionConflict();
      const sessionId=input.sessionId===undefined?attempt.sessionId:input.sessionId===null?null:text(input.sessionId,200);
      if(attempt.sessionId&&sessionId!==attempt.sessionId)executionConflict();
      if(!attempt.sessionId&&sessionId&&!(input.status==='created'&&['claimed','failed','cancelled'].includes(attempt.status)))executionConflict();
      if(['created','submitting','submitted'].includes(input.status)&&!sessionId)fail();
      const message=input.message===undefined?attempt.message:text(input.message,2000,'INVALID_INPUT',true);
      // A different tab may stop the attempt while create is in flight. Retain
      // the late exact session once, without reopening submission authority.
      if(['failed','cancelled'].includes(attempt.status)&&!attempt.sessionId&&sessionId){attempt.sessionId=sessionId;attempt.updatedAt=clock().toISOString();task.updatedAt=attempt.updatedAt;await write(task);return{task,revision,attempt:copy(attempt)};}
      // Delayed acknowledgements never rewind or reopen a finished attempt.
      if(['failed','cancelled'].includes(attempt.status)||EXECUTION_ORDER[input.status]<EXECUTION_ORDER[attempt.status])return{task,revision,attempt:copy(attempt)};
      if(EXECUTION_ORDER[input.status]>EXECUTION_ORDER[attempt.status]+1)executionConflict();
      if(input.status==='submitting'&&attempt.status==='created')requirePrepared(attempt,revision);
      if(input.status===attempt.status&&sessionId===attempt.sessionId&&message===attempt.message)return{task,revision,attempt:copy(attempt)};
      attempt.status=input.status;attempt.sessionId=sessionId;attempt.updatedAt=clock().toISOString();if(message!==undefined)attempt.message=message;
      task.updatedAt=attempt.updatedAt;await write(task);return{task,revision,attempt:copy(attempt)};
    },
    async exportTask({taskId}={}){const task=withoutTelemetry(await read(id(taskId)));return{format:'plugin-finder-task',version:task.format,task};},
  };
}
