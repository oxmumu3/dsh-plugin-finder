import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinderService} from '../src/service.js';
import {extractEligibility} from '../src/eligibility.js';

const raw={goal:'在侧栏预览 Mermaid 图',input:'本地 Markdown',output:'可视化流程图',constraints:['先不要修改文件','只做发现与说明，不安装、不写文件','不访问链接，不调用工具','不编造插件来源'],capabilities:['渲染 Mermaid 图'],queries:['markdown mermaid']};
test('system operating rules cannot become invented user constraints that disable discovery',async()=>{
  const service=createFinderService({model:{status:()=>({configured:true}),call:async()=>({text:JSON.stringify(raw)})}});
  const result=await service.analyze({request:'我要在侧栏预览 Markdown 的 Mermaid 图，请找合适的插件，先不要修改文件。'});
  assert.deepEqual(result.intent.constraints,['先不要修改文件']);
  assert.equal(extractEligibility(result.intent.constraints).nativeOnly,false);
  assert.match(result.analysisWarning,/原始需求/);
});

test('an explicit user installation ban remains a hard condition',async()=>{
  const service=createFinderService({model:{status:()=>({configured:true}),call:async()=>({text:JSON.stringify({...raw,constraints:['不要安装插件']})})}});
  const result=await service.analyze({request:'不要安装插件，仅用已有能力预览图。'});
  assert.equal(extractEligibility(result.intent.constraints).nativeOnly,true);
});

test('harmless extra analysis fields do not discard a complete six-field intent',async()=>{
  const service=createFinderService({model:{status:()=>({configured:true}),call:async()=>({text:JSON.stringify({...raw,constraints:[],confidence:0.9})})}});
  const result=await service.analyze({request:'预览 Mermaid 图'});
  assert.equal(result.intent.goal,raw.goal);assert.equal(result.intent.confidence,undefined);
});
