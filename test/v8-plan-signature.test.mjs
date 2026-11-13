// 007 的复现边界：社区目录读失败、只有平台市场成功时，署名行不能再说「翻的是当天的社区目录」。
// 署名只依据社区索引来源自己的状态与读取时间；旧数据写快照；没读到就直说没读到。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createExperienceView } from '../src/experience-view.js';
import { communityReadState, signatureText } from '../src/v8-plan-view.js';

const NOW = () => new Date().toISOString();
const YESTERDAY = () => new Date(Date.now() - 86400000).toISOString();
const dayText = value => {
  const date = new Date(value);
  return `发现好插件整理于 ${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};
function discovery(sources, searchedAt = NOW()) { return { searchedAt, sources }; }
const fullCatalog = extra => ({
  id: 'awesome-full', title: 'Awesome DSH 完整社区目录', url: 'https://awesome-dsh-plugin.com/plugins.json',
  status: 'live', fetchedAt: NOW(), total: 6563, ...extra,
});
const platformMarket = () => ({ id: 'host-market:abcdef0123', title: 'DSH 已配置市场', status: 'live', fetchedAt: null, total: 0, totalKind: 'matches' });

test('a failed community catalog is never signed as today just because a platform market was read', () => {
  const found = discovery([
    { id: 'awesome-full', status: 'failed', fetchedAt: null, total: 0 },
    { id: 'awesome', status: 'failed', fetchedAt: null, total: 0 },
    platformMarket(),
  ]);
  const line = signatureText(found.searchedAt, found);
  assert.equal(communityReadState(found, found.searchedAt), 'missing');
  assert.equal(line, `${dayText(found.searchedAt)}，这次没读到社区目录`);
  assert.doesNotMatch(line, /当天的社区目录|快照/);
});

test('only a live community index fetched today is signed as today', () => {
  const found = discovery([fullCatalog(), { id: 'awesome', status: 'live', fetchedAt: NOW(), total: 400 }]);
  assert.equal(communityReadState(found, found.searchedAt), 'fresh');
  assert.equal(signatureText(found.searchedAt, found), `${dayText(found.searchedAt)}，翻的是当天的社区目录`);
});

test('a fresh community index still reads as today when the other index failed', () => {
  const found = discovery([fullCatalog(), { id: 'awesome', status: 'failed', fetchedAt: null, total: 0 }, platformMarket()]);
  assert.equal(signatureText(found.searchedAt, found), `${dayText(found.searchedAt)}，翻的是当天的社区目录`);
});

test('a cached community index is signed as a snapshot, even on the same day', () => {
  const found = discovery([fullCatalog({ status: 'cached', fetchedAt: NOW() })]);
  assert.equal(communityReadState(found, found.searchedAt), 'snapshot');
  assert.equal(signatureText(found.searchedAt, found), `${dayText(found.searchedAt)}，翻的是社区目录快照`);
});

test('a stale community index is signed as a snapshot instead of today', () => {
  const found = discovery([fullCatalog({ status: 'stale', fetchedAt: YESTERDAY() })]);
  assert.equal(communityReadState(found, found.searchedAt), 'snapshot');
  assert.equal(signatureText(found.searchedAt, found), `${dayText(found.searchedAt)}，翻的是社区目录快照`);
});

test('a live community index fetched yesterday is signed as a snapshot', () => {
  const found = discovery([fullCatalog({ fetchedAt: YESTERDAY() })]);
  assert.equal(communityReadState(found, found.searchedAt), 'snapshot');
  assert.doesNotMatch(signatureText(found.searchedAt, found), /当天的社区目录/);
});

test('a catalog whose own update date is older than today is signed as a snapshot', () => {
  const found = discovery([fullCatalog({ catalogUpdatedAt: YESTERDAY() })]);
  assert.equal(communityReadState(found, found.searchedAt), 'snapshot');
  assert.equal(signatureText(found.searchedAt, found), `${dayText(found.searchedAt)}，翻的是社区目录快照`);
});

test('a plan found yesterday is not re-signed as today when the catalog is now fresh', () => {
  const found = discovery([fullCatalog()], YESTERDAY());
  assert.equal(communityReadState(found, found.searchedAt), 'snapshot');
  assert.equal(signatureText(found.searchedAt, found), `${dayText(found.searchedAt)}，翻的是社区目录快照`);
});

test('no community source record claims nothing about reading the community catalog', () => {
  const found = discovery([{ id: 'github-topic', title: 'GitHub dsh-plugin topic', status: 'live', fetchedAt: NOW(), total: 12 }]);
  assert.equal(communityReadState(found, found.searchedAt), 'unknown');
  assert.equal(signatureText(found.searchedAt, found), `${dayText(found.searchedAt)}，这次没留下社区目录的读取记录`);
  assert.doesNotMatch(signatureText(found.searchedAt, found), /社区目录快照|当天的社区目录/);
});

test('a source listed in both sources and sourceCoverage keeps its provenance', () => {
  const found = {
    searchedAt: NOW(),
    sources: [{ id: 'awesome', title: 'Awesome DSH 社区目录', status: 'live', fetchedAt: NOW(), total: 6563, used: 2 }],
    sourceCoverage: [{ sourceId: 'awesome', title: 'Awesome DSH 社区目录', inspected: 4 }],
  };
  assert.equal(communityReadState(found, found.searchedAt), 'fresh');
  assert.equal(signatureText(found.searchedAt, found), `${dayText(found.searchedAt)}，翻的是当天的社区目录`);
});

test('a refreshed plan card shows the honest signature instead of today when the catalog failed', () => {
  const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
  const React = { createElement: h, Fragment: 'fragment', useRef: value => ({ current: value }), useEffect() {} };
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.children)] : [];
  const content = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(content).join(' ') : content(node.children);
  const found = discovery([
    { id: 'awesome-full', status: 'failed', fetchedAt: null, total: 0 },
    { id: 'awesome', status: 'failed', fetchedAt: null, total: 0 },
    platformMarket(),
  ]);
  const controller = new Proxy({}, { get: () => () => {} });
  const view = createExperienceView(React)({
    state: {
      view: 'find', taskId: 'task-a', revisionId: 'revision-b', revisionNumber: 2, request: '整理发票',
      intent: { goal: '整理发票' },
      plan: { kind: 'single', title: '一块现成的就够', rationale: '', pluginIds: ['one'], limits: [], steps: [] },
      candidates: [{ id: 'one', name: '现成能力', capability: '整理' }],
      discovery: found, conversation: [], followupText: '',
    },
    controller, busy: false, modelReady: true, copyText() {}, sections: {},
  });
  const text = content(view);
  assert.match(text, /这次没读到社区目录/);
  assert.doesNotMatch(text, /当天的社区目录/);
  assert.ok(nodes(view).some(node => node.props?.className === 'pf8_sign'), 'the signature line still renders on the card');
});
