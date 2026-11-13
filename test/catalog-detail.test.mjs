import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {featuredCatalog} from '../src/featured-catalog.js';
import {canRecheckPluginSource} from '../src/plugin-detail-view.js';
const {createCatalogDetailResolver}=await import('../src/catalog-detail.js').catch(()=>({}));
const communityId='https://github.com/bioaievolu/dsh-md-studio';
const sum=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t,{manifest={},wrongDigest=false,renamed=false,wrongAsset=false}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'finder-catalog-detail-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(path.join(root,'package'));
 await writeFile(path.join(root,'package/package.json'),JSON.stringify({name:'dsh-agent-twin',version:'0.4.0-preview.3',dsh:{bundle:{patch:'./cordis.patch.yml'}},...manifest}));
 await writeFile(path.join(root,'package/cordis.patch.yml'),'[]\n');
 execFileSync('/usr/bin/tar',['--format=ustar','--no-xattrs','-czf',path.join(root,'source.tgz'),'-C',root,'package'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
 const bytes=await readFile(path.join(root,'source.tgz')),calls=[];
 const fetchImpl=async url=>{calls.push(String(url));
  if(url==='https://api.github.com/repos/oxmumu3/ai-twin-starter')return Response.json({full_name:renamed?'someone/redirect':'oxmumu3/ai-twin-starter'});
  if(url==='https://api.github.com/repos/oxmumu3/ai-twin-starter/releases/tags/v0.4.0-preview.3')return Response.json({tag_name:'v0.4.0-preview.3',draft:false,assets:[{name:'dsh-agent-twin-0.4.0-preview.3.tgz',browser_download_url:wrongAsset?'https://other.invalid/a.tgz':'https://github.com/oxmumu3/ai-twin-starter/releases/download/v0.4.0-preview.3/dsh-agent-twin-0.4.0-preview.3.tgz',digest:'sha256:'+(wrongDigest?'0'.repeat(64):sum(bytes))}]});
  if(url==='https://github.com/oxmumu3/ai-twin-starter/releases/download/v0.4.0-preview.3/dsh-agent-twin-0.4.0-preview.3.tgz')return new Response(bytes);
  throw Error('unexpected fetch '+url);
 };
 return {root,bytes,calls,resolve:createCatalogDetailResolver({discovery:{searchSelected(){throw Error('unexpected community');}},hostVersion:'0.2.1-rc.3',archiveHome:root,archiveRoot:path.join(root,'cache'),featured:featuredCatalog.map(entry=>entry.id==='agent-twin'?{...entry,install:{...entry.install,sha256:sum(bytes)}}:entry),fetchImpl,now:()=>Date.now()+1000})};
}
test('community detail preserves selected identity and uses only author lookup, never a model',async()=>{
 const selected=[];
 const candidate={id:'dsh-md-studio',name:'dsh-md-studio',summary:'author description',requirements:{notes:['local files']},limitations:[],install:{type:'npm',spec:'dsh-md-studio@1.2.0',version:'1.2.0'},evidence:{metadata:'manifest-checked'}};
 const resolve=createCatalogDetailResolver({discovery:{async searchSelected(input){selected.push(input);return {candidates:[candidate],selected:{status:'checked'}};}},hostVersion:'0.2.1-rc.3'});
 const detail=await resolve({collection:'community',entryId:communityId});
 assert.equal(selected.length,1);assert.equal(selected[0].communityEntryId,communityId);
 assert.equal(detail.entry.id,communityId);assert.equal(detail.entry.name,'dsh-md-studio');assert.equal(detail.candidate.install.spec,'dsh-md-studio@1.2.0');
 assert.match(detail.entry.description,/author description/);
});
test('unresolved community metadata keeps selected description and cannot invent an install source',async()=>{
 const resolve=createCatalogDetailResolver({discovery:{async searchSelected(){return{candidates:[],selected:{status:'unresolved',reason:'author unavailable'}};}}});
 const detail=await resolve({collection:'community',entryId:communityId});
 assert.equal(detail.candidate,null);assert.equal(detail.entry.id,communityId);assert.match(detail.unavailableReason,/author unavailable/);
});
test('the real discovery unresolved reason becomes an actionable detail retry rather than a plan dead end',async()=>{
 const resolve=createCatalogDetailResolver({discovery:{async searchSelected(){return{candidates:[],selected:{status:'unresolved',reason:'尚未核对清楚所选插件的作者来源、包版本或所选目录，不能确认这条使用方案。'}};}}});
 const value=await resolve({collection:'community',entryId:communityId});
 assert.doesNotMatch(value.unavailableReason,/使用方案/);assert.match(value.unavailableReason,/稍后重试/);
 assert.equal(canRecheckPluginSource({installable:false,installation:{status:'unavailable'},unavailableReason:value.unavailableReason}),true);
});
test('a mismatched selected candidate cannot substitute another plugin for the clicked catalog item',async()=>{
 const resolve=createCatalogDetailResolver({discovery:{async searchSelected(){return{candidates:[{id:'other-plugin',name:'other-plugin',install:{type:'npm',spec:'other-plugin@1.2.0',version:'1.2.0'},evidence:{metadata:'manifest-checked'}}]};}}});
 const value=await resolve({collection:'community',entryId:communityId});
 assert.equal(value.candidate,null);assert.equal(value.entry.id,communityId);assert.equal(value.entry.name,'dsh-md-studio');
});
test('private featured detail does not fetch, search, or invent a public package',async()=>{
 const resolve=createCatalogDetailResolver({featured:featuredCatalog.map(entry=>entry.id==='dot-harness'?{...entry,status:'private',install:null}:entry),discovery:{searchSelected(){throw Error('search');}},fetchImpl(){throw Error('fetch');}});
 const detail=await resolve({collection:'featured',entryId:'dot-harness'});
 assert.equal(detail.entry.id,'dot-harness');assert.equal(detail.candidate,null);assert.ok(detail.unavailableReason);
});
test('unknown ids and caller-provided install sources are refused',async()=>{
 const resolve=createCatalogDetailResolver({discovery:{}});
 for(const input of [{collection:'else',entryId:'x'},{collection:'community',entryId:'missing'},{collection:'featured',entryId:'agent-twin',spec:'https://bad.invalid/x.tgz'}])await assert.rejects(()=>resolve(input));
});
test('featured download verifies canonical owner, exact release, checksum and package bytes before returning a local immutable candidate',async t=>{
 const f=await fixture(t);const result=await f.resolve({collection:'featured',entryId:'agent-twin'});
 assert.equal(result.candidate.install.type,'archive');assert.equal(result.candidate.install.packageName,'dsh-agent-twin');
 assert.equal(result.candidate.install.sha256,sum(f.bytes));assert.equal(result.candidate.evidence.metadata,'manifest-checked');
 assert.match(result.candidate.install.spec,new RegExp(sum(f.bytes)+'\\.tgz$'));
 assert.equal(result.entry.name,'dsh-agent-twin');assert.equal(f.calls.length,3);
 assert.deepEqual(await readFile(path.join(f.root,'cache',sum(f.bytes)+'.tgz')),f.bytes);
});
test('renamed repository, substituted asset, bad digest, package/version and incompatibility never become installable',async t=>{
 for(const options of [{renamed:true},{wrongAsset:true},{wrongDigest:true},{manifest:{name:'other'}},{manifest:{version:'9.9.9'}},{manifest:{engines:{dsh:'0.1.0'}}}]){
  const f=await fixture(t,options),result=await f.resolve({collection:'featured',entryId:'agent-twin'});
  assert.equal(result.candidate,null,JSON.stringify(options));assert.ok(result.unavailableReason);
 }
});
test('a cache ancestor symlink cannot write verified bytes outside its owned home',async t=>{
 const f=await fixture(t),elsewhere=await mkdtemp(path.join(os.tmpdir(),'finder-cache-elsewhere-'));t.after(()=>rm(elsewhere,{recursive:true,force:true}));
 await symlink(elsewhere,path.join(f.root,'cache'));
 const value=await f.resolve({collection:'featured',entryId:'agent-twin'});
 assert.equal(value.candidate,null);
 const {readdir}=await import('node:fs/promises');assert.deepEqual(await readdir(elsewhere),[]);
});

for (const fixtureCase of [{id:'dsh-dot',repository:'dsh-project-companion',packageName:'dsh-project-companion'},{id:'dot-harness',repository:'dot-dsh-connector',packageName:'dot-dsh-management'}]) {
 test('published '+fixtureCase.id+' resolves its exact public package instead of an obsolete preview gate',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'finder-featured-detail-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const entry=featuredCatalog.find(entry=>entry.id===fixtureCase.id);
  await mkdir(path.join(root,'package'));
  await writeFile(path.join(root,'package/package.json'),JSON.stringify({name:fixtureCase.packageName,version:entry.version,dsh:{bundle:{patch:'./cordis.patch.yml'}}}));
  await writeFile(path.join(root,'package/cordis.patch.yml'),'[]\n');
  execFileSync('/usr/bin/tar',['--format=ustar','--no-xattrs','-czf',path.join(root,'source.tgz'),'-C',root,'package'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
  const bytes=await readFile(path.join(root,'source.tgz')),calls=[];
  const repository='oxmumu3/'+fixtureCase.repository;
  const filename=fixtureCase.packageName+'-'+entry.version+'.tgz';
  const spec='https://github.com/'+repository+'/releases/download/v'+entry.version+'/'+filename;
  const resolve=createCatalogDetailResolver({featured:featuredCatalog.map(item=>item.id===fixtureCase.id?{...item,install:{...item.install,sha256:sum(bytes)}}:item),archiveHome:root,archiveRoot:path.join(root,'cache'),hostVersion:'0.2.1-rc.3',fetchImpl:async url=>{
   calls.push(String(url));
   if(url==='https://api.github.com/repos/'+repository)return Response.json({full_name:repository});
   if(url==='https://api.github.com/repos/'+repository+'/releases/tags/v'+entry.version)return Response.json({tag_name:'v'+entry.version,draft:false,assets:[{name:filename,browser_download_url:spec,digest:'sha256:'+sum(bytes)}]});
   if(url===spec)return new Response(bytes);
   throw Error('unexpected fetch '+url);
  }});
  const value=await resolve({collection:'featured',entryId:fixtureCase.id});
  assert.ok(value.candidate,'a verified published plugin must reach inventory and installation');
  assert.equal(value.candidate.install.packageName,fixtureCase.packageName);
  assert.equal(value.candidate.install.publicSource,spec);
  assert.equal(value.entry.version,entry.version);assert.equal(calls.length,3);
 });
}

test('a pinned host miss is decided before any download and offers no source retry', async () => {
  let fetched = 0;
  const resolve = createCatalogDetailResolver({
    featured: featuredCatalog,
    hostVersion: '0.2.2-rc.2',
    discovery: { searchSelected() { throw Error('unexpected community'); } },
    fetchImpl: async () => { fetched += 1; throw Error('no network'); },
  });
  const detail = await resolve({ collection: 'featured', entryId: 'agent-twin' });
  assert.equal(fetched, 0);
  assert.equal(detail.candidate, null);
  assert.equal(detail.unavailableReason, '目录里记的 0.4.0-preview.3 版不支持你现在的 DSH。等作者更新后再装。');
});
