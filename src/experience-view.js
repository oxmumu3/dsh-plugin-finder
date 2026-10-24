import { renderFeaturedView } from './featured-view.js';
import { featuredCatalog } from './featured-catalog.js';
import { rankFeatured } from './featured.js';
import { createCommunityView } from './community-view.js';
import { getCommunityEntry } from './community-catalog.js';

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
  if (['failed', 'partial', 'incomplete'].includes(discovery.status) || sources.some(source => ['failed', 'stale', 'partial'].includes(source.status))) {
    return { incomplete: true, message: '部分来源尚未查完。当前判断仅基于已返回资料，不能据此确认没有合适的插件。' };
  }
  const coverage = records([discovery.coverage, ...records(discovery.sourceCoverage)]);
  const positiveCount = value => Number.isFinite(value) && value > 0;
  // A live index does not mean every match was read or its requirements verified.
  // Known exclusions (such as a required Key) are not unfinished evidence.
  if (coverage.some(item => positiveCount(item.uninspected) || ['author-read-timeout', 'author-unresolved', 'extra-key-unknown'].some(reason => positiveCount(item.excludedReasons?.[reason])))) {
    return { incomplete: true, message: '部分候选尚未核对完整。当前判断仅基于已返回资料，不能据此确认没有合适的插件。' };
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

  return function ExperienceView({ state, controller, busy = false, modelReady = false, copyText, sections = {} }) {
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
    const submitFollowup = event => { event.preventDefault(); if (!followupBusy && modelReady && text(state.followupText).trim()) void controller.submitFollowup(); };
    const statusLine = followupBusy && !execution ? h('div', { className: 'pfv_progress', role: 'status' },
      h('span', { className: 'pfv_progress_dot', 'aria-hidden': true }), h('span', null, progress),
      button('停止', () => controller.cancel(), { className: 'pfv_button pfv_quiet', 'aria-label': '停止当前操作并保留内容' })) : null;
    const suggested = rankFeatured(featuredCatalog, { history: Array.isArray(state.featuredHistory) ? state.featuredHistory : state.history, preferences: state.featuredPreferences })[0];
    const scenario = suggested?.entry || featuredCatalog.find(entry => !items(state.featuredPreferences?.dismissed).includes(entry.id)) || featuredCatalog[0];
    const homeCommunityEntry = getCommunityEntry(state.homeCommunityEntryId);

    const home = () => h('div', { className: 'pfv_home' },
      h('div', { className: 'pfv_home_start' },
      h('section', { className: 'pfv_home_intro', 'aria-labelledby': 'pfv_home_title' },
        h('h1', { id: 'pfv_home_title', className: 'pfv_home_heading' }, '你想完成什么？'),
        h('p', { className: 'pfv_home_lead' }, '说说你的需求，找到就用，缺什么就一起创建。'),
        h('form', { className: 'pfv_composer pfv_home_composer pfv_home_card', onSubmit: event => { event.preventDefault(); if (!busy && modelReady && text(state.homeRequest).trim()) void controller.searchHome(); } },
          state.homeCommunityEntryId ? h('div', { className: 'pfv_home_selection', 'aria-label': '已选插件' },
            h('span', null, `已选插件：${homeCommunityEntry?.name || '当前目录未收录'}`),
            button('取消指定', () => { if (!taskInputBusy) controller.clearHomeCommunitySelection(); }, { className: 'pfv_button pfv_quiet', disabled: taskInputBusy })) : null,
          h('label', { className: 'pfv_sr_only', htmlFor: 'pfv_home_input' }, '任务描述'),
          h('textarea', { ref: homeInput, id: 'pfv_home_input', 'aria-label': '任务描述', value: text(state.homeRequest), maxLength: 6000, disabled: taskInputBusy, placeholder: '例如：把散落的项目资料，整理成可以随时提问的知识库', onChange: event => controller.setHomeRequest(event.target.value), onKeyDown: shortcut }),
          h('div', { className: 'pfv_composer_bottom' }, h('button', { type: 'submit', className: 'pfv_button pfv_primary', disabled: busy || !modelReady || !text(state.homeRequest).trim() }, '帮我找方案')))),
      h('div', { className: 'pfv_home_extras' },
        h('div', { className: 'pfv_examples', 'aria-label': '可编辑的需求示例' }, h('span', { className: 'pfv_hint' }, '例如'), ...examples.map(([label, value]) => button(label, () => {
          if (controller.prepareHomeExample) controller.prepareHomeExample(value);
          else if (!text(state.homeRequest).trim()) controller.setHomeRequest(value);
          homeInput.current?.focus?.();
        }, { key: label, className: 'pfv_button pfv_example', disabled: taskInputBusy, 'aria-label': `填入${label}的示例，之后可以修改` })),
          h('a', { href: '#pfv_community_title', className: 'pfv_store_jump' }, '逛逛插件商店 →')),
        state.homeWarning ? h('p', { className: 'pfv_warning', role: 'status' }, text(state.homeWarning)) : null,
        state.bootstrapLoaded && !modelReady ? h('div', { className: 'pfv_warning' }, h('p', null, '先在 DSH 设置中配置默认模型，再开始查找。'), button('重新读取配置', () => controller.bootstrap(), { disabled: busy })) : null,
        state.taskId || state.request ? h('div', { className: 'pfv_resume' }, h('div', null, h('span', { className: 'pfv_hint' }, '上次进行到这里'), paragraph(text(state.creation?.blueprint?.name) || text(state.plan?.title) || text(state.intent?.goal) || text(state.request))), button('继续上次方案', () => state.creation ? controller.showCreation() : controller.showFind(), { disabled: busy })) : null),
      h('aside', { className: 'pfv_home_scenario', 'aria-label': suggested ? '猜你喜欢' : '试试这个' },
        h('h2', { className: 'pfv_home_heading' }, suggested ? '猜你喜欢' : '试试这个'),
        h('p', { className: 'pfv_home_lead' }, '一个可以直接开始的想法。'),
        h('div', { className: 'pfv_home_card pfv_scenario_card' },
          h('h3', null, scenarioTitles[scenario.id]), paragraph(scenarioBenefits[scenario.id]),
          suggested ? h('p', { className: 'pfv_scenario_reason' }, suggested.reason) : null,
          h('div', { className: 'pfv_composer_bottom' }, button('开始这个需求', () => controller.startFeatured(scenario.id), { className: 'pfv_button pfv_scenario_start', disabled: locked || !modelReady }))))),
      renderFeaturedView({ h, state, controller, copyText, busy, mode: 'home' }),
      h(CommunityView, { controller, busy: locked, modelReady }));

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

    const clarification = isCreating && question ? h('section', { className: 'pfv_clarification', 'aria-labelledby': 'pfv_question_title' },
      h('h3', { id: 'pfv_question_title' }, text(question.question)), paragraph(question.reason, { className: 'pfv_hint' }),
      h('div', { className: 'pfv_choices' }, ...strings(question.options).map(option => button(option, () => controller.answerCreation(question.id, option), { key: option, disabled: locked, 'aria-pressed': currentAnswer?.answer === option }))),
      h('p', { className: 'pfv_hint' }, '也可以在下方补充你的想法。')) : null;

    const followup = h('form', { className: 'pfv_composer pfv_followup', onSubmit: submitFollowup },
      h('label', { className: 'pfv_composer_label', htmlFor: 'pfv_followup_input' }, '想调整哪里？'),
      h('textarea', { id: 'pfv_followup_input', 'aria-label': '补充需求', value: text(state.followupText), maxLength: 1500, disabled: followupBusy || !state.taskId, placeholder: isCreating ? '例如：第一版只处理本地文件，先不做自动发送。' : '补充材料、限制，或直接说你想改什么。', onChange: event => controller.setFollowup(event.target.value), onKeyDown: shortcut }),
      h('div', { className: 'pfv_composer_bottom' }, h('span', { className: 'pfv_hint' }, state.followupRetry ? '补充已保存，可以重试' : '接着改这份方案'), h('button', { type: 'submit', className: 'pfv_button', disabled: followupBusy || !modelReady || !state.taskId || !text(state.followupText).trim() }, state.followupRetry ? '重试查找' : '更新方案')),
      !modelReady && state.bootstrapLoaded ? h('p', { className: 'pfv_hint' }, '模型尚未配置，已有记录仍可查看。') : null);

    const history = h('div', { className: 'pfv_messages', 'aria-label': '当前需求的对话记录' }, ...messages.map((message, index) => h('article', { key: message.id || index, className: `pfv_message pfv_message_${message.role}` },
      h('div', { className: 'pfv_message_meta' }, h('span', null, message.role === 'user' ? '你' : '方案助手'), Number.isInteger(message.revisionNumber) ? h('span', null, `版本 ${message.revisionNumber}`) : null), paragraph(message.text))));
    const evidence = h('div', { className: 'pfv_evidence' },
      disclosure('来源与备选方案', h(React.Fragment, null, sections.candidateView, sections.searchEvidence, sections.selectedInstallGuide)),
      disclosure('需求与修改记录', h(React.Fragment, null, history, sections.taskHistory)),
      disclosure('记录使用结果', sections.feedback));
    const sourceNotice = health ? h('aside', { className: 'pfv_source_notice', role: 'status' }, h('p', null, health.message),
      health.incomplete && isCreating ? h('p', { className: 'pfv_hint' }, '开始创建时会重新核对；你的补充会保留。') : null) : null;
    const workspacePicker = sections.workspacePicker ? h('div', { className: 'pfv_workspace_picker' }, sections.workspacePicker) : null;
    const canAct = !locked && !previousOutcome && Boolean(state.taskId) && modelReady;
    const workspacePending = state.workspacePhase != null && state.workspacePhase !== 'ready';
    const workspaceStatus = workspacePending ? h('p', { className: 'pfv_hint', role: 'status' }, '正在读取工作区，准备好后即可开始。') : null;
    const showActions = !executionActive && !execution?.canContinue && execution?.phase !== 'completed';
    const planView = () => {
      if (!plan) return h('div', { className: 'pfv_outcome_empty' }, h('h2', null, busy ? '方案正在形成' : '继续查找方案'),
        h('p', { className: 'pfv_hint' }, busy ? '需求已保留，找到的方案会显示在这里。' : '上次查找尚未完成，你可以从这里继续。'),
        !busy && state.intent ? primary('重试查找', () => controller.recommend(), { disabled: !modelReady }) : null,
        !busy && !state.intent && request ? primary('重试查找', () => { controller.setHomeRequest(request); void controller.searchHome(); }, { disabled: !modelReady }) : null);
      const limits = prerequisites(plan, outcome.candidates);
      const uncertainGap = plan.kind === 'gap' && (health?.incomplete || ![...records(discovery?.sources), ...records(discovery?.sourceCoverage)].some(source => ['live', 'cached'].includes(source.status)));
      const retry = uncertainGap;
      const kind = uncertainGap ? '供给仍待核对' : { native: '直接使用现有能力', single: '现成插件方案', combo: '组合方案', gap: '可以创建自己的插件' }[plan.kind] || '当前方案';
      const ownerLabel = owner => owner === 'dsh' ? 'DSH' : owner === 'human' ? '需要你提供' : records(outcome.candidates).find(item => item.id === owner)?.name || text(owner);
      const selected = records(outcome.candidates).filter(candidate => items(plan.pluginIds).includes(candidate.id));
      const steps = records(plan.steps);
      return h(React.Fragment, null,
        h('div', { className: 'pfv_outcome_intro' }, h('span', { className: 'pfv_kind' }, kind), h('h2', null, uncertainGap ? '继续核对可行方案' : text(plan.title)), !execution ? paragraph(uncertainGap ? '本次搜索还不足以判断有没有现成方案。可以重试，也可以直接创建自己的插件。' : short(plan.rationale, 300)) : null),
        selected.length ? h('div', { className: 'pfv_selected_plugins', 'aria-label': '方案使用的插件' }, ...selected.map(candidate => h('span', { key: candidate.id }, text(candidate.name) || candidate.id, text(candidate.version) ? ` · ${candidate.version}` : ''))) : null,
        showActions ? h(React.Fragment, null, workspacePicker, !retry && plan.kind !== 'gap' ? workspaceStatus : null, h('div', { className: 'pfv_outcome_actions' },
          primary(retry ? '重试查找' : plan.kind === 'gap' ? '创建自己的插件' : '使用这个方案', () => retry ? controller.recommend() : plan.kind === 'gap' ? controller.startCreation() : !workspacePending && controller.runCurrentPlan(), { disabled: !canAct || !retry && plan.kind !== 'gap' && workspacePending }),
          plan.kind !== 'gap' || retry ? button('创建自己的插件', () => controller.startCreation(), { disabled: !canAct, className: 'pfv_button pfv_quiet' }) : null)) : null,
        executionView,
        execution?.phase === 'completed' && execution.kind === 'use' ? h('div', { className: 'pfv_outcome_actions' }, button('创建自己的插件', () => controller.startCreation(), { disabled: locked || !modelReady, className: 'pfv_button pfv_quiet' })) : null,
        steps.length ? h('section', { className: 'pfv_plan_steps', 'aria-label': '完成路径' }, h('h3', null, '这次会做什么'), h('ol', null, ...steps.map((step, index) => h('li', { key: index }, h('span', { className: 'pfv_step_number', 'aria-hidden': true }, index + 1), h('div', null, h('h4', null, text(step.capability)), paragraph(short(step.action, 220)), h('p', { className: 'pfv_hint' }, ownerLabel(step.owner))))))) : null,
        limits.length ? h('div', { className: 'pfv_prerequisites' }, h('h3', null, '使用前提'), list(limits.slice(0, 2)), limits.length > 2 ? disclosure(`还有 ${limits.length - 2} 项限制`, list(limits.slice(2))) : null) : null,
        disclosure('查看完整方案', h(React.Fragment, null, uncertainGap ? h('p', { className: 'pfv_hint' }, '以下是来源尚未完整核对时的暂定判断。') : null, paragraph(plan.title), paragraph(plan.rationale), ...steps.map((step, index) => h('section', { key: index }, h('h4', null, text(step.capability)), paragraph(step.action), h('dl', { className: 'pfv_io' }, h('dt', null, '输入'), h('dd', null, text(step.input)), h('dt', null, '产出'), h('dd', null, text(step.output))))))),
        previousOutcome ? h('p', { className: 'pfv_hint pfv_previous_note' }, '这是上一次保存的结果，更新后会显示新方案。') : null);
    };

    const blueprintView = () => {
      if (!creation) return h('div', { className: 'pfv_outcome_empty' }, h('h2', null, busy ? '正在整理插件方案' : '创建自己的插件'), h('p', { className: 'pfv_hint' }, '根据这次需求，整理首版要做什么。'), !busy ? primary('创建自己的插件', () => controller.startCreation(), { disabled: !modelReady || !state.plan }) : null);
      const summaryRows = [
        ['首版做什么', blueprint.scope], ['怎样使用', blueprint.workflow], ['得到什么', blueprint.outputs],
        ['数据与权限', unique([text(blueprint.data), text(blueprint.tools)]).join('；')], ['完成标准', blueprint.acceptance],
      ].filter(([, value]) => text(value));
      return h(React.Fragment, null,
        h('div', { className: 'pfv_outcome_intro' }, h('span', { className: 'pfv_kind' }, '创建自己的插件'), h('h2', null, text(blueprint.name) || '我的插件'), !execution ? paragraph(short(blueprint.purpose, 260)) : null),
        !execution ? h('dl', { className: 'pfv_creation_summary' }, ...summaryRows.map(([label, value]) => h('div', { key: label }, h('dt', null, label), h('dd', null, short(value, 200))))) : null,
        clarification,
        showActions ? h(React.Fragment, null, workspacePicker, workspaceStatus, h('div', { className: 'pfv_outcome_actions' }, primary('开始创建', () => !workspacePending && controller.createInWorkspace(), { disabled: !canAct || workspacePending || Boolean(question) }), button('回看方案', () => controller.showFind(), { disabled: locked, className: 'pfv_button pfv_quiet' }))) : null,
        executionView,
        state.creationDirty ? h('p', { className: 'pfv_save_state', role: 'status' }, '修改已保留，开始创建时会一并使用。') : null,
        disclosure('查看与编辑详细方案', h(React.Fragment, null,
          ...blueprintGroups.map((group, index) => h('section', { className: 'pfv_blueprint_block', key: group.title },
            h('h3', null, group.title), h('dl', { className: 'pfv_blueprint_values' }, ...group.fields.map(([key, label]) => h('div', { key }, h('dt', null, label), h('dd', null, text(blueprint[key]) || '待补充')))),
            disclosure(`编辑${group.title}`, h('div', { className: 'pfv_block_editor' }, ...group.fields.map(([key, label]) => h('label', { key, className: 'pfv_field', htmlFor: `pfv_field_${key}` }, label, h('textarea', { id: `pfv_field_${key}`, 'aria-label': label, value: text(blueprint[key]), maxLength: 4000, disabled: locked, onChange: event => controller.editCreation({ blueprint: { [key]: event.target.value } }) })))), { key: `edit-${index}`, className: 'pfv_disclosure pfv_edit_block' }))),
          paragraph(creation.reuseAssessment), list(records(creation.candidateDecisions).map(item => `${records(state.candidates).find(candidate => candidate.id === item.pluginId)?.name || item.pluginId}：${text(item.reason)}`)),
          h('label', { className: 'pfv_field', htmlFor: 'pfv_assumptions' }, '假设，每行一项', h('textarea', { id: 'pfv_assumptions', value: items(form?.assumptions || creation.assumptions).filter(item => typeof item === 'string').join('\n'), maxLength: 6000, disabled: locked, onChange: event => controller.editCreation({ assumptions: event.target.value.split('\n') }) })),
          state.creationDirty ? button('保存草稿', () => controller.updateCreation(), { disabled: locked }) : null)));
    };

    return h('div', { className: 'pfv_workspace pfv_current_workspace' },
      h('nav', { className: 'pfv_workspace_nav', 'aria-label': '当前任务导航' }, button('返回首页', () => controller.showHome(), { disabled: locked, className: 'pfv_button pfv_quiet' }), h('span', { className: 'pfv_hint' }, text(state.executionWorkspaceLabel) || '当前工作区')),
      h('section', { className: 'pfv_request_summary', 'aria-label': '本次需求' }, h('p', null, h('span', { className: 'pfv_hint' }, '你想做的事'), h('span', { className: 'pfv_request_text' }, short(request, 180))),
        !startingNew && !execution && text(state.intent?.goal) && state.intent.goal !== request ? h('p', null, h('span', { className: 'pfv_hint' }, '我的理解'), h('span', { className: 'pfv_understanding_text' }, short(state.intent.goal, 160))) : null),
      h('section', { className: 'pfv_outcome', id: 'pfv_outcome', 'aria-labelledby': 'pfv_outcome_title', 'aria-busy': Boolean(followupBusy) },
        h('div', { className: 'pfv_column_heading' }, h('h2', { id: 'pfv_outcome_title' }, isCreating ? '插件方案' : previousOutcome ? '上一版方案' : '当前方案'), startingNew ? null : h('span', { className: 'pfv_version' }, revisionLabel)),
        statusLine, execution ? null : sourceNotice, h('div', { className: 'pfv_outcome_document' }, isCreating ? blueprintView() : planView()), execution || startingNew ? null : followup, startingNew ? null : evidence));
  };
}
