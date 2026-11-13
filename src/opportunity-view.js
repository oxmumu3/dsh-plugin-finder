import {recentOpportunityHistory} from './opportunity-client.js';
const text=value=>typeof value==='string'?value:'';
const items=value=>Array.isArray(value)?value:[];
function button(h,label,action,props={}){return h('button',{type:'button',className:'pfv_button pfv_quiet',onClick:()=>action?.(),...props},label);}
export function renderOpportunityCard({h,state,controller,disabled=false,modelReady=false,fallback=null,Lego=null}){
 const op=state.opportunity;if(!op)return null;
 const enabled=op.consent?.enabled===true,busy=Boolean(state.opportunityBusy),adopting=state.busy==='opportunity-adopt',discovering=state.opportunityBusy==='opportunity-discover'||op.status==='running';
 const entry=enabled?items(op.opportunities)[0]:null;
 const idea=!enabled&&text(fallback?.id)&&text(fallback?.title)?fallback:null;
 const recent=!enabled?recentOpportunityHistory(op):[];
 const blocked=disabled||!modelReady||busy;
 const title=adopting?'正在查找可用的方案':discovering?'我在找更好的办法':entry?text(entry.title):idea?text(idea.title):op.status==='empty'?'这次我先不勉强推荐':op.status==='failed'?'这次还没看完':'看看还有什么更好的办法';
 const body=adopting?'建议和资料已保留。先核对现成能力，缺口再在当前工作区创建。':entry?text(entry.expectedResult):idea?text(idea.benefit):discovering?'我只参考你选定的信息，建议会保留依据。':text(op.emptyReason)||text(op.lastError?.message)||text(op.lastError)||'可以更新参考资料，再让模型看一次。';
 const error=text(state.opportunityError);
 // 表现层：和首页 v8 卡片共用排版；下面的条件、数据来源、授权与动作都不动。
 const lego = Lego ? h(Lego, { kinds: [entry ? 'build' : op.status === 'failed' ? 'slot' : 'build'], label: entry ? '还没有，要一起做' : '还没读到' }) : null;
 return [h('aside',{key:'opportunity',className:'pfv_home_scenario pfv_opportunity pf8_oppcard','aria-label':entry||idea?.basis==='本机线索'?'猜你喜欢':idea?'试试这个':'推荐状态','aria-labelledby':'pfv_opportunity_title'},
  h('h2',{id:'pfv_opportunity_title',className:'pfv_home_heading'},entry||idea?.basis==='本机线索'?'我猜你可能需要':idea?'我先给你一个想法':'看看有没有更好的办法'),
  h('p',{className:'pfv_home_lead'},entry?'这是我基于参考资料想到的。':idea?'也可以从这个具体想法开始聊。':'仅参考你已授权的信息。'),
  h('div',{className:'pfv_home_card pfv_scenario_card'},
   ...(lego ? [lego] : []),
   h('h3',{title},title),h('p',{className:'pfv_prose'},body),
   idea?h('p',{className:'pfv_scenario_reason'},text(idea.basis)||'通用想法',idea.reason?' · '+text(idea.reason):' · 尚未参考你的资料'):null,
   entry?h('details',{className:'pfv_opportunity_evidence'},h('summary',null,'为什么推荐'),h('p',null,text(entry.observation)),h('p',null,'预期结果：'+text(entry.expectedResult)),h('p',null,'这是我的改善建议，是否适合仍需你核对。'),h('p',null,'采纳后会查找：'+text(entry.suggestedRequest)),
    ...items(entry.evidenceRefs).map(ref=>h('div',{key:ref.id},h('strong',null,text(ref.label)),h('p',null,text(ref.excerpt))))):null,
   error?h('p',{className:'pfv_warning',role:'status'},error):null,
   h('div',{className:'pfv_composer_bottom'},discovering?button(h,'停止查找',()=>controller.cancelOpportunityDiscovery?.(),{className:'pfv_button pfv_scenario_start'}):entry?button(h,adopting?'正在找方案':'试试这个办法',()=>controller.adoptOpportunity?.(entry.id),{className:'pfv_button pfv_scenario_start',disabled:blocked}):idea?button(h,'试试这个想法',()=>controller.startFeatured?.(idea.id),{className:'pfv_button pfv_scenario_start',disabled:blocked}):button(h,op.status==='failed'?'重新找机会':'更新参考资料',()=>op.status==='failed'?controller.discoverOpportunities?.(true):controller.openOpportunitySettings?.(),{className:'pfv_button pfv_scenario_start',disabled:blocked})))),
  enabled?h('div',{key:'opportunity-controls',className:'pfv_opportunity_controls'},entry?h('details',null,h('summary',null,'暂时不需要'),...[["irrelevant","不相关"],["known","这个我已经会了"],["later","以后再说"]].map(([feedback,label])=>button(h,label,()=>controller.feedbackOpportunity?.(entry.id,feedback),{key:feedback,disabled:blocked}))):null,
   op.restorableFeedbackCount>0?button(h,'恢复已处理建议',()=>controller.restoreOpportunityFeedback?.(),{disabled:busy}):null,button(h,'参考信息',()=>controller.openOpportunitySettings?.(),{disabled:busy}),button(h,'停止个性化',()=>controller.disableOpportunities?.(),{disabled:disabled&&state.busy==='opportunity-adopt'})):
   h('div',{key:'opportunity-opt-in',className:'pfv_opportunity_controls'},
    h('p',{className:'pfv_hint'},recent.length?`仅将最近${recent.length}份 Finder 需求与方案摘要交给当前模型，不读取其他文件。`:'想要更贴合当前工作的建议，可以选择允许参考的信息。'),
    recent.length?button(h,state.opportunityBusy==='opportunity-grant'?'正在开启推荐…':`参考最近${recent.length}份方案推荐`,()=>controller.enableRecentOpportunityHistory?.(),{disabled:blocked}):button(h,'选择可参考的信息',()=>controller.openOpportunitySettings?.(),{disabled:blocked}))];
}

export function renderOpportunitySettings({h,state,controller,modelReady=false}){
 if(!state.opportunityEditing)return null;
 const op=state.opportunity||{},draft=state.opportunityDraft||{historyTaskIds:[],paths:[]},busy=Boolean(state.opportunityBusy),paths=items(draft.paths),selectedTasks=items(draft.historyTaskIds);
 return h('section',{className:'pfv_opportunity_settings','aria-labelledby':'pfv_scope_title'},
  h('div',{className:'pfv_section_heading'},h('div',null,h('h2',{id:'pfv_scope_title'},'我可以参考哪些资料？'),h('p',{className:'pfv_hint'},'所选正文会发送给 Harness 当前模型，只用于找改善机会；不会因此开启集中回传。')),
   button(h,'收起',()=>controller.closeOpportunitySettings?.(),{'aria-label':'收起参考资料选择'})),
  h('div',{className:'pfv_scope_columns'},
   h('fieldset',null,h('legend',null,'当前工作区的材料'),
    h('label',{htmlFor:'pfv_scope_workspace',className:'pfv_sr_only'},'材料工作区'),
    h('select',{id:'pfv_scope_workspace',value:draft.workspaceId||'',disabled:busy,onChange:event=>controller.setOpportunityWorkspace?.(event.target.value)},h('option',{value:''},'选择工作区'),...items(state.workspaces).map(ws=>h('option',{key:ws.workspaceId,value:ws.workspaceId},ws.title))),
    state.opportunityBusy==='opportunity-context'?h('p',{className:'pfv_hint',role:'status'},'正在读取文件名称，尚未读取正文。'):null,
    h('div',{className:'pfv_scope_list'},...items(state.opportunityFiles).map(file=>h('label',{key:file.path,className:'pfv_scope_choice'},h('input',{type:'checkbox',checked:paths.includes(file.path),disabled:busy,onChange:()=>controller.toggleOpportunityFile?.(file.path)}),h('span',null,file.path)))),
    !busy&&!items(state.opportunityFiles).length?h('p',{className:'pfv_hint'},'这个位置没有可选文本文件，可在下方补充相对路径。'):null,
    state.opportunityFilesTruncated?h('p',{className:'pfv_hint'},'这里只列出部分文本文件，其他文件可按路径补充。'):null,
    h('details',null,h('summary',null,'补充其他文件'),h('label',{htmlFor:'pfv_scope_paths'},'相对工作区的文件路径，每行一个，最多8个'),h('textarea',{id:'pfv_scope_paths',value:paths.join('\n'),disabled:busy,rows:3,maxLength:12000,onChange:event=>controller.setOpportunityPaths?.(event.target.value),placeholder:'notes/brief.md'}))),
   h('fieldset',null,h('legend',null,'Finder 中保存的方案'),h('p',{className:'pfv_hint'},'仅选中的原始需求与方案摘要会作为参考。'),
    h('div',{className:'pfv_scope_list'},...items(op.historyChoices).map(choice=>h('label',{key:choice.taskId,className:'pfv_scope_choice'},h('input',{type:'checkbox',checked:selectedTasks.includes(choice.taskId),disabled:busy||choice.unavailable&&!selectedTasks.includes(choice.taskId),onChange:event=>controller.setOpportunityHistoryTask?.(choice.taskId,event.target.checked)}),h('span',null,text(choice.title)||'未命名方案')))),
    !items(op.historyChoices).length?h('p',{className:'pfv_hint'},'还没有保存的方案，也可以只选工作区材料。'):null)),
  state.opportunityError?h('p',{className:'pfv_warning',role:'status'},text(state.opportunityError)):null,
  h('div',{className:'pfv_scope_footer'},h('p',{className:'pfv_hint'},`已选择 ${paths.length} 个文件、${selectedTasks.length} 份方案。授权可随时停止。`),
   button(h,busy?'正在准备参考资料':'开始找机会',()=>controller.saveOpportunityScope?.(),{className:'pfv_button pfv_primary',disabled:busy||!modelReady||!paths.length&&!selectedTasks.length})));
}
