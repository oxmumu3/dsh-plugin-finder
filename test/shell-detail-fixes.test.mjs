import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPluginDetailView } from '../src/plugin-detail-view.js';
import { v8Css } from '../src/v8-style.js';

const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.children)] : [];
const content = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(content).join(' ') : content(node.children);
const render = ({ collection = 'community', detail = {}, selection = {} } = {}) => {
  const state = {
    catalogSelection: { collection, entryId: 'demo-entry', ...selection },
    catalogDetail: {
      name: 'dsh-comfyui-image', title: '把散落的截图整理成一套图', summary: '把散落的截图整理成一套图。', description: '',
      author: 'Ethan', version: '0.4.0', requirements: [], limitations: [],
      installable: true, installation: { status: 'not-installed', installed: false, enabled: false, active: false },
      ...detail,
    },
    catalogBusy: '', catalogError: '', communityOpen: collection === 'community',
  };
  return renderPluginDetailView({ h, state, controller: { closeCatalogPlugin() {}, installCatalogPlugin() {}, refreshCatalogPlugin() {} } });
};

test('a featured plugin names the maker that the kicker already promises', () => {
  const view = render({ collection: 'featured', detail: { author: '', version: '0.4.0-preview.3' } });
  const text = content(view);
  assert.match(text, /发现好插件的作者做的，目录里记的是 0\.4\.0-preview\.3 版/);
  assert.doesNotMatch(text, /作者未记录/);
});

test('a community plugin without an author records only the version', () => {
  const view = render({ detail: { author: '', version: '1.2.0' } });
  const text = content(view);
  assert.match(text, /现在是 1\.2\.0 版/);
  assert.doesNotMatch(text, /作者未记录/);
});

test('the use line and the intro are printed once when they differ only by final punctuation', () => {
  const sentence = '把散落的截图整理成一套图';
  for (const summary of [`${sentence}。`, `${sentence}.`, ` ${sentence}！`, sentence]) {
    const view = render({ detail: { title: `${sentence}。`, summary } });
    const occurrences = content(view).split(sentence).length - 1;
    assert.equal(occurrences, 1, `kept "${summary}" twice`);
  }
  // 真的不是同一句时，介绍仍然照常显示。
  const distinct = render({ detail: { title: '把截图整理成一套图', summary: '按项目和日期分组，导出前可以逐张改名。' } });
  assert.match(content(distinct), /按项目和日期分组/);
});

test('the store list drops the legacy row padding and keeps the v8 page header scale', () => {
  const rule = selector => v8Css.split('\n').find(line => line.startsWith(`${selector} {`)) || '';
  assert.match(rule('.pf_v8 .pf8_store_list .pfv_community_entry'), /padding:\s*0/);
  assert.match(rule('.pf_v8 .pf8_store_title h1'), /clamp\(26px, 4\.6cqw, 37px\)/);
  assert.match(rule('.pf_v8 .pf8_store_title p'), /font-size:\s*15\.5px/);
  assert.match(rule('.pf_v8 .pf8_store_title p'), /line-height:\s*1\.75/);
  assert.match(rule('.pf_v8 .pf8_store_search'), /padding:\s*8px 24px/);
  assert.match(rule('.pf_v8 .pf8_store_search input'), /height:\s*40px/);
  assert.match(rule('.pf_v8 .pf8_store_search input'), /font:\s*16px/);
  assert.match(rule('.pf_v8 .pf8_store_page'), /height:\s*36px/);
  assert.match(rule('.pf_v8 .pf8_store_page'), /border:\s*1px solid var\(--line2\)/);
});

test('the 更多 menu closes on pick and on Escape and returns focus to its summary', async () => {
  const { createMoreMenu } = await import('../src/v8-menu.js');
  const refs = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useRef: () => { const ref = {}; refs.push(ref); return ref; },
  };
  const calls = [];
  let focused = 0;
  const MoreMenu = createMoreMenu(React);
  const tree = MoreMenu({ controller: { bootstrap: () => calls.push('bootstrap') }, onTelemetry: () => calls.push('telemetry'), onImport: () => calls.push('import') });
  const menu = { open: true, querySelector: () => ({ focus: () => { focused += 1; } }) };
  refs[0].current = menu;
  const items = tree.children.find(node => node && String(node.props?.className || '') === 'pf8_topmore_menu').children;
  assert.deepEqual(items.map(item => item.children[0]), ['重新读取配置', '回传设置', '导入本机备份']);
  items[0].props.onClick();
  assert.equal(menu.open, false);
  assert.equal(focused, 1);
  assert.deepEqual(calls, ['bootstrap']);
  menu.open = true;
  tree.props.onKeyDown({ key: 'Escape', stopPropagation() {} });
  assert.equal(menu.open, false);
  assert.equal(focused, 2);
  // 其他按键不收起。
  menu.open = true;
  tree.props.onKeyDown({ key: 'Tab', stopPropagation() {} });
  assert.equal(menu.open, true);
});

test('draft rows use local time and v8 controls (016)', async () => {
  const { renderFeaturedView } = await import('../src/featured-view.js');
  const createdAt = '2026-11-11T08:20:00.000Z';
  const tree = renderFeaturedView({
    h, state: { featuredDrafts: [{ id: 'draft-1', request: '把每周进展整理成一页简报', createdAt }] },
    controller: {}, copyText: () => {}, busy: false, mode: 'drafts',
  });
  const text = content(tree);
  assert.doesNotMatch(text, /UTC/);
  const at = new Date(Date.parse(createdAt));
  const expected = `${at.getMonth() + 1}月${at.getDate()}日 ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  assert.ok(text.includes(expected), `expected ${expected} in ${text}`);
  const buttons = nodes(tree).filter(node => node.type === 'button');
  const restore = buttons.find(node => content(node) === '恢复草稿');
  const remove = buttons.find(node => content(node) === '移除这份输入');
  assert.match(String(restore.props.className), /pf8_btn/);
  assert.match(String(remove.props.className), /pf8_lnk|pf8_lk/);
});

test('component factories live outside Workbench so state changes cannot remount them (015/016)', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8');
  const workbench = source.indexOf('function Workbench(');
  for (const factory of ['const MoreMenu = createMoreMenu(React);', 'const HistoryView = createHistoryView(React);']) {
    const at = source.indexOf(factory);
    assert.ok(at > 0, `${factory} missing`);
    assert.ok(at < workbench, `${factory} must be created outside Workbench`);
  }
  // 外壳提示条不依赖只在内层定义的 --line/--ink，并跟着当前页版心。
  const { v8Css } = await import('../src/v8-style.js');
  const banner = v8Css.split('\n').find(line => line.startsWith('.pf_root.pf_v2 .pf_banner {'));
  assert.match(banner, /--dsw-alias-border-l2/);
  assert.match(banner, /--dsw-alias-label-primary/);
  assert.match(v8Css, /:has\(\.pf8_histwrap\) \.pf_banner \{ max-width: 840px/);
  assert.match(v8Css, /:has\(\.pf8_narrow\) \.pf_banner \{ max-width: 780px/);
  assert.match(v8Css, /\.pf_v8\.pf_telemetry \.pf_btn/);
});

test('the host opportunity card keeps its branches and adopts the v8 card shell', async () => {
  const { renderOpportunityCard } = await import('../src/opportunity-view.js');
  const calls = [];
  const entry = { id: 'opp-1', title: '把周报整理成一页', expectedResult: '每周五出一页带出处的简报', observation: '你上周手动汇总过周报', evidenceRefs: [], suggestedRequest: '每周五汇总项目进展' };
  const tree = renderOpportunityCard({ h, state: { opportunity: { status: 'ready', consent: { enabled: true }, opportunities: [entry], restorableFeedbackCount: 0 } }, controller: { adoptOpportunity: id => calls.push(['adopt', id]) }, modelReady: true });
  const all = nodes(tree);
  assert.ok(all.some(node => String(node.props?.className || '').includes('pf8_oppcard')));
  // 旧标题节点仍在树里（由 CSS 隐藏），没有删掉任何真实分支。
  assert.ok(all.some(node => node.type === 'h2' && String(node.props?.className || '').includes('pfv_home_heading')));
  all.find(node => node.type === 'button' && content(node) === '试试这个办法').props.onClick();
  assert.deepEqual(calls[0], ['adopt', 'opp-1']);
  const failed = renderOpportunityCard({ h, state: { opportunity: { status: 'failed', consent: { enabled: true }, opportunities: [], lastError: { message: '读取参考资料时连接中断' } } }, controller: {}, modelReady: true });
  assert.ok(content(failed).includes('这次还没看完'));
  assert.ok(content(failed).includes('读取参考资料时连接中断'));
  const running = renderOpportunityCard({ h, state: { opportunity: { status: 'running', consent: { enabled: true }, opportunities: [] }, opportunityBusy: 'opportunity-discover' }, controller: {}, modelReady: true });
  assert.ok(content(running).includes('我在找更好的办法'));
  assert.ok(nodes(running).some(node => node.type === 'button' && content(node) === '停止查找'));
});

test('补齐 copy follows the real block count and the history back link uses the compound selector', async () => {
  const { hybridInstallCopy } = await import('../src/v8-plan-view.js');
  assert.equal(hybridInstallCopy(1), '先装好现成的那一块，再在发现好插件里补缺的。');
  assert.equal(hybridInstallCopy(2), '先装好现成的 2 块，再在发现好插件里补缺的。');
  assert.equal(hybridInstallCopy(4), '先装好现成的 4 块，再在发现好插件里补缺的。');
  assert.doesNotMatch(hybridInstallCopy(3), /两块|那一块/);
  const { v8Css } = await import('../src/v8-style.js');
  assert.match(v8Css, /\.pf_v8\.pf8_flowback \{ width: calc\(100% - 80px\); max-width: 840px/);
  assert.equal(/\.pf_v8 \.pf8_flowback/.test(v8Css), false);
  assert.match(v8Css, /\.pf8_drafts \.pf8_draft_head h2 \{ font-size: 14px/);
});

test('the single opportunity card keeps one of three columns and the history rows use a Chinese comma', async () => {
  const { v8Css } = await import('../src/v8-style.js');
  assert.match(v8Css, /\.pf8_oppcard \{[^}]*max-width: calc\(\(100% - 32px\) \/ 3\)/);
  assert.match(v8Css, /\.pf8_sec \.pfv_home_scenario:not\(\.pf8_oppcard\) \{ border-top: 0; padding-top: 0; margin-top: 0; \}/);
  assert.match(v8Css, /@container finder \(max-width: 700px\) \{ \.pf_v8 \.pf8_oppcard \{ max-width: none; \} \}/);
  assert.match(v8Css, /\.pf8_drafts \.pf8_draft_head \{[^}]*justify-content: flex-start/);
  const { readFileSync } = await import('node:fs');
  const history = readFileSync(new URL('../src/v8-history-view.js', import.meta.url), 'utf8');
  assert.doesNotMatch(history, / \u00b7 /);
  assert.match(history, /\$\{status\.say\}，/);
});

test('history draft rows draw one separator, not two', async () => {
  const { v8Css } = await import('../src/v8-style.js');
  assert.match(v8Css, /\.pf8_drafts \.pf_featured_draft \{[^}]*border-top: 0; border-bottom: 1px solid var\(--line\)/);
});
