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
      bootstrap: { version: '0.1.0', hostVersion: '0.2.1', catalog: { count: 12, updatedAt: '2026-10-20' }, model: { configured: true, label: '宿主默认模型' } },
      analyze: { intent: fixtureIntent(), model: { label: '宿主默认模型' } },
      recommend: { intent: fixtureIntent(), plan: fixturePlan(), candidates: [candidate], catalogUpdatedAt: '2026-10-20', model: { label: '宿主默认模型' } },
      feedback: { saved: true },
    };
    return { ok: true, json: async () => copy(values[path]) };
  };
  return { fetch, calls };
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
