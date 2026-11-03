import {createHash,randomUUID} from 'node:crypto';
import {FinderError} from './contracts.js';

const MAX_BYTES=256000;
const MAX_ARCHIVED_ATTEMPTS=8;
const stores=new WeakMap();
const clone=structuredClone;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clean=(value,max,empty=false)=>typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const fail=(code,status)=>{throw new FinderError(code,status);};
const collection=value=>value==='community'||value==='featured';
const idFor=(kind,id,revision)=>'catalog-install-'+createHash('sha256').update(JSON.stringify(revision?[kind,id,revision]:[kind,id])).digest('hex');
const validId=value=>typeof value==='string'&&/^catalog-install-[a-f0-9]{64}$/.test(value);
const messages={
 PLUGIN_INSTALL_UNAVAILABLE:'当前宿主的安装状态暂时无法读取，请稍后重试。',
 PLUGIN_INSTALL_CONFLICT:'已安装的版本或来源与本页不同，未覆盖现有插件。',
 PLUGIN_INSTALL_FAILED:'插件安装未完成，可以在本页重试。',
 PLUGIN_INSTALL_INVALID:'所选插件的精确安装资料尚未核对完整。',
 PLUGIN_INSTALL_PENDING:'安装结果尚未确认，已保留原记录，没有重复安装。',
 PLUGIN_INSTALL_NOT_ACTIVE:'插件已安装，但尚未确认正常启用。',
 PLUGIN_INSTALL_APPROVAL_REQUIRED:'插件的构建脚本需要宿主额外许可，尚未完成启用。',
 PLUGIN_INSTALL_RESTART_REQUIRED:'宿主提示需要重启才能启用；没有自动重启。',
 MODEL_ABORTED:'本次安装已停止，已保留安装记录。',
};
const known=new Set(Object.keys(messages));
const unresolved=new Set(['installing','unknown']);
const blocking=new Set(['PLUGIN_INSTALL_APPROVAL_REQUIRED','PLUGIN_INSTALL_RESTART_REQUIRED']);

function input(value,keys){
 if(!object(value)||Reflect.ownKeys(value).some(key=>!keys.includes(key)))fail('INVALID_INPUT');
 if(value.signal!==undefined&&!(value.signal instanceof AbortSignal))fail('INVALID_INPUT');
 return value;
}
function publicEntry(value,kind,id){
 if(!object(value)||value.collection!==kind||value.id!==id||!clean(value.name,214)||!clean(value.title,500)||!clean(value.summary,3000,true)||!clean(value.author??'',240,true)||!clean(value.version??'',120,true)||!clean(value.sourceUrl??'',2048,true))fail('PLUGIN_INSTALL_INVALID');
 if(value.sourceUrl){try{const url=new URL(value.sourceUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{fail('PLUGIN_INSTALL_INVALID');}}
 const list=value=>{if(!Array.isArray(value)||value.length>32||value.some(item=>!clean(item,3000)))fail('PLUGIN_INSTALL_INVALID');return [...value];};
 if(value.description!==undefined&&!clean(value.description,16000,true))fail('PLUGIN_INSTALL_INVALID');
 return{collection:kind,id,name:value.name,title:value.title,summary:value.summary,description:value.description??value.summary,author:value.author??'',version:value.version??'',sourceUrl:value.sourceUrl??'',requirements:list(value.requirements),limitations:list(value.limitations)};
}
function checkedCandidate(value){
 if(value===null)return null;
 if(!object(value)||!clean(value.id,200)||value.evidence?.metadata!=='manifest-checked'||!object(value.install)||!clean(value.install.spec,3000)||!clean(value.install.version,120))fail('PLUGIN_INSTALL_INVALID');
 try{const data=JSON.stringify(value);if(Buffer.byteLength(data)>MAX_BYTES/2)throw Error();return JSON.parse(data);}catch{fail('PLUGIN_INSTALL_INVALID');}
}
function receipts(value,candidate){
 if(!Array.isArray(value)||value.length>1)fail('PLUGIN_INSTALL_INVALID');
 const npm=/^(?:npm:)?((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@/.exec(candidate.install.spec);
 const expectedName=npm?.[1]??candidate.install.packageName??candidate.id;
 return value.map(row=>{
  if(!object(row)||row.candidateId!==candidate.id||row.spec!==candidate.install.spec||row.version!==candidate.install.version||!clean(row.packageName,214)||row.packageName!==expectedName||!clean(row.requestId,200)||!['installing','unknown','failed','ready'].includes(row.status))fail('PLUGIN_INSTALL_INVALID');
  const result=Object.fromEntries(['candidateId','packageName','version','spec','requestId','status'].map(key=>[key,row[key]]));
  for(const key of ['installed','enabled','active'])if(row[key]!==undefined){if(typeof row[key]!=='boolean')fail('PLUGIN_INSTALL_INVALID');result[key]=row[key];}
  if(row.code!==undefined){if(!known.has(row.code))fail('PLUGIN_INSTALL_INVALID');result.code=row.code;}
  if(row.application!==undefined){if(!['applied','failed','cancelled','restart-required','overridden'].includes(row.application))fail('PLUGIN_INSTALL_INVALID');result.application=row.application;}
  if(row.source===candidate.install.spec)result.source=row.source;
  return result;
 });
}
function installIdentity(candidate){
 const install=candidate.install;
 const npm=/^(?:npm:)?((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@/.exec(install.spec);
 return JSON.stringify({id:candidate.id,name:candidate.name??candidate.id,type:install.type,spec:install.spec,version:install.version,packageName:install.packageName??npm?.[1]??candidate.id,registry:install.type==='npm'?(install.registry??'https://registry.npmjs.org/').replace(/\/$/,''):null,commit:install.commit??null,sha256:install.sha256??null,publicSource:install.publicSource??null,communityEntryId:candidate.communityEntryId??null,communitySourceUrl:candidate.communitySourceUrl??null});
}
function checkedAttempt(value,id,candidate,archived=false){
 if(!object(value)||Object.keys(value).some(key=>!['operationId','requestId','status','plugins','code'].includes(key))||value.operationId!==id||!clean(value.requestId,200)||!['installing','unknown','failed','ready'].includes(value.status)||value.code!==undefined&&!known.has(value.code))fail('HISTORY_STORAGE_FAILED');
 const result={...value,plugins:receipts(value.plugins,candidate)};
 if(archived&&(result.status!=='ready'||result.plugins.length!==1||result.plugins[0].status!=='ready'||['installed','enabled','active'].some(key=>result.plugins[0][key]!==true)))fail('HISTORY_STORAGE_FAILED');
 return result;
}
const absent=facts=>facts!==null&&facts.installed===false&&facts.enabled===false&&facts.active===false&&facts.conflict===false;
const packageFor=candidate=>candidate?.install?.packageName??/^(?:npm:)?((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@/.exec(candidate?.install?.spec??'')?.[1]??candidate?.id;
function abort(signal){if(signal?.aborted)fail('MODEL_ABORTED');}
function waitFor(pending,signal){
 if(!signal)return pending;
 abort(signal);
 return new Promise((resolve,reject)=>{
  const stop=()=>{signal.removeEventListener('abort',stop);reject(new FinderError('MODEL_ABORTED'));};
  signal.addEventListener('abort',stop,{once:true});
  pending.then(value=>{signal.removeEventListener('abort',stop);resolve(value);},error=>{signal.removeEventListener('abort',stop);reject(error);});
 });
}

/** A separate catalog record owns only a fixed selected plugin and its installation receipts.
 * Browsing never invokes a model or changes a task/workspace/history pointer.
 */
export function createCatalogInstallService({store,resolveDetail,preparePlugins,readInstalled,readEntryInstalled,entryRevision,now=()=>new Date()}={}){
 if(!store||!['read','write','list'].every(key=>typeof store[key]==='function')||typeof resolveDetail!=='function'||typeof preparePlugins!=='function'||typeof readInstalled!=='function')throw new TypeError('Catalog install adapters are incomplete');
 let shared=stores.get(store);if(!shared){shared={queues:new Map(),installs:new Map(),activeClaims:new Set()};stores.set(store,shared);}
 let closed=false,closing;const lifetime=new AbortController(),pending=new Set();
 const check=signal=>{if(closed)fail('CLOSED');abort(signal);};
 const combined=signal=>AbortSignal.any([lifetime.signal,...(signal?[signal]:[])]);
 const stamp=()=>{const value=now();const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))fail('HISTORY_STORAGE_FAILED');return date.toISOString();};
 const track=action=>{const job=Promise.resolve().then(action);pending.add(job);job.then(()=>pending.delete(job),()=>pending.delete(job));return job;};
 const serial=(id,action)=>{const job=(shared.queues.get(id)??Promise.resolve()).catch(()=>undefined).then(action);shared.queues.set(id,job);job.then(()=>{if(shared.queues.get(id)===job)shared.queues.delete(id);},()=>{if(shared.queues.get(id)===job)shared.queues.delete(id);});return job;};
 const load=async(id,missing=false)=>{
  let row;try{row=await store.read(id);}catch{fail('HISTORY_STORAGE_FAILED');}
  if(row===undefined||row===null){if(missing)return null;fail('COMMUNITY_ENTRY_UNAVAILABLE',404);}
  try{
   if(row.id!==id||typeof row.serialized!=='string'||Buffer.byteLength(row.serialized)>MAX_BYTES)throw Error();
   const value=JSON.parse(row.serialized);
   if(value.catalogRevision!==undefined&&!/^[a-f0-9]{64}$/.test(value.catalogRevision))throw Error();
   if(value.version!==1||value.id!==id||!collection(value.collection)||!clean(value.entryId,2048)||idFor(value.collection,value.entryId,value.catalogRevision)!==id||!clean(value.unavailableReason,3000,true)||value.attempt!==null&&(!object(value.attempt)||value.attempt.operationId!==id||!clean(value.attempt.requestId,200)||!['installing','unknown','failed','ready'].includes(value.attempt.status)))throw Error();
   value.entry=publicEntry(value.entry,value.collection,value.entryId);value.candidate=checkedCandidate(value.candidate);
   if(value.attempt){if(!value.candidate)throw Error();value.attempt=checkedAttempt(value.attempt,id,value.candidate);}
   if(value.archivedAttempts!==undefined&&(!Array.isArray(value.archivedAttempts)||value.archivedAttempts.length>MAX_ARCHIVED_ATTEMPTS))throw Error();
   value.archivedAttempts=(value.archivedAttempts??[]).map(attempt=>{if(!value.candidate)throw Error();return checkedAttempt(attempt,id,value.candidate,true);});
   return value;
  }catch{fail('HISTORY_STORAGE_FAILED');}
 };
 const save=async value=>{
  const next={...value,updatedAt:stamp()};
  try{const serialized=JSON.stringify(next);if(Buffer.byteLength(serialized)>MAX_BYTES)throw Error();await store.write({id:next.id,serialized});}catch{fail('HISTORY_STORAGE_FAILED');}
  return next;
 };
 const observe=async(record,signal)=>{
  abort(signal);
  const checked=facts=>{
   if(!object(facts)||['installed','enabled','active','conflict'].some(key=>typeof facts[key]!=='boolean'))throw Error();
   return{installed:facts.installed,enabled:facts.enabled,active:facts.active,conflict:facts.conflict,...(clean(facts.version,120)?{version:facts.version}:{}),...(clean(facts.packageName,214)?{packageName:facts.packageName}:{}),...(facts.componentOnly===true?{componentOnly:true}:{})};
  };
  let selectedFacts=null,sourceInvalid=false;
  try{
   if(record.candidate){selectedFacts=checked(await readInstalled(clone(record.candidate)));abort(signal);if(selectedFacts.installed||selectedFacts.conflict)return selectedFacts;}
  }catch(error){sourceInvalid=record.candidate?.install?.type==='archive'&&error?.code==='PLUGIN_INSTALL_INVALID';abort(signal);}
  if(typeof readEntryInstalled==='function')try{
   const facts=checked(await readEntryInstalled({collection:record.collection,entryId:record.entryId}));abort(signal);
   if(!selectedFacts||facts.installed&&!facts.componentOnly)return{...facts,localOnly:true,...(sourceInvalid?{sourceInvalid:true}:{})};
  }catch{abort(signal);}
  return selectedFacts??(sourceInvalid?{installed:false,enabled:false,active:false,conflict:false,sourceInvalid:true,localUnknown:true}:null);
 };
 const project=(record,facts)=>{
  const installation={status:'not-installed',installed:false,enabled:false,active:false};
  const withCode=(status,code)=>Object.assign(installation,{status,code,message:messages[code]});
  if(facts)Object.assign(installation,{installed:facts.installed,enabled:facts.enabled,active:facts.active,...(facts.version?{version:facts.version}:{}),...(facts.packageName?{packageName:facts.packageName}:{}),...(facts.componentOnly?{componentOnly:true}:{})});
  if((facts?.sourceInvalid||facts?.localOnly)&&blocking.has(record.attempt?.code))withCode('failed',record.attempt.code);
  else if((facts?.sourceInvalid||facts?.localOnly)&&unresolved.has(record.attempt?.status))withCode(record.attempt.status==='installing'&&shared.activeClaims.has(record.id)?'installing':'unknown','PLUGIN_INSTALL_PENDING');
  else if(facts?.localUnknown||!facts&&(record.candidate||typeof readEntryInstalled==='function'))withCode('unknown','PLUGIN_INSTALL_UNAVAILABLE');
  else if(!record.candidate&&!facts){installation.status='unavailable';if(record.unavailableReason)installation.message=record.unavailableReason;}
  else{
   if(facts.localOnly&&facts.installed)installation.status='installed-local';
   else if(facts.sourceInvalid){installation.status='unavailable';installation.message='已保存的固定安装包暂时无法读取，可以重新核对原来源后恢复。';}
   else if(facts.localOnly&&!record.candidate){installation.status='unavailable';installation.message=record.unavailableReason;}
   else if(facts.localOnly)withCode('unknown','PLUGIN_INSTALL_UNAVAILABLE');
   else if(facts.conflict)withCode('conflict','PLUGIN_INSTALL_CONFLICT');
   else if(blocking.has(record.attempt?.code)&&!(record.attempt.code==='PLUGIN_INSTALL_RESTART_REQUIRED'&&facts.installed&&facts.enabled&&facts.active))withCode('failed',record.attempt.code);
   else if(facts.installed&&facts.enabled&&facts.active)installation.status='ready';
   else if(unresolved.has(record.attempt?.status))withCode(record.attempt.status==='installing'&&shared.activeClaims.has(record.id)?'installing':'unknown','PLUGIN_INSTALL_PENDING');
   else if(facts.installed&&!facts.enabled)installation.status='installed-disabled';
   else if(facts.installed)withCode('failed','PLUGIN_INSTALL_NOT_ACTIVE');
   else if(record.attempt?.status==='ready'&&absent(facts))Object.assign(installation,{status:'not-installed',message:'此前安装的插件已卸载，可以在本页重新安装；点击后会重新核对固定版本。'});
   else if(record.attempt)withCode('failed',known.has(record.attempt.code)?record.attempt.code:'PLUGIN_INSTALL_FAILED');
  }
  return clone({detailId:record.id,collection:record.collection,entryId:record.entryId,...Object.fromEntries(['name','title','summary','description','author','version','sourceUrl','requirements','limitations'].map(key=>[key,record.entry[key]])),installable:record.candidate!==null&&!facts?.sourceInvalid,...(record.candidate?.install?.type==='archive'?{sourceRecheckAllowed:facts?.sourceInvalid===true&&!unresolved.has(record.attempt?.status)&&!blocking.has(record.attempt?.code)}:{}),unavailableReason:facts?.sourceInvalid?'已保存的固定安装包暂时无法读取，可以重新核对原来源后恢复。':record.unavailableReason,installation});
 };
 // Catalog revisions get separate durable records. Never bypass a still
 // unresolved earlier attempt merely because the editorial entry changed.
 const retainedAttempt=async(kind,entryId,signal,except,packageName)=>{
  let rows;try{rows=await store.list();}catch{fail('HISTORY_STORAGE_FAILED');}
  for(const row of rows){
   let value;try{value=JSON.parse(row.serialized);}catch{continue;}
   if((value.collection!==kind||value.entryId!==entryId)&&(!packageName||packageFor(value.candidate)!==packageName)||value.id===except||!value.attempt||!unresolved.has(value.attempt.status)&&!blocking.has(value.attempt.code))continue;
   const record=await load(value.id),shown=project(record,await observe(record,signal));
   if(shown.installation.status!=='ready')return record;
  }
  return null;
 };
 const lookup=inputValue=>{const value=input(inputValue,['detailId','signal']);if(!validId(value.detailId))fail('INVALID_INPUT');check(value.signal);return{...value,signal:combined(value.signal)};};
 const runInstall=async(id,signal)=>{
  abort(signal);let record=await load(id);const facts=await observe(record,signal),initial=project(record,facts);
  if(['unavailable','ready','installed-local','conflict','unknown'].includes(initial.installation.status)||unresolved.has(record.attempt?.status)||blocking.has(record.attempt?.code))return initial;
  if(await retainedAttempt(record.collection,record.entryId,signal,id,packageFor(record.candidate)))return{...initial,installation:{...initial.installation,status:'unknown',code:'PLUGIN_INSTALL_PENDING',message:'此插件上次安装尚未确认，请先核对原安装记录；没有提交另一份安装。'}};
  let reinstall=false;
  if(record.attempt?.status==='ready'&&absent(facts)){
   if(record.archivedAttempts.length>=MAX_ARCHIVED_ATTEMPTS)fail('HISTORY_CAPACITY');
   let matches=false;
   try{
    const fresh=await resolveDetail({collection:record.collection,entryId:record.entryId,signal});abort(signal);
    publicEntry(fresh?.entry,record.collection,record.entryId);
    const candidate=checkedCandidate(fresh?.candidate);matches=candidate!==null&&installIdentity(candidate)===installIdentity(record.candidate);
   }catch{abort(signal);}
   if(!matches)return{...initial,installation:{...initial.installation,status:'conflict',code:'PLUGIN_INSTALL_CONFLICT',message:'重新安装前，固定来源或版本尚未重新核对一致；没有再次安装，也没有替换原选择。'}};
   const current=await observe(record,signal);if(!absent(current))return project(record,current);
   reinstall=true;
  }
  record=await save({...record,...(reinstall?{archivedAttempts:[...record.archivedAttempts,clone(record.attempt)]}:{}),attempt:{operationId:id,requestId:reinstall?randomUUID():record.attempt?.requestId??randomUUID(),status:'installing',plugins:reinstall?[]:record.attempt?.plugins??[]}});
  abort(signal);shared.activeClaims.add(id);
  try{
   const result=await preparePlugins({candidates:[clone(record.candidate)],operationId:id,previous:clone(record.attempt.plugins),signal,save:async plugins=>{
    abort(signal);record=await save({...record,attempt:{...record.attempt,plugins:receipts(plugins,record.candidate)}});
   }});
   abort(signal);
   const plugins=receipts(result?.plugins,record.candidate);
   if(result?.status!=='ready'||plugins.length!==1||plugins[0].status!=='ready'||['installed','enabled','active'].some(key=>plugins[0][key]!==true)||plugins[0].application!==undefined&&plugins[0].application!=='applied')fail('PLUGIN_INSTALL_INVALID');
   record=await save({...record,attempt:{...record.attempt,status:'ready',plugins}});
  }catch(error){
   if(error?.code==='HISTORY_STORAGE_FAILED')throw error;
   const code=known.has(error?.code)?error.code:'PLUGIN_INSTALL_PENDING';
   // An aborted or lost result may have committed; do not convert it into a fresh retry.
   const status=['PLUGIN_INSTALL_PENDING','MODEL_ABORTED'].includes(code)?'unknown':'failed';
   record=await save({...record,attempt:{...record.attempt,status,code}});
   abort(signal);
  }finally{shared.activeClaims.delete(id);}
  return project(record,await observe(record,signal));
 };
 const recheckFixed=async(args,signal)=>{
  const inspect=async()=>{
   const record=await load(args.detailId);if(record.collection!==args.collection||record.entryId!==args.entryId)fail('INVALID_INPUT');
   const facts=await observe(record,signal),shown=project(record,facts);
   if(!record.candidate||unresolved.has(record.attempt?.status)||blocking.has(record.attempt?.code)||!facts?.sourceInvalid)return{record,shown,recheck:false};
   if(await retainedAttempt(record.collection,record.entryId,signal,record.id,packageFor(record.candidate)))return{record,recheck:false,shown:{...shown,sourceRecheckAllowed:false,installation:{...shown.installation,status:'unknown',code:'PLUGIN_INSTALL_PENDING',message:'此插件上次安装尚未确认，请先核对原安装记录；没有重新读取来源或提交另一份安装。'}}};
   return{record,shown,recheck:true};
  };
  const initial=await inspect();if(!initial.recheck)return initial.shown;
  return serial(idFor(initial.record.collection,initial.record.entryId),()=>serial('package:'+packageFor(initial.record.candidate),async()=>{
   const current=await inspect();if(!current.recheck)return current.shown;
   let fresh;
   try{fresh=await resolveDetail({collection:current.record.collection,entryId:current.record.entryId,signal});abort(signal);}
   catch(error){abort(signal);if(error instanceof FinderError)throw error;fail('PLUGIN_INSTALL_UNAVAILABLE');}
   publicEntry(fresh?.entry,current.record.collection,current.record.entryId);
   const candidate=checkedCandidate(fresh?.candidate);if(!candidate)fail('PLUGIN_INSTALL_UNAVAILABLE');
   if(installIdentity(candidate)!==installIdentity(current.record.candidate))fail('PLUGIN_INSTALL_CONFLICT');
   // The resolver can restore the same immutable cache bytes. The original
   // selected candidate, entry and all attempt receipts remain untouched.
   return project(current.record,await observe(current.record,signal));
  }));
 };
 return{
  async detail(value={}){
   const args=input(value,['collection','entryId','signal','recheck','detailId']);if(!collection(args.collection)||!clean(args.entryId,2048)||args.recheck!==undefined&&typeof args.recheck!=='boolean'||args.recheck===true&&!validId(args.detailId)||args.detailId!==undefined&&args.recheck!==true)return Promise.reject(new FinderError('INVALID_INPUT'));
   check(args.signal);if(args.recheck===true)return track(()=>recheckFixed(args,combined(args.signal)));
   check(args.signal);const signal=combined(args.signal),catalogRevision=typeof entryRevision==='function'?entryRevision({collection:args.collection,entryId:args.entryId}):undefined;
   if(catalogRevision!==undefined&&!/^[a-f0-9]{64}$/.test(catalogRevision))return Promise.reject(new FinderError('INVALID_INPUT'));
   const id=idFor(args.collection,args.entryId,catalogRevision);
   return track(async()=>{
    const retained=await retainedAttempt(args.collection,args.entryId,signal,id);if(retained)return project(retained,await observe(retained,signal));
    let record=await load(id,true);
    if(record&&(record.candidate||record.attempt))return project(record,await observe(record,signal));
    return serial(idFor(args.collection,args.entryId),async()=>{
     const retained=await retainedAttempt(args.collection,args.entryId,signal,id);if(retained)return project(retained,await observe(retained,signal));
     const existing=await load(id,true);if(existing&&(existing.candidate||existing.attempt))return project(existing,await observe(existing,signal));abort(signal);
     const resolved=await resolveDetail({collection:args.collection,entryId:args.entryId,signal});abort(signal);
     if(!object(resolved)||!clean(resolved.unavailableReason??'',3000,true))fail('PLUGIN_INSTALL_INVALID');
     record=await save({version:1,id,...(catalogRevision?{catalogRevision}:{}),collection:args.collection,entryId:args.entryId,entry:publicEntry(resolved.entry,args.collection,args.entryId),candidate:checkedCandidate(resolved.candidate),unavailableReason:resolved.unavailableReason??'',attempt:null,createdAt:existing?.createdAt??stamp()});
     return project(record,await observe(record,signal));
    });
   });
  },
  async install(value={}){
   const args=lookup(value),existing=shared.installs.get(args.detailId);
   if(existing)return track(()=>waitFor(existing,args.signal));
   const job=track(async()=>{const record=await load(args.detailId);return serial(idFor(record.collection,record.entryId),()=>serial('package:'+packageFor(record.candidate),()=>runInstall(args.detailId,args.signal)));});shared.installs.set(args.detailId,job);
   job.then(()=>{if(shared.installs.get(args.detailId)===job)shared.installs.delete(args.detailId);},()=>{if(shared.installs.get(args.detailId)===job)shared.installs.delete(args.detailId);});
   return job;
  },
  async status(value={}){const args=lookup(value);return track(async()=>{const record=await load(args.detailId);return project(record,await observe(record,args.signal));});},
  close(){if(closing)return closing;closed=true;lifetime.abort();closing=Promise.allSettled([...pending]).then(()=>undefined);return closing;},
 };
}
