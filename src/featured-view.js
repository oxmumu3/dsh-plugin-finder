import { featuredCatalog } from './featured-catalog.js';
import { renderPluginDetailView } from './plugin-detail-view.js';
import { featuredTopics, rankFeatured, safeFeaturedInstall } from './featured.js';

const text = value => typeof value === 'string' ? value : '';
const items = value => Array.isArray(value) ? value : [];
const statusLabels = { available: '公开包已核对', preview: '本地预览', private: '私有接入' };
const dateLabel = value => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '时间待核对';
};
/** Read-only rendering. User actions stay in the controller; no hooks or effects. */
export function renderFeaturedView({ h, state, controller, copyText, busy = false, mode = 'home' }) {
  const preferences = state.featuredPreferences ?? {};
  const interests = new Set(items(preferences.interests));
  const dismissed = new Set(items(preferences.dismissed));
  const recommendations = rankFeatured(featuredCatalog, {
    history: Array.isArray(state.featuredHistory) ? state.featuredHistory : state.history,
    preferences,
  });
  const selected = mode === 'detail' ? featuredCatalog.find(entry => entry.id === state.featuredId) : null;
  const button = (label, onClick, attrs = {}) => h('button', { type: 'button', className: 'pf_btn', onClick, ...attrs }, label);
  const list = values => h('ul', { className: 'pf_list' }, ...values.map((value, index) => h('li', { key: index }, value)));
  const status = entry => h('span', { className: 'pf_tag pf_featured_status' }, entry.status === 'available' && !safeFeaturedInstall(entry) ? '发行来源待复核' : statusLabels[entry.status]);
  const card = (entry, reason, group = 'catalog') => h('article', {
    key: entry.id,
    className: `pf_featured_card${reason ? ' pf_featured_recommended' : ''}`,
    'aria-labelledby': `pf_${group}_${entry.id}`,
  },
  h('div', { className: 'pfv_featured_identity' },
    h('svg', { className: 'pfv_featured_icon', viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false },
      h('path', { d: {
        'agent-twin': 'M15 19v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M17 5a3 3 0 0 1 0 6M21 19v-2a4 4 0 0 0-3-3.87',
        'family-assistant': 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
        'dsh-dot': 'M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7M8 13h8M8 17h5',
        'dot-harness': 'M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5',
      }[entry.id] })),
    h('h3', { id: `pf_${group}_${entry.id}` }, entry.subtitle.split(' · ')[0])),
  h('p', { className: 'pf_featured_summary' }, entry.title),
  reason ? h('p', { className: 'pf_featured_reason' }, reason) : null,
  h('div', { className: 'pf_featured_card_actions' },
    status(entry),
    button('查看详情', event => controller.showCatalogPlugin('featured', entry.id, event?.currentTarget), { className: 'pf_btn pf_text', 'aria-label': `查看${entry.title}的详情` })));

  const draftItems = items(state.featuredDrafts).filter(draft => draft && typeof draft.id === 'string').slice(0, 20);
  const drafts = draftItems.length ? h('section', { className: 'pf_section pf_featured_drafts', 'aria-label': '保留的编辑草稿' },
    h('div', { className: 'pf_section_head' }, h('h2', null, '保留的编辑草稿'), h('span', { className: 'pf_small pf_muted' }, `${draftItems.length} 份 · 本机保存`)),
    h('p', { className: 'pf_small pf_muted' }, '从场景开始前保留的输入，可以恢复后继续编辑。移除只删除这份本机输入副本，历史任务仍保留。'),
    h('ul', { className: 'pf_featured_draft_list' }, ...draftItems.map(draft => {
      const title = (text(draft.title) || text(draft.request) || '未提交的编辑草稿').replace(/\s+/gu, ' ').trim();
      const snippet = title.length > 48 ? `${title.slice(0, 48)}…` : title;
      return h('li', { className: 'pf_featured_draft', key: draft.id },
        h('div', null, h('p', { className: 'pf_featured_draft_title' }, snippet), text(draft.createdAt) ? h('p', { className: 'pf_small pf_muted' }, dateLabel(draft.createdAt)) : null),
        h('div', { className: 'pf_featured_draft_actions' },
          button('恢复草稿', () => controller.restoreFeaturedDraft(draft.id), { disabled: busy, 'aria-label': `恢复草稿：${snippet}` }),
          button('移除这份输入', () => controller.removeFeaturedDraft(draft.id), { className: 'pf_btn pf_text', disabled: busy, 'aria-label': `移除这份输入：${snippet}` })));
    }))) : null;

  if (mode === 'drafts') return drafts;

  let content;
  if (selected) {
    // Legacy callers use the same detail surface. Catalog cards request the
    // live server detail directly; this fallback never fabricates installability.
    const preview = selected.status !== 'available' ? {
      detailId: '', collection: 'featured', entryId: selected.id,
      name: selected.subtitle.split(' · ')[0], title: selected.title,
      summary: selected.summary, requirements: selected.requirements,
      limitations: selected.limitations, version: selected.version,
      installable: false, unavailableReason: selected.status === 'private' ? '此插件为私有接入，暂未提供公开安装版本。' : '此插件为本地预览，暂未提供公开安装版本。',
      installation: { status: 'unavailable', installed: false, enabled: false, active: false },
    } : null;
    content = renderPluginDetailView({ h, state: { ...state, catalogSelection: { collection: 'featured', entryId: selected.id }, catalogDetail: state.catalogDetail || preview, catalogBusy: state.catalogBusy || (!preview ? 'detail' : '') }, controller: { ...controller, closeCatalogPlugin: () => controller.showHome(), refreshCatalogPlugin: () => controller.showCatalogPlugin('featured', selected.id) } });
  } else {
    const recommendedIds = new Set(recommendations.map(({ entry }) => entry.id));
    // A product has one place in the collection. Positive local signals change
    // its order and explain why; cold start remains explicitly editorial.
    const editorial = featuredCatalog.filter(entry => !recommendedIds.has(entry.id));
    content = h('div', { className: 'pf_featured_home' },
      h('section', { className: 'pf_featured_group', 'aria-label': '精选插件' },
        h('div', { className: 'pf_section_head' }, h('div', null, h('h2', null, '精选插件'), h('p', { className: 'pfv_featured_intro' }, '从一个具体用途，看看还能做什么。'))),
        h('div', { className: 'pf_featured_grid pfv_featured_collection' },
          recommendations.length ? h('div', { className: 'pfv_featured_matches', 'aria-label': '与你相关的精选插件' }, ...recommendations.map(({ entry, reason }) => card(entry, reason, 'recommended'))) : null,
          ...editorial.map(entry => card(entry, null)))),
      h('details', { className: 'pf_featured_settings' },
        h('summary', null, '调整推荐'),
        h('fieldset', { className: 'pf_featured_interests' }, h('legend', null, '感兴趣的方向'),
          h('div', { className: 'pf_featured_interest_buttons' }, ...featuredTopics.map(topic => button(topic.label, () => controller.toggleFeaturedInterest(topic.id), { key: topic.id, 'aria-pressed': interests.has(topic.id), disabled: busy }))),
          h('p', { className: 'pf_small pf_muted' }, '可多选，只保存在本机。推荐也会参考本机已保存的方案。')),
        h('div', { className: 'pf_featured_hidden' },
          h('p', { className: 'pf_small pf_muted' }, '减少不感兴趣的推荐，仍可从精选查看详情。'),
          h('ul', { className: 'pf_featured_hidden_list' }, ...featuredCatalog.map(entry => h('li', { key: entry.id },
            h('span', null, entry.subtitle.split(' · ')[0]),
            dismissed.has(entry.id) ? h('span', { className: 'pf_small pf_muted' }, '已减少推荐') : button('不感兴趣', () => controller.dismissFeatured(entry.id), { className: 'pf_btn pf_text', disabled: busy, 'aria-label': `对${entry.title}不感兴趣` })))),
          dismissed.size ? button('恢复全部推荐', () => controller.restoreFeatured(), { className: 'pf_btn pf_text', disabled: busy }) : null)));
  }
  return h('div', { className: 'pf_featured' },
    state.featuredWarning ? h('div', { className: 'pf_banner pf_small', role: 'status' }, text(state.featuredWarning)) : null,
    content,
    h('p', { className: 'pf_small pf_muted pf_featured_disclosure' }, selected ? '自研策展 · 牛村木木山。收录表达作者的场景选择，不代表官方审核或质量认证。' : '作者精选 · 牛村木木山。使用前提与验证范围见详情。'));
}
