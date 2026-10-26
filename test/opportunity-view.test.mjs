import assert from 'node:assert/strict';
import test from 'node:test';
import {renderOpportunityCard,renderOpportunitySettings} from '../src/opportunity-view.js';
const h=(type,props,...children)=>({type,props:props||{},children});
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(' '):n&&typeof n==='object'?text(n.children):String(n??'');
const op={consent:{enabled:false,epoch:1},status:'idle',opportunities:[],historyChoices:[]};
test('unconsented card offers context selection rather than a fixed project recommendation',()=>{
 const tree=renderOpportunityCard({h,state:{opportunity:op},controller:{},modelReady:true});
 assert.match(text(tree),/选择参考资料/);assert.doesNotMatch(text(tree),/让项目进展一眼清楚|开始这个需求/);
 assert.equal(nodes(tree).filter(n=>n.props.role==='dialog'||n.props.role==='tab').length,0);
});
test('real opportunity shows benefit, provenance and one adoption action',()=>{
 const entry={id:'idea-a',title:'把散落记录变成可核对的简报',observation:'你选定的材料包含重复整理步骤',expectedResult:'一份可追溯的简报',evidenceRefs:[{id:'file-a',label:'brief.md',excerpt:'原始材料'}]};
 const tree=renderOpportunityCard({h,state:{workspaceId:'ws',opportunity:{...op,consent:{enabled:true},status:'ready',opportunities:[entry]}},controller:{},modelReady:true});
 assert.match(text(tree),/brief.md/);assert.match(text(tree),/试试这个办法/);
 assert.equal(nodes(tree).filter(n=>n.type==='button'&&text(n)==='试试这个办法').length,1);
});
test('empty discovery is not replaced by a fabricated scenario',()=>{
 const tree=renderOpportunityCard({h,state:{opportunity:{...op,consent:{enabled:true},status:'empty',emptyReason:'材料不够支持明确建议'}},controller:{},modelReady:true});
 assert.match(text(tree),/材料不够支持明确建议/);assert.doesNotMatch(text(tree),/试试这个办法|开始这个需求/);
});
test('authorization is an inline section with selected scope and model disclosure',()=>{
 const state={opportunity:op,opportunityEditing:true,opportunityDraft:{workspaceId:'ws',paths:[],historyTaskIds:[]},opportunityFiles:[{path:'brief.md'}],workspaces:[{workspaceId:'ws',title:'当前项目'}]};
 const tree=renderOpportunitySettings({h,state,controller:{},modelReady:true});
 assert.equal(tree.type,'section');assert.match(text(tree),/当前模型/);assert.match(text(tree),/brief.md/);
 assert.equal(nodes(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.checked).length,0);
});


test('advice uses the shared expert voice while retaining full provenance and actual next request',()=>{
 const entry={id:'idea-a',title:'一个简短建议',observation:'从授权资料得出的观察',expectedResult:'一份可用产物',suggestedRequest:'保持原限制的完整真实需求',evidenceRefs:[{id:'file-a',label:'brief.md',excerpt:'原材料摘录'}]};
 const tree=renderOpportunityCard({h,state:{opportunity:{...op,consent:{enabled:true},status:'ready',opportunities:[entry]}},controller:{},modelReady:true});
 assert.match(text(tree),/我猜你可能需要/);assert.match(text(tree),/预期结果：一份可用产物/);assert.match(text(tree),/完整真实需求/);assert.match(text(tree),/从授权资料得出的观察/);assert.match(text(tree),/原材料摘录/);
 const aside=nodes(tree).find(n=>n.type==='aside');assert.equal(aside.props['aria-label'],'猜你喜欢');assert.equal(aside.children.length,3);
 const controls=nodes(tree).find(n=>n.props.className==='pfv_opportunity_controls');assert.ok(controls);assert.ok(!nodes(aside).includes(controls));
});
