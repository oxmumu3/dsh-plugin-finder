import test from 'node:test';
import assert from 'node:assert/strict';
const {registerFinderRoutes}=await import('../src/routes.js').catch(()=>({}));
const {createFeedbackStore}=await import('../src/feedback.js').catch(()=>({}));
test('routes register only owned authenticated paths and expose real bootstrap',async()=>{
  assert.equal(typeof registerFinderRoutes,'function');const routes=[];let disposed=0;
  const ctx={get:n=>n==='connection'?{fetch:{register:r=>{routes.push(r);return()=>disposed++;}}}:null,effect:fn=>fn()};
  const stop=registerFinderRoutes(ctx,{bootstrap:()=>({catalog:{count:12}}),analyze:async({request})=>({intent:{goal:request}}),recommend:async()=>({}),feedback:async()=>({saved:true})});
  assert.ok(routes.length>=4);assert.ok(routes.every(r=>r.path.startsWith('/api/plugin_finder/')));
  const get=routes.find(r=>r.path.endsWith('/bootstrap'));const response=await get.fetch(new Request('http://local'+get.path));assert.equal((await response.json()).catalog.count,12);
  stop();assert.equal(disposed,routes.length);assert.equal((await get.fetch(new Request('http://local'+get.path))).status,503);
});
test('invalid body/method is rejected before invoking a model',async()=>{
  const routes=[];let called=0;const ctx={get:()=>({fetch:{register:r=>{routes.push(r);return()=>{};}}}),effect:fn=>fn()};
  registerFinderRoutes(ctx,{analyze:async()=>{called++;return{};},bootstrap:()=>({})});const route=routes.find(r=>r.path.endsWith('/analyze'));
  assert.equal((await route.fetch(new Request('http://local'+route.path,{method:'GET'}))).status,405);
  assert.equal((await route.fetch(new Request('http://local'+route.path,{method:'POST',body:'{}'}))).status,415);
  assert.equal((await route.fetch(new Request('http://local'+route.path,{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(40000)}))).status,413);
  assert.equal((await route.fetch(new Request('http://local'+route.path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}))).status,400);assert.equal(called,0);
});
test('adapter failures do not disclose credentials, paths or server internals',async()=>{
  const routes=[];const ctx={get:()=>({fetch:{register:r=>{routes.push(r);return()=>{};}}}),effect:fn=>fn()};
  registerFinderRoutes(ctx,{analyze:async()=>{throw Error('secret-value-and-private-path');}});const route=routes.find(r=>r.path.endsWith('/analyze'));
  const response=await route.fetch(new Request('http://local'+route.path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"request":"hello"}'}));const body=await response.text();assert.ok(!body.includes('secret-value'));assert.ok(body.includes('MODEL_REQUEST_FAILED'));
});
test('explicit feedback writes are serialized and bounded',async()=>{
  assert.equal(typeof createFeedbackStore,'function');let data=null;
  const store=createFeedbackStore({read:async()=>{await new Promise(r=>setTimeout(r,1));return data;},write:async v=>{data=structuredClone(v);}});
  await Promise.all(Array.from({length:105},(_,i)=>store.append({id:String(i),outcome:'partial',note:'test'})));
  const rows=await store.list();assert.equal(rows.length,100);assert.equal(rows.at(-1).id,'104');assert.equal(new Set(rows.map(r=>r.id)).size,100);
});
