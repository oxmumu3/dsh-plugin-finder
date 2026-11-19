import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalPluginKey,
  estimateDetailInstallSavings,
  estimatePlanSavings,
  formatWanTokens,
  isWorkbenchPlugin,
  normalizeTokenSavings,
  summarizeTokenSavingsLedger,
} from '../src/token-savings.js';
import { createHomeView } from '../src/v8-home-view.js';
import { createPlanSurface } from '../src/v8-plan-view.js';
import { createExperienceView } from '../src/experience-view.js';
import { createTokenLedgerDialog } from '../src/v8-menu.js';
import { renderPluginDetailView } from '../src/plugin-detail-view.js';
import { v8Css } from '../src/v8-style.js';

const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
const resolve = node => (node && typeof node === 'object' && !Array.isArray(node) && typeof node.type === 'function' ? resolve(node.type(node.props)) : node);
const nodes = node => {
  const value = resolve(node);
  return Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.children)] : [];
};
const hasClass = (node, cls) => String(node?.props?.className || '').split(/\s+/).includes(cls);
const content = (node, visible = false) => {
  const value = resolve(node);
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.map(c => content(c, visible)).join(' ');
  const child = visible && value.type === 'details' && !value.props?.open
    ? (Array.isArray(value.children) ? value.children.find(c => c?.type === 'summary') : null)
    : value.children;
  return content(child, visible);
};
const fakeReact = () => ({
  Fragment: Symbol.for('react.fragment'),
  createElement: h,
  useRef: v => ({ current: v }),
  useState: v => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
});

test('estimatePlanSavings computes exact conservative benchmarks and suppresses native plans', () => {
  assert.equal(estimatePlanSavings({ plan: { kind: 'native', pluginIds: [] } }), null);
  assert.equal(estimatePlanSavings({ plan: null }), null);

  const stdCand = { id: 'c1', name: 'dsh-md-studio', install: { packageName: 'dsh-md-studio' } };
  const wbCand = { id: 'c2', name: '@oxmumu3/dsh-project-companion', install: { spec: '@oxmumu3/dsh-project-companion@0.40.1' } };

  const singleStd = estimatePlanSavings({ plan: { kind: 'single', pluginIds: ['c1'] }, candidates: [stdCand] });
  assert.equal(singleStd.tokens, 900_000);
  assert.equal(singleStd.wanText, '90 万');
  assert.equal(singleStd.kind, 'reuse');

  const singleWb = estimatePlanSavings({ plan: { kind: 'single', pluginIds: ['c2'] }, candidates: [wbCand] });
  assert.equal(singleWb.tokens, 1_800_000);
  assert.equal(singleWb.wanText, '180 万');
  assert.equal(singleWb.badge, '复用已验证工作台');

  const combo = estimatePlanSavings({
    plan: { kind: 'combo', pluginIds: ['c1', 'c3'] },
    candidates: [stdCand, { id: 'c3', name: 'dsh-taskboard' }],
  });
  assert.equal(combo.tokens, 1_500_000);
  assert.equal(combo.wanText, '150 万');

  const hybridOne = estimatePlanSavings({ plan: { kind: 'hybrid', pluginIds: ['c1'] }, candidates: [stdCand] });
  assert.equal(hybridOne.tokens, 1_100_000);
  assert.equal(hybridOne.wanText, '110 万');

  const hybridTwo = estimatePlanSavings({
    plan: { kind: 'hybrid', pluginIds: ['c1', 'c3'] },
    candidates: [stdCand, { id: 'c3', name: 'dsh-taskboard' }],
  });
  assert.equal(hybridTwo.tokens, 1_400_000);
  assert.equal(hybridTwo.wanText, '140 万');

  const gapPlan = estimatePlanSavings({ plan: { kind: 'gap', pluginIds: [] } });
  assert.equal(gapPlan.tokens, 450_000);
  assert.equal(gapPlan.wanText, '45 万');
  assert.equal(gapPlan.kind, 'create');

  const createStd = estimatePlanSavings({ plan: { kind: 'gap', pluginIds: [] }, creation: { status: 'draft' }, mode: 'create' });
  assert.equal(createStd.tokens, 450_000);
  assert.match(createStd.headline, /45 万/);

  const createHybrid = estimatePlanSavings({
    plan: { kind: 'hybrid', pluginIds: ['c1'] },
    candidates: [stdCand],
    creation: { status: 'draft' },
    mode: 'create',
  });
  assert.equal(createHybrid.tokens, 1_100_000);
  assert.match(createHybrid.headline, /110 万/);

  assert.match(estimateDetailInstallSavings(wbCand), /180 万/);
  assert.match(estimateDetailInstallSavings(stdCand), /90 万/);
  assert.equal(canonicalPluginKey('npm:@oxmumu3/dsh-project-companion@0.40.1'), '@oxmumu3/dsh-project-companion');
  assert.equal(isWorkbenchPlugin(wbCand), true);
  assert.equal(formatWanTokens(0), '0');
});

test('summarizeTokenSavingsLedger enforces strict adoption criteria and cross-store deduplication', () => {
  // Unadopted items only (search/plan-only task, un-installed catalog detail, early search-only creator step, unready agent req) -> 0!
  const emptyLedger = summarizeTokenSavingsLedger({
    historyTasks: [{
      id: 'task-plan-only',
      updatedAt: '2026-11-19T01:00:00Z',
      revisions: [{
        id: 'rev-1',
        workflow: {
          plan: { kind: 'single', title: '仅查看方案', pluginIds: ['c1'] },
          candidates: [{ id: 'c1', name: 'dsh-md-studio' }],
        },
      }],
      executions: [{ kind: 'use', status: 'claimed', revisionId: 'rev-1', sessionId: null }],
      handoffs: [],
      feedback: [{ type: 'result', outcome: 'blocked', revisionId: 'rev-1', createdAt: '2026-11-19T01:05:00Z' }],
    }],
    catalogInstalls: [{
      collection: 'community',
      entryId: 'dsh-zotero',
      entry: { name: 'dsh-zotero' },
      attempt: null,
      archivedAttempts: [],
    }],
    creatorSessions: [{
      sessionId: 'sess-search-only',
      steps: [{ stage: 'search', summary: 'just searched', at: '2026-11-19T02:00:00Z' }],
    }],
    agentRequests: [{
      id: 'req-planned',
      status: 'planned',
    }],
  });
  assert.equal(emptyLedger.totalTokens, 0);
  assert.equal(emptyLedger.totalItems, 0);
  assert.deepEqual(emptyLedger.items, []);

  // Adopted items with duplicates across stores -> deduplicated!
  const ledger = summarizeTokenSavingsLedger({
    historyTasks: [
      {
        id: 'task-reuse-dup',
        updatedAt: '2026-11-19T03:00:00Z',
        revisions: [{
          id: 'r1',
          workflow: {
            plan: { kind: 'single', title: '文档排版', pluginIds: ['c-md'] },
            candidates: [{ id: 'c-md', name: 'dsh-md-studio', install: { packageName: 'dsh-md-studio' } }],
          },
        }],
        executions: [{ kind: 'use', status: 'submitted', revisionId: 'r1', sessionId: 'sess-use-1', updatedAt: '2026-11-19T03:00:00Z' }],
      },
      {
        id: 'task-create-shared',
        updatedAt: '2026-11-19T04:00:00Z',
        revisions: [{
          id: 'r2',
          workflow: {
            plan: { kind: 'gap', title: '会议拆解', pluginIds: [] },
            creation: { blueprint: { name: '会议待办助手' } },
          },
        }],
        creatorAttempts: [{ status: 'applied', revisionId: 'r2', sessionId: 'sess-shared-creator', updatedAt: '2026-11-19T04:00:00Z' }],
      },
    ],
    catalogInstalls: [
      // Same dsh-md-studio via catalog -> must deduplicate!
      {
        collection: 'community',
        entryId: 'md-dup',
        entry: { name: 'BioAIEvolu#dsh-md-studio' },
        candidate: { id: 'md-cand', name: 'dsh-md-studio', install: { spec: 'dsh-md-studio@1.3.7', packageName: 'dsh-md-studio' } },
        attempt: { status: 'ready' },
        updatedAt: '2026-11-19T02:00:00Z',
      },
      // Workbench ready install -> 180 万
      {
        collection: 'featured',
        entryId: 'dsh-dot',
        entry: { name: 'dsh-project-companion', title: 'DSH Dot' },
        candidate: { id: 'dot', name: '@oxmumu3/dsh-project-companion', install: { spec: '@oxmumu3/dsh-project-companion@0.40.1' } },
        attempt: { status: 'ready' },
        updatedAt: '2026-11-19T05:00:00Z',
      },
    ],
    agentRequests: [
      // Existing ready dsh-md-studio -> still deduplicated! Plus taskboard -> +90 万
      {
        id: 'req-ready',
        status: 'ready',
        updatedAt: '2026-11-19T06:00:00Z',
        preparation: {
          kind: 'existing',
          status: 'ready',
          plugins: [
            { status: 'ready', packageName: 'dsh-md-studio', candidateId: 'md' },
            { status: 'ready', packageName: 'dsh-taskboard', candidateId: 'tb' },
          ],
        },
      },
      // Generated agent plugin -> +45 万 and claims sess-agent-create
      {
        id: 'req-gen',
        status: 'ready',
        updatedAt: '2026-11-19T07:00:00Z',
        input: { goal: '发票整理器' },
        creator: { status: 'completed', sessionId: 'sess-agent-create' },
        preparation: { kind: 'generated', status: 'ready', plugins: [{ status: 'ready', packageName: 'local-inv' }] },
      },
    ],
    creatorSessions: [
      // Duplicate of task-create-shared -> skipped!
      { sessionId: 'sess-shared-creator', steps: [{ stage: 'design', summary: 'dup', at: '2026-11-19T04:01:00Z' }] },
      // Duplicate of req-gen -> skipped!
      { sessionId: 'sess-agent-create', steps: [{ stage: 'verify', summary: 'dup agent', at: '2026-11-19T07:01:00Z' }] },
      // Independent creator session reaching design -> +45 万!
      { sessionId: 'sess-indep', steps: [{ stage: 'skeleton', summary: '搭建面板骨架', at: '2026-11-19T08:00:00Z' }] },
    ],
  });

  // Distinct items:
  // Reused: dsh-md-studio (90w), dsh-project-companion (180w), dsh-taskboard (90w) => 3 reuse = 360w
  // Created: task-create-shared (45w), req-gen (45w), sess-indep (45w) => 3 create = 135w
  // Total = 495w = 4,950,000
  assert.equal(ledger.reuseCount, 3);
  assert.equal(ledger.createCount, 3);
  assert.equal(ledger.totalItems, 6);
  assert.equal(ledger.totalTokens, 4_950_000);
  const normalized = normalizeTokenSavings(ledger);
  assert.equal(normalized.totalTokens, 4_950_000);
});

test('HomeView Layout A keeps zero state quiet, shows eyebrow chip only when > 0, and leaves past/featured lists clean', () => {
  const HomeView = createHomeView(fakeReact());
  const noopCtrl = new Proxy({}, { get: () => () => {} });
  const baseProps = {
    state: {
      homeRequest: '',
      history: [{
        taskId: 't1', title: '整理会议纪要', updatedAt: '2026-11-19T10:00:00Z',
        stage: 'plan', planKind: 'single', lastFeedback: { type: 'result', outcome: 'complete' },
      }],
      historyTotal: 1,
      installedPlugins: ['dsh-taskboard'],
    },
    controller: noopCtrl,
    busy: false,
    modelReady: true,
    locked: false,
    homeInput: { current: null },
    shortcut: () => {},
    featured: [{ id: 'dsh-dot', title: 'DSH Dot', subtitle: '手机简报' }],
    overview: { total: 11979, categories: [] },
  };

  const zeroView = HomeView({ ...baseProps, tokenSavings: { totalTokens: 0, reuseCount: 0, createCount: 0, totalItems: 0, items: [] } });
  assert.equal(nodes(zeroView).filter(n => hasClass(n, 'pf8_eyebrow_ledger')).length, 0);
  assert.doesNotMatch(content(zeroView), /累计已省|账本与算法/);

  let opened = 0;
  const liveView = HomeView({
    ...baseProps,
    tokenSavings: { totalTokens: 3_150_000, reuseCount: 3, createCount: 1, totalItems: 4, items: [] },
    onOpenLedger: () => { opened += 1; },
  });
  const eyebrowBtn = nodes(liveView).find(n => hasClass(n, 'pf8_eyebrow_ledger'));
  assert.ok(eyebrowBtn);
  assert.match(content(eyebrowBtn), /315 万/);
  assert.match(content(eyebrowBtn), /›/);
  assert.doesNotMatch(content(eyebrowBtn), /账本|算法/);
  eyebrowBtn.props.onClick();
  assert.equal(opened, 1);

  const pastList = nodes(liveView).find(n => hasClass(n, 'pf8_past'));
  const featList = nodes(liveView).find(n => hasClass(n, 'pf8_feat'));
  assert.doesNotMatch(content(pastList), /Token|约省/);
  assert.doesNotMatch(content(featList), /Token|约省/);

  assert.doesNotMatch(v8Css, /\.pf8_eyebrow_ledger[^}]*var\(--card\)/);
  assert.match(v8Css, /\.pf8_eyebrow_ledger:hover:not\(:disabled\)/);
  assert.doesNotMatch(v8Css, /dialog\.pf_modal\.pf_modal_ledger[^}]*display:/);
});

test('TokenLedgerDialog uses native closedby="any" without role/aria-modal and ExperienceView places save_strip cleanly', () => {
  const LedgerDialog = createTokenLedgerDialog(fakeReact());
  assert.equal(LedgerDialog({ open: false, tokenSavings: { totalTokens: 900_000 } }), null);
  assert.equal(LedgerDialog({ open: true, tokenSavings: { totalTokens: 0 } }), null);

  let dismissed = 0;
  const dlgTree = LedgerDialog({
    open: true,
    tokenSavings: {
      totalTokens: 2_250_000,
      reuseCount: 1,
      createCount: 1,
      totalItems: 2,
      items: [
        { kind: 'reuse', badge: '复用工作台', name: 'dsh-project-companion', detail: '已安装', tokens: 1_800_000 },
        { kind: 'create', badge: '带经验自建', name: '周报助手', detail: '已开造', tokens: 450_000 },
      ],
    },
    onDismiss: () => { dismissed += 1; },
  });
  const dlg = nodes(dlgTree).find(n => n.type === 'dialog');
  assert.ok(dlg);
  assert.equal(dlg.props.closedby, 'any');
  assert.equal(dlg.props.role, undefined);
  assert.equal(dlg.props['aria-modal'], undefined);
  nodes(dlg).find(n => n.type === 'button' && content(n) === '知道了').props.onClick();
  assert.equal(dismissed, 1);

  const ExperienceView = createExperienceView(fakeReact());
  const noopCtrl = new Proxy({}, { get: () => () => {} });
  const confirms = [];
  const renderExp = (patch = {}) => ExperienceView({
    state: {
      view: 'find',
      taskId: 't1',
      revisionId: 'r1',
      revisionNumber: 1,
      request: '同步工作进展到手机',
      intent: { goal: '同步工作进展到手机' },
      plan: { kind: 'single', title: '直接装 DSH Dot', rationale: '现成可用', pluginIds: ['c1'], limits: [], steps: [] },
      candidates: [{ id: 'c1', name: '@oxmumu3/dsh-project-companion', summary: '手机同步工作台' }],
      discovery: { sources: [{ id: 'awesome', status: 'live', total: 11979, used: 1, fetchedAt: new Date().toISOString(), catalogUpdatedAt: new Date().toISOString() }] },
      workspaceId: 'ws-1',
      executionWorkspaceLabel: '默认工作区',
      followupText: '',
      ...patch,
    },
    controller: noopCtrl,
    busy: false,
    modelReady: true,
    copyText: () => {},
    onRequestConfirm: spec => confirms.push(spec),
  });

  const singleTree = renderExp();
  const singleStrip = nodes(singleTree).find(n => hasClass(n, 'pf8_save_strip'));
  assert.ok(singleStrip);
  assert.match(content(singleStrip, true), /180 万/);
  // Details stays closed by default, so visible text excludes math bullets until opened
  const singleDetails = nodes(singleStrip).find(n => hasClass(n, 'pf8_save_details'));
  assert.equal(Boolean(singleDetails.props.open), false);
  assert.doesNotMatch(content(singleStrip, true), /仅做省流参考/);
  nodes(singleTree).find(n => n.type === 'button' && content(n) === '使用这个方案').props.onClick();
  assert.ok(confirms.at(-1).facts.some(f => f.label === '预计节省' && /180 万/.test(f.value)));

  const hybridTree = renderExp({
    plan: { kind: 'hybrid', title: '现成拼装再补一块', rationale: '半成配补', pluginIds: ['c1'], gaps: [{ capability: '定时抓取', reason: '缺少触发' }], limits: [], steps: [] },
    candidates: [{ id: 'c1', name: 'dsh-taskboard', summary: '看板' }],
  });
  assert.equal(nodes(hybridTree).filter(n => hasClass(n, 'pf8_save_strip')).length, 1);
  nodes(hybridTree).find(n => n.type === 'button' && content(n) === '补齐并使用').props.onClick();
  assert.ok(confirms.at(-1).facts.some(f => f.label === '预计节省' && /110 万/.test(f.value)));

  const createTree = renderExp({
    view: 'create',
    plan: { kind: 'gap', title: '自建插件', rationale: '无现成', pluginIds: [], limits: [], steps: [] },
    creation: {
      strategy: 'new', status: 'draft', supply: { status: 'current' },
      blueprint: { name: '会议待办工具', purpose: '抽取待办' }, questions: [], answers: [],
    },
    creationForm: { blueprint: { name: '会议待办工具', purpose: '抽取待办' }, answers: [], assumptions: [] },
  });
  const createStrip = nodes(createTree).find(n => hasClass(n, 'pf8_save_strip') && hasClass(n, 'is_create'));
  assert.ok(createStrip);
  assert.match(content(createStrip, true), /45 万/);
  nodes(createTree).find(n => n.type === 'button' && content(n) === '开始创建').props.onClick();
  assert.ok(confirms.at(-1).facts.some(f => f.label === '预计节省' && /45 万/.test(f.value)));

  const nativeTree = renderExp({
    plan: { kind: 'native', title: '不用装', rationale: '原生可做', pluginIds: [], limits: [], steps: [] },
    candidates: [],
  });
  assert.equal(nodes(nativeTree).filter(n => hasClass(n, 'pf8_save_strip')).length, 0);

  const incompleteTree = renderExp({
    plan: { kind: 'gap', title: '待核对', rationale: '', pluginIds: [], limits: [], steps: [] },
    discovery: { status: 'failed', sources: [] },
    candidates: [],
  });
  assert.equal(nodes(incompleteTree).filter(n => hasClass(n, 'pf8_save_strip')).length, 0);

  const surface = createPlanSurface(fakeReact());
  const embeddedCard = surface.solution({
    request: '试',
    plan: { kind: 'single', title: 'x', pluginIds: ['c1'], steps: [] },
    candidates: [{ id: 'c1', name: 'dsh-md-studio' }],
    savings: estimatePlanSavings({ plan: { kind: 'single', pluginIds: ['c1'] }, candidates: [{ id: 'c1', name: 'dsh-md-studio' }] }),
    compact: true,
    embedded: true,
  });
  assert.equal(nodes(embeddedCard).filter(n => hasClass(n, 'pf8_save_strip')).length, 0);

  const detailCalls = [];
  const detailTree = renderPluginDetailView({
    h,
    state: {
      bootstrap: { hostVersion: '0.2.2-rc.5' },
      catalogSelection: { collection: 'community', entryId: 'e1' },
      catalogDetail: {
        collection: 'community', entryId: 'e1', name: 'dsh-taskboard', title: '看板', summary: '管理待办',
        author: 'cloader', version: '0.10.0', installable: true, sourceUrl: 'https://github.com/cloader/dsh-taskboard',
        installation: { status: 'not-installed', installed: false, enabled: false, active: false },
      },
      catalogBusy: '',
      catalogError: '',
    },
    controller: { closeCatalogPlugin: () => {}, installCatalogPlugin: () => {}, refreshCatalogPlugin: () => {} },
    onRequestConfirm: spec => detailCalls.push(spec),
  });
  nodes(detailTree).find(n => n.type === 'button' && content(n) === '安装插件').props.onClick();
  assert.ok(detailCalls[0].facts.some(f => f.label === '预计节省' && /90 万/.test(f.value)));
});
