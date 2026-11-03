import { featuredCatalog } from './featured-catalog.js';
import { getCommunityEntry } from './community-catalog.js';

const text = value => typeof value === 'string' ? value : '';
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
const safeSource = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
};
const problemMessages = {
  PLUGIN_INSTALL_APPROVAL_REQUIRED: '安装需要额外授权，请完成宿主提示的审批后核对状态。',
  PLUGIN_INSTALL_RESTART_REQUIRED: '安装已提交，宿主要求重启后才能使用。',
  PLUGIN_INSTALL_CONFLICT: '当前已有同名但版本或来源不同的插件，本次没有替换。',
  PLUGIN_INSTALL_NOT_ACTIVE: '插件尚未成功运行，请查看作者说明或核对安装状态。',
  PLUGIN_INSTALL_PENDING: '安装结果尚未确认，请核对同一次安装的状态。',
};

const unpublishedSource = detail => /私有|本地预览|尚未公开|没有公开|暂无公开|未提供公开|暂未提供安装|当前没有可复制/.test(text(detail?.unavailableReason));
/** Only an unresolved, not-yet-installed source may be fetched again. */
export function canRecheckPluginSource(detail) {
  if(typeof detail?.sourceRecheckAllowed==='boolean')return detail.sourceRecheckAllowed&&detail.installable===false&&['unavailable','installed-local','unknown'].includes(detail.installation?.status);
  return detail?.installable === false && ['unavailable','installed-local'].includes(detail.installation?.status)
    && !unpublishedSource(detail) && !/不兼容|版本冲突|权限不足/.test(text(detail.unavailableReason))
    && /临时无法|暂时无法|稍后重试/.test(text(detail.unavailableReason));
}

/** One plugin identity, one action, no search draft or generated plan. */
export function renderPluginDetailView({ h, state, controller }) {
  const selection = state.catalogSelection;
  const fallback = selection?.collection === 'featured' ? featuredCatalog.find(entry => entry.id === selection.entryId) : getCommunityEntry(selection?.entryId);
  const detail = state.catalogDetail;
  const title = text(detail?.title) || text(fallback?.subtitle).split(' · ')[0] || text(fallback?.name) || text(fallback?.title) || '插件详情';
  const name = text(detail?.name) || text(fallback?.name) || text(fallback?.subtitle).split(' · ')[0];
  const summary = text(detail?.summary) || text(fallback?.summary);
  const version = text(detail?.version) || text(fallback?.version);
  const author = text(detail?.author) || text(fallback?.owner);
  const source = safeSource(detail?.sourceUrl || fallback?.sourceUrl || fallback?.sourceUrls?.[0]);
  const installation = detail?.installation;
  const phase = installation?.status;
  const ready = phase === 'ready' && installation.installed && installation.enabled && installation.active;
  const busy = Boolean(state.catalogBusy);
  const actualVersion = text(installation?.version);
  const installedConflict = phase === 'conflict' && installation.installed === true;
  const sameVersionConflict = installedConflict && actualVersion && actualVersion === version;
  const localInstalled = phase === 'installed-local' && installation.installed === true;
  const localState = installation?.enabled !== true ? '未启用' : installation?.active === true ? '正在运行' : '已启用，尚未确认正常运行';
  const conflictNote = !installedConflict ? '' : sameVersionConflict
    ? `本机已安装版本 ${actualVersion}，但安装来源不同。本次没有替换已有插件。`
    : `本机已安装${actualVersion ? `版本 ${actualVersion}` : '同名插件'}；本页版本 ${version || '待核对'}。本次没有替换已有插件。`;
  const sourceRetry = canRecheckPluginSource(detail);
  const primarySourceRetry = sourceRetry&&detail.sourceRecheckAllowed===true&&!localInstalled;
  const terminalProblem = Object.hasOwn(problemMessages, installation?.code ?? '');
  const canInstall = detail?.installable === true && ['not-installed', 'installed-disabled', 'failed'].includes(phase) && !terminalProblem;
  const button = (label, onClick, props = {}) => h('button', { type: 'button', className: 'pfv_button', onClick, ...props }, label);
  const action = ready ? button('已安装', () => {}, { className: 'pfv_button pfv_primary', disabled: true })
    : busy ? button(state.catalogBusy === 'install' ? (phase === 'installed-disabled' ? '正在启用…' : '正在安装…') : state.catalogBusy === 'status' ? '正在核对…' : '正在读取详情…', () => {}, { className: 'pfv_button pfv_primary', disabled: true })
      : primarySourceRetry ? button('重新核对来源', () => controller.refreshCatalogPlugin(), {className:'pfv_button pfv_primary'})
      : localInstalled ? button(installation.componentOnly ? '已安装配套组件' : '已安装（来源待核对）', () => {}, {disabled:true})
      : installedConflict ? button(sameVersionConflict ? '已安装（来源不同）' : actualVersion ? '已安装其他版本' : '已安装同名插件', () => {}, { disabled: true })
        : canInstall ? button(phase === 'installed-disabled' ? '启用插件' : phase === 'failed' ? '重试安装' : '安装插件', () => controller.installCatalogPlugin(), { className: 'pfv_button pfv_primary' })
        : terminalProblem ? button('核对安装状态', () => controller.refreshCatalogPlugin(), {className:'pfv_button pfv_primary'})
        : phase === 'unavailable' || detail && !detail.installable && !['conflict', 'unknown', 'installing'].includes(phase) ? button(unpublishedSource(detail) ? '暂未提供安装版本' : '当前版本暂不可安装', () => {}, { disabled: true })
          : button(detail ? '核对安装状态' : '重新读取详情', () => controller.refreshCatalogPlugin(), { className: 'pfv_button pfv_primary' });
  const note = ready ? '已安装并启用，可以在 DeepSeek Harness 中使用。'
    : primarySourceRetry ? `${text(detail.unavailableReason)||'固定安装包需要重新核对原来源。'}${phase==='unknown'?' 当前安装状态仍待核对。':''}`
    : localInstalled ? `本机已安装${installation.componentOnly ? '配套组件 ' : ' '}${text(installation.packageName)}${actualVersion ? `@${actualVersion}` : ''}，${localState}。${text(detail?.unavailableReason) || '本页安装来源尚待核对，保留当前安装。'}`
    : (conflictNote ? `${conflictNote} 本机状态：${localState}。` : '') || (['PLUGIN_INSTALL_APPROVAL_REQUIRED','PLUGIN_INSTALL_RESTART_REQUIRED'].includes(installation?.code)?problemMessages[installation.code]:'') || (phase === 'unknown' ? text(installation?.message) || problemMessages[installation?.code] : '') || text(detail?.unavailableReason) || (phase === 'conflict' && installation?.installed === false ? text(installation.message) : '') || problemMessages[installation?.code] || text(installation?.message)
      || (phase === 'unknown' || phase === 'installing' ? '安装结果尚未确认。核对状态会继续查看这一次安装，不会重复安装。'
        : phase === 'installed-disabled' ? '插件已安装，启用后即可使用。'
          : phase === 'conflict' ? '当前已有不同版本或来源的同名插件，本次没有替换。'
            : phase === 'failed' ? '这次安装没有完成，原有插件未被替换。'
              : detail?.installable ? '安装并启用到当前 DeepSeek Harness，无需前往插件管理器。' : '正在核对所选插件的来源和安装状态。');
  const requirements = strings(detail?.requirements ?? fallback?.requirements).map(value => value === '账号、输入输出和首次使用前提来自作者资料；未知条件需在会话确认。' ? '具体配置和授权要求以作者说明为准。' : value);
  // These two internal retrieval notes describe the earlier candidate stage.
  // Installation now has its own live status; retain actual author limitations.
  const limitations = strings(detail?.limitations ?? fallback?.limitations).filter(value => !/^来自动态来源与作者资料的候选线索；|^已核对精确 npm 版本的 bundle 清单，/.test(value));
  const list = values => h('ul', { className: 'pfv_plugin_list' }, ...values.map((value, index) => h('li', { key: index }, value)));
  return h('article', { className: 'pfv_plugin_detail', 'aria-labelledby': 'pfv_plugin_detail_title' },
    button('返回插件列表', () => controller.closeCatalogPlugin(), { className: 'pfv_button pfv_quiet pfv_plugin_back' }),
    h('header', { className: 'pfv_plugin_hero' },
      h('div', { className: 'pfv_plugin_identity' },
        h('p', { className: 'pfv_plugin_kicker' }, selection?.collection === 'featured' ? '精选插件' : '插件商店'),
        h('h1', { id: 'pfv_plugin_detail_title', tabIndex: -1 }, title),
        name && name !== title ? h('p', { className: 'pfv_plugin_name' }, name) : null,
        summary ? h('p', { className: 'pfv_plugin_summary' }, summary) : null,
        h('div', { className: 'pfv_plugin_meta' }, author ? h('span', null, `作者 ${author}`) : null, version ? h('span', null, `版本 ${version}`) : null)),
      h('div', { className: 'pfv_plugin_install', 'aria-label': '插件安装' }, action, h('p', { role: 'status', 'aria-live': 'polite' }, note),
        sourceRetry&&!primarySourceRetry ? button('重新核对来源', () => controller.refreshCatalogPlugin(), { className: 'pfv_button pfv_quiet', disabled: busy }) : installedConflict || localInstalled || canInstall && phase === 'failed' ? button('核对安装状态', () => controller.refreshCatalogPlugin(), { className: 'pfv_button pfv_quiet', disabled: busy }) : null)),
    state.catalogError ? h('div', { className: 'pfv_plugin_error', role: 'alert' }, h('p', null, text(state.catalogError))) : null,
    text(detail?.description) && detail.description !== summary ? h('section', { className: 'pfv_plugin_section' }, h('h2', null, '能帮你做什么'), h('p', { className: 'pfv_plugin_description' }, detail.description)) : null,
    requirements.length || limitations.length ? h('div', { className: 'pfv_plugin_facts' },
      requirements.length ? h('section', { className: 'pfv_plugin_section' }, h('h2', null, '使用前提'), list(requirements)) : null,
      limitations.length ? h('section', { className: 'pfv_plugin_section' }, h('h2', null, '需要了解'), list(limitations)) : null) : null,
    source ? h('section', { className: 'pfv_plugin_section pfv_plugin_sources' }, h('h2', null, '作者与来源'), h('a', { href: source, target: '_blank', rel: 'noopener noreferrer' }, '查看作者说明 ↗'), h('p', null, '插件介绍来自作者资料；收录不代表已验证所有功能。')) : null);
}
