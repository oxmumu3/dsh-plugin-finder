import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogInstallService} from '../src/catalog-install-service.js';
import {FinderError} from '../src/contracts.js';

const clone=structuredClone;
const candidate={id:'plug-a',name:'plug-a',install:{type:'npm',spec:'plug-a@1.0.0',version:'1.0.0'},evidence:{metadata:'manifest-checked'}};
const entry={collection:'community',id:'https://github.com/a/plug-a',name:'plug-a',title:'资料预览',summary:'在当前工作区预览资料。',description:'作者说明。',author:'a',version:'1.0.0',sourceUrl:'https://github.com/a/plug-a',requirements:['当前宿主'],limitations:['需配置资料来源']};
const receipt=(patch={})=>({candidateId:'plug-a',packageName:'plug-a',version:'1.0.0',spec:'plug-a@1.0.0',requestId:'manager-request-a',status:'ready',installed:true,enabled:true,active:true,application:'applied',...patch});
function fixture(options={}){
 const data=options.data??{rows:new Map(),writes:0,failWrite:false,commitThenFail:false};
 data.store??={read:async id=>clone(data.rows.get(id)),list:async()=>clone([...data.rows.values()]),write:async row=>{data.writes++;if(data.failWrite)throw Error('PRIVATE_STORE');data.rows.set(row.id,clone(row));if(data.commitThenFail)throw Error('PRIVATE_ACK');}};
 let installed={installed:false,enabled:false,active:false,conflict:false,packageName:'plug-a',version:'1.0.0'};
 const calls={resolve:[],prepare:[],reads:0};
 const resolve=options.resolveDetail??(async input=>{calls.resolve.push(input);return{entry:{...entry,collection:input.collection,id:input.entryId},candidate:clone(candidate),unavailableReason:''};});
 const read=options.readInstalled??(async()=>{calls.reads++;return clone(installed);});
 const prepare=options.preparePlugins??(async args=>{calls.prepare.push(args);await args.save([receipt({status:'installing',installed:false,enabled:false,active:false})]);installed={...installed,installed:true,enabled:true,active:true};return{status:'ready',plugins:[receipt()]};});
 const service=createCatalogInstallService({store:data.store,resolveDetail:resolve,preparePlugins:prepare,readInstalled:read,readEntryInstalled:options.readEntryInstalled,entryRevision:options.entryRevision,now:()=>new Date('2026-10-29T00:00:00Z')});
 return{service,data,calls,setInstalled:value=>{installed={...installed,...value};},record:id=>JSON.parse(data.rows.get(id).serialized)};
}
const detail=f=>f.service.detail({collection:'community',entryId:entry.id});

function cacheFixture(options={}){
 const sha='a'.repeat(64),fixed={...clone(candidate),install:{type:'archive',packageName:'plug-a',version:'1.0.0',spec:'file:/owned/cache/'+sha+'.tgz',sha256:sha,publicSource:'https://github.com/oxmumu3/plug-a/releases/download/v1.0.0/plug-a-1.0.0.tgz'}};
 let cached=true,local={installed:false,enabled:false,active:false,conflict:false,packageName:'plug-a',version:'1.0.0'},resolves=0,prepares=0;
 const f=fixture({resolveDetail:async()=>{
  resolves++;if(resolves>1&&options.resolveAgain)await options.resolveAgain();
  const next=resolves>1&&options.changedCandidate?options.changedCandidate(clone(fixed)):clone(fixed);
  if(next.install.spec===fixed.install.spec&&next.install.sha256===fixed.install.sha256)cached=true;
  return{entry,candidate:next,unavailableReason:''};
 },readInstalled:async()=>{if(!cached)throw new FinderError('PLUGIN_INSTALL_INVALID');return clone(local);},readEntryInstalled:async()=>clone(local),preparePlugins:async args=>{
  prepares++;if(options.prepare)return options.prepare(args);
  local={...local,installed:true,enabled:true,active:true};
  const row={...receipt(),spec:fixed.install.spec};await args.save([row]);return{status:'ready',plugins:[row]};
 }});
 return{...f,fixed,dropCache:()=>{cached=false;},setLocal:patch=>{local={...local,...patch};},counts:()=>({resolves,prepares})};
}

test('a missing fixed archive keeps local installation facts but removes install eligibility',async()=>{
 const f=cacheFixture(),d=await detail(f);f.setLocal({installed:true,enabled:true,active:true});f.dropCache();
 const shown=await f.service.status({detailId:d.detailId});assert.equal(shown.installation.status,'installed-local');assert.equal(shown.installation.active,true);assert.equal(shown.installable,false);assert.equal(shown.sourceRecheckAllowed,true);
 const writes=f.data.writes;assert.equal((await f.service.install({detailId:d.detailId})).installable,false);assert.equal(f.data.writes,writes);assert.deepEqual(f.counts(),{resolves:1,prepares:0});
});
test('after uninstall a lost fixed archive can be explicitly restored without replacing its record or receipt',async()=>{
 const f=cacheFixture(),d=await detail(f);f.setLocal({installed:true,enabled:true,active:true});f.dropCache();f.setLocal({installed:false,enabled:false,active:false});
 const missing=await f.service.status({detailId:d.detailId});assert.equal(missing.installation.status,'unavailable');assert.equal(missing.installable,false);assert.equal(missing.sourceRecheckAllowed,true);
 const before=clone(f.data.rows.get(d.detailId)),writes=f.data.writes;
 const restored=await f.service.detail({collection:'community',entryId:entry.id,recheck:true,detailId:d.detailId});
 assert.equal(restored.detailId,d.detailId);assert.equal(restored.installable,true);assert.equal(restored.installation.status,'not-installed');assert.deepEqual(f.data.rows.get(d.detailId),before);assert.equal(f.data.writes,writes);
 assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');assert.deepEqual(f.counts(),{resolves:2,prepares:1});
});
test('status and ordinary reopen never restore a missing archive or write an installation record',async()=>{
 const f=cacheFixture(),d=await detail(f);f.dropCache();const before=clone(f.data.rows.get(d.detailId));
 await f.service.status({detailId:d.detailId});await detail(f);assert.deepEqual(f.counts(),{resolves:1,prepares:0});assert.deepEqual(f.data.rows.get(d.detailId),before);
});
test('explicit source recheck is a no-op when the original fixed source is still valid',async()=>{
 const f=cacheFixture(),d=await detail(f),before=clone(f.data.rows.get(d.detailId));
 assert.equal((await f.service.detail({collection:'community',entryId:entry.id,recheck:true,detailId:d.detailId})).installable,true);
 assert.deepEqual(f.counts(),{resolves:1,prepares:0});assert.deepEqual(f.data.rows.get(d.detailId),before);
});
test('a changed fixed source, digest or version cannot replace the original candidate during cache recovery',async()=>{
 for(const patch of [{spec:'file:/owned/cache/other.tgz'},{sha256:'b'.repeat(64)},{version:'2.0.0'}]){
  const f=cacheFixture({changedCandidate:value=>({...value,install:{...value.install,...patch}})}),d=await detail(f);f.dropCache();const before=clone(f.data.rows.get(d.detailId));
  await assert.rejects(f.service.detail({collection:'community',entryId:entry.id,recheck:true,detailId:d.detailId}),error=>error.code==='PLUGIN_INSTALL_CONFLICT');
  assert.deepEqual(f.data.rows.get(d.detailId),before);assert.deepEqual(f.counts(),{resolves:2,prepares:0});
 }
});
test('unknown, approval and restart attempts cannot re-fetch a source or acquire another installation',async()=>{
 for(const code of ['PLUGIN_INSTALL_PENDING','PLUGIN_INSTALL_APPROVAL_REQUIRED','PLUGIN_INSTALL_RESTART_REQUIRED']){
  const f=cacheFixture({prepare:async()=>{throw new FinderError(code);}}),d=await detail(f);await f.service.install({detailId:d.detailId});f.setLocal({installed:true,enabled:true,active:true});f.dropCache();const before=clone(f.data.rows.get(d.detailId));
  const shown=await f.service.detail({collection:'community',entryId:entry.id,recheck:true,detailId:d.detailId});assert.equal(shown.sourceRecheckAllowed,false);assert.equal(shown.installation.status,code==='PLUGIN_INSTALL_PENDING'?'unknown':'failed');assert.equal(shown.installation.code,code);assert.equal(shown.installation.active,true);
  await f.service.install({detailId:d.detailId});assert.deepEqual(f.counts(),{resolves:1,prepares:1});assert.deepEqual(f.data.rows.get(d.detailId),before);
 }
});
test('same fixed archive concurrent rechecks resolve once and preserve the durable candidate',async()=>{
 let release,started;const startedPromise=new Promise(r=>{started=r;}),wait=new Promise(r=>{release=r;});
 const f=cacheFixture({resolveAgain:async()=>{started();await wait;}}),d=await detail(f);f.dropCache();const before=clone(f.data.rows.get(d.detailId));
 const input={collection:'community',entryId:entry.id,recheck:true,detailId:d.detailId};const first=f.service.detail(input);await startedPromise;const second=f.service.detail(input);release();
 const result=await Promise.all([first,second]);assert.ok(result.every(x=>x.installable));assert.deepEqual(f.counts(),{resolves:2,prepares:0});assert.deepEqual(f.data.rows.get(d.detailId),before);
});
test('rechecking during a long install reads its claim promptly without waiting or resolving again',async()=>{
 let release,started;const began=new Promise(r=>{started=r;}),wait=new Promise(r=>{release=r;});
 const f=cacheFixture({prepare:async()=>{started();await wait;throw new FinderError('PLUGIN_INSTALL_PENDING');}}),d=await detail(f),installing=f.service.install({detailId:d.detailId});await began;f.dropCache();
 let timer;const shown=await Promise.race([f.service.detail({collection:'community',entryId:entry.id,recheck:true,detailId:d.detailId}),new Promise(r=>{timer=setTimeout(()=>r(null),80);})]);clearTimeout(timer);release();await installing;
 assert.ok(shown,'recheck must not wait for a mutating operation');assert.equal(shown.sourceRecheckAllowed,false);assert.deepEqual(f.counts(),{resolves:1,prepares:1});
});
test('cache recheck validates its boolean and selected durable identity before any resolver call',async()=>{
 const f=cacheFixture(),d=await detail(f);for(const input of [{collection:'community',entryId:entry.id,recheck:'true',detailId:d.detailId},{collection:'community',entryId:entry.id,recheck:true},{collection:'community',entryId:entry.id,recheck:false,detailId:d.detailId},{collection:'community',entryId:'different',recheck:true,detailId:d.detailId},{collection:'community',entryId:entry.id,recheck:true,detailId:d.detailId,spec:'evil'}])await assert.rejects(f.service.detail(input),error=>error.code==='INVALID_INPUT');
 assert.deepEqual(f.counts(),{resolves:1,prepares:0});
});

test('source failure still reports an existing local installation without granting installation authority',async()=>{
 const f=fixture({resolveDetail:async()=>({entry,candidate:null,unavailableReason:'暂时无法核对来源，请稍后重试。'}),readEntryInstalled:async()=>({installed:true,enabled:true,active:true,conflict:false,packageName:'plug-a',version:'2.0.0'})});
 const d=await detail(f);assert.equal(d.installable,false);assert.equal(d.installation.status,'installed-local');assert.equal(d.installation.active,true);assert.equal(d.installation.version,'2.0.0');
 await f.service.install({detailId:d.detailId});assert.equal(f.calls.prepare.length,0);
});
test('a checked public package does not duplicate an already-installed scoped product alias',async()=>{
 const f=fixture({readEntryInstalled:async()=>({installed:true,enabled:true,active:true,conflict:false,packageName:'@author/plug-a',version:'2.0.0'})});
 const d=await detail(f);assert.equal(d.installation.status,'installed-local');await f.service.install({detailId:d.detailId});assert.equal(f.calls.prepare.length,0);
});
test('an installed companion alone does not block installing the selected primary package',async()=>{
 const f=fixture({readEntryInstalled:async()=>({installed:true,enabled:true,active:true,conflict:false,componentOnly:true,packageName:'bridge',version:'1.0.0'})});
 const d=await detail(f);assert.equal(d.installation.status,'not-installed');assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');assert.equal(f.calls.prepare.length,1);
});
test('reopening fixed detail during a long installation reads progress without waiting for the install lock',async()=>{
 let release,started;const began=new Promise(r=>{started=r;}),wait=new Promise(r=>{release=r;});
 const f=fixture({preparePlugins:async()=>{started();await wait;throw new FinderError('PLUGIN_INSTALL_PENDING');}}),d=await detail(f),installing=f.service.install({detailId:d.detailId});await began;
 let timer;const reopened=await Promise.race([detail(f),new Promise(r=>{timer=setTimeout(()=>r(null),80);})]);clearTimeout(timer);release();await installing;assert.ok(reopened,'detail should not wait for a mutating operation');assert.equal(reopened.detailId,d.detailId);
});
test('unknown local identity is not presented as definitely absent when the source is unavailable',async()=>{
 const f=fixture({resolveDetail:async()=>({entry,candidate:null,unavailableReason:'暂时无法核对来源。'}),readEntryInstalled:async()=>{throw Error('identity unknown');}});
 assert.equal((await detail(f)).installation.status,'unknown');assert.equal(f.calls.prepare.length,0);
});
test('changed catalog metadata opens a fresh detail identity while old successful receipts remain readable',async()=>{
 const data={rows:new Map(),writes:0};let revision='a'.repeat(64);
 const f=fixture({data,entryRevision:()=>revision}),old=await detail(f);await f.service.install({detailId:old.detailId});const archived=clone(data.rows.get(old.detailId));
 revision='b'.repeat(64);const next=await detail(f);assert.notEqual(next.detailId,old.detailId);assert.deepEqual(data.rows.get(old.detailId),archived);assert.equal((await f.service.status({detailId:old.detailId})).installation.status,'ready');
});
test('a catalog refresh retains the unresolved original attempt instead of allowing a parallel new installation',async()=>{
 let revision='a'.repeat(64);const f=fixture({entryRevision:()=>revision,preparePlugins:async()=>{throw new FinderError('PLUGIN_INSTALL_PENDING');}}),old=await detail(f);
 await f.service.install({detailId:old.detailId});revision='b'.repeat(64);const next=await detail(f);assert.equal(next.detailId,old.detailId);assert.equal(next.installation.status,'unknown');
});
test('another card for the same package cannot bypass its unresolved installation receipt',async()=>{
 const data={rows:new Map(),writes:0};const a=fixture({data,preparePlugins:async()=>{throw new FinderError('PLUGIN_INSTALL_PENDING');}}),d=await detail(a);await a.service.install({detailId:d.detailId});
 const b=fixture({data}),other=await b.service.detail({collection:'community',entryId:'https://github.com/other/plug-a'});
 assert.equal((await b.service.install({detailId:other.detailId})).installation.status,'unknown');assert.equal(b.calls.prepare.length,0);
});
test('a restart-required attempt becomes ready once the exact installed source is observed active',async()=>{
 const f=fixture({preparePlugins:async()=>{throw new FinderError('PLUGIN_INSTALL_RESTART_REQUIRED');}}),d=await detail(f);await f.service.install({detailId:d.detailId});f.setInstalled({installed:true,enabled:true,active:true});
 const status=await f.service.status({detailId:d.detailId});assert.equal(status.installation.status,'ready');assert.equal(f.calls.prepare.length,0);
});

test('detail uses exact server-selected identity with no model and returns no private candidate',async()=>{
 const f=fixture(),d=await detail(f);assert.equal(d.entryId,entry.id);assert.equal(d.title,entry.title);assert.equal(d.installable,true);assert.equal(d.installation.status,'not-installed');assert.equal(d.description,entry.description);assert.ok(d.detailId);assert.equal('candidate' in d,false);assert.equal('spec' in d,false);assert.doesNotMatch(JSON.stringify(d),/manifest-checked|manager-request/);assert.equal(f.calls.prepare.length,0);
});
test('detail reuses one durable ID and pinned candidate instead of resolving over a later operation',async()=>{
 const f=fixture(),d=await detail(f),again=await detail(f);assert.equal(d.detailId,again.detailId);assert.equal(f.calls.resolve.length,1);assert.equal(f.data.rows.size,1);assert.equal(f.record(d.detailId).candidate.install.spec,'plug-a@1.0.0');
 const reopened=fixture({data:f.data,resolveDetail:()=>{throw Error('must not resolve historical selected identity');}});assert.equal((await detail(reopened)).detailId,d.detailId);
});
test('private or preview entries have detail but no install target or side effect',async()=>{
 const f=fixture({resolveDetail:async()=>({entry:{...entry,collection:'featured',id:'preview'},candidate:null,unavailableReason:'尚未公开提供安装包。'})});const d=await f.service.detail({collection:'featured',entryId:'preview'});assert.equal(d.installable,false);assert.equal(d.installation.status,'unavailable');assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'unavailable');assert.equal(f.calls.prepare.length,0);
});
test('all entry points reject extra keys, invalid ids and fake signals before adapters run',async()=>{
 const f=fixture();for(const input of [{collection:'wrong',entryId:entry.id},{collection:'community',entryId:entry.id,spec:'evil'},{collection:'community',entryId:''},{collection:'community',entryId:entry.id,signal:{aborted:false}}])await assert.rejects(f.service.detail(input),e=>e.code==='INVALID_INPUT');
 const d=await detail(f);for(const method of ['install','status'])for(const input of [{detailId:d.detailId,spec:'evil'},{detailId:d.detailId,candidate},{detailId:''},{detailId:'forged'}])await assert.rejects(f.service[method](input),e=>e.code==='INVALID_INPUT'||e.code==='COMMUNITY_ENTRY_UNAVAILABLE');assert.equal(f.calls.prepare.length,0);
});
test('first install persists its claim and each receipt before a mutation and projects fresh ready state',async()=>{
 let f;f=fixture({preparePlugins:async args=>{f.calls.prepare.push(args);const before=f.record(args.operationId);assert.equal(before.attempt.status,'installing');assert.ok(before.attempt.operationId);assert.deepEqual(args.candidates,[candidate]);await args.save([receipt({status:'installing',active:false})]);assert.equal(f.record(args.operationId).attempt.plugins[0].status,'installing');f.setInstalled({installed:true,enabled:true,active:true});return{status:'ready',plugins:[receipt()]};}});
 const d=await detail(f),ready=await f.service.install({detailId:d.detailId});assert.equal(ready.installation.status,'ready');assert.equal(ready.installation.active,true);assert.equal(f.record(d.detailId).attempt.plugins[0].requestId,'manager-request-a');assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');assert.equal(f.calls.prepare.length,1);
});
test('same-entry concurrent installs and another service sharing the store coalesce',async()=>{
 let f,release,started;const wait=new Promise(r=>{release=r;}),start=new Promise(r=>{started=r;});f=fixture({preparePlugins:async args=>{f.calls.prepare.push(args);await args.save([receipt({status:'installing',active:false})]);started();await wait;f.setInstalled({installed:true,enabled:true,active:true});return{status:'ready',plugins:[receipt()]};}});const d=await detail(f);const first=f.service.install({detailId:d.detailId});await start;const other=fixture({data:f.data,readInstalled:async()=>({installed:true,enabled:true,active:true,conflict:false,packageName:'plug-a',version:'1.0.0'}),preparePlugins:()=>{throw Error('duplicate');}});const second=other.service.install({detailId:d.detailId});release();assert.ok((await Promise.all([first,second])).every(v=>v.installation.status==='ready'));assert.equal(f.calls.prepare.length,1);
});
test('installed-disabled runs official preparation to enable and already-ready never calls it',async()=>{
 const f=fixture();f.setInstalled({installed:true});const d=await detail(f);assert.equal(d.installation.status,'installed-disabled');assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');assert.equal(f.calls.prepare.length,1);
});
test('conflicting installed source or version blocks overwrite',async()=>{
 const f=fixture();f.setInstalled({installed:true,enabled:true,active:true,conflict:true,version:'2.0.0'});const d=await detail(f);assert.equal(d.installation.status,'conflict');assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'conflict');assert.equal(f.calls.prepare.length,0);
});
test('unknown mutation outcome preserves receipt and status/repeated install never replay it',async()=>{
 let f;f=fixture({preparePlugins:async args=>{f.calls.prepare.push(args);await args.save([receipt({status:'installing',installed:false,enabled:false,active:false})]);throw Error('SECRET_PRIVATE_FAILURE');}});const d=await detail(f),first=await f.service.install({detailId:d.detailId});assert.equal(first.installation.status,'unknown');assert.doesNotMatch(JSON.stringify(first),/SECRET_PRIVATE/);assert.equal((await f.service.status({detailId:d.detailId})).installation.status,'unknown');assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'unknown');assert.equal(f.calls.prepare.length,1);assert.equal(f.record(d.detailId).attempt.plugins.length,1);
 f.setInstalled({installed:true,enabled:true,active:true});assert.equal((await f.service.status({detailId:d.detailId})).installation.status,'ready');assert.equal(f.calls.prepare.length,1);
});
test('status only reads current inventory without resolver, installer or storage writes',async()=>{
 const f=fixture(),d=await detail(f),before=f.data.writes;f.setInstalled({installed:true,enabled:true,active:true});assert.equal((await f.service.status({detailId:d.detailId})).installation.status,'ready');assert.equal(f.data.writes,before);assert.equal(f.calls.resolve.length,1);assert.equal(f.calls.prepare.length,0);
});
test('storage failure before claim prevents any installer mutation; lost durable ACK never retries the operation',async()=>{
 const f=fixture(),d=await detail(f);f.data.failWrite=true;await assert.rejects(f.service.install({detailId:d.detailId}),e=>e.code==='HISTORY_STORAGE_FAILED');assert.equal(f.calls.prepare.length,0);f.data.failWrite=false;f.data.commitThenFail=true;await assert.rejects(f.service.install({detailId:d.detailId}),e=>e.code==='HISTORY_STORAGE_FAILED');f.data.commitThenFail=false;assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'unknown');assert.equal(f.calls.prepare.length,0);
});
test('precise known failure retains receipt and returns safe failure rather than unknown',async()=>{
 let f;f=fixture({preparePlugins:async args=>{f.calls.prepare.push(args);await args.save([receipt({status:'failed',installed:false,enabled:false,active:false,code:'PLUGIN_INSTALL_FAILED'})]);throw new FinderError('PLUGIN_INSTALL_FAILED');}});const d=await detail(f),value=await f.service.install({detailId:d.detailId});assert.equal(value.installation.status,'failed');assert.equal(value.installation.code,'PLUGIN_INSTALL_FAILED');assert.equal(f.record(d.detailId).attempt.plugins[0].status,'failed');
});
test('explicit pending script approval is never hidden by observed active entries',async()=>{
 let f;f=fixture({preparePlugins:async args=>{await args.save([receipt({status:'failed',code:'PLUGIN_INSTALL_APPROVAL_REQUIRED'})]);f.setInstalled({installed:true,enabled:true,active:true});throw new FinderError('PLUGIN_INSTALL_APPROVAL_REQUIRED');}});const d=await detail(f),value=await f.service.install({detailId:d.detailId});assert.equal(value.installation.status,'failed');assert.equal(value.installation.code,'PLUGIN_INSTALL_APPROVAL_REQUIRED');assert.equal((await f.service.status({detailId:d.detailId})).installation.status,'failed');
});
test('inventory outage blocks mutation and exposes only fixed unknown wording',async()=>{
 const f=fixture({readInstalled:async()=>{throw Error('PRIVATE_COOKIE');}}),d=await detail(f);assert.equal(d.installation.status,'unknown');const value=await f.service.install({detailId:d.detailId});assert.equal(value.installation.status,'unknown');assert.doesNotMatch(JSON.stringify(value),/PRIVATE_COOKIE/);assert.equal(f.calls.prepare.length,0);
});
test('resolver cannot substitute selected collection or entry and concurrent detail resolves once',async()=>{
 const wrong=fixture({resolveDetail:async()=>({entry:{...entry,id:'substitute'},candidate,unavailableReason:''})});await assert.rejects(detail(wrong),e=>e.code==='PLUGIN_INSTALL_INVALID');assert.equal(wrong.data.rows.size,0);
 const f=fixture();const values=await Promise.all([detail(f),detail(f),detail(f)]);assert.ok(values.every(v=>v.detailId===values[0].detailId));assert.equal(f.calls.resolve.length,1);
});
test('close aborts and awaits pending preparation, then rejects new reads and installs',async()=>{
 let f,started,release;const start=new Promise(r=>{started=r;});f=fixture({preparePlugins:async args=>{await args.save([receipt({status:'installing',active:false})]);started();await new Promise(r=>{release=r;args.signal.addEventListener('abort',r,{once:true});});return{status:'ready',plugins:[receipt()]};}});const d=await detail(f),installing=f.service.install({detailId:d.detailId});await start;let finished=false;const closed=f.service.close().then(()=>{finished=true;});await Promise.allSettled([installing,closed]);assert.equal(finished,true);for(const method of ['status','install'])await assert.rejects(f.service[method]({detailId:d.detailId}),e=>e.code==='CLOSED');await assert.rejects(detail(f),e=>e.code==='CLOSED');release();
});

test('a forged package receipt cannot become a durable ready claim',async()=>{
 const f=fixture({preparePlugins:async()=>({status:'ready',plugins:[receipt({packageName:'substitute-package'})]})}),d=await detail(f);const value=await f.service.install({detailId:d.detailId});assert.equal(value.installation.status,'failed');assert.equal(value.installation.code,'PLUGIN_INSTALL_INVALID');assert.equal(f.record(d.detailId).attempt.code,'PLUGIN_INSTALL_INVALID');
});
test('status is available during a pending install and does not wait for or repeat mutation',async()=>{
 let f,started,release;const begin=new Promise(r=>{started=r;}),wait=new Promise(r=>{release=r;});f=fixture({preparePlugins:async args=>{f.calls.prepare.push(args);await args.save([receipt({status:'installing',active:false})]);started();await wait;f.setInstalled({installed:true,enabled:true,active:true});return{status:'ready',plugins:[receipt()]};}});const d=await detail(f),job=f.service.install({detailId:d.detailId});await begin;const value=await f.service.status({detailId:d.detailId});assert.equal(value.installation.status,'installing');assert.equal(f.calls.prepare.length,1);release();assert.equal((await job).installation.status,'ready');
});
test('different collections never collide even when their entry strings match',async()=>{
 const f=fixture(),a=await detail(f),b=await f.service.detail({collection:'featured',entryId:entry.id});assert.notEqual(a.detailId,b.detailId);assert.equal(f.data.rows.size,2);
});
test('aborted inputs stop before resolve, inventory or durable install claim',async()=>{
 const f=fixture(),d=await detail(f),before=f.data.writes;const controller=new AbortController();controller.abort();await assert.rejects(f.service.detail({collection:'community',entryId:entry.id,signal:controller.signal}),e=>e.code==='MODEL_ABORTED');await assert.rejects(f.service.install({detailId:d.detailId,signal:controller.signal}),e=>e.code==='MODEL_ABORTED');assert.equal(f.data.writes,before);assert.equal(f.calls.resolve.length,1);assert.equal(f.calls.prepare.length,0);
});
test('corrupted durable detail data fails closed without replacing it or invoking adapters',async()=>{
 const f=fixture(),d=await detail(f);const row=f.data.rows.get(d.detailId);f.data.rows.set(d.detailId,{...row,serialized:'{"version":1}'});const before=f.data.writes;await assert.rejects(f.service.status({detailId:d.detailId}),e=>e.code==='HISTORY_STORAGE_FAILED');await assert.rejects(f.service.install({detailId:d.detailId}),e=>e.code==='HISTORY_STORAGE_FAILED');assert.equal(f.data.writes,before);assert.equal(f.calls.prepare.length,0);assert.equal(f.data.rows.get(d.detailId).serialized,'{"version":1}');
});
test('one explicit failed install retries with its previous exact receipt instead of discarding it',async()=>{
 let tries=0,f;f=fixture({preparePlugins:async args=>{tries++;if(tries===1){await args.save([receipt({status:'failed',active:false,code:'PLUGIN_INSTALL_FAILED'})]);throw new FinderError('PLUGIN_INSTALL_FAILED');}assert.equal(args.previous.length,1);assert.equal(args.previous[0].requestId,'manager-request-a');f.setInstalled({installed:true,enabled:true,active:true});return{status:'ready',plugins:[receipt({requestId:'manager-request-b'})]};}});const d=await detail(f);assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'failed');assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');assert.equal(tries,2);assert.equal(f.record(d.detailId).attempt.plugins[0].requestId,'manager-request-b');
});
test('a lost receipt write ACK after mutation reconciles without a new installer call',async()=>{
 let f;f=fixture({preparePlugins:async args=>{f.calls.prepare.push(args);await args.save([receipt({status:'installing',active:false})]);f.setInstalled({installed:true,enabled:true,active:true});f.data.commitThenFail=true;return{status:'ready',plugins:[receipt()]};}});const d=await detail(f);await assert.rejects(f.service.install({detailId:d.detailId}),e=>e.code==='HISTORY_STORAGE_FAILED');f.data.commitThenFail=false;assert.equal((await f.service.status({detailId:d.detailId})).installation.status,'ready');assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');assert.equal(f.calls.prepare.length,1);
});
test('an aborted follower does not cancel the original installation',async()=>{
 let f,started,release;const begin=new Promise(r=>{started=r;}),wait=new Promise(r=>{release=r;});f=fixture({preparePlugins:async()=>{f.calls.prepare.push(true);started();await wait;f.setInstalled({installed:true,enabled:true,active:true});return{status:'ready',plugins:[receipt()]};}});const d=await detail(f),first=f.service.install({detailId:d.detailId});await begin;const controller=new AbortController(),follower=f.service.install({detailId:d.detailId,signal:controller.signal});controller.abort();await assert.rejects(follower,e=>e.code==='MODEL_ABORTED');release();assert.equal((await first).installation.status,'ready');assert.equal(f.calls.prepare.length,1);
});
test('an unresolved detail without any install claim may recheck and recover using the same ID',async()=>{
 let tries=0;const f=fixture({resolveDetail:async()=>{tries++;return{entry,candidate:tries===1?null:clone(candidate),unavailableReason:tries===1?'作者资料暂时无法核对。':''};}});const first=await detail(f);assert.equal(first.installable,false);const second=await detail(f);assert.equal(second.detailId,first.detailId);assert.equal(second.installable,true);assert.equal(tries,2);assert.equal(f.data.rows.size,1);assert.equal((await detail(f)).installable,true);assert.equal(tries,2);
});
test('real installer integration performs exactly one official first install after durable receipt saves',async()=>{
 const {createPluginInstaller}=await import('../src/plugin-installation.js');let installed=false,calls=0,f;
 const manager={listBundles:async()=>installed?[{name:'plug-a',version:'1.0.0',source:'plug-a@1.0.0',installed:true,enabled:true,availability:'profile',rows:[{entryId:'plug',moduleName:'plug-a'}]}]:[],listPlugins:async()=>installed?[{entryId:'plug',moduleName:'plug-a',enabled:true,fiberPhase:'active'}]:[],inspect:async()=>({status:'accepted',kind:'registry',name:'plug-a',version:'1.0.0',bundle:true}),setBundleEnabled:async()=>{throw Error('must not enable an absent bundle');},installBundle:async(spec,options)=>{calls++;assert.equal(spec,'plug-a@1.0.0');assert.equal(options.enabled,true);assert.equal(options.saveExact,true);const privateRecord=[...f.data.rows.values()].map(row=>JSON.parse(row.serialized))[0];assert.equal(privateRecord.attempt.plugins[0].requestId,options.requestId);assert.equal(privateRecord.attempt.plugins[0].status,'installing');installed=true;return{application:'applied',bundle:'plug-a',version:'1.0.0'};}};
 f=fixture({preparePlugins:createPluginInstaller({get:()=>manager}),readInstalled:async()=>({installed,enabled:installed,active:installed,conflict:false,packageName:'plug-a',version:'1.0.0'})});const d=await detail(f);assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');assert.equal(calls,1);
});
test('ready and failed installation records survive detail recreation without changing the fixed selected identity',async()=>{
 const f=fixture(),d=await detail(f);await f.service.install({detailId:d.detailId});const before=f.record(d.detailId).candidate;const other=fixture({data:f.data,resolveDetail:async()=>{throw Error('cannot replace a claimed identity');},readInstalled:async()=>({installed:true,enabled:true,active:true,conflict:false,packageName:'plug-a',version:'1.0.0'})});const shown=await detail(other);assert.equal(shown.detailId,d.detailId);assert.equal(shown.installation.status,'ready');assert.deepEqual(other.record(d.detailId).candidate,before);
});

test('a new explicit reinstall after verified uninstall rechecks identity and archives the successful receipt',async()=>{
 const {createPluginInstaller,createPluginInventoryReader}=await import('../src/plugin-installation.js');let installed=false,f;const official=[];
 const manager={listBundles:async()=>installed?[{name:'plug-a',version:'1.0.0',source:'plug-a@1.0.0',installed:true,enabled:true,availability:'profile',rows:[{entryId:'plug',moduleName:'plug-a'}]}]:[],listPlugins:async()=>installed?[{entryId:'plug',moduleName:'plug-a',enabled:true,fiberPhase:'active'}]:[],inspect:async()=>({status:'accepted',kind:'registry',name:'plug-a',version:'1.0.0',bundle:true}),setBundleEnabled:async()=>{throw Error('not an enable');},installBundle:async(spec,options)=>{official.push(options.requestId);const record=f.record([...f.data.rows.keys()][0]);assert.equal(record.attempt.plugins[0].requestId,options.requestId);if(official.length===2){assert.equal(record.archivedAttempts.length,1);assert.equal(record.archivedAttempts[0].plugins[0].requestId,official[0]);assert.notEqual(record.attempt.requestId,record.archivedAttempts[0].requestId);}installed=true;return{application:'applied',bundle:'plug-a',version:'1.0.0'};}};
 const ctx={get:()=>manager};f=fixture({preparePlugins:createPluginInstaller(ctx),readInstalled:createPluginInventoryReader(ctx)});const d=await detail(f);assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');const first=f.record(d.detailId).attempt;installed=false;const writes=f.data.writes;const observed=await f.service.status({detailId:d.detailId});assert.equal(observed.installation.status,'not-installed');assert.match(observed.installation.message,/卸载/);assert.equal(f.data.writes,writes);assert.equal(official.length,1);assert.equal(f.calls.resolve.length,1);
 assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');assert.equal(f.calls.resolve.length,2);assert.equal(official.length,2);assert.notEqual(official[0],official[1]);assert.deepEqual(f.record(d.detailId).archivedAttempts,[first]);
});
test('explicit reinstall rejects a changed fixed source or version without altering the old candidate or receipt',async()=>{
 for(const patch of [{spec:'plug-a@2.0.0',version:'2.0.0'},{type:'git',spec:'git+https://github.com/other/plug.git#'+'a'.repeat(40),commit:'a'.repeat(40)},{packageName:'substitute'}]){
  let resolves=0;const f=fixture({resolveDetail:async()=>({entry,candidate:resolves++?{...clone(candidate),install:{...candidate.install,...patch}}:clone(candidate),unavailableReason:''})});const d=await detail(f);await f.service.install({detailId:d.detailId});f.setInstalled({installed:false,enabled:false,active:false});const before=clone(f.data.rows.get(d.detailId));const denied=await f.service.install({detailId:d.detailId});assert.equal(denied.installation.status,'conflict');assert.equal(f.calls.prepare.length,1);assert.equal(resolves,2);assert.deepEqual(f.data.rows.get(d.detailId),before);
 }
});
test('reinstall identity ignores refreshed documentation and fetch timestamps while keeping the pinned candidate',async()=>{
 let resolves=0;const f=fixture({resolveDetail:async()=>({entry:{...entry,description:resolves?'new author text':'old author text'},candidate:{...clone(candidate),evidence:{...candidate.evidence,fetchedAt:String(resolves++)},documentation:{text:'new document '+resolves}},unavailableReason:''})});const d=await detail(f);await f.service.install({detailId:d.detailId});const original=f.record(d.detailId).candidate;f.setInstalled({installed:false,enabled:false,active:false});assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'ready');assert.equal(resolves,2);assert.deepEqual(f.record(d.detailId).candidate,original);
});
test('unresolved, approval and restart install attempts cannot resolve again or acquire a fresh reinstall claim',async()=>{
 for(const code of ['PLUGIN_INSTALL_PENDING','PLUGIN_INSTALL_APPROVAL_REQUIRED','PLUGIN_INSTALL_RESTART_REQUIRED']){
  let f;f=fixture({preparePlugins:async args=>{f.calls.prepare.push(args);await args.save([receipt({status:code==='PLUGIN_INSTALL_PENDING'?'unknown':'failed',code,installed:false,enabled:false,active:false})]);throw new FinderError(code);}});const d=await detail(f);await f.service.install({detailId:d.detailId});const before=clone(f.data.rows.get(d.detailId));await f.service.install({detailId:d.detailId});assert.equal(f.calls.resolve.length,1);assert.equal(f.calls.prepare.length,1);assert.deepEqual(f.data.rows.get(d.detailId),before);
 }
});
test('bounded archived attempts reject a further reinstall without truncating old receipts',async()=>{
 const f=fixture(),d=await detail(f);await f.service.install({detailId:d.detailId});f.setInstalled({installed:false,enabled:false,active:false});const value=f.record(d.detailId);value.archivedAttempts=Array.from({length:8},(_,i)=>({...clone(value.attempt),requestId:'old-claim-'+i,plugins:[receipt({requestId:'old-manager-'+i})]}));f.data.rows.set(d.detailId,{id:d.detailId,serialized:JSON.stringify(value)});const before=clone(f.data.rows.get(d.detailId));await assert.rejects(f.service.install({detailId:d.detailId}),e=>e.code==='HISTORY_CAPACITY');assert.deepEqual(f.data.rows.get(d.detailId),before);assert.equal(f.calls.resolve.length,1);assert.equal(f.calls.prepare.length,1);
});
test('invalid archived attempt fields fail closed before reading inventory or invoking a new install',async()=>{
 const f=fixture(),d=await detail(f);await f.service.install({detailId:d.detailId});const row=f.record(d.detailId);row.archivedAttempts=[{...clone(row.attempt),operationId:'foreign-detail'}];f.data.rows.set(d.detailId,{id:d.detailId,serialized:JSON.stringify(row)});const before=f.data.writes;await assert.rejects(f.service.status({detailId:d.detailId}),e=>e.code==='HISTORY_STORAGE_FAILED');assert.equal(f.data.writes,before);assert.equal(f.calls.prepare.length,1);
});
test('lost reinstall claim ACK keeps the previous successful receipt and cannot replay a new install',async()=>{
 const f=fixture(),d=await detail(f);await f.service.install({detailId:d.detailId});const original=f.record(d.detailId).attempt;f.setInstalled({installed:false,enabled:false,active:false});f.data.commitThenFail=true;await assert.rejects(f.service.install({detailId:d.detailId}),e=>e.code==='HISTORY_STORAGE_FAILED');f.data.commitThenFail=false;assert.deepEqual(f.record(d.detailId).archivedAttempts,[original]);assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'unknown');assert.equal(f.calls.prepare.length,1);assert.equal(f.calls.resolve.length,2);
});
test('a concurrent installed-version change during recheck stops reinstall without clearing the old success',async()=>{
 let f,resolves=0;f=fixture({resolveDetail:async()=>{if(resolves++)f.setInstalled({installed:true,enabled:true,active:true,conflict:true,version:'2.0.0'});return{entry,candidate:clone(candidate),unavailableReason:''};}});const d=await detail(f);await f.service.install({detailId:d.detailId});f.setInstalled({installed:false,enabled:false,active:false});const before=clone(f.data.rows.get(d.detailId));assert.equal((await f.service.install({detailId:d.detailId})).installation.status,'conflict');assert.deepEqual(f.data.rows.get(d.detailId),before);assert.equal(f.calls.prepare.length,1);
});

test('a decided incompatibility survives an unreadable local inventory', async () => {
  const reason = '这个版本要求 Node >=24，你现在的是 22.13。暂不能安装。';
  const f = fixture({
    resolveDetail: async input => ({
      entry: { ...entry, collection: input.collection, id: input.entryId }, candidate: null,
      compatibility: { status: 'incompatible', kind: 'node', declared: '>=24' },
      unavailableReason: reason,
    }),
    readInstalled: async () => { throw new FinderError('PLUGIN_INSTALL_INVALID'); },
    readEntryInstalled: async () => ({ installed: false, enabled: false, active: false, conflict: false, localUnknown: true }),
  });
  const d = await detail(f);
  assert.equal(d.installable, false);
  assert.deepEqual(d.compatibility, { status: 'incompatible', kind: 'node', declared: '>=24' });
  assert.equal(d.installation.status, 'unavailable');
  assert.equal(d.installation.message, reason);
  assert.equal(d.unavailableReason, reason);
  assert.equal(d.sourceRecheckAllowed, undefined);
});
