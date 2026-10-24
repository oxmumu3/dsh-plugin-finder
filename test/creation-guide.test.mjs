import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCreationGuide } from '../src/creation-guide.js';

const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
const fixture = overrides => ({
  request: '为选定目录做只读 Markdown 阅读列表',
  intent: { goal: '整理阅读进度，保留原文' },
  taskId: 'task-a', revisionId: 'revision-a',
  plan: { kind: 'gap', title: '阅读列表仍需补齐', limits: [] },
  discovery: { sources: [{ status: 'live' }] },
  ...overrides,
});
const content = (node, visible = false) => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(child => content(child, visible)).join(' ');
  if (!node || typeof node !== 'object') return '';
  return content(visible && node.type === 'details' && !node.props.open
    ? node.children.find(child => child?.type === 'summary') : node.children, visible);
};
const nodes = node => Array.isArray(node) ? node.flatMap(nodes)
  : node && typeof node === 'object' ? [node, ...nodes(node.children)] : [];
function render(state = fixture(), busy = false) {
  const calls = [];
  const controller = Object.fromEntries(['startCreation', 'showFind', 'recommend'].map(name => [name, () => calls.push(name)]));
  const tree = renderCreationGuide({ h, state, controller, busy });
  return { tree, calls, nodes: nodes(tree), visible: content(tree, true), text: content(tree) };
}
const button = (view, label) => view.nodes.find(node => node.type === 'button' && content(node) === label);

test('opening the guide shows this need without calling a model or changing the saved plan', () => {
  const state = fixture();
  const before = structuredClone(state);
  Object.freeze(state.plan); Object.freeze(state);
  const view = render(state);
  assert.deepEqual(view.calls, []);
  assert.deepEqual(state, before);
  assert.match(view.visible, /整理阅读进度，保留原文/);
  assert.match(view.visible, /本次.*来源/);
  assert.match(view.visible, /配置.*扩展.*新建/);
  button(view, '用我的需求起草').props.onClick();
  assert.deepEqual(view.calls, ['startCreation']);
  assert.deepEqual(state, before);
});

test('returning to the existing result is navigation only and preserves the plan', () => {
  const state = fixture(); const plan = state.plan;
  const view = render(state);
  button(view, '回看现成方案').props.onClick();
  assert.deepEqual(view.calls, ['showFind']);
  assert.equal(state.plan, plan);
});

test('failed discovery is unknown supply and offers an explicit retry', () => {
  for (const discovery of [
    { sources: [{ status: 'failed' }] },
    { sources: [{ status: 'live' }], sourceCoverage: [{ sourceId: 'market', status: 'failed' }] },
    { status: 'failed' },
    { sources: [{ status: 'stale' }] },
  ]) {
    const view = render(fixture({ discovery, plan: { kind: 'gap', rationale: '不存在相关插件' } }));
    assert.match(view.visible, /搜索未完成/);
    assert.match(view.visible, /暂不能判断/);
    assert.doesNotMatch(view.visible, /没有找到|不存在相关|供给缺口/);
    assert.equal(button(view, '用我的需求起草').props.disabled, false);
    button(view, '重新找方案').props.onClick();
    assert.deepEqual(view.calls, ['showFind', 'recommend']);
  }
});

test('existing solutions remain a legitimate alternative to voluntary customization', () => {
  for (const kind of ['native', 'single', 'combo']) {
    const view = render(fixture({ plan: { kind } }));
    assert.match(view.visible, /已有可尝试的现成方案/);
    assert.match(view.visible, /按自己的流程定制/);
    assert.doesNotMatch(view.visible, /没有找到|供给缺口/);
    assert.equal(button(view, '用我的需求起草').props.disabled, false);
  }
});

test('missing discovery evidence does not become a claim about missing plugins', () => {
  for (const discovery of [null, {}, { sources: [null, 'invalid', { status: 'unconfigured' }] }]) {
    const view = render(fixture({ discovery, intent: null }));
    assert.match(view.visible, /为选定目录做只读 Markdown 阅读列表/);
    assert.match(view.visible, /搜索范围.*还需核对/);
    assert.doesNotMatch(view.visible, /没有找到|供给缺口/);
  }
});

test('examples distinguish synthetic acceptance from a verified prerelease', () => {
  const view = render();
  assert.equal(view.nodes.filter(node => node.type === 'article').length, 2);
  assert.match(view.visible, /阅读列表/);
  assert.match(view.visible, /合成样例.*已实跑/);
  assert.match(view.visible, /原文.*只读/);
  assert.match(view.visible, /AI 分身/);
  assert.match(view.visible, /0\.3\.0.*预发布/);
  assert.match(view.visible, /仅核验发行/);
  assert.match(view.text, /目录选择器.*未验证/);
  assert.match(view.text, /真实消息通道.*另行验收/);
  assert.doesNotMatch(view.visible, /全天在线|自动安装|一键完成/);
});

test('capabilities and first-version advice have dated sources with technical details collapsed', () => {
  const view = render();
  for (const phrase of [/侧栏/, /工具/, /本机/, /外部服务/, /宿主.*模型/, /一个核心任务/, /权限/, /可检查/]) assert.match(view.visible, phrase);
  assert.match(view.text, /0\.2\.1-rc\.2/);
  assert.match(view.text, /2026-10-22/);
  assert.match(view.text, /687f282e8625c6b8d11ff58211a90524be2e4317/);
  assert.doesNotMatch(view.visible, /687f282e8625c6b8d11ff58211a90524be2e4317|agentPreset/);
  const links = view.nodes.filter(node => node.type === 'a');
  assert.ok(links.some(node => node.props.href === 'https://github.com/oxmumu3/ai-twin-starter/releases/tag/v0.3.0'));
  assert.ok(links.some(node => node.props.href.includes('deepseek-ai/deepseek-harness/blob/687f282')));
  assert.ok(links.every(node => node.props.target === '_blank' && node.props.rel === 'noopener noreferrer'));
  assert.ok(view.nodes.filter(node => node.type === 'details').every(node => !node.props.open));
});

test('busy or incomplete tasks cannot start a creation request', () => {
  const busy = render(fixture(), true);
  assert.ok(busy.nodes.filter(node => node.type === 'button').every(node => node.props.disabled));
  for (const patch of [{ taskId: '' }, { revisionId: '' }, { plan: null }, { bootstrap: { model: { configured: false } } }]) {
    const view = render(fixture(patch));
    assert.equal(button(view, '用我的需求起草').props.disabled, true);
    assert.deepEqual(view.calls, []);
  }
});
