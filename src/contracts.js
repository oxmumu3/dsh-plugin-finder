const messages={TELEMETRY_FAILED:'集中同步设置未完成，请刷新同步状态后重试；本机历史仍保留。',HISTORY_STORAGE_FAILED:'本机历史未能保存，已有记录仍保留，请重试；本次结果可先复制备份。',HISTORY_CAPACITY:'此任务的历史记录已达到容量上限，已有版本仍保留；请导出备份后开启新任务。',STALE_WORKFLOW:'当前任务或版本已在别处切换，请从「我的方案」重新打开目标版本后继续。',WORKFLOW_NOT_FOUND:'没有找到这条历史方案，请刷新「我的方案」后重试；没有自动创建替代记录。',INVALID_BACKUP:'备份格式不完整或无法识别，未导入或覆盖任何历史记录。',WORKFLOW_STORAGE_FAILED:'本机任务状态未能保存，已有记录仍保留，请重试。',DISCOVERY_UNAVAILABLE:'本次插件来源搜索未完成，请检查网络或稍后重试；这不代表没有合适插件。',INVALID_INPUT:'输入格式不符合要求，请缩短需求或检查方案。',MODEL_UNAVAILABLE:'未找到 DSH 默认模型。请先在宿主模型设置中选择可用模型，再重试。',MODEL_INVALID_OUTPUT:'模型返回的方案不完整或含未知插件，请重试；未安装或执行任何插件。',MODEL_REQUEST_FAILED:'宿主模型调用未完成，请检查模型连接后重试。',MODEL_INCOMPLETE:'模型回复未完整结束，请重试。',MODEL_OUTPUT_LIMIT:'模型回复达到了本次长度上限。请减少所需能力后重试，或在宿主选择较低推理强度；请确认后再重试，重试仍会消耗额度。',MODEL_TIMEOUT:'模型请求超时，请稍后重试。',MODEL_ABORTED:'本次请求已取消。',ACCOUNT_SIGN_IN_REQUIRED:'请先在 DSH 宿主中连接 DeepSeek 账户。',ACCOUNT_QUOTA:'账户模型额度不足，请在宿主中检查。',ACCOUNT_TOKEN_INVALID:'DeepSeek 账户登录已失效，请在 DSH 宿主中重新连接账户后再试。',BUSY:'已有一个推荐请求正在进行，请等待或取消后再试。',CLOSED:'插件已关闭，请重新打开。',STORAGE_FAILED:'反馈未保存，请检查本机存储后重试。'};
Object.assign(messages,{CONSTRAINT_CAPACITY:'累计硬限制超过本任务可保存的24条，未删除或截断任何限制，当前版本保持不变。请先保留备份，再整理明确的限制范围。',CREATION_EVIDENCE_REQUIRED:'尚无可核对的具体缺口证据。可以继续核对候选，或明确选择主动定制。',CREATION_NOT_READY:'请先确认建造方案并完成当前需求的供给核对。',CREATOR_ATTEMPT_CONFLICT:'Creator 创建记录的来源或会话身份不一致，未写入；请重新打开原建造版本。'});
Object.assign(messages,{COMMUNITY_SOURCE_UNVERIFIED:'所选插件的作者来源或安装版本尚未重新核对一致，未开始执行；请重新核对这条使用方案。',COMMUNITY_ENTRY_UNAVAILABLE:'所选目录条目已不可用，未改为其他插件；请返回目录重新选择。',COMMUNITY_SELECTION_CONFLICT:'这条任务已经绑定另一个插件，未替换原选择；请从目录开启新需求。'});
Object.assign(messages,{EXECUTION_PLUGINS_NOT_READY:'所选插件尚未安装启用并核实，任务还没有发送；请在当前方案继续准备。',EXECUTION_PLUGIN_PREPARATION_FAILED:'插件准备尚未完成，已保留方案和原会话；请在当前页重试。',EXECUTION_ATTEMPT_CONFLICT:'这次执行的任务或会话身份不一致，已有执行记录保持不变。请重新打开原方案查看进度。',PLUGIN_INSTALL_UNAVAILABLE:'当前宿主的插件安装接口暂时不可用，任务尚未发送。',PLUGIN_INSTALL_INVALID:'所选插件的精确安装来源不完整，未安装或执行。',PLUGIN_INSTALL_CONFLICT:'当前已装插件与所选来源或版本不一致，未覆盖已有插件，任务尚未发送。',PLUGIN_INSTALL_FAILED:'所选插件安装未完成，任务尚未发送；可以在当前页重试。',PLUGIN_INSTALL_PENDING:'插件安装结果尚未确认，已保留原安装记录，未重复安装或发送任务。',PLUGIN_INSTALL_APPROVAL_REQUIRED:'此插件的构建脚本需要额外许可，任务尚未执行；请先核对所需权限。',PLUGIN_INSTALL_RESTART_REQUIRED:'插件已保存，但宿主提示需重启才可启用；尚未执行任务，也没有自动重启。',PLUGIN_INSTALL_NOT_ACTIVE:'插件尚未确认在当前宿主正常启用，任务还没有发送。'});
Object.assign(messages,{OPPORTUNITY_SCOPE_REAUTH_REQUIRED:'该机会方案来自导入备份，原资料授权未恢复。请在当前工作区重新选择资料并发现机会；已有方案保留。',OPPORTUNITY_REVOCATION_NOT_SAVED:'本次进程已停止机会分析，但停用设置未能可靠保存。请保持停用并稍后重试保存；已有任务与历史保留。',OPPORTUNITY_CAPACITY:'机会采纳记录已达到本机保存上限，已有任务与工作区绑定仍保留；未删除旧记录。',OPPORTUNITY_CONSENT_REQUIRED:'请先选择并授权本次用于发现机会的上下文。',OPPORTUNITY_CONTEXT_EMPTY:'请至少选择一份保存的方案或一个工作区文本文件。',OPPORTUNITY_STALE:'授权或材料已经变化，请在当前范围重新发现机会；未开始新任务。',OPPORTUNITY_NOT_FOUND:'这条机会已不可用，请查看当前推荐。',OPPORTUNITY_BUSY:'正在分析已授权的上下文，请稍候或取消。',OPPORTUNITY_STORAGE_FAILED:'机会记录未能完整保存，已有方案与草稿仍保留。',OPPORTUNITY_INVALID_OUTPUT:'模型返回的机会缺少可核对依据，请重试；未开始任何任务。',OPPORTUNITY_INTERRUPTED:'上次机会发现已停止，没有自动重发模型请求。',OPPORTUNITY_PENDING:'采纳结果尚未核实，已保留记录，没有重复开启任务。',OPPORTUNITY_WORKSPACE_MISMATCH:'这条机会绑定了另一个工作区，请返回原工作区继续。',CONTEXT_UNAVAILABLE:'当前工作区材料接口暂时不可用，未改读其他目录。',CONTEXT_FILE_BLOCKED:'所选文件不符合本次文本读取范围，请换一份普通文本材料。',CONTEXT_LIMIT:'所选材料超过本次读取上限，请减少文件。'});
export class FinderError extends Error{constructor(code,status){super(messages[code]||messages.MODEL_REQUEST_FAILED);this.name='FinderError';this.code=code;this.status=status??({EXECUTION_PLUGINS_NOT_READY:409,EXECUTION_PLUGIN_PREPARATION_FAILED:502,EXECUTION_ATTEMPT_CONFLICT:409,PLUGIN_INSTALL_UNAVAILABLE:503,PLUGIN_INSTALL_CONFLICT:409,PLUGIN_INSTALL_FAILED:502,PLUGIN_INSTALL_PENDING:409,PLUGIN_INSTALL_APPROVAL_REQUIRED:409,PLUGIN_INSTALL_RESTART_REQUIRED:409,PLUGIN_INSTALL_NOT_ACTIVE:409,CONSTRAINT_CAPACITY:413,CREATION_NOT_READY:409,CREATOR_ATTEMPT_CONFLICT:409,HISTORY_STORAGE_FAILED:500,HISTORY_CAPACITY:413,STALE_WORKFLOW:409,WORKFLOW_NOT_FOUND:404,INVALID_BACKUP:400,WORKFLOW_STORAGE_FAILED:500,DISCOVERY_UNAVAILABLE:503,MODEL_UNAVAILABLE:503,MODEL_INVALID_OUTPUT:502,MODEL_REQUEST_FAILED:502,MODEL_INCOMPLETE:502,MODEL_OUTPUT_LIMIT:502,MODEL_TIMEOUT:504,MODEL_ABORTED:499,BUSY:409,CLOSED:503,STORAGE_FAILED:500}[code]||400);}}
export const fail=(code='INVALID_INPUT')=>{throw new FinderError(code);};
export const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function text(x,max=6000,code='INVALID_INPUT',empty=false){if(typeof x!=='string'||x.length>max||(!empty&&!x.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(x))fail(code);return x.trim();}
function list(x,max,each,code,empty=true){if(!Array.isArray(x)||x.length>max||(!empty&&!x.length))fail(code);return x.map(v=>text(v,each,code));}
export function jsonObject(input,code='MODEL_INVALID_OUTPUT'){
  if(typeof input==='string'){let s=input.trim();if(s.startsWith('```'))s=s.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{input=JSON.parse(s);}catch{fail(code);}}
  if(!record(input))fail(code);return input;
}
function exact(value,keys,code){if(Object.keys(value).some(key=>!keys.includes(key)))fail(code);}
export const MAX_INTENT_CONSTRAINTS=24;
export const MAX_MODEL_CONSTRAINTS=6;
export function parseIntent(raw,code='INVALID_INPUT',constraintLimit=MAX_INTENT_CONSTRAINTS){
  const v=jsonObject(raw,code);exact(v,['goal','input','output','constraints','capabilities','queries'],code);
  return{goal:text(v.goal,6000,code),input:text(v.input,600,code),output:text(v.output,600,code),constraints:list(v.constraints,constraintLimit,350,code),capabilities:list(v.capabilities,6,150,code,false),queries:list(v.queries,6,120,code,false)};
}
export function parseAnalyzedIntent(raw,request){
  const source=jsonObject(raw,'MODEL_INVALID_OUTPUT');
  const projected=Object.fromEntries(['goal','input','output','constraints','capabilities','queries'].map(key=>[key,source[key]]));
  const intent=parseIntent(projected,'MODEL_INVALID_OUTPUT',MAX_MODEL_CONSTRAINTS);
  const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/gu,'');
  const original=normalize(request);
  const constraints=intent.constraints.filter(value=>original.includes(normalize(value)));
  const analysisWarning=constraints.length===intent.constraints.length?undefined:'已去掉原始需求中没有明确提出的约束，请核对目标、能力和限制。';
  return{intent:{...intent,constraints},...(analysisWarning?{analysisWarning}:{})};
}
export function parsePlan(raw,candidates,intent){
  const code='MODEL_INVALID_OUTPUT',v=jsonObject(raw,code);exact(v,['kind','title','rationale','pluginIds','steps','limits'],code);
  if(!['native','single','combo','gap'].includes(v.kind))fail(code);
  const ids=list(v.pluginIds,2,200,code),known=new Set(candidates.map(p=>p.id));
  if(new Set(ids).size!==ids.length||ids.some(id=>!known.has(id)))fail(code);
  if((['native','gap'].includes(v.kind)&&ids.length)||(v.kind==='single'&&ids.length!==1)||(v.kind==='combo'&&ids.length!==2))fail(code);
  if(!Array.isArray(v.steps)||v.steps.length>10)fail(code);
  const steps=v.steps.map(raw=>{
    const s=jsonObject(raw,code);exact(s,['capability','owner','sourceCapability','action','input','output'],code);
    if(!['dsh','human',...ids].includes(s.owner)||!intent.capabilities.includes(s.capability))fail(code);
    if(ids.includes(s.owner)&&!candidates.find(p=>p.id===s.owner)?.capabilities?.includes(s.sourceCapability))fail(code);
    if(!ids.includes(s.owner)&&s.sourceCapability!=null)fail(code);
    return{capability:text(s.capability,150,code),owner:s.owner,sourceCapability:s.sourceCapability??null,action:text(s.action,600,code),input:text(s.input,400,code),output:text(s.output,400,code)};
  });
  if(v.kind!=='gap'&&intent.capabilities.some(cap=>!steps.some(step=>step.capability===cap)))fail(code);
  if(ids.some(id=>!steps.some(step=>step.owner===id)))fail(code);
  const title=text(v.title,160,code),rationale=text(v.rationale,1600,code);
  if(/已(?:验证|实测)|已安装(?:成功|可用)|实测通过|保证(?:完成|可用)|完全免费|verified (?:working|installed)|tested successfully/i.test(title))fail(code);
  return{kind:v.kind,title,rationale,pluginIds:ids,steps,limits:list(v.limits,8,500,code)};
}
