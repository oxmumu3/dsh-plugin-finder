import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const clientUrl = new URL('../src/client.js', import.meta.url);
const styleUrl = new URL('../src/client-style.js', import.meta.url);
const fixtureIntent = () => ({ goal: '检查投放 CSV 并生成周报', input: '本地 CSV', output: '周报', constraints: ['不接第三方账号'], capabilities: ['质量检查', '报告'], queries: ['csv', 'report'] });
const fixturePlan = () => ({ kind: 'single', title: '检查数据后生成报告', rationale: '一个插件覆盖基础分析', pluginIds: ['data'], steps: [{ capability: '报告', sourceCapability: 'report', owner: 'data', action: '读取 CSV 后生成报告', input: 'CSV', output: '报告' }], limits: ['任务效果尚未核验'], nextPrompt: '请先检查当前工作区中的 CSV。' });
const candidate = { id: 'data', name: 'dsh-data-insight', title: '数据洞察', summary: '本地表格分析', capabilities: ['csv', 'report'], requirements: ['读取本地文件'], install: { spec: 'https://example.com/data.git#abcd', commit: 'abcd', version: '0.1.0' }, evidence: { metadata: 'verified', installation: 'not-tested', task: 'not-tested', sources: ['https://example.com/data'] }, repository: 'https://example.com/data' };
const copy = value => JSON.parse(JSON.stringify(value));

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
  const style = await readFile(styleUrl, 'utf8').catch(() => null);
  const client = await readFile(clientUrl, 'utf8').catch(() => null);
  assert.ok(style && client, 'native client source and scoped style are implemented');
  vm.runInContext(style.replace(/export /g, '') + '\nglobalThis.finderCss=finderCss;', scope, { filename: 'client-style.js' });
  const exports = client.replace(/^import React from 'react';?\s*/m, '').replace(/^import \{ finderCss \} from '\.\/client-style\.js';?\s*/m, '').replace(/export /g, '');
  vm.runInContext(exports + '\nglobalThis.clientModule={inject,apply,createFinderController,prepareSessionDraft,candidateDetails:typeof candidateDetails===\'function\'?candidateDetails:undefined};', scope, { filename: 'client.js' });
  return { module: globals.clientModule, globals, tags, React };
}

function host(options = {}) {
  const registrations = [], effects = [], starts = [], panels = [], connected = [], retained = [], drafts = [], opened = [], released = [];
  let snapshot = { phase: 'ready', items: [{ workspaceId: 'workspace-a', title: '合成测试项目', path: '/tmp/finder-test', sessionIds: [] }] };
  const listeners = new Set();
  const binding = { sessionId: 'session-a', ctx: { get: name => name === 'conversation' ? { input: { requestDraftInitialization: (target, draft) => { drafts.push({ target, draft }); return options.draftStatus ?? 'applied'; } } } : undefined } };
  const ctx = {
    workspaces: { list: { getSnapshot: () => snapshot, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } } },
    uiWorkspace: {
      startSession: (...args) => starts.push(args),
      connectWorkspace: async id => { connected.push(id); return options.connect ? options.connect(id) : 'session-a'; },
      openSession: id => opened.push(id),
    },
    sessions: {
      retain: (id, retainOptions) => { retained.push({ id, options: retainOptions }); return { binding, ready: options.ready ?? Promise.resolve(binding), release: () => released.push(id) }; },
      binding: () => options.expired ? undefined : binding,
    },
    layout: { selectPanel: id => panels.push(id) },
    effect: fn => effects.push(fn()),
    slots: { inject: (_name, fn) => fn(), register: (spec, component) => { registrations.push({ spec, component }); return () => {}; } },
  };
  return { ctx, starts, panels, connected, retained, drafts, opened, released, binding, registrations, effects, setSnapshot: value => { snapshot = value; for (const fn of listeners) fn(); }, dispose: () => { for (const stop of effects.reverse()) if (typeof stop === 'function') stop(); } };
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
      reset: { cleared: true },
    };
    return { ok: true, json: async () => copy(values[path]) };
  };
  return { fetch, calls };
}

async function renderWorkbench(snapshot) {
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: initial => [typeof initial === 'function' ? snapshot : initial, () => {}],
    useEffect() {}, useRef: value => ({ current: value }),
  };
  const loaded = await loadClient({ React }); const h = host();
  loaded.module.apply(h.ctx);
  const tree = h.registrations.find(item => item.spec.name === 'main').component();
  const nodes = [];
  const walk = node => {
    if (Array.isArray(node)) { for (const child of node) walk(child); return; }
    if (node && typeof node === 'object') { nodes.push(node); walk(node.children); }
  };
  walk(tree);
  const content = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(content).join(' ') : node && typeof node === 'object' ? content(node.children) : '';
  h.dispose(); return { text: content(tree), nodes };
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
  assert.match(rendered.text, /按需求搜索插件来源/);
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

test('preserved drafts have an explicit exact-session opener that never writes, connects again or submits', async () => {
  const { module } = await loadClient(); const h = host({ draftStatus: 'preserved' }); const api = server();
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch });
  await controller.bootstrap(); await controller.analyze('检查 CSV'); await controller.recommend();
  controller.selectWorkspace('workspace-a'); await controller.handoff();
  assert.deepEqual(copy(controller.getSnapshot().preservedTarget), { sessionId: 'session-a', workspaceId: 'workspace-a' });
  const rendered = await renderWorkbench(controller.getSnapshot()); assert.ok(rendered.nodes.some(node => node.type === 'button' && node.children.includes('打开已有草稿')));
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

test('blank workflow still exposes 我的方案 and opens exact task versions without model calls', async () => {
  const { module } = await loadClient(); const h = host(); const a = identifiedWorkflow();
  const api = server({ history: async () => ({ ok: true, json: async () => historyEnvelope(a) }), open: async () => ({ ok: true, json: async () => historyEnvelope(a) }) });
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
  const blank = await renderWorkbench(controller.getSnapshot()); assert.match(blank.text, /找方案/); assert.match(blank.text, /我的方案/);
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
  const controller = module.createFinderController(h.ctx, { fetch: api.fetch }); await controller.bootstrap();
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
