import test from 'node:test';
import assert from 'node:assert/strict';
const {withOwnedDomain}=await import('../src/lifecycle.js').catch(()=>({}));
const {withOwnedDomains}=await import('../src/lifecycle.js').catch(()=>({}));

function owner(){let opened=false,closed=0;const effects=[];return{effects,get closed(){return closed;},ctx:{storageDomain:{open:async()=>{if(opened)throw Error('already-open');opened=true;return{close:async()=>{opened=false;closed++;}};}},effect:factory=>effects.push(factory())}};}

test('plugin disable releases its domain so the same plugin can be enabled again',async()=>{
  assert.equal(typeof withOwnedDomain,'function');const value=owner();let stops=0;
  await withOwnedDomain(value.ctx,{name:'finder'},async()=>()=>{stops++;});
  await value.effects[0]();assert.equal(value.closed,1);assert.equal(stops,1);
  await withOwnedDomain(value.ctx,{name:'finder'},async()=>()=>{});
  await value.effects[1]();assert.equal(value.closed,2);
});

test('failed initialization releases only the domain it acquired',async()=>{
  assert.equal(typeof withOwnedDomain,'function');const value=owner();
  await assert.rejects(withOwnedDomain(value.ctx,{name:'finder'},async()=>{throw Error('setup failed');}),/setup failed/);
  assert.equal(value.closed,1);
});

test('a failing service shutdown still releases the owned domain exactly once',async()=>{
  assert.equal(typeof withOwnedDomain,'function');const value=owner();
  await withOwnedDomain(value.ctx,{name:'finder'},async()=>()=>{throw Error('shutdown failed');});
  await assert.rejects(value.effects[0](),/shutdown failed/);assert.equal(value.closed,1);
  await value.effects[0]();assert.equal(value.closed,1);
});

test('history and legacy domains release after routes stop and can both reopen',async()=>{
  assert.equal(typeof withOwnedDomains,'function');
  const events=[],effects=[],open=new Set();
  const ctx={storageDomain:{open:async spec=>{assert.equal(open.has(spec.name),false);open.add(spec.name);return{name:spec.name,close:async()=>{events.push('close:'+spec.name);open.delete(spec.name);}};}},effect:fn=>effects.push(fn())};
  await withOwnedDomains(ctx,[{name:'legacy'},{name:'history'}],async handles=>{assert.deepEqual(handles.map(x=>x.name),['legacy','history']);return()=>events.push('stop');});
  await effects[0]();assert.deepEqual(events,['stop','close:history','close:legacy']);assert.equal(open.size,0);
  await effects[0]();assert.equal(events.length,3);
});

test('a failed history domain open releases acquired legacy without touching an unowned domain',async()=>{
  assert.equal(typeof withOwnedDomains,'function');
  const closed=[];
  const ctx={storageDomain:{open:async spec=>{if(spec.name==='history')throw Error('already-open');return{close:async()=>closed.push(spec.name)};}},effect:()=>assert.fail('failed setup cannot register a disposer')};
  await assert.rejects(withOwnedDomains(ctx,[{name:'legacy'},{name:'history'}],async()=>assert.fail('setup must not run')),/already-open/);
  assert.deepEqual(closed,['legacy']);
});

test('all acquired domains are released even if shutdown and one close fail',async()=>{
  assert.equal(typeof withOwnedDomains,'function');const closed=[],effects=[];
  const ctx={storageDomain:{open:async spec=>({close:async()=>{closed.push(spec.name);if(spec.name==='history')throw Error('close failed');}})},effect:fn=>effects.push(fn())};
  await withOwnedDomains(ctx,[{name:'legacy'},{name:'history'}],async()=>()=>{throw Error('shutdown failed');});
  await assert.rejects(effects[0]());assert.deepEqual(closed,['history','legacy']);
  await effects[0]();assert.equal(closed.length,2);
});
