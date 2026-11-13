import {expertWhaleSvg} from './brand-mark.js';
import {renderOpportunityCard, renderOpportunitySettings} from './opportunity-view.js';
import { renderFeaturedView } from './featured-view.js';
import { featuredCatalog } from './featured-catalog.js';
import { rankFeatured, visibleFeatured } from './featured.js';
import { createCommunityView } from './community-view.js';
import { getCommunityEntry, getCommunityOverview } from './community-catalog.js';
import { createHomeView } from './v8-home-view.js';
import { createPlanSurface, hybridInstallCopy } from './v8-plan-view.js';
import { createLego } from './v8-lego.js';

const text = value => typeof value === 'string' ? value : '';
const items = value => Array.isArray(value) ? value : [];
const strings = value => items(value).filter(item => typeof item === 'string' && item.trim());
const records = value => items(value).filter(item => item && typeof item === 'object');
const unique = values => [...new Set(values.filter(Boolean))];
const blueprintGroups = [
  { title: '首版要完成什么', fields: [['name', '名称'], ['purpose', '目标'], ['scope', '首版范围']] },
  { title: '怎样使用，得到什么', fields: [['workflow', '使用过程'], ['inputs', '输入材料'], ['outputs', '产出结果'], ['ui', '界面与交互']] },
  { title: '数据与权限', fields: [['data', '数据与保存'], ['tools', '工具与权限'], ['runtime', '运行方式']] },
  { title: '怎样算完成', fields: [['acceptance', '验收条件']] },
];
// These are editable writing prompts, never synthesized search results.
const examples = [
  ['整理知识', '把几篇文章整理成带出处的知识笔记，方便以后继续问。保留原文来源，不把 AI 摘要当成我已读。'],
  ['跟进项目', '帮我从选定项目的材料里整理进展、卡点和下一步，先只读查看，不自动替我交办任务。'],
  ['做自己的工具', '我想做一个自己的小工具：把会议记录整理成可核对的待办，保留原文位置，确认后再写入任务工具。'],
];
const scenarioTitles = {
  'agent-twin': '把项目资料整理成知识库',
  'family-assistant': '准备家人的日常小助手',
  'dsh-dot': '从手机了解项目进展',
  'dot-harness': '让助手读到另一端的项目资料',
};
const scenarioBenefits = {
  'agent-twin': '保留出处，之后随时提问、回看。',
  'family-assistant': '让家人分别拥有聊天、提醒和日常资讯的小助手。',
  'dsh-dot': '把项目进展、卡点和下一步整理成一份手机上能看的简报。',
  'dot-harness': '让已有助手查到另一端的项目资料，少来回复制和补背景。',
};
export function experienceSourceHealth(discovery) {
  if (!discovery) return null;
  const sources = [...records(discovery.sources), ...records(discovery.sourceCoverage)];
  const coverage = records([discovery.coverage, ...records(discovery.sourceCoverage)]);
  const positiveCount = value => Number.isFinite(value) && value > 0;
  // Reasons live on the search coverage only; sourceCoverage repeats per-source
  // counts and must not double a single candidate.
  const excluded = {};
  for (const item of records([discovery.coverage])) for (const [reason, count] of Object.entries(item.excludedReasons ?? {})) if (Number.isFinite(count) && count > 0) excluded[reason] = (excluded[reason] ?? 0) + count;
  const returned = Number.isFinite(discovery.coverage?.returned) ? discovery.coverage.returned : null;
  const noneBack = returned === 0;
  const sourceTrouble = ['failed', 'partial', 'incomplete'].includes(discovery.status) || sources.some(source => ['failed', 'stale', 'partial'].includes(source.status));
  const tail = noneBack ? '这轮没有已返回的候选，也不能据此推断供给不存在。' : '已返回的候选仍可用，不能据此说没有更合适的。';
  const extra = sourceTrouble ? '另外，还有目录来源这次没读到，具体原因见来源明细。' : '';
  // A 403 is not GitHub throttling unless read() confirmed the rate-limit signal;
  // generic denials keep their own source-not-readable wording.
  if (excluded['author-rate-limited']) return { incomplete: true, message: `GitHub 这次限制了 ${excluded['author-rate-limited']} 个候选的作者资料核对（请求过快），这些没算进结果；${extra}${tail}` };
  if (excluded['author-source-limited']) return { incomplete: true, message: `有 ${excluded['author-source-limited']} 个候选的来源这次返回限流（HTTP 429），这些没算进结果；${extra}${tail}` };
  if (excluded['author-unauthorized']) return { incomplete: true, message: `有 ${excluded['author-unauthorized']} 个候选的来源这次需要授权（HTTP 401），这些没算进结果；${extra}${tail}` };
  if (excluded['author-forbidden']) return { incomplete: true, message: `有 ${excluded['author-forbidden']} 个候选的来源这次拒绝访问（HTTP 403），这些没算进结果；${extra}${tail}` };
  if (excluded['author-missing']) return { incomplete: true, message: `有 ${excluded['author-missing']} 个候选的作者资料这次打不开（HTTP 404），这些没算进结果；${extra}${tail}` };
  if (excluded['author-incompatible']) return { incomplete: true, message: `另有 ${excluded['author-incompatible']} 个候选已判为和当前宿主不兼容，没有列进结果；它们当前不能装。${noneBack ? '这轮没有已返回的候选，也不能据此推断供给不存在。' : ''}` };
  if (sourceTrouble) return { incomplete: true, message: noneBack ? '这次没有读回可用候选：部分来源尚未查完，不能据此推断供给不存在。' : '部分来源尚未查完。当前判断仅基于已返回资料，不能据此确认没有合适的插件。' };
  // A live index does not mean every match was read or its requirements verified.
  // Known exclusions (such as a required Key) are not unfinished evidence.
  if (coverage.some(item => positiveCount(item.uninspected) || ['author-read-timeout', 'author-unresolved', 'extra-key-unknown'].some(reason => positiveCount(item.excludedReasons?.[reason])))) {
    return { incomplete: true, message: noneBack ? '部分候选尚未核对完整，这轮没有已返回的候选，也不能据此推断供给不存在。' : '部分候选尚未核对完整。当前判断仅基于已返回资料，不能据此确认没有合适的插件。' };
  }
  if (sources.some(source => source.status === 'cached')) return { incomplete: false, message: '部分来源使用缓存。可以展开搜索依据，核对资料的读取时间。' };
  return null;
}

function prerequisites(plan, candidates) {
  const selected = new Set(items(plan?.pluginIds));
  const values = [...strings(plan?.limits)];
  for (const candidate of records(candidates).filter(item => selected.has(item.id))) {
    const requirements = candidate.requirements;
    if (Array.isArray(requirements)) values.push(...requirements.map(item => typeof item === 'string' ? item : text(item?.label) || text(item?.message)));
    else if (typeof requirements === 'string') values.push(requirements);
    else if (requirements && typeof requirements === 'object') {
      if (requirements.extraApiKey === 'required') values.push(`${text(candidate.name) || candidate.id}需要额外服务 Key，使用前请核对来源文档。`);
      values.push(...strings(requirements.notes));
    }
  }
  return unique(values);
}

/** The controller owns persisted tasks and execution. This view keeps the
 * current outcome, its next action and a single correction input together. */
export function createExperienceView(React) {
  const h = React.createElement;
  const CommunityView = createCommunityView(React);
  // HomeView 直接当函数调用：测试会自己遍历元素树，包一层组件就看不见里面的结构了。
  const renderHomeV8 = createHomeView(React);
  const Lego = createLego(React);
  const planSurface = createPlanSurface(React);
  const button = (label, onClick, attrs = {}) => h('button', { type: 'button', className: 'pfv_button', onClick, ...attrs }, label);
  const primary = (label, onClick, attrs = {}) => button(label, onClick, { ...attrs, className: 'pfv_button pfv_primary' });
  const disclosure = (label, content, attrs = {}) => content ? h('details', { className: 'pfv_disclosure', ...attrs }, h('summary', null, label), h('div', { className: 'pfv_disclosure_body' }, content)) : null;
  const paragraph = (value, attrs = {}) => text(value) ? h('p', { className: 'pfv_prose', ...attrs }, text(value)) : null;
  const list = values => values.length ? h('ul', { className: 'pfv_list' }, ...values.map((value, index) => h('li', { key: index }, value))) : null;
  const short = (value, limit = 210) => text(value).length > limit ? `${text(value).slice(0, limit).trim()}…` : text(value);
  const shortcut = event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent?.isComposing && !event.isComposing) {
      event.preventDefault(); event.currentTarget.form?.requestSubmit();
    }
  };

  return function ExperienceView({ state, controller, busy = false, modelReady = false, copyText, sections = {}, more = null }) {
    const homeInput = React.useRef(null);
    const startingNew = Boolean(state.searching);
    // Old saved guide routes still recover into the same creation surface.
    const isCreating = !startingNew && ['create', 'creation-guide'].includes(state.view);
    const previousOutcome = !startingNew && !state.plan && Boolean(state.pendingOutcome?.plan);
    const outcome = startingNew ? { plan: null, candidates: [], revisionNumber: null } : previousOutcome ? state.pendingOutcome : state;
    const plan = outcome.plan;
    const creation = startingNew ? null : state.creation;
    const form = state.creationForm;
    const blueprint = form?.blueprint || creation?.blueprint || {};
    const discovery = startingNew ? null : previousOutcome ? outcome.discovery : state.discovery;
    const health = experienceSourceHealth(discovery);
    const revision = isCreating ? state.revisionNumber : outcome.revisionNumber;
    const revisionLabel = Number.isInteger(revision) ? `版本 ${revision}` : '版本未记录';
    const execution = !startingNew ? state.execution : null;
    const executionActive = ['preparing', 'running'].includes(execution?.phase) || execution?.phase === 'waiting' && ['waiting-user', 'cancelling'].includes(execution?.rawPhase);
    const locked = busy || executionActive;
    const taskInputBusy = locked && state.busy !== 'bootstrap';
    const followupBusy = locked || state.followupPending;
    const savedAnswers = records(creation?.answers);
    const question = records(creation?.questions).find(item => !savedAnswers.some(answer => answer.id === item.id && text(answer.answer).trim()));
    const currentAnswer = question ? records(form?.answers).find(answer => answer.id === question.id) : null;
    const request = state.searching ? text(state.homeRequest) || text(state.request) : text(state.request) || text(state.homeRequest);
    const conversation = startingNew ? [] : records(state.conversation).filter(item => ['user', 'assistant'].includes(item.role) && text(item.text));
    // A legacy request is evidence, not a fabricated assistant conversation.
    const messages = conversation.length ? conversation : request ? [{ id: 'original-request', role: 'user', text: request }] : [];
    const progress = {
      analyze: '正在理解你的目标和约束', refine: '正在理解这次补充', recommend: '正在查找来源并整理方案',
      'creation-start': '正在整理要创建的插件', 'creation-update': '正在更新插件方案',
      'creation-refine': '正在根据你的补充修改方案', reset: '正在保留原任务并开始新需求',
    }[state.busy] || (state.searching ? '正在查找可行路径' : state.followupPending ? '正在更新这份方案' : '正在处理');
    const waited = state.searchingSince && state.clock ? Math.max(0, Math.round((state.clock - state.searchingSince) / 1000)) : 0;
    const liveEvents = busy && Array.isArray(state.searchProgress?.events) ? state.searchProgress.events.filter(item => item && typeof item.text === 'string' && item.text).slice(-4) : [];
    const clockSuffix = waited >= 30
      ? ` 已等待 ${waited} 秒，比平时久；可以继续等，或点上面的「停止」。`
      : waited >= 3 ? ` 已用时 ${waited} 秒。` : '';
    const expertMode = !isCreating && state.expertAvailable === true && typeof controller.startExpert === 'function';
    const expertOpening = state.expertPhase === 'opening';
    const submitFollowup = event => {
      event.preventDefault();
      if (followupBusy || expertOpening || !modelReady || !text(state.followupText).trim()) return;
      void (expertMode ? controller.startExpert() : controller.submitFollowup());
    };
    const statusLine = followupBusy && !execution ? h('div', { className: 'pfv_progress', role: 'status' },
      h('span', { className: 'pfv_progress_dot', 'aria-hidden': true }), h('span', null, progress),
      button('停止', () => controller.cancel(), { className: 'pfv_button pfv_quiet', 'aria-label': '停止当前操作并保留内容' })) : null;
    // 精选按当前宿主过滤：只隐藏条目自己声明了不支持的锁定版本（SPEC 第 8 节）。
    // 宿主版本未知时一律保留，交给详情页的安装门禁去核对，不按版本号猜。
    const hostVersion = typeof state.bootstrap?.hostVersion === 'string' ? state.bootstrap.hostVersion : '';
    const catalogue = visibleFeatured(featuredCatalog, hostVersion);
    const suggested = rankFeatured(catalogue, { history: Array.isArray(state.featuredHistory) ? state.featuredHistory : state.history, preferences: state.featuredPreferences })[0];
    const scenario = suggested?.entry || catalogue.find(entry => !items(state.featuredPreferences?.dismissed).includes(entry.id)) || catalogue[0] || null;
    const homeCommunityEntry = getCommunityEntry(state.homeCommunityEntryId);
    const resumeView = state.taskId || state.request ? h('div', { className: 'pfv_resume' }, h('div', null, h('span', { className: 'pfv_hint' }, '上次进行到这里'), paragraph(text(state.creation?.blueprint?.name) || text(state.plan?.title) || text(state.intent?.goal) || text(state.request))), button('继续上次方案', () => state.creation ? controller.showCreation() : controller.showFind(), { disabled: busy })) : null;

    const catalog = (() => { try { return getCommunityOverview(); } catch { return null; } })();

    // 首页整屏走 v8（SPEC 5.1–5.5）。旧版三站路径与产品介绍按 SPEC 第 4 节去掉。
    const home = () => renderHomeV8({
      state, controller, busy, modelReady, locked,
      homeInput, shortcut, resumeView,
      overview: catalog,
      more,
      homeCommunityName: homeCommunityEntry?.name,
      suggested,
      opportunityCard: state.opportunity
        ? renderOpportunityCard({ h, state, controller, disabled: locked, modelReady, Lego,
          // 精选全被当前宿主过滤掉时没有 scenario；机会卡自己照常渲染，fallback 留空。
          fallback: scenario ? { id: scenario.id, title: scenarioTitles[scenario.id], benefit: scenarioBenefits[scenario.id], basis: suggested ? '本机线索' : '通用想法', reason: suggested?.reason || '' } : null })
        : null,
      opportunitySettings: renderOpportunitySettings({ h, state, controller, modelReady }),
      fallbackIdea: scenario ? {
        id: scenario.id, title: scenarioTitles[scenario.id], benefit: scenarioBenefits[scenario.id],
        basis: suggested ? '本机线索' : '通用想法', reason: suggested?.reason || '', suggested: Boolean(suggested),
      } : null,
      featured: catalogue,
      onFeatured: id => (typeof controller.showFeatured === 'function' ? controller.showFeatured(id) : controller.startFeatured?.(id)),
      // 精选的兴趣方向、隐藏某一项、保留的草稿都还在原来的组件里：收进「调整精选」。
      featuredSettings: renderFeaturedView({ h, state, controller, copyText, busy, mode: 'settings' }),
      featuredWarning: state.featuredWarning,
      onCommunity: intent => controller.showCommunity?.(intent),
    });

    // 商店是独立一页：打开时首页不显示，返回时由 controller 还原原来的滚动位置（SPEC 5.6）。
    if (state.communityOpen && !state.searching && state.view === 'home') {
      return h('div', { className: 'pf_v8 pf8_storepage' }, h(CommunityView, {
        controller, busy: locked, modelReady, intent: state.communityIntent,
      }));
    }
    if (state.view === 'home' && !state.searching) return home();
    if (state.view === 'find' && state.stage === 'describe' && !busy && !state.request && !plan) return home();

    const executionView = execution ? h('section', { className: `pfv_execution pfv_execution_${execution.phase}`, role: execution.phase === 'failed' ? 'alert' : 'status', 'aria-label': '当前执行状态' },
      h('div', { className: 'pfv_execution_heading' }, h('h3', null, {
        preparing: '正在准备', running: execution.kind === 'create' ? '正在创建' : '正在使用方案', waiting: '等待继续',
        completed: '本次运行已结束', failed: '这次没有完成', cancelled: '已停止',
      }[execution.phase] || '当前状态'), executionActive ? button('停止', () => controller.cancelExecution(), { className: 'pfv_button pfv_quiet', 'aria-label': '停止当前执行' }) : null),
      paragraph(execution.summary),
      text(execution.details) ? paragraph(execution.details, { className: 'pfv_hint pfv_execution_details' }) : list(strings(execution.details)),
      execution.canContinue ? primary('继续执行', () => controller.continueExecution(), { disabled: busy }) : null,
      sections.executionConversation) : null;

    const clarification = isCreating && question ? planSurface.clarification({
      question, options: question.options, current: currentAnswer?.answer,
      disabled: locked, onPick: option => controller.answerCreation(question.id, option),
    }) : null;

    const followup = h('form', { className: 'pfv_composer pfv_followup', onSubmit: submitFollowup },
      h('label', { className: 'pfv_composer_label', htmlFor: 'pfv_followup_input' }, '想调整哪里？'),
      h('textarea', { id: 'pfv_followup_input', 'aria-label': '补充需求', value: text(state.followupText), maxLength: 1500, disabled: followupBusy || expertOpening || !state.taskId, placeholder: isCreating ? '例如：第一版只处理本地文件，先不做自动发送。' : expertMode ? '比如：我已经装了某个插件 / 帮我看看这个文件夹 / 只要本地方案。' : '补充材料、限制，或直接说你想改什么。', onChange: event => controller.setFollowup(event.target.value), onKeyDown: shortcut }),
      h('div', { className: 'pfv_composer_bottom' }, h('span', { className: 'pfv_hint' }, state.followupRetry ? '补充已保存，可以重试' : expertMode ? '发送后会打开插件专家会话，在这里接着聊' : '接着改这份方案'), h('button', { type: 'submit', className: 'pfv_button', disabled: followupBusy || expertOpening || !modelReady || !state.taskId || !text(state.followupText).trim() }, state.followupRetry ? '重试查找' : expertMode ? (expertOpening ? '正在打开…' : '开始对话') : '更新方案')),
      expertMode && text(state.expertError) ? h('p', { className: 'pfv_hint pfv_expert_error', role: 'alert' }, state.expertError) : null,
      !modelReady && state.bootstrapLoaded ? h('p', { className: 'pfv_hint' }, '模型尚未配置，已有记录仍可查看。') : null);
    // Once a native expert session exists, the official conversation replaces the form.
    const expertSection = !isCreating && sections.expertConversation ? h('section', { className: 'pfv_expert', 'aria-labelledby': 'pfv_expert_session_title' },
      h('div', { className: 'pfv_expert_heading' }, h('h3', { id: 'pfv_expert_session_title' }, '和插件专家接着聊'),
        h('span', { className: 'pfv_hint' }, '这是一条真正的 DSH 会话：能看你的工作区和已装插件；默认只查找，不安装、不改文件。')),
      text(state.expertError) ? h('p', { className: 'pfv_hint pfv_expert_error', role: 'alert' }, state.expertError) : null,
      sections.expertConversation) : null;
    const expertPlan = !isCreating && state.expert?.plan && typeof state.expert.plan === 'object' ? state.expert.plan : null;
    const expertPlanCard = expertPlan ? h('section', { className: 'pfv_expert_plan', 'aria-label': '专家会话里的最新方案' },
      h('div', { className: 'pfv_expert_plan_heading' }, h('span', { className: 'pfv_kind' }, '专家会话里的最新方案'),
        Number.isInteger(state.expert.planVersion) ? h('span', { className: 'pfv_hint' }, `第 ${state.expert.planVersion} 次更新`) : null),
      h('h3', null, text(expertPlan.title)), paragraph(expertPlan.summary),
      records(expertPlan.plugins).length ? h('ul', { className: 'pfv_expert_plugins' }, ...records(expertPlan.plugins).map((item, index) => h('li', { key: index }, h('strong', null, text(item.name)), text(item.reason) ? h('span', null, ` — ${text(item.reason)}`) : null))) : null,
      strings(expertPlan.steps).length ? h('ol', { className: 'pfv_expert_steps' }, ...strings(expertPlan.steps).map((step, index) => h('li', { key: index }, step))) : null,
      strings(expertPlan.limits).length ? disclosure('限制与待核实', list(strings(expertPlan.limits))) : null,
      h('p', { className: 'pfv_hint' }, '来自专家会话的方案记录，不代表插件已安装或已验证。')) : null;

    const history = h('div', { className: 'pfv_messages', 'aria-label': '当前需求的对话记录' }, ...messages.map((message, index) => h('article', { key: message.id || index, className: `pfv_message pfv_message_${message.role}` },
      h('div', { className: 'pfv_message_meta' }, h('span', null, message.role === 'user' ? '你' : '插件专家'), Number.isInteger(message.revisionNumber) ? h('span', null, `版本 ${message.revisionNumber}`) : null), paragraph(message.text))));
    const evidence = h('div', { className: 'pf8_folds' },
      disclosure('依据和来源', h(React.Fragment, null, sections.candidateView, sections.searchEvidence, sections.selectedInstallGuide)),
      disclosure(Number.isInteger(revision) && revision > 1 ? `改过 ${revision - 1} 次` : '需求与修改记录', h(React.Fragment, null, history, sections.taskHistory)),
      disclosure('记录使用结果', sections.feedback));
    // 来源没查完但方案可用：一条橙色提示说明边界，方案本身照常可看可用。
    const sourceNotice = health ? h('aside', { className: 'pf8_warn_note', role: 'status' }, h('p', null, health.message),
      health.incomplete && isCreating ? h('p', { className: 'pf8_fine' }, '开始创建时会重新核对；你的补充会保留。') : null) : null;
    const workspacePicker = sections.workspacePicker ? h('div', { className: 'pfv_workspace_picker' }, sections.workspacePicker) : null;
    const canAct = !locked && !previousOutcome && Boolean(state.taskId) && modelReady;
    const workspacePending = state.workspacePhase != null && state.workspacePhase !== 'ready';
    const workspaceStatus = workspacePending ? h('p', { className: 'pfv_hint', role: 'status' }, '正在读取工作区，准备好后即可开始。') : null;
    const showActions = !executionActive && !execution?.canContinue && execution?.phase !== 'completed';
    const capabilityMap = () => {
      if (!plan) return null;
      const selected = records(outcome.candidates).filter(candidate => items(plan.pluginIds).includes(candidate.id));
      const gaps = plan.kind === 'hybrid' ? records(plan.gaps).filter(gap => text(gap.capability)) : [];
      if (!selected.length && !gaps.length && plan.kind !== 'native') return null;
      return h('section', { className: 'pfv_capabilities', 'aria-label': '方案中的能力' },
        h('div', { className: 'pfv_capabilities_heading' }, h('h3', null, '方案中的能力'), h('span', { className: 'pfv_hint' }, gaps.length ? '保留现成能力，只补真正的缺口' : '按这次目标安排')),
        h('div', { className: `pfv_capability_map${gaps.length ? ' pfv_capability_map_hybrid' : ''}` },
          selected.length ? h('section', { className: 'pfv_capability_item pfv_capability_reuse', 'data-capability-kind': 'reuse' },
            h('span', { className: 'pfv_capability_kind' }, '计划复用'),
            h('ul', { className: 'pfv_reuse_list' }, ...selected.map(candidate => {
            const responsibilities = unique(records(plan.steps).filter(step => step.owner === candidate.id).map(step => text(step.capability)));
            return h('li', { key: candidate.id },
              h('strong', null, text(candidate.name) || candidate.id),
              text(candidate.install?.version || candidate.version) ? h('span', { className: 'pfv_capability_version' }, text(candidate.install?.version || candidate.version)) : null,
              responsibilities.length ? paragraph(short(responsibilities.join('、'), 160), { className: 'pfv_capability_purpose' }) : null);
          }))) : null,
          gaps.length ? h('section', { className: 'pfv_capability_item pfv_capability_gap', 'data-capability-kind': 'gap' },
            h('span', { className: 'pfv_capability_kind' }, '待补齐'), h('strong', null, '只创建缺失部分'),
            h('ul', { className: 'pfv_gap_list' }, ...gaps.slice(0, execution ? 2 : gaps.length).map((gap, index) => h('li', { key: index }, text(gap.capability)))),
            disclosure(execution && gaps.length > 2 ? `查看全部 ${gaps.length} 项缺口与依据` : '查看缺口依据', h('dl', { className: 'pfv_gap_evidence' }, ...gaps.map((gap, index) => h('div', { key: index }, h('dt', null, text(gap.capability)), h('dd', null, text(gap.reason))))))) : null,
          plan.kind === 'native' ? h('section', { className: 'pfv_capability_item', 'data-capability-kind': 'native' }, h('span', { className: 'pfv_capability_kind' }, '现有能力'), h('strong', null, 'Harness 当前能力'), paragraph('无需额外安装插件。', { className: 'pfv_capability_purpose' })) : null));
    };

    // ——— v8：解法卡 / 正在找 / 没查完 (SPEC 5.8–5.10) ———
    const searchedAt = text(discovery?.searchedAt) || text(outcome?.searchedAt);
    // 「我的理解」只显示和原话不一样的那句理解；没有就不写。
    const understanding = !startingNew && !execution ? text(state.intent?.goal) : '';
    const hasLiveSource = [...records(discovery?.sources), ...records(discovery?.sourceCoverage)]
      .some(source => ['live', 'cached'].includes(text(source.status)));
    // gap 结论只有在来源确实读全时才成立；没读全时说结论仍待核对，不说「没有插件」。
    const uncertainGap = Boolean(plan) && plan.kind === 'gap' && (Boolean(health?.incomplete) || !hasLiveSource);
    const showFindCard = startingNew || (!plan && Boolean(busy));
    const needsCreation = plan?.kind === 'gap' || plan?.kind === 'hybrid';

    const v8Action = action => h('button', {
      key: action.label, type: 'button',
      className: action.primary ? 'pf8_btn pf8_ink pf8_big pfv_primary' : 'pf8_btn pf8_big',
      disabled: Boolean(action.disabled), onClick: action.onClick,
    }, action.label);

    // 点了按钮会发生什么：按当前方案和真实动作写，原生方案不提安装。
    const actionNote = label => {
      if (label === '使用这个方案') return plan?.kind === 'native'
        ? '会在对话里跑一遍，不安装插件，也不改文件。'
        : '会先核对作者和版本，装好之后在对话里跑一遍。';
      if (label === '补齐并使用') return hybridInstallCopy(items(plan?.pluginIds).length);
      if (label === '创建自己的插件') return '会在发现好插件里先写出首版方案，你确认后再开始做。';
      if (label === '重试查找') return '会重新读一遍来源，再给一次结论。';
      return '';
    };
    const retryAction = () => ({
      label: '重试查找', primary: true, disabled: !modelReady || locked,
      onClick: state.intent
        ? () => controller.recommend()
        : () => { controller.setHomeRequest(request); void controller.searchHome(); },
    });
    const primaryAction = () => {
      if (uncertainGap) return retryAction();
      if (plan.kind === 'hybrid') return {
        label: '补齐并使用', primary: true, disabled: !canAct || workspacePending,
        onClick: () => !workspacePending && (typeof controller.completeHybridPlan === 'function' ? controller.completeHybridPlan() : controller.startCreation()),
      };
      if (needsCreation) return { label: '创建自己的插件', primary: true, disabled: !canAct, onClick: () => controller.startCreation() };
      return { label: '使用这个方案', primary: true, disabled: !canAct || workspacePending, onClick: () => !workspacePending && controller.runCurrentPlan() };
    };

    const solutionCard = () => {
      const primaryChoice = primaryAction();
      const secondary = !needsCreation || uncertainGap
        ? { label: '创建自己的插件', onClick: () => controller.startCreation(), disabled: !canAct }
        : null;
      const actions = showActions ? [primaryChoice, secondary].filter(Boolean) : [];
      return planSurface.solution({
        request, understanding, plan, candidates: outcome.candidates, discovery, searchedAt, actions,
        note: actions.length && actionNote(primaryChoice.label) ? actionNote(primaryChoice.label) : '',
      });
    };

    const ownerLabel = owner => owner === 'dsh' ? 'DSH' : owner === 'create' ? '待补齐的能力' : owner === 'human' ? '需要你提供' : records(outcome.candidates).find(item => item.id === owner)?.name || text(owner);

    // 卡片下面三块：开始后会这样 / 开始前知道这两点 / 想改？直接说（SPEC 5.8 后半）。
    const afterCard = () => {
      if (!plan || execution) return null;
      const limits = prerequisites(plan, outcome.candidates);
      const steps = records(plan.steps);
      const capabilities = capabilityMap();
      return h(React.Fragment, null,
        capabilities ? h('details', { className: 'pf8_disclosure pf8_caps' },
          h('summary', { className: 'pf8_lk' }, '方案里的插件和版本'),
          h('div', { className: 'pf8_disclosure_body' }, capabilities)) : null,
        steps.length ? h('section', { className: 'pf8_after', 'aria-label': '开始后会这样' },
          h('h2', null, '开始后会这样'),
          h('ol', { className: 'pf8_steps' }, ...steps.map((step, index) => h('li', { key: index },
            h('div', null,
              h('b', null, text(step.capability)),
              text(step.action) ? h('span', { className: 'pf8_step_say' }, `，${short(step.action, 200)}`) : null,
              h('small', null, `这一步由 ${ownerLabel(step.owner)} 负责`),
              text(step.input) || text(step.output)
                ? h('small', null, [
                  text(step.input) ? `要用的：${short(step.input, 90)}` : '',
                  text(step.output) ? `做完会有：${short(step.output, 90)}` : '',
                ].filter(Boolean).join('；'))
                : null))))) : null,
        limits.length ? h('section', { className: 'pf8_after', 'aria-label': '开始前要知道' },
          h('h2', null, limits.length > 1 ? '开始前知道这两点' : '开始前知道这一点'),
          h('div', { className: 'pf8_know' }, ...limits.slice(0, 2).map((limit, index) => h('p', { key: index }, limit))),
          limits.length > 2 ? h('details', { className: 'pf8_disclosure' },
            h('summary', { className: 'pf8_lk' }, `还有 ${limits.length - 2} 条细节`),
            h('div', { className: 'pf8_disclosure_body' }, list(limits.slice(2)))) : null) : null,
        disclosure('完整方案和每一步的输入产出', h(React.Fragment, null,
          paragraph(plan.title), paragraph(plan.rationale),
          ...steps.map((step, index) => h('section', { key: index },
            h('h4', null, text(step.capability)), paragraph(step.action),
            h('dl', { className: 'pfv_io' }, h('dt', null, '输入'), h('dd', null, text(step.input)), h('dt', null, '产出'), h('dd', null, text(step.output))))))),
        previousOutcome ? h('p', { className: 'pf8_fine pf8_prev_note' }, '这是上一次保存的结果，更新后会显示新方案。') : null);
    };

    const searchingCard = () => planSurface.searching({
      request, progress, waited, events: liveEvents,
      actions: [{ label: '停止', onClick: () => controller.cancel(), disabled: false }],
    });

    const emptyCard = () => {
      const actions = state.intent || request ? [retryAction()] : [];
      return h('article', { className: 'pf8_card' },
        text(request) ? h('p', { className: 'pf8_q' }, '你说：', h('b', null, `「${short(request, 120)}」`)) : null,
        h('h1', { className: 'pf8_verdict' }, '继续查找方案'),
        h('p', { className: 'pf8_why' }, '上次查找还没走完，需求已经留着，可以在这里接着来。'),
        actions.length ? h('div', { className: 'pf8_acts' }, ...actions.map(v8Action)) : null);
    };

    // 没查完：来源逐条说清读到/没读到；有方案时放进「先看读到的」，不把它当结论。
    const incompleteCard = () => planSurface.incomplete({
      request, health, discovery,
      actions: [
        retryAction(),
        plan ? { label: '创建自己的插件', onClick: () => controller.startCreation(), disabled: !canAct } : null,
      ].filter(Boolean),
      tentative: plan ? planSurface.solution({
        request, understanding: '', plan, candidates: outcome.candidates, discovery, searchedAt,
        actions: [], note: '', showSignature: false, compact: true,
      }) : null,
    });

    const planCardArea = () => {
      if (uncertainGap) return incompleteCard();
      if (plan) return h(React.Fragment, null,
        showActions ? workspacePicker : null,
        showActions ? workspaceStatus : null,
        solutionCard(), afterCard());
      if (showFindCard) return searchingCard();
      return emptyCard();
    };

    const reviseCard = () => h('section', { className: 'pf8_card pf8_revise', 'aria-label': '想改直接说' },
      h('div', { className: 'pf8_revise_head' },
        h('h2', null, '想改？直接说'),
        h('span', { className: 'pf8_fine' }, expertMode ? '我看得到你的工作区和已经装的插件' : '接着说，这份方案会跟着改')),
      expertSection || followup);

    const blueprintView = () => {
      if (!creation) return h('article', { className: 'pf8_card' },
        h('h1', { className: 'pf8_verdict' }, busy ? '正在整理插件方案' : '创建自己的插件'),
        h('p', { className: 'pf8_why' }, '根据这次需求，整理首版要做什么。'),
        !busy ? h('div', { className: 'pf8_acts' }, v8Action({ label: '创建自己的插件', primary: true, onClick: () => controller.startCreation(), disabled: !modelReady || !state.plan })) : null);
      const summaryRows = [
        ['首版做什么', blueprint.scope], ['怎样使用', blueprint.workflow], ['得到什么', blueprint.outputs],
        ['数据与权限', unique([text(blueprint.data), text(blueprint.tools)]).join('；')], ['完成标准', blueprint.acceptance],
      ].filter(([, value]) => text(value));
      const capabilities = capabilityMap();
      return h('article', { className: 'pf8_card', 'aria-label': '插件方案' },
        h('p', { className: 'pf8_q' }, '创建自己的插件'),
        h('h1', { className: 'pf8_verdict' }, text(blueprint.name) || '我的插件'),
        !execution && text(blueprint.purpose) ? h('p', { className: 'pf8_why' }, short(blueprint.purpose, 260)) : null,
        !execution && summaryRows.length ? h('dl', { className: 'pfv_creation_summary' }, ...summaryRows.map(([label, value]) => h('div', { key: label }, h('dt', null, label), h('dd', null, short(value, 200))))) : null,
        capabilities ? h('details', { className: 'pf8_disclosure pf8_caps' },
          h('summary', { className: 'pf8_lk' }, '方案里的插件和版本'),
          h('div', { className: 'pf8_disclosure_body' }, capabilities)) : null,
        clarification,
        showActions ? h(React.Fragment, null, workspacePicker, workspaceStatus,
          h('div', { className: 'pf8_acts' },
            v8Action({ label: '开始创建', primary: true, onClick: () => !workspacePending && controller.createInWorkspace(), disabled: !canAct || workspacePending || Boolean(question) }),
            v8Action({ label: '回看方案', onClick: () => controller.showFind(), disabled: locked })),
          h('p', { className: 'pf8_next' }, '会先在发现好插件里存一份草稿，再从第一步开始；随时可以回来改。')) : null,
        state.creationDirty ? h('p', { className: 'pf8_fine', role: 'status' }, '修改已保留，开始创建时会一并使用。') : null,
        disclosure('查看与编辑详细方案', h(React.Fragment, null,
          ...blueprintGroups.map((group, index) => h('section', { className: 'pfv_blueprint_block', key: group.title },
            h('h3', null, group.title), h('dl', { className: 'pfv_blueprint_values' }, ...group.fields.map(([key, label]) => h('div', { key }, h('dt', null, label), h('dd', null, text(blueprint[key]) || '待补充')))),
            disclosure(`编辑${group.title}`, h('div', { className: 'pfv_block_editor' }, ...group.fields.map(([key, label]) => h('label', { key, className: 'pfv_field', htmlFor: `pfv_field_${key}` }, label, h('textarea', { id: `pfv_field_${key}`, 'aria-label': label, value: text(blueprint[key]), maxLength: 4000, disabled: locked, onChange: event => controller.editCreation({ blueprint: { [key]: event.target.value } }) })))), { key: `edit-${index}`, className: 'pfv_disclosure pfv_edit_block' }))),
          paragraph(creation.reuseAssessment), list(records(creation.candidateDecisions).map(item => `${records(state.candidates).find(candidate => candidate.id === item.pluginId)?.name || item.pluginId}：${text(item.reason)}`)),
          h('label', { className: 'pfv_field', htmlFor: 'pfv_assumptions' }, '假设，每行一项', h('textarea', { id: 'pfv_assumptions', value: items(form?.assumptions || creation.assumptions).filter(item => typeof item === 'string').join('\n'), maxLength: 6000, disabled: locked, onChange: event => controller.editCreation({ assumptions: event.target.value.split('\n') }) })),
          state.creationDirty ? button('保存草稿', () => controller.updateCreation(), { disabled: locked }) : null)));
    };

    const completedCreation = execution?.phase === 'completed' && execution.kind === 'use'
      ? h('div', { className: 'pf8_acts' }, v8Action({ label: '创建自己的插件', onClick: () => controller.startCreation(), disabled: locked || !modelReady }))
      : null;

    const body = startingNew
      ? searchingCard()
      : execution
        ? h('div', { className: 'pfv_result_grid' },
          h('div', { className: 'pfv_result_primary' }, executionView),
          h('aside', { className: 'pfv_solution_overview', 'aria-label': '本次能力方案' },
            isCreating ? blueprintView() : h(React.Fragment, null, planCardArea(), completedCreation)))
        : isCreating
          ? blueprintView()
          : h('section', { className: 'pf8_planwrap', 'aria-label': '当前方案' }, expertPlanCard, planCardArea());

    return h('div', { className: 'pf_v8 pf8_findpage' },
      h('div', { className: 'pf8_wrap pf8_narrow' },
        h('div', { className: 'pf8_top' },
          h(Lego, { kinds: ['mark'], className: 'pf8_brand', label: '发现好插件' }),
          h('strong', null, '发现好插件'),
          h('nav', { 'aria-label': '当前任务导航' },
            h('button', { type: 'button', className: 'pf8_lk', disabled: locked, onClick: () => controller.showHome() }, '返回首页'),
            h('span', { className: 'pf8_topmeta' }, text(state.executionWorkspaceLabel) || '当前工作区'),
            more || null)),
        previousOutcome ? h('p', { className: 'pf8_prev' }, '上一版方案', h('span', { className: 'pf8_tag' }, revisionLabel)) : null,
        !startingNew && !execution && !showFindCard ? statusLine : null,
        !execution && !showFindCard && (isCreating || !uncertainGap) ? sourceNotice : null,
        h('div', { className: 'pf8_body', 'aria-busy': Boolean(followupBusy) }, body),
        startingNew || execution ? null : reviseCard(),
        startingNew ? null : evidence));
  };
}
