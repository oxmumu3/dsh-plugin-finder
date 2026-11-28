import test from 'node:test';
import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiscovery } from '../src/discovery.js';
import { browseCommunity, communityQualityScore, getCommunityEntry, isMonorepoSubpath } from '../src/community-catalog.js';
import { createCommunityView } from '../src/community-view.js';
import { createHomeView } from '../src/v8-home-view.js';
import { createPlanSurface } from '../src/v8-plan-view.js';
import { supportsCreatorHost } from '../src/creator-handoff.js';
import { inferCapabilities } from '../catalog/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const React = {
  Fragment: Symbol.for('react.fragment'),
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
};
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.children)] : [];
const text = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join(' ') : text(node.children);

test('searchSelected upgrades stale incompatible npm snapshot to newest compatible version from same repository', async () => {
  const entry = getCommunityEntry('https://github.com/bioaievolu/dsh-md-studio');
  assert.ok(entry?.npmName && entry?.version);
  const upgradedVersion = '9.9.0';
  const sha = 'a'.repeat(40);
  const fetchImpl = async url => {
    const u = String(url);
    if (u.toLowerCase() === 'https://api.github.com/repos/bioaievolu/dsh-md-studio') return Response.json({ full_name: 'BioAIEvolu/dsh-md-studio' });
    if (u === `https://registry.npmjs.org/${entry.npmName}/${entry.version}`) {
      return Response.json({
        name: entry.npmName, version: entry.version, description: 'Markdown studio',
        repository: { url: 'https://github.com/BioAIEvolu/dsh-md-studio' },
        engines: { dsh: '0.2.1-rc.2' },
        gitHead: sha,
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      });
    }
    if (u === `https://registry.npmjs.org/${entry.npmName}`) {
      return Response.json({
        name: entry.npmName,
        'dist-tags': { latest: upgradedVersion },
        versions: {
          [entry.version]: { name: entry.npmName, version: entry.version, repository: { url: 'https://github.com/BioAIEvolu/dsh-md-studio' }, engines: { dsh: '0.2.1-rc.2' } },
          [upgradedVersion]: { name: entry.npmName, version: upgradedVersion, repository: { url: 'https://github.com/BioAIEvolu/dsh-md-studio' }, engines: { dsh: '>=0.2.2-rc.1 <0.3.0' } },
        },
      });
    }
    if (u === `https://registry.npmjs.org/${entry.npmName}/${upgradedVersion}`) {
      return Response.json({
        name: entry.npmName, version: upgradedVersion, description: 'Markdown studio upgraded',
        repository: { url: 'https://github.com/BioAIEvolu/dsh-md-studio' },
        engines: { dsh: '>=0.2.2-rc.1 <0.3.0' },
        gitHead: sha,
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      });
    }
    if (u.toLowerCase() === `https://raw.githubusercontent.com/bioaievolu/dsh-md-studio/${sha}/package.json`) {
      return Response.json({ name: entry.npmName, version: upgradedVersion });
    }
    if (u.endsWith('/README.md')) return new Response('# MD Studio');
    throw Error('unexpected fetch ' + u);
  };
  const discovery = createDiscovery({ fetchImpl });
  const result = await discovery.searchSelected({ communityEntryId: entry.id, hostVersion: '0.2.3-alpha.2', nodeVersion: '22.22.0', platform: 'darwin' });
  discovery.close();
  assert.equal(result.selected.status, 'checked');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].install.version, upgradedVersion);
  assert.equal(result.candidates[0].upgradedFromVersion, entry.version);
  assert.ok(result.warnings.some(w => w.includes(upgradedVersion) && w.includes(entry.version)));
});

test('searchSelected refuses to auto-upgrade to an npm version whose repository owner differs', async () => {
  const entry = getCommunityEntry('https://github.com/bioaievolu/dsh-md-studio');
  const fetchImpl = async url => {
    const u = String(url);
    if (u.toLowerCase() === 'https://api.github.com/repos/bioaievolu/dsh-md-studio') return Response.json({ full_name: 'BioAIEvolu/dsh-md-studio' });
    if (u === `https://registry.npmjs.org/${entry.npmName}/${entry.version}`) {
      return Response.json({
        name: entry.npmName, version: entry.version,
        repository: { url: 'https://github.com/BioAIEvolu/dsh-md-studio' },
        engines: { dsh: '0.2.1-rc.2' },
        gitHead: 'b'.repeat(40),
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      });
    }
    if (u.toLowerCase() === `https://raw.githubusercontent.com/bioaievolu/dsh-md-studio/${'b'.repeat(40)}/package.json`) {
      return Response.json({ name: entry.npmName, version: entry.version });
    }
    if (u === `https://registry.npmjs.org/${entry.npmName}`) {
      return Response.json({
        name: entry.npmName,
        'dist-tags': { latest: '9.9.9' },
        versions: {
          '9.9.9': { name: entry.npmName, version: '9.9.9', repository: { url: 'https://github.com/hijacker/evil-repo' }, engines: { dsh: '>=0.2.0' } },
        },
      });
    }
    throw Error('unexpected fetch ' + u);
  };
  const discovery = createDiscovery({ fetchImpl });
  const result = await discovery.searchSelected({ communityEntryId: entry.id, hostVersion: '0.2.3-alpha.2', nodeVersion: '22.22.0', platform: 'darwin' });
  discovery.close();
  assert.equal(result.candidates.length, 0);
  assert.equal(result.selected.status, 'incompatible');
});

test('community catalog quality score dampens monorepo subpath star inflation and supports sort & filters', () => {
  const standalone = { name: 'solo-plugin', sourceUrl: 'https://github.com/a/solo', stars: 500, npmName: 'solo-plugin', version: '1.0.0', summary: 'A focused standalone tool' };
  const monorepoItem = { name: 'huge#sub-skill', sourceUrl: 'https://github.com/a/huge#sub-skill', stars: 50000, npmName: '', version: '', summary: 'One of many skills' };
  assert.equal(isMonorepoSubpath(standalone), false);
  assert.equal(isMonorepoSubpath(monorepoItem), true);
  assert.ok(communityQualityScore(standalone) > communityQualityScore(monorepoItem));

  const npmOnly = browseCommunity({ filter: 'npm', pageSize: 24 });
  assert.ok(npmOnly.total > 0 && npmOnly.entries.every(e => Boolean(e.npmName)));

  const byStars = browseCommunity({ sort: 'stars', pageSize: 24 });
  for (let i = 1; i < byStars.entries.length; i += 1) {
    assert.ok((byStars.entries[i - 1].stars || 0) >= (byStars.entries[i].stars || 0));
  }

  const installed = browseCommunity({ filter: 'installed', installedPlugins: ['dsh-taskboard'], pageSize: 24 });
  assert.ok(installed.total >= 1);
  assert.ok(installed.entries.some(e => e.npmName === 'dsh-taskboard' || e.name.includes('dsh-taskboard')));
});

test('HomeView recent history rows are clickable buttons that call controller.openTask', () => {
  const opened = [];
  const HomeView = createHomeView(React);
  const tree = HomeView({
    state: {
      homeRequest: '',
      history: [{ taskId: 'task-abc', title: '整理发票', stage: 'plan', planKind: 'single', updatedAt: '2026-11-28T08:00:00Z' }],
      historyTotal: 1,
    },
    controller: { openTask: id => opened.push(id), showHistory: () => {}, showCommunity: () => {}, setHomeRequest: () => {}, searchHome: () => {} },
    examples: [],
    idea: null,
    featured: [],
    overview: { total: 100, categories: [] },
  });
  const rowBtn = nodes(tree).find(n => n.type === 'button' && n.props.className === 'pf8_row');
  assert.ok(rowBtn, 'recent history row should be a clickable button');
  rowBtn.props.onClick();
  assert.deepEqual(opened, ['task-abc']);
});

test('v8-plan-view marks installed have-bricks distinctly and shows progressive intent while searching', () => {
  const planView = createPlanSurface(React);
  const sol = planView.solution({
    request: '同步任务',
    plan: { kind: 'single', title: '用已有插件同步', rationale: '直接复用', pluginIds: ['@oxmumu3/dsh-superagent'], steps: [] },
    candidates: [{ id: '@oxmumu3/dsh-superagent', name: '@oxmumu3/dsh-superagent', summary: '任务看板', install: { packageName: '@oxmumu3/dsh-superagent', version: '0.3.0' } }],
    installedPlugins: ['@oxmumu3/dsh-superagent'],
    actions: [],
  });
  assert.match(text(sol), /已装好，能直接用/);
  assert.ok(nodes(sol).some(n => String(n.props.className || '').includes('pf8_blk_installed')));

  const searching = planView.searching({
    request: '把会议录音转成纪要',
    intent: { goal: '把音频转为结构化纪要', capabilities: ['语音转写', '纪要整理'] },
    progress: '已理解需求，正在核对插件来源。',
    events: [{ text: '正在核对候选插件：dsh-voice-scribe' }],
    actions: [],
  });
  assert.match(text(searching), /我的理解：/);
  assert.match(text(searching), /把音频转为结构化纪要/);
  assert.match(text(searching), /语音转写/);
  assert.match(text(searching), /dsh-voice-scribe/);
});

test('supportsCreatorHost accepts 0.2.3 and 0.2.3-alpha.2 alongside 0.2.2', () => {
  assert.equal(supportsCreatorHost('0.2.3-alpha.2'), true);
  assert.equal(supportsCreatorHost('0.2.3-rc.1'), true);
  assert.equal(supportsCreatorHost('0.2.3'), true);
  assert.equal(supportsCreatorHost('0.2.2-rc.5'), true);
  assert.equal(supportsCreatorHost('0.2.0-rc.1'), false);
});

test('CAPABILITY_TERMS infers expanded bilingual workflow categories', () => {
  assert.ok(inferCapabilities('每天自动定时发微信通知提醒').includes('messaging-im'));
  assert.ok(inferCapabilities('每天自动定时发微信通知提醒').includes('task-schedule'));
  assert.ok(inferCapabilities('管理长期记忆和个人知识库').includes('memory-knowledge'));
  assert.ok(inferCapabilities('把会议录音转写字幕').includes('voice-audio'));
  assert.ok(inferCapabilities('整理发票报销账单').includes('finance-invoice'));
});

test('CommunityView renders sort/filter pills, installed badge and market copy button', () => {
  const copied = [];
  const hooks = [];
  let idx = 0;
  const FakeReact = {
    createElement: React.createElement,
    useState(init) { const i = idx++; if (!(i in hooks)) hooks[i] = { value: init }; return [hooks[i].value, v => { hooks[i].value = v; }]; },
    useRef(init) { const i = idx++; return hooks[i] ??= { current: init }; },
    useEffect() {},
  };
  const View = createCommunityView(FakeReact);
  const tree = View({
    controller: { showCatalogPlugin() {}, closeCommunity() {} },
    installedPlugins: ['dsh-taskboard'],
    copyText: value => copied.push(value),
  });
  const txt = text(tree);
  assert.match(txt, /综合排序/);
  assert.match(txt, /按 GitHub Star/);
  assert.match(txt, /仅 npm 直装/);
  assert.match(txt, /本机已装/);
  assert.match(txt, /已安装/);
  assert.match(txt, /复制自研精选市场源/);
  const copyBtn = nodes(tree).find(n => n.type === 'button' && text(n) === '复制自研精选市场源');
  copyBtn.props.onClick();
  assert.equal(copied[0], 'https://raw.githubusercontent.com/oxmumu3/dsh-plugin-finder/main/index.json');
});

test('slimmed dist/client.js stays under 1 MiB and omits the raw 11,979 community catalog dump', async () => {
  const bundlePath = path.join(ROOT, 'dist', 'client.js');
  const info = await stat(bundlePath);
  assert.ok(info.size < 1024 * 1024, `dist/client.js should be slimmed (<1 MiB), got ${info.size} bytes`);
  const content = await readFile(bundlePath, 'utf8');
  assert.ok(!content.includes('clearai-dsh'), 'dist/client.js must not embed the 11,979-entry community catalog dump');
});
