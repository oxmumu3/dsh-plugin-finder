import test from 'node:test';
import assert from 'node:assert/strict';
const {withOwnedDomain}=await import('../src/lifecycle.js').catch(()=>({}));

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
