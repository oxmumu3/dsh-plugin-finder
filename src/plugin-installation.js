import {randomUUID} from 'node:crypto';
import {FinderError} from './contracts.js';

const PACKAGE='(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*';
const VERSION='[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?';
const npmSpec=new RegExp('^(?:npm:)?('+PACKAGE+')@('+VERSION+')$');
const packageName=new RegExp('^'+PACKAGE+'$');
const exactVersion=new RegExp('^'+VERSION+'$');
const statuses=new Set(['installing','ready','failed','unknown']);
const applications=new Set(['applied','failed','cancelled','restart-required','overridden']);
const managers=new WeakMap();
const clean=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value);
const clone=value=>structuredClone(value);
const fail=code=>{throw new FinderError(code);};

function identity(candidate){
  if(!candidate||!clean(candidate.id,200)||candidate.evidence?.metadata!=='manifest-checked')fail('PLUGIN_INSTALL_INVALID');
  const install=candidate.install;
  if(!install||!clean(install.spec,2000)||!clean(install.version,120)||!exactVersion.test(install.version))fail('PLUGIN_INSTALL_INVALID');
  if(install.type==='npm'){
    const match=npmSpec.exec(install.spec);
    if(!match||!clean(match[1],214)||match[2]!==install.version||install.registry&&install.registry!=='https://registry.npmjs.org/'&&install.registry!=='https://registry.npmjs.org')fail('PLUGIN_INSTALL_INVALID');
    return{candidateId:candidate.id,packageName:match[1],version:match[2],spec:install.spec,type:'npm'};
  }
  // Discovery's Git candidate id is the checked author's package.json name.
  // Only its exact immutable GitHub source is accepted; display names and URLs from callers are never used.
  if(install.type==='git'&&packageName.test(candidate.id)&&/^[a-f0-9]{40}$/.test(install.commit??'')){
    const match=/^git\+https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\.git#([a-f0-9]{40})(?:&path:\/([A-Za-z0-9_./-]+))?$/.exec(install.spec);
    if(!match||match[3]!==install.commit||match[4]?.split('/').some(part=>!part||part==='.'||part==='..'))fail('PLUGIN_INSTALL_INVALID');
    const manifest=`https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]?match[4]+'/':''}package.json`;
    if(!candidate.evidence.sources?.some(source=>source.kind==='manifest'&&source.url===manifest))fail('PLUGIN_INSTALL_INVALID');
    return{candidateId:candidate.id,packageName:candidate.id,version:install.version,spec:install.spec,type:'git'};
  }
  fail('PLUGIN_INSTALL_INVALID');
}

function previousRows(previous,wanted){
  if(!Array.isArray(previous)||previous.length>wanted.length)fail('PLUGIN_INSTALL_INVALID');
  const seen=new Set();
  return previous.map(row=>{
    const item=wanted.find(value=>value.candidateId===row?.candidateId);
    if(!item||seen.has(item.candidateId)||['spec','packageName','version'].some(key=>row[key]!==item[key])||!clean(row.requestId,200)||!statuses.has(row.status))fail('PLUGIN_INSTALL_INVALID');
    seen.add(item.candidateId);
    const result={candidateId:item.candidateId,spec:item.spec,packageName:item.packageName,version:item.version,requestId:row.requestId,status:row.status};
    for(const key of ['installed','enabled','active'])if(typeof row[key]==='boolean')result[key]=row[key];
    // Persist only a source already proven equal to the expected immutable spec.
    if(row.source===item.spec)result.source=item.spec;
    if(applications.has(row.application))result.application=row.application;
    if(/^PLUGIN_INSTALL_[A-Z_]+$/.test(row.code??'')||row.code==='MODEL_ABORTED')result.code=row.code;
    return result;
  });
}

function matchesSource(bundle,item){
  const source=bundle.source;
  if(item.type==='npm')return typeof source==='string'&&npmSpec.exec(source)?.[1]===item.packageName&&npmSpec.exec(source)?.[2]===item.version;
  return source===item.spec||source===item.spec.slice(4);
}

function resultCode(result){
  if(Array.isArray(result?.pendingBuilds)&&result.pendingBuilds.length)return 'PLUGIN_INSTALL_APPROVAL_REQUIRED';
  if(result?.application==='restart-required')return 'PLUGIN_INSTALL_RESTART_REQUIRED';
  if(result?.application==='cancelled')return 'MODEL_ABORTED';
  if(result?.application==='overridden')return 'PLUGIN_INSTALL_NOT_ACTIVE';
  return 'PLUGIN_INSTALL_FAILED';
}

/** Install only server-selected author-checked candidates through the current Host's official manager.
 * The official mutation affects this profile; the caller separately binds the subsequent use to its workspace.
 * Durable receipt writes precede all mutations. Unknown outcomes are reconciled, never blindly retried.
 */
export function createPluginInstaller(ctx,{signal:lifetime}={}){
  return async({candidates,operationId,previous=[],save,signal}={})=>{
    if(!Array.isArray(candidates)||candidates.length>2||!clean(operationId,200)||typeof save!=='function')fail('PLUGIN_INSTALL_INVALID');
    const wanted=candidates.map(identity);
    if(new Set(wanted.map(row=>row.packageName)).size!==wanted.length||new Set(wanted.map(row=>row.candidateId)).size!==wanted.length)fail('PLUGIN_INSTALL_INVALID');
    const rows=previousRows(previous,wanted);
    const signals=[signal,lifetime].filter(Boolean);
    const combined=signals.length?AbortSignal.any(signals):undefined;
    const checkAbort=()=>{if(combined?.aborted)fail('MODEL_ABORTED');};
    checkAbort();
    if(!wanted.length)return{status:'ready',plugins:[]};
    let manager;try{manager=ctx.get('pluginManager',false);}catch{}
    if(!manager||!['listBundles','listPlugins','installBundle','setBundleEnabled'].every(key=>typeof manager[key]==='function'))fail('PLUGIN_INSTALL_UNAVAILABLE');
    let state=managers.get(manager);
    if(!state){state={tail:Promise.resolve(),operations:new Map()};managers.set(manager,state);}
    const key=operationId+'\0'+JSON.stringify(wanted);
    if(state.operations.has(key)){const result=await state.operations.get(key);checkAbort();return result;}

    const run=async()=>{
      checkAbort();
      const persist=()=>save(clone(rows));
      const setRow=async(item,patch)=>{
        let row=rows.find(row=>row.candidateId===item.candidateId);
        if(!row){row={candidateId:item.candidateId,spec:item.spec,packageName:item.packageName,version:item.version,requestId:randomUUID(),status:'installing'};rows.push(row);}
        Object.assign(row,patch);if(patch.status==='ready'){delete row.code;if(!patch.application)delete row.application;}
        await persist();return row;
      };
      const reject=async(item,code,{status='failed',...facts}={})=>{await setRow(item,{status,code,...facts});fail(code);};
      const inventory=async()=>{
        let bundles,plugins;
        try{[bundles,plugins]=await Promise.all([manager.listBundles(),manager.listPlugins()]);}catch{fail('PLUGIN_INSTALL_UNAVAILABLE');}
        if(!Array.isArray(bundles)||!Array.isArray(plugins))fail('PLUGIN_INSTALL_UNAVAILABLE');
        return{bundles,plugins};
      };
      const observed=(snapshot,item)=>{
        const exact=snapshot.bundles.filter(row=>row?.name===item.packageName);
        if(exact.length>1)return{conflict:true};
        const bundle=exact[0];
        if(!bundle||bundle.availability==='missing'&&!bundle.installed)return{bundle:null};
        if(bundle.error||bundle.version!==item.version||!matchesSource(bundle,item)||bundle.installed!==true||bundle.availability!=='profile')return{bundle,conflict:true};
        const entries=Array.isArray(bundle.rows)?bundle.rows:[];
        const active=entries.length>0&&entries.every(declared=>{
          if(!clean(declared.entryId,500)||!clean(declared.moduleName,214))return false;
          const matches=snapshot.plugins.filter(row=>row?.entryId===declared.entryId);
          return matches.length===1&&matches[0].moduleName===declared.moduleName&&matches[0].enabled===true&&matches[0].fiberPhase==='active';
        });
        return{bundle,active:bundle.enabled===true&&active};
      };
      const ready=(item,value,application)=>setRow(item,{status:'ready',installed:true,enabled:true,active:true,source:item.spec,...(application?{application}:{})});
      const mutation=async(operation,requestId,{cancel=false}={})=>{
        checkAbort();let cancellation;
        const abort=()=>{if(cancel&&typeof manager.cancelInstall==='function'&&!cancellation)cancellation=Promise.resolve().then(()=>manager.cancelInstall(requestId)).catch(()=>undefined);};
        combined?.addEventListener('abort',abort,{once:true});
        try{return await operation();}finally{combined?.removeEventListener('abort',abort);if(cancellation)await cancellation;}
      };

      for(const item of wanted){
        checkAbort();
        let row=rows.find(row=>row.candidateId===item.candidateId);
        // A prior explicit script-approval requirement cannot be cleared by an already-active component.
        // This adapter never grants profile-wide build permissions; the authorized approval flow must resolve it first.
        if(row?.code==='PLUGIN_INSTALL_APPROVAL_REQUIRED')await reject(item,'PLUGIN_INSTALL_APPROVAL_REQUIRED');
        const recovering=row&&['installing','unknown'].includes(row.status);
        let recoveredResult;
        if(recovering&&typeof manager.waitForInstall==='function'){
          try{recoveredResult=await mutation(()=>manager.waitForInstall(row.requestId),row.requestId,{cancel:true});}catch{await reject(item,'PLUGIN_INSTALL_PENDING',{status:'unknown'});}
        }
        let snapshot;
        try{snapshot=await inventory();}catch{await reject(item,recovering?'PLUGIN_INSTALL_PENDING':'PLUGIN_INSTALL_UNAVAILABLE',{status:recovering?'unknown':'failed'});}
        if(recoveredResult&&(recoveredResult.application!=='applied'||Array.isArray(recoveredResult.pendingBuilds)&&recoveredResult.pendingBuilds.length))await reject(item,resultCode(recoveredResult),{...(applications.has(recoveredResult.application)?{application:recoveredResult.application}:{})});
        let value=observed(snapshot,item);
        if(value.conflict)await reject(item,'PLUGIN_INSTALL_CONFLICT');
        if(value.active){await ready(item,value,recoveredResult?.application==='applied'?'applied':undefined);checkAbort();continue;}
        if(recovering){
          // Null is only an expired manager handle, never proof of cancellation or permission to reinstall.
          await reject(item,'PLUGIN_INSTALL_PENDING',{status:'unknown',installed:value.bundle?.installed===true,enabled:value.bundle?.enabled===true,active:false});
        }
        if(value.bundle){
          if(value.bundle.enabled===true)await reject(item,'PLUGIN_INSTALL_NOT_ACTIVE',{installed:true,enabled:true,active:false});
          row=await setRow(item,{status:'installing',installed:true,enabled:false,active:false});
          if(combined?.aborted)await reject(item,'MODEL_ABORTED');
          let result;
          try{result=await mutation(()=>manager.setBundleEnabled(item.packageName,true),row.requestId);}catch{await reject(item,'PLUGIN_INSTALL_PENDING',{status:'unknown'});}
          if(result?.application!=='applied'||Array.isArray(result.pendingBuilds)&&result.pendingBuilds.length)await reject(item,resultCode(result),{...(applications.has(result?.application)?{application:result.application}:{})});
          try{value=observed(await inventory(),item);}catch{await reject(item,'PLUGIN_INSTALL_PENDING',{status:'unknown',application:'applied'});}
          if(value.conflict)await reject(item,'PLUGIN_INSTALL_CONFLICT',{application:'applied'});
          if(!value.active)await reject(item,'PLUGIN_INSTALL_NOT_ACTIVE',{application:'applied',installed:value.bundle?.installed===true,enabled:value.bundle?.enabled===true,active:false});
          await ready(item,value,'applied');checkAbort();continue;
        }
        if(row?.status==='ready')await reject(item,'PLUGIN_INSTALL_CONFLICT');
        if(typeof manager.inspect!=='function')await reject(item,'PLUGIN_INSTALL_UNAVAILABLE');
        let inspected;
        try{inspected=await manager.inspect(item.spec,item.type==='npm'?{registry:'https://registry.npmjs.org/'}:undefined,combined);}catch{checkAbort();await reject(item,'PLUGIN_INSTALL_FAILED');}
        checkAbort();
        if(inspected?.status!=='accepted')await reject(item,inspected?.problem==='already-installed'?'PLUGIN_INSTALL_CONFLICT':'PLUGIN_INSTALL_FAILED');
        if(item.type==='npm'&&(inspected.kind!=='registry'||inspected.name!==item.packageName||inspected.version!==item.version||inspected.bundle!==true))await reject(item,'PLUGIN_INSTALL_CONFLICT');
        if(item.type==='git'&&inspected.kind!=='git')await reject(item,'PLUGIN_INSTALL_CONFLICT');
        row=await setRow(item,{status:'installing',requestId:randomUUID(),installed:false,enabled:false,active:false});
        if(combined?.aborted)await reject(item,'MODEL_ABORTED');
        let result;
        try{result=await mutation(()=>manager.installBundle(item.spec,{enabled:true,saveExact:true,requestId:row.requestId,...(item.type==='npm'?{registry:'https://registry.npmjs.org/'}:{})}),row.requestId,{cancel:true});}catch{await reject(item,'PLUGIN_INSTALL_PENDING',{status:'unknown'});}
        if(result?.application!=='applied'||Array.isArray(result.pendingBuilds)&&result.pendingBuilds.length)await reject(item,resultCode(result),{...(applications.has(result?.application)?{application:result.application}:{})});
        if(result.bundle!==item.packageName||result.version!==item.version)await reject(item,'PLUGIN_INSTALL_CONFLICT',{application:'applied'});
        try{value=observed(await inventory(),item);}catch{await reject(item,'PLUGIN_INSTALL_PENDING',{status:'unknown',application:'applied'});}
        if(value.conflict)await reject(item,'PLUGIN_INSTALL_CONFLICT',{application:'applied'});
        if(!value.active)await reject(item,'PLUGIN_INSTALL_NOT_ACTIVE',{application:'applied',installed:value.bundle?.installed===true,enabled:value.bundle?.enabled===true,active:false});
        await ready(item,value,'applied');checkAbort();
      }
      return{status:'ready',plugins:clone(rows)};
    };
    const pending=state.tail.catch(()=>undefined).then(run);
    state.tail=pending.catch(()=>undefined);state.operations.set(key,pending);
    try{return await pending;}finally{if(state.operations.get(key)===pending)state.operations.delete(key);}
  };
}
