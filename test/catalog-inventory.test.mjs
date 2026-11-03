import test from 'node:test';
import assert from 'node:assert/strict';
const {createCatalogInventoryReader}=await import('../src/catalog-inventory.js').catch(()=>({}));
const scopedId='https://github.com/yongfanbeta/dsh-pomodoro';
const gitId='https://github.com/3chatai-nct/3chatai-deepseek-harness-plugin';
const treeId='https://github.com/iqingyoung/429-throttle-mcp/tree/main/packages/dsh-throttle';
const installed=(name,patch={})=>({name,version:'1.2.3',source:'file:/private/DO_NOT_EXPOSE',installed:true,enabled:true,availability:'profile',rows:[{entryId:'entry:'+name,moduleName:name}],...patch});
const active=(name,patch={})=>({entryId:'entry:'+name,moduleName:name,enabled:true,fiberPhase:'active',...patch});
function fixture({bundles=[],plugins=[]}={}){
 const calls=[];
 const manager={listBundles:async()=>{calls.push('bundles');return structuredClone(bundles);},listPlugins:async()=>{calls.push('plugins');return structuredClone(plugins);},installBundle:()=>{throw Error('must never install');},setBundleEnabled:()=>{throw Error('must never enable');}};
 const read=createCatalogInventoryReader({get:(name,required)=>{assert.equal(name,'pluginManager');assert.equal(required,false);return manager;}});
 return{read,calls};
}
const selection=(collection,entryId)=>({collection,entryId});
test('a featured plugin is recognized locally even when its installed version or source differs',async()=>{
 const f=fixture({bundles:[installed('dsh-family-assistant',{version:'9.0.0'})],plugins:[active('dsh-family-assistant')]});
 assert.deepEqual(await f.read(selection('featured','family-assistant')),{installed:true,enabled:true,active:true,conflict:false,packageName:'dsh-family-assistant',version:'9.0.0',componentOnly:false});
 assert.deepEqual(f.calls.sort(),['bundles','plugins']);
});
test('scoped npm identity is exact and never replaced with the display slug',async()=>{
 const exact='@yongfanbeta/dsh-pomodoro';
 const f=fixture({bundles:[installed('dsh-pomodoro')],plugins:[active('dsh-pomodoro')]});
 assert.equal((await f.read(selection('community',scopedId))).installed,false);
 const g=fixture({bundles:[installed(exact)],plugins:[active(exact)]});
 assert.equal((await g.read(selection('community',scopedId))).packageName,exact);
 assert.equal((await g.read(selection('community',scopedId))).active,true);
});
test('the primary product wins over its already installed secondary bridge',async()=>{
 const f=fixture({bundles:[installed('dsh-wechat'),installed('dsh-project-companion',{enabled:false})],plugins:[active('dsh-wechat'),active('dsh-project-companion',{enabled:false,fiberPhase:null})]});
 const value=await f.read(selection('featured','dsh-dot'));assert.equal(value.packageName,'dsh-project-companion');assert.equal(value.componentOnly,false);assert.equal(value.enabled,false);assert.equal(value.active,false);
});
test('the four verified scoped publisher identities count as the local primary product without granting install rights',async()=>{
 for(const [entryId,name] of [['agent-twin','dsh-agent-twin'],['family-assistant','dsh-family-assistant'],['dsh-dot','dsh-project-companion'],['dot-harness','dot-dsh-management']]){
  const scoped='@oxmumu3/'+name;
  const f=fixture({bundles:[installed(scoped,{version:'8.7.6'})],plugins:[active(scoped)]});
  const value=await f.read(selection('featured',entryId));
  assert.equal(value.packageName,scoped);assert.equal(value.version,'8.7.6');assert.equal(value.installed,true);assert.equal(value.active,true);assert.equal(value.componentOnly,false);
  assert.equal('installable' in value,false);assert.equal('source' in value,false);assert.deepEqual(f.calls.sort(),['bundles','plugins']);
 }
});
test('the exact unscoped primary remains preferred and similar or foreign scoped names are not aliases',async()=>{
 const name='dsh-family-assistant',scoped='@oxmumu3/'+name;
 const f=fixture({bundles:[installed(scoped),installed(name)],plugins:[active(scoped),active(name)]});
 assert.equal((await f.read(selection('featured','family-assistant'))).packageName,name);
 for(const other of ['@oxmumu3/dsh-family-assistant-extra','@somebody/dsh-family-assistant']){
  const g=fixture({bundles:[installed(other)],plugins:[active(other)]});assert.equal((await g.read(selection('featured','family-assistant'))).installed,false);
 }
});
test('only a secondary component is explicitly distinguished from the product installation',async()=>{
 const f=fixture({bundles:[installed('dsh-wechat')],plugins:[active('dsh-wechat')]});
 const value=await f.read(selection('featured','dsh-dot'));assert.equal(value.packageName,'dsh-wechat');assert.equal(value.componentOnly,true);assert.equal(value.installed,true);assert.equal(value.active,true);
 assert.doesNotMatch(JSON.stringify(value),/DO_NOT_EXPOSE|file:/);
});
test('every declared component must be enabled and active before a product is active',async()=>{
 const bundle=installed('dsh-family-assistant');bundle.rows.push({entryId:'second',moduleName:'dsh-family-assistant'});
 for(const second of [[],[{entryId:'second',moduleName:'dsh-family-assistant',enabled:true,fiberPhase:'pending'}],[{entryId:'second',moduleName:'wrong',enabled:true,fiberPhase:'active'}]]){
  const f=fixture({bundles:[bundle],plugins:[active('dsh-family-assistant'),...second]});
  assert.equal((await f.read(selection('featured','family-assistant'))).active,false);
 }
});
test('malformed declarations or duplicate runtime identities never count as an active installation',async()=>{
 for(const [rows,plugins] of [[[null],[active('dsh-family-assistant')]],[[{entryId:'entry:dsh-family-assistant',moduleName:'dsh-family-assistant'}],[active('dsh-family-assistant'),active('dsh-family-assistant')]]]){
  const f=fixture({bundles:[installed('dsh-family-assistant',{rows})],plugins});
  assert.equal((await f.read(selection('featured','family-assistant'))).active,false);
 }
});
test('Git-only catalogs use the installed repository identity rather than an invented package name',async()=>{
 for(const source of ['github:3chatai-nct/3chatai-deepseek-harness-plugin#main','git+https://github.com/3ChatAI-NCT/3chatai-deepseek-harness-plugin.git#'+'a'.repeat(40)]){
  const f=fixture({bundles:[installed('@local/real-author-name',{source})],plugins:[active('@local/real-author-name')]});
  const value=await f.read(selection('community',gitId));assert.equal(value.packageName,'@local/real-author-name');assert.equal(value.installed,true);assert.equal(value.active,true);
 }
});
test('a Git subpackage must match the exact catalog subdirectory',async()=>{
 const source='github:iqingyoung/429-throttle-mcp#'+'b'.repeat(40)+'&path:/packages/dsh-throttle';
 const f=fixture({bundles:[installed('real-throttle-name',{source})],plugins:[active('real-throttle-name')]});
 assert.equal((await f.read(selection('community',treeId))).installed,true);
 const other=fixture({bundles:[installed('real-throttle-name',{source:source.replace('dsh-throttle','other-plugin')})],plugins:[active('real-throttle-name')]});
 await assert.rejects(other.read(selection('community',treeId)),error=>error.code==='PLUGIN_INSTALL_UNAVAILABLE');
});
test('unmapped Git-only sources are unknown rather than falsely uninstalled or guessed from a display name',async()=>{
 for(const source of ['file:/private/secret-copy','link:/private/secret-copy','other-plugin@1.0.0','https://token:secret@github.com/3chatai-nct/3chatai-deepseek-harness-plugin.git']){
  const f=fixture({bundles:[installed('3chatai-deepseek-harness-plugin',{source})],plugins:[active('3chatai-deepseek-harness-plugin')]});
  await assert.rejects(f.read(selection('community',gitId)),error=>error.code==='PLUGIN_INSTALL_UNAVAILABLE'&&!/secret/.test(error.message));
 }
});
test('an empty official inventory safely reports absence without guessing a package name',async()=>{
 const f=fixture();const value=await f.read(selection('community',gitId));assert.equal(value.installed,false);assert.equal(value.packageName,'');
});
test('duplicate bundle identities and an unavailable manager never become a false uninstalled status',async()=>{
 const f=fixture({bundles:[installed('dsh-family-assistant'),installed('dsh-family-assistant')]});
 await assert.rejects(f.read(selection('featured','family-assistant')),error=>error.code==='PLUGIN_INSTALL_UNAVAILABLE');
 for(const manager of [null,{}, {listBundles:async()=>{throw Error('PRIVATE');},listPlugins:async()=>[]}]){
  const read=createCatalogInventoryReader({get:()=>manager});await assert.rejects(read(selection('featured','family-assistant')),error=>error.code==='PLUGIN_INSTALL_UNAVAILABLE'&&!/PRIVATE/.test(error.message));
 }
});
test('caller package names, sources and unknown entries are rejected before official inventory reads',async()=>{
 const f=fixture();for(const value of [{collection:'featured',entryId:'family-assistant',packageName:'evil'},{collection:'community',entryId:scopedId,source:'evil'},{collection:'bad',entryId:scopedId},{collection:'featured',entryId:'unknown'}])await assert.rejects(f.read(value),error=>error.code==='INVALID_INPUT');assert.equal(f.calls.length,0);
});
