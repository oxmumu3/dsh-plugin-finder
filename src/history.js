import {createHash,randomUUID} from 'node:crypto';
import {fail,FinderError,parseIntent,parsePlan,record,text} from './contracts.js';
import {publicSourceData,publicSourceText} from './provenance.js';

export const MAX_TASK_BYTES=8_000_000;
export const MAX_IMPORT_BYTES=8_100_000;
export const ORIGIN_RESERVE_BYTES=1024;
const copy=value=>structuredClone(value);
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=value=>text(value,200,'INVALID_BACKUP');
function bounded(value,max=MAX_TASK_BYTES){let serialized;try{serialized=JSON.stringify(value);}catch{fail('INVALID_BACKUP');}if(Buffer.byteLength(serialized,'utf8')>max)fail('HISTORY_CAPACITY');return serialized;}
function array(value,max=10000){if(!Array.isArray(value)||value.length>max)fail('INVALID_BACKUP');return value;}

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
  for(const key of ['model','eligibility','discovery','catalogUpdatedAt','analysisWarning'])if(value[key]!==undefined)workflow[key]=publicSourceData(copy(value[key]),key);
  if(value.warnings!==undefined){workflow.warnings=array(value.warnings,100).map(item=>publicSourceText(text(item,4000,'INVALID_BACKUP')));}
  if(value.stage==='plan'){
    if(!record(value.plan)||!Array.isArray(value.plan.limits))fail('INVALID_BACKUP');
    let parsed;try{parsed=parsePlan({kind:value.plan.kind,title:value.plan.title,rationale:value.plan.rationale,pluginIds:value.plan.pluginIds,steps:value.plan.steps,limits:value.plan.limits.slice(0,8)},candidates,intent);}catch{fail('INVALID_BACKUP');}
    workflow.plan={...parsed,limits:array(value.plan.limits,100).map(item=>publicSourceText(text(item,4000,'INVALID_BACKUP'))),nextPrompt:publicSourceText(typeof value.plan.nextPrompt==='string'?value.plan.nextPrompt:'')};
  }
  return workflow;
}

function validateTask(value){
  bounded(value);
  if(!record(value)||value.format!==1||!stamp(value.createdAt)||!stamp(value.updatedAt))fail('INVALID_BACKUP');
  const task={format:1,id:id(value.id),originalRequest:text(value.originalRequest,6000,'INVALID_BACKUP'),originalConstraints:array(value.originalConstraints??[],6).map(item=>text(item,350,'INVALID_BACKUP')),createdAt:value.createdAt,updatedAt:value.updatedAt,revisions:[],feedback:[],handoffs:[]};
  const revisionIds=new Set();
  for(const [index,revision] of array(value.revisions).entries()){
    if(!record(revision)||revision.number!==index+1||!stamp(revision.createdAt)||revisionIds.has(revision.id))fail('INVALID_BACKUP');
    const parent=revision.parentRevisionId??null;if(parent!==null&&!revisionIds.has(parent))fail('INVALID_BACKUP');
    const cleaned={id:id(revision.id),number:revision.number,createdAt:revision.createdAt,parentRevisionId:parent,workflow:validateWorkflow(revision.workflow)};
    if(cleaned.workflow.request!==task.originalRequest)fail('INVALID_BACKUP');
    if(task.originalConstraints.some(constraint=>!cleaned.workflow.intent.constraints.includes(constraint)))fail('INVALID_BACKUP');
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
  if(value.origin!==undefined){const origin=value.origin;if(!record(origin)||!['backup','legacy-current'].includes(origin.type)||!stamp(origin.importedAt)||origin.importedAt.length>40||typeof origin.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(origin.sourceHash)||!['legacy-format-2','plugin-finder-task'].includes(origin.sourceFormat))fail('INVALID_BACKUP');task.origin={type:origin.type,label:text(origin.label,200,'INVALID_BACKUP'),importedAt:origin.importedAt,sourceHash:origin.sourceHash,sourceFormat:origin.sourceFormat};}
  return task;
}
const contentHash=task=>{const {origin,...content}=task;return hash(content);};

export function projectWorkflow(task,revisionId){
  const revision=revisionId?task.revisions.find(item=>item.id===revisionId):task.revisions.at(-1);if(!revision)fail('WORKFLOW_NOT_FOUND');
  return{...copy(revision.workflow),taskId:task.id,revisionId:revision.id,revisionNumber:revision.number,createdAt:task.createdAt,updatedAt:task.updatedAt,revisionCreatedAt:revision.createdAt,
    revisions:task.revisions.map(item=>({revisionId:item.id,revisionNumber:item.number,stage:item.workflow.stage,title:item.workflow.plan?.title??item.workflow.intent.goal,createdAt:item.createdAt,parentRevisionId:item.parentRevisionId,feedbackCount:task.feedback.filter(entry=>entry.revisionId===item.id).length})),
    feedback:copy(task.feedback.filter(entry=>entry.revisionId===revision.id)),handoff:copy(task.handoffs.filter(entry=>entry.revisionId===revision.id).at(-1)??null),...(task.origin?{origin:copy(task.origin)}:{})};
}
function summary(task){const latest=task.revisions.at(-1);return{taskId:task.id,title:latest.workflow.plan?.title??latest.workflow.intent.goal,request:task.originalRequest,createdAt:task.createdAt,updatedAt:task.updatedAt,revisionCount:task.revisions.length,latestRevisionId:latest.id,latestRevisionNumber:latest.number,stage:latest.workflow.stage,lastFeedback:copy(task.feedback.filter(entry=>entry.type==='result').at(-1)??null),...(task.origin?{origin:copy(task.origin)}:{})};}

/** Storage adapter owns raw rows; immutable snapshots are serialized per task. */
export function createHistoryRepository({store,clock=()=>new Date()}={}){
  if(!store?.read||!store?.write||!store?.list||!store?.readPointer||!store?.writePointer)throw new TypeError('historyStore adapter is incomplete');
  const io=async fn=>{try{return await fn();}catch(error){if(error instanceof FinderError)throw error;fail('HISTORY_STORAGE_FAILED');}};
  const read=async taskId=>{const row=await io(()=>store.read(taskId));if(!row)fail('WORKFLOW_NOT_FOUND');try{if(row.id!==taskId||typeof row.serialized!=='string')throw Error();const task=validateTask(JSON.parse(row.serialized));if(task.id!==taskId)throw Error();return task;}catch(error){if(error?.code==='HISTORY_CAPACITY')throw error;fail('INVALID_BACKUP');}};
  const pointer=async()=>{const value=await io(()=>store.readPointer());if(value==null)return{activeTaskId:null,activeRevisionId:null};if(!record(value)||!(value.activeTaskId===null&&value.activeRevisionId===null||typeof value.activeTaskId==='string'&&typeof value.activeRevisionId==='string'))fail('HISTORY_STORAGE_FAILED');return{activeTaskId:value.activeTaskId,activeRevisionId:value.activeRevisionId};};
  const point=async(taskId,revisionId)=>io(()=>store.writePointer({activeTaskId:taskId??null,activeRevisionId:revisionId??null}));
  const write=async task=>{
    // A future restore may add a UTF-8 label. Reserve its bounded envelope now,
    // rather than making a successfully exported task impossible to reimport.
    const {origin,...content}=task;bounded(content,MAX_TASK_BYTES-ORIGIN_RESERVE_BYTES);
    if(origin&&Buffer.byteLength(JSON.stringify({origin}),'utf8')>ORIGIN_RESERVE_BYTES)fail('HISTORY_CAPACITY');
    const serialized=bounded(task);await io(()=>store.write({id:task.id,serialized}));return task;
  };
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
    const cleaned=validateWorkflow(workflow),now=clock().toISOString();
    const task=base?copy(base.task):{format:1,id:randomUUID(),originalRequest:cleaned.request,originalConstraints:[...cleaned.intent.constraints],createdAt:now,updatedAt:now,revisions:[],feedback:[],handoffs:[]};
    if(cleaned.request!==task.originalRequest||task.originalConstraints.some(item=>!cleaned.intent.constraints.includes(item)))fail();
    const revision={id:randomUUID(),number:task.revisions.length+1,createdAt:now,parentRevisionId:base?.revision.id??null,workflow:cleaned,...(extra.feedbackText?{feedbackText:extra.feedbackText}:{})};
    if(extra.feedbackText&&base)task.feedback.push({id:randomUUID(),taskId:task.id,revisionId:base.revision.id,createdAt:now,type:'refinement',outcome:null,note:extra.feedbackText,stage:'refine',pluginIds:[...(base.revision.workflow.plan?.pluginIds??[])]});
    task.revisions.push(revision);task.updatedAt=now;await write(task);await point(task.id,revision.id);return{task,revision};
  };
  const importBackup=async({workflow,origin='本机 JSON 备份',type='backup'}={})=>{
    bounded(workflow,MAX_IMPORT_BYTES);const label=text(origin,200,'INVALID_BACKUP');let task,sourceFormat,sourceHash;
    if(record(workflow)&&workflow.format===2){
      const cleaned=validateWorkflow(workflow);sourceHash=hash(cleaned);sourceFormat='legacy-format-2';const now=clock().toISOString();
      const sourceTime=stamp(cleaned.discovery?.searchedAt)?cleaned.discovery.searchedAt:stamp(cleaned.catalogUpdatedAt)?cleaned.catalogUpdatedAt:now;
      task={format:1,id:'restored-'+sourceHash.slice(0,40),originalRequest:cleaned.request,originalConstraints:[...cleaned.intent.constraints],createdAt:sourceTime,updatedAt:sourceTime,revisions:[{id:'restored-revision-'+sourceHash.slice(0,32),number:1,createdAt:sourceTime,parentRevisionId:null,workflow:cleaned}],feedback:[],handoffs:[]};
    }else if(record(workflow)&&workflow.format==='plugin-finder-task'&&workflow.version===1){task=validateTask(workflow.task);sourceHash=contentHash(task);sourceFormat='plugin-finder-task';}
    else fail('INVALID_BACKUP');
    const existing=await io(()=>store.read(task.id));
    if(existing){const old=await read(task.id);if(!(sourceFormat==='legacy-format-2'&&old.origin?.sourceHash===sourceHash)&&contentHash(old)!==contentHash(task))fail('INVALID_BACKUP');return{imported:true,duplicate:true,importedTaskId:task.id};}
    task.origin={type,label,importedAt:clock().toISOString(),sourceHash,sourceFormat};await write(task);return{imported:true,duplicate:false,importedTaskId:task.id};
  };
  return{read,pointer,point,active,context,list,view,append,importBackup,
    async open({taskId,revisionId}={}){const task=await read(id(taskId)),revision=revisionId?task.revisions.find(item=>item.id===revisionId):task.revisions.at(-1);if(!revision)fail('WORKFLOW_NOT_FOUND');await point(task.id,revision.id);return{task,revision};},
    async reset(){await point(null,null);},
    async feedback(base,{outcome,note='',stage='result',pluginIds}={}){
      if(!base||!base.revision.workflow.plan||!['complete','partial','blocked'].includes(outcome))fail();
      const selected=[...base.revision.workflow.plan.pluginIds];if(pluginIds!==undefined&&(!Array.isArray(pluginIds)||pluginIds.some(item=>!selected.includes(item))))fail();
      const now=clock().toISOString(),task=copy(base.task);task.feedback.push({id:randomUUID(),taskId:task.id,revisionId:base.revision.id,createdAt:now,type:'result',outcome,pluginIds:selected,note:text(note,1500,'INVALID_INPUT',true),stage:text(stage,80)});task.updatedAt=now;await write(task);return{task,revision:task.revisions.find(item=>item.id===base.revision.id)};
    },
    async handoff(base,{workspaceId,sessionId,status}={}){
      if(!base?.revision.workflow.plan||!['applied','preserved'].includes(status))fail();
      text(workspaceId,200);text(sessionId,200);const task=copy(base.task),now=clock().toISOString(),old=task.handoffs.filter(item=>item.revisionId===base.revision.id).at(-1);
      if(!old||old.workspaceId!==workspaceId||old.sessionId!==sessionId||old.status!==status){task.handoffs.push({taskId:task.id,revisionId:base.revision.id,workspaceId,sessionId,status,createdAt:now});task.updatedAt=now;await write(task);}
      return{task,revision:task.revisions.find(item=>item.id===base.revision.id)};
    },
    async exportTask({taskId}={}){return{format:'plugin-finder-task',version:1,task:await read(id(taskId))};},
  };
}
