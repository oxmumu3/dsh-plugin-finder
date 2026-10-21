export const POLICY_VERSION='2026-10-20-v1';
export const EVENT_TYPES=['intent_confirmed','plan_generated','plan_selected','feedback_submitted','refinement_submitted','handoff_prepared'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function exact(value,keys){if(!object(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new TypeError('Invalid telemetry object');}
const string=(value,max,empty=false)=>{if(typeof value!=='string'||value.length>max||!empty&&!value.trim()||/[\u0000-\u001f\u007f]/.test(value))throw new TypeError('Invalid telemetry text');return value;};
const list=(value,max,fn)=>{if(!Array.isArray(value)||value.length>max)throw new TypeError('Invalid telemetry list');value.forEach(fn);};
const nullable=(value,fn)=>{if(value!==null)fn(value);};
const enumValue=(value,allowed)=>{if(!allowed.includes(value))throw new TypeError('Invalid telemetry enum');};
const bool=value=>{if(typeof value!=='boolean')throw new TypeError('Invalid telemetry boolean');};
const hex=value=>{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new TypeError('Invalid telemetry ID');};
const uuid=value=>{if(typeof value!=='string'||!/^[a-f0-9-]{36}$/i.test(value))throw new TypeError('Invalid telemetry epoch');};
export function sanitizeTelemetryText(value,max=500){
 if(typeof value!=='string')return'';
 value=value.normalize('NFKC');
 if(/(?:["'\x60]?)(?:[\w-]{0,30}[_-])?(?:api[_ -]?key|access[_ -]?token|token|secret|password|passwd|authorization|cookie|private[_ -]?key|密码|口令|密钥|访问令牌|授权码|验证码|身份证|银行卡)(?:["'\x60]?)\s*[:=]|BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY/i.test(value))return'[敏感内容已省略]';
 return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ')
 .replace(/(["'\x60])(?:[A-Za-z]:[\\/]|~\/|\/)[^"'\x60\r\n]*\1/g,'[路径已省略]')
 .replace(/(?:[A-Za-z]:[\\/]|~\/|\/(?:Users|home|var|tmp|Volumes|private|mnt|etc|workspace)\/)[^,;，；。<>"'\x60\r\n]+/g,'[路径已省略]')
 .replace(/(?:api[_ -]?key|access[_ -]?token|secret|token)\s*[:=]\s*["']?[^\s,;，；。"']+/gi,'[凭据已省略]')
 .replace(/\bBearer\s+[A-Za-z0-9_.~+\/-]+=*/gi,'[凭据已省略]')
 .replace(/\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{8,}/g,'[凭据已省略]')
 .replace(/(?:https?:\/\/|file:\/\/)[^\s,;，；。<>"']+/gi,'[链接已省略]')
 .replace(/(?:[A-Za-z]:[\\/]|~\/|\/(?:Users|home|var|tmp|Volumes|private|mnt|etc)\/)[^\s,;，；。<>"']+/g,'[路径已省略]')
 .replace(/(^|[\s=(])\/[^\s,;，；。<>"'\x60]+/g,'$1[路径已省略]')
 .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[邮箱已省略]')
 .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[地址已省略]')
 .replace(/(?<![\w])\+?\d[\d ()-]{8,}\d(?![\w])/g,'[号码已省略]')
 .replace(/[^\s/\\，；。<>"']+\.(?:md|pdf|docx?|xlsx?|csv|pptx?|txt|json|ya?ml|html|png|jpe?g)\b/gi,'[文件名已省略]')
 .trim().slice(0,max);
}
export function publicTelemetryRepository(value){
 try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.hostname!=='github.com'||!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname))return null;url.search='';url.hash='';return url.href.replace(/\/$/,'');}catch{return null;}
}
export function validateTelemetryEvent(event){
 exact(event,['schemaVersion','eventId','epochId','taskId','revisionId','type','occurredAt','clientVersion','hostVersion','data']);
 if(event.schemaVersion!==1)throw new TypeError('Unsupported telemetry schema');hex(event.eventId);uuid(event.epochId);hex(event.taskId);hex(event.revisionId);enumValue(event.type,EVENT_TYPES);
 string(event.occurredAt,40);if(!Number.isFinite(Date.parse(event.occurredAt)))throw new TypeError('Invalid event time');string(event.clientVersion,80);string(event.hostVersion,80);
 const data=event.data;exact(data,['task','plan','plugins','feedback','draftStatus']);
 if(data.task!==undefined){exact(data.task,['summary','capabilities','constraints']);string(data.task.summary,500,true);list(data.task.capabilities,6,value=>string(value,150,true));list(data.task.constraints,6,value=>string(value,200,true));}
 if(data.plan!==undefined){exact(data.plan,['kind','title','rationale','steps']);enumValue(data.plan.kind,['native','single','combo','gap']);string(data.plan.title,160,true);string(data.plan.rationale,700,true);list(data.plan.steps,10,step=>{exact(step,['owner','action']);string(step.owner,200);string(step.action,160,true);});}
 if(data.plugins!==undefined)list(data.plugins,8,plugin=>{exact(plugin,['name','version','commit','repository','sourceType','modelSelected','userSelected','installationStatus']);string(plugin.name,200);string(plugin.version,80,true);nullable(plugin.commit,value=>{if(!/^[a-f0-9]{40}$/i.test(value))throw new TypeError('Invalid commit');});nullable(plugin.repository,value=>{if(publicTelemetryRepository(value)!==value)throw new TypeError('Unsafe repository');});enumValue(plugin.sourceType,['npm','git','unknown']);bool(plugin.modelSelected);bool(plugin.userSelected);enumValue(plugin.installationStatus,['unknown']);});
 if(data.feedback!==undefined){exact(data.feedback,['outcome','note','stage','evidence']);enumValue(data.feedback.outcome,['complete','partial','blocked',null]);string(data.feedback.note,700,true);string(data.feedback.stage,80,true);enumValue(data.feedback.evidence,['user_reported']);}
 if(data.draftStatus!==undefined)enumValue(data.draftStatus,['applied','preserved','blocked']);
 if(JSON.stringify(event).length>16000)throw new TypeError('Telemetry event too large');return event;
}
