import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFinderService} from '../src/service.js';
import {registerAgentTools} from '../src/agent-tools.js';

const discovered = {
  candidates: [
    {id: 'pkg-a', name: 'pkg-a', title: 'CSV 月报插件', summary: '把 CSV 汇总成月报', sourceTags: [{id: 'awesome', title: 'Awesome DSH'}], capabilities: ['读取 CSV']},
    {id: 'pkg-b', name: 'pkg-b', title: '表格插件', sourceTags: [], capabilities: ['表格']},
  ],
  sources: [
    {id: 'awesome', title: 'Awesome DSH', status: 'live', total: 9},
    {id: 'github-topic', title: 'GitHub topic', status: 'failed', total: 0},
  ],
  warnings: ['GitHub topic 本轮读取失败'],
  searchedAt: '2026-11-04T10:00:00.000Z',
};

test('searchOnly projects raw discovery into a bounded read-only result', async () => {
  let seen;
  const service = createFinderService({
    discovery: {search: async request => { seen = request; return discovered; }},
    model: {},
  });
  const result = await service.searchOnly({need: '把本地 CSV 整理成月报', limit: 1});
  assert.equal(typeof seen.intent.goal, 'string');
  assert.equal(seen.intent.goal, '把本地 CSV 整理成月报');
  assert.equal(seen.intent.queries[0], '把本地 CSV 整理成月报');
  assert.deepEqual(result.candidates, [
    {id: 'pkg-a', title: 'CSV 月报插件', summary: '把 CSV 汇总成月报', source: {id: 'awesome', title: 'Awesome DSH'}},
  ]);
  assert.deepEqual(result.sources, [
    {id: 'awesome', title: 'Awesome DSH', status: 'live', total: 9},
    {id: 'github-topic', title: 'GitHub topic', status: 'failed', total: 0},
  ]);
  assert.equal(result.searchedAt, '2026-11-04T10:00:00.000Z');
  assert.match(result.limits.join('\n'), /未安装、未运行/);
  assert.match(result.limits.join('\n'), /GitHub topic 本轮读取失败/);
});

test('searchOnly rejects invalid limits and needs without calling discovery', async () => {
  let calls = 0;
  const service = createFinderService({
    discovery: {search: async () => { calls += 1; return discovered; }},
    model: {},
  });
  for (const input of [{need: ''}, {need: 'ok', limit: 0}, {need: 'ok', limit: 7}, {need: 'ok', limit: 1.5}, {need: 'x'.repeat(6001)}]) {
    await assert.rejects(service.searchOnly(input), error => error.code === 'INVALID_INPUT');
  }
  assert.equal(calls, 0);
});

test('finder_search validates model input and returns the read-only result shape', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'finder-search-')));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const agent = {id: 'session-owner', session: {id: 'session-owner'}};
  const workspace = {id: 'workspace-owner', path: directory, sessionIds: [agent.id]};
  const definitions = new Map();
  const calls = [];
  const ctx = {
    effect() {}, tools: {register(definition) { definitions.set(definition.name, definition); return () => definitions.delete(definition.name); }, get: () => undefined, schemas: () => []},
    systemPrompt: {section: () => () => {}},
    workspaceRegistry: {list: () => [workspace], resolveByPath: async () => workspace},
    workingDirectory: {get: () => directory},
    sandboxPolicy: {resolve: () => ({mode: 'workspace-write'})},
    get: () => undefined,
  };
  const service = {
    async searchOnly(input, options) {
      calls.push({input, options});
      return {candidates: [{id: 'pkg-a', title: 'CSV 月报插件', source: {id: 'awesome', title: 'Awesome DSH'}}], sources: [{id: 'awesome', title: 'Awesome DSH', status: 'live', total: 9}], searchedAt: '2026-11-04T10:00:00.000Z', limits: ['只读，未安装。']};
    },
  };
  const cleanup = registerAgentTools(ctx, service, {defineTool: definition => definition, approveEscalation: async () => {}});
  const tool = definitions.get('finder_search');
  assert.ok(tool, 'finder_search must be registered as the fifth tool');
  assert.match(tool.description, /只读|不安装|不发布/);
  const exec = {agent, callId: 'call-search', signal: new AbortController().signal};
  const result = JSON.parse(await tool.execute({need: '把本地 CSV 整理成月报'}, exec));
  assert.deepEqual(Object.keys(result).sort(), ['candidates', 'limits', 'searchedAt', 'sources']);
  assert.deepEqual(result.candidates[0].source, {id: 'awesome', title: 'Awesome DSH'});
  assert.equal(result.sources[0].status, 'live');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.limit, 6);
  assert.equal(calls[0].options.signal.aborted, false);
  for (const args of [{}, {need: ''}, {need: '   '}, {need: 'ok', limit: 0}, {need: 'ok', limit: 7}, {need: 'ok', limit: 1.5}, {need: 'ok', extra: true}]) {
    await assert.rejects(tool.execute(args, exec), error => error.code === 'INVALID_INPUT');
  }
  assert.equal(calls.length, 1);
  await cleanup();
  assert.equal(definitions.size, 0);
});
