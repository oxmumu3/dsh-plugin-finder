import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { getCommunityOverview } from '../src/community-catalog.js';

const clientUrl = new URL('../src/client.js', import.meta.url);
const styleUrl = new URL('../src/client-style.js', import.meta.url);
const fixtureIntent = () => ({ goal: '检查投放 CSV 并生成周报', input: '本地 CSV', output: '周报', constraints: ['不接第三方账号'], capabilities: ['质量检查', '报告'], queries: ['csv', 'report'] });
const fixturePlan = () => ({ kind: 'single', title: '检查数据后生成报告', rationale: '一个插件覆盖基础分析', pluginIds: ['data'], steps: [{ capability: '报告', sourceCapability: 'report', owner: 'data', action: '读取 CSV 后生成报告', input: 'CSV', output: '报告' }], limits: ['任务效果尚未核验'], nextPrompt: '请先检查当前工作区中的 CSV。' });
const candidate = { id: 'data', name: 'dsh-data-insight', title: '数据洞察', summary: '本地表格分析', capabilities: ['csv', 'report'], requirements: ['读取本地文件'], install: { spec: 'https://example.com/data.git#abcd', commit: 'abcd', version: '0.1.0' }, evidence: { metadata: 'verified', installation: 'not-tested', task: 'not-tested', sources: ['https://example.com/data'] }, repository: 'https://example.com/data' };
const copy = value => JSON.parse(JSON.stringify(value));

let compiledClient;
async function loadClient(overrides = {}) {
  const tags = [];
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), useState() {}, useEffect() {}, useRef() {} };
  const globals = {
    window: {}, React,
    document: { createElement: () => { const tag = { dataset: {}, textContent: '', remove() { tags.splice(tags.indexOf(tag), 1); } }; return tag; }, head: { appendChild: tag => tags.push(tag) } },
    AbortController, AbortSignal, URL, setTimeout, clearTimeout, console,
    fetch: async () => { throw new Error('unexpected network'); },
    ...overrides,
  };
  const scope = vm.createContext(globals);
  compiledClient ??= build({ entryPoints: [fileURLToPath(clientUrl)], bundle: true, format: 'iife', globalName: 'clientModule', platform: 'browser', external: ['react', '@deepseek-ai/dsh-client-ui-primitives'], write: false });
  globals.require = name => {
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText: props => globals.React.createElement('div', { 'data-official-markdown': true }, props.text), MarkdownDelegateProvider: props => props.children };
    assert.equal(name, 'react'); return globals.React;
  };
  vm.runInContext((await compiledClient).outputFiles[0].text, scope, { filename: 'client.js' });
  return { module: globals.clientModule, globals, tags, React };
}

function host(options = {}) {
  const created = [];
  const registrations = [], effects = [], starts = [], panels = [], connected = [], retained = [], drafts = [], opened = [], released = [];
  let snapshot = { phase: 'ready', items: [{ workspaceId: 'workspace-a', title: '合成测试项目', path: '/tmp/finder-test', sessionIds: [] }] };
  const listeners = new Set();
  const binding = { sessionId: 'session-a', session: { projections: { faceOf: () => ({ getSnapshot: () => 'cordis' }) } }, ctx: { get: name => name === 'conversation' ? { input: { requestDraftInitialization: (target, draft) => { drafts.push({ target, draft }); return options.draftStatus ?? 'applied'; } } } : undefined } };
  const ctx = {
    workspaces: { list: { getSnapshot: () => snapshot, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } } },
    uiWorkspace: {
      startSession: (...args) => starts.push(args),
      connectWorkspace: async id => { connected.push(id); return options.connect ? options.connect(id) : 'session-a'; },
      openSession: id => opened.push(id),
    },
    sessions: {
      ...(options.creator ? { create: async args => { created.push(args); const id = options.create ? await options.create(args) : 'session-a'; snapshot = { ...snapshot, items: snapshot.items.map(item => ({ ...item, sessionIds: [...item.sessionIds, id] })) }; return id; } } : {}),
      retain: (id, retainOptions) => { retained.push({ id, options: retainOptions }); return { binding, ready: options.ready ?? Promise.resolve(binding), release: () => released.push(id) }; },
      binding: () => options.expired ? undefined : binding,
    },
    layout: { selectPanel: id => panels.push(id) },
    effect: fn => effects.push(fn()),
    slots: { inject: (_name, fn) => fn(), register: (spec, component) => { registrations.push({ spec, component }); return () => {}; }, entriesOfSlot: () => [], subscribe: () => () => {} },
  };
  return { ctx, created, starts, panels, connected, retained, drafts, opened, released, binding, registrations, effects, setSnapshot: value => { snapshot = value; for (const fn of listeners) fn(); }, dispose: () => { for (const stop of effects.reverse()) if (typeof stop === 'function') stop(); } };
}

function server(routes = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const path = String(url).split('/').at(-1);
    if (routes[path]) return routes[path](options);
    const values = {
      bootstrap: { version: '0.1.0', hostVersion: '0.2.1', catalog: { count: 15, updatedAt: '2026-10-20' }, discovery: { mode: 'live', sources: [{ id: 'github', title: 'GitHub DSH 插件', url: 'https://github.com/topics/dsh-plugin', status: 'ready' }] }, model: { configured: true, label: '宿主默认模型' } },
      analyze: { intent: fixtureIntent(), model: { label: '宿主默认模型' } },
      recommend: { intent: fixtureIntent(), plan: fixturePlan(), candidates: [candidate], catalogUpdatedAt: '2026-10-20', discovery: { sources: [{ id: 'github', title: 'GitHub DSH 插件', url: 'https://github.com/topics/dsh-plugin', status: 'live', fetchedAt: '2026-10-20T12:00:00Z', total: 1 }], searchedAt: '2026-10-20T12:00:00Z' }, warnings: [], model: { label: '宿主默认模型' } },
      feedback: { saved: true },
      'select-plan': { saved: true },
      reset: { cleared: true },
    };
    return { ok: true, json: async () => copy(values[path]) };
  };
  return { fetch, calls };
}

async function renderWorkbench(snapshot, options = {}) {
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: initial => [typeof initial === 'function' ? snapshot : initial, () => {}],
    useEffect(effect) { if (options.runEffects) effect(); }, useRef: value => ({ current: value }),
  };
  const loaded = await loadClient({ React, ...options }); const h = host();
  loaded.module.apply(h.ctx);
  const rawTree = h.registrations.find(item => item.spec.name === 'main').component();
  const resolve = node => Array.isArray(node) ? node.map(resolve) : !node || typeof node !== 'object' ? node : typeof node.type === 'function' ? resolve(node.type({ ...node.props, children: node.children })) : { ...node, props: options.openEvidence && node.type === 'details' && node.children.some(child => child?.type === 'summary' && child.children.includes('来源与备选方案')) ? { ...node.props, open: true } : node.props, children: resolve(node.children) };
  const tree = resolve(rawTree);
  const nodes = [];
  const walk = node => {
    if (Array.isArray(node)) { for (const child of node) walk(child); return; }
    if (node && typeof node === 'object') { nodes.push(node); walk(node.children); }
  };
  walk(tree);
  const content = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(content).join(' ') : node && typeof node === 'object' ? content(node.children) : '';
  const visibleNodes = [];
  const visibleContent = node => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(visibleContent).join(' ');
    if (!node || typeof node !== 'object' || node.props?.style?.display === 'none') return '';
    visibleNodes.push(node);
    return visibleContent(node.type === 'details' && !node.props.open ? node.children.find(child => child?.type === 'summary') : node.children);
  };
  const visibleText = visibleContent(tree);
  if (!options.keepAlive) h.dispose(); return { text: content(tree), nodes, visibleText, visibleNodes, host: h, dispose: h.dispose };
}

test('native client registers one sidebar entry and the matching main panel and disposes only its CSS', async () => {
  const loaded = await loadClient(); const h = host(); loaded.module.apply(h.ctx);
  const sidebar = h.registrations.filter(item => item.spec.name === 'sidebar.panellist');
  const main = h.registrations.filter(item => item.spec.name === 'main');
  assert.equal(sidebar.length, 1); assert.equal(main.length, 1);
  assert.equal(sidebar[0].spec.id, main[0].spec.key);
  assert.equal(sidebar[0].spec.label, '发现好插件');
  assert.equal(loaded.tags.length, 1);
  assert.match(loaded.tags[0].textContent, /\.pf_/);
  h.dispose(); assert.equal(loaded.tags.length, 0);
});

test('embedded execution declares the official file body seat with a session-scoped Tab API', async () => {
  const loaded = await loadClient(); const h = host(); loaded.module.apply(h.ctx);
  const execution = h.registrations.find(item => item.spec.name === 'plugin-finder.execution');
  const preview = execution.spec.children['plugin-finder.execution.file'];
  assert.equal(preview.kind, 'keyed'); assert.equal(preview.scope, 'session');
  assert.equal(typeof preview.inject.hooks.tabInfo, 'function');
  assert.ok(h.registrations.every(item => !item.spec.children?.['sidebar.right.pane.tab']), 'the official file slot has one existing declarer and must never be redeclared');
  assert.ok(loaded.module.inject.includes('sidebarRightTabs'));
  assert.ok(!loaded.module.inject.includes('sidebarRight'), 'global main-view sidebar must not route embedded execution files');
  h.dispose();
});

test('bootstrap does not call models; analysis is editable before recommendation', async () => {
  const { module } = await loadClient(); const h = host(); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  assert.equal(api.calls.length, 0);
  await controller.bootstrap();
  assert.deepEqual(api.calls.map(call => call.url), ['/api/plugin_finder/bootstrap']);
  await controller.analyze('检查 CSV');
  assert.equal(controller.getSnapshot().stage, 'understand');
  controller.editIntent({ goal: '只生成质量检查结论' });
  await controller.recommend();
  const request = JSON.parse(api.calls.at(-1).options.body);
  assert.equal(request.intent.goal, '只生成质量检查结论');
  assert.equal(controller.getSnapshot().stage, 'plan');
  for (const { url, options } of api.calls) {
    assert.match(url, /^\/api\/plugin_finder\//); assert.equal(options.credentials, 'same-origin'); assert.equal(options.redirect, 'error');
  }
  controller.close();
});

test('handoff requires an explicitly selected current workspace and only requests an unsent draft', async () => {
  const { module } = await loadClient(); const h = host(); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
  assert.equal(await controller.handoff(), false); assert.equal(h.connected.length, 0);
  controller.selectWorkspace('workspace-a'); const pending = controller.handoff();
  assert.equal(controller.getSnapshot().busy, 'handoff');
  assert.equal(await controller.handoff(), false, 'double-click is refused while the retained target opens');
  assert.equal(await pending, true);
  assert.deepEqual(h.connected, ['workspace-a']); assert.equal(h.starts.length, 0);
  assert.equal(h.retained[0].id, 'session-a'); assert.equal(h.retained[0].options.source, 'controllerOperation');
  assert.equal(h.drafts[0].target, h.binding);
  assert.equal(h.drafts[0].draft.clearPreviousDraft, false);
  assert.match(h.drafts[0].draft.prompt, /检查投放 CSV/);
  assert.match(h.drafts[0].draft.prompt, /索引能力：report/);
  assert.match(h.drafts[0].draft.prompt, /https:\/\/example.com\/data.git#abcd/);
  assert.deepEqual(h.opened, ['session-a']); assert.deepEqual(h.released, ['session-a']);
  assert.deepEqual(h.panels, [null]);
  assert.match(controller.getSnapshot().notice, /草稿.*准备|核对/);
  assert.equal(await controller.handoff(), false, 'double-click does not create a second session');
  assert.equal(api.calls.filter(call => /submit|run|install/.test(call.url)).length, 0);
  controller.close();
});

test('deleted workspace is never silently replaced for handoff', async () => {
  const { module } = await loadClient(); const h = host(); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
  controller.selectWorkspace('workspace-a'); h.setSnapshot({ phase: 'ready', items: [] });
  assert.equal(await controller.handoff(), false); assert.equal(h.connected.length, 0); assert.equal(controller.getSnapshot().workspaceId, '');
  controller.close();
});

test('preserved or blocked drafts keep the plan and never navigate or claim applied', async () => {
  const { module } = await loadClient();
  for (const status of ['preserved', 'blocked']) {
    const h = host({ draftStatus: status }); const api = server();
    const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
    await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
    controller.selectWorkspace('workspace-a'); assert.equal(await controller.handoff(), false);
    assert.equal(controller.getSnapshot().stage, 'plan'); assert.equal(controller.getSnapshot().handoffRequested, false);
    assert.equal(controller.getSnapshot().busy, null); assert.equal(h.opened.length, 0); assert.equal(h.panels.length, 0);
    assert.deepEqual(h.released, ['session-a']);
    assert.match(status === 'preserved' ? controller.getSnapshot().notice : controller.getSnapshot().error, status === 'preserved' ? /已有草稿.*保留|保留.*已有/ : /正在提交|暂不可用/);
    controller.close();
  }
});

test('cancellation while connecting prevents a late draft and navigation', async () => {
  const { module } = await loadClient(); let resolveConnect;
  const h = host({ connect: () => new Promise(resolve => { resolveConnect = resolve; }) }); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
  controller.selectWorkspace('workspace-a'); const pending = controller.handoff();
  controller.cancel(); assert.equal(await pending, false);
  resolveConnect('session-a'); await Promise.resolve();
  assert.equal(h.retained.length, 0); assert.equal(h.drafts.length, 0); assert.equal(h.opened.length, 0); assert.equal(h.panels.length, 0);
  assert.equal(controller.getSnapshot().stage, 'plan'); controller.close();
});

test('unloading while retained target opens releases it without changing any draft', async () => {
  const { module } = await loadClient(); let resolveReady;
  const h = host({ ready: new Promise(resolve => { resolveReady = resolve; }) }); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
  controller.selectWorkspace('workspace-a'); const pending = controller.handoff();
  for (let index = 0; index < 10 && !h.retained.length; index += 1) await Promise.resolve();
  assert.equal(h.retained.length, 1); controller.close(); assert.equal(await pending, false);
  resolveReady(h.binding); await Promise.resolve();
  assert.equal(h.drafts.length, 0); assert.equal(h.opened.length, 0); assert.deepEqual(h.released, ['session-a']);
});

test('an expired binding cannot prepare a draft or leak a retained reference', async () => {
  const { module } = await loadClient(); const h = host({ expired: true }); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
  controller.selectWorkspace('workspace-a'); assert.equal(await controller.handoff(), false);
  assert.equal(h.drafts.length, 0); assert.equal(h.opened.length, 0); assert.deepEqual(h.released, ['session-a']);
  assert.match(controller.getSnapshot().error, /会话.*变化|草稿/); controller.close();
});

test('cancelled and unloaded analyses cannot overwrite a later result', async () => {
  const { module } = await loadClient(); const h = host(); let release;
  const api = server({ analyze: () => new Promise(resolve => { release = resolve; }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); const pending = controller.analyze('旧任务');
  controller.cancel(); assert.equal(controller.getSnapshot().busy, null);
  assert.equal(api.calls.at(-1).options.signal.aborted, true);
  release({ ok: true, json: async () => ({ intent: fixtureIntent() }) }); await pending;
  assert.equal(controller.getSnapshot().intent, null);
  const later = controller.analyze('关闭后的回包'); controller.close();
  release({ ok: true, json: async () => ({ intent: fixtureIntent() }) }); await later;
  assert.equal(controller.getSnapshot().intent, null);
});

test('unknown transport errors are generic; only structured server safe errors are shown', async () => {
  const { module } = await loadClient(); const h = host();
  const api = server({ analyze: async () => { throw new Error('/Users/private/token=secret'); } });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV');
  assert.doesNotMatch(controller.getSnapshot().error, /private|secret/);
  api.fetch = api.fetch;
  controller.close();
  const safe = module.createFinderController(h.ctx, { fetch: server({ bootstrap: async () => ({ ok: false, json: async () => ({ error: { message: '请先在 DSH 设置中配置默认模型。' } }) }) }).fetch });
  await safe.bootstrap(); assert.match(safe.getSnapshot().error, /配置默认模型/); safe.close();
});

test('native or missing-supply plans remain valid and feedback saves only on explicit action', async () => {
  const { module } = await loadClient(); const h = host();
  const api = server({ recommend: async () => ({ ok: true, json: async () => ({ intent: fixtureIntent(), plan: { ...fixturePlan(), kind: 'gap', pluginIds: [], title: '暂缺合适插件' }, candidates: [], model: { label: '默认模型' } }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('内部系统连接'); await controller.recommend();
  assert.equal(controller.getSnapshot().plan.kind, 'gap'); assert.equal(api.calls.length, 3);
  await controller.saveFeedback('blocked', '缺少连接器');
  const body = JSON.parse(api.calls.at(-1).options.body);
  assert.equal(body.outcome, 'blocked'); assert.deepEqual(body.pluginIds, []);
  assert.equal(controller.getSnapshot().feedbackSaved, true); controller.close();
});

test('unconfigured host model prevents analysis and does not introduce a Key form', async () => {
  const { module } = await loadClient(); const h = host();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ version: '0.1.0', catalog: { count: 12 }, model: { configured: false, label: '未配置' } }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV');
  assert.equal(api.calls.length, 1); assert.match(controller.getSnapshot().error, /默认模型/);
  controller.close();
});

test('actual catalog requirement objects expose keys, compatibility, lifecycle scripts and first-use instructions', async () => {
  const { module } = await loadClient();
  assert.equal(typeof module.candidateDetails, 'function');
  const details = module.candidateDetails({
    ...candidate,
    requirements: { extraApiKey: 'not-required', platforms: ['darwin', 'linux'], notes: ['需读取本地 CSV'] },
    compatibility: { dsh: '>=0.2.1-0 <0.3.0', node: '^22.19.0 || >=24.0.0' },
    install: { ...candidate.install, readiness: 'source-build-required', lifecycleScripts: ['prepare'] },
    firstUse: '先用 data_profile 检查文件，再解释结果。',
    limitations: ['画像不能证明业务数据准确'],
  });
  assert.match(details.requirements.join('\n'), /按索引声明，基础使用不需额外 API Key/);
  assert.match(details.requirements.join('\n'), /需读取本地 CSV/);
  assert.match(details.requirements.join('\n'), /darwin.*linux/);
  assert.equal(details.compatibility, '>=0.2.1-0 <0.3.0');
  assert.match(details.lifecycleWarning, /prepare/);
  assert.match(details.buildPrerequisite, /源码构建/);
  assert.match(details.buildPrerequisite, /宿主.*授权/);
  assert.match(module.candidateDetails({ ...candidate, install: { ...candidate.install, readiness: 'blocked' } }).buildPrerequisite, /暂不推荐/);
  assert.match(details.firstUse, /data_profile/);
  assert.match(details.limitations.join('\n'), /业务数据准确/);
});

test('editing list fields preserves a trailing line until final normalization', async () => {
  const { module } = await loadClient(); const h = host(); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV');
  controller.editIntent({ capabilities: ['质量检查', ''], constraints: ['不接第三方账号', ''] });
  assert.equal(controller.getSnapshot().intent.capabilities.join('\n'), '质量检查\n');
  await controller.recommend();
  assert.deepEqual(JSON.parse(api.calls.at(-1).options.body).intent.capabilities, ['质量检查']);
  controller.close();
});

test('editable intent stays within the service contract limits', async () => {
  const { module } = await loadClient(); const h = host(); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV');
  controller.editIntent({ input: 'a'.repeat(900), output: 'b'.repeat(900), constraints: ['c'.repeat(500)], capabilities: ['d'.repeat(200)], queries: Array.from({ length: 8 }, () => 'e'.repeat(200)) });
  const intent = controller.getSnapshot().intent;
  assert.equal(intent.input.length, 600); assert.equal(intent.output.length, 600);
  assert.equal(intent.constraints[0].length, 350); assert.equal(intent.capabilities[0].length, 150);
  assert.equal(intent.queries.length, 6); assert.equal(intent.queries[0].length, 120);
  controller.close();
});

test('home describes live source search without presenting the old cache count as search scope', async () => {
  const { module } = await loadClient(); const h = host(); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap();
  const rendered = await renderWorkbench(controller.getSnapshot());
  assert.equal(controller.getSnapshot().view, 'home');
  assert.ok(rendered.visibleNodes.some(node => node.type === 'button' && node.children.includes('帮我找方案')));
  assert.ok(rendered.visibleNodes.some(node => node.type === 'section' && node.props?.['aria-labelledby'] === 'pfv_home_title'));
  assert.ok(rendered.visibleNodes.some(node => node.type === 'textarea' && node.props?.id === 'pfv_home_input' && node.props?.['aria-label'] === '任务描述'));
  assert.equal(rendered.nodes.some(node => node.props?.className === 'pf_tabs'), false);
  assert.doesNotMatch(rendered.text, /索引 15|15 条插件记录/);
  assert.match(rendered.text, /GitHub DSH 插件/);
  controller.close();
});

test('live-source bootstrap does not require a fixed catalog count', async () => {
  const { module } = await loadClient(); const h = host();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ version: '0.1.1-preview.1', discovery: { mode: 'live', sources: [{ id: 'community', title: '第三方精选源', url: 'https://example.com/index.json', status: 'ready' }] }, model: { configured: true, label: '默认模型' } }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  assert.equal(await controller.bootstrap(), true); assert.equal(controller.getSnapshot().bootstrapLoaded, true);
  const rendered = await renderWorkbench(controller.getSnapshot()); assert.match(rendered.text, /第三方精选源，非官方审核/);
  controller.close();
});

test('recommendation preserves and renders per-source live/cache/failure evidence and dynamic candidate count', async () => {
  const { module } = await loadClient(); const h = host();
  const discovery = { searchedAt: '2026-10-20T12:30:00Z', sources: [
    { id: 'github', title: 'GitHub 检索', url: 'https://github.com/topics/dsh-plugin', status: 'live', total: 24, fetchedAt: '2026-10-20T12:30:00Z' },
    { id: 'market', title: '已配置市场', url: 'https://example.com/market.json', status: 'cached', total: 9, fetchedAt: '2026-10-20T11:30:00Z' },
    { id: 'community', title: '社区目录', url: 'https://example.com/community', status: 'failed', total: 0, error: '来源超时' },
  ] };
  const api = server({ recommend: async () => ({ ok: true, json: async () => ({ intent: fixtureIntent(), plan: fixturePlan(), candidates: [{ ...candidate, documentation: { url: 'https://example.com/README.md', readAt: '2026-10-20T12:29:50Z', truncated: true }, evidence: { metadata: 'index-only', installation: 'not-tested', task: 'not-tested', sources: [{ kind: 'discovery', url: 'https://example.com/plugin' }, { url: 'javascript:alert(1)' }] } }], discovery, warnings: ['社区目录尚未完成搜索'], model: { label: '默认模型' } }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('查找刚发布的插件'); await controller.recommend();
  assert.deepEqual(copy(controller.getSnapshot().discovery), discovery);
  assert.deepEqual(copy(controller.getSnapshot().warnings), ['社区目录尚未完成搜索']);
  const rendered = await renderWorkbench(controller.getSnapshot());
  assert.match(rendered.text, /GitHub 检索/); assert.match(rendered.text, /实时读取/); assert.match(rendered.text, /使用缓存/);
  assert.match(rendered.text, /读取失败/); assert.match(rendered.text, /搜索未完成/);
  assert.match(rendered.text, /2026-10-20T12:30:00Z/); assert.match(rendered.text, /24/);
  assert.match(rendered.text, /参与推荐的候选[：\s]+1/);
  assert.match(rendered.text, /仅索引声明/); assert.doesNotMatch(rendered.text, /包信息已核对/);
  assert.match(rendered.text, /作者资料读取/); assert.match(rendered.text, /2026-10-20T12:29:50Z/);
  assert.ok(rendered.nodes.filter(node => node.type === 'a').every(node => !node.props.href.startsWith('javascript:')));
  controller.close();
});

test('source failures do not render an empty result as proof that no plugin exists', async () => {
  const { module } = await loadClient(); const h = host();
  const api = server({ recommend: async () => ({ ok: true, json: async () => ({ intent: fixtureIntent(), plan: { ...fixturePlan(), kind: 'gap', pluginIds: [] }, candidates: [], discovery: { searchedAt: '2026-10-20T13:00:00Z', sources: [{ id: 'github', title: 'GitHub', status: 'failed', total: 0 }] }, warnings: ['搜索未完成'], model: { label: '默认模型' } }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('搜索新插件'); await controller.recommend();
  const rendered = await renderWorkbench(controller.getSnapshot());
  assert.match(rendered.text, /搜索未完成/);
  assert.doesNotMatch(rendered.text, /当前索引没有找到足够合适|当前供给有缺口/);
  controller.close();
});

test('recommendation prioritizes direct use and creation while retaining folded evidence and history', async () => {
  const { module } = await loadClient(); const h = host();
  const workflow = { ...identifiedWorkflow(), plan: { ...fixturePlan(), limits: ['关键限制一', '关键限制二', '关键限制三', '补充限制四'] }, candidates: [{ ...candidate, capabilities: ['原始能力长字段完整保留'], limitations: ['作者限制完整保留'] }], feedback: [{ id: 'older', outcome: 'partial', note: '旧反馈详细说明完整保留' }], warnings: ['检索内部详细核对提示完整保留'] };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind();
  const rendered = await renderWorkbench(controller.getSnapshot());
  const positions = ['当前方案', '使用这个方案', '创建自己的插件', '这次会做什么', '来源与备选方案'].map(label => rendered.visibleText.indexOf(label));
  assert.ok(positions.every(index => index >= 0), positions.join(',')); assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.doesNotMatch(rendered.visibleText, /复制|粘贴|交接|去会话继续|Creator|下一步/);
  const history = rendered.nodes.find(node => node.type === 'details' && node.props['aria-label'] === '当前方案与历史版本');
  assert.ok(history); assert.equal(Boolean(history.props.open), false);
  assert.match(rendered.text, /方案记录 · 版本/);assert.ok(!rendered.visibleText.includes('方案记录 · 版本'));
  const versionSelect = rendered.nodes.find(node => node.type === 'select' && node.props['aria-label'] === '历史版本');
  assert.ok(versionSelect); assert.equal(versionSelect.props.value, workflow.revisionId);
  assert.equal(versionSelect.children.length, workflow.revisions.length);
  for (const phrase of ['关键限制一', '关键限制二']) assert.ok(rendered.visibleText.includes(phrase), phrase);
  for (const phrase of ['原始能力长字段完整保留', '作者限制完整保留', '旧反馈详细说明完整保留', '检索内部详细核对提示完整保留', '关键限制三', '补充限制四']) {
    assert.ok(rendered.text.includes(phrase), phrase); assert.ok(!rendered.visibleText.includes(phrase), phrase);
  }
  const search = rendered.nodes.find(node => node.type === 'details' && node.props['aria-label'] === '本次搜索来源');
  assert.ok(search); assert.equal(search.props.open, false); controller.close();
});

test('optional folded source controls retain exact copy and native-manager actions without becoming main path', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = { ...identifiedWorkflow(), candidates: [{ ...candidate, install: { ...candidate.install, lifecycleScripts: ['prepare'] } }] };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind();
  const collapsed = await renderWorkbench(controller.getSnapshot());
  assert.match(collapsed.visibleText, /使用这个方案/);assert.match(collapsed.visibleText, /创建自己的插件/);
  assert.doesNotMatch(collapsed.visibleText, /复制安装来源|粘贴|打开原生插件管理|把方案带到 DSH 会话/);
  const copied = []; const rendered = await renderWorkbench(controller.getSnapshot(), { keepAlive: true, openEvidence: true, navigator: { clipboard: { writeText: async value => copied.push(value) } } });
  for (const phrase of ['所选插件安装指引', candidate.install.spec, '添加插件', '粘贴', '安装', '启用', '回到侧栏', '发现好插件', '我的方案', '本机方案会保留', 'prepare']) assert.ok(rendered.visibleText.includes(phrase), phrase);
  const copyAction = rendered.visibleNodes.find(node => node.type === 'button' && node.children.includes('复制安装来源'));
  const managerAction = rendered.visibleNodes.find(node => node.type === 'button' && node.children.includes('打开原生插件管理'));
  assert.ok(copyAction); assert.ok(managerAction); assert.deepEqual(rendered.host.panels, []); await copyAction.props.onClick();
  assert.deepEqual(copied, [candidate.install.spec]); assert.deepEqual(rendered.host.panels, []); managerAction.props.onClick(); assert.deepEqual(rendered.host.panels, ['plugins']);
  assert.equal(api.calls.length, 1); assert.doesNotMatch(rendered.visibleText, /已安装成功|自动安装完成|已验证兼容/); rendered.dispose(); controller.close();
});

test('folding search evidence keeps failure and cache boundaries visible before using an available plan', async () => {
  const { module } = await loadClient();
  for (const [status, expected] of [['failed', /部分来源尚未查完/], ['stale', /部分来源尚未查完/]]) {
    const h = host(); const workflow = { ...identifiedWorkflow(), discovery: { searchedAt: '2026-10-21T10:00:00Z', sources: [{ id: 'community', title: '社区目录', status, error: '来源详细失败说明', fetchedAt: '2026-10-20T10:00:00Z' }] } };
    const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }) });
    const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind(); const rendered = await renderWorkbench(controller.getSnapshot());
    assert.match(rendered.visibleText, expected); assert.ok(rendered.visibleText.indexOf('部分来源尚未查完') < rendered.visibleText.indexOf('使用这个方案'));
    assert.ok(!rendered.visibleText.includes('重试查找'));
    assert.ok(!rendered.visibleText.includes('来源详细失败说明')); assert.ok(rendered.nodes.some(node => node.type === 'details' && node.props['aria-label'] === '本次搜索来源' && node.props.open === false)); controller.close();
  }
});

test('native plans skip installation guidance and missing selected sources never fabricate an install action', async () => {
  const { module } = await loadClient();
  for (const native of [true, false]) {
    const h = host(); const workflow = { ...identifiedWorkflow(), ...(native ? { plan: { ...fixturePlan(), kind: 'native', pluginIds: [], steps: fixturePlan().steps.map(step => ({ ...step, owner: 'dsh' })) }, candidates: [] } : { candidates: [{ ...candidate, install: {} }] }) };
    const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }) });
    const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind(); const rendered = await renderWorkbench(controller.getSnapshot());
    assert.ok(rendered.visibleText.includes('使用这个方案')); assert.ok(rendered.visibleText.includes('创建自己的插件'));
    assert.doesNotMatch(rendered.visibleText, /把方案带到 DSH 会话|安装、工作区与会话草稿|复制|粘贴/);
    if (native) assert.ok(!rendered.visibleText.includes('所选插件安装指引')); else { assert.match(rendered.text, /精确安装来源.*未确认|暂无.*精确安装来源/); assert.ok(!rendered.visibleNodes.some(node => node.type === 'button' && node.children.includes('复制安装来源'))); }
    controller.close();
  }
});

test('discovery unavailability keeps the safe server explanation and permits retry from the confirmed intent', async () => {
  const { module } = await loadClient(); const h = host();
  const message = '插件来源暂时不可用，搜索未完成。请稍后重试。';
  const api = server({ recommend: async () => ({ ok: false, json: async () => ({ error: { code: 'DISCOVERY_UNAVAILABLE', message } }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('搜索新插件'); await controller.recommend();
  assert.equal(controller.getSnapshot().error, message); assert.equal(controller.getSnapshot().stage, 'understand');
  assert.equal(controller.getSnapshot().intent.goal, fixtureIntent().goal); controller.close();
});

test('cached manifest evidence stays inspectable without claiming a fresh check', async () => {
  const { module } = await loadClient(); const h = host();
  const manifestUrl = 'https://example.com/pinned/package.json';
  const api = server({ recommend: async () => ({ ok: true, json: async () => ({
    intent: fixtureIntent(), plan: fixturePlan(),
    candidates: [{ ...candidate, homepage: 'https://example.com/home', documentation: { url: 'https://example.com/docs' }, sourceTags: [{ title: '来源甲', url: 'https://example.com/a' }, { title: '来源乙', url: 'https://example.com/b' }], evidence: { ...candidate.evidence, metadata: 'manifest-checked', fetchedAt: '2026-10-19T11:00:00Z', sources: [{ kind: 'manifest', url: manifestUrl }] } }],
    discovery: { searchedAt: '2026-10-20T13:00:00Z', sources: [{ id: 'market', title: '市场缓存', status: 'cached', total: 1, fetchedAt: '2026-10-19T11:00:00Z' }] }, warnings: [], model: { label: '默认模型' },
  }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('搜索插件'); await controller.recommend();
  const rendered = await renderWorkbench(controller.getSnapshot());
  assert.match(rendered.text, /包清单已核对/); assert.doesNotMatch(rendered.text, /本次清单已核对/);
  assert.ok(rendered.nodes.some(node => node.type === 'a' && node.props.href === manifestUrl), 'source labels must retain the underlying manifest link');
  controller.close();
});

const savedWorkflow = stage => ({ stage, request: '恢复前的完整原始任务', intent: fixtureIntent(), ...(stage === 'plan' ? { plan: fixturePlan() } : {}), candidates: stage === 'plan' ? [candidate] : [], discovery: { sources: [{ id: 'github', title: 'GitHub', status: 'cached', total: 1 }], searchedAt: '2026-10-20T12:00:00Z' }, warnings: ['来源曾使用缓存'], model: { label: '历史模型' } });
const restoredBootstrap = workflow => ({ version: '0.2.0-preview.1', discovery: { mode: 'live', sources: [] }, model: { configured: true, label: '当前宿主模型' }, workflow });

test('initial bootstrap restores validated local understanding or plan without model calls or an automatic handoff', async () => {
  const { module } = await loadClient();
  for (const stage of ['understand', 'plan']) {
    const h = host(); const workflow = savedWorkflow(stage);
    const api = server({ bootstrap: async () => ({ ok: true, json: async () => copy(restoredBootstrap(workflow)) }) });
    const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
    await controller.bootstrap(); const state = controller.getSnapshot();
    assert.equal(state.stage, stage); assert.equal(state.request, workflow.request);
    assert.deepEqual(copy(state.intent), workflow.intent); assert.deepEqual(copy(state.candidates), workflow.candidates);
    assert.equal(state.workspaceId, ''); assert.equal(state.handoffRequested, false); assert.equal(h.connected.length, 0);
    assert.match(state.notice, /已恢复本机任务与方案/);
    if (stage === 'plan') { assert.deepEqual(copy(state.plan), workflow.plan); assert.deepEqual(copy(state.discovery), workflow.discovery); }
    assert.deepEqual(api.calls.map(call => call.url), ['/api/plugin_finder/bootstrap']); controller.close();
  }
});

test('a slow bootstrap never overwrites text entered while local recovery is pending', async () => {
  const { module } = await loadClient(); const h = host(); let release;
  const api = server({ bootstrap: async () => new Promise(resolve => { release = resolve; }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); const pending = controller.bootstrap();
  controller.setRequest('用户刚输入的新需求'); assert.equal(controller.getSnapshot().request, '用户刚输入的新需求');
  release({ ok: true, json: async () => restoredBootstrap(savedWorkflow('plan')) }); await pending;
  assert.equal(controller.getSnapshot().request, '用户刚输入的新需求'); assert.equal(controller.getSnapshot().stage, 'describe');
  assert.equal(controller.getSnapshot().plan, null); assert.doesNotMatch(controller.getSnapshot().notice, /已恢复/);
  controller.close();
});

test('malformed saved workflow is not restored and leaves a usable fresh task form', async () => {
  const { module } = await loadClient(); const h = host();
  const workflow = { ...savedWorkflow('plan'), plan: { ...fixturePlan(), steps: [null] } };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(workflow) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); assert.equal(controller.getSnapshot().bootstrapLoaded, true);
  assert.equal(controller.getSnapshot().stage, 'describe'); assert.equal(controller.getSnapshot().plan, null);
  assert.match(controller.getSnapshot().notice, /无法恢复|格式/); controller.close();
});

test('newRequest preserves visible work on failure and starts blank only after acknowledgment', async () => {
  const { module } = await loadClient(); const h = host(); let failed = true;
  const api = server({
    bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(savedWorkflow('plan')) }),
    reset: async () => failed ? { ok: false, json: async () => ({ error: { code: 'WORKFLOW_STORAGE_FAILED', message: '本机任务记录未能清除。' } }) } : { ok: true, json: async () => ({ cleared: true }) },
  });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  assert.equal(typeof controller.newRequest, 'function'); assert.equal(await controller.newRequest(), false);
  assert.equal(controller.getSnapshot().stage, 'plan'); assert.equal(controller.getSnapshot().request, savedWorkflow('plan').request);
  assert.deepEqual(copy(controller.getSnapshot().plan), fixturePlan()); assert.equal(controller.getSnapshot().resetPending, true);
  assert.match(controller.getSnapshot().error, /本机任务记录未能清除/);
  const rendered = await renderWorkbench(controller.getSnapshot()); assert.match(rendered.text, /未能|失败|未确认/);
  failed = false; assert.equal(await controller.newRequest(), true); assert.equal(controller.getSnapshot().resetPending, false);
  assert.deepEqual(api.calls.map(call => call.url), ['/api/plugin_finder/bootstrap', '/api/plugin_finder/reset', '/api/plugin_finder/reset']);
  controller.close();
});

test('reset does not interrupt an operation and plugin disposal aborts its request', async () => {
  const { module } = await loadClient(); const h = host(); let releaseReset;
  const api = server({ reset: async () => new Promise(resolve => { releaseReset = resolve; }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); const pending = controller.newRequest();
  assert.equal(controller.getSnapshot().busy, 'reset');
  assert.equal(await controller.newRequest(), false); assert.equal(await controller.analyze('不应插入的模型任务'), false);
  const request = api.calls.at(-1); controller.close(); assert.equal(request.options.signal.aborted, true);
  releaseReset({ ok: true, json: async () => ({ cleared: true }) }); assert.equal(await pending, false);
  assert.equal(api.calls.filter(call => call.url.endsWith('/reset')).length, 1);
});

test('safe local-save warnings keep completed model results visible without claiming persistence', async () => {
  const { module } = await loadClient(); const h = host(); const warning = '本机方案保存失败，重启后可能无法恢复，请先复制保留。';
  const api = server({
    bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(undefined), workflowWarning: '本机记录暂时无法读取，可继续新任务。' }) }),
    analyze: async () => ({ ok: true, json: async () => ({ intent: fixtureIntent(), workflowWarning: warning, model: { label: '宿主模型' } }) }),
    recommend: async () => ({ ok: true, json: async () => ({ intent: fixtureIntent(), plan: fixturePlan(), candidates: [candidate], workflowWarning: warning, model: { label: '宿主模型' } }) }),
  });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  assert.match(controller.getSnapshot().notice, /本机记录暂时无法读取/);
  await controller.analyze('检查 CSV'); assert.equal(controller.getSnapshot().stage, 'understand'); assert.equal(controller.getSnapshot().notice, warning);
  await controller.recommend(); assert.equal(controller.getSnapshot().stage, 'plan'); assert.equal(controller.getSnapshot().notice, warning);
  assert.equal(api.calls.filter(call => call.url.endsWith('/analyze')).length, 1); controller.close();
});

test('retrying a failed local clear preserves the new task text typed in the meantime', async () => {
  const { module } = await loadClient(); const h = host(); let fail = true;
  const api = server({ reset: async () => ({ ok: !fail, json: async () => fail ? { error: { message: '本机任务记录未能清除。' } } : { cleared: true } }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  await controller.newRequest(); controller.setRequest('这段新需求不能被清除重试抹掉'); fail = false;
  assert.equal(typeof controller.retryReset, 'function'); assert.equal(await controller.retryReset(), true);
  assert.equal(controller.getSnapshot().request, '这段新需求不能被清除重试抹掉'); assert.equal(controller.getSnapshot().resetPending, false);
  controller.close();
});

test('analysis and workflow warnings are both visible without an extra model repair call', async () => {
  const { module } = await loadClient(); const h = host();
  const analysisWarning = '已去掉原始需求中没有明确提出的约束，请核对目标、能力和限制。';
  const localWarning = '本机方案保存失败，重启后可能无法恢复，请先复制保留。';
  const api = server({ analyze: async () => ({ ok: true, json: async () => ({ intent: fixtureIntent(), analysisWarning, workflowWarning: localWarning, model: { label: '宿主模型' } }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); await controller.analyze('检查 CSV');
  assert.ok(controller.getSnapshot().notice.includes(analysisWarning)); assert.ok(controller.getSnapshot().notice.includes(localWarning));
  const rendered = await renderWorkbench(controller.getSnapshot());
  assert.equal(rendered.text.split(analysisWarning).length - 1, 1); assert.equal(rendered.text.split(localWarning).length - 1, 1);
  assert.equal(api.calls.filter(call => call.url.endsWith('/analyze')).length, 1); controller.close();
});

test('ready search sources do not imply that a user market has already been configured', async () => {
  const { module } = await loadClient(); const h = host(); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  const rendered = await renderWorkbench(controller.getSnapshot());
  assert.match(rendered.text, /按需检查与搜索/); assert.doesNotMatch(rendered.text, /已配置，按需搜索/);
  controller.close();
});

test('legacy preserved-draft opener still targets the exact session without writes or submission', async () => {
  const { module } = await loadClient(); const h = host({ draftStatus: 'preserved' }); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
  controller.selectWorkspace('workspace-a'); await controller.handoff();
  assert.deepEqual(copy(controller.getSnapshot().preservedTarget), { sessionId: 'session-a', workspaceId: 'workspace-a' });
  const rendered = await renderWorkbench(controller.getSnapshot()); assert.ok(!rendered.visibleNodes.some(node => node.type === 'button' && node.children.some(label => typeof label === 'string' && /打开已有草稿|确认方案，去会话继续/.test(label))));
  assert.equal(typeof controller.openPreservedDraft, 'function');
  assert.equal(controller.openPreservedDraft(), true);
  assert.deepEqual(h.opened, ['session-a']); assert.deepEqual(h.panels, [null]);
  assert.equal(h.connected.length, 1); assert.equal(h.drafts.length, 1); assert.equal(h.starts.length, 0);
  assert.match(controller.getSnapshot().notice, /核对|已有草稿/); controller.close();
  assert.equal(controller.openPreservedDraft(), false); assert.equal(h.opened.length, 1);
});

test('changing the task or workspace clears any previously preserved-session target', async () => {
  const { module } = await loadClient();
  for (const change of [controller => controller.selectWorkspace(''), controller => controller.editIntent({ goal: '另一个目标' }), controller => controller.newRequest()]) {
    const h = host({ draftStatus: 'preserved' }); const api = server();
    const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
    await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
    controller.selectWorkspace('workspace-a'); await controller.handoff(); await change(controller);
    assert.equal(controller.getSnapshot().preservedTarget, null); assert.equal(controller.openPreservedDraft(), false);
    assert.equal(h.opened.length, 0); controller.close();
  }
});

test('an explicit preserved-draft opener refuses busy state and a subsequent handoff drops the old target', async () => {
  const { module } = await loadClient(); let releaseFeedback; let releaseConnect; let connections = 0;
  const h = host({ draftStatus: 'preserved', connect: () => ++connections === 1 ? Promise.resolve('session-a') : new Promise(resolve => { releaseConnect = resolve; }) });
  const api = server({ feedback: async () => new Promise(resolve => { releaseFeedback = resolve; }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
  controller.selectWorkspace('workspace-a'); await controller.handoff();
  const feedback = controller.saveFeedback('partial'); assert.equal(controller.openPreservedDraft(), false);
  releaseFeedback({ ok: true, json: async () => ({ saved: true }) }); await feedback;
  const pending = controller.handoff(); assert.equal(controller.getSnapshot().preservedTarget, null); assert.equal(controller.openPreservedDraft(), false);
  controller.cancel(); assert.equal(await pending, false); releaseConnect('session-a');
  assert.equal(h.opened.length, 0); controller.close();
});

const identifiedWorkflow = (taskId = 'task-a', revisionNumber = 1, stage = 'plan') => ({
  ...savedWorkflow(stage), taskId, revisionId: `${taskId}-revision-${revisionNumber}`, revisionNumber,
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:30:00Z',
  revisions: [{ revisionId: `${taskId}-revision-1`, revisionNumber: 1, stage: 'plan', createdAt: '2026-10-20T12:00:00Z', title: '初版方案' }],
  feedback: [{ revisionId: `${taskId}-revision-1`, outcome: 'partial', note: '缺少出处', createdAt: '2026-10-20T12:20:00Z' }],
  handoff: null,
});
const summaryFor = workflow => ({ taskId: workflow.taskId, request: workflow.request, title: workflow.plan?.title ?? workflow.intent.goal, updatedAt: workflow.updatedAt, revisionCount: workflow.revisions.length, latestRevisionId: workflow.revisionId, latestRevisionNumber: workflow.revisionNumber, stage: workflow.stage });
const historyEnvelope = workflow => ({ workflow, history: [summaryFor(workflow)], historyTotal: 1 });

test('blank home exposes history and opens exact task versions without model calls', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow();
  const api = server({ history: async () => ({ ok: true, json: async () => historyEnvelope(a) }), open: async () => ({ ok: true, json: async () => historyEnvelope(a) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  const blank = await renderWorkbench(controller.getSnapshot()); assert.equal(controller.getSnapshot().view, 'home');
  assert.ok(blank.visibleNodes.some(node => node.type === 'button' && node.children.includes('帮我找方案')));
  assert.ok(blank.visibleNodes.some(node => node.type === 'button' && node.children.includes('历史方案')));
  assert.equal(await controller.showHistory(), true); assert.equal(controller.getSnapshot().view, 'history');
  assert.equal(await controller.openTask('task-a', 'task-a-revision-1'), true);
  assert.equal(controller.getSnapshot().taskId, 'task-a'); assert.equal(controller.getSnapshot().revisionId, 'task-a-revision-1');
  assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), { taskId: 'task-a', revisionId: 'task-a-revision-1' });
  assert.equal(controller.getSnapshot().view, 'find'); assert.equal(controller.getSnapshot().feedback.length, 1);
  assert.equal(api.calls.some(call => /analyze|recommend/.test(call.url)), false); assert.equal(h.connected.length, 0);
  controller.close();
});

test('task writes carry exact identities and refinement returns to confirmation without losing old versions', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow(); const revised = { ...identifiedWorkflow('task-a', 2, 'understand'), feedback: [], revisions: [...a.revisions, { revisionId: 'task-a-revision-2', revisionNumber: 2, stage: 'understand', createdAt: '2026-10-20T13:00:00Z' }] };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) }), recommend: async () => ({ ok: true, json: async () => historyEnvelope(a) }), feedback: async () => ({ ok: true, json: async () => ({ saved: true, ...historyEnvelope(a) }) }), refine: async () => ({ ok: true, json: async () => historyEnvelope(revised) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  await controller.recommend(); assert.equal(JSON.parse(api.calls.at(-1).options.body).taskId, 'task-a');
  await controller.saveFeedback('partial', '缺少出处'); const body = JSON.parse(api.calls.at(-1).options.body);
  assert.equal(body.taskId, 'task-a'); assert.equal(body.revisionId, 'task-a-revision-1');
  assert.equal(await controller.refine('请保留原始出处'), true);
  assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), { taskId: 'task-a', revisionId: 'task-a-revision-1', feedback: '请保留原始出处' });
  const state = controller.getSnapshot(); assert.equal(state.stage, 'understand'); assert.equal(state.revisionNumber, 2); assert.equal(state.revisions.length, 2);
  assert.equal(state.feedback.length, 0); assert.equal(state.plan, null);
  assert.match(state.notice, /确认|核对/); assert.equal(h.connected.length, 0); controller.close();
});

test('failed refinement and failed historical opens preserve the displayed task and feedback', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow();
  const failed = async () => ({ ok: false, json: async () => ({ error: { message: '本机历史暂时无法保存。' } }) });
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) }), refine: failed, open: failed });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  assert.equal(await controller.refine('缺少出处'), false); assert.equal(controller.getSnapshot().revisionId, a.revisionId); assert.equal(controller.getSnapshot().stage, 'plan');
  assert.equal(await controller.openTask('task-b'), false); assert.equal(controller.getSnapshot().taskId, 'task-a'); assert.equal(controller.getSnapshot().feedback[0].note, '缺少出处');
  controller.close();
});

test('handoff stores exact workspace and session IDs and saved-session continuation never injects or reconnects', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow();
  const linked = { ...a, handoff: { workspaceId: 'workspace-a', sessionId: 'session-a', status: 'applied', createdAt: '2026-10-20T13:00:00Z' } };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) }), handoff: async () => ({ ok: true, json: async () => historyEnvelope(linked) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.selectWorkspace('workspace-a');
  assert.equal(await controller.handoff(), true);
  const body = JSON.parse(api.calls.at(-1).options.body); assert.deepEqual(body, { taskId: 'task-a', revisionId: 'task-a-revision-1', workspaceId: 'workspace-a', sessionId: 'session-a', status: 'applied' });
  h.setSnapshot({ phase: 'ready', items: [{ workspaceId: 'workspace-a', title: '项目', sessionIds: ['session-a'] }] });
  assert.equal(await controller.continueSession(), true);
  assert.equal(h.connected.length, 1); assert.equal(h.drafts.length, 1); assert.equal(h.retained.length, 2); assert.deepEqual(h.opened, ['session-a', 'session-a']);
  h.setSnapshot({ phase: 'ready', items: [{ workspaceId: 'workspace-a', title: '项目', sessionIds: [] }] });
  assert.equal(await controller.continueSession(), false); assert.equal(h.opened.length, 2); assert.match(controller.getSnapshot().error, /会话|绑定/);
  controller.close();
});

test('import is explicit and does not replace current task; export addresses the whole current task', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow(); const b = identifiedWorkflow('task-b');
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) }), import: async () => ({ ok: true, json: async () => ({ workflow: b, history: [summaryFor(b), summaryFor(a)], historyTotal: 2 }) }), export: async () => ({ ok: true, json: async () => ({ format: 'plugin-finder-task', task: { id: 'task-a' } }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  assert.equal(await controller.importBackup(b, 'checkpoint.json'), true); assert.equal(controller.getSnapshot().taskId, 'task-a'); assert.equal(controller.getSnapshot().historyTotal, 2);
  assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), { workflow: b, origin: 'checkpoint.json' }); assert.match(controller.getSnapshot().notice, /备份|恢复|导入/);
  const exported = await controller.exportTask(); assert.equal(exported.task.id, 'task-a'); assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), { taskId: 'task-a' });
  controller.close();
});

test('history navigation remains reachable after starting blank and no copy promises history deletion', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) }), reset: async () => ({ ok: true, json: async () => ({ cleared: true, history: [summaryFor(a)], historyTotal: 1 }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); await controller.newRequest();
  assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), { taskId: 'task-a', revisionId: 'task-a-revision-1' });
  const state = controller.getSnapshot(); assert.equal(state.stage, 'describe'); assert.equal(state.taskId, null); assert.equal(state.historyTotal, 1);
  const rendered = await renderWorkbench(state); assert.match(rendered.text, /我的方案/); assert.doesNotMatch(rendered.text, /新需求.*会清除|正在清除当前|已清除本机任务/);
  controller.close();
});

test('cross-task recommendation and cross-version feedback responses cannot replace the chosen history', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) }), recommend: async () => ({ ok: true, json: async () => historyEnvelope(identifiedWorkflow('task-b')) }), feedback: async () => ({ ok: true, json: async () => ({ saved: true, ...historyEnvelope(identifiedWorkflow('task-a', 2)) }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  assert.equal(await controller.recommend(), false); assert.equal(controller.getSnapshot().taskId, 'task-a');
  assert.equal(await controller.saveFeedback('complete', '结果'), false); assert.equal(controller.getSnapshot().revisionId, 'task-a-revision-1'); assert.equal(controller.getSnapshot().feedbackSaved, false);
  controller.close();
});

test('a failed handoff association can be retried without connecting or injecting the prepared draft again', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow(); let fail = true;
  const linked = { ...a, handoff: { taskId: a.taskId, revisionId: a.revisionId, workspaceId: 'workspace-a', sessionId: 'session-a', status: 'applied' } };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) }), handoff: async () => fail ? { ok: false, json: async () => ({ error: { message: '存储失败' } }) } : { ok: true, json: async () => historyEnvelope(linked) } });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.selectWorkspace('workspace-a');
  assert.equal(await controller.handoff(), false); assert.equal(controller.getSnapshot().handoffRequested, true); assert.equal(controller.getSnapshot().pendingHandoff.sessionId, 'session-a');
  assert.match(controller.getSnapshot().error, /草稿已准备.*关联未能/); fail = false; assert.equal(await controller.retryHandoffSave(), true);
  assert.equal(h.connected.length, 1); assert.equal(h.drafts.length, 1); assert.equal(controller.getSnapshot().pendingHandoff, null);
  controller.close();
});

test('saved-session continuation rejects expired bindings and releases the retained reference', async () => {
  const { module } = await loadClient(); const h = host({ expired: true }); const a = { ...identifiedWorkflow(), handoff: { workspaceId: 'workspace-a', sessionId: 'session-a', status: 'applied' } };
  h.setSnapshot({ phase: 'ready', items: [{ workspaceId: 'workspace-a', title: '项目', sessionIds: ['session-a'] }] });
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  assert.equal(await controller.continueSession(), false); assert.equal(h.opened.length, 0); assert.equal(h.connected.length, 0); assert.equal(h.drafts.length, 0); assert.deepEqual(h.released, ['session-a']);
  assert.match(controller.getSnapshot().error, /绑定/); controller.close();
});

test('history rendering shows restoration origin, version choices and only selected-version feedback', async () => {
  const { module } = await loadClient(); const h = host(); const a = { ...identifiedWorkflow(), origin: { type: 'backup', label: '原始需求备份.json', importedAt: '2026-10-20T14:00:00Z' } };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind();
  const rendered = await renderWorkbench(controller.getSnapshot()); assert.match(rendered.text, /恢复来源：原始需求备份.json/); assert.match(rendered.text, /这个版本的反馈/); assert.match(rendered.text, /缺少出处/);
  assert.ok(rendered.nodes.some(node => node.type === 'select' && node.props['aria-label'] === '历史版本'));
  assert.ok(rendered.nodes.some(node => node.type === 'button' && node.children.includes('反馈并优化方案'))); controller.close();
});

test('handoff refuses a different active task before connecting or writing any draft', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow(); let reads = 0;
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => { const workflow = ++reads === 1 ? a : identifiedWorkflow('task-b'); return { ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }; } }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.selectWorkspace('workspace-a');
  assert.equal(await controller.handoff(), false); assert.equal(h.connected.length, 0); assert.equal(h.retained.length, 0); assert.equal(h.drafts.length, 0);
  assert.equal(controller.getSnapshot().taskId, 'task-a'); assert.equal(controller.getSnapshot().stage, 'plan'); assert.match(controller.getSnapshot().error, /另一|当前任务|版本.*变化|重新打开/);
  assert.equal(api.calls.some(call => call.url.endsWith('/handoff')), false); controller.close();
});

test('handoff refuses a different active revision or failed preflight before any Host side effect', async () => {
  const { module } = await loadClient();
  for (const failure of ['revision', 'unavailable', 'blank']) {
    const h = host(); const a = identifiedWorkflow(); let reads = 0;
    const api = server({ bootstrap: async () => ++reads === 1 ? { ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) } : failure === 'unavailable' ? { ok: false, json: async () => ({ error: { message: '服务暂不可用' } }) } : { ok: true, json: async () => ({ ...restoredBootstrap(undefined), workflow: failure === 'blank' ? null : identifiedWorkflow('task-a', 2) }) } });
    const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.selectWorkspace('workspace-a');
    assert.equal(await controller.handoff(), false); assert.equal(h.connected.length, 0); assert.equal(h.drafts.length, 0); assert.equal(controller.getSnapshot().revisionId, a.revisionId); controller.close();
  }
});

test('a cancelled history open cannot overwrite a later request when its response finally arrives', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow(); let release;
  const api = server({ open: async () => new Promise(resolve => { release = resolve; }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); const pending = controller.openTask('task-a', a.revisionId);
  controller.cancel(); controller.setRequest('后来填写的新需求');
  release({ ok: true, json: async () => historyEnvelope(a) }); assert.equal(await pending, false);
  assert.equal(controller.getSnapshot().request, '后来填写的新需求'); assert.equal(controller.getSnapshot().taskId, null); controller.close();
});

test('saved-session opener refuses a handoff record belonging to another task or revision', async () => {
  const { module } = await loadClient();
  for (const mismatch of [{ taskId: 'task-b', revisionId: 'task-a-revision-1' }, { taskId: 'task-a', revisionId: 'task-a-revision-2' }]) {
    const h = host(); const a = { ...identifiedWorkflow(), handoff: { ...mismatch, workspaceId: 'workspace-a', sessionId: 'session-a', status: 'applied' } };
    h.setSnapshot({ phase: 'ready', items: [{ workspaceId: 'workspace-a', title: '项目', sessionIds: ['session-a'] }] });
    const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(a), ...historyEnvelope(a) }) }) });
    const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
    assert.equal(await controller.continueSession(), false); assert.equal(h.opened.length, 0); assert.equal(h.retained.length, 0); controller.close();
  }
});

test('coverage presents real source supply and bounded inspection separately from returned candidates', async () => {
  const { module } = await loadClient(); const h = host();
  const discovery = { searchedAt: '2026-10-20T16:00:00Z', sources: [{ id: 'awesome', title: '第三方精选目录', status: 'live', total: 6084 }], sourceCoverage: [{ sourceId: 'awesome', url: 'https://example.com/plugins.json', status: 'live', fetchedAt: '2026-10-20T15:59:00Z', total: 6084, npmTotal: 3112, githubOnlyTotal: 2972, rejectedRows: 0, matched: 80, inspected: 24, resolved: 15, excluded: 9, uninspected: 56, inspectionBudget: 24 }], coverage: { matched: 80, inspected: 24, resolved: 15, excluded: 9, uninspected: 56, returned: 1, inspectionBudget: 24 } };
  const api = server({ recommend: async () => ({ ok: true, json: async () => ({ intent: fixtureIntent(), plan: fixturePlan(), candidates: [candidate], discovery, warnings: [], model: { label: '默认模型' } }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
  assert.deepEqual(copy(controller.getSnapshot().discovery), discovery);
  const rendered = await renderWorkbench(controller.getSnapshot());
  for (const phrase of ['本次供给覆盖', '供给记录', '6084', 'npm', '3112', 'GitHub-only', '2972', '本次匹配', '80', '作者资料核对', '24', '最终候选', '1', '未检查', '56']) assert.ok(rendered.text.includes(phrase), phrase);
  assert.match(rendered.text, /限于本次.*来源/); assert.match(rendered.text, /索引条目/);
  assert.doesNotMatch(rendered.text, /全网已搜完|已验证全部|所有插件均已核对/);
  controller.close();
});

test('old saved plans keep their source evidence without fabricated zero coverage', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind(); const rendered = await renderWorkbench(controller.getSnapshot());
  assert.match(rendered.text, /未记录.*供给覆盖|供给覆盖.*未记录/); assert.match(rendered.text, /来源曾使用缓存/); assert.match(rendered.text, /2026-10-20T12:00:00Z/);
  assert.doesNotMatch(rendered.text, /供给记录[：\s]+0|未检查[：\s]+0/);
  assert.equal(api.calls.length, 1); controller.close();
});

test('coverage preserves failed and stale source boundaries without summing overlapping supplies', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = { ...identifiedWorkflow(), discovery: { searchedAt: '2026-10-20T16:00:00Z', sources: [], sourceCoverage: [{ sourceId: 'a', status: 'cached', fetchedAt: '2026-10-19T01:00:00Z', total: 6084, matched: 2, inspected: 1, resolved: 1, excluded: 0, uninspected: 1, inspectionBudget: 24 }, { sourceId: 'b', status: 'stale', total: 6084, matched: 2, inspected: 1, resolved: 1, excluded: 0, uninspected: 1, inspectionBudget: 24 }, { sourceId: 'c', status: 'failed', total: null, matched: null, inspected: null, resolved: null, excluded: null, uninspected: null, inspectionBudget: 24 }], coverage: { matched: 3, inspected: 2, resolved: 2, excluded: 0, uninspected: 1, returned: 1, inspectionBudget: 24 } } };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind(); const rendered = await renderWorkbench(controller.getSnapshot());
  assert.match(rendered.text, /使用缓存/); assert.match(rendered.text, /使用过期缓存/); assert.match(rendered.text, /读取失败/); assert.match(rendered.text, /2026-10-19T01:00:00Z/);
  assert.doesNotMatch(rendered.text, /12168|12,168/); assert.match(rendered.text, /未记录|未确认/); controller.close();
});

test('each recorded candidate offers only an explicit local author-feedback draft download', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind(); const rendered = await renderWorkbench(controller.getSnapshot());
  assert.ok(rendered.nodes.some(node => node.type === 'button' && node.children.includes('导出给作者的反馈草稿')));
  assert.match(rendered.text, /请填写场景摘要并核对后自行分享/);
  assert.doesNotMatch(rendered.text, /自动发送给作者|作者后台已同步/); controller.close();
});

test('clicking the author-feedback draft button downloads redacted Markdown and never sends it', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow();
  const backup = { format: 'plugin-finder-task', version: 1, task: { id: workflow.taskId, originalRequest: 'PRIVATE ORIGINAL /Users/private/material.md', revisions: [{ id: workflow.revisionId, number: 1, createdAt: '2026-10-20T12:00:00Z', workflow: { plan: fixturePlan(), candidates: [candidate] } }], feedback: [{ revisionId: workflow.revisionId, outcome: 'blocked', note: 'PRIVATE FEEDBACK' }], handoffs: [{ sessionId: 'private-session-id' }] } };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }), export: async () => ({ ok: true, json: async () => backup }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind(); const snapshot = controller.getSnapshot(); controller.close();
  let downloaded; const clicked = [];
  class LocalURL extends URL { static createObjectURL(blob) { downloaded = blob; return 'blob:local-only'; } static revokeObjectURL() {} }
  const document = { head: { appendChild() {} }, body: { appendChild() {} }, createElement: tag => tag === 'a' ? { click() { clicked.push({ href: this.href, download: this.download }); }, remove() {} } : { dataset: {}, remove() {} } };
  const rendered = await renderWorkbench(snapshot, { runEffects: true, keepAlive: true, fetch: api.fetch, URL: LocalURL, Blob, document });
  await new Promise(resolve => setTimeout(resolve, 0));
  const action = rendered.nodes.find(node => node.type === 'button' && node.children.includes('导出给作者的反馈草稿')); assert.ok(action);
  await action.props.onClick(); assert.ok(downloaded); const content = await downloaded.text();
  assert.equal(downloaded.type, 'text/markdown;charset=utf-8'); assert.ok(clicked[0].download.endsWith('.md')); assert.match(content, /填写可分享/); assert.match(content, /任务自报未完成/);
  for (const secret of ['PRIVATE ORIGINAL', 'PRIVATE FEEDBACK', '/Users/private', 'private-task-id', 'private-session-id']) assert.equal(content.includes(secret), false, secret);
  assert.ok(api.calls.every(call => /^\/api\/plugin_finder\/(bootstrap|export)$/.test(call.url))); rendered.dispose();
});

const telemetryStatus = (patch = {}) => ({ enabled: false, consent: 'unasked', policyVersion: '2026-10-20-v1', endpoint: 'https://feedback.example.com/v1', queued: 0, delivered: 0, lastSyncedAt: null, lastError: null, deletionPending: false, deleteConfirmed: false, lastDeletedAt: null, hasRemoteRegistration: false, ...patch });

test('unasked consent is opt-in and bootstrap does not register, upload, poll or change the workflow', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow(); const status = telemetryStatus();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), telemetry: status }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  const home = await renderWorkbench(controller.getSnapshot());
  assert.equal(home.nodes.some(node => node.props?.className === 'pf_telemetry'), false);
  assert.ok(home.nodes.some(node => node.type === 'button' && node.children.includes('回传设置')));
  controller.showFind(); assert.equal((await renderWorkbench(controller.getSnapshot())).nodes.some(node => node.props?.className === 'pf_telemetry'), false); controller.openTelemetrySettings(); const rendered = await renderWorkbench(controller.getSnapshot());
  assert.deepEqual(copy(controller.getSnapshot().telemetry), status); assert.match(rendered.text, /同意并自动回传/); assert.match(rendered.text, /暂不同意/);
  assert.match(rendered.text, /摘要/); assert.match(rendered.text, /集中/); assert.match(rendered.text, /不倒灌|不补传/); assert.match(rendered.text, /文件|完整会话/);
  const settings = rendered.nodes.find(node => node.type === 'details' && node.props.className === 'pf_telemetry');
  assert.ok(settings); assert.equal(settings.props.open, true, 'consent settings appear only after the explicit action');
  assert.ok(rendered.nodes.some(node => node.type === 'button' && node.children.includes('回传设置')));
  assert.match(rendered.text, /无法保证识别所有敏感内容/); assert.match(rendered.text, /关联需求.*方案.*摘要/);
  assert.equal(rendered.nodes.some(node => node.type === 'input' && node.props.type === 'checkbox' && (node.props.checked || node.props.defaultChecked)), false);
  assert.deepEqual(api.calls.map(call => call.url), ['/api/plugin_finder/bootstrap']); assert.equal(controller.getSnapshot().taskId, workflow.taskId); controller.close();
});

test('first unasked feedback may show one optional settings entry without collecting the saved record', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow(); const status = telemetryStatus();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), telemetry: status }) }), feedback: async () => ({ ok: true, json: async () => ({ saved: true, ...historyEnvelope(workflow), telemetry: status }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind();
  assert.equal(controller.getSnapshot().telemetrySuggestionVisible, false);
  assert.equal(await controller.saveFeedback('partial', '真实反馈'), true);
  assert.equal(controller.getSnapshot().telemetry.enabled, false); assert.equal(controller.getSnapshot().telemetrySuggestionVisible, true);
  const rendered = await renderWorkbench(controller.getSnapshot());
  assert.match(rendered.text, /可选：允许自动回传后续反馈摘要/); assert.match(rendered.text, /本次已保存的记录不会追溯上传/);
  assert.ok(rendered.nodes.some(node => node.type === 'button' && node.children.includes('查看可选回传设置')));
  assert.equal(rendered.nodes.some(node => node.type === 'details' && node.props.className === 'pf_telemetry'), false);
  controller.openTelemetrySettings(); assert.equal(controller.getSnapshot().telemetrySettingsOpen, true);
  assert.equal(controller.getSnapshot().telemetry.enabled, false); assert.equal(controller.getSnapshot().telemetrySuggestionVisible, false);
  assert.equal((await renderWorkbench(controller.getSnapshot())).nodes.find(node => node.type === 'details' && node.props.className === 'pf_telemetry').props.open, true);
  controller.setTelemetrySettingsOpen(false); await controller.saveFeedback('partial', '另一条反馈');
  assert.equal(controller.getSnapshot().telemetrySuggestionVisible, false, 'the lightweight suggestion appears at most once per plugin lifetime');
  assert.ok(api.calls.every(call => !/telemetry-consent|telemetry-delete|telemetry-status/.test(call.url)));
  assert.equal(api.calls.filter(call => call.url.endsWith('/feedback')).length, 2); controller.close();
});

test('declined consent is not re-prompted after feedback', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow(); const status = telemetryStatus({ consent: 'declined' });
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), telemetry: status }) }), feedback: async () => ({ ok: true, json: async () => ({ saved: true, ...historyEnvelope(workflow), telemetry: status }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); await controller.saveFeedback('complete', '完成');
  assert.equal(controller.getSnapshot().telemetrySuggestionVisible, false); assert.equal(controller.getSnapshot().telemetrySettingsOpen, false);
  assert.doesNotMatch((await renderWorkbench(controller.getSnapshot())).text, /可选：允许自动回传后续反馈摘要/); controller.close();
});

test('only explicit consent actions send the displayed policy version and declined feedback stays local', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow(); let status = telemetryStatus();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), telemetry: status }) }), 'telemetry-consent': async options => { const body = JSON.parse(options.body); status = telemetryStatus({ enabled: body.enabled, consent: body.enabled ? 'accepted' : 'declined', hasRemoteRegistration: body.enabled }); return { ok: true, json: async () => status }; } });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  assert.equal(await controller.setTelemetryConsent(true), true); assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), { enabled: true, policyVersion: '2026-10-20-v1' }); assert.equal(controller.getSnapshot().telemetry.enabled, true);
  assert.equal(await controller.setTelemetryConsent(false), true); assert.equal(controller.getSnapshot().telemetry.consent, 'declined'); await controller.saveFeedback('partial', '实际结果'); assert.match(controller.getSnapshot().notice, /只保存在本机|仅保存在本机/);
  assert.equal(controller.getSnapshot().taskId, workflow.taskId); controller.close();
});

test('enabled feedback reports pending automatic sync instead of claiming a network receipt', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow(); const status = telemetryStatus({ enabled: true, consent: 'accepted', hasRemoteRegistration: true, queued: 1, lastError: '网络暂不可用' });
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), telemetry: status }) }), feedback: async () => ({ ok: true, json: async () => ({ saved: true, ...historyEnvelope(workflow), telemetry: status }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind(); await controller.saveFeedback('partial', '只在模型摘要里清理');
  assert.match(controller.getSnapshot().notice, /自动同步|等待同步/); assert.doesNotMatch(controller.getSnapshot().notice, /已回传|已送达|同步完成/);
  controller.openTelemetrySettings(); const rendered = await renderWorkbench(controller.getSnapshot()); assert.match(rendered.text, /网络暂不可用/); assert.match(rendered.text, /停止回传/); controller.close();
});

test('status refresh is manual and deletion pending never renders a completed deletion', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow(); let status = telemetryStatus({ enabled: true, consent: 'accepted', hasRemoteRegistration: true, queued: 2, delivered: 4 });
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), telemetry: status }) }), 'telemetry-delete': async () => { status = telemetryStatus({ consent: 'declined', delivered: 4, deletionPending: true, lastError: '离线，删除待处理', hasRemoteRegistration: true }); return { ok: true, json: async () => status }; }, 'telemetry-status': async () => ({ ok: true, json: async () => status }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.showFind(); assert.equal(await controller.deleteTelemetry(), true);
  assert.equal(controller.getSnapshot().telemetry.enabled, false); assert.equal(controller.getSnapshot().telemetry.deletionPending, true); assert.match(controller.getSnapshot().notice, /待处理|尚未确认/); assert.doesNotMatch(controller.getSnapshot().notice, /删除完成|已删除全部/);
  assert.equal(api.calls.some(call => call.url.endsWith('telemetry-status')), false); await controller.refreshTelemetry(); assert.equal(api.calls.at(-1).options.method, 'GET'); assert.equal(api.calls.filter(call => call.url.endsWith('telemetry-status')).length, 1);
  controller.openTelemetrySettings(); const rendered = await renderWorkbench(controller.getSnapshot()); assert.match(rendered.text, /删除待处理|删除申请.*待处理/); controller.close();
});

test('plan selection is durably recorded before a native handoff and selection failure blocks Host side effects', async () => {
  const { module } = await loadClient();
  for (const fail of [true, false]) {
    const events = []; const h = host({ connect: async () => { events.push('connect'); return 'session-a'; } }); const workflow = identifiedWorkflow();
    const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }), 'select-plan': async options => { events.push('select-plan'); assert.deepEqual(JSON.parse(options.body), { taskId: workflow.taskId, revisionId: workflow.revisionId }); return fail ? { ok: false, json: async () => ({ error: { message: '所选方案尚未保存，请重试。' } }) } : { ok: true, json: async () => ({ saved: true, ...historyEnvelope(workflow) }) }; }, handoff: async () => ({ ok: true, json: async () => historyEnvelope({ ...workflow, handoff: { ...workflow, workspaceId: 'workspace-a', sessionId: 'session-a', status: 'applied' } }) }) });
    const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); controller.selectWorkspace('workspace-a');
    assert.equal(await controller.handoff(), !fail); assert.deepEqual(events, fail ? ['select-plan'] : ['select-plan', 'connect']); assert.equal(h.drafts.length, fail ? 0 : 1); assert.equal(controller.getSnapshot().taskId, workflow.taskId); controller.close();
  }
});

test('missing or failed consent cannot enable collection or overwrite the current task', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow(); let includeStatus = false;
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), ...(includeStatus ? { telemetry: telemetryStatus() } : {}) }) }), 'telemetry-consent': async () => ({ ok: false, json: async () => ({ error: { message: '同意设置尚未保存，请重试。' } }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); assert.equal(await controller.setTelemetryConsent(true), false);
  assert.equal(api.calls.some(call => call.url.endsWith('telemetry-consent')), false);
  includeStatus = true; await controller.bootstrap(); assert.equal(await controller.setTelemetryConsent(true), false);
  assert.equal(controller.getSnapshot().telemetry.enabled, false); assert.equal(controller.getSnapshot().telemetry.consent, 'unasked'); assert.equal(controller.getSnapshot().taskId, workflow.taskId); assert.match(controller.getSnapshot().error, /尚未保存/); controller.close();
});

test('deletion is complete only with explicit confirmation and never inferred from no pending work', async () => {
  const { module } = await loadClient();
  for (const confirmed of [false, true]) {
    const h = host(); const workflow = identifiedWorkflow(); const before = telemetryStatus({ enabled: true, consent: 'accepted', hasRemoteRegistration: true, delivered: 2 });
    const after = telemetryStatus({ consent: 'declined', deleteConfirmed: confirmed, lastDeletedAt: confirmed ? '2026-10-20T18:00:00Z' : null });
    const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), telemetry: before }) }), 'telemetry-delete': async () => ({ ok: true, json: async () => after }) });
    const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); await controller.deleteTelemetry();
    if (confirmed) assert.match(controller.getSnapshot().notice, /服务端已明确确认删除/); else { assert.match(controller.getSnapshot().notice, /尚未确认/); assert.doesNotMatch(controller.getSnapshot().notice, /已明确确认删除/); }
    assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), {}); assert.equal(controller.getSnapshot().taskId, workflow.taskId); controller.close();
  }
});

test('a successful local feedback with queue failure visibly reports unconfirmed enqueue instead of waiting for sync', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow(); const telemetry = telemetryStatus({ enabled: true, consent: 'accepted', queued: 0, delivered: 0 });
  const warning = '本机功能正常，本次集中记录未能保存，请稍后重试。';
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), telemetry }) }), feedback: async () => ({ ok: true, json: async () => ({ saved: true, ...historyEnvelope(workflow), telemetry, telemetryWarning: warning }) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap(); assert.equal(await controller.saveFeedback('partial', '真实反馈'), true);
  const state = controller.getSnapshot(); assert.equal(state.feedbackSaved, true); assert.equal(state.taskId, workflow.taskId); assert.match(state.notice, /本机/); assert.match(state.notice, /未能确认入队|未能保存/); assert.doesNotMatch(state.notice, /将按.*自动同步|等待自动同步/);
  const rendered = await renderWorkbench(state); assert.ok(rendered.text.includes(warning)); assert.match(rendered.text, /集中同步异常|集中记录未能/); controller.close();
});

const creationFixture = () => ({ version: 1, source: { taskId: 'task-a', revisionId: 'task-a-revision-1' }, trigger: { kind: 'user-customization', reason: '定制专用面板' }, strategy: 'new', reuseAssessment: '现成插件可参考，定制保留本地工作流。', candidateDecisions: [{ pluginId: 'data', decision: 'reuse', reason: '可先用现成分析功能' }], questions: [{ id: 'view', question: '需要哪种视图？', options: ['列表', '卡片'], reason: '影响首版界面' }], answers: [], assumptions: ['手动录入'], blueprint: Object.fromEntries(['name', 'purpose', 'workflow', 'inputs', 'outputs', 'ui', 'data', 'tools', 'runtime', 'scope', 'acceptance'].map(k => [k, '合成蓝图 ' + k])), status: 'draft', supply: { status: 'current', intentHash: 'intent', searchedAt: '2026-10-22' }, contentHash: 'hash-a', draft: '请使用官方 Creator 创建合成插件。' });
const creationWorkflow = () => ({ ...identifiedWorkflow(), localOnly: true, creation: creationFixture(), creatorAttempts: [], creatorHandoff: null });

test('co-creation start is explicit customization and preserves ordinary history', async () => {
  const { module } = await loadClient(); const h = host(); let workflow = identifiedWorkflow();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }), 'creation-start': async options => { assert.equal(JSON.parse(options.body).trigger, 'user-customization'); workflow = creationWorkflow(); return { ok: true, json: async () => historyEnvelope(workflow) }; } });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch }); await c.bootstrap(); await c.startCreation();
  assert.equal(c.getSnapshot().creation.status, 'draft'); assert.equal(c.getSnapshot().view, 'create'); assert.equal(c.getSnapshot().feedback.length, 1);
  const rendered = await renderWorkbench(c.getSnapshot()); assert.match(rendered.visibleText, /创建自己的插件/); assert.match(rendered.visibleText, /开始创建/); assert.match(rendered.visibleText, /需要哪种视图/);
  assert.doesNotMatch(rendered.visibleText, /确认蓝图并核对供给|复制|交接|Creator/);
  assert.equal(rendered.visibleNodes.find(node => node.type === 'button' && node.children.includes('开始创建')).props.disabled, true, 'a genuinely unanswered required question blocks execution');
  assert.equal(rendered.visibleNodes.some(node => node.type === 'select' && node.props['aria-label'] === 'Creator 工作区'), false); assert.match(rendered.text, /本机/);
  assert.equal(h.connected.length, 0); assert.equal(h.drafts.length, 0); c.close();
});

test('editable creation draft survives navigation and saving appends a revision', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = creationWorkflow(); let sent;
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }), 'creation-update': async options => { sent = JSON.parse(options.body); return { ok: true, json: async () => historyEnvelope({ ...workflow, revisionId: 'task-a-revision-2', creation: { ...workflow.creation, blueprint: sent.blueprint } }) }; } });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch }); await c.bootstrap(); c.editCreation({ blueprint: { name: '专用工作台' } }); c.showFind(); c.showCreation();
  assert.equal(c.getSnapshot().creationForm.blueprint.name, '专用工作台'); assert.equal(c.getSnapshot().creationDirty, true);
  assert.equal(await c.updateCreation(), true); assert.equal(sent.blueprint.name, '专用工作台'); assert.equal(sent.confirm, false); assert.equal(c.getSnapshot().revisionId, 'task-a-revision-2'); assert.equal(c.getSnapshot().creationDirty, false); c.close();
});

test('Creator handoff refuses unconfirmed and edited blueprints without claiming', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = creationWorkflow();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow) }) }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch }); await c.bootstrap(); c.selectWorkspace('workspace-a');
  assert.equal(await c.creatorHandoff(), false); assert.equal(api.calls.filter(x => x.url.endsWith('creator-claim')).length, 0); assert.match(c.getSnapshot().error, /确认/); c.close();
});

test('co-creation feedback stays local even when ordinary telemetry is enabled', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = creationWorkflow();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), telemetry: { enabled: true, consent: 'accepted', policyVersion: 'v1' } }) }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch }); await c.bootstrap(); await c.saveFeedback('partial', '合成反馈');
  assert.match(c.getSnapshot().notice, /本机/); assert.doesNotMatch(c.getSnapshot().notice, /自动同步/); assert.equal(c.getSnapshot().telemetrySuggestionVisible, false); c.close();
});

const readyCreationWorkflow = () => { const w = creationWorkflow(); w.creation.status = 'ready'; w.creation.questions = []; return w; };
const readyBootstrap = workflow => ({ ...restoredBootstrap(workflow), ...historyEnvelope(workflow), hostVersion: '0.2.1-rc.2' });

test('ready blueprint uses official Creator claim and saves exact source before draft navigation', async () => {
  const { module } = await loadClient(); const h = host({ creator: true }); let workflow = readyCreationWorkflow(); let attempt;
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => readyBootstrap(workflow) }), 'creator-claim': async options => { attempt = { ...JSON.parse(options.body), attemptId: 'attempt-a', status: 'creating', purpose: 'creator' }; return { ok: true, json: async () => ({ ...historyEnvelope(workflow), claim: 'acquired', attempt }) }; }, 'creator-record': async options => { attempt = { ...attempt, ...JSON.parse(options.body) }; workflow = { ...workflow, creatorAttempts: [attempt], creatorHandoff: attempt }; return { ok: true, json: async () => ({ ...historyEnvelope(workflow), saved: true, attempt }) }; } });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch }); await c.bootstrap(); c.selectWorkspace('workspace-a'); assert.equal(await c.creatorHandoff(), true);
  assert.deepEqual(copy(h.created), [{ workspaceId: 'workspace-a', agentPreset: 'cordis' }]); assert.equal(h.connected.length, 0); assert.equal(h.drafts.length, 1); assert.equal(h.drafts[0].draft.clearPreviousDraft, false); assert.deepEqual(h.opened, ['session-a']); assert.equal(c.getSnapshot().creatorHandoff.status, 'applied'); c.close();
});

test('late Creator save recovery survives close and can save while server active revision differs', async () => {
  const { module } = await loadClient(); let resolveCreate; const h = host({ creator: true, create: () => new Promise(resolve => { resolveCreate = resolve; }) }); const workflow = readyCreationWorkflow(); let attempt, fail = true;
  const map = new Map(); const draftStorage = { getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => readyBootstrap(workflow) }), 'creator-claim': async options => { attempt = { ...JSON.parse(options.body), attemptId: 'attempt-late', status: 'creating', purpose: 'creator' }; workflow.creatorAttempts = [attempt]; return { ok: true, json: async () => ({ ...historyEnvelope(workflow), claim: 'acquired', attempt }) }; }, 'creator-record': async options => { if (fail) throw new Error('offline'); attempt = { ...attempt, ...JSON.parse(options.body) }; return { ok: true, json: async () => ({ ...historyEnvelope(identifiedWorkflow('task-other')), saved: true, attempt }) }; } });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage }); await c.bootstrap(); c.selectWorkspace('workspace-a'); const pending = c.creatorHandoff();
  while (!resolveCreate) await new Promise(resolve => setTimeout(resolve, 0)); c.cancel(); assert.equal(await pending, false); c.close(); resolveCreate('session-a');
  for (let i = 0; i < 30 && !map.has('dsh.plugin-finder.creator-recovery.attempt-late'); i++) await new Promise(resolve => setTimeout(resolve, 1));
  const restored = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage }); await restored.bootstrap(); assert.equal(restored.getSnapshot().pendingCreatorRecord.sessionId, 'session-a'); fail = false;
  assert.equal(await restored.retryCreatorSave(), true); assert.equal(restored.getSnapshot().taskId, 'task-a'); assert.equal(restored.getSnapshot().pendingCreatorRecord, null); assert.equal(h.created.length, 1); assert.equal(h.drafts.length, 0); restored.close();
});

test('two open windows preserve separate Creator recovery records', async () => {
  const { module } = await loadClient(); const map = new Map(); const draftStorage = { getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
  const make = async suffix => {
    const workflow = readyCreationWorkflow(); workflow.taskId = 'task-' + suffix; workflow.revisionId = 'revision-' + suffix; const h = host({ creator: true });
    const api = server({ bootstrap: async () => ({ ok: true, json: async () => readyBootstrap(workflow) }), 'creator-claim': async options => ({ ok: true, json: async () => ({ ...historyEnvelope(workflow), claim: 'acquired', attempt: { ...JSON.parse(options.body), attemptId: 'attempt-' + suffix, status: 'creating' } }) }), 'creator-record': async () => { throw new Error('offline'); } });
    const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage }); await c.bootstrap(); c.selectWorkspace('workspace-a'); return c;
  };
  const a = await make('a'), b = await make('b'); await a.creatorHandoff(); await b.creatorHandoff();
  const records = [...map.values()].map(value => JSON.parse(value));
  assert.ok(records.some(record => record.attemptId === 'attempt-a')); assert.ok(records.some(record => record.attemptId === 'attempt-b')); a.close(); b.close();
});

test('save-only recovery accepts the same session already settled by server', async () => {
  const { module } = await loadClient(); const workflow = readyCreationWorkflow(); let fail = true, attempt;
  const h = host({ creator: true }); const api = server({ bootstrap: async () => ({ ok: true, json: async () => readyBootstrap(workflow) }), 'creator-claim': async options => { attempt = { ...JSON.parse(options.body), attemptId: 'attempt-settled', status: 'creating' }; return { ok: true, json: async () => ({ ...historyEnvelope(workflow), claim: 'acquired', attempt }) }; }, 'creator-record': async options => { if (fail) throw new Error('offline'); return { ok: true, json: async () => ({ saved: true, attempt: { ...attempt, ...JSON.parse(options.body), status: 'applied' } }) }; } });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch }); await c.bootstrap(); c.selectWorkspace('workspace-a'); await c.creatorHandoff(); assert.equal(c.getSnapshot().pendingCreatorRecord.status, 'created'); fail = false;
  assert.equal(await c.retryCreatorSave(), true); assert.equal(c.getSnapshot().pendingCreatorRecord, null); assert.equal(h.drafts.length, 0); assert.equal(h.created.length, 1); c.close();
});

test('saving one Creator recovery keeps the next workspace recovery available until both are saved', async () => {
  const { module } = await loadClient(); const h = host({ creator: true }); const workflow = readyCreationWorkflow();
  const records = ['a', 'b'].map(suffix => ({ taskId: workflow.taskId, revisionId: workflow.revisionId, contentHash: workflow.creation.contentHash, workspaceId: 'workspace-' + suffix, attemptId: 'attempt-' + suffix, sessionId: 'session-' + suffix, status: 'created' }));
  workflow.creatorAttempts = records.map(({ sessionId, ...record }) => ({ ...record, status: 'creating' }));
  const map = new Map(records.map(record => ['dsh.plugin-finder.creator-recovery.' + record.attemptId, JSON.stringify(record)]));
  const draftStorage = { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  const saved = [];
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => readyBootstrap(workflow) }), 'creator-record': async options => {
    const attempt = JSON.parse(options.body); saved.push(attempt);
    workflow.creatorAttempts = workflow.creatorAttempts.map(item => item.attemptId === attempt.attemptId ? attempt : item);
    return { ok: true, json: async () => ({ ...historyEnvelope(workflow), saved: true, attempt }) };
  } });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage });
  try {
    await c.bootstrap(); assert.equal(c.getSnapshot().pendingCreatorRecord.attemptId, 'attempt-a');
    assert.equal(await c.retryCreatorSave(), true);
    assert.equal(c.getSnapshot().pendingCreatorRecord?.attemptId, 'attempt-b');
    assert.equal(map.has('dsh.plugin-finder.creator-recovery.attempt-a'), false);
    assert.equal(map.has('dsh.plugin-finder.creator-recovery.attempt-b'), true);
    assert.equal(await c.retryCreatorSave(), true);
    assert.equal(c.getSnapshot().pendingCreatorRecord, null); assert.equal(map.size, 0);
    assert.deepEqual(saved, records); assert.equal(h.created.length, 0); assert.equal(h.drafts.length, 0);
  } finally { c.close(); }
});


test('editing accumulated constraints retains more than six accepted restrictions', async () => {
  const { module } = await loadClient(); const h = host(); const api = server(); const c = module.createFinderController(h.ctx, { fetch: api.fetch }); await c.bootstrap(); await c.analyze('合成约束编辑');
  const constraints = Array.from({ length: 12 }, (_, i) => '明确限制' + i); c.editIntent({ constraints }); assert.deepEqual(copy(c.getSnapshot().intent.constraints), constraints); c.close();
});

test('featured browsing preserves the active task and makes no extra request or draft write', async () => {
  const { module } = await loadClient(); const h = host();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(savedWorkflow('plan')) }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch }); await c.bootstrap();
  const before = copy(c.getSnapshot());
  assert.equal(typeof c.showFeatured, 'function'); c.showFeatured('agent-twin');
  assert.equal(c.getSnapshot().view, 'featured'); assert.equal(c.getSnapshot().featuredId, 'agent-twin');
  assert.equal(c.getSnapshot().taskId, before.taskId); assert.deepEqual(copy(c.getSnapshot().plan), before.plan);
  assert.equal(api.calls.length, 1); assert.equal(h.drafts.length, 0); c.close();
});

test('featured preferences persist locally without requests and dismissed recommendations can be restored', async () => {
  const { module } = await loadClient(); const h = host(); const api = server(); const values = new Map();
  const draftStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage });
  assert.equal(typeof c.toggleFeaturedInterest, 'function'); c.toggleFeaturedInterest('projects'); c.dismissFeatured('dsh-dot');
  assert.deepEqual(copy(c.getSnapshot().featuredPreferences), { version: 1, interests: ['projects'], dismissed: ['dsh-dot'] });
  assert.equal(api.calls.length, 0); c.close();
  const again = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage });
  assert.deepEqual(copy(again.getSnapshot().featuredPreferences.interests), ['projects']);
  again.restoreFeatured(); assert.deepEqual(copy(again.getSnapshot().featuredPreferences.dismissed), []); again.close();
});

test('a featured scenario keeps active work until reset is acknowledged and retries the same scenario', async () => {
  const { module } = await loadClient(); const h = host(); let fail = true; const values = new Map();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(identifiedWorkflow()) }), reset: async () => fail ? { ok: false, json: async () => ({ error: { message: '保存失败' } }) } : { ok: true, json: async () => ({ cleared: true }) } });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: { getItem: key => values.get(key), setItem: (key,value) => values.set(key,value) } }); await c.bootstrap();
  assert.equal(typeof c.tryFeatured, 'function'); assert.equal(await c.tryFeatured('agent-twin'), false);
  assert.equal(c.getSnapshot().taskId, 'task-a'); assert.deepEqual(copy(c.getSnapshot().plan), fixturePlan());
  fail = false; assert.equal(await c.retryReset(), true);
  assert.equal(c.getSnapshot().stage, 'describe'); assert.equal(c.getSnapshot().taskId, null); assert.ok(c.getSnapshot().request.length > 20);
  assert.equal(api.calls.filter(x => /analyze|recommend|creator/.test(x.url)).length, 0); assert.equal(h.drafts.length,0); c.close();
});

test('featured scenario preserves typed input across controller recreation and restores it', async () => {
  const { module } = await loadClient(); const h = host(); const api = server(); const values = new Map();
  const draftStorage = { getItem: key => values.get(key), setItem: (key,value) => values.set(key,value) };
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage }); c.setRequest('这段尚未提交的私人需求必须保留');
  assert.equal(typeof c.tryFeatured, 'function'); assert.equal(await c.tryFeatured('family-assistant'), true);
  const id = c.getSnapshot().featuredDrafts.find(x => x.request === '这段尚未提交的私人需求必须保留').id; c.close();
  const again = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage });
  assert.equal(await again.restoreFeaturedDraft(id), true); assert.equal(again.getSnapshot().request, '这段尚未提交的私人需求必须保留');
  assert.equal(api.calls.filter(x => /analyze|recommend|creator/.test(x.url)).length,0); again.close();
});

test('featured scene rejects missing catalog ids and warns when preferences cannot persist', async () => {
  const { module } = await loadClient(); const h = host(); const api = server();
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: { getItem(){return null;}, setItem(){throw Error('disk');} } });
  assert.equal(typeof c.tryFeatured, 'function'); assert.equal(await c.tryFeatured('not-a-product'), false); assert.equal(api.calls.length, 0);
  c.toggleFeaturedInterest('family'); assert.deepEqual(copy(c.getSnapshot().featuredPreferences.interests),['family']); assert.match(c.getSnapshot().featuredWarning,/本次|当前窗口/); c.close();
});

test('featured cards are browsable without a model and preview entries have no install action', async () => {
  const { module } = await loadClient(); const h = host(); const c = module.createFinderController(h.ctx, { fetch: server().fetch });
  assert.equal(typeof c.showFeatured, 'function'); c.showFeatured('family-assistant');
  const rendered = await renderWorkbench(c.getSnapshot());
  assert.match(rendered.text,/微信家庭|家人/); assert.match(rendered.text,/预览/);
  assert.ok(!rendered.nodes.some(n=>n.type==='button' && String(n.children).includes('复制安装来源')));
  assert.ok(rendered.nodes.some(n=>n.type==='button' && String(n.children).includes('试试这个场景') && !n.props.disabled)); c.close();
});

test('featured switching blocks on draft storage failure and keeps edited understanding', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(a) }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: { getItem(){return null;}, setItem(){throw Error('disk');} } }); await c.bootstrap(); c.editIntent({goal:'尚未保存的新目标'});
  assert.equal(await c.tryFeatured('agent-twin'), false); assert.equal(c.getSnapshot().intent.goal,'尚未保存的新目标'); assert.equal(c.getSnapshot().taskId,a.taskId); assert.equal(api.calls.length,1); assert.match(c.getSnapshot().error,/尚未可靠保存/); c.close();
});

test('featured draft restores exact task and unsaved understanding after recreation', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow(); const values=new Map(); const draftStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const api=server({bootstrap:async()=>({ok:true,json:async()=>restoredBootstrap(a)}),open:async()=>({ok:true,json:async()=>historyEnvelope(a)})});
  const c=module.createFinderController(h.ctx,{fetch:api.fetch,draftStorage}); await c.bootstrap(); c.editIntent({goal:'仅在当前编辑里的目标',constraints:['不要发送任何内容']}); await c.tryFeatured('agent-twin'); const id=c.getSnapshot().featuredDrafts[0].id;c.close();
  const again=module.createFinderController(h.ctx,{fetch:api.fetch,draftStorage}); assert.equal(await again.restoreFeaturedDraft(id),true); assert.equal(again.getSnapshot().taskId,a.taskId); assert.equal(again.getSnapshot().intent.goal,'仅在当前编辑里的目标');assert.equal(again.getSnapshot().plan,null);assert.equal(again.getSnapshot().stage,'understand');assert.deepEqual(copy(again.getSnapshot().intent.constraints),['不要发送任何内容']); again.close();
});

test('featured draft restores edited blueprint without overwriting saved server revision', async()=>{
  const {module}=await loadClient();const h=host();const a={...identifiedWorkflow(),creation:creationFixture()};const values=new Map();const draftStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const api=server({bootstrap:async()=>({ok:true,json:async()=>restoredBootstrap(a)}),open:async()=>({ok:true,json:async()=>historyEnvelope(a)})});
  const c=module.createFinderController(h.ctx,{fetch:api.fetch,draftStorage});await c.bootstrap();c.editCreation({blueprint:{name:'保留未保存的蓝图名字'}});await c.tryFeatured('family-assistant');const id=c.getSnapshot().featuredDrafts[0].id;c.close();
  const again=module.createFinderController(h.ctx,{fetch:api.fetch,draftStorage});await again.restoreFeaturedDraft(id);assert.equal(again.getSnapshot().creationForm.blueprint.name,'保留未保存的蓝图名字');assert.equal(again.getSnapshot().creationDirty,true);assert.notEqual(again.getSnapshot().creation.blueprint.name,'保留未保存的蓝图名字');assert.equal(api.calls.some(x=>x.url.includes('creation-update')),false);again.close();
});

test('featured retry does not replace input typed after failed reset',async()=>{
  const {module}=await loadClient();const h=host();let fail=true;const values=new Map();const api=server({reset:async()=>fail?{ok:false,json:async()=>({error:{message:'失败'}})}:{ok:true,json:async()=>({cleared:true})}});
  const c=module.createFinderController(h.ctx,{fetch:api.fetch,draftStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});c.setRequest('原输入');await c.tryFeatured('family-assistant');c.setRequest('失败后重新写的输入');fail=false;await c.retryReset();assert.equal(c.getSnapshot().request,'失败后重新写的输入');assert.equal(c.getSnapshot().featuredDrafts[0].request,'原输入');c.close();
});

test('featured view chosen while bootstrap is pending remains open',async()=>{
  const {module}=await loadClient();const h=host();let done;const api=server({bootstrap:()=>new Promise(resolve=>{done=()=>resolve({ok:true,json:async()=>restoredBootstrap(identifiedWorkflow())});})});
  const c=module.createFinderController(h.ctx,{fetch:api.fetch});const pending=c.bootstrap();c.showFeatured('agent-twin');done();await pending;assert.equal(c.getSnapshot().view,'featured');assert.equal(c.getSnapshot().taskId,'task-a');c.close();
});

test('featured retry preserves understanding and blueprint edits made after reset failure',async()=>{
  const {module}=await loadClient();
  for(const kind of ['intent','blueprint']){
    const h=host();const a={...identifiedWorkflow(),...(kind==='blueprint'?{creation:creationFixture()}:{})};let fail=true;const values=new Map();
    const api=server({open:async()=>({ok:true,json:async()=>historyEnvelope(a)}),bootstrap:async()=>({ok:true,json:async()=>restoredBootstrap(a)}),reset:async()=>fail?{ok:false,json:async()=>({error:{message:'失败'}})}:{ok:true,json:async()=>({cleared:true})}});
    const c=module.createFinderController(h.ctx,{fetch:api.fetch,draftStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});await c.bootstrap();await c.tryFeatured('agent-twin');
    if(kind==='intent')c.editIntent({goal:'失败后修改的理解'});else c.editCreation({blueprint:{name:'失败后修改的蓝图'}});
    fail=false;await c.retryReset();assert.equal(c.getSnapshot().taskId,a.taskId);
    assert.equal(kind==='intent'?c.getSnapshot().intent?.goal:c.getSnapshot().creationForm?.blueprint.name,kind==='intent'?'失败后修改的理解':'失败后修改的蓝图');c.close();
  }
});

test('featured corrupted editor data stays untouched and cannot crash restoration or rendering',async()=>{
 const {module}=await loadClient();const h=host();const key='dsh.plugin-finder.featured-drafts.v1';
 for(const form of [{blueprint:{name:'bad'},answers:[null],assumptions:[1]},{blueprint:creationFixture().blueprint,answers:[{id:'view',answer:5}],assumptions:[]}]){
  const raw=JSON.stringify([{id:'bad',createdAt:'2026-10-22',request:'损坏草稿',stage:'plan',taskId:'task-a',revisionId:'task-a-revision-1',editor:{contentHash:'hash-a',form}}]);const values=new Map([[key,raw]]);const api=server();
  const c=module.createFinderController(h.ctx,{fetch:api.fetch,draftStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});assert.equal(c.getSnapshot().featuredDrafts.length,0);assert.match(c.getSnapshot().featuredWarning,/无法读取/);assert.equal(await c.restoreFeaturedDraft('bad'),false);assert.equal(values.get(key),raw);c.showFeatured();await renderWorkbench(c.getSnapshot());c.close();
 }
});

function memoryStorage() { const values = new Map(); return { values, getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }; }
test('single flow opens home even with a saved creation and keeps new input separate across browsing and reload', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = creationWorkflow(); const storage = memoryStorage();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(workflow) }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await c.bootstrap();
  assert.equal(c.getSnapshot().view, 'home'); c.setHomeRequest('准备查找的另一件事'); c.editCreation({ blueprint: { name: '原蓝图未保存编辑' } });
  c.showFeatured('agent-twin'); c.showHome();
  assert.equal(c.getSnapshot().homeRequest, '准备查找的另一件事'); assert.equal(c.getSnapshot().creationForm.blueprint.name, '原蓝图未保存编辑');
  const rendered = await renderWorkbench(c.getSnapshot());
  assert.ok(rendered.visibleNodes.some(node => node.type === 'section' && node.props?.['aria-labelledby'] === 'pfv_home_title'));
  assert.equal(rendered.visibleNodes.find(node => node.type === 'textarea' && node.props?.id === 'pfv_home_input')?.props.value, '准备查找的另一件事');
  assert.match(rendered.visibleText, /帮我找方案/); assert.match(rendered.visibleText, /精选插件/); assert.match(rendered.visibleText, /继续上次/);
  assert.equal(rendered.nodes.some(node => node.props?.className === 'pf_tabs'), false);
  assert.doesNotMatch(rendered.visibleText, /重新读取配置|首版蓝图|Creator 工作区|同意并自动回传/);
  c.close(); const again = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await again.bootstrap();
  assert.equal(again.getSnapshot().homeRequest, '准备查找的另一件事'); assert.equal(again.getSnapshot().creationForm.blueprint.name, '原蓝图未保存编辑'); again.close();
});
test('single flow searches once from home and archives existing unsaved work before resetting exact identity', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = creationWorkflow(); const storage = memoryStorage();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(workflow) }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await c.bootstrap(); c.editCreation({ blueprint: { name: '旧蓝图编辑' } }); c.setHomeRequest('检查 CSV');
  assert.equal(await c.searchHome(), true);
  assert.deepEqual(api.calls.map(x => x.url.split('/').at(-1)), ['bootstrap', 'reset', 'analyze', 'recommend']);
  assert.deepEqual(JSON.parse(api.calls[1].options.body), { taskId: workflow.taskId, revisionId: workflow.revisionId });
  assert.equal(c.getSnapshot().featuredDrafts[0].editor.form.blueprint.name, '旧蓝图编辑'); assert.equal(c.getSnapshot().stage, 'plan'); assert.equal(c.getSnapshot().view, 'find'); assert.equal(c.getSnapshot().homeRequest, ''); assert.equal(c.getSnapshot().searching, false); c.close();
});
test('one community action analyzes the existing home request with the selected identity and preserves blueprint edits', async () => {
  const { module } = await loadClient(); const h = host(), workflow = creationWorkflow(), storage = memoryStorage();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(workflow) }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage });
  const entry = getCommunityOverview().categories[0].previews[0];
  const originalRequest = '请只读预览当前工作区的 plugin-discovery-demo.md，显示 Mermaid 图形和数学公式，不修改原文件。';
  await c.bootstrap(); c.editCreation({ blueprint: { name: '目录切换前未保存的蓝图编辑' } }); c.setHomeRequest(originalRequest);
  const running = c.startCommunityPlugin(entry.id); assert.equal(await c.startCommunityPlugin(entry.id), false); assert.equal(await running, true);
  assert.deepEqual(api.calls.map(call => call.url.split('/').at(-1)), ['bootstrap', 'reset', 'analyze', 'recommend']);
  const analysis = JSON.parse(api.calls.find(call => call.url.endsWith('/analyze')).options.body), request = analysis.request;
  assert.equal(analysis.communityEntryId, entry.id);
  assert.equal(request, originalRequest);
  assert.doesNotMatch(request, /不要安装、运行插件|https?:|[{}]/);
  assert.ok(c.getSnapshot().featuredDrafts.some(draft => draft.request === originalRequest));
  assert.ok(c.getSnapshot().featuredDrafts.some(draft => draft.editor?.form.blueprint.name === '目录切换前未保存的蓝图编辑'));
  assert.equal(c.getSnapshot().stage, 'plan'); assert.equal(h.created.length, 0); assert.equal(h.drafts.length, 0); c.close();
});
test('community selection supplies its default request only for an empty or whitespace-only home input', async () => {
  for (const originalRequest of ['', ' \t\n ']) {
    const { module } = await loadClient(); const h = host(), api = server();
    const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: memoryStorage() });
    await c.bootstrap(); c.setHomeRequest(originalRequest);
    const entry = getCommunityOverview().categories[0].previews[0];
    assert.equal(await c.startCommunityPlugin(entry.id), true);
    const analysis = JSON.parse(api.calls.find(call => call.url.endsWith('/analyze')).options.body);
    assert.equal(analysis.request, '我想了解并使用刚选中的插件：它能帮我完成什么、需要哪些配置，以及怎样在当前工作区开始使用。');
    assert.equal(analysis.communityEntryId, entry.id); c.close();
  }
});
test('community reset failure keeps the old task and original input recoverable without calling a model', async () => {
  const { module } = await loadClient(); const h = host(), workflow = identifiedWorkflow();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(workflow) }), reset: async () => ({ ok: false, json: async () => ({ error: { message: '保存未确认' } }) }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: memoryStorage() }); await c.bootstrap(); c.setHomeRequest('仍需保留的首页输入');
  const entry = getCommunityOverview().categories[0].previews[0];
  assert.equal(await c.startCommunityPlugin(entry.id), false);
  assert.equal(c.getSnapshot().taskId, workflow.taskId); assert.deepEqual(copy(c.getSnapshot().plan), workflow.plan);
  assert.ok(c.getSnapshot().featuredDrafts.some(draft => draft.request === '仍需保留的首页输入'));
  assert.equal(c.getSnapshot().homeCommunityEntryId, entry.id); assert.equal(c.getSnapshot().homeRequest, '仍需保留的首页输入');
  assert.deepEqual(api.calls.map(call => call.url.split('/').at(-1)), ['bootstrap', 'reset']); c.close();
});
test('community selection rejects unknown IDs and blocks replacement if the original input cannot be saved', async () => {
  const { module } = await loadClient(); const h = host(), storage = memoryStorage(), api = server();
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await c.bootstrap(); c.setHomeRequest('保存失败也不能丢');
  assert.equal(await c.startCommunityPlugin('untrusted-arbitrary-plugin'), false);
  storage.setItem = () => { throw new Error('disk'); };
  assert.equal(await c.startCommunityPlugin(getCommunityOverview().categories[0].previews[0].id), false);
  assert.equal(c.getSnapshot().homeRequest, '保存失败也不能丢'); assert.equal(api.calls.length, 1); c.close();
});
test('community identity survives failed analysis, reload and draft restoration but never leaks into ordinary or featured requests', async () => {
  const { module } = await loadClient(); const h = host(), storage = memoryStorage(); let fail = true;
  const api = server({ analyze: async () => fail ? { ok: false, json: async () => ({ error: { message: '暂时未能分析' } }) } : { ok: true, json: async () => ({ intent: fixtureIntent() }) } });
  const entry = getCommunityOverview().categories[0].previews[0];
  const first = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await first.bootstrap();
  assert.equal(await first.startCommunityPlugin(entry.id), false); first.close();
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await c.bootstrap();
  assert.equal(c.getSnapshot().homeCommunityEntryId, entry.id);
  const request = c.getSnapshot().homeRequest; c.prepareHomeExample('另一个普通需求');
  const draft = c.getSnapshot().featuredDrafts.find(item => item.request === request);
  assert.equal(draft.communityEntryId, entry.id); assert.equal(c.getSnapshot().homeCommunityEntryId, null);
  assert.equal(await c.restoreFeaturedDraft(draft.id), true); assert.equal(c.getSnapshot().homeCommunityEntryId, entry.id);
  fail = false; assert.equal(await c.searchHome(), true);
  let analyses = api.calls.filter(call => call.url.endsWith('/analyze')).map(call => JSON.parse(call.options.body));
  assert.deepEqual(analyses.map(body => body.communityEntryId), [entry.id, entry.id]);
  c.setHomeRequest('普通新需求'); assert.equal(await c.searchHome(), true);
  assert.equal(await c.startFeatured('family-assistant'), true);
  analyses = api.calls.filter(call => call.url.endsWith('/analyze')).map(call => JSON.parse(call.options.body));
  assert.equal(analyses.at(-2).communityEntryId, undefined); assert.equal(analyses.at(-1).communityEntryId, undefined); c.close();
});
test('identical community request text preserves different selected identities across switching and draft restoration', async () => {
  const { module } = await loadClient(); const h = host(), storage = memoryStorage();
  const api = server({ analyze: async () => ({ ok: false, json: async () => ({ error: { message: '暂时未能分析' } }) }) });
  const [first, second] = getCommunityOverview().categories[0].previews;
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await c.bootstrap();
  assert.equal(await c.startCommunityPlugin(first.id), false); const request = c.getSnapshot().homeRequest;
  assert.equal(await c.startCommunityPlugin(second.id), false);
  assert.equal(c.getSnapshot().homeRequest, request); assert.equal(c.getSnapshot().homeCommunityEntryId, second.id);
  const firstDraft = c.getSnapshot().featuredDrafts.find(draft => draft.request === request && draft.communityEntryId === first.id);
  assert.ok(firstDraft, 'the same request text must not discard the previous selected plugin');
  assert.equal(await c.restoreFeaturedDraft(firstDraft.id), true);
  assert.equal(c.getSnapshot().homeCommunityEntryId, first.id);
  assert.ok(c.getSnapshot().featuredDrafts.some(draft => draft.request === request && draft.communityEntryId === second.id));
  assert.equal(await c.startCommunityPlugin(second.id), false);
  for (const entry of [first, second]) assert.equal(c.getSnapshot().featuredDrafts.filter(draft => draft.request === request && draft.communityEntryId === entry.id && draft.stage === 'describe' && !draft.taskId).length, 1);
  assert.deepEqual(api.calls.filter(call => call.url.endsWith('/analyze')).map(call => JSON.parse(call.options.body).communityEntryId), [first.id, second.id, second.id]);
  c.close();
});
test('editing a failed or restored community request retains its selection until explicit cancellation', async () => {
  const { module } = await loadClient(); const h = host(), storage = memoryStorage();
  const api = server({ analyze: async () => ({ ok: false, json: async () => ({ error: { message: '来源暂不可用' } }) }) });
  const entry = getCommunityOverview().categories[0].previews[0];
  let c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await c.bootstrap();
  assert.equal(await c.startCommunityPlugin(entry.id), false);
  const edited = `${c.getSnapshot().homeRequest} 只处理本地资料。`;
  c.setHomeRequest(edited); assert.equal(c.getSnapshot().homeCommunityEntryId, entry.id);
  c.close(); c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await c.bootstrap();
  assert.equal(c.getSnapshot().homeRequest, edited); assert.equal(c.getSnapshot().homeCommunityEntryId, entry.id);
  assert.equal(await c.searchHome(), false);
  c.prepareHomeExample('一个新的普通需求'); assert.equal(c.getSnapshot().homeCommunityEntryId, null);
  const draft = c.getSnapshot().featuredDrafts.find(item => item.request === edited && item.communityEntryId === entry.id);
  assert.ok(draft); assert.equal(await c.restoreFeaturedDraft(draft.id), true);
  const restoredEdit = `${edited} 暂不连接账号。`; c.setHomeRequest(restoredEdit);
  assert.equal(c.getSnapshot().homeCommunityEntryId, entry.id); assert.equal(await c.searchHome(), false);
  assert.equal(c.clearHomeCommunitySelection(), true);
  assert.equal(c.getSnapshot().homeRequest, restoredEdit); assert.equal(c.getSnapshot().homeCommunityEntryId, null);
  assert.equal(await c.searchHome(), false);
  assert.deepEqual(api.calls.filter(call => call.url.endsWith('/analyze')).map(call => JSON.parse(call.options.body).communityEntryId), [entry.id, entry.id, entry.id, undefined]);
  c.close();
});
test('saved workflow selection survives history readback and retry while opening a normal workflow clears it', async () => {
  const { module } = await loadClient(); const h = host();
  const entry = getCommunityOverview().categories[0].previews[0];
  const selected = { ...identifiedWorkflow(), communityEntryId: entry.id };
  const ordinary = { ...identifiedWorkflow(), taskId: 'ordinary-task', revisionId: 'ordinary-revision' };
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(selected) }), open: async () => ({ ok: true, json: async () => historyEnvelope(ordinary) }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: memoryStorage() }); await c.bootstrap();
  assert.equal(c.getSnapshot().communityEntryId, entry.id); await c.analyze();
  assert.equal(JSON.parse(api.calls.find(call => call.url.endsWith('/analyze')).options.body).communityEntryId, entry.id);
  assert.equal(await c.openTask(ordinary.taskId, ordinary.revisionId), true); assert.equal(c.getSnapshot().communityEntryId, null);
  await c.analyze(); assert.equal(JSON.parse(api.calls.filter(call => call.url.endsWith('/analyze')).at(-1).options.body).communityEntryId, undefined); c.close();
});
test('legacy home text remains readable without inventing a selected community identity', async () => {
  const { module } = await loadClient(); const storage = memoryStorage(), h = host(), api = server();
  storage.setItem('dsh.plugin-finder.home-input.v1', '旧版首页原输入');
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage });
  assert.equal(c.getSnapshot().homeRequest, '旧版首页原输入'); assert.equal(c.getSnapshot().homeCommunityEntryId, null);
  c.setHomeRequest('新普通输入'); c.close();
  assert.equal(storage.getItem('dsh.plugin-finder.home-input.v1'), '旧版首页原输入');
  const reopened = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage });
  assert.equal(reopened.getSnapshot().homeRequest, '新普通输入'); assert.equal(reopened.getSnapshot().homeCommunityEntryId, null); reopened.close();
});
test('single flow reset failure preserves active plan and home input without calling a model', async () => {
  const { module } = await loadClient(); const h = host(); const workflow = identifiedWorkflow();
  const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(workflow) }), reset: async () => ({ ok: false, json: async () => ({ error: { message: '保存未确认' } }) }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: memoryStorage() }); await c.bootstrap(); c.setHomeRequest('另一个需求');
  assert.equal(await c.searchHome(), false); assert.equal(c.getSnapshot().taskId, workflow.taskId); assert.equal(c.getSnapshot().homeRequest, '另一个需求'); assert.equal(api.calls.length, 2); c.close();
});
test('single flow cancellation prevents recommendation after analysis and rejects duplicate submission', async () => {
  const { module } = await loadClient(); const h = host(); let finish;
  const api = server({ analyze: () => new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => ({ intent: fixtureIntent() }) }); }) });
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: memoryStorage() }); await c.bootstrap(); c.setHomeRequest('检查 CSV'); const pending = c.searchHome();
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(await c.searchHome(), false); c.cancel(); finish(); assert.equal(await pending, false); assert.equal(api.calls.some(x => x.url.endsWith('/recommend')), false); assert.equal(c.getSnapshot().homeRequest, '检查 CSV'); c.close();
});
test('legacy creation guide route restores the same creation surface while failed sources prioritize retry', async () => {
  const { module } = await loadClient();
  for (const discovery of [
    { sources: [{ id: 'source', status: 'failed' }] },
    { sources: [{ id: 'source', status: 'stale' }] },
    { sources: [], sourceCoverage: [{ sourceId: 'coverage', status: 'failed' }] },
    { sources: [], sourceCoverage: [{ sourceId: 'coverage', status: 'stale' }] },
    { status: 'failed', sources: [] },
  ]) {
    const h = host(); const workflow = { ...identifiedWorkflow(), candidates: [], plan: { ...fixturePlan(), kind: 'gap', pluginIds: [], steps: [] }, discovery };
    const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(workflow) }) });
    const c = module.createFinderController(h.ctx, { fetch: api.fetch }); await c.bootstrap(); c.showFind();
    const results = await renderWorkbench(c.getSnapshot());
    assert.match(results.visibleText, /重试查找/); assert.match(results.visibleText, /供给仍待核对/);
    assert.doesNotMatch(results.visibleText, /还没有合适的方案，要一起做一个吗|供给缺口/);
    assert.match(results.text, /搜索未完成，暂不能判断是否存在合适插件/);
    assert.doesNotMatch(results.text, /本次已返回的来源中没有找到足够合适/);
    c.showCreationGuide(); assert.equal(c.getSnapshot().view, 'creation-guide'); assert.equal(api.calls.length, 1);
    const guide = await renderWorkbench(c.getSnapshot()); assert.match(guide.visibleText, /创建自己的插件/); assert.match(guide.visibleText, /部分来源尚未查完/);
    assert.doesNotMatch(guide.visibleText, /Creator|复制|交接/);assert.match(guide.text, /搜索未完成，暂不能判断是否存在合适插件/);
    c.showFind(); assert.equal(c.getSnapshot().taskId, workflow.taskId); assert.deepEqual(copy(c.getSnapshot().plan), workflow.plan); c.close();
  }
});

test('home input is archived before a featured scenario and can be restored from history after reload', async () => {
  const { module } = await loadClient(); const h = host(); const storage = memoryStorage();
  const api = server({ history: async () => ({ ok: true, json: async () => ({ history: [], historyTotal: 0 }) }) });
  const original = '先保存这段首页输入，稍后再继续查找';
  const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await c.bootstrap();
  c.setHomeRequest(original); assert.equal(await c.tryFeatured('family-assistant'), true);
  const saved = c.getSnapshot().featuredDrafts.find(item => item.request === original);
  assert.ok(saved); assert.equal(saved.stage, 'describe'); assert.equal(saved.taskId, null); assert.equal(saved.revisionId, null);
  assert.notEqual(c.getSnapshot().homeRequest, original); assert.equal(c.getSnapshot().view, 'home');
  assert.equal(await c.showHistory(), true);
  assert.match((await renderWorkbench(c.getSnapshot())).text, /先保存这段首页输入，稍后再继续查找/);
  c.close();
  const again = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await again.bootstrap();
  assert.ok(again.getSnapshot().featuredDrafts.some(item => item.id === saved.id && item.request === original));
  assert.equal(await again.restoreFeaturedDraft(saved.id), true);
  assert.equal(again.getSnapshot().homeRequest, original); assert.equal(again.getSnapshot().request, original);
  assert.equal(again.getSnapshot().stage, 'describe'); assert.equal(again.getSnapshot().view, 'home');
  assert.equal(api.calls.some(call => /analyze|recommend|creation|handoff/.test(call.url)), false);
  assert.equal(h.drafts.length, 0); again.close();
});

test('home archive storage failure blocks featured replacement and draft restoration before reset', async () => {
  const { module } = await loadClient();
  for (const action of ['scenario', 'restore']) {
    const h = host(); const storage = memoryStorage();
    storage.setItem('dsh.plugin-finder.featured-drafts.v1', JSON.stringify([{ id: 'older-input', createdAt: '2026-10-22', request: '以前保留的需求', stage: 'describe', taskId: null, revisionId: null, intent: null }]));
    const api = server({ bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(identifiedWorkflow()) }) });
    const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await c.bootstrap();
    c.setHomeRequest('这段首页新输入尚未提交');
    const before = copy(c.getSnapshot().featuredDrafts);
    storage.setItem = () => { throw new Error('disk'); };
    assert.equal(await (action === 'scenario' ? c.tryFeatured('agent-twin') : c.restoreFeaturedDraft('older-input')), false);
    assert.equal(c.getSnapshot().homeRequest, '这段首页新输入尚未提交');
    assert.equal(c.getSnapshot().taskId, 'task-a'); assert.deepEqual(copy(c.getSnapshot().plan), fixturePlan());
    assert.deepEqual(copy(c.getSnapshot().featuredDrafts), before); assert.match(c.getSnapshot().error, /尚未可靠保存/);
    assert.deepEqual(api.calls.map(call => call.url.split('/').at(-1)), ['bootstrap']);
    assert.equal(h.drafts.length, 0); c.close();
  }
});

test('home edits after a failed featured reset cancel the stale switch and preserve the original task', async () => {
  const { module } = await loadClient();
  for (const existing of [false, true]) {
    const h = host(); const workflow = identifiedWorkflow(); let fail = true;
    const api = server({
      bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(existing ? workflow : undefined) }),
      reset: async () => fail ? { ok: false, json: async () => ({ error: { message: '保存未确认' } }) } : { ok: true, json: async () => ({ cleared: true }) },
      open: async () => ({ ok: true, json: async () => historyEnvelope(workflow) }),
    });
    const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: memoryStorage() }); await c.bootstrap();
    c.setHomeRequest('准备切换前的首页输入'); assert.equal(await c.tryFeatured('agent-twin'), false);
    assert.equal(c.getSnapshot().resetPending, true);
    c.setHomeRequest('失败后新写的首页输入'); fail = false;
    assert.equal(await c.retryReset(), true);
    assert.equal(c.getSnapshot().homeRequest, '失败后新写的首页输入'); assert.equal(c.getSnapshot().resetPending, false);
    assert.equal(c.getSnapshot().taskId, existing ? workflow.taskId : null);
    if (existing) { assert.equal(c.getSnapshot().revisionId, workflow.revisionId); assert.deepEqual(copy(c.getSnapshot().plan), workflow.plan); }
    assert.ok(c.getSnapshot().featuredDrafts.some(item => item.request === '准备切换前的首页输入'));
    assert.match(c.getSnapshot().notice, /原场景切换已取消/);
    assert.equal(api.calls.filter(call => call.url.endsWith('/reset')).length, 1);
    assert.deepEqual(api.calls.filter(call => call.url.endsWith('/open')).map(call => JSON.parse(call.options.body)), existing ? [{ taskId: workflow.taskId, revisionId: workflow.revisionId }] : []);
    assert.equal(api.calls.some(call => /analyze|recommend|creation|handoff/.test(call.url)), false); c.close();
  }
});

test('a full input archive permits searching from an unchanged saved task but protects unsaved edits', async () => {
  const { module } = await loadClient();
  for (const variant of ['saved-plan', 'saved-creation', 'edited-understanding', 'edited-blueprint']) {
    const h = host(); const storage = memoryStorage();
    const archived = Array.from({ length: 20 }, (_, index) => ({ id: `input-${index}`, createdAt: '2026-10-22', request: `保留输入 ${index}`, stage: 'describe', taskId: null, revisionId: null, intent: null }));
    storage.setItem('dsh.plugin-finder.featured-drafts.v1', JSON.stringify(archived));
    const previous = variant === 'saved-creation' || variant === 'edited-blueprint' ? creationWorkflow() : identifiedWorkflow();
    const understood = { ...identifiedWorkflow('next-task', 1, 'understand'), request: '另一个要完成的任务' };
    const recommended = { ...identifiedWorkflow('next-task', 2), request: understood.request };
    const api = server({
      bootstrap: async () => ({ ok: true, json: async () => restoredBootstrap(previous) }),
      analyze: async () => ({ ok: true, json: async () => historyEnvelope(understood) }),
      recommend: async () => ({ ok: true, json: async () => historyEnvelope(recommended) }),
    });
    const c = module.createFinderController(h.ctx, { fetch: api.fetch, draftStorage: storage }); await c.bootstrap();
    if (variant === 'edited-understanding') c.editIntent({ goal: '还没保存的目标修改' });
    if (variant === 'edited-blueprint') c.editCreation({ blueprint: { name: '还没保存的蓝图修改' } });
    const before = copy(c.getSnapshot()); c.setHomeRequest(understood.request);
    const edited = variant.startsWith('edited');
    assert.equal(await c.searchHome(), !edited, variant);
    assert.deepEqual(copy(c.getSnapshot().featuredDrafts), archived, variant);
    assert.deepEqual(JSON.parse(storage.getItem('dsh.plugin-finder.featured-drafts.v1')), archived, variant);
    if (edited) {
      assert.deepEqual(api.calls.map(call => call.url.split('/').at(-1)), ['bootstrap']);
      assert.equal(c.getSnapshot().homeRequest, understood.request); assert.equal(c.getSnapshot().taskId, before.taskId);
      assert.equal(c.getSnapshot().revisionId, before.revisionId); assert.deepEqual(copy(c.getSnapshot().intent), before.intent);
      assert.deepEqual(copy(c.getSnapshot().creationForm), before.creationForm); assert.equal(c.getSnapshot().creationDirty, before.creationDirty);
      assert.match(c.getSnapshot().error, /20.*输入/);
    } else {
      assert.deepEqual(api.calls.map(call => call.url.split('/').at(-1)), ['bootstrap', 'reset', 'analyze', 'recommend']);
      assert.equal(c.getSnapshot().taskId, recommended.taskId); assert.equal(c.getSnapshot().revisionId, recommended.revisionId);
      assert.deepEqual(copy(c.getSnapshot().plan), recommended.plan); assert.equal(c.getSnapshot().homeRequest, '');
    }
    c.close();
  }
});
