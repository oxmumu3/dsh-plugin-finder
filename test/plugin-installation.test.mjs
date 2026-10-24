import test from 'node:test';
import assert from 'node:assert/strict';
const {createPluginInstaller}=await import('../src/plugin-installation.js').catch(()=>({}));

const copy=value=>structuredClone(value);
const candidate=(name='dsh-example',version='1.2.3')=>({id:name,name:'A display title, never the install identity',install:{type:'npm',spec:`${name}@${version}`,version,registry:'https://registry.npmjs.org/'},evidence:{metadata:'manifest-checked'}});
const bundle=(name='dsh-example',extra={})=>({name,version:'1.2.3',source:`${name}@1.2.3`,installed:true,enabled:true,availability:'profile',rows:[{rowId:name,moduleName:name,entryId:'include:'+name}],...extra});
const runtime=(name='dsh-example',extra={})=>({entryId:'include:'+name,moduleName:name,enabled:true,fiberPhase:'active',...extra});
function fixture({bundles=[],plugins=[],inspect,install,setEnabled,wait}={}){
  const calls=[],saved=[];let currentBundles=copy(bundles),currentPlugins=copy(plugins);
  const manager={
    async listBundles(){calls.push(['bundles']);return copy(currentBundles);},
    async listPlugins(){calls.push(['plugins']);return copy(currentPlugins);},
    async inspect(spec,options){calls.push(['inspect',spec,copy(options)]);return inspect?inspect(spec):{status:'accepted',kind:'registry',name:spec.replace(/^npm:/,'').slice(0,spec.replace(/^npm:/,'').lastIndexOf('@')),version:'1.2.3',bundle:true};},
    async installBundle(spec,options){calls.push(['install',spec,copy(options)]);assert.equal(saved.at(-1)?.find(row=>row.requestId===options.requestId)?.status,'installing','receipt must persist before install');if(install)return install(spec,options,{manager,set});const plain=spec.replace(/^npm:/,''),name=plain.slice(0,plain.lastIndexOf('@'));set([bundle(name)],[runtime(name)]);return{application:'applied',bundle:name,version:'1.2.3',changed:true};},
    async setBundleEnabled(name,enabled){calls.push(['enable',name,enabled]);assert.equal(saved.at(-1)?.find(row=>row.packageName===name)?.status,'installing');if(setEnabled)return setEnabled(name,enabled,{set});set(currentBundles.map(row=>row.name===name?{...row,enabled}:row),[...currentPlugins.filter(row=>row.moduleName!==name),runtime(name)]);return{application:'applied',changed:true};},
    async waitForInstall(id){calls.push(['wait',id]);return wait?wait(id,{set}):null;},
    async cancelInstall(id){calls.push(['cancel',id]);return{status:'cancelled'};},
  };
  function set(nextBundles,nextPlugins){currentBundles=copy(nextBundles);currentPlugins=copy(nextPlugins);}
  assert.equal(typeof createPluginInstaller,'function');
  const prepare=createPluginInstaller({get:(name,required)=>{assert.equal(name,'pluginManager');assert.equal(required,false);return manager;}});
  const input={candidates:[candidate()],operationId:'test-operation',previous:[],save:async rows=>{saved.push(copy(rows));}};
  return{prepare,input,manager,calls,saved,set};
}
const rejectCode=(promise,code)=>assert.rejects(promise,error=>error.name==='FinderError'&&error.code===code);

test('first install is persisted, exact, enabled and verified active before ready',async()=>{
  const f=fixture();const result=await f.prepare(f.input);
  assert.equal(result.status,'ready');assert.equal(result.plugins[0].packageName,'dsh-example');
  assert.deepEqual(f.calls.find(row=>row[0]==='install').slice(1,2),['dsh-example@1.2.3']);
  const options=f.calls.find(row=>row[0]==='install')[2];assert.equal(options.enabled,true);assert.equal(options.saveExact,true);assert.match(options.requestId,/^[0-9a-f-]{36}$/);
  assert.equal(f.saved[0][0].status,'installing');assert.equal(f.saved.at(-1)[0].status,'ready');
  assert.equal(result.plugins[0].installed,true);assert.equal(result.plugins[0].active,true);
});

test('an active exact installation is reused without installing or toggling',async()=>{
  const f=fixture({bundles:[bundle()],plugins:[runtime()]});const result=await f.prepare(f.input);
  assert.equal(result.plugins[0].status,'ready');assert.ok(result.plugins[0].requestId);
  assert.equal(f.calls.filter(row=>['install','inspect','enable'].includes(row[0])).length,0);
});

test('a disabled matching bundle is enabled without reinstalling or touching other bundles',async()=>{
  const other=bundle('another-plugin');const f=fixture({bundles:[bundle('dsh-example',{enabled:false}),other],plugins:[runtime('dsh-example',{enabled:false,fiberPhase:null}),runtime('another-plugin')]});
  await f.prepare(f.input);assert.deepEqual(f.calls.filter(row=>row[0]==='enable'),[['enable','dsh-example',true]]);assert.equal(f.calls.some(row=>row[0]==='install'),false);
  assert.deepEqual((await f.manager.listBundles()).find(row=>row.name==='another-plugin'),other);
});

test('conflicting version or source never removes or replaces an installed plugin',async()=>{
  for(const extra of [{version:'2.0.0'},{source:'file:/private/another-copy'}]){
    const f=fixture({bundles:[bundle('dsh-example',extra)],plugins:[runtime()]});await rejectCode(f.prepare(f.input),'PLUGIN_INSTALL_CONFLICT');assert.equal(f.calls.some(row=>['install','enable'].includes(row[0])),false);
  }
});

test('fresh inventory cannot be substituted by a similarly named or inactive component',async()=>{
  for(const plugins of [[runtime('dsh-example-other')],[runtime('dsh-example',{fiberPhase:'pending'})],[runtime('dsh-example',{moduleName:'another-plugin'})]]){
    const f=fixture({bundles:[bundle()],plugins});await rejectCode(f.prepare(f.input),'PLUGIN_INSTALL_NOT_ACTIVE');assert.equal(f.calls.some(row=>row[0]==='install'),false);
  }
});

test('malformed, unpinned or unverified candidates fail before effects',async()=>{
  for(const value of [candidate('dsh-example','latest'),{...candidate(),evidence:{}},{...candidate(),install:{...candidate().install,spec:'dsh-example@1.2.3; echo BAD'}},{...candidate(),install:{...candidate().install,spec:'https://user:SECRET@example.test/pkg.tgz'}}]){
    const f=fixture();await rejectCode(f.prepare({...f.input,candidates:[value]}),'PLUGIN_INSTALL_INVALID');assert.equal(f.calls.length,0);
  }
});

test('an inspect identity mismatch blocks installation',async()=>{
  const f=fixture({inspect:()=>({status:'accepted',kind:'registry',name:'wrong-package',version:'1.2.3',bundle:true})});await rejectCode(f.prepare(f.input),'PLUGIN_INSTALL_CONFLICT');assert.equal(f.calls.some(row=>row[0]==='install'),false);
});

test('storage failure before install produces no package mutation',async()=>{
  const f=fixture();await assert.rejects(f.prepare({...f.input,save:async()=>{throw Error('storage failed');}}));assert.equal(f.calls.some(row=>['install','enable'].includes(row[0])),false);
});

test('manager failure keeps only bounded safe diagnostics and no ready receipt',async()=>{
  const f=fixture({install:()=>({application:'failed',error:{code:'operation-error',diagnostic:'SECRET=123'},packageResult:{kind:'network',output:'https://user:SECRET@example.test'}})});
  await rejectCode(f.prepare(f.input),'PLUGIN_INSTALL_FAILED');assert.equal(f.saved.at(-1)[0].status,'failed');assert.doesNotMatch(JSON.stringify(f.saved),/SECRET|diagnostic|packageResult/);
});

test('restart required never starts or presents the plugin as ready',async()=>{
  const f=fixture({install:()=>({application:'restart-required',bundle:'dsh-example',version:'1.2.3',restartReason:'host-module'})});await rejectCode(f.prepare(f.input),'PLUGIN_INSTALL_RESTART_REQUIRED');assert.equal(f.saved.at(-1)[0].status,'failed');
});

test('unknown result recovery reconciles a completed install without a second installation',async()=>{
  const f=fixture({bundles:[bundle()],plugins:[runtime()]});const previous=[{candidateId:'dsh-example',packageName:'dsh-example',version:'1.2.3',spec:'dsh-example@1.2.3',requestId:'previous-request',status:'unknown'}];
  const result=await f.prepare({...f.input,previous});assert.equal(result.plugins[0].requestId,'previous-request');assert.equal(result.plugins[0].status,'ready');assert.equal(f.calls.some(row=>row[0]==='install'),false);
});

test('an active installation is recovered with its original request id',async()=>{
  const f=fixture({wait:(id,{set})=>{assert.equal(id,'pending-request');set([bundle()],[runtime()]);return{application:'applied',bundle:'dsh-example',version:'1.2.3'};}});
  const previous=[{candidateId:'dsh-example',packageName:'dsh-example',version:'1.2.3',spec:'dsh-example@1.2.3',requestId:'pending-request',status:'installing'}];
  const result=await f.prepare({...f.input,previous});assert.equal(result.status,'ready');assert.deepEqual(f.calls.filter(row=>row[0]==='wait'),[['wait','pending-request']]);assert.equal(f.calls.some(row=>row[0]==='install'),false);
});

test('null recovery with no matching installed bundle remains unknown and does not reinstall',async()=>{
  const f=fixture();const previous=[{candidateId:'dsh-example',packageName:'dsh-example',version:'1.2.3',spec:'dsh-example@1.2.3',requestId:'uncertain-request',status:'unknown'}];
  await rejectCode(f.prepare({...f.input,previous}),'PLUGIN_INSTALL_PENDING');assert.equal(f.saved.at(-1)[0].status,'unknown');assert.equal(f.calls.some(row=>row[0]==='install'),false);
});

test('tampered previous receipt fails closed without calling the manager',async()=>{
  const f=fixture();await rejectCode(f.prepare({...f.input,previous:[{candidateId:'dsh-example',packageName:'dsh-example',version:'1.2.3',spec:'evil@1.2.3',requestId:'old',status:'installing'}]}),'PLUGIN_INSTALL_INVALID');assert.equal(f.calls.length,0);
});

test('same operation coalesces and other operations serialize on the manager',async()=>{
  const f=fixture();const [first,second]=await Promise.all([f.prepare(f.input),f.prepare(f.input)]);assert.deepEqual(first,second);assert.equal(f.calls.filter(row=>row[0]==='install').length,1);
  const next=await f.prepare({...f.input,operationId:'second-operation'});assert.equal(next.status,'ready');assert.equal(f.calls.filter(row=>row[0]==='install').length,1);
});

test('a combo retains the first ready receipt when the second install fails',async()=>{
  const f=fixture({install:(spec,options,{set})=>{if(spec.startsWith('first@')){set([bundle('first')],[runtime('first')]);return{application:'applied',bundle:'first',version:'1.2.3'};}return{application:'failed',error:{code:'operation-error'}};}});
  await rejectCode(f.prepare({...f.input,candidates:[candidate('first'),candidate('second')]}),'PLUGIN_INSTALL_FAILED');assert.equal(f.saved.at(-1).length,2);assert.equal(f.saved.at(-1)[0].status,'ready');assert.equal(f.saved.at(-1)[1].status,'failed');
});

test('aborted before preparation and unavailable manager never mutate',async()=>{
  const f=fixture();await rejectCode(f.prepare({...f.input,signal:AbortSignal.abort()}),'MODEL_ABORTED');assert.equal(f.calls.length,0);
  const prepare=createPluginInstaller({get:()=>undefined});await rejectCode(prepare(f.input),'PLUGIN_INSTALL_UNAVAILABLE');
});

test('no selected plugins needs no manager and performs no mutation',async()=>{
  const prepare=createPluginInstaller({get:()=>undefined});assert.deepEqual(await prepare({candidates:[],operationId:'native',previous:[],save:async()=>{}}),{status:'ready',plugins:[]});
});

test('fixed Git source preserves the manifest identity and exact author commit',async()=>{
  const commit='a'.repeat(40),spec=`git+https://github.com/author/repo.git#${commit}&path:/packages/tool`;
  const git={...candidate(),name:'A marketing title',install:{type:'git',spec,version:'1.2.3',commit},evidence:{metadata:'manifest-checked',sources:[{kind:'manifest',url:`https://raw.githubusercontent.com/author/repo/${commit}/packages/tool/package.json`}]}};
  const f=fixture({inspect:()=>({status:'accepted',kind:'git',bundle:null}),install:(actual,options,{set})=>{assert.equal(actual,spec);set([bundle('dsh-example',{source:spec})],[runtime()]);return{application:'applied',bundle:'dsh-example',version:'1.2.3'};}});
  const result=await f.prepare({...f.input,candidates:[git]});assert.equal(result.plugins[0].source,spec);assert.equal(result.plugins[0].packageName,'dsh-example');
});

test('Git mutable refs or different manifest commits are rejected before a manager call',async()=>{
  const commit='a'.repeat(40);
  for(const spec of ['git+https://github.com/author/repo.git#main',`git+https://github.com/author/repo.git#${commit}`]){
    const f=fixture();const value={...candidate(),install:{type:'git',spec,version:'1.2.3',commit},evidence:{metadata:'manifest-checked',sources:[{kind:'manifest',url:'https://raw.githubusercontent.com/author/repo/main/package.json'}]}};
    await rejectCode(f.prepare({...f.input,candidates:[value]}),'PLUGIN_INSTALL_INVALID');assert.equal(f.calls.length,0);
  }
});

test('a rejected installation promise remains unknown and never forwards a raw exception',async()=>{
  const f=fixture({install:()=>{throw Error('PRIVATE_INSTALL_SECRET');}});await rejectCode(f.prepare(f.input),'PLUGIN_INSTALL_PENDING');
  assert.equal(f.saved.at(-1)[0].status,'unknown');assert.doesNotMatch(JSON.stringify(f.saved),/PRIVATE_INSTALL_SECRET/);
  await rejectCode(f.prepare({...f.input,previous:f.saved.at(-1)}),'PLUGIN_INSTALL_PENDING');assert.equal(f.calls.filter(row=>row[0]==='install').length,1);
});

test('a lost final receipt is recovered from the persisted installing claim and fresh active inventory',async()=>{
  const f=fixture();let durable;
  await assert.rejects(f.prepare({...f.input,save:async rows=>{f.saved.push(copy(rows));if(rows[0].status==='ready')throw Error('disk full');durable=copy(rows);}}));
  assert.equal(durable[0].status,'installing');
  const result=await f.prepare({...f.input,previous:durable});assert.equal(result.status,'ready');assert.equal(f.calls.filter(row=>row[0]==='install').length,1);
});

test('cancellation targets only the owned in-flight install and keeps its settled outcome',async()=>{
  const controller=new AbortController();let resolveInstall;
  const f=fixture({install:()=>new Promise(resolve=>{resolveInstall=resolve;queueMicrotask(()=>controller.abort());})});
  f.manager.cancelInstall=async requestId=>{f.calls.push(['cancel',requestId]);resolveInstall({application:'cancelled'});return{status:'cancelled'};};
  await rejectCode(f.prepare({...f.input,signal:controller.signal}),'MODEL_ABORTED');
  assert.equal(f.calls.filter(row=>row[0]==='cancel').length,1);assert.equal(f.calls.find(row=>row[0]==='cancel')[1],f.calls.find(row=>row[0]==='install')[2].requestId);assert.equal(f.saved.at(-1)[0].status,'failed');
});

test('a successful manager receipt with missing runtime rows is not readiness',async()=>{
  const f=fixture({install:(spec,options,{set})=>{set([bundle('dsh-example',{rows:[]})],[]);return{application:'applied',bundle:'dsh-example',version:'1.2.3'};}});
  await rejectCode(f.prepare(f.input),'PLUGIN_INSTALL_NOT_ACTIVE');assert.equal(f.saved.at(-1)[0].active,false);
});

test('a newly observed active installation clears the previous failed application',async()=>{
  const f=fixture({bundles:[bundle()],plugins:[runtime()]});const previous=[{candidateId:'dsh-example',packageName:'dsh-example',version:'1.2.3',spec:'dsh-example@1.2.3',requestId:'old-request',status:'failed',application:'restart-required',code:'PLUGIN_INSTALL_RESTART_REQUIRED'}];
  const result=await f.prepare({...f.input,previous});assert.equal(result.plugins[0].status,'ready');assert.equal(result.plugins[0].application,undefined);assert.equal(result.plugins[0].code,undefined);
});

test('an explicit non-applied recovered outcome cannot be hidden by an active older inventory',async()=>{
  for(const [application,code] of [['failed','PLUGIN_INSTALL_FAILED'],['restart-required','PLUGIN_INSTALL_RESTART_REQUIRED'],['overridden','PLUGIN_INSTALL_NOT_ACTIVE'],['cancelled','MODEL_ABORTED']]){
    const f=fixture({bundles:[bundle()],plugins:[runtime()],wait:()=>({application})});const previous=[{candidateId:'dsh-example',packageName:'dsh-example',version:'1.2.3',spec:'dsh-example@1.2.3',requestId:'recovering-request',status:'installing'}];
    await rejectCode(f.prepare({...f.input,previous}),code);assert.equal(f.saved.at(-1)[0].status,'failed');
  }
});

test('an npm-prefixed selected spec retains the exact durable spec and uses the checked registry',async()=>{
  const f=fixture(),value=candidate();value.install.spec='npm:dsh-example@1.2.3';
  const result=await f.prepare({...f.input,candidates:[value]});assert.equal(result.plugins[0].spec,value.install.spec);
  assert.equal(f.calls.find(row=>row[0]==='inspect')[2].registry,'https://registry.npmjs.org/');assert.equal(f.calls.find(row=>row[0]==='install')[2].registry,'https://registry.npmjs.org/');
});

test('pending build approvals block use even when the manager says applied and runtime is active',async()=>{
  const f=fixture({install:(spec,options,{set})=>{set([bundle()],[runtime()]);return{application:'applied',bundle:'dsh-example',version:'1.2.3',pendingBuilds:['native-build']};}});
  await rejectCode(f.prepare(f.input),'PLUGIN_INSTALL_APPROVAL_REQUIRED');assert.equal(f.saved.at(-1)[0].status,'failed');assert.equal(f.calls.find(row=>row[0]==='install')[2].approvedBuilds,undefined);
  await rejectCode(f.prepare({...f.input,previous:f.saved.at(-1)}),'PLUGIN_INSTALL_APPROVAL_REQUIRED');assert.equal(f.calls.filter(row=>row[0]==='install').length,1);
});

test('a coalesced observer cancellation does not cancel the leader but is still reported to that observer',async()=>{
  let finish;const f=fixture({install:(spec,options,{set})=>new Promise(resolve=>{finish=()=>{set([bundle()],[runtime()]);resolve({application:'applied',bundle:'dsh-example',version:'1.2.3'});};})});
  const controller=new AbortController(),leader=f.prepare(f.input),observer=f.prepare({...f.input,signal:controller.signal});
  while(!finish)await new Promise(resolve=>setImmediate(resolve));
  controller.abort();finish();assert.equal((await leader).status,'ready');await rejectCode(observer,'MODEL_ABORTED');assert.equal(f.calls.filter(row=>row[0]==='install').length,1);assert.equal(f.calls.filter(row=>row[0]==='cancel').length,0);
});

test('cancellation after the durable claim but before install records a known failure with no side effect',async()=>{
  const f=fixture(),controller=new AbortController();
  await rejectCode(f.prepare({...f.input,signal:controller.signal,save:async rows=>{f.saved.push(copy(rows));if(rows[0].status==='installing')controller.abort();}}),'MODEL_ABORTED');
  assert.equal(f.calls.some(row=>row[0]==='install'),false);assert.equal(f.saved.at(-1)[0].status,'failed');assert.equal(f.saved.at(-1)[0].code,'MODEL_ABORTED');
});

test('build-script approval failure has a safe actionable Chinese 409 error rather than a model error',async()=>{
  const f=fixture({install:()=>({application:'failed',pendingBuilds:['native-build'],error:{code:'operation-error',diagnostic:'PRIVATE_SCRIPT_TOKEN'}})});
  await assert.rejects(f.prepare(f.input),error=>{
    assert.equal(error.code,'PLUGIN_INSTALL_APPROVAL_REQUIRED');assert.equal(error.status,409);
    assert.match(error.message,/构建脚本/);assert.match(error.message,/额外.*许可/);assert.match(error.message,/任务.*未执行/);
    assert.doesNotMatch(error.message,/模型|插件管理器|PRIVATE_SCRIPT_TOKEN/);return true;
  });
  assert.equal(f.saved.at(-1)[0].status,'failed');assert.equal(f.calls.find(row=>row[0]==='install')[2].approvedBuilds,undefined);
});
