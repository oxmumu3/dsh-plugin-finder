// v8 首页装配：把 v8 的排版接到现有 state/controller 上（SPEC 5.1–5.5）。
// 数据全部来自现有 state 与社区目录快照；拿不到的一律不显示，不编。
// 保留既有测试依赖的钩子：textarea#pfv_home_input、#pfv_home_title、
// role=group[aria-labelledby=pfv_expert_title]，以及「已选插件」行为。

import { createLego } from './v8-lego.js';
import { HOME_EXAMPLES, HOME_WAYS, renderExamples, renderLegend, renderMine } from './v8-home.js';

const text = value => (typeof value === 'string' ? value : '');
const items = value => (Array.isArray(value) ? value : []);
// 商店条目的 name 可能是「作者#插件名」；屏幕上只显示插件名。
const displayName = value => {
  const name = text(value);
  const hash = name.lastIndexOf('#');
  return hash >= 0 ? name.slice(hash + 1) : name;
};
const countText = value => (Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('en-US') : '0');
const short = (value, limit = 42) => {
  const line = text(value).replace(/\s+/g, ' ').trim();
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
};

// 一条保存的方案对到一种积木和一句状态。只读现有字段，不推断完成情况。
// 明确结果反馈才用绿色；只有方案时按方案类型说「给了解法」。
const PLAN_STATES = {
  native: { lego: 'ghost', say: '给了解法：不用装' },
  single: { lego: 'have', say: '给了解法：装一个' },
  combo: { lego: 'have', say: '给了解法：拼几个' },
  hybrid: { lego: 'build', say: '给了解法：拼几个' },
  gap: { lego: 'build', say: '给了解法：要自己做' },
};
export const historyState = record => {
  const feedback = record?.lastFeedback;
  if (feedback?.type === 'result') {
    if (feedback.outcome === 'complete') return { lego: 'done', say: '已经做成了' };
    if (feedback.outcome === 'partial') return { lego: 'build', say: '做到一半，还能接着做' };
    if (feedback.outcome === 'blocked') return { lego: 'slot', say: '上次没做成' };
  }
  const plan = PLAN_STATES[text(record?.planKind)];
  if (plan) return plan;
  if (text(record?.stage) === 'understand') return { lego: 'slot', say: '还没给方案' };
  return { lego: 'slot', say: '还没查完' };
};

const searchTime = value => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return '';
  const date = new Date(milliseconds), pad = number => String(number).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const dateOnly = value => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return '';
  const date = new Date(milliseconds), pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export function createHomeView(React) {
  const h = React.createElement;
  const Lego = createLego(React);

  return function HomeView({
    state, controller, busy, modelReady, locked, homeInput, shortcut, resumeView,
    opportunityCard, opportunitySettings, fallbackIdea, featured, onFeatured, featuredSettings,
    featuredWarning, onCommunity, overview, homeCommunityName, more,
  }) {
    // 「你交代过的事」和「全部 N 件」用的是同一份记录：本机保存的方案。
    // 查找记录（searchHistory）只用于回溯检索，不再冒充方案数量。
    const history = items(state.history).filter(record => record && typeof record === 'object');
    const used = history.length > 0 || Boolean(state.plan) || Boolean(state.taskId);
    const request = text(state.homeRequest);
    const submit = () => { if (!busy && modelReady && request.trim()) void controller.searchHome(); };
    // 用户还没提交的原话要先存进草稿，再换示例。
    const pickExample = value => {
      if (typeof controller.prepareHomeExample === 'function') controller.prepareHomeExample(value);
      else if (!text(state.homeRequest).trim()) controller.setHomeRequest(value);
    };
    const openCommunity = intent => onCommunity?.(intent);
    const total = Number.isSafeInteger(overview?.total) && overview.total >= 0 ? overview.total : 0;
    const snapshotDate = dateOnly(overview?.fetchedAt);
    const categories = items(overview?.categories)
      .filter(item => text(item?.label) && Number.isSafeInteger(item?.count))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6);
    const installed = items(state.installedPlugins).filter(name => text(name).trim());
    // 只有真的有行可回看时才写数量；总数只取同一份保存方案的分页总数。
    const stories = history.length
      ? Number.isSafeInteger(state.historyTotal) && state.historyTotal >= history.length ? state.historyTotal : history.length
      : used ? 1 : 0;

    // 5.1：有没做完的事时，把那件事拿出来说；否则还是那句问句。
    const finished = state.execution?.phase === 'completed' || state.execution?.phase === 'cancelled';
    const pending = !state.searching && !finished && state.plan
      ? { title: text(state.plan.title) || text(state.intent?.goal), action: typeof controller.showFind === 'function' ? () => controller.showFind() : null }
      : null;
    const meta = used ? `你交代过 ${stories} 件事` : '我是住在 DSH 里的插件专家。说一句就行，剩下的我来。';
    const hero = pending
      ? h('h1', { className: 'pf8_line', id: 'pfv_home_title' },
        h(Lego, { kinds: ['build'], label: '这件事还没做完' }), `${short(text(pending.title).replace(/[。.!！?？]+$/, ''), 60)} 还没做完。`,
        pending.action ? h('button', { type: 'button', className: 'pf8_lk', onClick: pending.action }, '接着做') : null)
      : h('h1', { className: 'pf8_line', id: 'pfv_home_title' }, '想让 DSH 帮你做成什么？');

    // 5.3 你交代过的事：最近 4 条。记录里没有精确任务关联，所以这里只回看，不假装能跳回某一版。
    const historyRows = history.slice(0, 4).map((record, index) => {
      const kind = historyState(record);
      const when = searchTime(record.updatedAt || record.createdAt);
      const label = text(record.title) || text(record.request) || '这件事';
      return h('li', { key: text(record.id) || index },
        h('span', { className: 'pf8_g' }, h(Lego, { kinds: [kind.lego], label: `${kind.say}，${label}` })),
        h('div', { className: 'pf8_row' },
          h('b', null, short(label, 40)),
          h('small', null, when ? `${kind.say}，${when}` : kind.say)));
    });

    // 5.4 精选：作者亲手做、亲手验过的那几条，点进详情。
    const featuredList = items(featured).length ? h('ul', { className: 'pf8_feat' }, ...items(featured).map(entry => h('li', { key: text(entry.id) },
      h('button', {
        type: 'button', className: 'pf8_row', disabled: locked,
        onClick: () => onFeatured?.(text(entry.id)),
        'aria-label': `查看精选：${text(entry.title)}`,
      },
      h(Lego, { kinds: ['have'], label: '现成的插件' }),
      h('span', null,
        h('b', null, text(entry.title)),
        text(entry.subtitle) ? h('small', null, text(entry.subtitle)) : null))))) : null;

    const historyBlock = historyRows.length
      ? h('ul', { className: 'pf8_past' }, ...historyRows)
      : used ? h('p', { className: 'pf8_fine' }, '这次还没有留下可以回看的记录。')
        : h('div', { className: 'pf8_solution' },
          h('p', { className: 'pf8_solution_quote' }, '比如有人说：「每周五把项目进展整理成简报，带上看板任务和一张关系图。」'),
          h('p', { className: 'pf8_solution_line' },
            h(Lego, { kinds: ['have', 'have'], label: '两块现成的' }), '两块现成的拼起来，',
            h(Lego, { kinds: ['build'], label: '再补一块' }), '再补一块。'),
          h('div', { className: 'pf8_solution_parts' },
            h('span', { className: 'pf8_part' }, h('code', null, 'dsh-taskboard'), h('small', null, '管着板任务，已经能定时执行')),
            h('span', { className: 'pf8_part' }, h('code', null, 'dsh-md-studio'), h('small', null, '把简报和关系图渲染出来')),
            h('span', { className: 'pf8_part pf8_new' }, h('code', null, '每周五自动汇总'), h('small', null, '现成的都没有，这一块一起做'))));

    // 图例只列这一页实际出现的样子。
    const legendKinds = new Set();
    if (featuredList) legendKinds.add('have');
    if (!opportunityCard && fallbackIdea) legendKinds.add('build');
    if (installed.length) { legendKinds.add('seen'); legendKinds.add('slot'); }
    for (const record of history.slice(0, 4)) legendKinds.add(historyState(record).lego);
    if (!used) for (const way of HOME_WAYS) for (const block of way.blocks) for (const kind of block.kinds) legendKinds.add(kind);

    // 5.2 猜你需要：有主动发现就画那几张；没有时保留原来那条具体想法（不编新依据）。
    const ideaLabel = fallbackIdea?.suggested ? '猜你喜欢' : '试试这个';
    const ideaCard = !opportunityCard && fallbackIdea ? h('div', { className: 'pfv_home_scenario', 'aria-label': ideaLabel },
      h('article', { className: 'pf8_idea' },
        h(Lego, { kinds: ['build'], label: '还没有，要一起做' }),
        h('h3', null, text(fallbackIdea.title)),
        h('p', { className: 'pf8_idea_benefit' }, text(fallbackIdea.benefit)),
        h('p', { className: 'pf8_fine' }, `${text(fallbackIdea.basis)}${text(fallbackIdea.reason) ? `，${text(fallbackIdea.reason)}` : ''}`),
        h('button', {
          type: 'button', className: 'pf8_btn', disabled: busy || locked || !modelReady,
          onClick: () => controller.startFeatured?.(text(fallbackIdea.id)),
        }, '试试'))) : null;
    const guess = opportunityCard || ideaCard;
    // 只有真的命中本机方案或已授权条目才算「有线索」；组件存在本身不算。
    const clueBased = Boolean(items(state.opportunity?.opportunities).length) || Boolean(fallbackIdea?.suggested);

    return h('div', { className: 'pf_v8' },
      h('div', { className: 'pf8_wrap' },
        h('div', { className: 'pf8_top' },
          h(Lego, { kinds: ['mark'], className: 'pf8_brand', label: '发现好插件' }),
          h('strong', null, '发现好插件'),
          h('nav', null,
            h('button', { type: 'button', className: 'pf8_lk', onClick: () => (controller.showHistory || controller.showFind)?.() }, '我交代过的事'),
            h('button', { type: 'button', className: 'pf8_lk', 'data-pf-return-key': 'home-store-nav', onClick: () => openCommunity({ categoryId: '' }) }, '插件商店'),
            more || null)),

        h('section', { role: 'group', 'aria-labelledby': 'pfv_expert_title', 'aria-describedby': 'pf8_lead' },
          h('div', { className: 'pf8_hero' },
            h('div', null,
              h('p', { className: 'pf8_meta' }, meta),
              hero,
              h('span', { className: 'pf8_sr', id: 'pfv_expert_title' }, '插件专家'),
              h('p', { className: 'pf8_sr', id: 'pf8_lead' }, '说一件你想做成的事，我先去找现成的；没有就陪你做。'),
              resumeView,
              state.homeCommunityEntryId ? h('p', { className: 'pf8_sel', 'aria-label': '已选插件' },
                `已选插件：${text(homeCommunityName) || '当前目录未收录'}`,
                h('button', {
                  type: 'button', className: 'pf8_lk', disabled: busy || locked,
                  onClick: () => { if (!busy && !locked) controller.clearHomeCommunitySelection?.(); },
                }, '取消指定')) : null,
              h('form', { className: 'pf8_ask', onSubmit: event => { event.preventDefault(); submit(); } },
                h('label', { className: 'pf8_sr', htmlFor: 'pfv_home_input' }, '任务描述'),
                h('textarea', {
                  ref: homeInput, id: 'pfv_home_input', 'aria-label': '任务描述', rows: 1,
                  value: request, maxLength: 6000, disabled: busy || locked,
                  placeholder: used ? '下一件想做成的事' : '说一件你想做成的事',
                  onChange: event => controller.setHomeRequest(event.target.value), onKeyDown: shortcut,
                }),
                h('button', {
                  type: 'submit', className: 'pf8_send',
                  disabled: busy || !modelReady || !request.trim(), 'aria-label': '帮我找方案',
                }, h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }, h('path', { d: 'M8 13V3M3.5 7.5 8 3l4.5 4.5' })))),
              used ? h('div', { className: 'pf8_tries' },
                h('span', null, '试试'),
                ...HOME_EXAMPLES.map(say => h('button', {
                  key: say, type: 'button', className: 'pf8_pill', disabled: busy || locked,
                  onClick: () => { pickExample(say); homeInput.current?.focus?.(); },
                }, say))) : null,
              used
                ? h('p', { className: 'pf8_more' }, '也可以逛逛',
                  h('button', { type: 'button', className: 'pf8_lk', 'data-pf-return-key': 'home-store-more', onClick: () => openCommunity({ categoryId: '' }) }, '插件商店'),
                  total ? `，收录了 ${countText(total)} 个。` : '。')
                : renderExamples({
                  h, Lego, disabled: busy || locked,
                  onStore: () => openCommunity({ categoryId: '' }),
                  onPick: value => { pickExample(value); homeInput.current?.focus?.(); },
                }),
              state.homeWarning ? h('p', { className: 'pf8_meta', role: 'status' }, text(state.homeWarning)) : null,
              state.bootstrapLoaded && !modelReady ? h('div', { className: 'pf8_meta' },
                '先在 DSH 设置中配置默认模型，再开始查找。',
                h('button', { type: 'button', className: 'pf8_lk', disabled: busy, onClick: () => controller.bootstrap?.() }, '重新读取配置')) : null),
            renderMine({ h, Lego, installed })),

          renderLegend({ h, Lego, kinds: [...legendKinds] }),
          guess ? h('section', { className: 'pf8_sec', 'aria-label': '猜你需要' },
            h('header', null, h('h2', null, '猜你需要'),
              h('span', null, clueBased ? '按你在这里留下的线索挑的' : '还不认识你，先给一个通用想法')),
            guess) : null,
          opportunitySettings),

        h('div', { className: featuredList ? 'pf8_two' : 'pf8_two pf8_single' },
          h('section', { className: 'pf8_sec', 'aria-labelledby': 'pf8_past_title' },
            h('header', null,
              h('h2', { id: 'pf8_past_title' }, used ? '你交代过的事' : '每件事我都会还你这样一张'),
              historyRows.length
                ? h('button', { type: 'button', className: 'pf8_lk', onClick: () => (controller.showHistory || controller.showFind)?.() }, `全部 ${stories} 件`)
                : used ? null : h('span', { className: 'pf8_tag' }, '示例')),
            historyBlock),
          // 没有可展示的精选时整块消失，连标题和调整入口一起（SPEC 第 8 节）。
          featuredList ? h('section', { className: 'pf8_sec', 'aria-labelledby': 'pf8_feat_title' },
            h('header', null, h('h2', { id: 'pf8_feat_title' }, '精选'), h('span', null, '作者亲手做、亲手验过')),
            featuredList,
            h('p', { className: 'pf8_fine' }, '这是作者按使用场景挑的，不代表官方审核。'),
            featuredSettings ? h('details', { className: 'pf8_disclosure' },
              h('summary', { className: 'pf8_lk' }, text(featuredWarning) ? '调整精选（草稿没读出来）' : '调整精选'),
              h('div', { className: 'pf8_disclosure_body' }, featuredSettings)) : null) : null),

        h('section', { className: 'pf8_sec', id: 'pfv_store' },
          h('header', null,
            h('h2', null, '插件商店'),
            total ? h('span', null, `收录了 ${countText(total)} 个社区插件，按用途分成六类`) : null,
            h('button', { type: 'button', className: 'pf8_lk', 'data-pf-return-key': 'home-store-browse', onClick: () => openCommunity({ categoryId: '' }) }, '浏览全部插件')),
          h('form', {
            className: 'pf8_ask pf8_sm',
            onSubmit: event => {
              event.preventDefault();
              openCommunity({ query: text(event.currentTarget.querySelector('input')?.value).trim() });
            },
          },
          h('label', { className: 'pf8_sr', htmlFor: 'pfv_store_search' }, '搜索插件'),
          h('input', {
            id: 'pfv_store_search', type: 'search', maxLength: 200,
            'data-pf-return-key': 'home-store-search',
            placeholder: '搜插件名、作者或用途', disabled: busy,
          }),
          h('button', { type: 'submit', className: 'pf8_send pf8_ghostbtn', 'data-pf-return-key': 'home-store-search-submit', 'aria-label': '搜索插件', disabled: busy },
            h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' },
              h('circle', { cx: 7, cy: 7, r: 4.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }),
              h('path', { d: 'm10.5 10.5 3 3', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' })))),
          categories.length ? h('div', { className: 'pf8_cats' }, ...categories.map(category => h('section', {
            key: text(category.id) || text(category.label), className: 'pf8_cat', 'aria-label': text(category.label),
          },
          h('button', {
            type: 'button', className: 'pf8_ch', disabled: busy,
            'data-pf-return-key': `home-store-category-${text(category.id) || text(category.label)}`,
            onClick: () => openCommunity({ categoryId: text(category.id) }),
            'aria-label': `查看全部${text(category.label)}插件，共 ${countText(category.count)} 个`,
          },
          h('b', null, text(category.label)), h('i', null, countText(category.count)),
          text(category.description) ? h('small', null, text(category.description)) : null),
          h('ul', null, ...items(category.previews).slice(0, 3).map(entry => h('li', { key: text(entry.id) },
            h('button', {
              type: 'button', disabled: busy,
              onClick: event => controller.showCatalogPlugin?.('community', entry.id, event?.currentTarget),
              'aria-label': `查看 ${displayName(entry.name)} 的详情`,
            },
            h('code', null, displayName(entry.name)),
            h('span', null, text(entry.summary) || '作者尚未提供用途说明。'))))))))
            : h('p', { className: 'pf8_fine' }, '社区目录这次没读到，稍后可以再打开看看。')),

        h('p', { className: 'pf8_foot' },
          snapshotDate ? `社区目录来自 ${snapshotDate} 的快照。` : '社区目录来自社区索引快照。',
          '插件介绍是作者自己写的，装之前我会再核对一遍。')));
  };
}
