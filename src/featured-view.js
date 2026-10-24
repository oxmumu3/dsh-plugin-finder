import { featuredCatalog } from './featured-catalog.js';
import { featuredTopics, rankFeatured, safeFeaturedInstall } from './featured.js';

const text = value => typeof value === 'string' ? value : '';
const items = value => Array.isArray(value) ? value : [];
const statusLabels = { available: '公开包已核对', preview: '本地预览', private: '私有接入' };
const dateLabel = value => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '时间待核对';
};
function publicSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['github.com', 'raw.githubusercontent.com'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}
const sourceLabel = url => url.endsWith('/SHA256SUMS') ? '发行校验文件' : url.includes('/releases/tag/') ? '精确版本发行说明' : '产品仓库与说明';

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
    button('查看详情', () => controller.showFeatured(entry.id), { className: 'pf_btn pf_text', 'aria-label': `查看${entry.title}的详情` })));

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
    const install = safeFeaturedInstall(selected);
    const sources = selected.sourceUrls.map(publicSource).filter(Boolean);
    content = h('div', { className: 'pf_featured_detail' },
      button('返回首页', () => controller.showHome(), { className: 'pf_btn pf_text pf_flow_back' }),
      h('section', { className: 'pf_section' },
        h('div', { className: 'pf_featured_detail_heading' }, h('div', null, h('p', { className: 'pf_small pf_muted' }, selected.subtitle), h('h2', null, selected.title)), status(selected)),
        h('p', { className: 'pf_featured_lead' }, selected.summary),
        h('p', { className: 'pf_small pf_muted' }, selected.why),
        h('div', { className: 'pf_actions' }, button('试试这个场景', () => controller.tryFeatured(selected.id), { className: 'pf_btn pf_primary', disabled: busy })),
        h('p', { className: 'pf_small pf_muted pf_featured_action_note' }, '先准备可编辑的需求草稿，再由你发起查找。浏览和准备草稿不需要模型。')),
      h('section', { className: 'pf_section' }, h('h3', null, '这个场景适合谁'), list(selected.audience), h('h3', { className: 'pf_featured_subheading' }, '可以从这句话开始'), h('blockquote', { className: 'pf_featured_scenario' }, selected.scenario)),
      h('section', { className: 'pf_section pf_featured_requirements' },
        h('div', null, h('h3', null, '使用前提'), list(selected.requirements)),
        h('div', null, h('h3', null, '当前边界'), list(selected.limitations))),
      h('section', { className: 'pf_section' }, h('h3', null, '产品与组件'), list(selected.components),
        h('dl', { className: 'pf_featured_metadata' },
          h('div', null, h('dt', null, '版本'), h('dd', null, selected.version)),
          h('div', null, h('dt', null, '状态'), h('dd', null, statusLabels[selected.status])),
          h('div', null, h('dt', null, '资料核对'), h('dd', null, h('time', { dateTime: selected.checkedAt }, dateLabel(selected.checkedAt))))),
        h('p', { className: 'pf_small pf_muted' }, '主插件、桥接与管理组件按同一产品归组。平台依赖在使用前提中说明。')),
      h('section', { className: 'pf_section' }, h('h3', null, '来源与起步方式'),
        sources.length ? h('div', { className: 'pf_links' }, ...sources.map(source => h('a', { key: source, href: source, target: '_blank', rel: 'noopener noreferrer' }, sourceLabel(source)))) : h('p', { className: 'pf_small pf_muted pf_featured_source_note' }, '说明依据产品 README 与包版本。暂无已核对的公开产品入口，可先了解这里的场景、前提与限制。'),
        install ? h('div', { className: 'pf_install pf_featured_install' }, h('p', { className: 'pf_small pf_muted' }, '已核对的精确安装来源'), h('code', null, install.spec),
          h('p', { className: 'pf_small pf_muted' }, `版本 ${install.version} · 资产核对 ${dateLabel(install.verifiedAt)}`),
          h('div', { className: 'pf_actions' }, button('复制安装来源', () => copyText(install.spec), { disabled: busy }), button('去 DSH 插件页核对', () => controller.openPluginManager(), { disabled: busy })),
          h('p', { className: 'pf_small pf_muted' }, '在插件页核对宿主兼容性，按提示安装、启用，再进行实际使用验收。'))
          : h('p', { className: 'pf_small pf_muted pf_featured_source_note' }, selected.status === 'available' ? '安装来源需要重新核对，暂不提供复制入口。仍可查看说明或准备场景草稿。' : '此项提供预览说明，当前没有可复制的公开安装来源。')));
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
    h('p', { className: 'pf_small pf_muted pf_featured_disclosure' }, selected ? '自研策展 · 奥克斯木木山。收录表达作者的场景选择，不代表官方审核或质量认证。' : '作者精选 · 奥克斯木木山。使用前提与验证范围见详情。'));
}
