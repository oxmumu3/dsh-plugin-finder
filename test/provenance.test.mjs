import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {createDiscovery} from '../src/discovery.js';

const secret='synthetic-private-market-token';
const privateUrl=`https://user:password@team.example/index.json?token=${secret}#private-fragment`;
const intent={goal:'预览图表',input:'Markdown',output:'图和公式',constraints:[],capabilities:['预览图表'],queries:['markdown mermaid']};
const spec=`git+https://github.com/author/preview.git#${'a'.repeat(40)}&path:/plugin`;
const candidate={id:'new-preview',name:'new-preview',summary:'预览图表',capabilities:['预览图表'],requirements:{},install:{spec,version:'1.0.0',registry:`https://user:password@registry.npmjs.org/?token=${secret}#private-fragment`},homepage:privateUrl,sourceTags:[{url:privateUrl,error:`request ${privateUrl} failed with ${secret}`}],documentation:{url:privateUrl,text:'作者声明支持图表'},evidence:{metadata:'manifest-checked',installation:'not-tested',task:'not-tested',sources:[{url:privateUrl}]}};
const source={id:'live',status:'live',url:privateUrl,queryUrl:privateUrl,error:`request ${privateUrl} failed with ${secret}`};
const plan={kind:'single',title:'预览图表',rationale:'作者资料声明支持',pluginIds:[candidate.id],steps:[{capability:'预览图表',owner:candidate.id,sourceCapability:'预览图表',action:'预览合成文档',input:'Markdown',output:'图和公式'}],limits:['首次运行待验证']};
const noSecrets=value=>{const json=JSON.stringify(value);for(const forbidden of [secret,'user:password','private-fragment'])assert.ok(!json.includes(forbidden),`unexpected private source data: ${forbidden}`);};

test('source credentials stay out of model payload, UI result and saved workflow without changing pinned install specs',async()=>{
  const discovered={candidates:[structuredClone(candidate)],sources:[structuredClone(source)],warnings:[`来源已过期：${privateUrl}`],searchedAt:'2026-10-20T00:00:00Z'};
  let payload,stored;
  const service=createFinderService({discovery:{search:async()=>discovered},model:{status:()=>({configured:true}),call:async value=>{payload=value.data;return{text:JSON.stringify(plan)};}},workflowStore:{write:async value=>{stored=value;}}});
  const result=await service.recommend({intent});
  noSecrets(payload);noSecrets(result);noSecrets(JSON.parse(stored.serialized));
  assert.equal(result.candidates[0].install.spec,spec);
  assert.equal(result.candidates[0].install.registry,'https://registry.npmjs.org/');
  assert.equal(result.discovery.sources[0].url,'https://team.example/index.json');
  assert.equal(result.candidates[0].evidence.sources[0].url,'https://team.example/index.json');
  assert.ok(discovered.sources[0].url.includes(secret),'projection must not modify the discovery/host source');
});

test('restored legacy source metadata is safe before it reaches the UI and performs no model request',async()=>{
  const legacy={format:2,stage:'plan',request:'保留原来的用户需求',intent,candidates:[candidate],discovery:{sources:[source]},warnings:[`来源已过期：${privateUrl}`],plan:{...plan,limits:[`来源已过期：${privateUrl}`],nextPrompt:`旧来源 ${privateUrl}`}};
  const service=createFinderService({workflowStore:{read:async()=>({serialized:JSON.stringify(legacy)})},model:{status:()=>({configured:true}),call:async()=>{throw Error('must not call the model');}}});
  const result=await service.bootstrap();
  assert.equal(result.workflow.request,legacy.request);
  noSecrets(result.workflow);
  assert.equal(result.workflow.candidates[0].install.spec,spec);
  assert.ok(result.workflow.plan.nextPrompt.includes(spec));
});

test('native market search retains its private configured URL internally while its outward metadata is redacted',async()=>{
  const configuredUrl=`https://team.example/index.json?token=${secret}`;const calls=[];
  const discovery=createDiscovery({market:{listIndexes:()=>[{url:configuredUrl,title:'Team'},{url:configuredUrl+'&broken=1',title:'Broken'}],search:async url=>{calls.push(url);if(url.endsWith('broken=1'))throw Error(`failed ${url}; token=${secret}`);return{total:0,entries:[]};}},fetchImpl:async input=>new Response(JSON.stringify(String(input).includes('awesome-dsh-plugin.com')?{format:1,plugins:[]}:{total_count:0,items:[]}))});
  let payload;
  const nativePlan={kind:'native',title:'整理图表说明',rationale:'先整理当前信息',pluginIds:[],steps:[{capability:'预览图表',owner:'dsh',sourceCapability:null,action:'核对已有预览能力',input:'Markdown',output:'可用能力说明'}],limits:['宿主实际能力待核对']};
  const service=createFinderService({discovery,model:{status:()=>({configured:true}),call:async value=>{payload=value.data;return{text:JSON.stringify(nativePlan)};}}});
  const result=await service.recommend({intent});
  assert.deepEqual(calls,[configuredUrl,configuredUrl+'&broken=1']);
  noSecrets(payload);noSecrets(result);
  assert.equal(result.discovery.sources.find(value=>value.title==='Broken').status,'failed');
  assert.ok(result.discovery.sources.find(value=>value.title==='Broken').error);
  service.close();
});
