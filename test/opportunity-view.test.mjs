import assert from 'node:assert/strict';
import test from 'node:test';
import {renderOpportunityCard,renderOpportunitySettings} from '../src/opportunity-view.js';
const h=(type,props,...children)=>({type,props:props||{},children});
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.children)]:[];
const text=n=>Array.isArray(n)?n.map(text).join(' '):n&&typeof n==='object'?text(n.children):String(n??'');
const op={consent:{enabled:false,epoch:1},status:'idle',opportunities:[],historyChoices:[]};
const fallback={id:'agent-twin',title:'把项目资料整理成知识库',benefit:'保留出处，之后随时提问、回看。',basis:'通用想法',reason:''};
test('unconsented card offers a concrete honest idea first and a separate optional context action',()=>{
 const calls=[];const tree=renderOpportunityCard({h,state:{opportunity:op},fallback,controller:{startFeatured:id=>calls.push(['start',id]),openOpportunitySettings:()=>calls.push(['settings'])},modelReady:true});
 assert.match(text(tree),/把项目资料整理成知识库/);assert.match(text(tree),/通用想法/);assert.match(text(tree),/试试这个想法/);
 assert.doesNotMatch(text(tree),/你选好资料|这是我基于参考资料想到的|也许有更顺手的做法/);
 const aside=nodes(tree).find(n=>n.type==='aside');assert.equal(aside.children.length,3);assert.equal(aside.props['aria-label'],'试试这个');
 const primary=nodes(aside).find(n=>n.type==='button'&&text(n)==='试试这个想法');primary.props.onClick();
 assert.deepEqual(calls,[['start','agent-twin']]);
 assert.equal(nodes(tree).filter(n=>n.props.role==='dialog'||n.props.role==='tab').length,0);
});
test('recent-plan context opt-in names the bounded count and model use without implying current understanding',()=>{
 const calls=[],historyChoices=[{taskId:'one',updatedAt:'2026-10-30T10:00:00Z'},{taskId:'two',updatedAt:'2026-10-29T10:00:00Z'},{taskId:'gone',updatedAt:'2026-10-31T10:00:00Z',unavailable:true}];
 const tree=renderOpportunityCard({h,state:{opportunity:{...op,historyChoices}},fallback,controller:{enableRecentOpportunityHistory:()=>calls.push('grant')},modelReady:true});
 assert.match(text(tree),/最近2份/);assert.match(text(tree),/当前模型/);assert.match(text(tree),/不读取其他文件/);
 assert.equal(calls.length,0);const action=nodes(tree).find(n=>n.type==='button'&&text(n)==='参考最近2份方案推荐');assert.ok(action);action.props.onClick();assert.deepEqual(calls,['grant']);
 const aside=nodes(tree).find(n=>n.type==='aside');assert.equal(nodes(aside).filter(n=>n.type==='button').length,1);
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

test('recent-plan opt-in shows its pending state without replacing the concrete idea or enabling another action',()=>{
 const tree=renderOpportunityCard({h,state:{opportunity:{...op,historyChoices:[{taskId:'one',updatedAt:'2026-10-30T10:00:00Z'}]},opportunityBusy:'opportunity-grant'},fallback,controller:{},modelReady:true});
 assert.match(text(tree),/把项目资料整理成知识库/);
 assert.ok(nodes(tree).some(n=>n.type==='button'&&text(n)==='正在开启推荐…'&&n.props.disabled));
 assert.ok(nodes(tree).filter(n=>n.type==='button').every(n=>n.props.disabled));
});
