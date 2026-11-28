import { browseCommunity, getActiveCommunityCatalog, getCommunityOverview, isCommunityEntryInstalled, isMonorepoSubpath } from './community-catalog.js';
import { communityPresentation } from './community-presentation.js';

const MARKET_INDEX_URL = 'https://raw.githubusercontent.com/oxmumu3/dsh-plugin-finder/main/index.json';

// The selected identity travels separately as communityEntryId. Metadata and
// stage-specific authority belong to the server's system/data envelope.
export function communityPluginRequest() {
  return '我想了解并使用刚选中的插件：它能帮我完成什么、需要哪些配置，以及怎样在当前工作区开始使用。';
}

// 商店是独立一页，首页的触发按钮会随首页一起卸载。记住一个稳定键，
// 返回时在重建后的首页里找回同一个入口，而不是只拿住已经断开的 DOM 节点。
export const RETURN_KEY_ATTRIBUTE = 'data-pf-return-key';

const returnKeyOf = node => {
  for (let current = node; current; current = current.parentElement) {
    const key = current.getAttribute?.(RETURN_KEY_ATTRIBUTE);
    if (typeof key === 'string' && key) return key;
  }
  return '';
};

export function rememberReturnPoint(doc = globalThis.document) {
  const focus = doc?.activeElement;
  const positions = [];
  const root = focus?.closest?.('.pf_root') || doc?.querySelector?.('[data-plugin-finder]');
  for (let node = root; node; node = node.parentElement) if (node.scrollHeight > node.clientHeight) positions.push([node, node.scrollTop]);
  return { focus, key: returnKeyOf(focus), root, positions };
}

export function restoreReturnPoint(point, doc = globalThis.document) {
  const scope = point?.root?.isConnected ? point.root : doc;
  const keyed = point?.key
    ? Array.from(scope?.querySelectorAll?.(`[${RETURN_KEY_ATTRIBUTE}]`) ?? []).find(node => node.getAttribute?.(RETURN_KEY_ATTRIBUTE) === point.key)
    : null;
  const target = keyed || (point?.focus?.isConnected ? point.focus : null);
  target?.focus?.({ preventScroll: true });
  for (const [node, top] of point?.positions ?? []) if (node.isConnected) node.scrollTop = top;
  return target ?? null;
}

const count = value => Number(value || 0).toLocaleString('en-US');
const formatStars = stars => {
  if (!Number.isFinite(stars) || stars <= 0) return '';
  if (stars >= 10000) return `${(stars / 1000).toFixed(0)}k`;
  if (stars >= 1000) return `${(stars / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(stars);
};
const text = value => (typeof value === 'string' ? value : '');
// name 可能是「作者#插件名」；屏幕上只显示插件名，仓库地址仍用完整来源。
const displayName = value => {
  const name = text(value);
  const hash = name.lastIndexOf('#');
  return hash >= 0 ? name.slice(hash + 1) : name;
};
// One summary sentence is the row's purpose; the rest is its note. Never invent a field.
const purposeOf = entry => text(communityPresentation(entry)?.title) || text(entry.summary);
const noteOf = entry => text(communityPresentation(entry)?.note);

function installedKeySet(installedPlugins) {
  const keys = new Set();
  for (const raw of Array.isArray(installedPlugins) ? installedPlugins : []) {
    const value = text(raw).trim().toLowerCase();
    if (!value) continue;
    keys.add(value);
    const slash = value.lastIndexOf('/');
    if (slash >= 0) keys.add(value.slice(slash + 1));
  }
  return keys;
}

/** A standalone, paginated page. The home behind it is not rendered (SPEC 5.6). */
export function createCommunityView(React) {
  const h = React.createElement;
  return function CommunityView({ controller, busy = false, modelReady = true, intent = null, overview: overviewProp = null, installedPlugins = [], copyText = null }) {
    const localHasEntries = getActiveCommunityCatalog().entries.length > 0;
    const useRemote = !localHasEntries && typeof controller?.browseCommunity === 'function';
    const [remoteOverview, setRemoteOverview] = React.useState(null);
    const overview = remoteOverview || overviewProp || getCommunityOverview();
    const categories = Array.isArray(overview?.categories) ? overview.categories : [];
    const snapshot = text(overview?.fetchedAt).slice(0, 10);
    const installedKeys = installedKeySet(installedPlugins);
    const hasInstalled = installedKeys.size > 0;
    const [view, setView] = React.useState(intent
      ? { categoryId: text(intent.categoryId), query: text(intent.query), sort: 'default', filter: 'all', page: 1 }
      : { categoryId: '', query: '', sort: 'default', filter: 'all', page: 1 });
    const [remoteResult, setRemoteResult] = React.useState({ entries: [], total: Number(overview?.total) || 0, page: 1, pageSize: 24, pages: 1, loading: useRemote });
    const title = React.useRef(null), moving = React.useRef(false);
    React.useEffect(() => {
      if (!intent) return;
      moving.current = true;
      setView({ ...view, categoryId: text(intent.categoryId), query: text(intent.query), page: 1 });
    }, [intent?.nonce]);
    React.useEffect(() => { if (moving.current) { title.current?.focus?.(); moving.current = false; } }, [view.categoryId, view.page, view.sort, view.filter]);
    React.useEffect(() => {
      if (!useRemote) return undefined;
      let alive = true;
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      setRemoteResult({ ...remoteResult, loading: true });
      void Promise.resolve(controller.browseCommunity({
        categoryId: view.categoryId,
        query: view.query,
        sort: view.sort,
        filter: view.filter,
        page: view.page,
        pageSize: 24,
        signal: ac?.signal,
      })).then(data => {
        if (!alive || !data) return;
        if (data.overview) setRemoteOverview(data.overview);
        setRemoteResult({ entries: Array.isArray(data.entries) ? data.entries : [], total: Number(data.total) || 0, page: Number(data.page) || 1, pageSize: Number(data.pageSize) || 24, pages: Number(data.pages) || 0, loading: false });
      }).catch(() => {
        if (alive) setRemoteResult({ ...remoteResult, loading: false });
      });
      return () => { alive = false; ac?.abort?.(); };
    }, [useRemote, view.categoryId, view.query, view.sort, view.filter, view.page]);

    const browse = (patch = {}) => { moving.current = true; setView({ ...view, page: 1, ...patch }); };
    // Typing also starts at page 1, but it is not a page/category move: keep the
    // caret in the box instead of announcing the reset by focusing the title.
    const search = query => { moving.current = false; setView({ ...view, query, page: 1 }); };
    const result = useRemote
      ? remoteResult
      : browseCommunity({ categoryId: view.categoryId, query: view.query, sort: view.sort, filter: view.filter, installedPlugins, page: view.page, pageSize: 24 });
    const back = () => (controller.closeCommunity || controller.showHome)?.();
    const row = entry => {
      const name = displayName(entry.name);
      const purpose = purposeOf(entry) || '作者还没写用途说明，可以先看来源。';
      const note = noteOf(entry);
      const version = text(entry.version);
      const installed = isCommunityEntryInstalled(entry, installedKeys);
      const starsText = formatStars(entry.stars);
      const monorepo = isMonorepoSubpath(entry);
      return h('li', { key: entry.id, className: 'pfv_community_entry' },
        h('button', {
          type: 'button', className: 'pf8_store_row',
          'aria-label': `查看 ${name}（${entry.owner}）的详情`,
          onClick: event => controller.showCatalogPlugin('community', entry.id, event?.currentTarget),
        },
        h('span', { className: 'pf8_store_who' },
          h('code', null, name),
          h('small', null, entry.owner ? `${entry.owner} 做的` : '作者未记录')),
        h('span', { className: 'pf8_store_use' },
          h('b', null, purpose),
          note ? h('small', null, note) : null),
        h('span', { className: 'pf8_store_v' },
          installed ? h('span', { className: 'pf8_store_badge is_ok' }, '已安装') : null,
          starsText ? h('span', { className: 'pf8_store_star', title: monorepo ? '来自所属 GitHub 大仓库的 Star 数' : 'GitHub Star 数' }, `★ ${starsText}`) : null,
          entry.npmName ? h('span', { className: 'pf8_store_badge' }, 'npm') : null,
          h('span', { className: 'pf8_store_ver' }, version || '版本未记录'))));
    };
    const shareTotal = Math.max(1, categories.reduce((sum, item) => sum + Number(item.count || 0), 0));
    const topShares = !view.categoryId && !view.query && view.filter === 'all'
      ? [...categories].filter(item => Number(item.count) > 0).sort((a, b) => Number(b.count) - Number(a.count)).slice(0, 5)
      : [];
    const statusLine = result.loading
      ? '正在读取插件目录…'
      : view.query
        ? `搜「${view.query}」，找到 ${count(result.total)} 个。`
        : view.filter === 'npm'
          ? `仅看 npm 直装，共 ${count(result.total)} 个，每页 24 个。`
          : view.filter === 'installed'
            ? `本机已安装且收录在目录中的共 ${count(result.total)} 个。`
            : `全部 ${count(result.total)} 个，每页 24 个。`;

    return h('section', { className: 'pfv_community pf8_store pf_v8', 'aria-labelledby': 'pfv_community_title' },
      h('div', { className: 'pf8_wrap pf8_shopw' },
        h('button', { type: 'button', className: 'pf8_lk pf8_store_back', onClick: back }, '返回'),
        h('div', { className: 'pf8_store_title' },
          h('h1', { id: 'pfv_community_title', ref: title, tabIndex: -1 }, '插件商店'),
          h('p', null, snapshot
            ? `这份目录是 ${snapshot} 存下来的，共 ${count(overview.total)} 个（满 24 小时后台自动同步）。介绍是作者自己写的，装之前我会再核对一遍。`
            : '介绍是作者自己写的，装之前我会再核对一遍。'),
          topShares.length ? h('div', { className: 'pf8_store_shares', 'aria-label': '主要分类占比' },
            ...topShares.map(category => {
              const pct = Math.max(3, Math.round((Number(category.count || 0) / shareTotal) * 100));
              return h('div', { key: `share-${category.id}`, className: 'pf8_store_srow' },
                h('span', null, category.label),
                h('div', { className: 'pf8_store_sbar', 'aria-hidden': 'true' },
                  h('span', { className: 'pf8_store_sfill', style: { width: `${pct}%` } })),
                h('span', { className: 'pf8_store_scnt' }, `${count(category.count)} 个`));
            })) : null),
        h('label', { className: 'pf8_store_search' }, h('span', { className: 'pf8_sr' }, '搜索插件'),
          h('input', {
            type: 'search', value: view.query, maxLength: 200, placeholder: '搜插件名、作者或用途',
            onChange: event => search(event.target.value),
          })),
        h('div', { className: 'pf8_store_filters', role: 'group', 'aria-label': '按用途筛选插件' },
          ...[{ id: '', label: '全部', count: overview.total }, ...categories].map(category => h('button', {
            key: category.id || 'all', type: 'button', 'aria-label': category.label, 'aria-pressed': view.categoryId === category.id,
            onClick: () => browse({ categoryId: category.id }),
          }, h('span', null, category.label), category.count !== undefined ? h('small', null, count(category.count)) : null))),
        h('div', { className: 'pf8_store_bar', role: 'group', 'aria-label': '排序与来源筛选' },
          h('div', { className: 'pf8_store_seg' },
            h('button', { type: 'button', 'aria-pressed': view.sort === 'default', onClick: () => browse({ sort: 'default' }) }, '综合排序'),
            h('button', { type: 'button', 'aria-pressed': view.sort === 'stars', onClick: () => browse({ sort: 'stars' }) }, '按 GitHub Star')),
          h('div', { className: 'pf8_store_seg' },
            h('button', { type: 'button', 'aria-pressed': view.filter === 'all', onClick: () => browse({ filter: 'all' }) }, '全部来源'),
            h('button', { type: 'button', 'aria-pressed': view.filter === 'npm', onClick: () => browse({ filter: 'npm' }) }, '仅 npm 直装'),
            hasInstalled ? h('button', { type: 'button', 'aria-pressed': view.filter === 'installed', onClick: () => browse({ filter: 'installed' }) }, '本机已装') : null)),
        h('p', { className: 'pf8_store_count', role: 'status', 'aria-live': 'polite' }, statusLine),
        result.entries.length
          ? h('ul', { className: 'pf8_store_list' }, ...result.entries.map(row))
          : !result.loading ? h('div', { className: 'pf8_store_empty' },
            h('p', null, view.query
              ? `没有搜到「${view.query}」。换个词试试，或者直接把想做的事告诉我，我来找、来拼、来做。`
              : view.filter === 'installed'
                ? '本机已安装的插件里，这个分类下暂时没有目录收录项。'
                : '这个分类下暂时没有可显示的插件。换个分类，或者直接把想做的事告诉我。'),
            h('div', { className: 'pf8_store_empty_acts' },
              h('button', { type: 'button', className: 'pf8_btn pf8_ink', onClick: back }, '回首页说一件想做的事'),
              view.query || view.filter !== 'all' ? h('button', { type: 'button', className: 'pf8_store_clear', onClick: () => browse({ query: '', filter: 'all' }), disabled: busy }, '清空搜索') : null)) : null,
        result.pages > 1 ? h('nav', { className: 'pf8_store_pages', 'aria-label': '插件目录分页' },
          h('button', { type: 'button', className: 'pf8_store_page', disabled: busy || result.page <= 1, onClick: () => { moving.current = true; setView({ ...view, page: result.page - 1 }); } }, '上一页'),
          h('span', null, `第 ${result.page} 页，共 ${result.pages} 页`),
          h('button', { type: 'button', className: 'pf8_store_page', disabled: busy || result.page >= result.pages, onClick: () => { moving.current = true; setView({ ...view, page: result.page + 1 }); } }, '下一页')) : null,
        h('footer', { className: 'pf8_store_foot' },
          h('p', null, '这些是社区作者公开的插件信息，收录不代表已安装或运行验证。'),
          h('div', { className: 'pf8_store_foot_links' },
            typeof copyText === 'function' ? h('button', {
              type: 'button',
              className: 'pf8_lk pf8_store_foot_btn',
              title: '复制官方 format: 1 索引地址，可粘贴到 DSH「插件 → 发现」订阅',
              onClick: () => copyText(MARKET_INDEX_URL),
            }, '复制自研精选市场源') : null,
            h('a', { href: overview.sourceUrl || 'https://awesome-dsh-plugin.com/', target: '_blank', rel: 'noopener noreferrer' }, '公开目录来源')))));
  };
}
