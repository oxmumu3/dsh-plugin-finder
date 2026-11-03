import {createHash,randomUUID} from 'node:crypto';
import {lstat,realpath,readdir,readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FinderError} from './contracts.js';
import {withPluginInstallationLock} from './plugin-installation.js';

const clean=(v,max=4000)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/u.test(v);
// Names are verified rc.3 Context services, never identifiers copied from an
// arbitrary plugin error. A syntactically valid string can still be a secret.
const knownSdkServices=new Set(['webServer','connection','tools','storageDomain','workingDirectory','workspaceRegistry','agents','sessions','subagents','llm','systemPrompt','sandboxPolicy','approval','typert','sessionQuery']);
function safeFailureHint(value){
  return value?.kind==='missing-injection'&&knownSdkServices.has(value.service)
    ?{kind:'missing-injection',service:value.service}:undefined;
}
function missingInjectionHint(result){
  const diagnostic=result?.error?.diagnostic;
  if(result?.application!=='failed'||result?.error?.code!=='operation-error'||typeof diagnostic!=='string'||diagnostic.length>16000)return;
  const matches=[...diagnostic.matchAll(/cannot get property "([A-Za-z][A-Za-z0-9]{0,79})" without inject/g)];
  if(matches.length===1)return safeFailureHint({kind:'missing-injection',service:matches[0][1]});
}
const fail=(code,hint)=>{const error=new FinderError(code),failureHint=safeFailureHint(hint);if(failureHint)error.failureHint=failureHint;throw error;};
const namePattern=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const versionPattern=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const within=(root,file)=>{const relative=path.relative(root,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
const managerApplications=new Set(['applied','restart-required','overridden','failed','cancelled']);
const managerErrorCodes=new Set(['unknown-plugin','invalid-spec','already-installed','ambiguous-install','not-bundle','not-removable','stop-profile','bundle-in-use','stale-approval','incompatible-version','operation-error']);
const managerFacts=result=>{const failureHint=missingInjectionHint(result);return{...(managerApplications.has(result?.application)?{application:result.application}:{}),...(managerErrorCodes.has(result?.error?.code)?{managementCode:result.error.code}:{}),...(['install','enable','remove'].includes(result?.stage)?{managementStage:result.stage}:{}),...(failureHint?{failureHint}:{})};};
const developmentNames=new Set(['node_modules','.git','.hg','.svn','.DS_Store','npm-debug.log','package-lock.json','pnpm-lock.yaml','yarn.lock','.npmignore','.gitignore']);
function publicationSelection(manifest){
  let patterns=null;
  if(manifest.files!==undefined){
    if(!Array.isArray(manifest.files)||manifest.files.length>128||typeof path.matchesGlob!=='function')fail('PLUGIN_INSTALL_INVALID');
    patterns=manifest.files.map(value=>{
      if(!clean(value,1000)||value.includes('\\'))fail('PLUGIN_INSTALL_INVALID');
      const negative=value.startsWith('!'),raw=negative?value.slice(1):value;
      if(!raw||path.isAbsolute(raw)||raw.split('/').includes('..'))fail('PLUGIN_INSTALL_INVALID');
      return{negative,value:raw.replace(/^\.\//,'').replace(/\/$/,'')};
    });
  }
  const matches=(relative,pattern)=>{
    const pieces=relative.split('/');
    for(let count=pieces.length;count>0;count--)if(path.matchesGlob(pieces.slice(0,count).join(path.sep),pattern.split('/').join(path.sep)))return true;
    return false;
  };
  const canDescend=(relative,pattern)=>{
    const names=relative.split('/'),parts=pattern.split('/');
    const pending=[[0,0]],seen=new Set();
    while(pending.length){
      const [i,j]=pending.pop(),key=i+':'+j;if(seen.has(key))continue;seen.add(key);
      if(i===names.length||j===parts.length)return true;
      if(parts[j]==='**'){pending.push([i,j+1],[i+1,j]);continue;}
      if(path.matchesGlob(names[i],parts[j]))pending.push([i+1,j+1]);
    }
    return false;
  };
  const ignored=relative=>relative.split('/').some(name=>developmentNames.has(name)||name.startsWith('.finder-install-')||/\.(?:tgz|tar\.gz)$/i.test(name));
  const metadata=relative=>!relative.includes('/')&&(relative==='package.json'||/^(?:readme|licen[cs]e|copying)(?:[.-].*)?$/i.test(relative));
  const positives=patterns?.filter(item=>!item.negative).map(item=>item.value),negatives=patterns?.filter(item=>item.negative).map(item=>item.value);
  const excluded=relative=>ignored(relative)||negatives?.some(pattern=>matches(relative,pattern)||path.matchesGlob(relative.split('/').join(path.sep)+path.sep,pattern.split('/').join(path.sep)));
  return{
    include:relative=>!excluded(relative)&&(metadata(relative)||patterns===null||positives.some(pattern=>matches(relative,pattern))),
    descend:relative=>!excluded(relative)&&(patterns===null||positives.some(pattern=>canDescend(relative,pattern))),
  };
}

/** Inspect only publishable regular bytes; development dependencies and VCS state never enter the snapshot. */
export async function inspectGeneratedArtifact(artifact,caller){
  const input=artifact?.structured??artifact;
  if(!clean(caller?.directory)||!clean(input?.pluginDirectory))fail('PLUGIN_INSTALL_INVALID');
  const root=await realpath(caller.directory).catch(()=>fail('PLUGIN_INSTALL_INVALID'));
  const originalRoot=path.resolve(caller.directory),requested=path.resolve(originalRoot,input.pluginDirectory);
  const relative=within(originalRoot,requested)?path.relative(originalRoot,requested):within(root,requested)?path.relative(root,requested):null;
  if(relative===null)fail('PLUGIN_INSTALL_INVALID');
  const directory=path.join(root,relative);
  // Reject aliases at every component, not merely the final source directory.
  let cursor=root;
  for(const part of path.relative(root,directory).split(path.sep)){
    cursor=path.join(cursor,part);const stat=await lstat(cursor).catch(()=>fail('PLUGIN_INSTALL_INVALID'));
    if(stat.isSymbolicLink()||!stat.isDirectory())fail('PLUGIN_INSTALL_INVALID');
  }
  if(await realpath(directory).catch(()=>null)!==directory)fail('PLUGIN_INSTALL_INVALID');
  const readRegular=async(file,maxBytes,initial)=>{
    const stat=initial??await lstat(file).catch(()=>fail('PLUGIN_INSTALL_INVALID'));
    if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1||stat.size>maxBytes)fail('PLUGIN_INSTALL_INVALID');
    const bytes=await readFile(file).catch(()=>fail('PLUGIN_INSTALL_INVALID')),after=await lstat(file).catch(()=>fail('PLUGIN_INSTALL_INVALID'));
    if(bytes.length!==stat.size||after.ino!==stat.ino||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.isSymbolicLink()||after.nlink!==1)fail('PLUGIN_INSTALL_CONFLICT');
    return bytes;
  };
  const manifestBytes=await readRegular(path.join(directory,'package.json'),256000);
  let manifest;try{manifest=JSON.parse(manifestBytes);}catch{fail('PLUGIN_INSTALL_INVALID');}
  const patch=manifest?.dsh?.bundle?.patch;
  if(!clean(manifest?.name,214)||!namePattern.test(manifest.name)||!clean(manifest?.version,120)||!versionPattern.test(manifest.version)||manifest?.dsh?.manifestVersion!==undefined&&manifest.dsh.manifestVersion!==1||!clean(patch)||path.isAbsolute(patch)||!within(directory,path.resolve(directory,patch)))fail('PLUGIN_INSTALL_INVALID');
  const selection=publicationSelection(manifest);
  const hash=createHash('sha256'),snapshot=[];let files=0,total=0,visited=0;
  const walk=async(base,depth=0)=>{
    if(depth>32)fail('PLUGIN_INSTALL_INVALID');
    const entries=await readdir(base).catch(()=>fail('PLUGIN_INSTALL_INVALID'));
    for(const name of entries.sort()){
      if(++visited>10000)fail('PLUGIN_INSTALL_INVALID');
      const file=path.join(base,name),relative=path.relative(directory,file).split(path.sep).join('/'),included=selection.include(relative),descend=selection.descend(relative);
      if(!included&&!descend)continue;
      const stat=await lstat(file).catch(()=>fail('PLUGIN_INSTALL_INVALID'));
      if(stat.isSymbolicLink())fail('PLUGIN_INSTALL_INVALID');
      if(stat.isDirectory()){if(descend)await walk(file,depth+1);continue;}
      if(!included)continue;
      if(!stat.isFile()||stat.nlink!==1||++files>5000||(total+=stat.size)>64*1024*1024)fail('PLUGIN_INSTALL_INVALID');
      const bytes=await readRegular(file,64*1024*1024,stat);
      hash.update(path.relative(directory,file));hash.update('\0');hash.update(createHash('sha256').update(bytes).digest());
      snapshot.push({name:path.relative(directory,file).split(path.sep).join('/'),bytes});
    }
  };
  await walk(directory);
  const capturedManifest=snapshot.find(file=>file.name==='package.json');if(!capturedManifest||!capturedManifest.bytes.equals(manifestBytes))fail('PLUGIN_INSTALL_CONFLICT');
  if(!snapshot.some(file=>file.name===path.relative(directory,path.resolve(directory,patch)).split(path.sep).join('/')))fail('PLUGIN_INSTALL_INVALID');
  const patchStat=await lstat(path.resolve(directory,patch)).catch(()=>fail('PLUGIN_INSTALL_INVALID'));if(!patchStat.isFile()||patchStat.isSymbolicLink())fail('PLUGIN_INSTALL_INVALID');
  return{packageName:manifest.name,version:manifest.version,directory,root,fingerprint:hash.digest('hex'),files,snapshot};
}

const sameArtifact=(a,b)=>['directory','packageName','version','fingerprint'].every(key=>a?.[key]===b?.[key]);
const relatesToArtifact=(moduleName,item)=>{
  if(moduleName===item.packageName||moduleName.startsWith(item.packageName+'/'))return true;
  let file=moduleName;
  if(moduleName.startsWith('file:'))try{file=fileURLToPath(moduleName);}catch{fail('PLUGIN_INSTALL_UNAVAILABLE');}
  if(!path.isAbsolute(file))return false;
  const resolved=path.resolve(file),modules=path.sep+'node_modules'+path.sep+item.packageName.split('/').join(path.sep);
  return [item.directory,item.sourceDirectory].filter(Boolean).some(directory=>resolved===directory||within(directory,resolved))||resolved.endsWith(modules)||resolved.includes(modules+path.sep);
};

/** A bounded point-in-time absence observation, not code approval or proof of historical non-installation. */
export function createGeneratedArtifactReviewer(ctx,{signal:lifetime,clock=()=>new Date()}={}){
  return async({artifact,caller,expected,signal}={})=>{
    const signals=[signal,lifetime].filter(Boolean),abort=signals.length?AbortSignal.any(signals):undefined;
    const check=()=>{if(abort?.aborted)fail('MODEL_ABORTED');};check();
    if(!clean(caller?.sessionId,200)||!clean(caller?.workspaceId,200))fail('PLUGIN_INSTALL_INVALID');
    let manager;try{manager=ctx.get('pluginManager',false);}catch{}
    if(!manager||typeof manager.listBundles!=='function'||typeof manager.listPlugins!=='function')fail('PLUGIN_INSTALL_UNAVAILABLE');
    return withPluginInstallationLock(manager,'review:'+randomUUID(),async()=>{
      check();let item;
      try{item=await inspectGeneratedArtifact(artifact,caller);}catch(error){if(error instanceof FinderError)throw error;fail('PLUGIN_INSTALL_INVALID');}check();
      const input=artifact?.structured??artifact;
      item={...item,sourceDirectory:path.resolve(caller.directory,input.pluginDirectory)};
      if(expected!==undefined&&(!sameArtifact(expected,item)||expected.root!==undefined&&expected.root!==item.root))fail('PLUGIN_INSTALL_CONFLICT');
      let bundles,plugins;
      try{[bundles,plugins]=await Promise.all([manager.listBundles(),manager.listPlugins()]);}catch{check();fail('PLUGIN_INSTALL_UNAVAILABLE');}check();
      if(!Array.isArray(bundles)||!Array.isArray(plugins))fail('PLUGIN_INSTALL_UNAVAILABLE');
      for(const bundle of bundles){
        if(!clean(bundle?.name,214))fail('PLUGIN_INSTALL_UNAVAILABLE');
        if(bundle.name===item.packageName)fail('PLUGIN_INSTALL_CONFLICT');
        if(bundle.rows!==undefined){
          if(!Array.isArray(bundle.rows))fail('PLUGIN_INSTALL_UNAVAILABLE');
          for(const row of bundle.rows){if(!clean(row?.moduleName,4000))fail('PLUGIN_INSTALL_UNAVAILABLE');if(relatesToArtifact(row.moduleName,item))fail('PLUGIN_INSTALL_CONFLICT');}
        }
      }
      for(const plugin of plugins){if(!clean(plugin?.moduleName,4000))fail('PLUGIN_INSTALL_UNAVAILABLE');if(relatesToArtifact(plugin.moduleName,item))fail('PLUGIN_INSTALL_CONFLICT');}
      let current;
      try{current=await inspectGeneratedArtifact(artifact,caller);}catch(error){if(error instanceof FinderError)throw error;fail('PLUGIN_INSTALL_INVALID');}check();
      if(!sameArtifact(item,current)||item.root!==current.root)fail('PLUGIN_INSTALL_CONFLICT');
      let observedAt;try{observedAt=clock().toISOString();}catch{fail('PLUGIN_INSTALL_UNAVAILABLE');}
      return{kind:'observed_absent',packageName:item.packageName,version:item.version,directory:item.directory,root:item.root,fingerprint:item.fingerprint,observedAt};
    });
  };
}

function preinstallSnapshot(snapshot,caller){
  const review=snapshot?.review;
  if(snapshot?.phase!=='preinstall'||snapshot.kind!=='caller_reported_review'||snapshot.preparation!==undefined||snapshot.creator?.status!=='completed'
    ||snapshot.sessionId!==caller.sessionId||snapshot.workspaceId!==caller.workspaceId||snapshot.directory!==caller.directory
    ||!clean(snapshot.requestId,200)||!Number.isSafeInteger(snapshot.repairNumber)||snapshot.repairNumber<1||snapshot.repairNumber>2
    ||review?.kind!=='observed_absent'||review.root!==caller.directory||!clean(review.directory)||!within(caller.directory,review.directory)
    ||!clean(review.packageName,214)||!namePattern.test(review.packageName)||!clean(review.version,120)||!versionPattern.test(review.version)
    ||!/^[a-f0-9]{64}$/.test(review.fingerprint??'')||!clean(review.observedAt,100)||!Number.isFinite(Date.parse(review.observedAt)))return false;
  try{const artifact=JSON.parse(snapshot.creator.result),input=artifact?.structured??artifact;return clean(input?.pluginDirectory)&&path.resolve(caller.directory,input.pluginDirectory)===review.directory;}catch{return false;}
}

// Build only regular files from bytes already inspected. No package scripts, shell or generated code run here.
function archiveBytes(snapshot){
  const chunks=[];
  for(const file of snapshot){
    const full='package/'+file.name;let name=full,prefix='';
    if(Buffer.byteLength(name)>100){const candidates=[...full.matchAll(/\//g)].map(match=>match.index).reverse();const split=candidates.find(index=>Buffer.byteLength(full.slice(0,index))<=155&&Buffer.byteLength(full.slice(index+1))<=100);if(split===undefined)fail('PLUGIN_INSTALL_INVALID');prefix=full.slice(0,split);name=full.slice(split+1);}
    const header=Buffer.alloc(512),put=(text,start,length)=>header.write(text,start,length,'utf8');
    put(name,0,100);put('0000644\0',100,8);put('0000000\0',108,8);put('0000000\0',116,8);
    put(file.bytes.length.toString(8).padStart(11,'0')+'\0',124,12);put('00000000000\0',136,12);header.fill(32,148,156);header[156]=48;put('ustar\0',257,6);put('00',263,2);put(prefix,345,155);
    put([...header].reduce((sum,byte)=>sum+byte,0).toString(8).padStart(6,'0')+'\0 ',148,8);
    chunks.push(header,file.bytes,Buffer.alloc((512-file.bytes.length%512)%512));
  }
  return gzipSync(Buffer.concat([...chunks,Buffer.alloc(1024)]));
}
async function createArchive(item){
  const bytes=archiveBytes(item.snapshot),directory=await mkdtemp(path.join(item.root,'.finder-install-'));
  const file=path.join(directory,'plugin.tgz');await writeFile(file,bytes,{flag:'wx',mode:0o400});
  return{spec:'file:'+file,archiveHash:createHash('sha256').update(bytes).digest('hex')};
}
async function verifyArchive(row,root){
  if(!clean(row?.spec)||!row.spec.startsWith('file:')||!/^([a-f0-9]{64})$/.test(row.archiveHash??''))fail('PLUGIN_INSTALL_CONFLICT');
  const file=row.spec.slice(5);if(!within(root,file))fail('PLUGIN_INSTALL_CONFLICT');
  const relative=path.relative(root,file).split(path.sep);let cursor=root;
  for(let i=0;i<relative.length;i++){cursor=path.join(cursor,relative[i]);const stat=await lstat(cursor).catch(()=>fail('PLUGIN_INSTALL_CONFLICT'));if(stat.isSymbolicLink()||i<relative.length-1&&!stat.isDirectory()||i===relative.length-1&&(!stat.isFile()||stat.nlink!==1||stat.size>70*1024*1024))fail('PLUGIN_INSTALL_CONFLICT');}
  const bytes=await readFile(file).catch(()=>fail('PLUGIN_INSTALL_CONFLICT'));if(createHash('sha256').update(bytes).digest('hex')!==row.archiveHash)fail('PLUGIN_INSTALL_CONFLICT');
}

const retirementStatuses=new Set(['unattempted','disabling','disabled','unknown','blocked']);
const quiescent=entry=>entry?.fiberPhase==='failed'||entry?.fiberPhase===null&&entry.enabled===false;

/**
 * A reversible cleanup, never a claim of CAS: the official manager has no CAS
 * argument. Only our profile lock, a durable single-attempt intent and exact
 * before/after inventories fence this operation. Unknown attempts are observed
 * again, never issued again. A cleanup problem cannot invalidate a ready tool.
 */
async function retireSuperseded({manager,item,caller,superseded,previous,persist,check}){
  // These records preserve reviewed source, not an installation receipt or ownership of any live bundle.
  superseded=superseded.filter(snapshot=>!preinstallSnapshot(snapshot,caller));
  if(!superseded.length)return;
  const plans=superseded.map(snapshot=>{
    const receipts=snapshot?.preparation?.plugins,old=Array.isArray(receipts)&&receipts.length===1?receipts[0]:undefined;
    const validName=clean(old?.packageName,214)&&namePattern.test(old.packageName);
    const base={...(validName?{packageName:old.packageName}:{}),...(clean(old?.version,120)&&versionPattern.test(old.version)?{version:old.version}:{}),...(clean(old?.spec)?{spec:old.spec}:{}),...(/^[a-f0-9]{64}$/.test(old?.archiveHash??'')?{archiveHash:old.archiveHash}:{})};
    const prior=previous?.find(row=>row.packageName===base.packageName&&row.version===base.version&&row.spec===base.spec&&row.archiveHash===base.archiveHash);
    return{snapshot,old,prior,base};
  });
  const rows=plans.map(({base,prior})=>({...base,status:retirementStatuses.has(prior?.status)?prior.status:'unattempted',...(clean(prior?.attemptId,200)?{attemptId:prior.attemptId}:{}),...(Array.isArray(prior?.entryIds)&&prior.entryIds.length<=128&&prior.entryIds.every(id=>clean(id,500))?{entryIds:[...prior.entryIds]}:{})}));
  const record=async(index,patch)=>{rows[index]={...rows[index],...patch};await persist({retirements:structuredClone(rows)});};
  for(let index=0;index<plans.length;index++){
    const {snapshot,old,prior}=plans[index];
    if(prior?.status==='blocked')continue;
    const blocked=()=>record(index,{status:'blocked',code:'PLUGIN_RETIREMENT_MANUAL_REQUIRED'});
    const owned=old?.initiallyAbsent===true&&old.status==='failed'&&old.application==='failed'&&old.active!==true
      &&snapshot.creator?.status==='completed'
      // Service snapshots keep the outer preparation "pending" when its
      // plugin receipt has an explicit failed application. That outer label
      // is not evidence of an unknown manager outcome; the row above is.
      &&['failed','pending'].includes(snapshot.preparation.status)&&snapshot.sessionId===caller.sessionId&&snapshot.workspaceId===caller.workspaceId
      &&snapshot.directory===caller.directory&&snapshot.directory===item.root&&clean(snapshot.requestId,200)
      &&Number.isSafeInteger(snapshot.repairNumber)&&snapshot.repairNumber>=0&&snapshot.repairNumber<=2
      &&old.packageName!==item.packageName&&clean(old.packageName,214)&&namePattern.test(old.packageName)
      &&clean(old.version,120)&&versionPattern.test(old.version)&&clean(old.sourceDirectory)&&within(item.root,old.sourceDirectory)
      &&/^[a-f0-9]{64}$/.test(old.fingerprint??'')&&clean(old.requestId,200)
      &&plans.filter(plan=>plan.old?.packageName===old.packageName).length===1;
    if(!owned){await blocked();continue;}
    // Only an exclusive archive generated directly inside this same workspace
    // is proof of the installed immutable source. Never infer ownership from a
    // mutable link, a matching display name, or a legacy failed receipt.
    const archive=typeof old.spec==='string'&&old.spec.startsWith('file:')?old.spec.slice(5):'';
    if(!path.isAbsolute(archive)||path.dirname(path.dirname(archive))!==item.root||path.basename(archive)!=='plugin.tgz'
      ||!/^\.finder-install-[A-Za-z0-9_-]{6,}$/.test(path.basename(path.dirname(archive)))){await blocked();continue;}
    try{await verifyArchive(old,item.root);}catch{await blocked();continue;}
    const observe=async()=>{
      const [bundles,plugins]=await Promise.all([manager.listBundles(),manager.listPlugins()]);
      if(!Array.isArray(bundles)||!Array.isArray(plugins))return;
      const matches=bundles.filter(bundle=>bundle?.name===old.packageName);
      if(matches.length!==1)return;
      const bundle=matches[0];
      if(bundle.error||bundle.version!==old.version||bundle.source!==old.spec||bundle.installed!==true||bundle.availability!=='profile')return;
      const declared=bundle.rows;
      if(!Array.isArray(declared)||!declared.length||declared.length>128||declared.some(entry=>!clean(entry.moduleName,214)
        ||entry.moduleName!==old.packageName&&!entry.moduleName.startsWith(old.packageName+'/')))return;
      const modules=new Set(declared.map(entry=>entry.moduleName)),related=plugins.filter(entry=>modules.has(entry?.moduleName));
      if(related.some(entry=>!quiescent(entry)))return;
      if(bundle.enabled===false)return{disabled:true,entryIds:rows[index].entryIds??[]};
      const ids=declared.map(entry=>entry.entryId);
      if(bundle.enabled!==true||ids.some(id=>!clean(id,500))||new Set(ids).size!==ids.length||related.length!==declared.length)return;
      if(!declared.every(entry=>related.filter(plugin=>plugin.entryId===entry.entryId&&plugin.moduleName===entry.moduleName).length===1))return;
      return{disabled:false,entryIds:ids};
    };
    let before;try{before=await observe();}catch{}
    if(!before){await blocked();continue;}
    if(before.disabled){await record(index,{status:'disabled',code:'PLUGIN_RETIREMENT_CONFIRMED'});continue;}
    if(prior&&['disabling','unknown','disabled'].includes(prior.status)){
      await record(index,{status:prior.status==='disabled'?'blocked':'unknown',code:'PLUGIN_RETIREMENT_READBACK_REQUIRED'});continue;
    }
    if(typeof manager.setBundleEnabled!=='function'){await blocked();continue;}
    check();
    await record(index,{status:'disabling',attemptId:randomUUID(),entryIds:before.entryIds,code:'PLUGIN_RETIREMENT_PENDING'});
    check();
    // Re-read after the durable write yielded. This narrows interleaving with
    // external profile controls; it is deliberately not described as atomic.
    let current;try{await verifyArchive(old,item.root);current=await observe();}catch{}
    if(!current||current.disabled||JSON.stringify(current.entryIds)!==JSON.stringify(before.entryIds)){
      await record(index,{status:current?.disabled?'disabled':'blocked',code:current?.disabled?'PLUGIN_RETIREMENT_CONFIRMED':'PLUGIN_RETIREMENT_MANUAL_REQUIRED'});continue;
    }
    let result;
    try{result=await manager.setBundleEnabled(old.packageName,false);}catch{
      await record(index,{status:'unknown',code:'PLUGIN_RETIREMENT_READBACK_REQUIRED'});continue;
    }
    if(result?.application!=='applied'){
      await record(index,{status:'blocked',code:'PLUGIN_RETIREMENT_NOT_APPLIED',...managerFacts(result)});continue;
    }
    let after;try{after=await observe();}catch{}
    await record(index,{status:after?.disabled?'disabled':'unknown',code:after?.disabled?'PLUGIN_RETIREMENT_CONFIRMED':'PLUGIN_RETIREMENT_READBACK_REQUIRED',application:'applied'});
  }
}

/** Same profile lock as catalog installs; creation does not infer code or build approval. */
export function createGeneratedPluginInstaller(ctx,{signal:lifetime}={}){
  return async({artifact,caller,operationId,previous=[],superseded=[],save,signal}={})=>{
    if(!clean(operationId,200)||typeof save!=='function'||!Array.isArray(previous)||previous.length>1||!Array.isArray(superseded)||superseded.length>2)fail('PLUGIN_INSTALL_INVALID');
    const combined=[signal,lifetime].filter(Boolean),abort=combined.length?AbortSignal.any(combined):undefined;
    const check=()=>{if(abort?.aborted)fail('MODEL_ABORTED');};check();
    let item;try{item=await inspectGeneratedArtifact(artifact,caller);}catch(error){if(error instanceof FinderError)throw error;fail('PLUGIN_INSTALL_INVALID');}check();
    if(superseded.some(snapshot=>preinstallSnapshot(snapshot,caller)&&(snapshot.review.packageName===item.packageName||snapshot.review.directory===item.directory)))fail('PLUGIN_INSTALL_CONFLICT');
    let manager;try{manager=ctx.get('pluginManager',false);}catch{}
    if(!manager||!['listBundles','listPlugins','inspect','installBundle'].every(key=>typeof manager[key]==='function'))fail('PLUGIN_INSTALL_UNAVAILABLE');
    // A request never installs the same name from a changed source or revised code silently.
    const old=previous[0];
    if(old&&(['packageName','version','fingerprint'].some(key=>old[key]!==item[key])||old.sourceDirectory!==item.directory||!clean(old.requestId,200)||!['installing','unknown','ready','failed'].includes(old.status)))fail('PLUGIN_INSTALL_CONFLICT');
    return withPluginInstallationLock(manager,'generated:'+operationId,async()=>{
      check();let row=old?structuredClone(old):null;
      const archive=old?{spec:old.spec,archiveHash:old.archiveHash}:await createArchive(item);await verifyArchive(archive,item.root);item={...item,...archive};
      const persist=async patch=>{const next={...(row??{candidateId:item.packageName,packageName:item.packageName,version:item.version,spec:item.spec,archiveHash:item.archiveHash,sourceDirectory:item.directory,fingerprint:item.fingerprint,requestId:randomUUID()}),...patch};if(next.failureHint&&!safeFailureHint(next.failureHint))delete next.failureHint;if(patch.status==='ready')delete next.failureHint;await save([structuredClone(next)]);row=next;return row;};
      const reject=async(code,status='failed',facts={})=>{await persist({status,code,...facts});fail(code,row.failureHint);};
      const ready=async facts=>{
        await persist({status:'ready',installed:true,enabled:true,active:true,source:item.spec,...facts});
        let retirement;
        try{await retireSuperseded({manager,item,caller,superseded,previous:row.retirements,persist,check});}
        catch{retirement={status:'blocked',code:'PLUGIN_RETIREMENT_PERSISTENCE_UNAVAILABLE'};}
        // Disabling an old bundle reloads the profile. Cleanup uncertainty is
        // not a reason to block a still-active replacement, but its pre-reload
        // active observation is not proof of its post-reload state either.
        if(superseded.length){
          let current;
          try{current=await inventory();}catch(error){
            if(error instanceof FinderError&&error.code==='PLUGIN_INSTALL_CONFLICT')await reject(error.code);
            await reject('PLUGIN_INSTALL_PENDING','unknown');
          }
          if(!current.active)await reject('PLUGIN_INSTALL_NOT_ACTIVE','failed',{installed:current.exists,enabled:current.enabled===true,active:false});
        }
        check();return{status:'ready',plugins:[structuredClone(row)],...(retirement?{retirement}:{})};
      };
      if(row?.code==='PLUGIN_INSTALL_APPROVAL_REQUIRED')await reject('PLUGIN_INSTALL_APPROVAL_REQUIRED');
      const inventory=async()=>{
        const [bundles,plugins]=await Promise.all([manager.listBundles(),manager.listPlugins()]);if(!Array.isArray(bundles)||!Array.isArray(plugins))fail('PLUGIN_INSTALL_UNAVAILABLE');
        const matches=bundles.filter(bundle=>bundle?.name===item.packageName);if(matches.length>1)fail('PLUGIN_INSTALL_CONFLICT');
        const bundle=matches[0];if(!bundle||bundle.availability==='missing'&&!bundle.installed)return{exists:false,active:false};
        if(bundle.error||bundle.version!==item.version||bundle.source!==item.spec||bundle.availability!=='profile'||bundle.installed!==true)fail('PLUGIN_INSTALL_CONFLICT');
        const declared=Array.isArray(bundle.rows)?bundle.rows:[];
        const active=bundle.enabled===true&&declared.length>0&&declared.every(entry=>{
          const rows=plugins.filter(plugin=>plugin?.entryId===entry.entryId);
          return clean(entry.entryId,500)&&clean(entry.moduleName,214)&&rows.length===1&&rows[0].moduleName===entry.moduleName&&rows[0].enabled===true&&rows[0].fiberPhase==='active';
        });return{exists:true,active,enabled:bundle.enabled===true};
      };
      const mutation=async operation=>{
        let cancellation;
        const stop=()=>{if(typeof manager.cancelInstall==='function'&&!cancellation)cancellation=Promise.resolve(manager.cancelInstall(row.requestId)).catch(()=>undefined);};
        abort?.addEventListener('abort',stop,{once:true});
        try{return await operation();}finally{abort?.removeEventListener('abort',stop);if(cancellation)await cancellation;}
      };
      const resultError=result=>Array.isArray(result?.pendingBuilds)&&result.pendingBuilds.length?'PLUGIN_INSTALL_APPROVAL_REQUIRED':result?.application==='restart-required'?'PLUGIN_INSTALL_RESTART_REQUIRED':result?.application==='cancelled'?'MODEL_ABORTED':'PLUGIN_INSTALL_FAILED';
      const recovering=row&&['installing','unknown'].includes(row.status);
      if(recovering&&typeof manager.waitForInstall==='function'){
        let recovered;try{recovered=await mutation(()=>manager.waitForInstall(row.requestId));}catch{await reject('PLUGIN_INSTALL_PENDING','unknown');}
        if(recovered)await persist(managerFacts(recovered));
        if(recovered&&(recovered.application!=='applied'||recovered.pendingBuilds?.length))await reject(resultError(recovered));
      }
      let state;try{state=await inventory();}catch(error){if(error instanceof FinderError)await reject(error.code);await reject(recovering?'PLUGIN_INSTALL_PENDING':'PLUGIN_INSTALL_UNAVAILABLE',recovering?'unknown':'failed');}
      if(state.active)return ready({});
      if(recovering)await reject('PLUGIN_INSTALL_PENDING','unknown');
      if(state.exists)await reject('PLUGIN_INSTALL_NOT_ACTIVE','failed',{installed:true,enabled:state.enabled,active:false});
      if(row?.status==='ready')await reject('PLUGIN_INSTALL_CONFLICT');
      let inspected;try{inspected=await manager.inspect(item.spec,undefined,abort);}catch{check();await reject('PLUGIN_INSTALL_FAILED');}
      check();if(inspected?.status!=='accepted')await reject(inspected?.problem==='already-installed'?'PLUGIN_INSTALL_CONFLICT':'PLUGIN_INSTALL_FAILED');
      // Inspection may await I/O or approval; recheck exactly the same source before the first mutation.
      // This ownership proof is minted only from our first real absent
      // inventory, immediately before the first mutation. Never retrofit a
      // legacy receipt whose initial inventory was not recorded.
      await persist({status:'installing',requestId:randomUUID(),installed:false,enabled:false,active:false,...(!old?{initiallyAbsent:true}:{})});
      if(abort?.aborted)await reject('MODEL_ABORTED');
      let current;try{current=await inspectGeneratedArtifact(artifact,caller);await verifyArchive(item,item.root);}catch(error){await reject(error instanceof FinderError?error.code:'PLUGIN_INSTALL_INVALID');}
      if(current.fingerprint!==item.fingerprint||current.directory!==item.directory)await reject('PLUGIN_INSTALL_CONFLICT');
      if(abort?.aborted)await reject('MODEL_ABORTED');
      let result;try{result=await mutation(()=>manager.installBundle(item.spec,{enabled:true,saveExact:true,requestId:row.requestId}));}catch{await reject('PLUGIN_INSTALL_PENDING','unknown');}
      await persist(managerFacts(result));
      if(result?.application!=='applied'||result?.pendingBuilds?.length)await reject(resultError(result));
      // Optional manager metadata cannot replace the exact source/version/runtime readback below.
      if(result.bundle!==undefined&&result.bundle!==item.packageName||result.version!==undefined&&result.version!==item.version)await reject('PLUGIN_INSTALL_CONFLICT');
      try{state=await inventory();}catch(error){if(error instanceof FinderError&&error.code==='PLUGIN_INSTALL_CONFLICT')await reject(error.code);await reject('PLUGIN_INSTALL_PENDING','unknown');}
      if(!state.active)await reject('PLUGIN_INSTALL_NOT_ACTIVE','failed',{installed:state.exists,enabled:state.enabled===true,active:false});
      return ready({application:'applied'});
    });
  };
}
