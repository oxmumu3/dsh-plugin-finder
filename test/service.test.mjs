import test from 'node:test';
import assert from 'node:assert/strict';
const {parseIntent,parsePlan}=await import('../src/contracts.js').catch(()=>({}));
const {createFinderService}=await import('../src/service.js').catch(()=>({}));
const intent={goal:'核对 CSV 并生成周报',input:'CSV',output:'周报',constraints:['不连接外部账号'],capabilities:['核对数据','生成报告'],queries:['csv','report']};
const plugins=[{id:'quality',name:'quality',title:'质量',summary:'检查 CSV',capabilities:['核对数据'],requirements:{},install:{spec:'quality@1.0.0',version:'1.0.0'},evidence:{metadata:'verified',installation:'not-tested',task:'not-tested',sources:[]}},{id:'report',name:'report',title:'报告',summary:'报告',capabilities:['生成报告'],requirements:{},install:{spec:'report@1.0.0',version:'1.0.0'},evidence:{metadata:'verified',installation:'not-tested',task:'not-tested',sources:[]}}];
const discover=items=>({search:async()=>({candidates:items,sources:[{id:'fixture',status:'live',url:'https://example.org/index.json'}],warnings:[],searchedAt:'2026-10-20T00:00:00Z'})});
const basePlan={kind:'combo',title:'先检查再汇报',rationale:'两项不同分工',pluginIds:['quality','report'],steps:[{capability:'核对数据',owner:'quality',sourceCapability:'核对数据',action:'检查',input:'CSV',output:'检查清单'},{capability:'生成报告',owner:'report',sourceCapability:'生成报告',action:'报告',input:'检查清单',output:'周报'}],limits:['业务口径待确认']};
test('intent keeps explicit task constraints and rejects oversized requests',()=>{
  assert.equal(typeof parseIntent,'function');assert.deepEqual(parseIntent(JSON.stringify(intent)),intent);
  assert.throws(()=>parseIntent({...intent,goal:'x'.repeat(6001)}),/输入|格式/);
  assert.throws(()=>parseIntent({...intent,queries:Array(20).fill('q')}));
});
test('plans cannot invent or duplicate plugin IDs',()=>{
  assert.equal(typeof parsePlan,'function');
  assert.equal(parsePlan(basePlan,plugins,intent).pluginIds.length,2);
  assert.throws(()=>parsePlan({...basePlan,pluginIds:['unknown']},plugins,intent));
  assert.throws(()=>parsePlan({...basePlan,pluginIds:['quality','quality']},plugins,intent));
});
test('native and gap decisions cannot smuggle installation candidates',()=>{
  for(const kind of ['native','gap'])assert.throws(()=>parsePlan({...basePlan,kind},plugins,intent));
  const gap=parsePlan({...basePlan,kind:'gap',pluginIds:[],steps:[]},plugins,intent);assert.equal(gap.kind,'gap');
});
test('combination must have two distinct used candidates and cover requested capabilities',()=>{
  assert.throws(()=>parsePlan({...basePlan,pluginIds:['quality']},plugins,intent));
  assert.throws(()=>parsePlan({...basePlan,steps:basePlan.steps.slice(0,1)},plugins,intent));
  assert.throws(()=>parsePlan({...basePlan,steps:[{...basePlan.steps[0],owner:'unknown'},basePlan.steps[1]]},plugins,intent));
});
test('service uses discovered source records and deterministic safe handoff text',async()=>{
  assert.equal(typeof createFinderService,'function');
  const calls=[];const model={status:()=>({configured:true,label:'configured-model'}),async call(arg){calls.push(arg);return{text:JSON.stringify(calls.length===1?intent:basePlan),model:{label:'configured-model'}};}};
  const svc=createFinderService({discovery:discover(plugins),catalog:{generatedAt:'2026-10-20T00:00:00Z',plugins},model,search:()=>plugins,hostVersion:'0.2.1-rc.2'});
  const understood=await svc.analyze({request:'按我的 CSV 做周报，不连接外部账号'});assert.deepEqual(understood.intent,intent);
  const result=await svc.recommend({intent:understood.intent});assert.deepEqual(result.candidates.map(p=>p.id),['quality','report']);
  assert.ok(result.plan.nextPrompt.includes('核对 CSV'));assert.ok(result.plan.nextPrompt.includes('quality@1.0.0'));
  assert.ok(result.plan.limits.some(s=>s.includes('未')));assert.equal(calls.length,2);
  assert.ok(calls[1].system.includes('不可信'));assert.ok(!result.plan.nextPrompt.includes('已验证可用'));
});
test('successful discovery with no matches supports a model-native or gap decision, without invented candidates',async()=>{
  let called=false;const svc=createFinderService({discovery:discover([]),catalog:{plugins:[]},model:{status:()=>({configured:true}),call:async()=>{called=true;return {text:JSON.stringify({...basePlan,kind:'gap',pluginIds:[],steps:[]}),model:{label:'configured'}};}},search:()=>[]});
  const result=await svc.recommend({intent});assert.equal(result.plan.kind,'gap');assert.deepEqual(result.plan.pluginIds,[]);assert.equal(called,true);
});
test('feedback is explicit bounded local data; unknown IDs are rejected',async()=>{
  const saved=[];const svc=createFinderService({discovery:discover(plugins),catalog:{plugins},model:{status:()=>({configured:false})},feedbackStore:{append:async row=>saved.push(row)},search:()=>plugins});
  assert.deepEqual(await svc.feedback({outcome:'partial',pluginIds:['quality'],note:'口径仍需人工核对',stage:'result'}),{saved:true});
  assert.equal(saved.length,1);assert.equal(saved[0].outcome,'partial');assert.equal(saved[0].request,undefined);
  await assert.rejects(svc.feedback({outcome:'complete',pluginIds:['invented'],note:'',stage:'result'}));
});
test('plugin steps must cite a capability declared in their source metadata',()=>{
  assert.equal(parsePlan(basePlan,plugins,intent).steps[0].sourceCapability,'核对数据');
  assert.throws(()=>parsePlan({...basePlan,steps:[{...basePlan.steps[0],sourceCapability:'生成视频'},basePlan.steps[1]]},plugins,intent));
});
test('generated text cannot reverse the fixed not-tested proof state',()=>{
  assert.throws(()=>parsePlan({...basePlan,title:'已验证可用方案'},plugins,intent));
});
test('explicit no-key constraints enter deterministic retrieval filters',async()=>{
  const args=[];const svc=createFinderService({discovery:discover(plugins),catalog:{plugins},model:{status:()=>({configured:true}),call:async()=>({text:JSON.stringify({...basePlan,kind:'gap',pluginIds:[],steps:[]})})},search:(_catalog,options)=>{args.push(options);return[];}});
  const result=await svc.recommend({intent:{...intent,constraints:['不要额外 API Key']}});
  assert.ok(args.every(options=>options.requiresNoApiKey===true));assert.ok(result.eligibility.filters.length);
});
test('checking whether a plugin is installed is not an installation attestation',()=>{
  assert.equal(parsePlan({...basePlan,rationale:'先确认候选是否已安装，并核对其构建条件；当前没有安装验收。'},plugins,intent).kind,'combo');
});
test('negative verification statements in rationale remain valid advisory limits',()=>{
  for(const rationale of ['未经实测，不能保证可用','没有已验证的组合','not verified working','尚不能声称完全免费'])assert.equal(parsePlan({...basePlan,rationale},plugins,intent).kind,'combo');
});
test('live discovery receives Key eligibility before candidate slots fill and persists source coverage',async()=>{
  let received,modelData;const sourceCoverage=[{sourceId:'awesome',url:'https://awesome-dsh-plugin.com/plugins.json',status:'live',total:6200,npmTotal:3100,githubOnlyTotal:3100,matched:200,inspected:12,resolved:9,excluded:6,uninspected:188,inspectionBudget:24}];
  const coverage={matched:200,inspected:12,resolved:9,excluded:6,uninspected:188,returned:0,inspectionBudget:24};
  const svc=createFinderService({discovery:{search:async input=>{received=input;return {candidates:[],sources:[{id:'awesome',status:'live'}],sourceCoverage,coverage,warnings:[],searchedAt:'2026-10-20T00:00:00Z'};}},model:{status:()=>({configured:true}),call:async input=>{modelData=input.data;return{text:JSON.stringify({...basePlan,kind:'gap',pluginIds:[],steps:[]})};}}});
  const result=await svc.recommend({intent:{...intent,constraints:['不要额外 API Key']}});
  assert.equal(received.requiresNoApiKey,true);assert.deepEqual(result.discovery.coverage,coverage);assert.deepEqual(result.discovery.sourceCoverage,sourceCoverage);assert.deepEqual(modelData.discovery.sourceCoverage,sourceCoverage);
});
test('rich recommendation preserves every capability while requesting compact output with reasoning headroom',async()=>{
 let call;const svc=createFinderService({discovery:discover([]),model:{status:()=>({configured:true}),call:async arg=>{call=arg;return{text:JSON.stringify({...basePlan,kind:'gap',pluginIds:[],steps:[]})};}}});
 await svc.recommend({intent});assert.equal(call.maxTokens,12000);assert.match(call.system,/简洁输出/);assert.match(call.system,/覆盖intent.capabilities中的每一项/);assert.deepEqual(call.data.intent.capabilities,intent.capabilities);
});
