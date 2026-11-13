import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPluginDetailView } from '../src/plugin-detail-view.js';
import { getCommunityOverview } from '../src/community-catalog.js';
const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.children)] : [];
const content = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(content).join(' ') : content(node.children);
const detail = (status, patch = {}) => ({ detailId: 'catalog-detail-1', collection: 'featured', entryId: 'agent-twin', title: 'AI 分身', name: 'dsh-agent-twin', summary: '归纳选定资料', description: '保留每条判断的来源', author: '牛村木木山', version: '1.2.3', sourceUrl: 'https://github.com/oxmumu3/ai-twin-starter', requirements: ['选择授权资料'], limitations: ['不会自动外发'], installable: true, installation: { status, installed: status === 'ready', enabled: status === 'ready', active: status === 'ready' }, ...patch });
function render(value, extra = {}) {
  const calls = [];
  const state = { catalogSelection: { collection: 'featured', entryId: 'agent-twin' }, catalogDetail: value, catalogBusy: '', catalogError: '', ...extra };
  const view = renderPluginDetailView({ h, state, controller: { closeCatalogPlugin: () => calls.push('back'), installCatalogPlugin: () => calls.push('install'), refreshCatalogPlugin: () => calls.push('status'), startFeatured: id => calls.push(['featured', id]) } });
  const button = label => nodes(view).find(node => node.type === 'button' && content(node) === label);
  return { view, calls, button };
}

test('a local installation remains visible when its public source is unavailable and does not grant an install action',()=>{
 const env=render(detail('installed-local',{installable:false,unavailableReason:'暂时无法核对公开来源。',installation:{status:'installed-local',installed:true,enabled:true,active:true,version:'3.0.0',packageName:'plug-a'}}));
 assert.ok(env.button('已安装（来源待核对）'));assert.match(content(env.view),/3\.0\.0.*正在运行/);assert.equal(env.button('安装插件'),undefined);assert.equal(env.button('当前版本暂不可安装'),undefined);
 const component=render(detail('installed-local',{installable:false,installation:{status:'installed-local',installed:true,enabled:false,active:false,componentOnly:true,version:'1.0.0',packageName:'bridge'}}));
 assert.ok(component.button('已安装配套组件'));assert.match(content(component.view),/未启用/);assert.equal(component.button('启用插件'),undefined);
});
test('source conflicts still explain whether the detected local plugin is enabled and actually running',()=>{
 const env=render(detail('conflict',{installation:{status:'conflict',installed:true,enabled:false,active:false,version:'2.0.0'}}));
 assert.match(content(env.view),/未启用/);assert.doesNotMatch(content(env.view),/已安装并启用/);
});
test('a missing fixed archive exposes one explicit source recheck without installation or duplicate actions',()=>{
 const env=render(detail('unknown',{installable:false,sourceRecheckAllowed:true,unavailableReason:'固定安装包暂时无法读取，请重新核对原来源。',installation:{status:'unknown',installed:false,enabled:false,active:false}}));
 assert.ok(env.button('重新核对来源'));assert.equal(env.button('核对安装状态'),undefined);assert.equal(env.button('安装插件'),undefined);
 assert.equal(nodes(env.view).filter(node=>node.type==='button'&&!node.props.disabled&&content(node)!=='返回').length,2);
 env.button('重新核对来源').props.onClick();assert.deepEqual(env.calls,['status']);
});
test('a server-blocked fixed source does not expose re-fetch while its earlier install is unresolved',()=>{
 const env=render(detail('installed-local',{installable:false,sourceRecheckAllowed:false,unavailableReason:'固定安装包暂时无法读取，请重新核对原来源。',installation:{status:'installed-local',installed:true,enabled:true,active:true}}));
 assert.equal(env.button('重新核对来源'),undefined);assert.ok(env.button('核对安装状态'));assert.equal(env.button('安装插件'),undefined);
});
test('a missing cache does not hide required approval or restart behind a generic source message',()=>{
 for(const [code,reason] of [['PLUGIN_INSTALL_APPROVAL_REQUIRED',/审批/],['PLUGIN_INSTALL_RESTART_REQUIRED',/重启/]]){
  const env=render(detail('failed',{installable:false,sourceRecheckAllowed:false,unavailableReason:'固定安装包暂时无法读取，请重新核对原来源。',installation:{status:'failed',installed:true,enabled:true,active:true,code}}));
  assert.ok(env.button('核对安装状态'));assert.equal(env.button('重新核对来源'),undefined);assert.equal(env.button('当前版本暂不可安装'),undefined);assert.match(content(env.view),reason);
 }
});

test('plugin detail describes the selected plugin and installs directly without a plan handoff', () => {
  const { view, calls, button } = render(detail('not-installed'));
  button('安装插件').props.onClick(); button('返回').props.onClick();
  assert.deepEqual(calls, ['install', 'back']);
  assert.match(content(view), /AI 分身.*归纳选定资料.*dsh-agent-twin.*保留每条判断/);
  assert.match(content(view), /用之前要知道.*留意.*选择授权资料.*不会自动外发.*来源.*GitHub 上的 oxmumu3\/ai-twin-starter/);
  assert.ok(button('先问问适不适合我'));
  assert.equal(nodes(view).find(node => node.type === 'a')?.props.href, 'https://github.com/oxmumu3/ai-twin-starter');
  assert.match(content(view), /去 GitHub 看源码/);
  assert.doesNotMatch(content(view), /查看方案|试试这个场景|复制安装|去 DSH 插件页|继续定制/);
});

test('plugin installation states provide enable, known success and read-only uncertainty actions', () => {
  let env = render(detail('installed-disabled')); env.button('启用插件').props.onClick(); assert.deepEqual(env.calls, ['install']);
  env = render(detail('ready')); assert.equal(env.button('已安装').props.disabled, true); assert.match(content(env.view), /已安装并启用/);
  for (const status of ['unknown', 'installing']) {
    env = render(detail(status)); assert.equal(env.button('安装插件'), undefined); env.button('核对安装状态').props.onClick(); assert.deepEqual(env.calls, ['status']);
  }
  env = render(detail('conflict')); assert.equal(env.button('安装插件'), undefined); assert.match(content(env.view), /没有替换/);
});

test('unavailable previews state the real reason without an installation promise', () => {
  const { view, button } = render(detail('unavailable', { installable: false, unavailableReason: '这是私有预览，没有公开下载版本。' }));
  assert.equal(button('暂未提供安装版本').props.disabled, true); assert.match(content(view), /私有预览，没有公开下载版本/);
  assert.equal(button('安装插件'), undefined);
});

test('pending, approval and restart results never display a successful installation or blind retry', () => {
  for (const code of ['PLUGIN_INSTALL_APPROVAL_REQUIRED', 'PLUGIN_INSTALL_RESTART_REQUIRED', 'PLUGIN_INSTALL_NOT_ACTIVE']) {
    const { view, button } = render(detail('failed', { installation: { status: 'failed', installed: true, enabled: false, active: false, code } }));
    assert.equal(button('重试安装'), undefined); assert.equal(button('已安装'), undefined); assert.ok(button('核对安装状态')); assert.doesNotMatch(content(view), /已安装并启用/);
  }
  const { button } = render(detail('not-installed'), { catalogBusy: 'install' }); assert.equal(button('正在安装…').props.disabled, true);
});

test('catalog sources render as links only for safe public HTTPS URLs', () => {
  for (const sourceUrl of ['javascript:alert(1)', 'https://u:p@github.com/author/repo', 'file:///tmp/source']) {
    assert.equal(nodes(render(detail('not-installed', { sourceUrl })).view).filter(node => node.type === 'a').length, 0);
  }
});

test('temporary source checks and incompatible versions do not look like unpublished plugins', () => {
  let env = render(detail('unavailable', { installable: false, unavailableReason: '临时无法核对作者来源，请稍后重试。' }));
  assert.equal(env.button('当前版本暂不可安装').props.disabled, true);
  assert.equal(env.button('暂未提供安装版本'), undefined);
  env.button('重新核对来源').props.onClick(); assert.deepEqual(env.calls, ['status']);
  env = render(detail('unavailable', { installable: false, unavailableReason: '作者声明的当前版本与此宿主不兼容。' }));
  assert.equal(env.button('当前版本暂不可安装').props.disabled, true);
  assert.equal(env.button('重新核对来源'), undefined); assert.equal(env.button('安装插件'), undefined);
});

test('an installed source or version conflict states what is present and never offers replacement', () => {
  const expectedVersion = '2.4.0', actualVersion = '2.3.1';
  let env = render(detail('conflict', { version: expectedVersion, installation: { status: 'conflict', installed: true, enabled: true, active: true, version: expectedVersion, packageName: 'dsh-sample' } }));
  assert.equal(env.button('已安装（来源不同）').props.disabled, true);
  assert.match(content(env.view), /本机已安装.*2\.4\.0.*来源不同.*没有替换/);
  env.button('核对安装状态').props.onClick(); assert.deepEqual(env.calls, ['status']);
  env = render(detail('conflict', { version: expectedVersion, installation: { status: 'conflict', installed: true, enabled: true, active: true, version: actualVersion, packageName: 'dsh-sample' } }));
  assert.equal(env.button('已安装其他版本').props.disabled, true);
  assert.match(content(env.view), /本机已安装.*2\.3\.1.*本页版本.*2\.4\.0.*没有替换/);
  assert.equal(env.button('安装插件'), undefined); assert.equal(env.button('重试安装'), undefined);
});
test('a community detail keeps the consult path and returns to the store', () => {
  const entry = getCommunityOverview().categories[0].previews[0];
  const calls = [];
  const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
  const state = {
    catalogSelection: { collection: 'community', entryId: entry.id },
    catalogDetail: { ...entry, installable: true, installation: { status: 'not-installed', installed: false }, requirements: [], limitations: [] },
    communityOpen: true, catalogBusy: '', catalogError: '',
  };
  const controller = {
    closeCatalogPlugin: () => calls.push('back'),
    startCommunityPlugin: id => calls.push(['consult', id]),
    refreshCatalogPlugin: () => calls.push('status'),
    installCatalogPlugin: () => calls.push('install'),
  };
  const view = renderPluginDetailView({ h, state, controller });
  const button = label => nodes(view).find(node => node.type === 'button' && content(node) === label);
  assert.ok(button('返回插件商店'));
  button('先问问适不适合我').props.onClick();
  assert.deepEqual(calls, ['back', ['consult', entry.id]]);
  assert.match(content(view), /去 GitHub 看源码/);
});

test('plan request is never shown as a generated plan on the detail page', () => {
  const { view } = render(detail('not-installed'));
  assert.doesNotMatch(content(view), /使用这个方案|查看方案|生成方案/);
});
test('a rejected source recheck after removal does not claim another version is installed',()=>{
  const message='固定来源或版本未重新核对一致，未再次安装。';
  const env=render(detail('conflict',{installation:{status:'conflict',installed:false,enabled:false,active:false,code:'PLUGIN_INSTALL_CONFLICT',message}}));
  assert.match(content(env.view),/固定来源或版本未重新核对一致，未再次安装/);
  assert.doesNotMatch(content(env.view),/当前已有同名但版本或来源不同/);
  assert.equal(env.button('安装插件'),undefined);
});
test('installation details do not repeat stale candidate-stage claims after a successful install',()=>{
 const env=render(detail('ready',{limitations:['来自动态来源与作者资料的候选线索；尚未安装、运行或验证组合。','已核对精确 npm 版本的 bundle 清单，未下载或执行安装包；实际安装仍由宿主确认。','作者要求先选择资料范围。']}));
 assert.match(content(env.view),/已安装并启用/);assert.match(content(env.view),/作者要求先选择资料范围/);
 assert.doesNotMatch(content(env.view),/尚未安装|未下载或执行安装包/);
});

test('a pinned version that declares no support for this host is decided, not a retry', () => {
  const reason = '目录里记的 0.4.0-preview.3 版不支持你现在的 DSH。等作者更新后再装。';
  const env = render(detail('unavailable', { installable: false, unavailableReason: reason, sourceRecheckAllowed: true }));
  const action = env.button('这个版本装不了');
  assert.ok(action); assert.equal(action.props.disabled, true);
  assert.equal(env.button('重新核对来源'), undefined);
  assert.equal(env.button('安装插件'), undefined);
  assert.match(content(env.view), /目录里记的 0\.4\.0-preview\.3 版不支持你现在的 DSH。等作者更新后再装。/);
  assert.doesNotMatch(content(env.view), /稍后重试/);
});

test('only an unresolved source keeps the retry action', () => {
  const env = render(detail('unavailable', { installable: false, unavailableReason: '暂时无法核对这个插件的精确版本、安装来源或兼容性，请稍后重试。', sourceRecheckAllowed: true }));
  assert.ok(env.button('重新核对来源'));
  env.button('重新核对来源').props.onClick();
  assert.deepEqual(env.calls, ['status']);
});

test('a locally newer version shows both numbers and never suggests a downgrade', () => {
  const env = render(detail('conflict', {
    version: '0.2.0-preview.30', installable: false,
    installation: { status: 'conflict', installed: true, enabled: true, active: true, version: '0.2.0-preview.46' },
  }));
  assert.match(content(env.view), /本机装的是 0\.2\.0-preview\.46 版，目录里记的是 0\.2\.0-preview\.30 版；你装的比目录里记的新。/);
  assert.doesNotMatch(content(env.view), /降级|重装成|建议安装旧版/);
  assert.ok(env.button('已安装其他版本'));
});

test('a known Node incompatibility outranks an unreadable local inventory and disables install', () => {
  const reason = '这个版本要求 Node >=24，你现在的是 22.13。暂不能安装。';
  const env = render(detail('unknown', {
    installable: false, sourceRecheckAllowed: true, unavailableReason: reason,
    compatibility: { status: 'incompatible', kind: 'node', declared: '>=24' },
    installation: { status: 'unknown', installed: false, enabled: false, active: false, code: 'PLUGIN_INSTALL_UNAVAILABLE' },
  }));
  const action = env.button('这个版本装不了');
  assert.ok(action); assert.equal(action.props.disabled, true);
  assert.equal(env.button('安装插件'), undefined);
  assert.equal(env.button('重新核对来源'), undefined);
  assert.match(content(env.view), /这个版本要求 Node >=24，你现在的是 22\.13/);
  assert.doesNotMatch(content(env.view), /稍后重试/);
});

test('a community runtime incompatibility is decided and never becomes a source retry', () => {
  const env = render(detail('unavailable', {
    collection: 'community', installable: false, sourceRecheckAllowed: true,
    unavailableReason: '所选插件的版本或运行环境声明与当前环境不兼容。',
    compatibility: { status: 'incompatible', kind: 'runtime', reason: '所选插件的版本或运行环境声明与当前环境不兼容。' },
    installation: { status: 'unknown', installed: false, enabled: false, active: false },
  }), { catalogSelection: { collection: 'community', entryId: 'fixture' } });
  assert.equal(env.button('这个版本装不了')?.props.disabled, true);
  assert.equal(env.button('重新核对来源'), undefined);
  assert.match(content(env.view), /所选插件的版本或运行环境声明与当前环境不兼容/);
});
