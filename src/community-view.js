import { browseCommunity, getCommunityOverview } from './community-catalog.js';
import { communityPresentation } from './community-presentation.js';

// The selected identity travels separately as communityEntryId. Metadata and
// stage-specific authority belong to the server's system/data envelope.
export function communityPluginRequest() {
  return '我想了解并使用刚选中的插件：它能帮我完成什么、需要哪些配置，以及怎样在当前工作区开始使用。';
}

function authorUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && url.pathname.split('/').filter(Boolean).length >= 2 ? url.href : null; }
  catch { return null; }
}
const count = value => Number(value || 0).toLocaleString('en-US');

/** A local, paginated browser. Selection is the only action delegated to Host. */
export function createCommunityView(React) {
  const h = React.createElement;
  const overview = getCommunityOverview();
  const button = (label, onClick, props = {}) => h('button', { type: 'button', className: 'pfv_button pfv_community_button', onClick, ...props }, label);
  const categoryIcon = id => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false }, h('path', { d: {
    work: 'M9 6V4h6v2M3 8h18v12H3V8ZM3 12h18M10 12v3h4v-3',
    content: 'M5 3h10l4 4v14H5V3Zm10 0v5h4M8 12h8M8 16h6',
    knowledge: 'M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3V4Zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5V4Z',
    experience: 'M3 4h18v15H3V4ZM3 9h18M8 9v10M6 6.5h.01M9 6.5h.01',
    develop: 'm8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
    manage: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  }[id] || 'M4 4h16v16H4V4Z' }));
  const categoryDescriptions = {
    work: '项目、研究与日常事务', content: '文档、写作与语音',
    knowledge: '记忆、提示词与专业助手', experience: '专注、主题与个性化',
    develop: '代码、设备与外部服务', manage: '模型、会话与使用情况',
  };
  // Capability symbols are editorial aids, never third-party product logos.
  const entryIcon = kind => h('span', { className: 'pfv_community_symbol', 'aria-hidden': true },
    h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', focusable: false },
      h('path', { d: {
        board: 'M3 4h18v16H3V4Zm6 0v16m6-16v16M5 8h2m4 3h2m4-3h2',
        book: 'M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V3Zm0 14h16M8 7h8m-8 4h6',
        receipt: 'M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm3 5h8m-8 4h8m-8 4h4',
        document: 'M5 3h10l4 4v14H5V3Zm10 0v5h4M8 12h8m-8 4h5',
        office: 'M4 4h16v16H4V4Zm0 5h16M9 9v11m6-11v11M4 14h16',
        voice: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1M12 18v4m-4 0h8',
        memory: 'M7 4h12v16H7V4ZM4 8h6m-6 4h6m-6 4h6M13 8h3m-3 4h3',
        prompt: 'm5 5 5 7-5 7m8 0h6',
        pen: 'm5 16 11-11 3 3L8 19H5v-3Zm9-9 3 3M4 22h16',
        focus: 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M8 12h8',
        timer: 'M9 2h6M12 2v3m6 1 2 2M12 9v5l3 2M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
        theme: 'M4 4h16v16H4V4Zm8 0v16M4 9h8',
        phone: 'M7 2h10v20H7V2Zm0 4h10m-10 12h10M12 20h.01',
        branch: 'M7 6v12m0-9c8 0 10-1 10-5M9 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm0 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM19 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
        browser: 'M3 4h18v16H3V4Zm0 5h18M6 6.5h.01M9 6.5h.01m4 6 5 2-2 1-1 3-2-6Z',
        meter: 'M4 4v16h16M8 16v-4m5 4V7m5 9v-6',
        chat: 'M3 4h18v13H9l-6 4V4Zm4 5h10m-10 4h6',
        settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
      }[kind] || 'M5 5h14v14H5V5Z' })));
  return function CommunityView({ controller, busy = false, modelReady = true }) {
    const [view, setView] = React.useState({ categoryId: null, query: '', page: 1 });
    const title = React.useRef(null), moving = React.useRef(false);
    React.useEffect(() => { if (moving.current) { title.current?.focus?.(); moving.current = false; } }, [view.categoryId, view.page]);
    const browse = (categoryId, page = 1) => { moving.current = true; setView({ ...view, categoryId, page }); };
    const selected = overview.categories.find(category => category.id === view.categoryId);
    const result = view.categoryId === null ? null : browseCommunity({ categoryId: view.categoryId, query: view.query, page: view.page, pageSize: 24 });
    const entryRow = entry => {
      const source = authorUrl(entry.sourceUrl);
      const presentation = !result ? communityPresentation(entry) : null;
      return h('li', { key: entry.id, className: 'pfv_community_entry' },
        presentation ? entryIcon(presentation.symbol) : null,
        h('div', { className: 'pfv_community_entry_body' },
          h('h4', null, entry.name),
          h('p', { className: 'pfv_community_summary' }, presentation?.title || entry.summary || '作者尚未提供用途说明，可先核对来源。'),
          h('p', { className: 'pfv_community_identity' },
            source ? h('a', { href: source, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${entry.name} 的作者页面` }, `作者 ${entry.owner}`) : h('span', null, `作者 ${entry.owner}`),
            presentation?.note ? h('span', { className: 'pfv_community_requirement' }, presentation.note) : null)),
        h('div', { className: 'pfv_community_entry_actions' },
          button('查看方案', async event => {
            if (busy || !modelReady) return;
            const surface = event?.currentTarget?.closest?.('.pf_root');
            const reveal = () => {
              if (!surface?.isConnected) return;
              const target = surface.querySelector('#pfv_outcome_title') || surface.querySelector('textarea[aria-label="任务描述"]');
              if (!target) return;
              if (target.tagName !== 'TEXTAREA') target.setAttribute('tabindex', '-1');
              target.focus({ preventScroll: true });
              (target.tagName === 'TEXTAREA' ? target.closest('.pfv_home_intro') || target : target).scrollIntoView({ block: 'start', behavior: 'auto' });
            };
            const pending = controller.startCommunityPlugin(entry.id);
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reveal);
            await pending;
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reveal); else reveal();
          }, { disabled: busy || !modelReady, 'aria-label': `查看 ${entry.name}（${entry.owner}）的使用方案` })));
    };
    return h('section', { className: 'pfv_community', 'aria-labelledby': 'pfv_community_title' },
      h('div', { className: 'pfv_community_header' }, h('div', null,
        h('h2', { id: 'pfv_community_title', ref: title, tabIndex: -1 }, result ? selected?.label || '全部插件' : '插件商店'),
        h('p', { className: 'pfv_hint' }, result ? '搜索名称、作者或用途。' : '按用途逛逛社区插件，找到适合你的工具。')),
        result ? button('返回所有分类', () => { moving.current = true; setView({ categoryId: null, query: '', page: 1 }); }) : h('div', { className: 'pfv_community_store_actions' },
          h('span', { className: 'pfv_community_count' }, `已收录 ${count(overview.total)} 个插件条目`),
          button('浏览全部插件', () => browse(''), { className: 'pfv_button pfv_community_button pfv_store_browse' }))),
      result ? h('div', { className: 'pfv_community_browse' },
        h('div', { className: 'pfv_community_filters', role: 'group', 'aria-label': '按用途筛选插件' },
          ...[{ id: '', label: '全部' }, ...overview.categories].map(category => button(category.label, () => browse(category.id), { key: category.id, 'aria-pressed': view.categoryId === category.id }))),
        h('label', { className: 'pfv_community_search' }, h('span', null, '搜索插件'),
          h('input', { type: 'search', value: view.query, maxLength: 200, placeholder: '名称、作者或用途', onChange: event => setView({ ...view, query: event.target.value, page: 1 }) })),
        h('p', { className: 'pfv_community_results', role: 'status', 'aria-live': 'polite' }, `${count(result.total)} 个结果${result.total ? `，第 ${result.page} / ${result.pages} 页` : ''}`),
        result.entries.length ? h('ul', { className: 'pfv_community_list' }, ...result.entries.map(entryRow)) : h('div', { className: 'pfv_community_empty' }, h('p', null, '没有找到匹配的插件。'), h('p', { className: 'pfv_hint' }, '换个关键词，或查看其他用途。'), button('清空搜索', () => setView({ ...view, query: '', page: 1 }), { disabled: !view.query })),
        result.pages > 1 ? h('nav', { className: 'pfv_community_pages', 'aria-label': '插件目录分页' },
          button('上一页', () => browse(view.categoryId, result.page - 1), { disabled: result.page <= 1 }),
          h('span', null, `第 ${result.page} / ${result.pages} 页`),
          button('下一页', () => browse(view.categoryId, result.page + 1), { disabled: result.page >= result.pages })) : null)
        : h('div', { className: 'pfv_community_groups' }, ...overview.categories.map(category => h('section', { key: category.id, className: 'pfv_community_group', 'aria-label': category.label },
          h('div', { className: 'pfv_community_group_heading' }, h('div', { className: 'pfv_community_category' }, h('span', { className: 'pfv_community_category_icon' }, categoryIcon(category.id)), h('div', null, h('h3', null, category.label), h('p', { className: 'pfv_community_category_description' }, categoryDescriptions[category.id]))),
            button(`查看全部 ${count(category.count)}`, () => browse(category.id), { className: 'pfv_button pfv_community_all', 'aria-label': `查看全部${category.label}插件` })),
          h('ul', null, ...category.previews.slice(0, 3).map(entryRow))))),
      h('p', { className: 'pfv_community_provenance' },
        `社区目录 · ${String(overview.fetchedAt).slice(0, 10)} 快照`,
        h('a', { href: overview.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, '公开目录来源'),
        h('span', null, '收录不代表已安装或运行验证。')));
  };
}
