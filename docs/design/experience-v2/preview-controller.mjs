import { featuredCatalog } from '../../../src/featured-catalog.js';
import { normalizeFeaturedPreferences } from '../../../src/featured.js';
import { getCommunityEntry } from '../../../src/community-catalog.js';
import { communityPluginRequest } from '../../../src/community-view.js';

// This controller is deliberately synthetic. It has no network, file or host API.
export const PREVIEW_STORAGE_KEY = 'dsh.plugin-finder.current-workspace-demo.v1';
export const DEMO_REQUESTS = Object.freeze({
  reading: '把几篇文章整理成带出处的知识笔记，方便以后继续问。保留原文来源，不把 AI 摘要当成我已读。',
  projects: '帮我从选定项目的材料里整理进展、卡点和下一步，先只读查看，不自动替我交办任务。',
  tool: '我想做一个自己的小工具：把会议记录整理成可核对的待办，保留原文位置，确认后再写入任务工具。',
});
const clone = value => JSON.parse(JSON.stringify(value));
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const cases = {
  reading: { kind: 'native', title: '先整理一份有出处的知识笔记', goal: '整理文章中的信息，保留出处与实际阅读状态', output: '文章条目、原文出处、阅读状态', steps: [{ capability: '保留原文出处', action: '按你提供的文章整理条目，每条判断能回到原文。' }, { capability: '区分摘要与已读', action: '阅读状态单独记录，由你更新实际读到哪里。' }] },
  projects: { kind: 'combo', title: '用项目材料整理进展和下一步', goal: '只读查看选定项目，归纳进展、卡点和待核对事项', output: '进展简报与待核对清单', steps: [{ capability: '整理项目事实', action: '从选定材料提取变化并保留来源。' }, { capability: '列出下一步', action: '将明确事项与待核对事项分开，不替你交办。' }] },
  tool: { kind: 'gap', title: '创建一个会议待办小工具', goal: '从会议记录整理带出处的待办，由本人决定是否写入任务工具', output: '可核对的待办清单', steps: [{ capability: '先提取，再核对', action: '保留每项待办的原文位置和需要本人补充的内容。' }] },
  'agent-twin': { kind: 'single', title: '从选定资料开始整理自己的知识库', goal: '整理项目知识，保留每条判断的出处和缺口', output: '带来源与边界的知识条目', steps: [{ capability: '读取选定资料', action: '只查看本人选定的材料，不扩大读取范围。' }, { capability: '形成知识条目', action: '保留证据、缺口，以及何时需要交回本人决定。' }] },
  'family-assistant': { kind: 'single', title: '先明确家人各自需要的小助手', goal: '梳理家人的使用场景与各自授权范围', output: '按成员区分的使用方案', steps: [{ capability: '分别记录需求', action: '各成员的偏好和记录独立整理。' }, { capability: '核对分享范围', action: '明确本人同意分享的内容和需要准备的连接。' }] },
  'dsh-dot': { kind: 'combo', title: '从一份只读项目简报开始', goal: '从手机了解选定项目的进展与待处理事项', output: '项目进展与交办边界', steps: [{ capability: '提取项目变化', action: '先整理只读简报，保留项目来源。' }, { capability: '明确交办边界', action: '区分查看进展、实际执行和消息送达。' }] },
  'dot-harness': { kind: 'combo', title: '连接已授权的项目资料', goal: '让助手读取另一个环境中明确授权的项目', output: '访问范围与可核对任务记录', steps: [{ capability: '圈定读取范围', action: '只连接明确授权的项目和已保存会话。' }, { capability: '保留访问记录', action: '分别记录读取、交办和任务状态。' }] },
};
const matchCase = request => Object.entries(DEMO_REQUESTS).find(([, value]) => value === request)?.[0] || featuredCatalog.find(entry => entry.scenario === request)?.id || null;
const communityWarning = '已保留这条插件需求和原输入。这里可浏览真实公开目录；核对使用方案需要回到 Harness 调用模型，本页尚未推荐、安装或运行这个插件。';
const initial = () => ({ view: 'home', stage: 'describe', homeRequest: '', homeCommunityEntryId: null, request: '', intent: null, plan: null, candidates: [], discovery: null, taskId: null, revisionId: null, revisionNumber: null, creation: null, creationForm: null, creationDirty: false, conversation: [], followupText: '', followupPending: false, searching: false, busy: '', execution: null, executionWorkspaceLabel: '当前演示工作区', featuredPreferences: normalizeFeaturedPreferences(null), featuredHistory: [], featuredDrafts: [], demoHistory: [], demoVersions: [], demoResults: [], demoCase: null, demoNextFailure: '', notice: '', homeWarning: '', bootstrapLoaded: true });

export function createPreviewController({ storage = null, schedule = callback => setTimeout(callback, 480), unschedule = id => clearTimeout(id) } = {}) {
  let state = initial();
  let token = 0;
  let timer;
  const listeners = new Set();
  try {
    const raw = storage?.getItem(PREVIEW_STORAGE_KEY);
    if (raw && raw.length <= 600000) {
      const saved = JSON.parse(raw);
      if (saved.version === 1 && record(saved.state) && typeof saved.state.homeRequest === 'string' && Array.isArray(saved.state.demoHistory)) {
        state = { ...state, ...saved.state, busy: '', searching: false, followupPending: false };
        if (['preparing', 'running', 'waiting'].includes(state.execution?.phase)) state.execution = { ...state.execution, phase: 'cancelled', summary: '演示已停止。', details: '页面重新打开后不会自动重跑，也没有真实任务在后台运行。' };
      }
    }
  } catch { state.homeWarning = '演示记录暂时无法读取，原存储未改动。'; }
  const publish = patch => {
    state = { ...state, ...patch };
    try { storage?.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ version: 1, state })); }
    catch { state = { ...state, homeWarning: '本次演示无法保存到浏览器，当前内容仍可继续使用。' }; }
    for (const listener of listeners) listener();
  };
  const later = (id, fn) => { timer = schedule(() => { timer = null; if (id === token) fn(); }); };
  const next = () => { token += 1; if (timer != null) unschedule(timer); timer = null; return token; };
  const active = () => Boolean(state.busy) || ['preparing', 'running', 'waiting'].includes(state.execution?.phase);
  const parkInput = (value, communityEntryId = state.homeCommunityEntryId) => {
    if (!value.trim() || !communityEntryId && value === state.request || state.featuredDrafts.some(draft => draft.request === value && (draft.communityEntryId || null) === (communityEntryId || null))) return;
    publish({ featuredDrafts: [{ id: `demo-input-${Date.now()}-${state.featuredDrafts.length}`, request: value, ...(communityEntryId ? { communityEntryId } : {}), createdAt: new Date().toISOString() }, ...state.featuredDrafts].slice(0, 20) });
  };
  const snapshot = () => ({ request: state.request, taskId: state.taskId, intent: clone(state.intent), plan: clone(state.plan), candidates: clone(state.candidates), discovery: clone(state.discovery), creation: clone(state.creation), creationForm: clone(state.creationForm), creationDirty: state.creationDirty, conversation: clone(state.conversation), followupText: state.followupText, revisionNumber: state.revisionNumber, revisionId: state.revisionId, demoCase: state.demoCase, demoVersions: clone(state.demoVersions), demoResults: clone(state.demoResults), execution: clone(state.execution), view: state.creation ? 'create' : 'find', stage: state.stage });
  const parkTask = () => { if (state.taskId) publish({ demoHistory: [snapshot(), ...state.demoHistory.filter(item => item.taskId !== state.taskId)].slice(0, 20) }); };
  const revise = () => ({ revisionNumber: (state.revisionNumber || 0) + 1, revisionId: `demo-revision-${(state.revisionNumber || 0) + 1}`, demoVersions: [{ number: state.revisionNumber, plan: clone(state.plan), creation: clone(state.creation) }, ...state.demoVersions].slice(0, 20) });
  const finishPlan = (which, failed = false) => {
    const source = cases[which];
    const pluginIds = ['single', 'combo'].includes(source.kind) ? ['demo-organizer'] : [];
    publish({ searching: false, busy: '', view: 'find', stage: 'plan', demoCase: which,
      intent: { goal: source.goal, input: '本页合成示例材料', output: source.output, constraints: ['保留出处', '不自动外发'] },
      plan: { kind: source.kind, title: source.title, rationale: '这是为当前示例预设的方案，用于检查界面动线。没有调用模型，也没有查询真实插件供给。', pluginIds, limits: ['演示只使用合成材料，不读取本机文件或外部服务。'], steps: source.steps.map((step, index) => ({ ...step, owner: pluginIds.length && index ? 'demo-organizer' : 'dsh', input: '合成示例材料', output: source.output })) },
      candidates: pluginIds.length ? [{ id: 'demo-organizer', name: '资料整理示例插件', version: '演示', requirements: [] }] : [],
      discovery: { status: failed ? 'partial' : 'complete', sources: [{ id: 'demo-source', title: '本页合成演示资料', status: failed ? 'failed' : 'live' }] },
      conversation: [...state.conversation, { id: `demo-answer-${state.revisionNumber}`, role: 'assistant', text: `演示预设方案：${source.goal}。未做真实搜索。` }],
      featuredHistory: [{ taskId: state.taskId, stage: 'plan', request: state.request, title: source.title }, ...state.featuredHistory].slice(0, 20),
    });
  };
  const beginSearch = request => {
    if (active() || !request.trim()) return false;
    const which = matchCase(request.trim());
    if (!which) { publish({ view: 'home', homeRequest: request, homeWarning: '这句话已保留。离线演示只支持首页示例和精选场景，尚未理解或生成这条自由输入的方案。' }); return false; }
    parkTask();
    const id = next();
    const fail = state.demoNextFailure === 'source';
    publish({ ...initial(), featuredPreferences: state.featuredPreferences, featuredHistory: state.featuredHistory, featuredDrafts: state.featuredDrafts, demoHistory: state.demoHistory, homeRequest: request, request, searching: true, busy: 'analyze', taskId: `demo-task-${Date.now()}-${id}`, revisionNumber: 1, revisionId: 'demo-revision-1', conversation: [{ id: 'demo-request', role: 'user', text: request }], demoCase: which });
    later(id, () => { publish({ busy: 'recommend' }); later(id, () => finishPlan(which, fail)); });
    return true;
  };
  const execute = kind => {
    if (active() || !state.plan) return false;
    if (kind === 'create' && (!state.creation || state.creation.questions.some(question => !state.creation.answers.some(answer => answer.id === question.id)))) return false;
    const id = next();
    const failed = state.demoNextFailure === 'execution';
    if (kind === 'create' && state.creationDirty) publish({ creation: { ...state.creation, blueprint: clone(state.creationForm.blueprint), assumptions: clone(state.creationForm.assumptions) }, creationDirty: false });
    publish({ execution: { phase: 'preparing', kind, summary: '演示：正在准备本页合成材料。' }, demoResults: [], demoNextFailure: '' });
    later(id, () => { publish({ execution: { phase: 'running', kind, summary: kind === 'create' ? '演示：正在生成预设插件结果。' : '演示：正在处理预设材料。' } }); later(id, () => publish(failed ? {
      execution: { phase: 'failed', kind, summary: '演示：这次没有完成。', details: '预设的执行失败；原方案保留，可以直接重试。' },
    } : {
      execution: { phase: 'completed', kind, summary: kind === 'create' ? '演示结果已显示。' : '演示材料已整理。', details: kind === 'create' ? '这是合成的创建结果，没有生成文件、安装插件或调用真实 Creator。' : '这是合成结果，没有读取真实文件或运行插件。' },
      demoResults: kind === 'create' ? [{ title: state.creation.blueprint.name, value: '示例插件结构与验收清单；未生成真实文件。' }, { title: '使用范围', value: state.creation.blueprint.scope }] : [{ title: '示例条目一', value: '保留出处：本页合成材料 A；状态：待本人核对。' }, { title: '示例条目二', value: '保留出处：本页合成材料 B；状态：待本人核对。' }],
    })); });
    return true;
  };
  const controller = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setHomeRequest(value) { if (!active()) publish({ homeRequest: String(value).slice(0, 6000), homeWarning: '' }); },
    clearHomeCommunitySelection() { if (active()) return false; publish({ homeCommunityEntryId: null, homeWarning: '' }); return true; },
    prepareHomeExample(value) { if (!active()) { parkInput(state.homeRequest); publish({ homeRequest: value, homeCommunityEntryId: null, homeWarning: '' }); } },
    searchHome() {
      if (active()) return false;
      if (state.homeCommunityEntryId) { publish({ view: 'home', homeWarning: communityWarning }); return false; }
      return beginSearch(state.homeRequest);
    },
    startFeatured(id) { const entry = featuredCatalog.find(item => item.id === id); if (!entry || active()) return false; parkInput(state.homeRequest); return beginSearch(entry.scenario); },
    startCommunityPlugin(id) {
      const entry = getCommunityEntry(id);
      if (!entry || active()) return false;
      parkInput(state.homeRequest); parkTask();
      publish({ view: 'home', homeRequest: state.homeRequest.trim() ? state.homeRequest : communityPluginRequest(), homeCommunityEntryId: entry.id, homeWarning: communityWarning });
      return false;
    },
    showFeatured(id) { if (!active()) publish({ view: 'featured', featuredId: id }); },
    showHome() { if (!active()) publish({ view: 'home', notice: '' }); },
    showFind() { if (!active()) publish({ view: 'find', execution: null, demoResults: [] }); },
    showCreation() { if (!active()) publish({ view: 'create', execution: null, demoResults: [] }); },
    showHistory() { if (!active()) { parkTask(); publish({ view: 'history' }); } },
    restoreHistory(taskId) { const item = state.demoHistory.find(value => value.taskId === taskId); if (item && !active()) { parkInput(state.homeRequest); parkTask(); publish({ ...clone(item), homeRequest: item.request, homeCommunityEntryId: null, notice: '已恢复本页演示记录。', execution: null }); } },
    restoreFeaturedDraft(id) { const item = state.featuredDrafts.find(value => value.id === id); if (item && !active()) { parkInput(state.homeRequest); publish({ view: 'home', homeRequest: item.request, homeCommunityEntryId: item.communityEntryId || null }); } },
    removeFeaturedDraft(id) { if (!active()) publish({ featuredDrafts: state.featuredDrafts.filter(item => item.id !== id) }); },
    recommend() { if (!active() && state.demoCase) { const id = next(); publish({ busy: 'recommend', execution: null }); later(id, () => finishPlan(state.demoCase)); } },
    cancel() { next(); publish({ busy: '', searching: false, followupPending: false, view: state.plan ? state.view : 'home', homeWarning: state.plan ? '' : '演示查找已停止，需求已保留。' }); },
    cancelExecution() { next(); publish({ execution: { ...state.execution, phase: 'cancelled', summary: '演示已停止。', details: '原方案保留，没有真实任务在后台运行。' } }); },
    setFollowup(value) { if (!active()) publish({ followupText: String(value).slice(0, 1500) }); },
    submitFollowup() {
      if (active() || !state.followupText.trim()) return;
      const value = state.followupText.trim();
      const conversation = [...state.conversation, { id: `demo-user-${Date.now()}`, role: 'user', text: value }];
      const readOnly = ['原文只读', '请保持原文只读', '第一版只处理本地文件'].includes(value);
      const narrow = state.demoCase === 'reading' && ['只做阅读状态', '先只做阅读状态', '首版只做阅读状态'].includes(value);
      if (!readOnly && !narrow) { publish({ conversation, followupText: '', notice: '补充已原样保存。这条自由修正不在演示范围内，当前方案未被修改。' }); return; }
      const patch = revise();
      const plan = clone(state.plan); plan.limits = [...new Set([...plan.limits, readOnly ? '原文只读，只更新独立记录。' : '首版只记录来源和阅读状态，不生成摘要。'])];
      const creation = clone(state.creation);
      if (creation) { creation.blueprint[readOnly ? 'data' : 'scope'] = readOnly ? '原文只读，只更新独立记录。' : '首版只记录来源和阅读状态，不生成摘要。'; }
      publish({ ...patch, plan, creation, creationForm: creation ? { blueprint: clone(creation.blueprint), answers: clone(creation.answers), assumptions: clone(creation.assumptions) } : null, creationDirty: false, conversation, followupText: '', execution: null, demoResults: [], notice: '已按这条预设修正更新同一份演示方案。' });
    },
    startCreation() {
      if (active() || !state.plan) return;
      if (state.creation) { controller.showCreation(); return; }
      const id = next(); publish({ view: 'create', busy: 'creation-start', execution: null, demoResults: [] });
      later(id, () => {
        const blueprint = { name: state.demoCase === 'reading' ? '我的阅读记录插件' : state.demoCase === 'tool' ? '我的会议待办插件' : '我的资料整理插件', purpose: state.intent.goal, scope: state.demoCase === 'reading' ? '记录标题、出处和阅读状态' : '只处理本人选定的材料，先生成可核对结果', workflow: '提供材料 → 整理结果 → 本人核对', inputs: '本人选择的材料', outputs: state.intent.output, ui: '在当前工作区查看并补充修改', data: '不修改原文，保存位置待选择', tools: '只读选定材料，不自动外发', runtime: '当前工作区', acceptance: '每条结果可回到出处，未知项清楚标记' };
        const creation = { status: 'draft', strategy: 'new', blueprint, supply: { status: 'current' }, questions: [{ id: 'output', question: '第一版的结果放在哪里？', reason: '只需决定结果的保存方式。', options: ['保存在本机', '只在当前会话显示'] }], answers: [], assumptions: [], reuseAssessment: '合成演示：沿用当前方案和约束，没有真实评估插件供给。', candidateDecisions: [] };
        publish({ ...revise(), busy: '', creation, creationForm: { blueprint: clone(blueprint), answers: [], assumptions: [] } });
      });
    },
    answerCreation(id, answer) {
      if (active() || !state.creation?.questions.some(question => question.id === id && question.options.includes(answer))) return;
      const creation = clone(state.creation); creation.answers = [...creation.answers.filter(item => item.id !== id), { id, answer, assumed: false }]; creation.blueprint.data = `${answer}；原文只读，不自动外发。`;
      publish({ ...revise(), creation, creationForm: { ...state.creationForm, blueprint: clone(creation.blueprint), answers: clone(creation.answers) }, creationDirty: false, notice: '' });
    },
    editCreation(patch) { if (!active() && state.creationForm) publish({ creationForm: { ...state.creationForm, ...patch, blueprint: { ...state.creationForm.blueprint, ...patch.blueprint } }, creationDirty: true, execution: null, demoResults: [] }); },
    updateCreation() { if (!active() && state.creation) publish({ ...revise(), creation: { ...state.creation, ...clone(state.creationForm) }, creationDirty: false, notice: '演示草稿已保存。' }); },
    runCurrentPlan() { return execute('use'); },
    createInWorkspace() { return execute('create'); },
    toggleFeaturedInterest(id) { const interests = state.featuredPreferences.interests; publish({ featuredPreferences: normalizeFeaturedPreferences({ ...state.featuredPreferences, interests: interests.includes(id) ? interests.filter(item => item !== id) : [...interests, id] }) }); },
    dismissFeatured(id) { publish({ featuredPreferences: normalizeFeaturedPreferences({ ...state.featuredPreferences, dismissed: [...state.featuredPreferences.dismissed, id] }) }); },
    restoreFeatured() { publish({ featuredPreferences: { ...state.featuredPreferences, dismissed: [] } }); },
    loadDemoCase(which) { if (active() || !DEMO_REQUESTS[which]) return; parkInput(state.homeRequest); publish({ view: 'home', homeRequest: DEMO_REQUESTS[which], homeCommunityEntryId: null, homeWarning: '' }); },
    setDemoFailure(which) { if (!active()) publish({ demoNextFailure: which, notice: which === 'source' ? '下一次演示查找会返回来源未完成。' : '下一次演示执行会返回失败。' }); },
  };
  return controller;
}
