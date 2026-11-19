import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { communityCatalog } from '../src/community-catalog-data.js';
import {
  browseCommunity,
  getActiveCommunityCatalog,
  getCommunityEntry,
  getCommunityOverview,
  normalizeLiveCommunityCatalog,
  resetActiveCommunityCatalog,
} from '../src/community-catalog.js';
import { createCommunityRefresher } from '../src/community-refresh.js';
import { createCommunityView } from '../src/community-view.js';

function syntheticRaw(base = communityCatalog, { extraPlugins = [], updated = '2026-11-25' } = {}) {
  const plugins = base.entries.map(entry => ({
    name: entry.name,
    owner: entry.owner,
    url: entry.repositoryUrl,
    description: { zh: entry.summary },
    category: entry.sourceCategory,
    npm: entry.npmName,
    version: entry.version,
    stars: entry.stars,
  }));
  return { name: 'awesome-dsh-plugin', source: base.sourceRepository, updated, plugins: [...plugins, ...extraPlugins] };
}

test('refresher stays idle within 24h, refreshes in background after 24h, and cools down on repeat bootstrap', async t => {
  t.after(() => resetActiveCommunityCatalog());
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'finder-refresh-')));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const baseMs = Date.parse(communityCatalog.fetchedAt);
  let clockMs = baseMs + 2 * 60 * 60 * 1000;
  let fetchCount = 0;
  const rawNext = syntheticRaw(communityCatalog, {
    extraPlugins: [{
      name: 'dsh-brand-new-sync',
      owner: 'newauthor',
      url: 'https://github.com/newauthor/dsh-brand-new-sync',
      description: { zh: '24 小时后台自动同步新增示例插件。' },
      category: 'tools',
      npm: '@newauthor/dsh-brand-new-sync',
      version: '1.0.0',
      stars: 12,
    }],
  });

  const refresher = createCommunityRefresher({
    cacheHome: home,
    now: () => clockMs,
    allowRefreshInTests: true,
    fetchImpl: async () => {
      fetchCount += 1;
      await delay(10);
      return Response.json(rawNext);
    },
  });
  t.after(() => refresher.close());

  const early = await refresher.maybeRefresh();
  assert.equal(early.refreshing, false);
  assert.equal(early.total, communityCatalog.total);
  assert.equal(fetchCount, 0);

  // Advance past 24 hours; maybeRefresh must return immediately while refreshing asynchronously.
  clockMs = baseMs + 24 * 60 * 60 * 1000 + 1000;
  const started = await refresher.maybeRefresh();
  assert.equal(started.refreshing, true);
  assert.equal(started.total, communityCatalog.total);

  // Calling maybeRefresh again during flight must be single-flight.
  await refresher.maybeRefresh();
  assert.equal(fetchCount, 1);

  for (let i = 0; i < 40 && refresher.status().refreshing; i += 1) await delay(15);
  assert.equal(refresher.status().refreshing, false);
  assert.equal(refresher.status().source, 'refreshed');
  assert.equal(getCommunityOverview().total, communityCatalog.total + 1);
  assert.ok(getCommunityEntry('https://github.com/newauthor/dsh-brand-new-sync'));
  assert.ok(browseCommunity({ query: 'dsh-brand-new-sync' }).entries.some(e => e.name === 'dsh-brand-new-sync'));

  // Subsequent checks within 24h must not hit network again.
  clockMs += 30 * 60 * 1000;
  await refresher.maybeRefresh();
  assert.equal(fetchCount, 1);

  const saved = JSON.parse(await fs.readFile(path.join(home, 'cache', 'plugin-finder', 'community', 'catalog-v1.json'), 'utf8'));
  assert.equal(saved.catalog.total, communityCatalog.total + 1);
});

test('cold restart loads persisted fresher cache from disk without any network call', async t => {
  t.after(() => resetActiveCommunityCatalog());
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'finder-refresh-restart-')));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  const baseMs = Date.parse(communityCatalog.fetchedAt);
  let clockMs = baseMs + 25 * 60 * 60 * 1000;
  const rawNext = syntheticRaw(communityCatalog, {
    extraPlugins: [{
      name: 'dsh-persisted-plugin',
      owner: 'cacheowner',
      url: 'https://github.com/cacheowner/dsh-persisted-plugin',
      description: { zh: '验证重启优先读本机持久化目录。' },
      category: 'workflow',
      npm: null,
      version: null,
    }],
  });

  const first = createCommunityRefresher({
    cacheHome: home,
    now: () => clockMs,
    allowRefreshInTests: true,
    fetchImpl: async () => Response.json(rawNext),
  });
  await first.refreshNow();
  first.close();

  resetActiveCommunityCatalog();
  assert.equal(getCommunityOverview().total, communityCatalog.total);

  let secondFetch = 0;
  clockMs += 10 * 60 * 1000;
  const second = createCommunityRefresher({
    cacheHome: home,
    now: () => clockMs,
    allowRefreshInTests: true,
    fetchImpl: async () => { secondFetch += 1; throw Error('should not fetch within 24h'); },
  });
  t.after(() => second.close());

  const status = await second.maybeRefresh();
  assert.equal(secondFetch, 0);
  assert.equal(status.source, 'refreshed');
  assert.equal(status.total, communityCatalog.total + 1);
  assert.ok(getCommunityEntry('https://github.com/cacheowner/dsh-persisted-plugin'));
});

test('failed network fetch, truncated payload, and symlinked cache dir fall back safely and honor failure cooldown', async t => {
  t.after(() => resetActiveCommunityCatalog());
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'finder-refresh-fail-')));
  t.after(() => fs.rm(home, { recursive: true, force: true }));

  let clockMs = Date.parse(communityCatalog.fetchedAt) + 25 * 60 * 60 * 1000;
  let calls = 0;
  const failing = createCommunityRefresher({
    cacheHome: home,
    now: () => clockMs,
    allowRefreshInTests: true,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response('upstream error', { status: 503 })
        : Response.json({ name: 'awesome-dsh-plugin', updated: '2026-11-25', plugins: [communityCatalog.entries[0]].map(e => ({ name: e.name, owner: e.owner, url: e.repositoryUrl, category: e.sourceCategory })) });
    },
  });
  t.after(() => failing.close());

  await failing.refreshNow();
  assert.equal(calls, 1);
  assert.equal(getActiveCommunityCatalog().total, communityCatalog.total);

  // Within failure cooldown (30m), maybeRefresh must not retry.
  clockMs += 5 * 60 * 1000;
  await failing.maybeRefresh();
  assert.equal(calls, 1);

  // Past cooldown, a truncated (< 50%) upstream catalog must be rejected, preserving bundled snapshot.
  clockMs += 31 * 60 * 1000;
  await failing.maybeRefresh();
  for (let i = 0; i < 40 && failing.status().refreshing; i += 1) await delay(15);
  assert.equal(calls, 2);
  assert.equal(getActiveCommunityCatalog().total, communityCatalog.total);

  // Symlinked cache directory must never crash refresh or write through link.
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'finder-refresh-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.mkdir(path.join(home, 'cache', 'plugin-finder'), { recursive: true });
  await fs.rm(path.join(home, 'cache', 'plugin-finder', 'community'), { recursive: true, force: true });
  await fs.symlink(outside, path.join(home, 'cache', 'plugin-finder', 'community'));
  await failing.ingestLiveCatalog(syntheticRaw(communityCatalog), new Date(clockMs + 1000).toISOString());
  assert.deepEqual(await fs.readdir(outside), []);
});

test('normalizeLiveCommunityCatalog excludes piggy00544, skips malformed rows, preserves 18 previews, and maps future categories', () => {
  const raw = syntheticRaw(communityCatalog, {
    extraPlugins: [
      { name: 'legacy', owner: 'piggy00544', url: 'https://github.com/piggy00544/dsh-workproof', category: 'workflow', description: { zh: 'should be excluded' } },
      { name: 'bad-url', owner: 'someone', url: 'javascript:alert(1)', category: 'tools', description: 'bad' },
      { name: 'future-plugin', owner: 'future', url: 'https://github.com/future/dsh-future-category', category: 'quantum-new-category', description: { zh: '未见过的未来上游分类也能安全展示。' } },
    ],
  });
  const normalized = normalizeLiveCommunityCatalog(raw, { fetchedAt: '2026-11-26T00:00:00Z' });
  assert.equal(normalized.total, communityCatalog.total + 1);
  assert.equal(normalized.excludedTotal, 1);
  assert.equal(normalized.rejectedTotal, 1);
  assert.doesNotMatch(JSON.stringify(normalized), /piggy00544/i);
  assert.equal(normalized.entries.filter(entry => entry.preview).length, 18);
  const futureEntry = normalized.entries.find(entry => entry.name === 'future-plugin');
  assert.equal(futureEntry?.categoryId, 'work');
});

test('client controller syncs refreshed community snapshot into Store UI when bootstrap advertises newer data', async t => {
  t.after(() => resetActiveCommunityCatalog());
  const rawNext = syntheticRaw(communityCatalog, {
    extraPlugins: [{
      name: 'dsh-ui-refreshed-demo',
      owner: 'uidemo',
      url: 'https://github.com/uidemo/dsh-ui-refreshed-demo',
      description: { zh: '客户端热同步展示新插件。' },
      category: 'tools',
      npm: null,
      version: null,
    }],
  });
  const refreshedCatalog = normalizeLiveCommunityCatalog(rawNext, { fetchedAt: '2099-01-01T00:00:00Z' });

  const tags = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect() {},
    useRef: initial => ({ current: initial }),
  };
  const apiCalls = [];
  const fetch = async url => {
    apiCalls.push(String(url));
    if (String(url) === '/api/plugin_finder/bootstrap') {
      return Response.json({
        version: '0.13.4',
        model: { configured: true, label: '默认模型' },
        communitySync: {
          fetchedAt: refreshedCatalog.fetchedAt,
          total: refreshedCatalog.total,
          refreshing: false,
          source: 'refreshed',
        },
      });
    }
    if (String(url) === '/api/plugin_finder/community-snapshot') {
      return Response.json({
        status: { fetchedAt: refreshedCatalog.fetchedAt, total: refreshedCatalog.total, refreshing: false, source: 'refreshed' },
        catalog: refreshedCatalog,
      });
    }
    if (String(url) === '/api/plugin_finder/catalog-detail') {
      return Response.json({ entry: { id: 'https://github.com/uidemo/dsh-ui-refreshed-demo', name: 'dsh-ui-refreshed-demo' }, candidate: null, unavailableReason: '' });
    }
    throw Error('unexpected url: ' + url);
  };
  const globals = {
    window: {},
    React,
    document: { createElement: () => ({ dataset: {}, textContent: '', remove() {} }), head: { appendChild: tNode => tags.push(tNode) } },
    AbortController, AbortSignal, URL, setTimeout, clearTimeout, console,
    fetch,
  };
  const scope = vm.createContext(globals);
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('../src/client.js', import.meta.url))],
    bundle: true,
    format: 'iife',
    globalName: 'clientModule',
    platform: 'browser',
    external: ['react', '@deepseek-ai/dsh-client-ui-primitives'],
    write: false,
  });
  globals.require = name => name === '@deepseek-ai/dsh-client-ui-primitives'
    ? { MarkdownText: () => null, MarkdownDelegateProvider: p => p.children }
    : React;
  vm.runInContext(compiled.outputFiles[0].text, scope, { filename: 'client.js' });

  const ctx = {
    workspaces: { list: { getSnapshot: () => ({ phase: 'ready', items: [] }), subscribe: () => () => {} } },
    effect: () => {},
  };
  const controller = globals.clientModule.createFinderController(ctx, { fetch });
  t.after(() => controller.close());

  await controller.bootstrap();
  for (let i = 0; i < 30 && !controller.getSnapshot().communitySyncedAt; i += 1) await delay(10);

  assert.deepEqual(apiCalls, ['/api/plugin_finder/bootstrap', '/api/plugin_finder/community-snapshot']);
  assert.equal(controller.getSnapshot().communitySyncedAt, refreshedCatalog.fetchedAt);
  await controller.showCatalogPlugin('community', 'https://github.com/uidemo/dsh-ui-refreshed-demo');
  assert.equal(controller.getSnapshot().catalogSelection?.entryId, 'https://github.com/uidemo/dsh-ui-refreshed-demo');

  const text = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join(' ') : text(node.children);
  const StoreView = createCommunityView(React);
  assert.match(text(StoreView({ controller })), new RegExp(communityCatalog.total.toLocaleString('en-US')));
  const { setActiveCommunityCatalog } = await import('../src/community-catalog.js');
  setActiveCommunityCatalog(refreshedCatalog);
  assert.match(text(StoreView({ controller })), new RegExp((communityCatalog.total + 1).toLocaleString('en-US')));
});
