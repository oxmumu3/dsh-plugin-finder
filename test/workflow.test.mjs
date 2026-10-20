import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';

const intent={goal:'预览图表',input:'Markdown',output:'图和公式',constraints:[],capabilities:['预览图表'],queries:['markdown mermaid']};
const candidate={id:'new-preview',name:'new-preview',summary:'预览图表',capabilities:['预览图表'],install:{spec:'new-preview@1.0.0',version:'1.0.0'},requirements:{},evidence:{metadata:'manifest-checked',installation:'not-tested',task:'not-tested'}};
const plan={kind:'single',title:'预览图表',rationale:'作者资料声明支持',pluginIds:[candidate.id],steps:[{capability:'预览图表',owner:candidate.id,sourceCapability:'预览图表',action:'打开合成文档预览',input:'Markdown',output:'图和公式'}],limits:['首次运行待验证']};
const discovery={search:async()=>({candidates:[candidate],sources:[{id:'live',status:'live'}],warnings:[],searchedAt:'2026-10-20T00:00:00Z'})};
function store(){let row=null;return{read:async()=>row,write:async value=>{row=structuredClone(value);},clear:async()=>{row=null;}};}
function model(){let calls=0;return{status:()=>({configured:true}),call:async()=>({text:JSON.stringify(++calls===1?intent:plan),model:{label:'host'}})};}

test('a host restart restores the current understood task and recommendation without a new model call',async()=>{
  const workflowStore=store();const first=createFinderService({workflowStore,discovery,model:model()});
  await first.analyze({request:'请在侧栏预览这个Markdown的图表'});
  await first.recommend({intent});first.close();
  const restored=createFinderService({workflowStore,discovery,model:{status:()=>({configured:true}),call:async()=>{throw new Error('must not call model');}}});
  const value=await restored.bootstrap();
  assert.equal(value.workflow.stage,'plan');assert.match(value.workflow.request,/侧栏/);assert.equal(value.workflow.plan.pluginIds[0],candidate.id);assert.equal(value.workflow.candidates[0].install.spec,candidate.install.spec);
});

test('task understanding is recoverable before the recommendation step',async()=>{
  const workflowStore=store();const first=createFinderService({workflowStore,discovery,model:model()});
  await first.analyze({request:'预览图表'});
  const second=createFinderService({workflowStore,discovery,model:model()});
  assert.equal((await second.bootstrap()).workflow.stage,'understand');
});

test('new-request reset removes the persisted task instead of restoring an old plan later',async()=>{
  const workflowStore=store();const service=createFinderService({workflowStore,discovery,model:model()});
  await service.analyze({request:'预览图表'});await service.reset();
  assert.equal((await service.bootstrap()).workflow,undefined);
});

test('local persistence failure does not discard an otherwise valid model response',async()=>{
  const service=createFinderService({workflowStore:{read:async()=>null,write:async()=>{throw Error('private path');}},discovery,model:model()});
  const result=await service.analyze({request:'预览图表'});
  assert.deepEqual(result.intent,intent);assert.match(result.workflowWarning,/保存/);assert.doesNotMatch(result.workflowWarning,/private/);
});

test('malformed local workflow is ignored safely instead of breaking bootstrap',async()=>{
  const service=createFinderService({workflowStore:{read:async()=>({serialized:'{bad'})},discovery,model:model()});
  const result=await service.bootstrap();assert.equal(result.workflow,undefined);assert.match(result.workflowWarning,/恢复/);
});

test('a reset storage failure is explicit and does not claim the record was cleared',async()=>{
  const service=createFinderService({workflowStore:{read:async()=>null,clear:async()=>{throw Error('private path');}},discovery,model:model()});
  await assert.rejects(service.reset(),error=>error.code==='WORKFLOW_STORAGE_FAILED'&&!error.message.includes('private'));
});
