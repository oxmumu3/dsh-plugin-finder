import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,readFile,readdir,rm,link,realpath} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {withPluginInstallationLock} from '../src/plugin-installation.js';
const {createGeneratedPluginInstaller,inspectGeneratedArtifact,createGeneratedArtifactReviewer}=await import('../src/agent-created-installation.js').catch(()=>({}));
async function fixture(){
  const root=await mkdtemp(path.join(tmpdir(),'finder-created-')),directory=path.join(root,'fresh-plugin');await mkdir(directory);
  await writeFile(path.join(directory,'package.json'),JSON.stringify({name:'dsh-finder-created-test',version:'0.1.0',type:'module',author:'牛村木木山',dsh:{manifestVersion:1,bundle:{patch:'cordis.patch.yml'}}}));
  await writeFile(path.join(directory,'index.js'),'export function apply(){}\n');await writeFile(path.join(directory,'cordis.patch.yml'),'- insert: []\n');
  let bundles=[],plugins=[],calls=0,saved=[];
  const manager={listBundles:async()=>bundles,listPlugins:async()=>plugins,inspect:async()=>({status:'accepted',kind:'tarball',bundle:null,registry:'https://registry.npmjs.org/'}),installBundle:async(spec,{requestId})=>{calls++;bundles=[{name:'dsh-finder-created-test',version:'0.1.0',source:spec,availability:'profile',installed:true,enabled:true,rows:[{entryId:'fresh',moduleName:'dsh-finder-created-test'}]}];plugins=[{entryId:'fresh',moduleName:'dsh-finder-created-test',enabled:true,fiberPhase:'active'}];return{application:'applied',bundle:'dsh-finder-created-test',version:'0.1.0',requestId};}};
  return{root,directory,manager,ctx:{get:name=>name==='pluginManager'?manager:undefined},caller:{sessionId:'session-test',workspaceId:'workspace-test',directory:root},artifact:{pluginDirectory:directory,summary:'有界创建测试'},save:async rows=>{saved=structuredClone(rows);},get saved(){return saved;},get calls(){return calls;},conflict(){bundles=[{name:'dsh-finder-created-test',version:'9.0.0',source:'other',availability:'profile',installed:true}];}};
}
const args=f=>({artifact:f.artifact,caller:f.caller,operationId:'operation-1',previous:[],save:f.save});
test('preinstall review returns only observed absence and exact unchanged artifact identity without writing',async t=>{
  assert.equal(typeof createGeneratedArtifactReviewer,'function');const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  const before=await readdir(f.root),item=await inspectGeneratedArtifact(f.artifact,f.caller),at='2026-11-03T23:00:00.000Z';
  f.manager.inspect=async()=>assert.fail('review must not inspect or install a package');f.manager.installBundle=async()=>assert.fail('review must not install');
  const review=await createGeneratedArtifactReviewer(f.ctx,{clock:()=>new Date(at)})({artifact:f.artifact,caller:f.caller});
  assert.deepEqual(review,{kind:'observed_absent',packageName:item.packageName,version:item.version,directory:item.directory,root:item.root,fingerprint:item.fingerprint,observedAt:at});
  assert.deepEqual(await readdir(f.root),before);assert.deepEqual(f.saved,[]);assert.equal(f.calls,0);
  assert.equal((await createGeneratedArtifactReviewer(f.ctx)({artifact:f.artifact,caller:f.caller,expected:review})).fingerprint,item.fingerprint);
});
test('preinstall review rejects any matching bundle or related entry, including disabled and orphan entries',async t=>{
  const inventories=[
    [[{name:'dsh-finder-created-test',availability:'missing',installed:false}],[]],
    [[{name:'dsh-finder-created-test',installed:true,enabled:false}],[]],
    [[],[{entryId:'orphan',moduleName:'dsh-finder-created-test',enabled:true,fiberPhase:'active'}]],
    [[],[{entryId:'nested',moduleName:'dsh-finder-created-test/lib/tool.js',enabled:false,fiberPhase:null}]],
    [[{name:'another-bundle',rows:[{moduleName:'dsh-finder-created-test'}]}],[]],
  ];
  for(const [bundles,plugins]of inventories){
    const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));f.manager.listBundles=async()=>bundles;f.manager.listPlugins=async()=>plugins;
    await assert.rejects(createGeneratedArtifactReviewer(f.ctx)({artifact:f.artifact,caller:f.caller}),{code:'PLUGIN_INSTALL_CONFLICT'});assert.equal(f.calls,0);
  }
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  for(const moduleName of [path.join(f.directory,'index.js'),'file:'+path.join(f.directory,'index.js'),'/other/node_modules/dsh-finder-created-test/index.js']){
    f.manager.listPlugins=async()=>[{moduleName,entryId:'path',enabled:true,fiberPhase:'active'}];
    await assert.rejects(createGeneratedArtifactReviewer(f.ctx)({artifact:f.artifact,caller:f.caller}),{code:'PLUGIN_INSTALL_CONFLICT'});
  }
});
test('preinstall review treats missing adapters, failed reads and unclassifiable inventory as unknown',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  for(const ctx of [{get:()=>undefined},{get:()=>({listBundles:async()=>[]})}])await assert.rejects(createGeneratedArtifactReviewer(ctx)({artifact:f.artifact,caller:f.caller}),{code:'PLUGIN_INSTALL_UNAVAILABLE'});
  const pairs=[[null,[]],[[],{}],[[{}],[]],[[],[{}]],[[{name:'other',rows:{}}],[]]];
  for(const [bundles,plugins]of pairs){f.manager.listBundles=async()=>bundles;f.manager.listPlugins=async()=>plugins;await assert.rejects(createGeneratedArtifactReviewer(f.ctx)({artifact:f.artifact,caller:f.caller}),{code:'PLUGIN_INSTALL_UNAVAILABLE'});}
  f.manager.listBundles=async()=>{throw Error('private manager detail');};f.manager.listPlugins=async()=>[];
  await assert.rejects(createGeneratedArtifactReviewer(f.ctx)({artifact:f.artifact,caller:f.caller}),cause=>cause.code==='PLUGIN_INSTALL_UNAVAILABLE'&&!cause.message.includes('private'));
});
test('preinstall review rejects expected identity drift, source changes during observation and unsafe paths',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));const reviewer=createGeneratedArtifactReviewer(f.ctx),expected=await reviewer({artifact:f.artifact,caller:f.caller});
  for(const field of ['directory','packageName','version','fingerprint'])await assert.rejects(reviewer({artifact:f.artifact,caller:f.caller,expected:{...expected,[field]:field==='directory'?f.root:'different'}}),{code:'PLUGIN_INSTALL_CONFLICT'});
  f.manager.listBundles=async()=>{await writeFile(path.join(f.directory,'index.js'),'export function apply(){return 2;}');return[];};
  await assert.rejects(reviewer({artifact:f.artifact,caller:f.caller}),{code:'PLUGIN_INSTALL_CONFLICT'});
  await symlink(f.directory,path.join(f.root,'alias'));
  for(const pluginDirectory of [f.root,path.dirname(f.root),path.join(f.root,'alias')])await assert.rejects(reviewer({artifact:{pluginDirectory},caller:f.caller}),{code:'PLUGIN_INSTALL_INVALID'});
});
test('preinstall review shares the installer lock and cancellation never yields an absence receipt',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));let release,entered=0;const gate=new Promise(resolve=>{release=resolve;}),lock=withPluginInstallationLock(f.manager,'held',()=>gate);
  f.manager.listBundles=async()=>{entered++;return[];};const reviewer=createGeneratedArtifactReviewer(f.ctx),pending=reviewer({artifact:f.artifact,caller:f.caller});await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,0);release();await lock;assert.equal((await pending).kind,'observed_absent');
  await assert.rejects(reviewer({artifact:f.artifact,caller:f.caller,signal:AbortSignal.abort()}),{code:'MODEL_ABORTED'});
  const controller=new AbortController();f.manager.listPlugins=async()=>{controller.abort();return[];};await assert.rejects(reviewer({artifact:f.artifact,caller:f.caller,signal:controller.signal}),{code:'MODEL_ABORTED'});assert.equal(f.calls,0);
});
test('generated installer is available and installs only checked local source',async()=>{
  assert.equal(typeof createGeneratedPluginInstaller,'function');const f=await fixture();const result=await createGeneratedPluginInstaller(f.ctx)(args(f));
  assert.equal(result.status,'ready');assert.equal(result.plugins[0].active,true);assert.equal(f.calls,1);assert.equal(f.saved[0].status,'ready');
});
test('a save failure prevents the first install',async()=>{const f=await fixture();await assert.rejects(createGeneratedPluginInstaller(f.ctx)({...args(f),save:async()=>{throw Error('disk');}}));assert.equal(f.calls,0);});
test('outside workspace or root itself is rejected before management',async()=>{const f=await fixture();for(const pluginDirectory of [f.root,path.dirname(f.root)])await assert.rejects(createGeneratedPluginInstaller(f.ctx)({...args(f),artifact:{pluginDirectory}}));assert.equal(f.calls,0);});
test('symlink source and linked source files are rejected',async()=>{const f=await fixture();const alias=path.join(f.root,'alias');await symlink(f.directory,alias);await assert.rejects(createGeneratedPluginInstaller(f.ctx)({...args(f),artifact:{pluginDirectory:alias}}));await symlink('/etc/hosts',path.join(f.directory,'external.js'));await assert.rejects(createGeneratedPluginInstaller(f.ctx)(args(f)));assert.equal(f.calls,0);});
test('existing package conflicts are never overwritten',async()=>{const f=await fixture();f.conflict();await assert.rejects(createGeneratedPluginInstaller(f.ctx)(args(f)));assert.equal(f.calls,0);});
test('unknown install result is not blindly installed again',async()=>{const f=await fixture();f.manager.installBundle=async()=>{throw Error('lost reply');};const install=createGeneratedPluginInstaller(f.ctx);await assert.rejects(install(args(f)));const saved=f.saved;assert.equal(saved[0].status,'unknown');let repeats=0;f.manager.installBundle=async()=>{repeats++;};f.manager.waitForInstall=async()=>null;await assert.rejects(install({...args(f),previous:saved}));assert.equal(repeats,0);});
test('build approval cannot be replaced by active component readback',async()=>{const f=await fixture();f.manager.installBundle=async()=>({application:'applied',pendingBuilds:['native-build']});await assert.rejects(createGeneratedPluginInstaller(f.ctx)(args(f)));assert.equal(f.saved[0].code,'PLUGIN_INSTALL_APPROVAL_REQUIRED');let inspected=0;f.manager.inspect=async()=>{inspected++;};await assert.rejects(createGeneratedPluginInstaller(f.ctx)({...args(f),previous:f.saved}));assert.equal(inspected,0);});
test('ready receipt checks source bytes on recovery',async()=>{const f=await fixture();const install=createGeneratedPluginInstaller(f.ctx);await install(args(f));await writeFile(path.join(f.directory,'index.js'),'export function apply(){throw Error()}');await assert.rejects(install({...args(f),previous:f.saved}));assert.equal(f.calls,1);});
test('install cancellation does not report success or erase original bytes',async()=>{const f=await fixture();const before=await readFile(path.join(f.directory,'package.json'));const signal=AbortSignal.abort();await assert.rejects(createGeneratedPluginInstaller(f.ctx)({...args(f),signal}));assert.equal(f.calls,0);assert.deepEqual(await readFile(path.join(f.directory,'package.json')),before);});
test('durable claim yield cannot install changed source',async()=>{const f=await fixture();const original=f.save;const save=async rows=>{await original(rows);if(rows[0].status==='installing')await writeFile(path.join(f.directory,'index.js'),'export function apply(){throw Error("changed")}');};await assert.rejects(createGeneratedPluginInstaller(f.ctx)({...args(f),save}),{code:'PLUGIN_INSTALL_CONFLICT'});assert.equal(f.calls,0);});
test('known cancellation before submission is retryable instead of permanent unknown',async()=>{const f=await fixture(),controller=new AbortController(),original=f.save;const save=async rows=>{await original(rows);if(rows[0].status==='installing')controller.abort();};await assert.rejects(createGeneratedPluginInstaller(f.ctx)({...args(f),save,signal:controller.signal}),{code:'MODEL_ABORTED'});assert.equal(f.saved[0].status,'failed');assert.equal(f.calls,0);});
test('installed generated code is a checked archive snapshot, not a mutable workspace link',async()=>{const f=await fixture();const install=f.manager.installBundle;let code;f.manager.installBundle=async(spec,options)=>{assert.ok(spec.startsWith('file:'));assert.ok(spec.endsWith('.tgz'));code=gunzipSync(await readFile(spec.slice(5)));return install(spec,options);};await createGeneratedPluginInstaller(f.ctx)(args(f));assert.ok(code.includes(Buffer.from('export function apply(){}')));assert.match(f.saved[0].archiveHash,/^[a-f0-9]{64}$/);});
test('empty directory depth is bounded even when the file budget is unused',async()=>{const f=await fixture();await mkdir(path.join(f.directory,...Array(40).fill('deep')),{recursive:true});await assert.rejects(createGeneratedPluginInstaller(f.ctx)(args(f)),{code:'PLUGIN_INSTALL_INVALID'});assert.equal(f.calls,0);});
test('failed final source validation before manager submission can recover after correction',async()=>{const f=await fixture(),original=f.save;const save=async rows=>{await original(rows);if(rows[0].status==='installing')await symlink('/etc/hosts',path.join(f.directory,'late-link'));};const install=createGeneratedPluginInstaller(f.ctx);await assert.rejects(install({...args(f),save}),{code:'PLUGIN_INSTALL_INVALID'});assert.equal(f.saved[0].status,'failed');assert.equal(f.calls,0);await rm(path.join(f.directory,'late-link'));const result=await install({...args(f),previous:f.saved});assert.equal(result.status,'ready');assert.equal(f.calls,1);});
test('official optional manifestVersion can be absent while unsupported explicit versions remain rejected',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));const file=path.join(f.directory,'package.json'),manifest=JSON.parse(await readFile(file,'utf8'));delete manifest.dsh.manifestVersion;
  await writeFile(file,JSON.stringify(manifest));assert.equal((await inspectGeneratedArtifact(f.artifact,f.caller)).packageName,manifest.name);
  manifest.dsh.manifestVersion=2;await writeFile(file,JSON.stringify(manifest));await assert.rejects(inspectGeneratedArtifact(f.artifact,f.caller),{code:'PLUGIN_INSTALL_INVALID'});assert.equal(f.calls,0);
});
test('declared publish files exclude development dependency links and prior archives without changing their source',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));const file=path.join(f.directory,'package.json'),manifest=JSON.parse(await readFile(file,'utf8'));
  delete manifest.dsh.manifestVersion;manifest.files=['index.js','client.js','lib/*.js','locale/*.json','cordis.patch.yml'];await writeFile(file,JSON.stringify(manifest));
  await mkdir(path.join(f.directory,'lib'));await mkdir(path.join(f.directory,'locale'));await mkdir(path.join(f.directory,'tests'));await mkdir(path.join(f.directory,'scripts'));
  await writeFile(path.join(f.directory,'client.js'),'export {};');await writeFile(path.join(f.directory,'lib','core.js'),'export const value=1;');await writeFile(path.join(f.directory,'locale','zh.json'),'{}');
  const dependency=path.join(f.root,'dev-dependency.js');await writeFile(dependency,'test dependency, never archived');await link(dependency,path.join(f.directory,'tests','linked.mjs'));
  await symlink(f.root,path.join(f.directory,'node_modules'));await symlink(f.root,path.join(f.directory,'.git'));
  await writeFile(path.join(f.directory,'scripts','verify.mjs'),'throw Error("must not execute")');await writeFile(path.join(f.directory,'old-plugin.tgz'),'old archive');await writeFile(path.join(f.directory,'verification-report.json'),'private test report');
  const expected=['client.js','cordis.patch.yml','index.js','lib/core.js','locale/zh.json','package.json'];
  const before=await inspectGeneratedArtifact(f.artifact,f.caller);assert.deepEqual(before.snapshot.map(item=>item.name).sort(),expected);
  await writeFile(dependency,'changed development dependency');assert.equal((await inspectGeneratedArtifact(f.artifact,f.caller)).fingerprint,before.fingerprint);
  let names;
  const install=f.manager.installBundle;f.manager.installBundle=async(spec,options)=>{const tar=gunzipSync(await readFile(spec.slice(5)));names=[];for(let offset=0;offset<tar.length&&tar[offset];){const header=tar.subarray(offset,offset+512),text=(start,length)=>header.subarray(start,start+length).toString().replace(/\0.*$/s,'');const prefix=text(345,155),name=text(0,100);names.push((prefix?prefix+'/':'')+name);const size=parseInt(text(124,12).trim()||'0',8);offset+=512+Math.ceil(size/512)*512;}return install(spec,options);};
  const ready=await createGeneratedPluginInstaller(f.ctx)(args(f));assert.equal(ready.status,'ready');assert.deepEqual(names.sort(),expected.map(name=>'package/'+name));
  assert.equal(await readFile(path.join(f.directory,'old-plugin.tgz'),'utf8'),'old archive');assert.equal(await readFile(path.join(f.directory,'tests','linked.mjs'),'utf8'),'changed development dependency');
});
test('default artifact publishing excludes dependency trees and VCS metadata even without a files whitelist',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));await symlink(f.root,path.join(f.directory,'node_modules'));await symlink(f.root,path.join(f.directory,'.git'));await writeFile(path.join(f.directory,'prior.tgz'),'archive');
  const item=await inspectGeneratedArtifact(f.artifact,f.caller);assert.deepEqual(item.snapshot.map(file=>file.name).sort(),['cordis.patch.yml','index.js','package.json']);
});
test('symlinks and hardlinks in selected runtime files still block archiving',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));const file=path.join(f.directory,'package.json'),manifest=JSON.parse(await readFile(file,'utf8'));manifest.files=['index.js','lib/*.js','cordis.patch.yml'];await writeFile(file,JSON.stringify(manifest));await mkdir(path.join(f.directory,'lib'));
  const external=path.join(f.root,'other.js');await writeFile(external,'outside plugin source');await symlink(external,path.join(f.directory,'lib','linked.js'));await assert.rejects(inspectGeneratedArtifact(f.artifact,f.caller),{code:'PLUGIN_INSTALL_INVALID'});await rm(path.join(f.directory,'lib','linked.js'));
  await link(external,path.join(f.directory,'lib','hard.js'));await assert.rejects(inspectGeneratedArtifact(f.artifact,f.caller),{code:'PLUGIN_INSTALL_INVALID'});assert.equal(f.calls,0);
});
test('publish selection cannot omit the declared runtime patch or select outside the artifact',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));const file=path.join(f.directory,'package.json'),manifest=JSON.parse(await readFile(file,'utf8'));
  for(const files of [['index.js'],['index.js','cordis.patch.yml','../other.js'],['index.js','cordis.patch.yml','/outside.js']]){await writeFile(file,JSON.stringify({...manifest,files}));await assert.rejects(inspectGeneratedArtifact(f.artifact,f.caller),{code:'PLUGIN_INSTALL_INVALID'});}assert.equal(f.calls,0);
});

test('an installed generated bundle whose Host activation failed retains the outcome and is not mislabeled a source conflict on retry',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  const install=f.manager.installBundle,list=f.manager.listPlugins;
  f.manager.installBundle=async(...values)=>({...await install(...values),application:'failed',stage:'enable',error:{code:'operation-error',diagnostic:'PRIVATE_DIAGNOSTIC_MUST_NOT_REACH_MODEL'}});
  f.manager.listPlugins=async()=>(await list()).map(row=>({...row,fiberPhase:'failed'}));
  const installer=createGeneratedPluginInstaller(f.ctx);
  await assert.rejects(installer(args(f)),{code:'PLUGIN_INSTALL_FAILED'});
  assert.equal(f.saved[0].application,'failed');assert.equal(f.saved[0].managementCode,'operation-error');assert.equal(f.saved[0].managementStage,'enable');
  assert.doesNotMatch(JSON.stringify(f.saved),/PRIVATE_DIAGNOSTIC/);
  await assert.rejects(installer({...args(f),previous:f.saved}),{code:'PLUGIN_INSTALL_NOT_ACTIVE'});
  assert.equal(f.saved[0].application,'failed');assert.equal(f.saved[0].installed,true);assert.equal(f.saved[0].enabled,true);assert.equal(f.saved[0].active,false);
  assert.equal(f.calls,1,'a matching but failed bundle must never be overwritten or installed twice');
});

test('optional manager bundle identity fields may be absent only when exact immutable inventory proves readiness',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));const install=f.manager.installBundle;
  f.manager.installBundle=async(...values)=>{const result=await install(...values);delete result.bundle;delete result.version;return result;};
  const ready=await createGeneratedPluginInstaller(f.ctx)(args(f));
  assert.equal(ready.status,'ready');assert.equal(ready.plugins[0].application,'applied');assert.equal(ready.plugins[0].active,true);
  const failed=await fixture();t.after(()=>rm(failed.root,{recursive:true,force:true}));const installFailed=failed.manager.installBundle,list=failed.manager.listPlugins;
  failed.manager.installBundle=async(...values)=>{await installFailed(...values);return{application:'applied'};};
  failed.manager.listPlugins=async()=>(await list()).map(row=>({...row,fiberPhase:'failed'}));
  await assert.rejects(createGeneratedPluginInstaller(failed.ctx)(args(failed)),{code:'PLUGIN_INSTALL_NOT_ACTIVE'});assert.equal(failed.saved[0].application,'applied');
});

test('explicit mismatched manager identity still refuses even with an active expected bundle',async t=>{
  for(const field of ['bundle','version']){
    const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));const install=f.manager.installBundle;
    f.manager.installBundle=async(...values)=>({...await install(...values),[field]:'different'});
    await assert.rejects(createGeneratedPluginInstaller(f.ctx)(args(f)),{code:'PLUGIN_INSTALL_CONFLICT'});assert.equal(f.saved[0].application,'applied');assert.equal(f.calls,1);
  }
});

test('a known SDK missing-injection failure returns only a structured safe hint',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  f.manager.installBundle=async()=>({application:'failed',stage:'enable',error:{code:'operation-error',diagnostic:'Error: cannot get property "webServer" without inject\nPRIVATE_DIAGNOSTIC /private/not-for-model'}});
  const error=await createGeneratedPluginInstaller(f.ctx)(args(f)).then(()=>assert.fail('must fail'),error=>error);
  const expected={kind:'missing-injection',service:'webServer'};
  assert.deepEqual(error.failureHint,expected);assert.deepEqual(f.saved[0].failureHint,expected);
  assert.equal(f.saved[0].application,'failed');assert.equal(f.saved[0].managementStage,'enable');
  assert.doesNotMatch(JSON.stringify({error,saved:f.saved}),/PRIVATE_DIAGNOSTIC|\/private\/not-for-model/);
});

test('untrusted service-like strings and ambiguous diagnostics never become failure hints',async t=>{
  for(const diagnostic of [
    'cannot get property "AKIAABCDEFGHIJKLMNOP" without inject',
    'cannot get property "ghp_privateCredential123456789" without inject',
    'cannot get property "/private/credential" without inject',
    'cannot get property "unknownService" without inject',
    'cannot get property "webServer" without inject\ncannot get property "connection" without inject',
  ]){
    const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
    f.manager.installBundle=async()=>({application:'failed',stage:'enable',error:{code:'operation-error',diagnostic}});
    const error=await createGeneratedPluginInstaller(f.ctx)(args(f)).then(()=>assert.fail('must fail'),error=>error);
    assert.equal(error.failureHint,undefined);assert.equal(f.saved[0].failureHint,undefined);
    assert.doesNotMatch(JSON.stringify({error,saved:f.saved}),/AKIA|ghp_|credential|unknownService/);
  }
});

test('a fresh initially-absent claim is durable before the first install mutation',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  const install=f.manager.installBundle;f.manager.installBundle=async(...values)=>{
    assert.equal(f.saved[0].status,'installing');assert.equal(f.saved[0].initiallyAbsent,true);
    return install(...values);
  };
  const result=await createGeneratedPluginInstaller(f.ctx)(args(f));assert.equal(result.plugins[0].initiallyAbsent,true);
});

test('legacy receipts are not retrospectively given initially-absent ownership',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  const install=createGeneratedPluginInstaller(f.ctx);await install(args(f));const previous=f.saved;
  delete previous[0].initiallyAbsent;
  const result=await install({...args(f),previous});assert.equal(result.plugins[0].initiallyAbsent,undefined);
  assert.equal(f.calls,1);
});

async function retirementFixture(t){
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  f.root=await realpath(f.root);f.directory=path.join(f.root,'fresh-plugin');f.artifact.pluginDirectory=f.directory;f.caller.directory=f.root;
  const native=f.manager.installBundle,list=f.manager.listPlugins;
  f.manager.installBundle=async(...values)=>({...await native(...values),application:'failed',stage:'enable',error:{code:'operation-error'}});
  f.manager.listPlugins=async()=>(await list()).map(row=>({...row,fiberPhase:'failed'}));
  await assert.rejects(createGeneratedPluginInstaller(f.ctx)(args(f)),{code:'PLUGIN_INSTALL_FAILED'});
  const old=structuredClone(f.saved[0]),bundles=await f.manager.listBundles(),plugins=await f.manager.listPlugins();
  const directory=path.join(f.root,'repair-plugin'),packageName='dsh-finder-created-repair';await mkdir(directory);
  await writeFile(path.join(directory,'package.json'),JSON.stringify({name:packageName,version:'0.1.0',type:'module',dsh:{bundle:{patch:'cordis.patch.yml'}}}));
  await writeFile(path.join(directory,'index.js'),'export function apply(){}\n');await writeFile(path.join(directory,'cordis.patch.yml'),'- insert: []\n');
  let disables=0;
  f.manager.listBundles=async()=>structuredClone(bundles);f.manager.listPlugins=async()=>structuredClone(plugins);
  f.manager.installBundle=async spec=>{bundles.push({name:packageName,version:'0.1.0',source:spec,availability:'profile',installed:true,enabled:true,rows:[{entryId:'repair',moduleName:packageName}]});plugins.push({entryId:'repair',moduleName:packageName,enabled:true,fiberPhase:'active'});return{application:'applied',stage:'enable'};};
  f.manager.setBundleEnabled=async(name,enabled)=>{
    disables++;assert.equal(name,old.packageName);assert.equal(enabled,false);
    assert.equal(f.saved[0].retirements[0].status,'disabling','intent must be durable before disabling');
    bundles[0].enabled=false;bundles[0].rows[0].entryId=undefined;plugins.splice(0,1);
    return{application:'applied',stage:'enable',target:name,enabled:false};
  };
  const superseded=[{requestId:'request-original',sessionId:f.caller.sessionId,workspaceId:f.caller.workspaceId,directory:f.caller.directory,repairNumber:1,creator:{status:'completed'},preparation:{kind:'generated',status:'pending',plugins:[old]}}];
  return{f,old,bundles,plugins,superseded,get disables(){return disables;},args:()=>({...args(f),operationId:'repair-operation',artifact:{pluginDirectory:directory},previous:[],superseded})};
}

test('a reviewed preinstall predecessor creates no retirement attempt or management authority',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));f.root=await realpath(f.root);f.caller.directory=f.root;f.directory=path.join(f.root,'fresh-plugin');f.artifact.pluginDirectory=f.directory;
  const review=await createGeneratedArtifactReviewer(f.ctx)({artifact:f.artifact,caller:f.caller});
  const directory=path.join(f.root,'revised-plugin'),packageName='dsh-finder-created-revised';await mkdir(directory);
  await writeFile(path.join(directory,'package.json'),JSON.stringify({name:packageName,version:'0.1.0',type:'module',dsh:{bundle:{patch:'cordis.patch.yml'}}}));await writeFile(path.join(directory,'index.js'),'export function apply(){}');await writeFile(path.join(directory,'cordis.patch.yml'),'- insert: []\n');
  let installed=false,disables=0;f.manager.listBundles=async()=>installed?[{name:packageName,version:'0.1.0',source:installed,availability:'profile',installed:true,enabled:true,rows:[{entryId:'revised',moduleName:packageName}]}]:[];f.manager.listPlugins=async()=>installed?[{entryId:'revised',moduleName:packageName,enabled:true,fiberPhase:'active'}]:[];
  f.manager.installBundle=async spec=>{installed=spec;return{application:'applied'};};f.manager.setBundleEnabled=async()=>{disables++;assert.fail('preinstall source grants no retirement authority');};
  const superseded=[{requestId:'original',sessionId:f.caller.sessionId,workspaceId:f.caller.workspaceId,directory:f.caller.directory,repairNumber:1,phase:'preinstall',kind:'caller_reported_review',creator:{status:'completed',result:JSON.stringify(f.artifact)},review}];
  await assert.rejects(createGeneratedPluginInstaller(f.ctx)({...args(f),superseded}),{code:'PLUGIN_INSTALL_CONFLICT'});
  const originalManifest=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));await writeFile(path.join(directory,'package.json'),JSON.stringify({...originalManifest,name:review.packageName}));
  await assert.rejects(createGeneratedPluginInstaller(f.ctx)({...args(f),artifact:{pluginDirectory:directory},superseded}),{code:'PLUGIN_INSTALL_CONFLICT'});
  assert.equal(installed,false,'identity conflicts must fail before installation or save');assert.deepEqual(f.saved,[]);
  await writeFile(path.join(directory,'package.json'),JSON.stringify(originalManifest));
  const ready=await createGeneratedPluginInstaller(f.ctx)({...args(f),artifact:{pluginDirectory:directory},superseded});
  assert.equal(ready.status,'ready');assert.equal(disables,0);assert.equal(ready.retirement,undefined);assert.equal(ready.plugins[0].retirements,undefined);
  assert.equal(await readFile(path.join(f.directory,'index.js'),'utf8'),'export function apply(){}\n');
});

test('preinstall snapshots are skipped independently while real failed predecessors retain normal retirement checks',async t=>{
  const r=await retirementFixture(t),directory=path.join(r.f.root,'uninstalled-source');
  r.superseded.push({requestId:'original',sessionId:r.f.caller.sessionId,workspaceId:r.f.caller.workspaceId,directory:r.f.caller.directory,repairNumber:2,phase:'preinstall',kind:'caller_reported_review',creator:{status:'completed',result:JSON.stringify({pluginDirectory:directory})},review:{kind:'observed_absent',packageName:'dsh-never-submitted-test',version:'0.1.0',directory,root:r.f.root,fingerprint:'a'.repeat(64),observedAt:'2026-11-03T23:00:00.000Z'}});
  r.superseded[0].phase='preinstall';
  const ready=await createGeneratedPluginInstaller(r.f.ctx)(r.args());assert.equal(ready.status,'ready');assert.equal(r.disables,1);assert.equal(ready.plugins[0].retirements.length,1);assert.equal(ready.plugins[0].retirements[0].packageName,r.old.packageName);
});

test('only a proven initially-absent failed predecessor is disabled after replacement readiness',async t=>{
  const r=await retirementFixture(t),result=await createGeneratedPluginInstaller(r.f.ctx)(r.args());
  assert.equal(result.status,'ready');assert.equal(result.plugins[0].active,true);assert.equal(r.disables,1);
  assert.equal(result.plugins[0].retirements[0].status,'disabled');assert.equal(r.bundles[0].installed,true);
  assert.equal(r.bundles[0].enabled,false);assert.equal(await readFile(path.join(r.f.directory,'index.js'),'utf8'),'export function apply(){}\n');
  assert.equal(r.old.status,'failed','old receipt must not be rewritten');
});

test('legacy, mismatched workspace, active or tampered predecessors remain manual while replacement stays ready',async t=>{
  for(const scenario of ['legacy','workspace','active','archive']){
    const r=await retirementFixture(t);
    if(scenario==='legacy')delete r.superseded[0].preparation.plugins[0].initiallyAbsent;
    if(scenario==='workspace')r.superseded[0].workspaceId='another-workspace';
    if(scenario==='active')r.plugins[0].fiberPhase='active';
    if(scenario==='archive'){await rm(r.old.spec.slice(5));await writeFile(r.old.spec.slice(5),'tampered archive');}
    const result=await createGeneratedPluginInstaller(r.f.ctx)(r.args());
    assert.equal(result.status,'ready');assert.equal(result.plugins[0].active,true);assert.equal(r.disables,0,scenario);
    assert.equal(result.plugins[0].retirements[0].status,'blocked',scenario);assert.equal(r.bundles[0].enabled,true);
  }
});

test('an uncertain disable is reconciled read-only without repeating the mutation',async t=>{
  const r=await retirementFixture(t),disable=r.f.manager.setBundleEnabled;
  r.f.manager.setBundleEnabled=async(...values)=>{await disable(...values);throw Error('lost disable reply');};
  const install=createGeneratedPluginInstaller(r.f.ctx),first=await install(r.args());
  assert.equal(first.status,'ready');assert.equal(first.plugins[0].retirements[0].status,'unknown');assert.equal(r.disables,1);
  const recovered=await install({...r.args(),previous:r.f.saved});
  assert.equal(recovered.status,'ready');assert.equal(recovered.plugins[0].retirements[0].status,'disabled');assert.equal(r.disables,1);
});

test('an uncertain disable that left the predecessor enabled is never replayed',async t=>{
  const r=await retirementFixture(t);let attempts=0;
  r.f.manager.setBundleEnabled=async()=>{attempts++;throw Error('unobserved result');};
  const install=createGeneratedPluginInstaller(r.f.ctx);let result=await install(r.args());
  assert.equal(result.plugins[0].retirements[0].status,'unknown');
  result=await install({...r.args(),previous:r.f.saved});
  assert.equal(result.status,'ready');assert.equal(result.plugins[0].retirements[0].status,'unknown');assert.equal(attempts,1);
});

test('failed retirement intent persistence cannot disable a predecessor or block the ready replacement',async t=>{
  const r=await retirementFixture(t),save=r.f.save;
  const result=await createGeneratedPluginInstaller(r.f.ctx)({...r.args(),save:async rows=>{if(rows[0].retirements?.some(row=>row.status==='disabling'))throw Error('disk');return save(rows);}});
  assert.equal(result.status,'ready');assert.equal(result.plugins[0].active,true);assert.equal(r.disables,0);
  assert.equal(result.retirement.code,'PLUGIN_RETIREMENT_PERSISTENCE_UNAVAILABLE');
});

test('retirement refuses identity drift, loading entries, a live old Creator or duplicate predecessors',async t=>{
  for(const scenario of ['source','version','loading','creator','duplicate']){
    const r=await retirementFixture(t);
    if(scenario==='source')r.bundles[0].source='file:/not-owned/plugin.tgz';
    if(scenario==='version')r.bundles[0].version='9.9.9';
    if(scenario==='loading')r.plugins[0].fiberPhase='loading';
    if(scenario==='creator')r.superseded[0].creator.status='running';
    if(scenario==='duplicate')r.superseded.push(structuredClone(r.superseded[0]));
    const result=await createGeneratedPluginInstaller(r.f.ctx)(r.args());
    assert.equal(result.status,'ready');assert.equal(r.disables,0,scenario);
    assert.equal(result.plugins[0].retirements[0].status,'blocked',scenario);
  }
});

test('retirement rechecks inventory after its durable intent yields',async t=>{
  const r=await retirementFixture(t),save=r.f.save;
  const result=await createGeneratedPluginInstaller(r.f.ctx)({...r.args(),save:async rows=>{
    await save(rows);if(rows[0].retirements?.some(row=>row.status==='disabling'))r.plugins[0].fiberPhase='active';
  }});
  assert.equal(result.status,'ready');assert.equal(result.plugins[0].retirements[0].status,'blocked');assert.equal(r.disables,0);
});

test('retirement rechecks immutable archive bytes after its durable intent yields',async t=>{
  const r=await retirementFixture(t),save=r.f.save;
  const result=await createGeneratedPluginInstaller(r.f.ctx)({...r.args(),save:async rows=>{
    await save(rows);
    if(rows[0].retirements?.some(row=>row.status==='disabling')){await rm(r.old.spec.slice(5));await writeFile(r.old.spec.slice(5),'changed after intent');}
  }});
  assert.equal(result.status,'ready');assert.equal(result.plugins[0].retirements[0].status,'blocked');assert.equal(r.disables,0);
});

test('lost retirement persistence leaves a durable intent that recovers without another disable',async t=>{
  const r=await retirementFixture(t),save=r.f.save,install=createGeneratedPluginInstaller(r.f.ctx);
  const first=await install({...r.args(),save:async rows=>{
    if(rows[0].retirements?.some(row=>row.status==='disabled'))throw Error('disk after accepted disable');
    return save(rows);
  }});
  assert.equal(first.status,'ready');assert.equal(r.f.saved[0].retirements[0].status,'disabling');assert.equal(r.disables,1);
  const result=await install({...r.args(),previous:r.f.saved});
  assert.equal(result.status,'ready');assert.equal(result.plugins[0].retirements[0].status,'disabled');assert.equal(r.disables,1);
});

test('retirement stays inside the shared profile lock through official disable readback',async t=>{
  const r=await retirementFixture(t),disable=r.f.manager.setBundleEnabled;let entered,release;
  const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  r.f.manager.setBundleEnabled=async(...values)=>{entered();await gate;return disable(...values);};
  const install=createGeneratedPluginInstaller(r.f.ctx)(r.args());await started;let otherMutation=false;
  const other=withPluginInstallationLock(r.f.manager,'catalog-other',()=>{otherMutation=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(otherMutation,false);
  release();await install;await other;assert.equal(otherMutation,true);assert.equal(r.disables,1);
});

test('profile reload during retirement cannot leave a now-inactive replacement labeled ready',async t=>{
  const r=await retirementFixture(t),disable=r.f.manager.setBundleEnabled,submit=r.f.manager.installBundle;
  let installs=0;r.f.manager.installBundle=(...values)=>{installs++;return submit(...values);};
  r.f.manager.setBundleEnabled=async(...values)=>{
    const result=await disable(...values);r.plugins.find(row=>row.entryId==='repair').fiberPhase='failed';return result;
  };
  const install=createGeneratedPluginInstaller(r.f.ctx);
  await assert.rejects(install(r.args()),error=>error.code==='PLUGIN_INSTALL_NOT_ACTIVE'&&error.failureHint===undefined);
  assert.equal(r.f.saved[0].status,'failed');assert.equal(r.f.saved[0].active,false);
  assert.equal(r.f.saved[0].failureHint,undefined);assert.equal(r.f.saved[0].retirements[0].status,'disabled');
  await assert.rejects(install({...r.args(),previous:r.f.saved}),{code:'PLUGIN_INSTALL_NOT_ACTIVE'});
  assert.equal(installs,1,'a real inactive readback must not submit or create another package');assert.equal(r.disables,1);
});
