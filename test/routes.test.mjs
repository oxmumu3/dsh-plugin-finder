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

test('history routes retain exact task and revision identity without a model or installation side effect',async()=>{
  const routes=[],called=[];const ctx={get:()=>({fetch:{register:r=>{routes.push(r);return()=>{};}}}),effect:fn=>fn()};
  const service=Object.fromEntries(['history','open','refine','handoff','importBackup','exportTask'].map(name=>[name,async body=>{called.push({name,body});return{ok:true};}]));
  registerFinderRoutes(ctx,service);
  for(const [path,name] of [['history','history'],['open','open'],['refine','refine'],['handoff','handoff'],['import','importBackup'],['export','exportTask']]){
    const route=routes.find(r=>r.path.endsWith('/'+path));assert.ok(route,'missing '+path);
    const response=await route.fetch(new Request('http://local'+route.path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({taskId:'task-a',revisionId:'rev-a'})}));
    assert.equal(response.status,200);assert.equal(called.at(-1).name,name);assert.equal(called.at(-1).body.taskId,'task-a');assert.equal(called.at(-1).body.revisionId,'rev-a');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});

test('a local backup larger than an ordinary request can roundtrip through the bounded import route',async()=>{
  const routes=[];let imported=false;const ctx={get:()=>({fetch:{register:r=>{routes.push(r);return()=>{};}}}),effect:fn=>fn()};
  registerFinderRoutes(ctx,{importBackup:async()=>{imported=true;return{imported:true};},analyze:()=>assert.fail('oversized analysis must not call model')});
  const body=JSON.stringify({workflow:{text:'原始研究'.repeat(15000)},origin:'本机备份.json'});
  const request=route=>new Request('http://local'+route.path,{method:'POST',headers:{'Content-Type':'application/json'},body});
  const route=routes.find(r=>r.path.endsWith('/import'));assert.ok(route);
  assert.equal((await route.fetch(request(route))).status,200);assert.equal(imported,true);
  const analyze=routes.find(r=>r.path.endsWith('/analyze'));assert.equal((await analyze.fetch(request(analyze))).status,413);
});


test('new-request route forwards exact current task and revision identity',async()=>{
  const handlers=new Map();let seen;const ctx={get:()=>({fetch:{register:spec=>{handlers.set(spec.path,spec.fetch);return()=>{};}}}),effect:()=>{}};
  registerFinderRoutes(ctx,{reset:async input=>{seen=input;return{cleared:true};}});
  const result=await handlers.get('/api/plugin_finder/reset')(new Request('http://local/api/plugin_finder/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({taskId:'task-a',revisionId:'revision-a'})}));
  assert.equal(result.status,200);assert.equal(seen.taskId,'task-a');assert.equal(seen.revisionId,'revision-a');
});
