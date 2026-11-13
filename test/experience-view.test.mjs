import assert from 'node:assert/strict';
import test from 'node:test';
import { createExperienceView, experienceSourceHealth } from '../src/experience-view.js';
import { featuredCatalog } from '../src/featured-catalog.js';
import { getCommunityOverview } from '../src/community-catalog.js';

const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
const React = { createElement: h, Fragment: 'fragment', useRef: value => ({ current: value }), useState: value => [value, () => {}], useEffect() {} };
const View = createExperienceView(React);
const resolve = node => node && typeof node === 'object' && !Array.isArray(node) && typeof node.type === 'function' ? resolve(node.type(node.props)) : node;
const nodes = node => { const value = resolve(node); return Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.children)] : []; };
const visibleNodes = node => { const value = resolve(node); return Array.isArray(value) ? value.flatMap(visibleNodes) : value && typeof value === 'object' ? [value, ...visibleNodes(value.type === 'details' && !value.props.open ? value.children.find(child => child?.type === 'summary') : value.children)] : []; };
const content = (node, visible = false) => { const value = resolve(node); return value == null ? '' : typeof value !== 'object' ? String(value) : Array.isArray(value) ? value.map(child => content(child, visible)).join(' ') : content(visible && value.type === 'details' && !value.props.open ? value.children.find(child => child?.type === 'summary') : value.children, visible); };
const button = (view, label) => nodes(view).find(node => node.type === 'button' && content(node) === label);
const byLabel = (view, label) => nodes(view).find(node => node.props['aria-label'] === label);
const blueprint = { name: '用户的真实工具名称', purpose: '已记录的目标', scope: '只处理选定材料', workflow: '先读取，再核对', inputs: '已选目录', outputs: '带来源的结果', ui: '简单列表', data: '本机保存', tools: '只读文件', runtime: '随宿主使用', acceptance: '逐条核对来源' };
const fixture = patch => ({ view: 'find', taskId: 'task-a', revisionId: 'revision-b', revisionNumber: 2, request: '用户原本提出的需求', intent: { goal: '当前目标' },
  plan: { kind: 'native', title: '从当前材料开始', rationale: '模型返回的选择理由', pluginIds: [], limits: ['先确认材料可读'], steps: [{ capability: '整理材料', owner: 'dsh', action: '保留来源再归纳', input: '原始材料', output: '来源列表' }] },
  candidates: [], discovery: { sources: [{ status: 'live' }] }, conversation: [], followupText: '', ...patch });
const createState = patch => fixture({ view: 'create', creation: { strategy: 'new', status: 'draft', supply: { status: 'current' }, blueprint, reuseAssessment: '真实模型评估', questions: [], answers: [] }, creationForm: { blueprint, answers: [], assumptions: [] }, ...patch });
function render(state = fixture(), extra = {}) {
  const calls = [];
  const names = ['setHomeRequest', 'clearHomeCommunitySelection', 'searchHome', 'setFollowup', 'submitFollowup', 'showFind', 'showHome', 'showHistory', 'showCreationGuide', 'showCreation', 'recommend', 'startCreation', 'editCreation', 'updateCreation', 'cancel', 'runCurrentPlan', 'createInWorkspace', 'answerCreation', 'cancelExecution', 'continueExecution', 'startFeatured'];
  const controller = Object.fromEntries(names.map(name => [name, (...args) => calls.push([name, ...args])]));
  const view = View({ state, controller, busy: false, modelReady: true, copyText() {}, sections: {}, ...extra });
  return { view, calls, controller };
}

test('home has one demand composer, editable examples and four distinct featured products without navigation tabs', () => {
  const { view, calls } = render(fixture({ view: 'home', homeRequest: '', plan: null, taskId: null, request: '', featuredPreferences: { interests: ['family'], dismissed: [] } }));
  assert.match(content(view, true), /发现好插件/);
  assert.match(content(view, true), /想让 DSH 帮你做成什么？/);
  assert.equal(visibleNodes(view).filter(node => node.type === 'textarea').length, 1);
  assert.equal(nodes(view).filter(node => node.props.role === 'tab' || node.props.role === 'tablist').length, 0);
  const featured = nodes(view).filter(node => node.type === 'button' && String(node.props['aria-label'] || '').startsWith('查看精选：'));
  assert.equal(featured.length, 4);
  for (const entry of featuredCatalog) assert.equal(featured.filter(node => node.props['aria-label'] === `查看精选：${entry.title}`).length, 1);
  assert.match(content(view), /你选择了「家庭助手」兴趣/);
  nodes(view).find(node => node.props['aria-label'] === '把「把邮箱里的发票收齐，汇成 Excel」填进输入框').props.onClick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'setHomeRequest');
  assert.match(calls[0][1], /发票/);
});

test('home makes the canonical community selection visible and removable without replacing the request', () => {
  const entry = getCommunityOverview().categories[0].previews[0];
  const state = fixture({ view: 'home', homeRequest: '只处理本地资料', homeCommunityEntryId: entry.id, selectedCommunityEntry: { name: '伪造的显示名称' } });
  const { view, calls } = render(state);
  assert.ok(content(byLabel(view, '已选插件')).includes(`已选插件：${entry.name}`));
  assert.doesNotMatch(content(byLabel(view, '已选插件')), /伪造|https?:|[{}]/);
  assert.equal(byLabel(view, '任务描述').props.value, '只处理本地资料');
  button(view, '取消指定').props.onClick(); assert.deepEqual(calls, [['clearHomeCommunitySelection']]);
  const busy = render({ ...state, busy: 'analyze' }, { busy: true });
  assert.equal(button(busy.view, '取消指定').props.disabled, true); button(busy.view, '取消指定').props.onClick(); assert.deepEqual(busy.calls, []);
  const missing = render({ ...state, homeCommunityEntryId: 'unknown-old-entry' });
  assert.match(content(byLabel(missing.view, '已选插件')), /当前目录未收录/);
  assert.ok(button(missing.view, '取消指定'));
  assert.equal(byLabel(render({ ...state, homeCommunityEntryId: null }).view, '已选插件'), undefined);
});

test('examples preserve existing input before replacement', () => {
  const calls = [];
  const { view } = render(fixture({ view: 'home', homeRequest: '尚未提交的重要原话' }), { controller: { prepareHomeExample: value => calls.push(value) } });
  button(view, '每周五出一份项目简报').props.onClick();
  assert.match(calls[0], /项目简报/);
  const fallback = render(fixture({ view: 'home', homeRequest: '尚未提交的重要原话' }));
  button(fallback.view, '每周五出一份项目简报').props.onClick();
  assert.deepEqual(fallback.calls, []);
});

test('home has one actionable idea beside the demand input and an independently named editorial collection', () => {
  for (const interests of [[], ['family']]) {
    const { view, calls } = render(fixture({ view: 'home', homeRequest: '', featuredPreferences: { interests, dismissed: [] } }));
    const scenario = nodes(view).find(node => node.props.className === 'pfv_home_scenario');
    assert.equal(nodes(view).filter(node => node.props.className === 'pfv_home_scenario').length, 1);
    assert.equal(scenario.props['aria-label'], interests.length ? '猜你喜欢' : '试试这个');
    const benefit = nodes(scenario).find(node => node.props.className === 'pf8_idea_benefit');
    assert.ok(content(benefit).length < 45);
    assert.doesNotMatch(content(benefit), /回执|交付|送达|明确授权/);
    if (interests.length) {
      assert.match(content(scenario), /你选择了「家庭助手」兴趣/);
      assert.match(content(view), /按你在这里留下的线索挑的/);
    } else {
      assert.doesNotMatch(content(scenario), /猜你喜欢|根据你的|你选择了/);
      assert.match(content(view), /还不认识你，先给一个通用想法/);
      assert.doesNotMatch(content(view), /大家常用/);
    }
    button(scenario, '试试').props.onClick();
    assert.deepEqual(calls, [['startFeatured', interests.length ? 'family-assistant' : 'agent-twin']]);
    assert.equal(nodes(view).filter(node => node.type === 'h2' && content(node) === '精选').length, 1);
    assert.equal(nodes(view).filter(node => node.type === 'button' && String(node.props['aria-label'] || '').startsWith('查看精选：')).length, 4);
  }
});

test('home history rows and 全部 N 件 share the saved-plan scope', () => {
  const saved = {
    taskId: 'task-saved', title: '把周报整理成一张表', request: '把周报整理成一张表',
    updatedAt: '2026-11-10T14:00:00.000Z', stage: 'plan', planKind: 'combo', lastFeedback: null,
  };
  const state = fixture({ view: 'home', plan: null, taskId: null, request: '', homeRequest: '', history: [saved], historyTotal: 1 });
  const { view, calls } = render(state);
  assert.match(content(view, true), /你交代过 1 件事/);
  assert.match(content(view, true), /给了解法：拼几个/);
  button(view, '全部 1 件').props.onClick();
  assert.deepEqual(calls, [['showHistory']]);
});

test('search-only records do not claim saved plans or a 全部 count', () => {
  const search = { id: 'search-1', request: '找过但没保存成方案', searchedAt: '2026-11-10T14:00:00.000Z', planKind: 'single' };
  const state = fixture({ view: 'home', plan: null, taskId: null, request: '', homeRequest: '', history: [], historyTotal: 0, searchHistory: [search] });
  const { view } = render(state);
  assert.doesNotMatch(content(view, true), /全部 \d+ 件/);
  assert.doesNotMatch(content(view, true), /找过但没保存成方案/);
});

test('a draft-storage failure stays reachable from the featured adjustment entry', () => {
  const state = fixture({ view: 'home', plan: null, taskId: null, request: '', homeRequest: '', featuredWarning: '本机草稿这次没读出来，历史记录仍保留。' });
  const { view } = render(state);
  assert.match(content(view, true), /调整精选（草稿没读出来）/);
  assert.doesNotMatch(content(view, true), /本机草稿这次没读出来/);
  assert.match(content(view), /本机草稿这次没读出来/);
});

test('home uses green only when a saved plan has an explicit successful result', () => {
  const saved = {
    taskId: 'task-done', title: '把发票收齐汇成表格', request: '把发票收齐汇成表格',
    updatedAt: '2026-11-10T14:00:00.000Z', stage: 'plan', planKind: 'single',
    lastFeedback: { type: 'result', outcome: 'complete' },
  };
  const { view } = render(fixture({ view: 'home', plan: null, taskId: null, request: '', homeRequest: '', history: [saved], historyTotal: 1 }));
  assert.match(content(view, true), /已经做成了/);
  assert.doesNotMatch(content(view, true), /给了解法：装一个/);
});

test('the outcome leads one column; actual conversation stays available without a second transcript wall', () => {
  const { view, calls } = render(fixture({ conversation: [
    { id: 'u1', role: 'user', text: '只读，不修改原文', revisionNumber: 1 },
    { id: 'a1', role: 'assistant', text: '根据已返回的资料，先这样核对', revisionNumber: 2 },
  ], followupText: '先不连接外部服务' }));
  assert.match(content(view, true), /用户原本提出的需求.*当前目标/);
  assert.doesNotMatch(content(view, true), /根据已返回的资料，先这样核对/);
  assert.match(content(byLabel(view, '当前需求的对话记录')), /只读，不修改原文.*根据已返回的资料/);
  assert.equal(nodes(view).filter(node => node.props.className === 'pfv_workspace_grid').length, 0);
  assert.equal(visibleNodes(view).filter(node => node.type === 'textarea').length, 1);
  byLabel(view, '补充需求').props.onChange({ target: { value: '改成只用本地文件' } });
  nodes(view).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [['setFollowup', '改成只用本地文件'], ['submitFollowup']]);
  assert.equal(byLabel(view, '补充需求').props.maxLength, 1500);
});

test('legacy records recover recorded requests and history controls without invented assistant messages', () => {
  const history = h('button', { onClick() {} }, '恢复已有历史草稿');
  const { view } = render(fixture(), { sections: { taskHistory: history } });
  const log = byLabel(view, '当前需求的对话记录');
  assert.match(content(log), /用户原本提出的需求/);
  assert.doesNotMatch(content(log), /方案助手/);
  assert.equal(nodes(log).filter(node => node.type === 'article').length, 1);
  assert.ok(nodes(view).includes(history));
  assert.doesNotMatch(content(view, true), /恢复已有历史草稿/);
});

test('native, single and combo plans use directly, with creation available directly alongside', () => {
  for (const kind of ['native', 'single', 'combo']) {
    const state = fixture(); state.plan = { ...state.plan, kind, pluginIds: kind === 'native' ? [] : ['real-plugin'] };
    state.candidates = [{ id: 'real-plugin', name: '真正的插件', version: '1.2.3' }];
    const { view, calls } = render(state);
    button(view, '使用这个方案').props.onClick();
    button(view, '创建自己的插件').props.onClick();
    assert.deepEqual(calls, [['runCurrentPlan'], ['startCreation']]);
    assert.doesNotMatch(content(view, true), /安装指引|交接|Creator|复制|准备会话草稿|核对安装与起步方式|下一步|蓝图/);
    if (kind !== 'native') assert.match(content(view, true), /真正的插件.*1\.2\.3/);
  }
});

test('usable native, single and combo plans remain actionable when unrelated search sources are incomplete', () => {
  for (const kind of ['native', 'single', 'combo']) {
    for (const discovery of [
      { sources: [{ id: 'selected-author', status: 'live' }, { id: 'unrelated-index', status: 'failed' }] },
      { status: 'partial', sources: [{ id: 'selected-author', status: 'cached' }] },
      { sources: [{ id: 'selected-author', status: 'live' }], sourceCoverage: [{ id: 'unrelated-index', status: 'partial' }] },
    ]) {
      const capabilities = kind === 'combo' ? ['渲染图形', '显示公式'] : ['渲染图形'];
      const candidates = kind === 'native' ? [] : capabilities.map((capability, index) => ({ id: `plugin-${index}`, name: `已找到的插件${index}`, capabilities: [capability] }));
      const state = fixture({ discovery, candidates, intent: { goal: '阅读本地 Markdown', capabilities }, plan: {
        kind, title: '使用已找到的能力', rationale: '所选来源资料已返回，仍需实际执行验证', pluginIds: candidates.map(candidate => candidate.id), limits: [],
        steps: capabilities.map((capability, index) => ({ capability, owner: kind === 'native' ? 'dsh' : candidates[index].id, sourceCapability: kind === 'native' ? null : capability, action: '只读打开并核对内容', input: '本地文件', output: capability })),
      } });
      const { view, calls } = render(state);
      const use = button(view, '使用这个方案');
      assert.ok(use, `${kind} keeps its use action`);assert.equal(use.props.disabled, false);
      use.props.onClick();assert.deepEqual(calls, [['runCurrentPlan']]);
      assert.equal(button(view, '重试查找'), undefined);
      assert.match(content(view, true), /部分来源尚未查完/);
    }
  }
});

test('complete gap result starts creation directly without a guide', () => {
  const { view, calls } = render(fixture({ plan: { kind: 'gap', title: '需要自己的整理工具', rationale: '当前范围内仍有缺口', pluginIds: [], steps: [], limits: [] } }));
  button(view, '创建自己的插件').props.onClick();
  assert.deepEqual(calls, [['startCreation']]);
  assert.equal(button(view, '使用这个方案'), undefined);
});

test('incomplete or unknown searches cannot turn gap claims into findings and offer search recovery', () => {
  for (const discovery of [null, {}, { status: 'failed' }, { status: 'partial' }, { sources: [{ status: 'stale' }] }, { sourceCoverage: [{ status: 'failed' }] }]) {
    const { view, calls } = render(fixture({ discovery, plan: { kind: 'gap', title: '没有任何插件', rationale: '全市场都不存在', steps: [], limits: [], pluginIds: [] } }));
    assert.doesNotMatch(content(view, true), /没有任何插件|全市场都不存在/);
    assert.match(content(view, true), /还有来源没核对/);
    button(view, '重试查找').props.onClick();
    button(view, '创建自己的插件').props.onClick();
    assert.deepEqual(calls, [['recommend'], ['startCreation']]);
  }
  assert.equal(experienceSourceHealth({ sources: [{ status: 'cached' }] }).incomplete, false);
});

test('live indexes with unchecked candidates keep gap findings tentative and allow explicit customization', () => {
  const incompleteCoverage = [
    { coverage: { matched: 25, inspected: 24, resolved: 24, excluded: 24, uninspected: 1, excludedReasons: { 'extra-key-required': 24 } } },
    { sourceCoverage: [{ sourceId: 'catalog', status: 'live', matched: 2, inspected: 1, uninspected: 1 }] },
    ...['author-read-timeout', 'author-unresolved', 'extra-key-unknown'].map(reason => ({ coverage: { matched: 1, inspected: 1, uninspected: 0, excluded: 1, excludedReasons: { [reason]: 1 } } })),
  ];
  for (const status of ['live', 'cached']) {
    for (const coverage of incompleteCoverage) {
      const discovery = { status: 'complete', sources: [{ status }], ...coverage };
      const { view, calls } = render(fixture({ discovery, plan: { kind: 'gap', title: '没有任何插件', rationale: '全市场都不存在', steps: [], limits: [], pluginIds: [] } }));
      assert.doesNotMatch(content(view, true), /没有任何插件|全市场都不存在/);
      assert.match(content(view, true), /还有来源没核对/);
      assert.equal(experienceSourceHealth(discovery)?.incomplete, true);
      const retry = button(view, '重试查找'), customize = button(view, '创建自己的插件');
      assert.match(retry.props.className, /pfv_primary/);
      assert.equal(retry.props.disabled, false); assert.equal(customize.props.disabled, false);
      retry.props.onClick(); customize.props.onClick();
      assert.deepEqual(calls, [['recommend'], ['startCreation']]);
    }
  }
});

test('completed empty searches and verified key exclusions still permit a gap with live or cached sources', () => {
  for (const status of ['live', 'cached']) {
    for (const coverage of [
      { matched: 0, inspected: 0, resolved: 0, excluded: 0, uninspected: 0, excludedReasons: {} },
      { matched: 2, inspected: 2, resolved: 2, excluded: 2, uninspected: 0, excludedReasons: { 'extra-key-required': 2, 'extra-key-unknown': 0, 'author-unresolved': 0, 'author-read-timeout': 0 } },
    ]) {
      const discovery = { sources: [{ status, total: 6000 }], coverage, sourceCoverage: [{ status, total: 6000, matched: coverage.matched, inspected: coverage.inspected, uninspected: 0 }] };
      const { view, calls } = render(fixture({ discovery, plan: { kind: 'gap', title: '当前范围内仍有缺口', rationale: '已核对的候选不满足明确条件', pluginIds: [], steps: [], limits: [] } }));
      assert.notEqual(experienceSourceHealth(discovery)?.incomplete, true);
      assert.equal(button(view, '重试查找'), undefined);
      assert.match(button(view, '创建自己的插件').props.className, /pfv_primary/);
      button(view, '创建自己的插件').props.onClick();
      assert.deepEqual(calls, [['startCreation']]);
    }
  }
});

test('uninspected alternatives do not prevent using an already matched plan', () => {
  for (const kind of ['native', 'single', 'combo']) {
    const capabilities = kind === 'combo' ? ['读取材料', '整理来源'] : ['整理来源'];
    const candidates = kind === 'native' ? [] : capabilities.map((capability, index) => ({ id: `plugin-${index}`, name: `已找到的插件${index}`, capabilities: [capability] }));
    const state = fixture({ candidates, intent: { goal: '整理本地材料', capabilities }, discovery: { sources: [{ status: 'live' }], coverage: { uninspected: 3, excludedReasons: { 'author-read-timeout': 1, 'extra-key-unknown': 1 } } } });
    state.plan = { ...state.plan, kind, pluginIds: candidates.map(candidate => candidate.id), steps: capabilities.map((capability, index) => ({ capability, owner: kind === 'native' ? 'dsh' : candidates[index].id, sourceCapability: kind === 'native' ? null : capability, action: '只读处理选定材料', input: '本地材料', output: capability })) };
    const { view, calls } = render(state);
    assert.match(content(view, true), /部分候选尚未核对完整/);
    assert.equal(button(view, '重试查找'), undefined);
    assert.equal(button(view, '使用这个方案').props.disabled, false);
    button(view, '使用这个方案').props.onClick();
    assert.deepEqual(calls, [['runCurrentPlan']]);
  }
});

test('refinement preserves the previous saved outcome with its source warning and prevents using stale results', () => {
  const previous = fixture({ discovery: { sources: [{ status: 'failed' }] } });
  const { view } = render(fixture({ plan: null, revisionNumber: 3, discovery: null, pendingOutcome: previous, followupPending: true, busy: 'recommend' }), { busy: true });
  assert.match(content(view, true), /上一版方案.*版本 2.*部分来源尚未查完.*从当前材料开始/);
  assert.equal(button(view, '使用这个方案').props.disabled, true);
  assert.doesNotMatch(content(view, true), /方案正在形成/);
});

test('pending search keeps request and one truthful cancellation control', () => {
  const { view, calls } = render(fixture({ plan: null, request: '需要一直看得到的需求', busy: 'recommend' }), { busy: true });
  assert.match(content(view, true), /需要一直看得到的需求.*正在查找来源并整理方案.*方案正在形成/);
  button(view, '停止').props.onClick();
  assert.deepEqual(calls, [['cancel']]);
  assert.equal(visibleNodes(view).filter(node => node.type === 'button' && content(node) === '停止').length, 1);
});

test('a new search never mixes the new request with the previous intent, creation or version', () => {
  for (const view of ['home', 'find', 'create']) {
    const state = createState({ view, searching: true, busy: 'reset', homeRequest: '这次的新需求', request: '旧需求不应显示', intent: { goal: '旧 Mermaid 理解' }, revisionNumber: 77 });
    const { view: tree } = render(state, { busy: true });
    assert.match(content(tree, true), /这次的新需求.*正在保留原任务并开始新需求.*方案正在形成/);
    assert.doesNotMatch(content(tree), /旧需求不应显示|旧 Mermaid 理解|用户的真实工具名称|版本 77|从当前材料开始/);
    assert.equal(byLabel(tree, '补充需求'), undefined);
    assert.equal(button(tree, '开始创建'), undefined);
  }
});

test('source details remain collapsed and old handoff or Creator controls are not rendered', () => {
  const sections = { selectedInstallGuide: h('p', null, '精确安装指引内容'), searchEvidence: h('p', null, '真实搜索依据'), ordinaryHandoff: h('p', null, '复制到项目'), creatorHandoff: h('p', null, 'Creator 工作区交接'), feedback: h('p', null, '已有反馈表内容') };
  for (const state of [fixture(), createState()]) {
    const { view } = render(state, { sections });
    assert.doesNotMatch(content(view, true), /精确安装指引内容|真实搜索依据|已有反馈表内容/);
    assert.match(content(view), /精确安装指引内容|真实搜索依据/);
    assert.doesNotMatch(content(view), /复制到项目|Creator 工作区交接/);
  }
});

test('creation shows a human summary and starts directly; field editing stays optional', () => {
  const { view, calls } = render(createState());
  assert.match(content(view, true), /用户的真实工具名称|只处理选定材料|先读取，再核对|逐条核对来源/);
  assert.equal(visibleNodes(view).filter(node => node.type === 'textarea').length, 1);
  assert.doesNotMatch(content(view, true), /蓝图|Creator|确认.*供给|预览|复制/);
  button(view, '开始创建').props.onClick();
  byLabel(view, '输入材料').props.onChange({ target: { value: '新材料范围' } });
  assert.deepEqual(calls, [['createInWorkspace'], ['editCreation', { blueprint: { inputs: '新材料范围' } }]]);
  assert.equal(nodes(view).filter(node => node.props.className === 'pfv_blueprint_block').length, 4);
});

test('dirty, draft and stale creation states need no separate confirm or preview action', () => {
  const initial = createState();
  for (const patch of [{ creationDirty: true }, { creation: { ...initial.creation, status: 'ready' } }, { creation: { ...initial.creation, supply: { status: 'stale' } } }, { discovery: { status: 'failed' } }]) {
    const { view, calls } = render({ ...initial, ...patch });
    button(view, '开始创建').props.onClick();
    assert.deepEqual(calls, [['createInWorkspace']]);
    assert.doesNotMatch(content(view, true), /确认蓝图|交给 Creator|预览/);
  }
});

test('one required choice saves and revises on the same click without a second submit', () => {
  const questions = [{ id: 'q1', question: '选择哪种输入？', reason: '输入决定读取范围', options: ['只读文件', '外部服务'] }, { id: 'q2', question: '第二个问题暂不展示', reason: '原因', options: ['选项'] }];
  const state = createState(); state.creation.questions = questions;
  const { view, calls } = render(state);
  assert.match(content(view, true), /选择哪种输入/);
  assert.doesNotMatch(content(view, true), /第二个问题暂不展示|按这个选择更新/);
  button(view, '只读文件').props.onClick();
  assert.deepEqual(calls, [['answerCreation', 'q1', '只读文件']]);
  assert.equal(button(view, '开始创建').props.disabled, true);
});

test('assumption editor preserves typed newlines and legacy saved guide routes remain recoverable', () => {
  let state = createState({ view: 'creation-guide', creationForm: { blueprint, answers: [], assumptions: ['本机保存'] } });
  const controller = { editCreation: patch => { state = { ...state, creationForm: { ...state.creationForm, ...patch } }; } };
  const editor = () => nodes(render(state, { controller }).view).find(node => node.props.id === 'pfv_assumptions');
  editor().props.onChange({ target: { value: '本机保存\n' } });
  assert.equal(editor().props.value, '本机保存\n');
  editor().props.onChange({ target: { value: editor().props.value + '原文只读' } });
  assert.equal(editor().props.value, '本机保存\n原文只读');
  assert.deepEqual(state.creationForm.assumptions, ['本机保存', '原文只读']);
  assert.match(content(render(state).view, true), /开始创建/);
});

test('real execution states replace repeated start actions and expose exactly one cancel', () => {
  for (const phase of ['preparing', 'running', 'waiting']) for (const kind of ['use', 'create']) {
    const state = kind === 'create' ? createState() : fixture();
    const { view, calls } = render({ ...state, busy: 'creator', execution: { phase, rawPhase: phase === 'waiting' ? 'waiting-user' : phase, kind, summary: '宿主返回的当前状态', details: '实际执行细节' } }, { busy: true });
    assert.match(content(byLabel(view, '当前执行状态')), /宿主返回的当前状态.*实际执行细节/);
    assert.equal(button(view, '使用这个方案'), undefined);
    assert.equal(button(view, '开始创建'), undefined);
    assert.equal(visibleNodes(view).filter(node => node.type === 'button' && content(node) === '停止').length, 1);
    button(view, '停止').props.onClick();
    assert.deepEqual(calls, [['cancelExecution']]);
    assert.equal(byLabel(view, '补充需求'), undefined);
    assert.doesNotMatch(content(view, true), /已安装|创建成功|\d+%|Creator/);
  }
});

test('an unsent prepared execution offers one continuation instead of repeated creation actions', () => {
  const {view,calls}=render(fixture({execution:{phase:'waiting',rawPhase:'ready',canContinue:true,kind:'use',summary:'尚未发送'}}));
  assert.equal(button(view,'使用这个方案'),undefined);assert.equal(button(view,'停止'),undefined);
  button(view,'继续执行').props.onClick();assert.deepEqual(calls,[['continueExecution']]);
});

test('completion only shows actual execution evidence; failure retains recovery and its reason', () => {
  const completed = render(fixture({ execution: { phase: 'completed', kind: 'use', summary: '本轮处理了 2 个文件' } })).view;
  assert.match(content(completed, true), /本次运行已结束.*本轮处理了 2 个文件/);
  assert.doesNotMatch(content(completed, true), /已安装|插件已完成|创建成功/);
  assert.equal(button(completed, '使用这个方案'), undefined);
  assert.equal(button(completed, '停止'), undefined);
  for (const phase of ['failed', 'cancelled']) {
    const { view, calls } = render(fixture({ execution: { phase, kind: 'use', summary: '保留了原方案', details: '工具没有返回结果' } }));
    assert.match(content(view, true), /保留了原方案.*工具没有返回结果/);
    button(view, '使用这个方案').props.onClick();
    assert.deepEqual(calls, [['runCurrentPlan']]);
  }
});

test('live session approval and result controls remain visible in the current execution', () => {
  const approval = h('section', { 'aria-label': '真实执行对话' }, h('button', { onClick() {} }, '批准读取选定材料'), h('p', null, '实际会话结果'));
  const { view } = render(fixture({ execution: { phase: 'waiting', kind: 'use', summary: '等待你的选择' } }), { sections: { executionConversation: approval } });
  assert.ok(visibleNodes(view).includes(approval));
  assert.match(content(view, true), /批准读取选定材料.*实际会话结果/);
});

test('workspace chooser is supplied only when needed, with no built-in chooser or preview gate', () => {
  const normal = render().view;
  assert.equal(nodes(normal).filter(node => node.props.className === 'pfv_workspace_picker').length, 0);
  const picker = h('select', { 'aria-label': '选择工作区' }, h('option', null, '当前项目'));
  const { view, calls } = render(fixture({ executionWorkspaceLabel: '正在使用：当前项目' }), { sections: { workspacePicker: picker } });
  assert.ok(nodes(view).includes(picker));
  assert.match(content(view, true), /正在使用：当前项目/);
  button(view, '使用这个方案').props.onClick();
  assert.deepEqual(calls, [['runCurrentPlan']]);
});

test('execution waits for workspace loading even when a restored workspace id is already displayed', () => {
  for (const [state, label] of [[fixture(), '使用这个方案'], [createState(), '开始创建']]) {
    const { view, calls } = render({ ...state, workspacePhase: 'pending', workspaceId: 'restored-workspace' });
    const action = button(view, label);
    assert.equal(action.props.disabled, true);
    action.props.onClick();assert.deepEqual(calls, []);
    assert.match(content(view, true), /正在读取工作区/);
  }
});

test('ready workspaces keep use and create actions working and an unselected workspace picker usable', () => {
  for (const [state, label, method] of [[fixture(), '使用这个方案', 'runCurrentPlan'], [createState(), '开始创建', 'createInWorkspace']]) {
    const { view, calls } = render({ ...state, workspacePhase: 'ready', workspaceId: 'selected-workspace' });
    const action = button(view, label);assert.equal(action.props.disabled, false);action.props.onClick();
    assert.deepEqual(calls, [[method]]);assert.doesNotMatch(content(view, true), /正在读取工作区/);
  }
  const picker = h('select', { 'aria-label': '选择实际工作区', disabled: false }, h('option', { value: '' }, '请选择'), h('option', { value: 'one' }, '工作区一'), h('option', { value: 'two' }, '工作区二'));
  const { view } = render(fixture({ workspacePhase: 'ready', workspaceId: '' }), { sections: { workspacePicker: picker } });
  assert.equal(byLabel(view, '选择实际工作区').props.disabled, false);
  assert.equal(button(view, '使用这个方案').props.disabled, false);
});

test('keyboard submit respects composition and model output stays text', () => {
  const { view } = render(fixture({ followupText: '<img src=x onerror=alert(1)>', conversation: [{ id: 'safe', role: 'assistant', text: '<script>throw 1</script>' }] }));
  let submissions = 0;
  const handler = byLabel(view, '补充需求').props.onKeyDown;
  const event = { ctrlKey: true, key: 'Enter', preventDefault() {}, currentTarget: { form: { requestSubmit() { submissions += 1; } } } };
  handler({ ...event, isComposing: true });
  assert.equal(submissions, 0);
  handler(event);
  assert.equal(submissions, 1);
  assert.ok(nodes(view).every(node => !node.props.dangerouslySetInnerHTML));
  assert.equal(nodes(view).filter(node => node.type === 'script' || node.type === 'img').length, 0);
});


test('one expert identity owns both direct demand and proactive advice without an extra conversation wall',()=>{
  const state=fixture({view:'home',homeRequest:'保留我还没提交的目标',opportunity:{consent:{enabled:true},status:'ready',opportunities:[{id:'idea-a',title:'把零散材料变成清楚的简报',expectedResult:'一份可核对的简报',suggestedRequest:'只整理选定材料',observation:'你选定的材料有可复用步骤',evidenceRefs:[{id:'source-a',label:'brief.md',excerpt:'授权材料'}]}]}});
  const {view}=render(state);
  const group=nodes(view).find(n=>n.props.role==='group'&&n.props['aria-labelledby']==='pfv_expert_title');
  assert.ok(group);
  assert.match(content(view),/发现好插件/);
  assert.equal(nodes(view).filter(n=>n.props.className==='pf8_top').length,1);
  assert.equal(nodes(group).filter(n=>n.type==='h1').length,1);
  assert.match(content(group),/还没做完/);
  assert.match(content(group),/猜你需要/);
  assert.equal(byLabel(view,'任务描述').props.value,'保留我还没提交的目标');
  assert.equal(nodes(group).filter(n=>n.props.className==='pfv_opportunity_controls').length,1);
  const aside=nodes(group).find(n=>n.type==='aside'&&n.props['aria-label']==='猜你喜欢');
  assert.equal(aside.children.length,3,'feedback controls remain outside the three shared grid rows');
  assert.equal(nodes(view).filter(n=>n.props.role==='tab').length,0);
});

test('persisted disabled opportunity state keeps a concrete startable recommendation instead of a material-selection placeholder',()=>{
 for(const interests of [[],['family']]){
  const state=fixture({view:'home',homeRequest:'保留当前输入',featuredPreferences:{interests,dismissed:[]},opportunity:{consent:{enabled:false},status:'idle',opportunities:[],historyChoices:[]}});
  const {view,calls}=render(state);const aside=nodes(view).find(n=>n.type==='aside'&&n.props['aria-labelledby']==='pfv_opportunity_title');assert.ok(aside);
  assert.match(content(aside),interests.length?/准备家人的日常小助手/:/把项目资料整理成知识库/);
  assert.match(content(aside),interests.length?/本机线索/:/通用想法/);
  assert.doesNotMatch(content(aside),/你选好资料|也许有更顺手的做法|选择参考资料/);
  assert.equal(aside.children.length,3);button(aside,'试试这个想法').props.onClick();
  assert.deepEqual(calls,[['startFeatured',interests.length?'family-assistant':'agent-twin']]);
  assert.equal(byLabel(view,'任务描述').props.value,'保留当前输入');
 }
});

test('hybrid keeps selected existing abilities and explicit gaps together before starting creation once', () => {
  const state = fixture({ plan: { kind: 'hybrid', title: '项目简报与阻塞提醒', rationale: '现成能力覆盖展示，缺少持久提醒', pluginIds: ['board', 'docs'], gaps: [{ capability: '阻塞提醒', reason: '需要保留提醒状态' }], steps: [{ capability: '任务看板', owner: 'board', action: '展示待办' }, { capability: '简报文档', owner: 'docs', action: '渲染文档' }, { capability: '阻塞提醒', owner: 'create', action: '只补提醒能力' }], limits: [] }, candidates: [{ id: 'board', name: '现成看板', version: '1.0.0' }, { id: 'docs', name: '现成文档', version: '2.0.0' }] });
  const { view, calls } = render(state);
  assert.match(content(byLabel(view, '方案中的能力')), /计划复用.*现成看板.*1\.0\.0.*现成文档.*2\.0\.0.*待补齐.*阻塞提醒.*需要保留提醒状态/);
  const action = button(view, '补齐并使用'); assert.ok(action); action.props.onClick();
  assert.deepEqual(calls, [['startCreation']]);
  assert.equal(button(view, '使用这个方案'), undefined);
  assert.doesNotMatch(content(view, true), /已复用|已创建|创建成功|已解决/);
});

test('execution output leads the task surface while planned capability evidence stays secondary and truthful', () => {
  const live = h('section', { 'aria-label': '真实执行对话' }, h('p', null, '实际生成的项目简报'));
  const { view } = render(fixture({ execution: { phase: 'completed', kind: 'use', summary: '本轮处理了 2 个文件' } }), { sections: { executionConversation: live } });
  const all = nodes(view), result = all.find(n => n.props.className === 'pfv_result_primary'), overview = byLabel(view, '本次能力方案');
  assert.ok(result); assert.ok(overview); assert.ok(nodes(result).includes(live));
  assert.ok(all.indexOf(live) < all.indexOf(overview));
  assert.equal(all.filter(n => n === live).length, 1);
  assert.match(content(result), /本次运行已结束.*本轮处理了 2 个文件.*实际生成的项目简报/);
  assert.doesNotMatch(content(result), /需求已解决|创建成功|已验证/);
});

test('home has one strong task promise and the three examples instead of the removed product intro', () => {
  const { view } = render(fixture({ view: 'home', productIntroVisible: true, homeRequest: '', plan: null, taskId: null, request: '', searchHistory: [] }));
  const headings = nodes(view).filter(n => n.type === 'h1');
  assert.equal(headings.length, 1); assert.equal(content(headings[0]), '想让 DSH 帮你做成什么？');
  assert.equal(nodes(view).filter(n => n.props.className === 'pfv_product_intro').length, 0);
  assert.match(content(view), /不知道说什么？点一句试试/);
  assert.equal(nodes(view).filter(n => n.props.className === 'pf8_says').length, 1);
  assert.equal(nodes(view).filter(n => n.props.className === 'pf8_pill').length, 3);
  assert.ok(byLabel(view, '帮我找方案')); assert.equal(visibleNodes(view).filter(n => n.type === 'textarea').length, 1);
});

// 示例区不承诺结果：三句例句只是可点的句子，下面三栏是 Finder 会给的三种办法，
// 两边不再配对，也不出现任何插件名（2026-11-12 三次真跑结果各不相同）。
test('home examples promise no result and the three ways stay descriptive', () => {
  const { view, calls } = render(fixture({ view: 'home', homeRequest: '', plan: null, taskId: null, request: '' }));
  const pills = nodes(view).filter(n => n.props.className === 'pf8_pill' && n.type === 'button');
  assert.deepEqual(pills.map(node => content(node)), ['把邮箱里的发票收齐，汇成 Excel', '每周五出一份项目简报', '给家里人做个记账工具']);
  const ways = nodes(view).filter(n => n.props.className === 'pf8_way');
  assert.equal(ways.length, 3);
  assert.deepEqual(ways.map(way => content(nodes(way).find(node => node.props.className === 'pf8_wayres'))), ['有现成的，替你装好', '一块不够，替你拼起来', '都没有，陪你做出来']);
  assert.match(content(ways[0]), /一个现成的插件/);
  assert.match(content(ways[1]), /几个现成的插件.*缺的那块，一起做/);
  assert.match(content(ways[2]), /一个新插件，一起做/);
  // 三栏纯说明：不是按钮、够不到点击回调。
  assert.equal(nodes(view).filter(node => node.props.className === 'pf8_way').flatMap(way => nodes(way)).filter(node => node.type === 'button').length, 0);
  // 例句不和结果配对：示例区里搜不到具体插件名，也没有旧配对里那几个编造的标签。
  const examples = nodes(view).find(node => node.props.className === 'pf8_examples');
  assert.ok(examples);
  assert.doesNotMatch(content(examples), /dsh-invoice-downloader|dsh-taskboard|dsh-md-studio|每周五自动汇总|家里人各记各的账/);
  pills[0].props.onClick();
  assert.deepEqual(calls, [['setHomeRequest', '把邮箱里的发票收齐，汇成 Excel']]);
});

test('hybrid delegates one click to the complete controller path without a duplicate draft action', () => {
  const calls = [], state = fixture({ plan: { kind: 'hybrid', title: '复用并补齐', pluginIds: ['one'], gaps: [{ capability: '缺口', reason: '需要持久状态' }], steps: [], limits: [] }, candidates: [{ id: 'one', name: '现成能力' }] });
  const { view } = render(state, { controller: { completeHybridPlan: () => calls.push('complete'), startCreation: () => calls.push('draft') } });
  button(view, '补齐并使用').props.onClick();
  assert.deepEqual(calls, ['complete']);
});

test('hybrid completion waits for workspace readiness before calling the execution controller', () => {
  const calls = [], state = fixture({ workspacePhase: 'pending', plan: { kind: 'hybrid', title: '组合与补齐', pluginIds: ['one'], gaps: [{ capability: '缺口', reason: '需持久状态' }], steps: [], limits: [] }, candidates: [{ id: 'one', name: '可复用插件' }] });
  const { view } = render(state, { controller: { completeHybridPlan: () => calls.push('complete') } });
  const action = button(view, '补齐并使用'); assert.equal(action.props.disabled, true); action.props.onClick();
  assert.deepEqual(calls, []); assert.match(content(view), /正在读取工作区/);
});

test('a source listed in both sources and sourceCoverage becomes one row', () => {
  const { view } = render(fixture({
    view: 'find',
    plan: { kind: 'gap', title: '没有任何插件，先陪你做一块', rationale: '', pluginIds: [], limits: [], steps: [], gaps: [] },
    candidates: [],
    discovery: {
      status: 'partial',
      searchedAt: '2026-11-11T02:00:00.000Z',
      sources: [
        { id: 'awesome', title: 'Awesome DSH 社区目录', status: 'live', total: 6563, used: 2 },
        { id: 'npm', title: 'npm 上的版本信息', status: 'failed' },
      ],
      sourceCoverage: [{ sourceId: 'awesome', title: 'Awesome DSH 社区目录', inspected: 4 }],
    },
  }));
  const text = content(view);
  assert.equal((text.match(/Awesome DSH 社区目录/g) || []).length, 1);
  assert.match(text, /npm 上的版本信息/);
  assert.match(text, /这次没查到|这次没查完/);
});

test('retry is disabled while another search is running, so two searches cannot start at once', () => {
  const state = fixture({
    view: 'find',
    plan: { kind: 'gap', title: '没有任何插件，先陪你做一块', rationale: '', pluginIds: [], limits: [], steps: [], gaps: [] },
    candidates: [], discovery: { status: 'failed', sources: [] },
  });
  const idle = render(state);
  assert.equal(button(idle.view, '重试查找').props.disabled, false);
  const running = render(state, { busy: true });
  assert.equal(button(running.view, '重试查找').props.disabled, true);
});

test('a native plan never claims it will install anything', () => {
  const { view } = render(fixture());
  assert.match(content(view, true), /不安装插件/);
  assert.doesNotMatch(content(view, true), /装好之后在对话里跑一遍/);
});

test('the tentative plan is labelled tentative instead of being shown as a conclusion', () => {
  const { view } = render(fixture({
    view: 'find',
    plan: { kind: 'gap', title: '还没有合适的方案，要一起做一个吗', rationale: '', pluginIds: [], limits: [], steps: [], gaps: [] },
    candidates: [], discovery: { status: 'failed', sources: [] },
  }));
  assert.doesNotMatch(content(view, true), /还没有合适的方案，要一起做一个吗/);
  assert.match(content(view), /来源没读全，还不能当结论/);
});

test('the store is a standalone page and hides every home block behind it', () => {
  const { view } = render(fixture({
    view: 'home', communityOpen: true, homeRequest: '',
    communityIntent: { categoryId: '', query: '', nonce: 1 },
  }));
  assert.match(content(view, true), /插件商店/);
  assert.match(content(view, true), /返回/);
  assert.doesNotMatch(content(view, true), /想让 DSH 帮你做成什么|猜你需要|你交代过的事|作者亲手做、亲手验过/);
  assert.equal(nodes(view).filter(node => node.props.className === 'pf8_wrap pf8_shopw').length, 1);
});

test('featured hides pinned entries that declare no support for the current host', () => {
  const current = render(fixture({ view: 'home', homeRequest: '', plan: null, taskId: null, request: '', bootstrap: { hostVersion: '0.2.2-rc.2' } }));
  assert.equal(nodes(current.view).filter(node => String(node.props['aria-label'] || '').startsWith('查看精选：')).length, 0);
  assert.equal(nodes(current.view).filter(node => node.props.className === 'pf8_feat').length, 0);
  const declared = render(fixture({ view: 'home', homeRequest: '', plan: null, taskId: null, request: '', bootstrap: { hostVersion: '0.2.1-rc.3' } }));
  assert.equal(nodes(declared.view).filter(node => String(node.props['aria-label'] || '').startsWith('查看精选：')).length, 4);
  // No host version means unknown, not incompatible: keep the entries for the detail gate.
  const unknown = render(fixture({ view: 'home', homeRequest: '', plan: null, taskId: null, request: '' }));
  assert.equal(nodes(unknown.view).filter(node => String(node.props['aria-label'] || '').startsWith('查看精选：')).length, 4);
});

test('RC2 with no compatible featured keeps a live opportunity card instead of throwing', () => {
  const state = fixture({
    view: 'home', homeRequest: '', plan: null, taskId: null, request: '',
    bootstrap: { hostVersion: '0.2.2-rc.2' },
    opportunity: {
      consent: { enabled: true }, status: 'ready',
      opportunities: [{
        id: 'idea-a', title: '把零散材料变成清楚的简报', expectedResult: '一份可核对的简报',
        suggestedRequest: '只整理选定材料', observation: '你选定的材料有可复用步骤',
        evidenceRefs: [{ id: 'source-a', label: 'brief.md', excerpt: '授权材料' }],
      }],
    },
  });
  const { view } = render(state);
  const aside = nodes(view).find(node => node.type === 'aside' && node.props['aria-labelledby'] === 'pfv_opportunity_title');
  assert.ok(aside, 'the live opportunity card still renders');
  assert.match(content(aside), /把零散材料变成清楚的简报/);
  assert.equal(nodes(view).filter(node => String(node.props['aria-label'] || '').startsWith('查看精选：')).length, 0);
});

test('source health names a GitHub limit instead of a generic unfinished line', () => {
  const limited = experienceSourceHealth({ sources: [{ id: 'awesome', status: 'live' }], coverage: { excludedReasons: { 'author-rate-limited': 2 } } });
  assert.equal(limited.incomplete, true);
  assert.match(limited.message, /GitHub 这次限制了 2 个候选/);
  const missing = experienceSourceHealth({ coverage: { excludedReasons: { 'author-missing': 1 } } });
  assert.match(missing.message, /HTTP 404/);
  const incompatible = experienceSourceHealth({ coverage: { excludedReasons: { 'author-incompatible': 3 } } });
  assert.match(incompatible.message, /不兼容/);
  assert.doesNotMatch(incompatible.message, /没核对/);
  assert.equal(experienceSourceHealth({ coverage: { excludedReasons: {} } }), null);
});

test('a confirmed GitHub limit survives another failed source and names zero returned candidates', () => {
  const mixed = experienceSourceHealth({ status: 'partial', sources: [{ status: 'failed' }], coverage: { returned: 1, excludedReasons: { 'author-rate-limited': 1 } } });
  assert.match(mixed.message, /GitHub 这次限制了 1 个候选/);
  assert.match(mixed.message, /另外，还有目录来源这次没读到/);
  assert.match(mixed.message, /已返回的候选仍可用/);

  const zero = experienceSourceHealth({ sources: [{ status: 'live' }], coverage: { returned: 0, excludedReasons: { 'author-rate-limited': 1 } } });
  assert.match(zero.message, /这轮没有已返回的候选/);
  assert.doesNotMatch(zero.message, /已返回的候选仍可用/);

  const forbidden = experienceSourceHealth({ coverage: { returned: 1, excludedReasons: { 'author-forbidden': 1 } } });
  assert.match(forbidden.message, /HTTP 403/);
  assert.doesNotMatch(forbidden.message, /请求过快/);
});

test('generic source limits and 401 keep their own wording', () => {
  const limited = experienceSourceHealth({ coverage: { returned: 1, excludedReasons: { 'author-source-limited': 1 } } });
  assert.match(limited.message, /HTTP 429/);
  assert.doesNotMatch(limited.message, /GitHub/);
  const unauthorized = experienceSourceHealth({ coverage: { returned: 0, excludedReasons: { 'author-unauthorized': 1 } } });
  assert.match(unauthorized.message, /HTTP 401/);
  assert.doesNotMatch(unauthorized.message, /HTTP 403/);
  assert.match(unauthorized.message, /这轮没有已返回的候选/);
});
