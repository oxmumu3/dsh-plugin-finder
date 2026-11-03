import test from 'node:test';
import assert from 'node:assert/strict';
const {createAgentModelAdapter}=await import('../src/agent-model.js').catch(()=>({}));
test('Agent planning receives verified runtime facts and task continuation policy without changing the shared model',async()=>{
  assert.equal(typeof createAgentModelAdapter,'function');let seen;const model={status:()=>({configured:true}),call:async request=>{seen=request;return{text:'ok'};}};
  const original={system:'Return exact schema.',data:{goal:'需要工作区内交互表格'},signal:new AbortController().signal};const before=structuredClone(original.data);
  const adapter=createAgentModelAdapter(model,{readRuntime:async()=>({status:'available',plugins:[{name:'already-here',version:'1.0.0',installed:true,enabled:true}]})});
  assert.deepEqual(await adapter.call(original),{text:'ok'});assert.deepEqual(original.data,before);assert.equal(original.system,'Return exact schema.');
  assert.equal(seen.data.agentRuntime.plugins[0].name,'already-here');assert.match(seen.system,/全部必需插件/);assert.match(seen.system,/原任务/);assert.match(seen.system,/gap/);assert.equal(seen.signal,original.signal);
  assert.match(seen.system,/部分[^。]*复用[^。]*hybrid/u);
  assert.match(seen.system,/hybrid[^。]*只[^。]*缺失/u);
  assert.match(seen.system,/只有[^。]*没有[^。]*复用[^。]*gap/u);
  assert.doesNotMatch(seen.system,/无法闭合[^。]*返回具体 gap/u);
});
test('runtime read failure is unknown evidence rather than claiming all plugins missing',async()=>{let seen;const adapter=createAgentModelAdapter({call:async request=>{seen=request;return{};}},{readRuntime:async()=>{throw Error('private details');}});await adapter.call({system:'Schema',data:{},signal:new AbortController().signal});assert.equal(seen.data.agentRuntime.status,'unknown');assert.ok(!JSON.stringify(seen).includes('private details'));});
test('context budgets never truncate the task or original restrictions',async()=>{let seen;const original={request:'x'.repeat(99000),constraints:['原始限制']};const adapter=createAgentModelAdapter({call:async request=>{seen=request;return{};}},{readRuntime:async()=>({status:'available',plugins:Array(64).fill({name:'y'.repeat(100),source:'z'.repeat(2000)})})});await adapter.call({system:'Schema',data:original});assert.equal(seen.data.request,original.request);assert.deepEqual(seen.data.constraints,original.constraints);assert.ok(JSON.stringify(seen.data).length<=100000);assert.notEqual(seen.data.agentRuntime?.status,'available');});
test('aborted runtime analysis does not call the model or change state',async()=>{let called=0;const signal=AbortSignal.abort();const adapter=createAgentModelAdapter({call:async()=>{called++;}},{readRuntime:async()=>({})});await assert.rejects(adapter.call({system:'Schema',data:{},signal}));assert.equal(called,0);});
