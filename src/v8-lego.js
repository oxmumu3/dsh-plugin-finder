// 积木图形：一块代表一个插件。形状与颜色含义见 SPEC 第 3 节。
// 一个颜色只有一个意思：蓝=现成的、橙=要一起做、绿=做成了、灰实心=装着的/看过没选、
// 灰虚线=空着的位置、墨色=只用在标志和署名。颜色之外必须有文字说明状态。

export const BRICK_PATH = 'M3 7H3.4V5.3a1.1 1.1 0 0 1 1.1-1.1h3a1.1 1.1 0 0 1 1.1 1.1V7h2.8V5.3a1.1 1.1 0 0 1 1.1-1.1h3a1.1 1.1 0 0 1 1.1 1.1V7H17a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z';

/** 每种状态的中文说明。颜色之外必须有文字，屏幕阅读器读这里。 */
export const LEGO_LABELS = Object.freeze({
  have: '现成的，能直接用',
  build: '还没有，要一起做',
  done: '已经做成了',
  seen: '装着的，或看过没选的',
  ghost: '不用装，或还没轮到',
  slot: '空着的位置，或没读到',
  mark: '发现好插件',
});

const STEP = 21.6; // 并排时每块横向错开，SPEC 第 3 节
const KINDS = new Set(Object.keys(LEGO_LABELS));

export function normaliseKinds(input) {
  const list = Array.isArray(input) ? input : [input];
  const kinds = list.filter(kind => KINDS.has(kind));
  return kinds.length ? kinds : ['have'];
}

export function legoGeometry(count = 1) {
  const width = (count - 1) * STEP + 20;
  return { step: STEP, width, viewBox: `-3 0.6 ${width + 6} 22.6` };
}

export function createLego(React) {
  const h = React.createElement;
  return function Lego({ kinds = ['have'], className = '', label }) {
    const list = normaliseKinds(kinds);
    const { step, viewBox } = legoGeometry(list.length);
    const text = label || [...new Set(list.map(kind => LEGO_LABELS[kind]))].join('，');
    return h('svg', { className: `pf8_pc ${className}`.trim(), viewBox, role: 'img', 'aria-label': text },
      ...list.map((kind, index) => h('path', { key: index, className: kind, transform: `translate(${index * step})`, d: BRICK_PATH })));
  };
}
