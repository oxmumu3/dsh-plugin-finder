import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createPluginInstaller} from '../src/plugin-installation.js';
import * as installation from '../src/plugin-installation.js';
async function fixture(t){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'finder-catalog-install-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const bytes=Buffer.from('fixed release bytes'),sha256=createHash('sha256').update(bytes).digest('hex');
 const file=path.join(root,sha256+'.tgz');await writeFile(file,bytes,{mode:0o400});
 const candidate={id:'dsh-agent-twin',name:'dsh-agent-twin',install:{type:'archive',spec:'file:'+file,sha256,packageName:'dsh-agent-twin',version:'0.3.0',publicSource:'https://github.com/oxmumu3/ai-twin-starter/releases/download/v0.3.0/dsh-agent-twin-0.3.0.tgz'},evidence:{metadata:'manifest-checked',sources:[{kind:'verified-featured-release',url:'https://github.com/oxmumu3/ai-twin-starter/releases/download/v0.3.0/dsh-agent-twin-0.3.0.tgz',sha256}]}};
 const calls=[],saved=[];let bundles=[],plugins=[];
 const manager={async listBundles(){return structuredClone(bundles);},async listPlugins(){return structuredClone(plugins);},async inspect(){calls.push('inspect');return {status:'accepted',kind:'local-tarball',name:'dsh-agent-twin',version:'0.3.0',bundle:true};},async installBundle(spec,options){assert.equal(saved.at(-1)[0].requestId,options.requestId);calls.push('install');bundles=[{name:'dsh-agent-twin',source:spec,version:'0.3.0',availability:'profile',installed:true,enabled:true,rows:[{entryId:'include:twin',moduleName:'dsh-agent-twin'}]}];plugins=[{entryId:'include:twin',moduleName:'dsh-agent-twin',enabled:true,fiberPhase:'active'}];return{application:'applied',bundle:'dsh-agent-twin',version:'0.3.0'};},async setBundleEnabled(){calls.push('enable');}};
 const ctx={get:name=>name==='pluginManager'?manager:undefined};
 return {root,file,ctx,calls,saved,candidate,manager,prepare:createPluginInstaller(ctx,{archiveRoot:root}),input:{candidates:[candidate],operationId:'test-catalog',save:async rows=>saved.push(structuredClone(rows))},set:(b,p)=>{bundles=b;plugins=p;}};
}
test('verified cached archive installs once and reads true active through the common manager',async t=>{
 const f=await fixture(t),result=await f.prepare(f.input);assert.equal(result.status,'ready');
 const reader=installation.createPluginInventoryReader(f.ctx,{archiveRoot:f.root});
 assert.deepEqual(await reader(f.candidate),{installed:true,enabled:true,active:true,conflict:false,packageName:'dsh-agent-twin',version:'0.3.0'});
 await f.prepare({...f.input,previous:result.plugins});assert.deepEqual(f.calls,['inspect','install']);
});
test('archive bytes, cache boundary and server release evidence are checked before any manager access',async t=>{
 for(const change of [c=>{c.install.sha256='0'.repeat(64);},c=>{c.evidence.sources=[];},c=>{c.install.publicSource='https://github.com/other/repo/releases/download/v0.3.0/pkg-0.3.0.tgz';},c=>{c.install.spec='file:/outside/else.tgz';}]){
  const f=await fixture(t),candidate=structuredClone(f.candidate);change(candidate);
  await assert.rejects(()=>f.prepare({...f.input,candidates:[candidate]}),e=>e.code==='PLUGIN_INSTALL_INVALID');assert.deepEqual(f.calls,[]);
 }
});
test('read-only inventory reports a different installed version as conflict, never enables or installs',async t=>{
 const f=await fixture(t);f.set([{name:'dsh-agent-twin',source:f.candidate.install.spec,version:'0.4.0-preview.3',availability:'profile',installed:true,enabled:true,rows:[]}],[]);
 const reader=installation.createPluginInventoryReader(f.ctx,{archiveRoot:f.root});const current=await reader(f.candidate);
 assert.equal(current.conflict,true);assert.equal(current.version,'0.4.0-preview.3');assert.deepEqual(f.calls,[]);
});
test('read-only exact npm observation is usable without author fetch or any mutation',async()=>{
 const calls=[];const reader=installation.createPluginInventoryReader({get:()=>({listBundles:async()=>[{name:'abc',version:'1.0.0',source:'abc@1.0.0',installed:true,enabled:false,availability:'profile',rows:[]}],listPlugins:async()=>[],installBundle:()=>calls.push('install')})});
 const value=await reader({id:'abc',install:{type:'npm',spec:'abc@1.0.0',version:'1.0.0'},evidence:{metadata:'manifest-checked'}});
 assert.equal(value.installed,true);assert.equal(value.enabled,false);assert.equal(value.active,false);assert.equal(value.conflict,false);assert.deepEqual(calls,[]);
});
