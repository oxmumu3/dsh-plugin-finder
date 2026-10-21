import{POLICY_VERSION,validateTelemetryEvent,sanitizeTelemetryText}from'../src/telemetry-contract.js';
const encoder=new TextEncoder(),DAY=86400000;
class HttpError extends Error{constructor(status,code){super(code);this.status=status;}}
const reject=(status,code)=>{throw new HttpError(status,code);};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...status===429?{'retry-after':'3600'}:{}}});
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new TypeError('Invalid body');}
function version(value){if(typeof value!=='string'||!/^[a-z0-9][a-z0-9._+-]{0,79}$/i.test(value))throw new TypeError('Invalid version');}
async function readJSON(request,maxBytes){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))reject(415,'JSON_REQUIRED');
 if(Number(request.headers.get('content-length'))>maxBytes)reject(413,'BODY_TOO_LARGE');
 const reader=request.body?.getReader();if(!reader)throw new TypeError('Missing body');let size=0;const parts=[];
 try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();reject(413,'BODY_TOO_LARGE');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new TypeError('Invalid JSON');}
}
function cleanEvent(raw){
 validateTelemetryEvent(raw);const event=structuredClone(raw),data=event.data;
 version(event.clientVersion);version(event.hostVersion);
 if(data.task){data.task.summary=sanitizeTelemetryText(data.task.summary,500);data.task.capabilities=data.task.capabilities.map(x=>sanitizeTelemetryText(x,150));data.task.constraints=data.task.constraints.map(x=>sanitizeTelemetryText(x,200));}
 if(data.plan){data.plan.title=sanitizeTelemetryText(data.plan.title,160);data.plan.rationale=sanitizeTelemetryText(data.plan.rationale,700);data.plan.steps=data.plan.steps.map(step=>({owner:sanitizeTelemetryText(step.owner,200),action:sanitizeTelemetryText(step.action,160)}));}
 if(data.feedback){data.feedback.note=sanitizeTelemetryText(data.feedback.note,700);data.feedback.stage=sanitizeTelemetryText(data.feedback.stage,80);}
 for(const p of data.plugins??[]){if(!/^@?[a-z0-9][a-z0-9._\/@-]{0,199}$/i.test(p.name)||p.version&&!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(p.version))throw new TypeError('Invalid plugin identity');}
 return validateTelemetryEvent(event);
}
const bearer=request=>{const match=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._~-]{20,200})$/);return match?.[1];};
function adminToken(request,env){const value=bearer(request);if(!value||value!==env.ADMIN_TOKEN)reject(401,'UNAUTHORIZED');}
const prepare=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
async function authenticate(request,env,column){const token=bearer(request);if(!token)reject(401,'UNAUTHORIZED');const row=await prepare(env,`SELECT * FROM installations WHERE ${column}=?`,await hash(token)).first();if(!row||column==='upload_hash'&&row.revoked_at)reject(401,'UNAUTHORIZED');return row;}
const since=now=>new Date(now.getTime()-90*DAY).toISOString();
async function purge(env,now){const cutoff=since(now);await env.DB.batch([prepare(env,'DELETE FROM events WHERE received_at<?',cutoff),prepare(env,'DELETE FROM installations WHERE COALESCE(revoked_at,created_at)<? AND NOT EXISTS(SELECT 1 FROM events WHERE events.installation_id=installations.id)',cutoff),prepare(env,'DELETE FROM daily_usage WHERE day<?',cutoff.slice(0,10))]);}
function filter(url,now,plugin){let sql='e.received_at>=? AND i.revoked_at IS NULL',args=[since(now)];if(url.searchParams.get('includeTest')!=='1')sql+=" AND i.environment='production'";if(plugin){sql+=" AND EXISTS(SELECT 1 FROM json_each(e.payload,'$.data.plugins') p WHERE json_extract(p.value,'$.name')=?)";args.push(plugin);}return{sql,args};}
async function summary(env,url,now,plugin){
 const f=filter(url,now,plugin),base=` FROM events e JOIN installations i ON i.id=e.installation_id WHERE ${f.sql}`;
 const count=await prepare(env,'SELECT COUNT(*) totalEvents,COUNT(DISTINCT e.installation_id) anonymousConsentCycles,COUNT(DISTINCT e.installation_id||e.task_id) tasks'+base,...f.args).first();
 const types=(await prepare(env,'SELECT e.type,COUNT(*) count'+base+' GROUP BY e.type',...f.args).all()).results;
 const selectedScope=plugin?" AND EXISTS(SELECT 1 FROM json_each(e.payload,'$.data.plugins') selected WHERE json_extract(selected.value,'$.name')=? AND (json_extract(selected.value,'$.userSelected')=1 OR (json_extract(selected.value,'$.modelSelected')=1 AND NOT EXISTS(SELECT 1 FROM json_each(e.payload,'$.data.plugins') chosen WHERE json_extract(chosen.value,'$.userSelected')=1))))":'';
 const outcomes=(await prepare(env,"SELECT json_extract(e.payload,'$.data.feedback.outcome') outcome,COUNT(*) count"+base+" AND e.type='feedback_submitted'"+selectedScope+' GROUP BY outcome',...f.args,...plugin?[plugin]:[]).all()).results;
 let derived={};if(plugin)derived=await prepare(env,"SELECT COALESCE(SUM(CASE WHEN e.type='plan_generated' THEN 1 ELSE 0 END),0) candidateAppearances,COALESCE(SUM(CASE WHEN e.type='plan_generated' AND EXISTS(SELECT 1 FROM json_each(e.payload,'$.data.plugins') p WHERE json_extract(p.value,'$.name')=? AND json_extract(p.value,'$.modelSelected')=1) THEN 1 ELSE 0 END),0) modelRecommendations,COALESCE(SUM(CASE WHEN e.type='plan_selected' AND EXISTS(SELECT 1 FROM json_each(e.payload,'$.data.plugins') p WHERE json_extract(p.value,'$.name')=? AND json_extract(p.value,'$.userSelected')=1) THEN 1 ELSE 0 END),0) userSelections"+base,plugin,plugin,...f.args).first();
 return{...count,...derived,eventTypes:Object.fromEntries(types.map(x=>[x.type,x.count])),taskReportedOutcomes:Object.fromEntries(outcomes.filter(x=>x.outcome!==null).map(x=>[x.outcome,x.count])),taskReportedOutcomesScope:'含该插件所选或推荐方案的任务自报；未验证实际使用，不能归因插件成功。',verifiedInstallations:0,verifiedTaskSuccesses:0,includeTest:url.searchParams.get('includeTest')==='1',retentionDays:90,generatedAt:now.toISOString(),...(plugin?{plugin}:{}),evidenceBoundary:'Anonymous consent cycles are not unique people. eventTypes are process events referencing this plugin, not its adoption counts. userSelections counts explicit selection events, not unique people or actual use. Feedback is task-level user-reported evidence; it does not prove plugin installation, usage or success.'};
}
export function createCollector({now=()=>new Date()}={}){return{
 async fetch(request,env){try{
  if(!env.DB||typeof env.ADMIN_TOKEN!=='string'||env.ADMIN_TOKEN.length<24)reject(503,'COLLECTOR_NOT_CONFIGURED');
  const url=new URL(request.url),path=url.pathname,time=now(),iso=time.toISOString(),day=iso.slice(0,10);
  if(path==='/health'&&request.method==='GET')return json({ok:true,schemaVersion:1,policyVersion:POLICY_VERSION});
  if(path==='/v1/register'){
   if(request.method!=='POST')reject(405,'METHOD_NOT_ALLOWED');const body=await readJSON(request,1024);exact(body,['policyVersion','consentedAt','clientVersion','environment']);version(body.clientVersion);
   const consent=Date.parse(body.consentedAt);if(body.policyVersion!==POLICY_VERSION||!['production','test'].includes(body.environment)||typeof body.consentedAt!=='string'||!Number.isFinite(consent)||consent<time.getTime()-90*DAY||consent>time.getTime()+300000)throw new TypeError('Invalid consent');
   const installationId=crypto.randomUUID(),uploadToken=randomToken(),deleteToken=randomToken();
   const ipBucket=await hash(env.ADMIN_TOKEN+'\n'+day+'\n'+(request.headers.get('cf-connecting-ip')??'unknown'));
   await prepare(env,'INSERT INTO installations(id,upload_hash,delete_hash,consented_at,client_version,environment,created_at,registration_day,ip_bucket) VALUES(?,?,?,?,?,?,?,?,?)',installationId,await hash(uploadToken),await hash(deleteToken),new Date(consent).toISOString(),body.clientVersion,body.environment,iso,day,ipBucket).run();
   return json({installationId,uploadToken,deleteToken},201);
  }
  if(path==='/v1/events'){
   if(request.method!=='POST')reject(405,'METHOD_NOT_ALLOWED');const installation=await authenticate(request,env,'upload_hash');const body=await readJSON(request,65536);exact(body,['schemaVersion','events']);
   if(body.schemaVersion!==1||!Array.isArray(body.events)||!body.events.length||body.events.length>20)throw new TypeError('Invalid batch');
   const events=body.events.map(cleanEvent);if(new Set(events.map(e=>e.eventId)).size!==events.length)throw new TypeError('Duplicate batch IDs');
   for(const e of events){const date=Date.parse(e.occurredAt);if(date<Date.parse(installation.consented_at)||date<time.getTime()-90*DAY||date>time.getTime()+300000)throw new TypeError('Event outside consent period');}
   const ids=events.map(e=>e.eventId),placeholders=ids.map(()=>'?').join(',');const existing=(await prepare(env,`SELECT event_id,installation_id FROM events WHERE event_id IN (${placeholders})`,...ids).all()).results;
   if(existing.some(e=>e.installation_id!==installation.id))reject(409,'EVENT_ID_CONFLICT');const known=new Set(existing.map(e=>e.event_id));
   const statements=events.filter(e=>!known.has(e.eventId)).map(e=>{const payload=JSON.stringify(e);return prepare(env,'INSERT INTO events(event_id,installation_id,type,task_id,revision_id,occurred_at,received_at,day,payload,size_bytes) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING',e.eventId,installation.id,e.type,e.taskId,e.revisionId,e.occurredAt,iso,day,payload,encoder.encode(payload).byteLength);});
   statements.push(prepare(env,'SELECT id FROM installations WHERE id=? AND revoked_at IS NULL',installation.id),prepare(env,`SELECT event_id,installation_id FROM events WHERE event_id IN (${placeholders})`,...ids));
   const results=await env.DB.batch(statements),active=results.at(-2).results,stored=results.at(-1).results;
   if(!active.length)reject(401,'UNAUTHORIZED');if(stored.some(e=>e.installation_id!==installation.id))reject(409,'EVENT_ID_CONFLICT');
   return json({acceptedEventIds:ids.filter(id=>stored.some(e=>e.event_id===id&&e.installation_id===installation.id)),receivedAt:iso});
  }
  if(path==='/v1/installation'){
   if(request.method!=='DELETE')reject(405,'METHOD_NOT_ALLOWED');const installation=await authenticate(request,env,'delete_hash');
   await env.DB.batch([prepare(env,'UPDATE installations SET revoked_at=COALESCE(revoked_at,?) WHERE id=?',iso,installation.id),prepare(env,'DELETE FROM events WHERE installation_id=?',installation.id)]);return json({deleted:true});
  }
  if(['/admin/summary','/admin/cases','/admin/creator-report'].includes(path)){
   adminToken(request,env);if(request.method!=='GET')reject(405,'METHOD_NOT_ALLOWED');const plugin=url.searchParams.get('plugin');if(plugin!==null&&(plugin.length>200||!/^@?[a-z0-9][a-z0-9._\/@-]*$/i.test(plugin)))throw new TypeError('Invalid plugin');
   if(path==='/admin/creator-report'&&!plugin)throw new TypeError('Plugin required');
   if(path!=='/admin/cases')return json(await summary(env,url,time,plugin));
   const f=filter(url,time,plugin),limit=Number(url.searchParams.get('limit')??25);if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new TypeError('Invalid limit');
   const rows=(await prepare(env,`SELECT e.payload,e.received_at,i.environment FROM events e JOIN installations i ON i.id=e.installation_id WHERE ${f.sql} ORDER BY e.received_at DESC,e.event_id DESC LIMIT ?`,...f.args,limit).all()).results;
   return json({cases:rows.map(row=>({event:JSON.parse(row.payload),receivedAt:row.received_at,environment:row.environment})),limit,includeTest:url.searchParams.get('includeTest')==='1',generatedAt:iso});
  }
  reject(404,'NOT_FOUND');
 }catch(error){if(error instanceof HttpError)return json({error:error.message},error.status);if(error instanceof TypeError)return json({error:'INVALID_REQUEST'},400);if(/COLLECTOR_QUOTA/.test(String(error.message)))return json({error:'COLLECTOR_QUOTA'},429);if(/COLLECTOR_REVOKED/.test(String(error.message)))return json({error:'UNAUTHORIZED'},401);return json({error:'COLLECTOR_UNAVAILABLE'},503);}},
 async scheduled(_event,env,ctx){const work=purge(env,now());if(ctx?.waitUntil){ctx.waitUntil(work);return;}await work;}
};}
export default createCollector();
