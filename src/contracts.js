const messages={INVALID_INPUT:'输入格式不符合要求，请缩短需求或检查方案。',MODEL_UNAVAILABLE:'未找到 DSH 默认模型。请先在宿主模型设置中选择可用模型，再重试。',MODEL_INVALID_OUTPUT:'模型返回的方案不完整或含未知插件，请重试；未安装或执行任何插件。',MODEL_REQUEST_FAILED:'宿主模型调用未完成，请检查模型连接后重试。',MODEL_INCOMPLETE:'模型回复未完整结束，请重试。',MODEL_OUTPUT_LIMIT:'模型回复达到了本次长度上限。请减少所需能力后重试，或在宿主选择较低推理强度；请确认后再重试，重试仍会消耗额度。',MODEL_TIMEOUT:'模型请求超时，请稍后重试。',MODEL_ABORTED:'本次请求已取消。',ACCOUNT_SIGN_IN_REQUIRED:'请先在 DSH 宿主中连接 DeepSeek 账户。',ACCOUNT_QUOTA:'账户模型额度不足，请在宿主中检查。',ACCOUNT_TOKEN_INVALID:'DeepSeek 账户登录已失效，请在 DSH 宿主中重新连接账户后再试。',BUSY:'已有一个推荐请求正在进行，请等待或取消后再试。',CLOSED:'插件已关闭，请重新打开。',STORAGE_FAILED:'反馈未保存，请检查本机存储后重试。'};
export class FinderError extends Error{constructor(code,status){super(messages[code]||messages.MODEL_REQUEST_FAILED);this.name='FinderError';this.code=code;this.status=status??({MODEL_UNAVAILABLE:503,MODEL_INVALID_OUTPUT:502,MODEL_REQUEST_FAILED:502,MODEL_INCOMPLETE:502,MODEL_OUTPUT_LIMIT:502,MODEL_TIMEOUT:504,MODEL_ABORTED:499,BUSY:409,CLOSED:503,STORAGE_FAILED:500}[code]||400);}}
export const fail=(code='INVALID_INPUT')=>{throw new FinderError(code);};
export const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function text(x,max=6000,code='INVALID_INPUT',empty=false){if(typeof x!=='string'||x.length>max||(!empty&&!x.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(x))fail(code);return x.trim();}
function list(x,max,each,code,empty=true){if(!Array.isArray(x)||x.length>max||(!empty&&!x.length))fail(code);return x.map(v=>text(v,each,code));}
export function jsonObject(input,code='MODEL_INVALID_OUTPUT'){
  if(typeof input==='string'){let s=input.trim();if(s.startsWith('```'))s=s.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{input=JSON.parse(s);}catch{fail(code);}}
  if(!record(input))fail(code);return input;
}
function exact(value,keys,code){if(Object.keys(value).some(key=>!keys.includes(key)))fail(code);}
export function parseIntent(raw,code='INVALID_INPUT'){
  const v=jsonObject(raw,code);exact(v,['goal','input','output','constraints','capabilities','queries'],code);
  return{goal:text(v.goal,6000,code),input:text(v.input,600,code),output:text(v.output,600,code),constraints:list(v.constraints,6,350,code),capabilities:list(v.capabilities,6,150,code,false),queries:list(v.queries,6,120,code,false)};
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
