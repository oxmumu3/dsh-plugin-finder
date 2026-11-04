import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSearchRecord, mergeRecent, SEARCH_RECORD_VERSION, SEARCH_HISTORY_LIMIT} from '../src/search-history.js';
import {createFinderService} from '../src/service.js';

const sources = [
  {id: 'awesome-full', title: '完整社区目录', status: 'live', total: 120, url: 'https://example.com/plugins.json'},
  {id: 'github-topic', title: 'GitHub topic', status: 'failed', total: 0, error: 'HTTP 503'},
  {id: 'host-market:abc', title: '已配置市场', status: 'cached', total: 8},
];
const candidates = [
  {id: 'pkg-a', sourceTags: [sources[0], sources[2]]},
  {id: 'pkg-b', sourceTags: [sources[1]]},
  {id: 'pkg-c', sourceTags: [sources[0]]},
];

test('buildSearchRecord compacts sources and counts adopted candidates per source', () => {
  const record = buildSearchRecord({
    request: '把本地 CSV 整理成月报',
    searchedAt: '2026-11-04T12:00:00.000Z',
    sources,
    plan: {kind: 'combo', title: 'CSV 组合方案', pluginIds: ['pkg-a', 'pkg-c']},
    candidates,
  });
  assert.equal(record.recordVersion, SEARCH_RECORD_VERSION);
  assert.match(record.id, /^search-[a-f0-9]{24}$/);
  assert.equal(record.request, '把本地 CSV 整理成月报');
  assert.equal(record.searchedAt, '2026-11-04T12:00:00.000Z');
  assert.equal(record.planKind, 'combo');
  assert.equal(record.planTitle, 'CSV 组合方案');
  assert.deepEqual(record.sources, [
    {id: 'awesome-full', title: '完整社区目录', status: 'live', total: 120, used: 2},
    {id: 'github-topic', title: 'GitHub topic', status: 'failed', total: 0, used: 0},
    {id: 'host-market:abc', title: '已配置市场', status: 'cached', total: 8, used: 1},
  ]);
  // Failed sources contribute no readable total; one source was unreadable.
  assert.deepEqual(record.totals, {read: 128, used: 2, failed: 1});
  // Same inputs produce the same compact identity without persisting candidate data.
  assert.equal(record.id, buildSearchRecord({
    request: '把本地 CSV 整理成月报',
    searchedAt: '2026-11-04T12:00:00.000Z',
    sources,
    plan: {kind: 'combo', title: 'CSV 组合方案', pluginIds: ['pkg-c', 'pkg-a']},
    candidates,
  }).id);
  assert.doesNotMatch(JSON.stringify(record), /example\.com|HTTP 503|capabilities/);
});

test('buildSearchRecord keeps a source with zero adopted candidates and survives sparse input', () => {
  const record = buildSearchRecord({
    request: '只读查看',
    searchedAt: '2026-11-04T13:00:00.000Z',
    sources: [{id: 'only', title: '唯一来源', status: 'live', total: 4}],
    plan: {kind: 'native', title: '直接使用', pluginIds: []},
    candidates: [{id: 'unused', sourceTags: [{id: 'only', title: '唯一来源'}]}],
  });
  assert.deepEqual(record.sources, [{id: 'only', title: '唯一来源', status: 'live', total: 4, used: 0}]);
  assert.deepEqual(record.totals, {read: 4, used: 0, failed: 0});
  const empty = buildSearchRecord();
  assert.equal(empty.request, '');
  assert.equal(empty.planKind, 'native');
  assert.deepEqual(empty.sources, []);
  assert.deepEqual(empty.totals, {read: 0, used: 0, failed: 0});
});

test('mergeRecent deduplicates, sorts newest first and truncates without dropping the new record', () => {
  const older = {id: 'search-a', searchedAt: '2026-11-03T08:00:00.000Z', request: '旧记录'};
  const newer = {id: 'search-b', searchedAt: '2026-11-04T09:00:00.000Z', request: '新记录'};
  const replacement = {id: 'search-a', searchedAt: '2026-11-04T10:00:00.000Z', request: '更新后的记录'};
  const merged = mergeRecent([older, newer], replacement, 2);
  assert.deepEqual(merged.map(row => row.id), ['search-a', 'search-b']);
  assert.equal(merged[0].request, '更新后的记录');
  assert.equal(mergeRecent([older, newer], null, 20).length, 2);
  assert.equal(mergeRecent([], replacement).length, 1);
  assert.equal(mergeRecent(null, null).length, 0);
  const many = Array.from({length: SEARCH_HISTORY_LIMIT + 5}, (_, index) => ({
    id: `search-${index}`,
    searchedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }));
  assert.equal(mergeRecent(many, null, 3).length, 3);
  assert.deepEqual(mergeRecent(many, null, 3).map(row => row.id), ['search-24', 'search-23', 'search-22']);
  assert.equal(mergeRecent([], {id: 'fresh', searchedAt: '2026-11-04T10:00:00.000Z'}, 0).length, 1);
});

test('a successful recommendation writes one record exposed by bootstrap and the history route', async () => {
  const request = '把本地笔记整理成可检索的资料库';
  const intent = {goal: '整理本地笔记', input: 'Markdown', output: '可检索资料库', constraints: ['不上传'], capabilities: ['本地检索'], queries: ['local notes search']};
  const candidate = {
    id: 'local-library', name: 'local-library', title: '本地资料库', summary: '本地检索', capabilities: ['本地检索'],
    sourceTags: [{id: 'awesome', title: 'Awesome DSH', status: 'live', total: 5}],
    requirements: {extraApiKey: 'not-required'}, install: {spec: 'local-library@1.0.0', version: '1.0.0'},
    evidence: {metadata: 'manifest-checked', installation: 'not-tested', task: 'not-tested'},
  };
  const plan = {kind: 'single', title: '本地资料库方案', rationale: '作者自述支持本地检索，实际任务仍待验证', pluginIds: [candidate.id], steps: [{capability: '本地检索', owner: candidate.id, sourceCapability: '本地检索', action: '配置目录', input: 'Markdown', output: '检索结果'}], limits: ['尚未运行']};
  const rows = new Map();
  let pointer = {activeTaskId: null, activeRevisionId: null};
  const historyStore = {
    read: async id => structuredClone(rows.get(id)),
    write: async row => { rows.set(row.id, structuredClone(row)); },
    list: async () => [...rows.values()].map(row => structuredClone(row)),
    readPointer: async () => pointer,
    writePointer: async value => { pointer = structuredClone(value); },
  };
  const stored = [];
  const searchHistoryStore = {list: async () => stored.slice(), save: async record => { stored.splice(0, stored.length, ...mergeRecent(stored, record)); }};
  const service = createFinderService({
    historyStore, searchHistoryStore,
    discovery: {search: async () => ({candidates: [candidate], sources: [{id: 'awesome', title: 'Awesome DSH', status: 'live', total: 5}], warnings: [], searchedAt: '2026-11-04T12:00:00.000Z'})},
    model: {status: () => ({configured: true}), call: async input => ({text: JSON.stringify(input.system.includes('仅允许 {"kind"') ? plan : intent), model: {label: 'host'}})},
    search: ({plugins}) => plugins,
    hostVersion: '0.2.1-rc.5',
    clock: () => new Date('2026-11-04T12:00:00.000Z'),
  });
  const analyzed = await service.analyze({request});
  assert.equal(stored.length, 0, 'analysis alone must not leave a search record');
  const recommended = await service.recommend({taskId: analyzed.workflow.taskId, revisionId: analyzed.workflow.revisionId, intent: analyzed.intent});
  assert.equal(stored.length, 1);
  assert.equal(stored[0].request, request);
  assert.equal(stored[0].searchedAt, '2026-11-04T12:00:00.000Z');
  assert.equal(stored[0].planKind, 'single');
  assert.deepEqual(stored[0].sources, [{id: 'awesome', title: 'Awesome DSH', status: 'live', total: 5, used: 1}]);
  assert.deepEqual(stored[0].totals, {read: 5, used: 1, failed: 0});
  assert.deepEqual(recommended.searchHistory.map(row => row.id), [stored[0].id]);
  assert.deepEqual((await service.searchHistory()).records.map(row => row.id), [stored[0].id]);
  assert.equal((await service.bootstrap()).searchHistory.length, 1);
});
