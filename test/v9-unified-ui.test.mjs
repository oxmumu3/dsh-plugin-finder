import assert from 'node:assert/strict';
import test from 'node:test';
import { finderCss } from '../src/client-style.js';
import { experienceCss } from '../src/experience-style.js';
import { v8DarkFallbackCss, v8TokensCss } from '../src/v8-tokens.js';
import { v8Css } from '../src/v8-style.js';
import { attachDialogLightDismiss, createConfirmDialog } from '../src/v8-menu.js';
import { createPlanSurface, sourceFunnelSteps } from '../src/v8-plan-view.js';
import { createCommunityView } from '../src/community-view.js';
import { renderPluginDetailView } from '../src/plugin-detail-view.js';
import { createCreatorDock, creatorProgress, creatorStripCss } from '../src/creator-strip.js';

const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
const nodes = node => Array.isArray(node)
  ? node.flatMap(nodes)
  : node && typeof node === 'object' ? [node, ...nodes(node.children)] : [];
const hasClass = (node, cls) => String(node?.props?.className || '').split(/\s+/).includes(cls);
const content = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(content).join(' ') : content(node.children);

const fakeReact = (hooks = {}) => ({
  Fragment: Symbol.for('react.fragment'),
  createElement: h,
  useRef: initial => ({ current: hooks.ref ?? initial }),
  useState: initial => [typeof initial === 'function' ? initial() : initial, hooks.setState || (() => {})],
  useEffect: hooks.useEffect || (() => {}),
});

test('unified stylesheets remove universal star resets, own scroll-port, gate hovers, and style modal backdrop', () => {
  for (const sheet of [finderCss, v8Css, experienceCss, creatorStripCss]) {
    assert.doesNotMatch(sheet, /(?:\.pf_root|\.pf_v8)\s*\*\s*\{/);
  }
  assert.match(v8TokensCss, /:where\(\.pf_root,\s*\.pf_v8\)/);
  assert.match(v8TokensCss, /color-scheme:\s*light dark/);
  assert.match(v8DarkFallbackCss, /prefers-color-scheme:\s*dark/);
  assert.match(finderCss, /\.pf_root\{[^}]*overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;container-type:inline-size;container-name:finder/);
  assert.match(finderCss, /\.pf_example:hover:not\(:disabled\)/);
  assert.match(finderCss, /dialog\.pf_modal\{[^}]*\}/);
  assert.doesNotMatch(finderCss, /dialog\.pf_modal\{[^}]*display:/);
  assert.match(finderCss, /dialog\.pf_modal:modal\{overscroll-behavior:contain\}/);
  assert.match(finderCss, /dialog\.pf_modal::backdrop\{[^}]*overflow:hidden;overscroll-behavior:contain/);
  assert.match(v8Css, /\.pf_v8 \.pf8_btn:hover:not\(:disabled\)/);
  assert.match(v8Css, /\.pf_v8 \.pf8_pill:hover:not\(:disabled\)/);
  assert.match(v8Css, /@container bricks \(max-width:\s*520px\)/);
  assert.match(v8Css, /\.pf_v8 \.pf8_blk code\s*\{[^}]*word-break:\s*keep-all;\s*overflow-wrap:\s*break-word/);
  assert.match(v8Css, /\.pf_root\.pf_v2\s*>\s*\.pf_inner\s*\{\s*max-width:\s*none;\s*padding:\s*16px 0 0;/);
});

test('v8-plan-view renders interlocking bricks, truthful funnel steps, evolution blueprint, and non-nested tentative card', () => {
  const surface = createPlanSurface(fakeReact());
  const candidates = [
    { id: 'c1', name: 'dsh-pdf-reader', summary: '读 PDF 页码', capability: '抽取正文', version: '1.4.0' },
    { id: 'c2', name: 'dsh-unused', summary: '只做导出' },
  ];
  const discovery = { sources: [{ id: 'awesome', title: '社区目录', status: 'live', total: 406, used: 2, fetchedAt: new Date().toISOString(), catalogUpdatedAt: new Date().toISOString() }] };
  const plan = {
    kind: 'hybrid',
    title: '现成的拼起来，再补一块导出总结',
    rationale: '主读取插件能直接用，补一个小导出块就能跑通。',
    pluginIds: ['c1'],
    gaps: [{ capability: 'markdown-digest', reason: '按条目归档成周报' }],
    steps: [{ owner: 'c1', capability: '读取 PDF 正文' }, { owner: 'create', capability: '生成归档总结' }],
  };

  assert.deepEqual(sourceFunnelSteps({}), []);
  assert.deepEqual(
    sourceFunnelSteps({ discovery, candidates, plan }).map(step => [step.id, step.value]),
    [['catalog', '406'], ['candidates', '2 个'], ['selected', '1 个'], ['build', '1 块']],
  );

  const card = surface.solution({ request: '每周汇总 PDF 资料', plan, candidates, discovery, searchedAt: new Date().toISOString() });
  const all = nodes(card);
  assert.equal(all.filter(n => hasClass(n, 'pf8_fit_wrap')).length, 1);
  assert.equal(all.filter(n => hasClass(n, 'pf8_conn')).length, 1);
  assert.equal(all.filter(n => hasClass(n, 'pf8_blk_top')).length, 2);
  for (const blk of all.filter(n => hasClass(n, 'pf8_blk'))) {
    const code = nodes(blk).find(n => n.type === 'code');
    assert.ok(code);
    assert.equal(nodes(code).filter(n => n.type === 'svg').length, 0);
  }
  assert.equal(all.filter(n => hasClass(n, 'pf8_funnel')).length, 1);
  assert.equal(all.filter(n => hasClass(n, 'pf8_evo_bar')).length, 1);
  assert.equal(all.filter(n => hasClass(n, 'pf8_blueprint')).length, 1);

  const incomplete = surface.incomplete({
    request: '试查',
    discovery,
    tentative: surface.solution({ request: '试查', plan, candidates, discovery, compact: true, embedded: true }),
  });
  const incNodes = nodes(incomplete);
  assert.equal(incNodes.filter(n => hasClass(n, 'pf8_card')).length, 1);
  assert.equal(incNodes.filter(n => hasClass(n, 'pf8_tentative')).length, 1);
});

test('community-view category share bars contain zero extra buttons and plugin-detail keeps enabled button budget intact', () => {
  const CommunityView = createCommunityView(fakeReact());
  const communityTree = CommunityView({ controller: { showHome: () => {}, showCatalogPlugin: () => {} } });
  const shareBox = nodes(communityTree).find(n => hasClass(n, 'pf8_store_shares'));
  assert.ok(shareBox);
  assert.equal(nodes(shareBox).filter(n => n.type === 'button').length, 0);

  const calls = [];
  const detailTree = renderPluginDetailView({
    h,
    state: {
      bootstrap: { hostVersion: '0.2.2-rc.3' },
      catalogSelection: { collection: 'featured', entryId: 'agent-twin' },
      catalogDetail: {
        collection: 'featured', entryId: 'agent-twin', name: 'dsh-agent-twin', title: 'AI 分身',
        summary: '总结知识', author: '牛村木木山', version: '1.2.3', installable: true,
        sourceUrl: 'https://github.com/oxmumu3/ai-twin-starter',
        installation: { status: 'not-installed', installed: false, enabled: false, active: false },
      },
      catalogBusy: '',
      catalogError: '',
    },
    controller: { closeCatalogPlugin: () => {}, installCatalogPlugin: () => calls.push('installed'), refreshCatalogPlugin: () => {} },
    onRequestConfirm: spec => calls.push(['confirm', spec.title, spec.confirmLabel, spec.onConfirm]),
  });

  const fitInline = nodes(detailTree).find(n => hasClass(n, 'pf8_fit_inline'));
  assert.ok(fitInline);
  const summary = nodes(fitInline).find(n => n.type === 'summary');
  assert.ok(summary);
  assert.equal(nodes(summary).filter(n => /^h[1-6]$/.test(String(n.type))).length, 0);
  assert.equal(nodes(fitInline).filter(n => n.type === 'button').length, 0);

  const installBtn = nodes(detailTree).find(n => n.type === 'button' && content(n) === '安装插件');
  assert.ok(installBtn);
  installBtn.props.onClick();
  assert.equal(calls[0][0], 'confirm');
  calls[0][3]();
  assert.equal(calls[1], 'installed');
});

test('CreatorDock renders hairline stage lessons grounded by stage id with no headings in summary', () => {
  const Dock = createCreatorDock(fakeReact());
  const runTree = Dock({ mode: 'run', progress: creatorProgress([{ stage: 'skeleton', summary: '搭空架子' }]) });
  const lessons = nodes(runTree).find(n => hasClass(n, 'pfc_lessons'));
  assert.ok(lessons);
  const sum = nodes(lessons).find(n => n.type === 'summary');
  assert.ok(sum);
  assert.equal(nodes(sum).filter(n => /^h[1-6]$/.test(String(n.type))).length, 0);
  assert.match(content(lessons), /ctx\.effect|空架子/);

  const stuckTree = Dock({ mode: 'stuck', progress: creatorProgress([{ stage: 'blocked', step: 3, summary: '卡在挂载' }]) });
  assert.match(content(nodes(stuckTree).find(n => hasClass(n, 'pfc_lessons'))), /连改三轮没好/);
});

test('ConfirmDialog uses native closedby="any" without role="dialog" or aria-modal, and coordinate light-dismiss ignores drags', () => {
  const ConfirmDialog = createConfirmDialog(fakeReact());
  assert.equal(ConfirmDialog({ modal: null }), null);

  let confirmed = 0;
  let dismissed = 0;
  const modalTree = ConfirmDialog({
    modal: {
      title: '确认使用这个方案？',
      body: '会在工作区执行。',
      facts: [{ label: '用到插件', value: 'demo' }],
      showWorkspacePicker: true,
      confirmLabel: '确认执行',
      onConfirm: () => { confirmed += 1; },
    },
    workspaceId: 'ws-1',
    workspaces: [{ workspaceId: 'ws-1', title: '默认工作区' }],
    onDismiss: () => { dismissed += 1; },
  });
  const dialogNode = nodes(modalTree).find(n => n.type === 'dialog');
  assert.ok(dialogNode);
  assert.equal(dialogNode.props.closedby, 'any');
  assert.equal(dialogNode.props.role, undefined);
  assert.equal(dialogNode.props['aria-modal'], undefined);
  assert.ok(nodes(dialogNode).find(n => n.type === 'button' && n.props['aria-label'] === '关闭对话框'));
  const confirmBtn = nodes(dialogNode).find(n => n.type === 'button' && content(n) === '确认执行');
  confirmBtn.props.onClick();
  assert.equal(confirmed, 1);
  assert.equal(dismissed, 1);

  const listeners = {};
  let closeCalls = 0;
  let callbackDismiss = 0;
  const fakeDialog = {
    open: true,
    getBoundingClientRect: () => ({ left: 100, top: 100, right: 300, bottom: 300 }),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: (name, fn) => { if (listeners[name] === fn) delete listeners[name]; },
    close: () => { closeCalls += 1; fakeDialog.open = false; },
  };
  const detach = attachDialogLightDismiss(fakeDialog, () => { callbackDismiss += 1; });
  if (typeof HTMLDialogElement === 'undefined' || !('closedBy' in HTMLDialogElement.prototype)) {
    // Selection drag starting inside (150,150) and ending outside (10,10) must NOT dismiss.
    listeners.pointerdown({ clientX: 150, clientY: 150 });
    listeners.pointerup({ clientX: 10, clientY: 10 });
    assert.equal(closeCalls, 0);
    // True click outside (20,20) dismisses.
    listeners.pointerdown({ clientX: 20, clientY: 20 });
    listeners.pointerup({ clientX: 20, clientY: 20 });
    assert.equal(closeCalls, 1);
    assert.equal(callbackDismiss, 1);
  }
  detach();
});
