import {createHash,randomUUID} from 'node:crypto';
import {lstat,realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {FinderError} from './contracts.js';
import {validatePreparation} from './execution-preparation.js';

const MAX_BYTES=8_000_000;
const queuesByStore=new WeakMap();
const messages={
  AGENT_REQUEST_UNAVAILABLE:'这条能力请求不可用，或不属于当前会话和工作区。',
  AGENT_REQUEST_CONFLICT:'同一个调用标识已用于不同需求，原请求保持不变。',
  AGENT_REQUEST_LIMIT:'目标、验收、约束和已有能力合计过长，请缩短为本次必要子任务；没有截断原限制。',
  AGENT_INVALID_INPUT:'能力请求格式不完整，请提供本次目标和可检查的验收条件。',
  AGENT_CREATION_ANSWERS_INVALID:'创建回答不符合已返回的问题。answers 每次最多3项，只能使用原请求 creation.questions 中已返回的 id，不能重复或发明 id；每个回答最多2000字。首次调用只传 requestId。请先用原 requestId 调用 finder_status 回读问题，再在原请求补答；不要重新 finder_lookup 或重述目标。',
  AGENT_STORAGE_FAILED:'能力请求未能可靠保存，已停止后续动作；原方案与草稿保持不变。',
  AGENT_AUTHORIZATION_REQUIRED:'当前操作尚未获得所需授权，未开始安装。',
  AGENT_CREATION_REQUIRED:'当前尚无可直接使用的方案；请先核对具体供给缺口或创建范围。',
  AGENT_CREATION_NOT_READY:'建造方案或供给核对尚未完成，未启动创建。',
  AGENT_CREATION_CONFLICT:'创建记录与原请求或保留的子会话不一致，未覆盖原记录。',
  AGENT_CREATION_ARTIFACT_INVALID:'创建结果尚未提供可核对的插件产物，未开始安装。',
  AGENT_PREINSTALL_REVIEW_UNAVAILABLE:'未能核对原生成产物及其当前未安装状态，未启动修订；原请求、Creator 和源码仍保留。请回读原请求处理具体阻碍，不重搜或改装其他产物。',
  AGENT_INTERRUPTED:'上次请求结果尚未确认，已保留原记录，没有自动重复执行。',
};
/** Safe service failures contain fixed messages and no underlying storage or provider details. */
export class AgentFinderError extends Error{
  constructor(code,requestId){super(messages[code]??'能力请求尚未完成，请查看原请求状态。');this.name='AgentFinderError';this.code=code;if(code==='AGENT_CREATION_ANSWERS_INVALID'&&typeof requestId==='string'){this.requestId=requestId;this.nextTool={name:'finder_status',arguments:{requestId}};this.message+=' 原 requestId：'+JSON.stringify(requestId)+'。';}}
}
const fail=code=>{throw new AgentFinderError(code);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>structuredClone(value);
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const exact=(value,keys)=>{if(!object(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('AGENT_INVALID_INPUT');};
const text=(value,max,{empty=false}={})=>{if(typeof value!=='string'||value.length>max||!empty&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))fail('AGENT_INVALID_INPUT');return value.trim();};
const abort=signal=>{if(signal?.aborted)throw new FinderError('MODEL_ABORTED');};
const storageFailure=error=>['AGENT_STORAGE_FAILED','HISTORY_STORAGE_FAILED','WORKFLOW_STORAGE_FAILED'].includes(error?.code);
const scope=value=>{exact(value,['sessionId','workspaceId','directory']);const result={sessionId:text(value.sessionId,200),workspaceId:text(value.workspaceId,200),directory:text(value.directory,4000)};if(!isAbsolute(result.directory))fail('AGENT_INVALID_INPUT');return result;};
const sameScope=(a,b)=>a.sessionId===b.sessionId&&a.workspaceId===b.workspaceId&&a.directory===b.directory;
const requestIdentity=(sessionId,callId)=>'agent-finder-'+digest(sessionId+'\0'+callId).slice(0,40);
const requestId=input=>{exact(input,['requestId']);if(typeof input.requestId!=='string'||!/^agent-finder-[a-f0-9]{40}$/.test(input.requestId))fail('AGENT_REQUEST_UNAVAILABLE');return input.requestId;};
const knownSdkServices=new Set(['webServer','connection','tools','storageDomain','workingDirectory','workspaceRegistry','agents','sessions','subagents','llm','systemPrompt','sandboxPolicy','approval','typert','sessionQuery']);
const safeFailureHint=value=>object(value)&&Object.keys(value).every(key=>['kind','service'].includes(key))&&value.kind==='missing-injection'&&knownSdkServices.has(value.service)?{kind:value.kind,service:value.service}:undefined;
const safeRetirement=value=>object(value)&&value.status==='blocked'&&value.code==='PLUGIN_RETIREMENT_PERSISTENCE_UNAVAILABLE'?{status:'blocked',code:'PLUGIN_RETIREMENT_PERSISTENCE_UNAVAILABLE'}:undefined;
const safeError=error=>{
  const hint=safeFailureHint(error?.failureHint);
  if(error instanceof FinderError||error instanceof AgentFinderError)return{code:error.code,message:error.message,...(hint?{failureHint:hint}:{})};
  const known=['MODEL_TIMEOUT','MODEL_ABORTED','MODEL_REQUEST_FAILED','DISCOVERY_UNAVAILABLE','PLUGIN_INSTALL_PENDING','PLUGIN_INSTALL_FAILED','PLUGIN_INSTALL_APPROVAL_REQUIRED','PLUGIN_INSTALL_RESTART_REQUIRED','PLUGIN_INSTALL_CONFLICT','PLUGIN_INSTALL_NOT_ACTIVE'];
  const safe=new FinderError(known.includes(error?.code)?error.code:'MODEL_REQUEST_FAILED');return{code:safe.code,message:safe.message,...(hint?{failureHint:hint}:{})};
};
const repairCount=record=>record.repairAttempts?.length??0;
const revisionToken=(record,value)=>value?.revisionId+(repairCount(record)?':repair-'+repairCount(record):'');
const repairHint=record=>safeFailureHint(record.error?.failureHint)??record.preparation?.plugins?.map(row=>safeFailureHint(row.failureHint)).find(Boolean);
function repairable(record){
  if(record.status!=='blocked'||!['completed','failed'].includes(record.creator?.status)||record.preparation?.kind!=='generated'||repairCount(record)>=2)return false;
  const rows=record.preparation.plugins;
  if(!Array.isArray(rows)||rows.some(row=>row.status!=='failed'||row.active===true||['PLUGIN_INSTALL_APPROVAL_REQUIRED','PLUGIN_INSTALL_RESTART_REQUIRED','PLUGIN_INSTALL_PENDING','MODEL_ABORTED'].includes(row.code)||['restart-required','cancelled'].includes(row.application)))return false;
  const code=record.error?.code;
  return ['PLUGIN_INSTALL_FAILED','PLUGIN_INSTALL_INVALID','PLUGIN_INSTALL_CONFLICT','PLUGIN_INSTALL_NOT_ACTIVE','AGENT_CREATION_ARTIFACT_INVALID'].includes(code)&&(rows.length>0||['PLUGIN_INSTALL_INVALID','AGENT_CREATION_ARTIFACT_INVALID'].includes(code));
}
function preinstallReviewable(record,value){
  const creator=record.creator;
  return repairCount(record)<2&&creator?.status==='completed'&&record.preparation===undefined
    &&(record.status==='creation_completed'&&!record.error||record.status==='blocked'&&record.error?.code==='AGENT_AUTHORIZATION_REQUIRED')
    &&value?.creation?.status==='ready'&&value.creation.supply?.status==='current'&&reusedReady(record,value)
    &&creator.revisionId===value.revisionId&&creator.contentHash===value.creation.contentHash;
}
function validateArtifactReview(value,artifact,actor,expected){
  const unavailable=()=>fail('AGENT_PREINSTALL_REVIEW_UNAVAILABLE'),input=artifact?.structured??artifact;
  if(!object(value)||Object.keys(value).some(key=>!['kind','packageName','version','directory','root','fingerprint','observedAt'].includes(key))||value.kind!=='observed_absent'||typeof input?.pluginDirectory!=='string')unavailable();
  const directory=resolve(actor.directory,input.pluginDirectory),local=relative(actor.directory,directory);
  if(!local||local==='..'||local.startsWith('..'+sep)||isAbsolute(local)||value.root!==actor.directory||value.directory!==directory)unavailable();
  if(typeof value.packageName!=='string'||value.packageName.length>214||!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value.packageName)||typeof value.version!=='string'||value.version.length>120||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value.version)||typeof value.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(value.fingerprint)||typeof value.observedAt!=='string'||value.observedAt.length>80||!Number.isFinite(Date.parse(value.observedAt)))unavailable();
  if(expected&&['directory','packageName','version','fingerprint'].some(key=>value[key]!==expected[key]))unavailable();
  return clone(value);
}
function automaticRepairFeedback(record){
  const hint=repairHint(record);if(!repairable(record)||!hint)return undefined;
  return '第'+(repairCount(record)+1)+'次有界修复：宿主报告服务注入或注册上下文问题（'+hint.service+'），这不能证明一定漏写声明，也不能保证追加注入数组即可修复。核对真实运行上下文与注册方式，优先使用已核对并实际验证过的公开接口；只读参考保留的上一版源码，在独立新目录和新插件标识中修复，保留原任务、验收、限制及旧产物和数据；不能把审批、重启或未知回执当作代码故障。';
}
async function repairReference(record,actor){
  try{
    const artifact=JSON.parse(record.creator.result),raw=artifact?.pluginDirectory;
    if(typeof raw!=='string'||!raw.trim()||raw.length>4000)return undefined;
    const directory=resolve(actor.directory,raw),rel=relative(actor.directory,directory);
    if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))return undefined;
    let cursor=actor.directory;
    for(const component of rel.split(sep)){cursor=resolve(cursor,component);const stat=await lstat(cursor);if(stat.isSymbolicLink()||!stat.isDirectory())return undefined;}
    const root=await realpath(actor.directory),actual=await realpath(directory),realRel=relative(root,actual);if(!realRel||realRel==='..'||realRel.startsWith('..'+sep)||isAbsolute(realRel))return undefined;
    const receipt=record.preparation.plugins.find(row=>typeof row.packageName==='string'&&/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(row.packageName)&&row.packageName.length<=214&&(!row.sourceDirectory||resolve(actor.directory,row.sourceDirectory)===directory));
    if(!receipt)return undefined;
    const hint=repairHint(record);
    return{previousPluginDirectory:directory,previousPackageName:receipt.packageName,...(typeof receipt.version==='string'&&/^[0-9A-Za-z.+-]{1,100}$/.test(receipt.version)?{previousVersion:receipt.version}:{}),...(receipt.sourceDirectory?{previousSourceDirectory:directory}:{}),...(/^[a-f0-9]{64}$/.test(receipt.fingerprint??'')?{previousFingerprint:receipt.fingerprint}:{}),...(hint?{failureHint:hint}:{})};
  }catch{return undefined;}
}
function parseInput(value){
  exact(value,['goal','acceptance','constraints','knownCapabilities']);
  const strings=(items,max,each)=>{if(items===undefined)return[];if(!Array.isArray(items)||items.length>max)fail('AGENT_INVALID_INPUT');return items.map(item=>text(item,each));};
  const input={goal:text(value.goal,6000),acceptance:text(value.acceptance,4000),constraints:strings(value.constraints,18,350),knownCapabilities:strings(value.knownCapabilities,24,350)};
  if(JSON.stringify(input).length>12000)fail('AGENT_REQUEST_LIMIT');
  const request=['目标：'+input.goal,'验收：'+input.acceptance,...input.constraints.map(item=>'约束：'+item),...(input.knownCapabilities.length?['已有能力（仅调用方报告，实际适配待核对）：',...input.knownCapabilities]:[])].join('\n');
  // The reused core and its released history format have a 6000-character request bound.
  if(request.length>6000)fail('AGENT_REQUEST_LIMIT');return{input,request};
}
function workflow(record){
  const pointer=record.history.pointer;if(!pointer.activeTaskId)return null;
  const row=record.history.rows[pointer.activeTaskId];if(!row)fail('AGENT_STORAGE_FAILED');
  try{const task=JSON.parse(row.serialized),revision=task.revisions.find(item=>item.id===pointer.activeRevisionId);if(!revision)throw Error();return{...revision.workflow,taskId:task.id,revisionId:revision.id};}catch{fail('AGENT_STORAGE_FAILED');}
}
function continuation(record,value){
  const controlled='不要自行查 profile、SDK 或 CLI 来代替受控安装，也不要让用户去插件管理器补装；所需依赖由 Finder 核对并准备，无法满足时明确返回缺口。';
  const tool=(name,nextAction,callerInstruction,args={})=>({nextAction,nextTool:{name,arguments:{requestId:record.id,...args}},callerInstruction});
  const feedback=automaticRepairFeedback(record);
  if(feedback)return tool('finder_create','repair_created_plugin','生成的插件存在已确认且有界的运行契约故障。下一步用本回执的 feedback 调用 finder_create，在原请求中修复；必须保留旧产物与原任务限制，未知状态、审批和重启不允许重派。'+controlled,{feedback});
  if(record.status==='ready')return{nextAction:'continue_original_task',callerInstruction:'继续原任务，使用当前主会话中真实可见的工具或能力完成实际工作，并按原目标与验收条件核对成果；准备回执不代表原任务已经完成。'+(value?.plan?.kind==='hybrid'?'现成能力与新补件已经分别准备：实际调用保留的复用插件及仅补缺口的新工具，不用新插件替换原有能力；完成原始完整目标并验证它们的衔接。':'')};
  if(record.status==='reuse_ready')return tool('finder_create','create_missing_capabilities','现成插件已按精确来源准备，保留其接口、版本和数据。下一步只为 plan.gaps 创建缺失部件，再把现成与新能力一起用于原任务，不重写整套插件。首次调用只传 nextTool.arguments 中的 requestId，拿到 creation.questions 后才按原 id 补 answers，不发明问题 id。'+controlled);
  if(record.status==='creation_retryable')return tool('finder_create','retry_creation_preparation','上次仅蓝图或供给核对中断，尚未预留或启动 Creator 子任务。原方案和现成能力回执已保留；下一步显式调用 finder_create 重试准备，已有有效蓝图可直接恢复。没有后台重放模型或真实创建；真实已预留但结果未知的 Creator 仍只能观察。'+controlled);
  if(record.status==='recheck_required')return tool('finder_activate','recheck_existing_capabilities','保留的现成能力需要重新核对当前运行状态。下一步调用 finder_activate，按原回执核对并在既有授权内恢复；不重复创建补件或把旧安装回执当本次运行事实。'+controlled);
  if(record.status==='creation_completed')return tool('finder_activate','activate_created_plugin','下一步调用 finder_activate，验证并准备本次创建的实际插件产物，然后在原任务中使用并验收；Creator 轮次完成不等于已安装或原任务已完成。'+controlled);
  if(record.status==='creation_ready')return tool('finder_create','start_creation','下一步调用 finder_create，接续当前有界蓝图和供给复核结果，由官方 Creator 建造；保留原目标、限制与已有回答，不重新开始一轮需求访谈。'+controlled);
  if(record.status==='creation_draft'&&value?.creation)return tool('finder_create','answer_creation_questions','根据原任务已给信息为 creation.questions 补充 answers，每次最多3项且 id 只能逐字使用已返回的问题 id，不发明 id，再用原 requestId 调用 finder_create；主 Agent 补答作为假设保留，不能冒称用户确认。可撤销的常规细节按最小范围补足；真实缺材料、权限或不可逆后果才请用户判断。'+controlled);
  if(['discovering','activating','creation_preparing','creation_starting','creating','creation_unknown','installation_unknown'].includes(record.status))return tool('finder_status',record.status==='installation_unknown'?'reconcile_installation':record.creator?'observe_creation':'review_request_status','下一步调用 finder_status，只回读原请求和已有回执；结果未知时，不重复安装、创建、发送或重派。停止等待不等于动作已撤销；状态未变化时不要连续轮询。'+controlled);
  if(record.status==='planned'){
    if(value?.plan?.kind==='gap')return tool('finder_create','review_supply_gap','下一步调用 finder_create；首次只传 nextTool.arguments 中的 requestId，拿到 creation.questions 后才按原 id 补 answers，不发明问题 id。它先准备有界蓝图并复核供给，再决定如何补足能力。当前已查范围未确认可靠满足，不能断言全市场没有方案；来源失败或适配未知也不是无供给证明。沿用原任务、限制及已有授权。'+controlled);
    if(['native','single','combo','hybrid'].includes(value?.plan?.kind))return tool('finder_activate','activate_plan','下一步调用 finder_activate，直接由 Finder 核对并准备该方案的现成能力；hybrid 保留现成插件，随后只为具体缺口调用 finder_create。准备就绪后用原主会话的真实能力继续原任务并按原验收核对。'+controlled);
  }
  return{nextAction:'review_request_status',callerInstruction:(record.status==='discovery_failed'?'本次发现未完成；连接或来源恢复后可重新提交 finder_lookup。发现失败与已提交安装或创建的未知回执不同，后者须观察原请求，不能当作全新动作重放。':'按 error 中的具体缺项处理，保留当前请求和历史；不能把安装失败、权限不足或来源不完整直接解释为市场无供给而转去创建。')+controlled};
}
function projection(record){
  const value=workflow(record),plan=value?.plan;
  const publicPlan=plan?Object.fromEntries(['kind','title','rationale','pluginIds','gaps','steps','limits'].filter(key=>plan[key]!==undefined).map(key=>[key,plan[key]])):undefined;
  const candidates=plan?(value.candidates??[]).filter(candidate=>plan.pluginIds.includes(candidate.id)).map(candidate=>Object.fromEntries(['id','name','title','summary','capabilities','requirements','install','evidence','compatibility','limitations'].filter(key=>candidate[key]!==undefined).map(key=>[key,candidate[key]]))):[];
  const creationData=value?.creation?Object.fromEntries(Object.entries(value.creation).filter(([key])=>key!=='draft')):undefined;
  const creation=creationData?{...creationData,...(record.creator?{childId:record.creator.childId,runStatus:record.creator.status,...(record.creator.promptHash?{promptHash:record.creator.promptHash}:{}),...(record.creator.result!==undefined?{result:record.creator.result}:{}),...(record.creator.stopReason?{stopReason:record.creator.stopReason}:{})}:{} )}:undefined;
  return clone({requestId:record.id,status:record.status,...(value?{revisionId:revisionToken(record,value)}:{}),...(value?.request?{originalRequest:value.request}:{}),...(publicPlan?{plan:publicPlan}:{}),...(value?.intent?{intent:value.intent}:{}),candidates,...(value?.discovery?{discovery:value.discovery}:{}),...continuation(record,value),...(record.existingPreparation?{existingPreparation:record.existingPreparation}:{}),...(record.preparation?{preparation:record.preparation}:{}),...(creation?{creation}:{}),repairCount:repairCount(record),...(record.repairAttempts?.at(-1)?.phase==='preinstall'?{repairPhase:'preinstall'}:{}),...(record.repairFeedback?{repairFeedback:record.repairFeedback}:{}),...(record.repairContext?{repairContext:record.repairContext}:{}),...(record.error?{error:record.error}:{})});
}
function reusedReady(record,value){
  if(value?.plan?.kind!=='hybrid')return true;
  const saved=record.existingPreparation;if(saved?.status!=='ready'||!value.plan.pluginIds.length)return false;
  try{validatePreparation({status:'ready',plugins:saved.plugins,updatedAt:saved.verifiedAt},value,'use','AGENT_CREATION_NOT_READY');return true;}catch{return false;}
}

/**
 * Persist per-caller requests without touching Finder's human-facing history or pointer.
 * createCore receives one request's private history adapter; installation adapters own source validation.
 */
export function createAgentFinderService({store,createCore,preparePlugins,prepareGeneratedPlugins,reviewGeneratedArtifact,readInstalled,clock=()=>new Date()}={}){
  if(!store||typeof store.read!=='function'||typeof store.write!=='function'||typeof createCore!=='function')throw new TypeError('Agent Finder adapters are incomplete');
  let queues=queuesByStore.get(store);if(!queues){queues=new Map();queuesByStore.set(store,queues);}
  const now=()=>clock().toISOString();
  const run=(id,fn)=>{
    const pending=(queues.get(id)??Promise.resolve()).catch(()=>undefined).then(fn);queues.set(id,pending);
    return pending.finally(()=>{if(queues.get(id)===pending)queues.delete(id);});
  };
  const load=async(id,caller,{missing=false}={})=>{
    let row;try{row=await store.read(id);}catch{fail('AGENT_STORAGE_FAILED');}
    let current;
    if(row!==undefined&&row!==null){
      try{
        if(row.id!==id||typeof row.serialized!=='string'||Buffer.byteLength(row.serialized)>MAX_BYTES)throw Error();
        current=JSON.parse(row.serialized);
        if(current.version!==1||current.id!==id||!object(current.history?.rows)||Object.keys(current.history.rows).length>1||!object(current.history.pointer)||typeof current.status!=='string'||typeof current.inputHash!=='string')throw Error();
        if(current.existingPreparation!==undefined&&(!object(current.existingPreparation)||current.existingPreparation.kind!=='existing'||!['pending','ready'].includes(current.existingPreparation.status)||!Array.isArray(current.existingPreparation.plugins)||current.existingPreparation.plugins.length>4||current.existingPreparation.plugins.some(row=>!object(row))))throw Error();
        scope(current.caller);
      }catch{fail('AGENT_STORAGE_FAILED');}
      if(!sameScope(current.caller,caller))fail('AGENT_REQUEST_UNAVAILABLE');
    }else if(!missing)fail('AGENT_REQUEST_UNAVAILABLE');
    const slot={get value(){return current;},async save(patch){
      const next={...(current??{}),...clone(patch),updatedAt:now()};
      let serialized;try{serialized=JSON.stringify(next);if(Buffer.byteLength(serialized)>MAX_BYTES)throw Error();await store.write({id,serialized});}catch{fail('AGENT_STORAGE_FAILED');}
      current=next;return next;
    }};
    return slot;
  };
  const historyAdapter=slot=>({
    read:async id=>clone(slot.value.history.rows[id]),
    write:async row=>{const rows=slot.value.history.rows;if(Object.keys(rows).length&&!rows[row.id])fail('AGENT_STORAGE_FAILED');await slot.save({history:{...slot.value.history,rows:{[row.id]:clone(row)}}});},
    list:async()=>clone(Object.values(slot.value.history.rows)),
    readPointer:async()=>clone(slot.value.history.pointer),
    writePointer:async pointer=>{await slot.save({history:{...slot.value.history,pointer:clone(pointer)}});},
  });
  const coreFor=slot=>createCore({historyStore:historyAdapter(slot)});
  const owned=(input,rawCaller,fn)=>{const id=requestId(input),caller=scope(rawCaller);return run(id,async()=>fn(await load(id,caller),caller));};
  const markError=async(slot,status,error)=>slot.save({status,error:safeError(error)});
  const reviewArtifact=async(creator,actor,{signal,expected}={})=>{
    if(typeof reviewGeneratedArtifact!=='function')fail('AGENT_PREINSTALL_REVIEW_UNAVAILABLE');
    let artifact;try{artifact=JSON.parse(creator.result);}catch{fail('AGENT_PREINSTALL_REVIEW_UNAVAILABLE');}
    abort(signal);let result;
    try{result=await reviewGeneratedArtifact({artifact,caller:clone(actor),...(expected?{expected:Object.fromEntries(['directory','packageName','version','fingerprint'].map(key=>[key,expected[key]]))}:{}),signal});}
    catch(error){abort(signal);if(error instanceof FinderError)throw error;fail('AGENT_PREINSTALL_REVIEW_UNAVAILABLE');}
    abort(signal);return validateArtifactReview(result,artifact,actor,expected);
  };
  const observeReuse=async value=>{
    if(value?.plan?.kind!=='hybrid')return true;
    if(typeof readInstalled!=='function')return false;
    const candidates=value.candidates.filter(candidate=>value.plan.pluginIds.includes(candidate.id));
    if(candidates.length!==value.plan.pluginIds.length)return false;
    try{const rows=await Promise.all(candidates.map(candidate=>readInstalled(clone(candidate))));return rows.every(row=>row?.installed===true&&row.enabled===true&&row.active===true&&row.conflict===false);}catch{return false;}
  };
  const preparedCreation=slot=>{const value=workflow(slot.value);if(slot.value.status!=='creation_ready'||!['gap','hybrid'].includes(value?.plan?.kind)||!value.creation||value.creation.status!=='ready'||value.creation.supply.status!=='current'||!reusedReady(slot.value,value))fail('AGENT_CREATION_NOT_READY');return value;};

  return{
    async find(raw,rawCaller,{callId,signal}={}){
      const caller=scope(rawCaller),{input,request}=parseInput(raw),call=text(callId,200),id=requestIdentity(caller.sessionId,call),inputHash=digest(input);
      return run(id,async()=>{
        abort(signal);const slot=await load(id,caller,{missing:true});
        if(slot.value){if(slot.value.inputHash!==inputHash)fail('AGENT_REQUEST_CONFLICT');if(slot.value.status==='discovering')await markError(slot,'discovery_failed',new AgentFinderError('AGENT_INTERRUPTED'));return projection(slot.value);}
        await slot.save({version:1,id,caller,input,inputHash,createdAt:now(),status:'discovering',history:{rows:{},pointer:{activeTaskId:null,activeRevisionId:null}}});
        try{
          abort(signal);const core=coreFor(slot),understood=await core.analyze({request,signal,localOnly:true});abort(signal);
          const value=workflow(slot.value);if(!value)fail('AGENT_STORAGE_FAILED');
          const constraints=[...new Set([...(understood.intent?.constraints??[]),...input.constraints])];if(constraints.length>24)fail('AGENT_REQUEST_LIMIT');
          await core.recommend({intent:{...understood.intent,constraints},taskId:value.taskId,revisionId:value.revisionId,signal});abort(signal);
          await slot.save({status:'planned',error:undefined});
        }catch(error){if(storageFailure(error))throw error;await markError(slot,'discovery_failed',error);}
        return projection(slot.value);
      });
    },
    async status(input,caller){
      const id=requestId(input),actor=scope(caller),record=(await load(id,actor)).value,value=workflow(record);
      if(record.status==='creation_preparing'&&!record.creator&&!queues.has(id))return projection({...record,status:reusedReady(record,value)?'creation_retryable':'recheck_required'});
      if(record.status==='ready'&&value?.plan?.kind==='hybrid'){
        const observed=await observeReuse(value),latest=(await load(id,actor)).value;
        // A slow read must not present an old ready snapshot over a newer installation or revision.
        if(digest(latest)!==digest(record))return projection(latest.status==='ready'?{...latest,status:'recheck_required'}:latest);
        if(!observed)return projection({...record,status:'recheck_required'});
      }
      return projection(record);
    },
    async activate(input,caller,{signal,authorize}={}){
      return owned(input,caller,async(slot,actor)=>{
        abort(signal);
        const value=workflow(slot.value);if(!value?.plan)fail('AGENT_REQUEST_UNAVAILABLE');
        const hybrid=value.plan.kind==='hybrid',generated=slot.value.creator?.status==='completed';let artifact;
        if(generated){
          if(typeof prepareGeneratedPlugins!=='function')fail('AGENT_CREATION_ARTIFACT_INVALID');
          try{artifact=JSON.parse(slot.value.creator.result);}catch{fail('AGENT_CREATION_ARTIFACT_INVALID');}
          if(!object(artifact))fail('AGENT_CREATION_ARTIFACT_INVALID');
        }else if(slot.value.creator)fail('AGENT_CREATION_NOT_READY');
        else if(value.plan.kind==='gap')fail('AGENT_CREATION_REQUIRED');
        if(!generated&&value.plan.kind==='native'){await slot.save({status:'ready',error:undefined,preparation:{kind:'existing',status:'ready',plugins:[]}});return projection(slot.value);}
        const candidates=value.candidates.filter(candidate=>value.plan.pluginIds.includes(candidate.id));
        if((!generated||hybrid)&&(candidates.length!==value.plan.pluginIds.length||typeof preparePlugins!=='function'))throw new FinderError('PLUGIN_INSTALL_UNAVAILABLE');
        const prior=slot.value.preparation;
        // Publication without a durable receipt may already have changed the Host; never replay it.
        if(['activating','installation_unknown'].includes(slot.value.status)&&prior&&!prior.plugins.length){if(slot.value.status==='activating')await markError(slot,'installation_unknown',new AgentFinderError('AGENT_INTERRUPTED'));return projection(slot.value);}
        const reuse=slot.value.existingPreparation;
        if(hybrid&&['activating','installation_unknown'].includes(slot.value.status)&&reuse?.status==='pending'&&!reuse.plugins.length){if(slot.value.status==='activating')await markError(slot,'installation_unknown',new AgentFinderError('AGENT_INTERRUPTED'));return projection(slot.value);}
        const info={requestId:slot.value.id,workspaceId:actor.workspaceId,profileImpact:'安装或启用插件会影响当前 Harness profile；不覆盖冲突版本。',plugins:generated&&!hybrid?[]:clone(candidates)};
        const permission=typeof authorize==='function'?await authorize(info):false;abort(signal);
        if(permission!==true&&permission?.approved!==true){await markError(slot,'blocked',new AgentFinderError('AGENT_AUTHORIZATION_REQUIRED'));fail('AGENT_AUTHORIZATION_REQUIRED');}
        const settleError=async(error,plugins)=>{
          if(storageFailure(error))throw error;
          const known=['PLUGIN_INSTALL_CONFLICT','PLUGIN_INSTALL_INVALID','PLUGIN_INSTALL_FAILED','PLUGIN_INSTALL_APPROVAL_REQUIRED','PLUGIN_INSTALL_RESTART_REQUIRED','PLUGIN_INSTALL_NOT_ACTIVE','PLUGIN_INSTALL_UNAVAILABLE','EXECUTION_PLUGINS_NOT_READY','AGENT_CREATION_ARTIFACT_INVALID'];
          const uncertain=!known.includes(error?.code)||plugins.some(plugin=>['installing','unknown'].includes(plugin.status));
          await markError(slot,uncertain?'installation_unknown':'blocked',error);
        };
        if(hybrid){
          // Reconcile the same exact receipts before creation, and again after creation/restart.
          // This stage stays independent from generated repair receipts and is never cleared by repair.
          const operationId=slot.value.id+':existing';
          await slot.save({status:'activating',error:undefined,existingPreparation:{kind:'existing',status:'pending',plugins:reuse?.plugins??[]}});
          const save=async plugins=>{if(!Array.isArray(plugins)||plugins.length>4)fail('AGENT_STORAGE_FAILED');await slot.save({existingPreparation:{kind:'existing',status:'pending',plugins:clone(plugins)}});};
          try{
            const result=await preparePlugins({operationId,candidates:clone(candidates),previous:clone(slot.value.existingPreparation.plugins),save,signal});abort(signal);
            if(result?.status!=='ready'||!Array.isArray(result.plugins))throw new FinderError('EXECUTION_PLUGINS_NOT_READY');
            const verifiedAt=now();validatePreparation({status:'ready',plugins:result.plugins,updatedAt:verifiedAt},value,'use','EXECUTION_PLUGINS_NOT_READY');
            await slot.save({existingPreparation:{kind:'existing',status:'ready',plugins:clone(result.plugins),verifiedAt}});
          }catch(error){await settleError(error,slot.value.existingPreparation.plugins);return projection(slot.value);}
          if(!generated){await slot.save({status:value.creation?.status==='ready'&&value.creation.supply.status==='current'?'creation_ready':'reuse_ready',error:undefined});return projection(slot.value);}
        }
        const kind=generated?'generated':'existing',operationId=slot.value.id+':'+kind+(generated&&repairCount(slot.value)?':repair-'+repairCount(slot.value):'');
        if(prior&&prior.kind!==kind)fail('AGENT_CREATION_CONFLICT');
        await slot.save({status:'activating',error:undefined,preparation:{kind,status:'pending',plugins:prior?.plugins??[]}});
        const save=async plugins=>{if(!Array.isArray(plugins)||plugins.length>(generated?1:4))fail('AGENT_STORAGE_FAILED');await slot.save({preparation:{kind,status:'pending',plugins:clone(plugins)}});};
        try{
          abort(signal);const args={operationId,previous:clone(slot.value.preparation.plugins),save,signal};
          const superseded=(slot.value.repairAttempts??[]).map(attempt=>({requestId:slot.value.id,...clone(actor),repairNumber:attempt.repairNumber,creator:clone(attempt.creator),preparation:clone(attempt.preparation),...(attempt.phase?{phase:attempt.phase}:{}),...(attempt.kind?{kind:attempt.kind}:{}),...(attempt.review?{review:clone(attempt.review)}:{})}));
          const result=generated?await prepareGeneratedPlugins({...args,artifact,caller:clone(actor),superseded}):await preparePlugins({...args,candidates:clone(candidates)});
          abort(signal);if(result?.status!=='ready'||!Array.isArray(result.plugins))throw new FinderError('EXECUTION_PLUGINS_NOT_READY');
          if(hybrid&&typeof readInstalled==='function'&&!await observeReuse(value))throw new FinderError('PLUGIN_INSTALL_NOT_ACTIVE');
          const retirement=generated?safeRetirement(result.retirement):undefined;
          await slot.save({status:'ready',error:undefined,preparation:{kind,status:'ready',plugins:clone(result.plugins),verifiedAt:now(),...(retirement?{retirement}:{})}});
        }catch(error){await settleError(error,slot.value.preparation.plugins);}
        return projection(slot.value);
      });
    },
    async prepareCreation(input,caller,{signal}={}){
      exact(input,['requestId','answers','feedback']);const id=requestId({requestId:input.requestId}),actor=scope(caller),feedback=input.feedback===undefined?undefined:text(input.feedback,3000);
      let suppliedAnswers;
      if(input.answers!==undefined){
        try{
          if(!Array.isArray(input.answers)||input.answers.length>3)fail('AGENT_INVALID_INPUT');
          const seen=new Set();
          suppliedAnswers=input.answers.map(answer=>{exact(answer,['id','answer','assumed']);if(answer.assumed!==undefined&&typeof answer.assumed!=='boolean')fail('AGENT_INVALID_INPUT');const id=text(answer.id,200);if(seen.has(id))fail('AGENT_INVALID_INPUT');seen.add(id);return{id,answer:text(answer.answer,2000),assumed:answer.assumed??true};});
        }catch{throw new AgentFinderError('AGENT_CREATION_ANSWERS_INVALID',id);}
      }
      return run(id,async()=>{
        abort(signal);const slot=await load(id,actor);
        if(feedback!==undefined){
          // Each attempt is a durable, compact artifact/receipt snapshot, never a second Core history.
          const attempts=slot.value.repairAttempts??[];
          const preinstall=preinstallReviewable(slot.value,workflow(slot.value));
          if(attempts.some(attempt=>attempt.feedbackHash===digest(feedback))||!preinstall&&!repairable(slot.value))return projection(slot.value);
          const review=preinstall?await reviewArtifact(slot.value.creator,actor,{signal}):undefined;
          const context=review?{previousPluginDirectory:review.directory,previousSourceDirectory:review.directory,previousPackageName:review.packageName,previousVersion:review.version,previousFingerprint:review.fingerprint}:await repairReference(slot.value,actor);abort(signal);
          const attempt={repairNumber:attempts.length+1,feedback,feedbackHash:digest(feedback),createdAt:now(),creator:clone(slot.value.creator),...(review?{phase:'preinstall',kind:'caller_reported_review',review}:{preparation:clone(slot.value.preparation)}),...(slot.value.error?{error:clone(slot.value.error)}:{})};
          await slot.save({status:'creation_ready',repairAttempts:[...attempts,attempt],repairFeedback:feedback,repairContext:context,creator:undefined,preparation:undefined,error:undefined});
          return projection(slot.value);
        }
        let value=workflow(slot.value);if(!value?.plan)fail('AGENT_CREATION_NOT_READY');
        if(suppliedAnswers!==undefined&&(!value.creation||suppliedAnswers.some(answer=>!value.creation.questions.some(question=>question.id===answer.id))))throw new AgentFinderError('AGENT_CREATION_ANSWERS_INVALID',id);
        if(slot.value.creator)return projection(slot.value);
        if(value.plan.kind==='hybrid'&&!reusedReady(slot.value,value))return projection(slot.value);
        if(!['gap','hybrid'].includes(value.plan.kind)&&!value.creation)fail('AGENT_CREATION_NOT_READY');
        if(value.creation?.status==='ready'&&(suppliedAnswers===undefined||digest(suppliedAnswers)===digest(value.creation.answers))){
          const status=['gap','hybrid'].includes(value.plan.kind)&&reusedReady(slot.value,value)?'creation_ready':'planned';
          if(slot.value.status!==status)await slot.save({status,error:undefined});
          return projection(slot.value);
        }
        const core=coreFor(slot);
        await slot.save({status:'creation_preparing',error:undefined});
        try{
          if(!value.creation){await core.creationStart({taskId:value.taskId,revisionId:value.revisionId,trigger:'user-customization',reason:'调用方在原任务约束内选择定制；当前已查范围未确认可靠满足，不断言全市场无供给。',signal});value=workflow(slot.value);}
          const answers=suppliedAnswers??value.creation.answers??[];
          const answered=value.creation.questions.every(question=>answers.some(answer=>answer.id===question.id));
          if(suppliedAnswers!==undefined||answered){
            await core.creationUpdate({taskId:value.taskId,revisionId:value.revisionId,answers,confirm:answered,signal});value=workflow(slot.value);
          }
          abort(signal);await slot.save({status:value.creation.status==='ready'?(['gap','hybrid'].includes(value.plan.kind)&&reusedReady(slot.value,value)?'creation_ready':'planned'):'creation_draft',error:undefined});
        }catch(error){if(storageFailure(error))throw error;await markError(slot,'creation_draft',error);}
        return projection(slot.value);
      });
    },
    async claimCreation(input,caller,options={}){
      exact(options,['promptHash','expectedRevisionId','expectedContentHash']);const {promptHash,expectedRevisionId,expectedContentHash}=options;
      if(promptHash!==undefined&&(typeof promptHash!=='string'||!/^[a-f0-9]{64}$/.test(promptHash)))fail('AGENT_INVALID_INPUT');
      const compare=expectedRevisionId!==undefined||expectedContentHash!==undefined;
      if(compare){text(expectedRevisionId,200);if(typeof expectedContentHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedContentHash))fail('AGENT_INVALID_INPUT');}
      return owned(input,caller,async slot=>{
        if(slot.value.creator)return{...projection(slot.value),claim:'existing',childId:slot.value.creator.childId};
        const current=workflow(slot.value);
        // The child prompt was built from this exact preparation, before entering this lock.
        // A newer answer or revision must not acquire authority for stale prompt bytes.
        if(compare&&(revisionToken(slot.value,current)!==expectedRevisionId||current?.creation?.contentHash!==expectedContentHash))return{...projection(slot.value),claim:'stale'};
        const value=preparedCreation(slot);
        if(value.plan.kind==='hybrid'&&typeof readInstalled==='function'&&!await observeReuse(value))return{...projection({...slot.value,status:'recheck_required'}),claim:'stale'};
        const last=slot.value.repairAttempts?.at(-1);
        if(last?.phase==='preinstall'){
          if(last.kind!=='caller_reported_review'||last.preparation!==undefined||last.creator?.status!=='completed'||!last.review)fail('AGENT_PREINSTALL_REVIEW_UNAVAILABLE');
          await reviewArtifact(last.creator,scope(slot.value.caller),{expected:last.review});
        }
        const childId='session-'+randomUUID();
        await slot.save({status:'creation_starting',creator:{childId,status:'starting',revisionId:value.revisionId,contentHash:value.creation.contentHash,...(promptHash?{promptHash}:{}),claimedAt:now()}});
        return{...projection(slot.value),claim:'acquired',childId};
      });
    },
    async recordCreation(input,caller){
      exact(input,['requestId','childId','status','result','stopReason']);const id=requestId({requestId:input.requestId}),actor=scope(caller);
      const childId=text(input.childId,200),status=text(input.status,40);
      if(!['running','completed','failed','unknown'].includes(status))fail('AGENT_INVALID_INPUT');
      const result=input.result===undefined?undefined:text(input.result,12000,{empty:true}),stopReason=input.stopReason===undefined?undefined:text(input.stopReason,80);
      return run(id,async()=>{
        const slot=await load(id,actor),prior=slot.value.creator;if(!prior||prior.childId!==childId)fail('AGENT_CREATION_CONFLICT');
        const value=workflow(slot.value);if(value?.revisionId!==prior.revisionId||value?.creation?.contentHash!==prior.contentHash)fail('AGENT_CREATION_CONFLICT');
        if(['completed','failed'].includes(prior.status))return projection(slot.value);
        if(status==='completed'&&result===undefined)fail('AGENT_CREATION_ARTIFACT_INVALID');
        await slot.save({status:{running:'creating',completed:'creation_completed',failed:'creation_failed',unknown:'creation_unknown'}[status],creator:{...prior,status,...(result!==undefined?{result}:{}),...(stopReason?{stopReason}:{}),updatedAt:now()}});
        return projection(slot.value);
      });
    },
  };
}
