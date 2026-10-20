const bounded=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200):'';
const safeRepository=value=>{try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return'';url.search='';url.hash='';return url.href;}catch{return'';}};
/** Local, deliberately incomplete sharing draft. Never serialize raw tasks or notes. */
export function createCreatorFeedbackDraft(backup,pluginId,{revisionId}={}){
  const task=backup?.task;
  if(!task||!Array.isArray(task.revisions))throw new TypeError('缺少本机任务记录');
  const selected=revisionId?task.revisions.filter(row=>row.id===revisionId):[...task.revisions].reverse();
  const seed=selected.flatMap(row=>row.workflow?.candidates??[]).find(row=>row.id===pluginId);
  if(!seed)throw new TypeError('该插件未出现在此任务');
  const observations=[];
  for(const revision of task.revisions){
    const candidates=revision.workflow?.candidates??[];
    const candidate=candidates.find(row=>row.name===seed.name&&safeRepository(row.repository)===safeRepository(seed.repository));
    if(!candidate)continue;
    observations.push({revisionNumber:revision.number,createdAt:bounded(revision.createdAt),version:bounded(candidate.install?.version),commit:/^[a-f0-9]{40}$/i.test(candidate.install?.commit??'')?candidate.install.commit:'',selected:(revision.workflow.plan?.pluginIds??[]).includes(candidate.id),taskReportedOutcomes:(task.feedback??[]).filter(row=>row.type!=='refinement'&&row.revisionId===revision.id&&['complete','partial','blocked'].includes(row.outcome)).map(row=>row.outcome)});
  }
  return{format:'plugin-finder-creator-draft',version:1,shared:false,plugin:{name:bounded(seed.name),repository:safeRepository(seed.repository)},installationState:'unknown',runtimeState:'unknown',firstUseState:'unknown',observations};
}
const md=value=>bounded(value).replace(/[\\`*_\[\]<>]/g,'\\$&');
export function renderCreatorFeedbackDraft(draft){
  const labels={complete:'任务自报完成',partial:'任务自报部分完成',blocked:'任务自报未完成'};
  return `# 插件匹配反馈草稿\n\n插件：${md(draft.plugin.name)}\n来源：${draft.plugin.repository||'尚未核对'}\n\n- 需求场景：【填写可分享的场景摘要】\n- 推荐或放弃的具体原因：【填写可分享摘要，核对版本后再判断】\n- 安装状态：尚未核对\n- 运行状态：尚未核对\n- 插件首次使用结果：尚未核对\n\n## 本任务的本机记录\n\n${draft.observations.map(row=>`- 方案版本 ${row.revisionNumber} · ${md(row.createdAt)} · 插件 ${md(row.version)||'版本未知'}${row.commit?` · commit ${row.commit}`:''}：${row.selected?'方案已选中，未证明安装或首用':'候选，未被选中'}；${row.taskReportedOutcomes.length?row.taskReportedOutcomes.map(value=>labels[value]).join(' / '):'无任务结果自报'}。`).join('\n')}\n\n任务自报结果不能归因于某一个插件。记录仅来自这一个任务的方案版本，不代表独立用户数、安装量或实际使用次数。\n\n此文件尚未分享。完整需求、反馈原文、本地路径和会话标识未自动写入；请补充可分享摘要，核对脱敏后自行发送给作者。\n`;
}
