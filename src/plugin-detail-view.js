import { featuredCatalog } from './featured-catalog.js';
import { isNewerVersion } from './featured.js';
import { getCommunityEntry, getCommunityOverview } from './community-catalog.js';
import { communityPresentation } from './community-presentation.js';

const text = value => typeof value === 'string' ? value : '';
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
// 社区条目的 name 可能是「作者#插件名」；详情只显示插件名，来源仍用完整地址。
const displayName = value => {
  const name = text(value);
  const hash = name.lastIndexOf('#');
  return hash >= 0 ? name.slice(hash + 1) : name;
};
const safeSource = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
};
// 宋体那行是用途句，不是插件名。没有整理好的用途句时取作者简介的第一句。
const firstSentence = value => {
  const line = text(value).replace(/\s+/g, ' ').trim();
  if (!line) return '';
  const head = line.split(/[。！？!?]/)[0].trim() || line;
  return head.length > 60 ? `${head.slice(0, 60)}…` : head;
};
const repositoryName = value => {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : '';
  } catch { return ''; }
};
// 用途句和介绍常常只差句末标点：按句末标点与空白归一再比，避免同屏说两遍。
const comparableLine = value => text(value).replace(/\s+/g, ' ').trim().replace(/[。！？!?.,，；;：:…—]+$/u, '').trim();
const sameLine = (a, b) => {
  const left = comparableLine(a);
  return left !== '' && left === comparableLine(b);
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
// A decided incompatibility (host/Node/platform/runtime, or the legacy pinned sentence)
// is not a failed read: keep its reason and the disabled action even when the local
// installation inventory is unknown. Missing compatibility data stays unknown.
const INCOMPATIBLE_KINDS = new Set(['host', 'node', 'platform', 'runtime']);
const knownUnsupported = detail => (detail?.compatibility?.status === 'incompatible' && INCOMPATIBLE_KINDS.has(detail.compatibility.kind))
  || /^目录里记的 .+ 版不支持你现在的 DSH。等作者更新后再装。$/u.test(text(detail?.unavailableReason));

export function canRecheckPluginSource(detail) {
  if(typeof detail?.sourceRecheckAllowed==='boolean')return detail.sourceRecheckAllowed&&detail.installable===false&&['unavailable','installed-local','unknown'].includes(detail.installation?.status);
  return detail?.installable === false && ['unavailable','installed-local'].includes(detail.installation?.status)
    && !unpublishedSource(detail) && !/不兼容|版本冲突|权限不足/.test(text(detail.unavailableReason))
    && /临时无法|暂时无法|稍后重试/.test(text(detail.unavailableReason));
}

/** One plugin identity, one action, no search draft or generated plan. */
export function renderPluginDetailView({ h, state, controller, onRequestConfirm }) {
  const selection = state.catalogSelection;
  const fallback = selection?.collection === 'featured' ? featuredCatalog.find(entry => entry.id === selection.entryId) : getCommunityEntry(selection?.entryId);
  const detail = state.catalogDetail;
  const name = text(detail?.name) || text(fallback?.name) || text(fallback?.subtitle).split(' · ')[0];
  const summary = text(detail?.summary) || text(fallback?.summary);
  const presentation = selection?.collection === 'community' ? communityPresentation(fallback) : null;
  const purpose = selection?.collection === 'featured'
    ? text(detail?.title) || text(fallback?.title) || firstSentence(summary) || '作者还没写用途说明'
    : text(presentation?.title) || firstSentence(summary) || '作者还没写用途说明';
  const intro = summary || text(detail?.description);
  const extraDescription = text(detail?.description) && text(detail.description) !== summary ? text(detail.description) : '';
  const version = text(detail?.version) || text(fallback?.version);
  const unsupported = knownUnsupported(detail);
  const author = text(detail?.author) || text(fallback?.owner);
  const source = safeSource(detail?.sourceUrl || fallback?.sourceUrl || fallback?.sourceUrls?.[0]);
  const repository = repositoryName(source);
  const categoryLabel = selection?.collection === 'community'
    ? text(getCommunityOverview().categories.find(category => category.id === text(fallback?.categoryId))?.label)
    : '';
  const installation = detail?.installation;
  const phase = installation?.status;
  const ready = phase === 'ready' && installation.installed && installation.enabled && installation.active;
  const busy = Boolean(state.catalogBusy);
  const actualVersion = text(installation?.version);
  const localNewer = Boolean(actualVersion && version && isNewerVersion(actualVersion, version));
  const installedConflict = phase === 'conflict' && installation.installed === true;
  const sameVersionConflict = installedConflict && actualVersion && actualVersion === version;
  const localInstalled = phase === 'installed-local' && installation.installed === true;
  const localState = installation?.enabled !== true ? '未启用' : installation?.active === true ? '正在运行' : '已启用，尚未确认正常运行';
  const conflictNote = !installedConflict ? '' : sameVersionConflict
    ? `本机已安装版本 ${actualVersion}，但安装来源不同。本次没有替换已有插件。`
    : localNewer
      ? `本机装的是 ${actualVersion} 版，目录里记的是 ${version} 版；你装的比目录里记的新。本次没有替换已有插件。`
      : `本机已安装${actualVersion ? `版本 ${actualVersion}` : '同名插件'}；本页版本 ${version || '待核对'}。本次没有替换已有插件。`;
  const versionLabel = !version ? '' : selection?.collection === 'community'
    ? `，社区目录记录的版本是 ${version}`
    : `，记录版本是 ${version}`;
  const sourceRetry = !unsupported && canRecheckPluginSource(detail);
  const primarySourceRetry = sourceRetry&&detail.sourceRecheckAllowed===true&&!localInstalled;
  const terminalProblem = Object.hasOwn(problemMessages, installation?.code ?? '');
  const canInstall = detail?.installable === true && !unsupported && ['not-installed', 'installed-disabled', 'failed'].includes(phase) && !terminalProblem;
  const button = (label, onClick, props = {}) => h('button', { type: 'button', className: 'pf8_btn', onClick, ...props }, label);
  const triggerInstall = () => {
    if (typeof onRequestConfirm !== 'function') return controller.installCatalogPlugin();
    const enableOnly = phase === 'installed-disabled';
    return onRequestConfirm({
      title: enableOnly ? '启用这个插件？' : '安装前确认',
      body: enableOnly
        ? '这个插件已在本机目录中，确认后会启用并尝试接入当前 DSH。'
        : '装之前我会再核对作者、版本与当前 DSH 兼容范围；对不上会停下来告诉你，不会覆盖冲突插件。',
      facts: [
        { label: '插件', value: displayName(name) },
        version ? { label: '版本', value: version } : null,
        author ? { label: '作者', value: author } : null,
        repository ? { label: '来源', value: repository } : null,
      ].filter(Boolean),
      confirmLabel: enableOnly ? '确认启用' : phase === 'failed' ? '重试安装' : '确认安装',
      cancelLabel: '先不装',
      onConfirm: () => controller.installCatalogPlugin(),
    });
  };
  const action = ready ? button('已安装', () => {}, { className: 'pf8_btn pf8_ink', disabled: true })
    : busy ? button(state.catalogBusy === 'install' ? (phase === 'installed-disabled' ? '正在启用…' : '正在安装…') : state.catalogBusy === 'status' ? '正在核对…' : '正在读取详情…', () => {}, { className: 'pf8_btn pf8_ink', disabled: true })
      : unsupported ? button('这个版本装不了', () => {}, { disabled: true })
      : primarySourceRetry ? button('重新核对来源', () => controller.refreshCatalogPlugin(), {className:'pf8_btn pf8_ink'})
      : localInstalled ? button(installation.componentOnly ? '已安装配套组件' : '已安装（来源待核对）', () => {}, {disabled:true})
      : installedConflict ? button(sameVersionConflict ? '已安装（来源不同）' : actualVersion ? '已安装其他版本' : '已安装同名插件', () => {}, { disabled: true })
        : canInstall ? button(phase === 'installed-disabled' ? '启用插件' : phase === 'failed' ? '重试安装' : '安装插件', triggerInstall, { className: 'pf8_btn pf8_ink' })
        : terminalProblem ? button('核对安装状态', () => controller.refreshCatalogPlugin(), {className:'pf8_btn pf8_ink'})
        : phase === 'unavailable' || detail && !detail.installable && !['conflict', 'unknown', 'installing'].includes(phase) ? button(unpublishedSource(detail) ? '暂未提供安装版本' : '当前版本暂不可安装', () => {}, { disabled: true })
          : button(detail ? '核对安装状态' : '重新读取详情', () => controller.refreshCatalogPlugin(), { className: 'pf8_btn pf8_ink' });
  // 这一行说明现在真正处在什么状态；测试和现有安装流程都依赖它。
  const note = ready ? '已安装并启用，可以在 DeepSeek Harness 中使用。'
    : primarySourceRetry ? `${text(detail.unavailableReason)||'固定安装包需要重新核对原来源。'}${phase==='unknown'?' 当前安装状态仍待核对。':''}`
    : localInstalled ? `本机已安装${installation.componentOnly ? '配套组件 ' : ' '}${text(installation.packageName)}${actualVersion ? `@${actualVersion}` : ''}，${localState}。${localNewer ? `目录里记的是 ${version} 版；你装的比目录里记的新。` : ''}${text(detail?.unavailableReason) || '本页安装来源尚待核对，保留当前安装。'}`
    : (conflictNote ? `${conflictNote} 本机状态：${localState}。` : '') || (unsupported ? text(detail?.unavailableReason) : '') || (['PLUGIN_INSTALL_APPROVAL_REQUIRED','PLUGIN_INSTALL_RESTART_REQUIRED'].includes(installation?.code)?problemMessages[installation.code]:'') || (phase === 'unknown' ? text(installation?.message) || problemMessages[installation?.code] : '') || text(detail?.unavailableReason) || (phase === 'conflict' && installation?.installed === false ? text(installation.message) : '') || problemMessages[installation?.code] || text(installation?.message)
      || (phase === 'unknown' || phase === 'installing' ? '安装结果尚未确认。核对状态会继续查看这一次安装，不会重复安装。'
        : phase === 'installed-disabled' ? '插件已安装，启用后即可使用。'
          : phase === 'conflict' ? '当前已有不同版本或来源的同名插件，本次没有替换。'
            : phase === 'failed' ? '这次安装没有完成，原有插件未被替换。'
        : detail?.installable ? '还没装。点「安装插件」就会装到当前 DeepSeek Harness，不用去插件管理器。' : '正在核对所选插件的来源和安装状态。');
  const nextStep = ready ? '已经装好并启用，可以直接在 DSH 里用。'
    : canInstall ? '会先核对作者、版本和兼容，装之前再问你一次。'
      : primarySourceRetry ? '会重新核对原来源，不会重复安装。'
        : '';
  const requirements = strings(detail?.requirements ?? fallback?.requirements).map(value => value === '账号、输入输出和首次使用前提来自作者资料；未知条件需在会话确认。' ? '具体配置和授权要求以作者说明为准。' : value);
  // These two internal retrieval notes describe the earlier candidate stage.
  // Installation now has its own live status; retain actual author limitations.
  const limitations = strings(detail?.limitations ?? fallback?.limitations).filter(value => !/^来自动态来源与作者资料的候选线索；|^已核对精确 npm 版本的 bundle 清单，/.test(value));
  // 「先问问适不适合我」走现有的「了解并使用这个插件」那条路；精选则走现有精选入口。
  const consult = selection?.collection === 'community'
    ? (typeof controller.startCommunityPlugin === 'function' ? () => { controller.closeCatalogPlugin?.(); controller.closeCommunity?.(); void controller.startCommunityPlugin(selection.entryId); } : null)
    : (typeof controller.startFeatured === 'function' ? () => { controller.closeCatalogPlugin?.(); void controller.startFeatured(selection.entryId); } : null);
  const kicker = selection?.collection === 'featured'
    ? '精选，作者亲手做、亲手验过'
    : categoryLabel ? `插件商店里的「${categoryLabel}」` : '插件商店里的社区插件';
  // 精选的作者就是「发现好插件」的维护者；社区插件没有作者字段时只写版本，不写「作者未记录」。
  const maker = selection?.collection === 'featured' ? '发现好插件的作者' : author;
  // 没有当场读到线上最新版时只写目录里的记录，不写「现在是」（SPEC 第 8 节）。
  // 精选写目录里锁定的那版；社区详情本来就在这次请求里读了来源，保留原来的「现在是」。
  const makerLine = selection?.collection === 'featured'
    ? `发现好插件的作者做的${version ? `，目录里记的是 ${version} 版` : ''}`
    : `${maker ? `${maker} 做的` : ''}${maker && version ? '，' : ''}${version ? `现在是 ${version} 版` : ''}`;
  const factRow = (label, value, roleProps = {}) => h('div', { className: 'pf8_fact' },
    h('dt', null, label), h('dd', roleProps, value));
  return h('article', { className: 'pfv_plugin_detail pf8_detail pf_v8', 'aria-labelledby': 'pfv_plugin_detail_title' },
    h('div', { className: 'pf8_wrap pf8_detail_wrap' },
      h('button', { type: 'button', className: 'pf8_lk pf8_detail_back', onClick: () => controller.closeCatalogPlugin() },
        state.communityOpen ? '返回插件商店' : '返回'),
      h('div', { className: 'pf8_detail_card' },
        h('header', { className: 'pf8_detail_head' },
          h('p', { className: 'pf8_detail_kicker' }, kicker),
          h('h1', { id: 'pfv_plugin_detail_title', tabIndex: -1, className: purpose.length > 28 ? 'pf8_detail_long' : undefined }, purpose),
          intro && !sameLine(intro, purpose) ? h('p', { className: 'pf8_detail_lead' }, intro) : null,
          h('div', { className: 'pf8_detail_block' },
            h('code', null, displayName(name)),
            makerLine ? h('p', null, makerLine) : null)),
        extraDescription ? h('section', { className: 'pf8_detail_section' }, h('h2', null, '能帮你做什么'), h('p', { className: 'pf8_detail_lead' }, extraDescription)) : null,
        h('section', { className: 'pf8_detail_section pf8_detail_facts', 'aria-labelledby': 'pf8_detail_know' },
          h('h2', { id: 'pf8_detail_know' }, '用之前要知道'),
          h('dl', { className: 'pf8_factlist' },
            factRow('现在', note, { role: 'status', 'aria-live': 'polite' }),
            requirements.length || limitations.length
              ? factRow('留意', h('ul', { className: 'pf8_detail_list' }, ...[...requirements, ...limitations].map((value, index) => h('li', { key: index }, value))))
              : null,
            repository ? factRow('来源', `GitHub 上的 ${repository}${versionLabel}。`) : null,
            factRow('还没核对的', unsupported
              ? '上面的介绍是作者自己写的。'
              : '上面的介绍是作者自己写的。装之前我会核对作者、版本和兼容，对不上就停下来告诉你。')),
          h('details', { className: 'pf8_fit_inline' },
            h('summary', null,
              h('span', null, '本地兼容与来源快查'),
              h('span', {
                className: 'pf8_fit_badge',
                'data-tone': ready ? 'ok' : unsupported || installedConflict ? 'warn' : 'neutral',
              }, ready ? '本机已就绪' : unsupported ? '版本不兼容' : installedConflict ? '存在同名冲突' : detail?.compatibility?.status === 'compatible' ? '目录兼容' : '安装时实机核对')),
            h('div', { className: 'pf8_fit_grid' },
              h('dl', { className: 'pf8_factlist' },
                factRow('当前宿主', text(state.bootstrap?.hostVersion) || '未读取（安装时按实机版本核对）'),
                factRow('兼容记录', unsupported ? text(detail?.unavailableReason) || '当前宿主版本不兼容' : detail?.compatibility?.status === 'compatible' ? '已记录与当前方向兼容' : '暂无额外兼容阻断，安装前会再查'),
                factRow('目标包名', text(installation?.packageName) || repository || displayName(name) || '待确认'),
                factRow('本机状态', ready ? '已安装并启用' : localInstalled ? `${localState}${actualVersion ? `（${actualVersion}）` : ''}` : installedConflict ? `已有同名安装（${actualVersion || '版本未知'}）` : phase === 'installed-disabled' ? '已安装，未启用' : '尚未安装'))))),
        h('div', { className: 'pf8_detail_install' },
          h('div', { className: 'pf8_detail_actions' },
            action,
            consult ? button('先问问适不适合我', consult, { disabled: busy }) : null,
            sourceRetry && !primarySourceRetry ? button('重新核对来源', () => controller.refreshCatalogPlugin(), { disabled: busy })
              : installedConflict || localInstalled || canInstall && phase === 'failed' ? button('核对安装状态', () => controller.refreshCatalogPlugin(), { disabled: busy }) : null,
            source ? h('a', { className: 'pf8_detail_source', href: source, target: '_blank', rel: 'noopener noreferrer' }, '去 GitHub 看源码') : null),
          nextStep ? h('p', { className: 'pf8_detail_note' }, nextStep) : null),
        state.catalogError ? h('div', { className: 'pfv_plugin_error', role: 'alert' }, h('p', null, text(state.catalogError))) : null)));
}
