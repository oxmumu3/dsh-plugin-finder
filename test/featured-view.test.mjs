import assert from 'node:assert/strict';
import test from 'node:test';
import { renderFeaturedView } from '../src/featured-view.js';
import { featuredCatalog } from '../src/featured-catalog.js';
import { safeFeaturedInstall } from '../src/featured.js';

const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
const content = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(content).join(' ') : content(node.children);
const nodes = node => node == null || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.children)];
const visible = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(visible).join(' ') : visible(node.type === 'details' && !node.props.open ? node.children.find(child => child?.type === 'summary') : node.children);
const draft = { id: 'draft-1', request: '需要恢复的未提交输入', createdAt: '2026-10-22T12:00:00Z' };
const render = (state = {}, options = {}) => renderFeaturedView({ h, state, controller: {}, copyText() {}, ...options });

test('home shows the four curated products below the request without inventing recommendations or exposing saved drafts', () => {
  const view = render({ featuredId: 'agent-twin', featuredDrafts: [draft] });
  assert.equal(nodes(view).filter(node => node.type === 'article').length, 4);
  assert.match(visible(view), /精选插件/);
  assert.doesNotMatch(visible(view), /猜你喜欢|感兴趣的方向|不感兴趣|恢复草稿|需要恢复的未提交输入|试试这个场景/);
  const settings = nodes(view).find(node => node.type === 'details');
  assert.equal(content(settings.children[0]), '调整推荐');
  assert.equal(settings.props.open, undefined);
  assert.match(content(settings), /感兴趣的方向/);
});

test('home recommendations explain a positive local signal and respect dismissals', () => {
  const state = { featuredPreferences: { interests: ['family'], dismissed: [] } };
  const view = render(state);
  const recommendations = nodes(view).find(node => node.props['aria-label'] === '与你相关的精选插件');
  assert.ok(recommendations);
  assert.match(visible(recommendations), /你选择了「家庭助手」兴趣/);
  assert.equal(nodes(recommendations).filter(node => node.type === 'article').length, 1);
  assert.doesNotMatch(visible(render({ featuredPreferences: { interests: ['family'], dismissed: ['family-assistant'] } })), /猜你喜欢/);
});

test('recommendation controls remain available inside the collapsed adjustment area', () => {
  const calls = [];
  const view = render({}, { controller: { toggleFeaturedInterest: id => calls.push(['interest', id]), dismissFeatured: id => calls.push(['dismiss', id]) } });
  const settings = nodes(view).find(node => node.type === 'details');
  nodes(settings).find(node => node.type === 'button' && content(node) === 'AI 分身').props.onClick();
  nodes(settings).find(node => node.props['aria-label'] === `对${featuredCatalog[0].title}不感兴趣`).props.onClick();
  assert.deepEqual(calls, [['interest', 'twin'], ['dismiss', 'agent-twin']]);
});

test('detail returns home, preserves prerequisites, and keeps previews without installation actions', () => {
  const calls = [];
  const view = render({ featuredId: 'family-assistant', featuredDrafts: [draft] }, { mode: 'detail', controller: { showHome: () => calls.push('home'), tryFeatured: id => calls.push(id) } });
  const buttons = nodes(view).filter(node => node.type === 'button');
  buttons.find(node => content(node) === '返回首页').props.onClick();
  buttons.find(node => content(node) === '试试这个场景').props.onClick();
  assert.deepEqual(calls, ['home', 'family-assistant']);
  assert.match(content(view), /使用前提/);
  assert.match(content(view), /当前边界/);
  assert.match(content(view), /产品与组件/);
  assert.match(content(view), /来源与起步方式/);
  assert.doesNotMatch(content(view), /复制安装来源|需要恢复的未提交输入|恢复草稿/);
});

test('public detail uses the existing exact-version installation gate', () => {
  const entry = featuredCatalog.find(item => item.id === 'agent-twin');
  const view = render({ featuredId: entry.id }, { mode: 'detail' });
  const copyButton = nodes(view).find(node => node.type === 'button' && content(node) === '复制安装来源');
  assert.equal(Boolean(copyButton), Boolean(safeFeaturedInstall(entry)));
  const links = nodes(view).filter(node => node.type === 'a');
  assert.ok(links.length > 0);
  assert.ok(links.every(node => new URL(node.props.href).pathname.startsWith('/oxmumu3/')));
});

test('drafts mode is reserved for history and keeps the exact restore and remove actions', () => {
  const calls = [];
  const view = render({ featuredDrafts: [draft] }, { mode: 'drafts', controller: { restoreFeaturedDraft: id => calls.push(['restore', id]), removeFeaturedDraft: id => calls.push(['remove', id]) } });
  assert.match(content(view), /需要恢复的未提交输入/);
  assert.doesNotMatch(content(view), /精选插件|猜你喜欢|调整推荐/);
  nodes(view).find(node => node.type === 'button' && content(node) === '恢复草稿').props.onClick();
  nodes(view).find(node => node.type === 'button' && content(node) === '移除这份输入').props.onClick();
  assert.deepEqual(calls, [['restore', draft.id], ['remove', draft.id]]);
  assert.equal(render({}, { mode: 'drafts' }), null);
});
