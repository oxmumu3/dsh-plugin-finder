import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {registerFinderRoutes} from '../src/routes.js';

const intent={goal:'转换文档格式',input:'工作区 Markdown',output:'PDF 文档',constraints:[],capabilities:['文档格式转换'],queries:['document conversion','markdown pdf']};
const outside={id:'outside-seed',name:'outside-seed',summary:'作者声明：文档格式转换',capabilities:['文档格式转换'],requirements:{extraApiKey:'unknown'},install:{spec:'outside-seed@2.0.0',version:'2.0.0',readiness:'metadata-only'},evidence:{metadata:'source-declared',installation:'not-tested',task:'not-tested',sources:[{url:'https://example.org/index.json'}]},documentation:{url:'https://example.org/README.md',text:'作者公开说明：支持 Markdown 转换为 PDF。'}};
const plan={kind:'single',title:'转换文档格式',rationale:'作者说明支持目标格式；实际运行仍需验证',pluginIds:[outside.id],steps:[{capability:intent.capabilities[0],owner:outside.id,sourceCapability:outside.capabilities[0],action:'核对材料后转换',input:'Markdown',output:'PDF'}],limits:['先核对安装和格式支持']};
const sources=[{id:'curated',title:'公开精选源',url:'https://example.org/index.json',status:'live',total:100,fetchedAt:'2026-10-20T00:00:00Z'}];
const response={candidates:[outside],sources,warnings:[],searchedAt:'2026-10-20T00:00:00Z'};
const model=(calls=[])=>({status:()=>({configured:true}),call:async arg=>{calls.push(arg);return{text:JSON.stringify(plan),model:{label:'host'}};}});

test('task recommendation discovers and understands a plugin outside the bundled seed',async()=>{
  const calls=[],requests=[];
  const service=createFinderService({catalog:{plugins:[]},discovery:{search:async arg=>{requests.push(arg);return response;}},model:model(calls)});
  const result=await service.recommend({intent});
  assert.equal(requests.length,1);
  assert.deepEqual(requests[0].intent,intent);
  assert.equal(result.plan.pluginIds[0],'outside-seed');
  assert.deepEqual(result.discovery.sources,sources);
  assert.equal(calls[0].data.candidates[0].documentation.text,outside.documentation.text);
  assert.ok(result.plan.nextPrompt.includes(outside.install.spec));
});

test('discovery failure cannot become a no-plugin result or trigger a model gap judgment',async()=>{
  const calls=[];
  const service=createFinderService({catalog:{plugins:[outside]},discovery:{search:async()=>{throw Object.assign(new Error('private-provider-path'),{code:'DISCOVERY_UNAVAILABLE'});}},model:model(calls)});
  await assert.rejects(service.recommend({intent}),error=>error.code==='DISCOVERY_UNAVAILABLE');
  assert.equal(calls.length,0);
});

test('partial discovery failures stay visible and are included in recommendation limits',async()=>{
  const warning='GitHub 来源暂不可用，搜索覆盖不完整';
  const service=createFinderService({catalog:{plugins:[]},discovery:{search:async()=>({...response,sources:[...sources,{id:'github',title:'GitHub',url:'https://api.github.com',status:'failed'}],warnings:[warning]})},model:model()});
  const result=await service.recommend({intent});
  assert.ok(result.discovery.warnings.includes(warning));
  assert.ok(result.plan.limits.includes(warning));
});

test('local feedback accepts discovered IDs but never arbitrary IDs',async()=>{
  const saved=[];
  const service=createFinderService({catalog:{plugins:[]},discovery:{search:async()=>response},model:model(),feedbackStore:{append:async row=>saved.push(row)}});
  await service.recommend({intent});
  assert.deepEqual(await service.feedback({outcome:'partial',pluginIds:[outside.id],note:'合成测试',stage:'plan'}),{saved:true});
  assert.equal(saved[0].pluginIds[0],outside.id);
  await assert.rejects(service.feedback({outcome:'partial',pluginIds:['made-up']}));
});

test('native-only requests explicitly skip discovery, rather than pretending the source has no plugins',async()=>{
  let searches=0;
  const service=createFinderService({catalog:{plugins:[]},discovery:{search:async()=>{searches++;return response;}},model:{status:()=>({configured:true}),call:async()=>({text:JSON.stringify({...plan,kind:'native',pluginIds:[],steps:[{...plan.steps[0],owner:'dsh',sourceCapability:null}]})})}});
  const result=await service.recommend({intent:{...intent,constraints:['不要安装插件']}});
  assert.equal(searches,0);
  assert.equal(result.discovery.skipped,'native-only');
});

test('HTTP discovery errors retain the safe search-specific recovery message',async()=>{
  const routes=[];
  const service=createFinderService({catalog:{plugins:[]},discovery:{search:async()=>{throw Object.assign(new Error('secret remote path'),{code:'DISCOVERY_UNAVAILABLE'});}},model:model()});
  registerFinderRoutes({get:()=>({fetch:{register:route=>{routes.push(route);return()=>{};}}}),effect:fn=>fn()},service);
  const route=routes.find(r=>r.path.endsWith('/recommend'));
  const res=await route.fetch(new Request('http://localhost'+route.path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({intent})}));
  assert.equal(res.status,503);
  const body=await res.json();assert.equal(body.error.code,'DISCOVERY_UNAVAILABLE');assert.match(body.error.message,/搜索/);assert.doesNotMatch(body.error.message,/secret|private/);
});

test('eligibility filtering preserves discovery relevance beyond twenty candidates',async()=>{
  const many=[outside,...Array.from({length:25},(_,index)=>({...outside,id:'aaa-'+index,name:'aaa-'+index}))];
  const service=createFinderService({discovery:{search:async()=>({...response,candidates:many})},model:model()});
  const result=await service.recommend({intent});
  assert.equal(result.candidates[0].id,outside.id);
  assert.equal(result.plan.pluginIds[0],outside.id);
});

test('the whole discovery phase has a bounded deadline before any model judgment',async()=>{
  const calls=[];
  const service=createFinderService({discoveryTimeoutMs:5,discovery:{search:({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')),{once:true}))},model:model(calls)});
  let timer;
  try {
    await assert.rejects(Promise.race([service.recommend({intent,signal:new AbortController().signal}),new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('discovery did not terminate')),100);})]),error=>error.code==='DISCOVERY_UNAVAILABLE');
    assert.equal(calls.length,0);
  } finally {clearTimeout(timer);service.close();}
});
