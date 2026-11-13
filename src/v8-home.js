// v8 首页。数据全部来自现有 state，没有的一律不显示（SPEC 第 5 节「没有时」）。
// 这里只负责排版；点击行为仍走原来的 controller。

const text = value => (typeof value === 'string' ? value : '');
const items = value => (Array.isArray(value) ? value : []);

// 例句只示范「可以这样说」，不和任何结果配对：同一句话真跑两次结果也会变（SPEC 5.1）。
export const HOME_EXAMPLES = Object.freeze([
  '把邮箱里的发票收齐，汇成 Excel',
  '每周五出一份项目简报',
  '给家里人做个记账工具',
]);

// 说完之后会给的三种办法：只说形状，不点名任何插件，也不挂在某一句例句下面（SPEC 5.1）。
export const HOME_WAYS = Object.freeze([
  { res: '有现成的，替你装好', blocks: [{ kinds: ['have'], label: '一个现成的插件' }] },
  {
    res: '一块不够，替你拼起来',
    blocks: [{ kinds: ['have', 'have'], label: '几个现成的插件' }, { kinds: ['build'], label: '缺的那块，一起做' }],
  },
  { res: '都没有，陪你做出来', blocks: [{ kinds: ['build'], label: '一个新插件，一起做' }] },
]);

// 图例只列这一页实际出现的样子；顺序固定，看起来才像同一套记号。
export const HOME_LEGEND = Object.freeze([
  { kind: 'have', text: '现成的，能直接用' },
  { kind: 'build', text: '还没有，要一起做' },
  { kind: 'done', text: '已经做成了' },
  { kind: 'seen', text: '装着的，或看过没选的' },
  { kind: 'ghost', text: '不用装，或还没轮到' },
  { kind: 'slot', text: '空着的位置，或没读到' },
]);

/** 首页、商店页共用的输入条。回车提交。 */
export function askInput({ h, id, value, placeholder, onChange, onSubmit, disabled, small, submitLabel, ghost }) {
  const arrow = h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' },
    h('path', { d: 'M8 13V3M3.5 7.5 8 3l4.5 4.5' }));
  return h('form', {
    className: `pf8_ask${small ? ' pf8_sm' : ''}`,
    onSubmit: event => { event.preventDefault(); onSubmit?.(); },
  },
  h('label', { className: 'pf8_sr', htmlFor: id }, placeholder),
  h('input', { id, value, placeholder, disabled, onChange: event => onChange?.(event.target.value) }),
  h('button', {
    type: 'submit', className: `pf8_send${ghost ? ' pf8_ghostbtn' : ''}`, disabled: disabled || !text(value).trim(),
    'aria-label': submitLabel || '发送',
  }, ghost ? h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' }, h('circle', { cx: 7, cy: 7, r: 4.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }), h('path', { d: 'm10.5 10.5 3 3', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' })) : arrow));
}

/** 一块积木 + 名字的一行。 */
export function legoLabel({ h, Lego, kind, label, mono = true }) {
  return h('span', null, h(Lego, { kinds: [kind], className: 'pf8_inline' }), h(mono ? 'code' : 'span', null, label));
}

export function renderLegend({ h, Lego, kinds }) {
  const visible = new Set(items(kinds));
  const rows = HOME_LEGEND.filter(item => visible.has(item.kind));
  if (!rows.length) return null;
  return h('div', { className: 'pf8_key', 'aria-label': '积木颜色的意思' },
    ...rows.map(item => h('span', { key: item.kind }, h(Lego, { kinds: [item.kind], label: item.text }), item.text)));
}

// 例句是可点的胶囊：点了只把这句话填进输入框，不承诺会得到哪种方案。
// 下面的三栏是 Finder 会给的三种办法，纯说明、不进 Tab 顺序。
export function renderExamples({ h, Lego, onPick, onStore, disabled }) {
  const ways = HOME_WAYS.map(way => h('div', { key: way.res, className: 'pf8_way' },
    h('span', { className: 'pf8_wayres' }, way.res),
    h('span', { className: 'pf8_waygot' }, ...way.blocks.map((block, position) => h('span', {
      key: position,
      className: 'pf8_wayrow',
    }, h(Lego, { kinds: block.kinds, className: 'pf8_waylego' }), h('span', { className: 'pf8_waylabel' }, block.label))))));
  return h('div', { className: 'pf8_examples' },
    h('p', { className: 'pf8_eglead' }, '不知道说什么？点一句试试，或者',
      h('button', { type: 'button', className: 'pf8_lk', 'data-pf-return-key': 'home-store-examples', disabled, onClick: () => onStore?.() }, '逛逛插件商店')),
    h('div', { className: 'pf8_says' },
      ...HOME_EXAMPLES.map(say => h('button', {
        key: say, type: 'button', className: 'pf8_pill', disabled,
        onClick: () => onPick?.(say),
        'aria-label': `把「${say}」填进输入框`,
      }, say))),
    h('p', { className: 'pf8_waylead' }, '说完之后，我会这样办'),
    h('div', { className: 'pf8_ways' }, ...ways));
}

/** 右边：你的 DSH 现在装着几个插件。拿不到清单就整块不显示（SPEC 5.1）。 */
export function renderMine({ h, Lego, installed }) {
  const list = items(installed).filter(name => text(name).trim());
  if (!list.length) return null;
  return h('div', { className: 'pf8_mine', 'aria-label': '你的 DSH 现在装着的插件' },
    h('div', { className: 'pf8_rows' },
      ...list.map((name, index) => h(Lego, { key: `${name}-${index}`, kinds: ['seen'], label: `${name}，装着` })),
      h(Lego, { kinds: ['slot'], label: '空着的位置' })),
    h('p', null, '你的 DSH 现在装着 ', h('b', null, String(list.length)), ' 个插件，一块是一个。'),
    h('p', null, '空着的那一格，留给你下一件想做的事。'));
}
