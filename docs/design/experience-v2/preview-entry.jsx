import React from 'react';
import { createRoot } from 'react-dom/client';
import { createExperienceView } from '../../../src/experience-view.js';
import { renderFeaturedView } from '../../../src/featured-view.js';
import { featuredCatalog } from '../../../src/featured-catalog.js';
import { createPreviewController } from './preview-controller.mjs';

const h = React.createElement;
const ExperienceView = createExperienceView(React);
let storage;
try { storage = window.localStorage; } catch { storage = null; }
const controller = createPreviewController({ storage });
const button = (label, onClick, props = {}) => h('button', { type: 'button', className: 'pfv_button', onClick, ...props }, label);
function App() {
  const [state, setState] = React.useState(controller.getSnapshot);
  React.useEffect(() => controller.subscribe(() => setState(controller.getSnapshot())), []);
  const busy = Boolean(state.busy) || ['preparing', 'running', 'waiting'].includes(state.execution?.phase);
  const results = state.demoResults.length ? h('div', { className: 'demo_results', 'aria-label': '本页合成结果' },
    h('h4', null, '本页示例结果'), h('dl', null, ...state.demoResults.map((item, index) => h('div', { key: index }, h('dt', null, item.title), h('dd', null, item.value))))) : null;
  const executionConversation = state.execution ? h('div', null, results,
    h('form', { className: 'pfv_composer pfv_followup', onSubmit: event => { event.preventDefault(); if (!busy) controller.submitFollowup(); } },
      h('label', { className: 'pfv_composer_label', htmlFor: 'demo_execution_followup' }, '继续补充'),
      h('textarea', { id: 'demo_execution_followup', 'aria-label': '演示执行中的补充', value: state.followupText, disabled: busy, maxLength: 1500, placeholder: '例如：原文只读', onChange: event => controller.setFollowup(event.target.value) }),
      h('div', { className: 'pfv_composer_bottom' }, h('span', { className: 'pfv_hint' }, '补充留在同一份演示记录'), h('button', { type: 'submit', className: 'pfv_button', disabled: busy || !state.followupText.trim() }, '发送补充')))) : null;
  const tasks = h('div', { className: 'demo_history' }, state.demoHistory.length ? state.demoHistory.map(task => h('div', { className: 'demo_history_item', key: task.taskId }, h('p', null, task.creation?.blueprint?.name || task.plan?.title || task.request), h('span', { className: 'pfv_hint' }, `演示版本 ${task.revisionNumber}`), button('恢复这份演示', () => controller.restoreHistory(task.taskId), { disabled: busy }))) : h('p', { className: 'pfv_hint' }, '尚无已保存的演示方案。'));
  const sections = {
    searchEvidence: h('p', { className: 'pfv_hint' }, '来源、候选和执行结果都由本页固定示例提供。没有真实检索或插件评估。'),
    candidateView: state.candidates.length ? h('p', { className: 'pfv_hint' }, '“资料整理示例插件”是合成候选，不是可安装的真实插件。') : null,
    taskHistory: h('div', null, tasks, state.demoVersions.length ? h('ul', { className: 'pfv_list' }, ...state.demoVersions.map((version, index) => h('li', { key: index }, `版本 ${version.number}：${version.creation?.blueprint?.scope || version.plan?.title || '需求已保留'}`))) : null),
    executionConversation,
  };
  let body;
  if (state.view === 'featured') {
    const entry = featuredCatalog.find(item => item.id === state.featuredId);
    body = entry ? h('div', { className: 'pfv_current_workspace demo_featured_detail' }, button('返回首页', () => controller.showHome(), { className: 'pfv_button pfv_quiet' }),
      h('section', { className: 'pfv_outcome_document' }, h('p', { className: 'pfv_kind' }, '精选插件 · 策展资料快照'), h('h1', null, entry.title), h('p', { className: 'pfv_prose' }, entry.summary),
        h('div', { className: 'pfv_outcome_actions' }, button('开始这个需求', () => controller.startFeatured(entry.id), { className: 'pfv_button pfv_primary', disabled: busy })),
        h('details', { className: 'pfv_disclosure' }, h('summary', null, '使用前提与资料边界'), h('div', { className: 'pfv_disclosure_body' }, h('p', null, `${entry.version} · 资料核对日期 ${entry.checkedAt.slice(0, 10)}，本演示不做实时核验。`), h('ul', { className: 'pfv_list' }, ...[...entry.requirements, ...entry.limitations].map((value, index) => h('li', { key: index }, value))))))) : null;
  } else if (state.view === 'history') body = h('div', { className: 'pfv_current_workspace' }, button('返回首页', () => controller.showHome(), { className: 'pfv_button pfv_quiet' }), h('h1', { className: 'demo_history_title' }, '本页演示记录'), tasks, renderFeaturedView({ h, state, controller, busy, mode: 'drafts' }));
  else body = h(ExperienceView, { state, controller, busy, modelReady: true, copyText() {}, sections });
  return h('div', { className: 'pf_root pf_v2' }, h('div', { className: 'pf_inner' },
    h('header', { className: 'pf_header' }, button('Finder', () => controller.showHome(), { className: 'pf_btn pf_text', disabled: busy }), h('div', { className: 'demo_header_actions' }, h('span', { className: 'demo_mode' }, '有界演示'), button('演示记录', () => controller.showHistory(), { className: 'pfv_button pfv_quiet', disabled: busy }))),
    h('div', { className: 'demo_boundary', role: 'note' }, '离线交互预览：目录可浏览；搜索与执行为固定示例，不操作真实文件或插件。'),
    state.notice ? h('p', { className: 'pfv_warning', role: 'status' }, state.notice) : null,
    body,
    h('footer', { className: 'demo_footer' }, h('p', null, '主界面与生产版共用组件，执行由固定示例模拟。'), h('a', { href: '../history/experience-v2-rejected-20261023/index.html' }, '查看已否定的旧版归档')),
    h('details', { className: 'demo_checks' }, h('summary', null, '演示检查'), h('p', { className: 'pfv_hint' }, '选择预设材料后仍由首页开始。修正支持“原文只读”“首版只做阅读状态”；其他补充原样保留。'),
      h('div', { className: 'pf_actions' }, button('填入阅读示例', () => controller.loadDemoCase('reading'), { disabled: busy }), button('填入组合示例', () => controller.loadDemoCase('projects'), { disabled: busy }), button('填入创建示例', () => controller.loadDemoCase('tool'), { disabled: busy }), button('下一次来源未完成', () => controller.setDemoFailure('source'), { disabled: busy }), button('下一次执行失败', () => controller.setDemoFailure('execution'), { disabled: busy })))));
}
createRoot(document.getElementById('app')).render(h(App));
