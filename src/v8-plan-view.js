// v8 解法卡、正在找、没查完、澄清提问（SPEC 5.8–5.10 和第 4 节那两行）。
// 只做排版：数据全部由 experience-view 从现有 state 里取，这里不推断状态、不编数字。
// 屏幕上出现的每个数字都对应一个现有字段；取不到就不显示那一块。

import { createLego } from './v8-lego.js';

const text = value => (typeof value === 'string' ? value : '');
const items = value => (Array.isArray(value) ? value : []);
const records = value => items(value).filter(item => item && typeof item === 'object' && !Array.isArray(item));
const safeCount = value => (Number.isSafeInteger(value) && value >= 0 ? value : 0);
const countText = value => safeCount(value).toLocaleString('en-US');

/** 颜色之外的状态说明。积木只表达一种颜色，旁边必须有这句话。 */
export const BLOCK_STATE = Object.freeze({
  have: '现成的，能直接用',
  build: '还没有，要一起做',
  native: '不用装，DSH 自带',
});

/** 用户这件事的短标题：取第一个短句，不够长就整句。缺口列表为空时用它给那块积木起名。 */
export function planShortTitle(value, limit = 24) {
  const line = text(value).replace(/\s+/g, ' ').trim();
  if (!line) return '';
  const head = line.split(/[，。；！？,;!?]/).find(part => part.trim()) || line;
  const clean = head.replace(/[。.!！?？]+$/, '').trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

/** 同一来源只出现一次：sources 优先，sourceCoverage 只补缺失字段（两份来自同一次查找）。 */
export function mergedSources(discovery) {
  const key = source => text(source.id) || text(source.sourceId) || text(source.title);
  const merged = new Map();
  for (const source of records(discovery?.sources)) {
    const id = key(source);
    if (id) merged.set(id, { ...source });
  }
  for (const source of records(discovery?.sourceCoverage)) {
    const id = key(source);
    if (!id) continue;
    const previous = merged.get(id);
    if (!previous) { merged.set(id, { ...source }); continue; }
    const fill = Object.fromEntries(Object.entries(source).filter(([name]) => previous[name] === undefined));
    merged.set(id, { ...previous, ...fill });
  }
  return [...merged.values()];
}

/** 社区目录那一份来源：只有它给的总数才当「翻了多少」。 */
const isCommunityIndex = source => /awesome|社区目录|community/i.test(`${text(source?.id)} ${text(source?.title)}`);

/** 社区目录的两份索引：署名行只认这两份是否真的读到，平台市场、GitHub 检索都不算。 */
const COMMUNITY_INDEX_IDS = new Set(['awesome', 'awesome-full']);
const sourceKey = source => text(source?.id) || text(source?.sourceId);

/** 本地日期；拿不到有效时间就返回空串，不猜。 */
const localDay = value => {
  const milliseconds = Date.parse(text(value));
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toDateString() : '';
};

/** 「翻了社区目录里的 N 个」：只取已验证的社区索引里最大的那份，不把几处目录相加当插件数。 */
export function sourceReadTotal(discovery) {
  const totals = mergedSources(discovery)
    .filter(source => isCommunityIndex(source))
    .filter(source => ['live', 'cached'].includes(text(source.status)) || (!text(source.status) && Number.isSafeInteger(source.total)))
    .map(source => safeCount(source.total))
    .filter(total => total > 0);
  return totals.length ? Math.max(...totals) : 0;
}

const dateText = value => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return '';
  const date = new Date(milliseconds);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};

/**
 * 这一轮到底把社区目录读成了什么。只看社区索引来源自己的状态和读取时间（fetchedAt / catalogUpdatedAt），
 * 不从 searchedAt 反推：别人读到的平台市场或 GitHub 检索不能替社区目录背书。
 * fresh=真的读到当天目录；snapshot=只拿到旧快照；missing=这一轮没读到；unknown=没留下读取记录。
 */
export function communityReadState(discovery, searchedAt) {
  const community = mergedSources(discovery).filter(source => COMMUNITY_INDEX_IDS.has(sourceKey(source)));
  if (!community.length) return 'unknown';
  const today = new Date().toDateString();
  const searched = localDay(searchedAt);
  let fresh = 0, stale = 0, unclear = 0;
  for (const source of community) {
    const status = text(source.status);
    // 缓存和过期回退都是更早读到的那一份，只能当快照。
    if (status === 'cached' || status === 'stale') { stale += 1; continue; }
    // 这一轮明确没读到；它不提供任何旧数据，也不影响别的来源算不算当天。
    if (status === 'failed') continue;
    const fetched = localDay(source.fetchedAt);
    const catalog = localDay(source.catalogUpdatedAt);
    if (status !== 'live' || !fetched) { unclear += 1; continue; }
    const current = fetched === today && (!searched || fetched === searched) && (!catalog || catalog === fetched);
    if (current) fresh += 1; else stale += 1;
  }
  if (stale) return 'snapshot';
  if (fresh) return 'fresh';
  return unclear ? 'unknown' : 'missing';
}

/** 署名行：只有这一轮真读到当天的社区目录才说「当天」；旧数据只写快照；没读到就不提读过社区。 */
export function signatureText(searchedAt, discovery) {
  const head = dateText(searchedAt) ? `发现好插件整理于 ${dateText(searchedAt)}` : '发现好插件整理的';
  const state = communityReadState(discovery, searchedAt);
  if (state === 'fresh') return `${head}，翻的是当天的社区目录`;
  if (state === 'snapshot') return `${head}，翻的是社区目录快照`;
  if (state === 'missing') return `${head}，这次没读到社区目录`;
  return `${head}，这次没留下社区目录的读取记录`;
}

/** 一块积木一句话：方案里的每个插件、每个缺口各一块（SPEC 5.8 第 4 条）。 */
export function planBlocks({ plan, candidates, request }) {
  const selected = new Set(items(plan?.pluginIds));
  const steps = records(plan?.steps);
  const blocks = [];
  if (plan?.kind === 'native') {
    blocks.push({ kind: 'native', name: 'DSH 自带的能力', note: '' });
    return blocks;
  }
  for (const candidate of records(candidates).filter(item => selected.has(item.id))) {
    // 「它在这里干什么」只取这条插件在这个方案里负责的能力，取不到就留空。
    const capability = steps.filter(step => text(step.owner) === candidate.id).map(step => text(step.capability)).filter(Boolean);
    blocks.push({
      kind: 'have',
      name: text(candidate.name) || text(candidate.id),
      note: capability.length ? capability.join('、') : text(candidate.capability),
      version: text(candidate.install?.version) || text(candidate.version),
    });
  }
  if (plan?.kind === 'hybrid') {
    for (const gap of records(plan.gaps)) {
      blocks.push({ kind: 'build', name: text(gap.capability), note: text(gap.reason) });
    }
  }
  // gap 的缺口列表在契约里是空的：这时只画一块，用这件事的短标题起名。
  if (!blocks.length && plan?.kind === 'gap') {
    blocks.push({ kind: 'build', name: planShortTitle(request) || '这一块要一起做', note: '' });
  }
  return blocks;
}

/** 每个来源一行：读到了用蓝色，没读到用灰色虚线（SPEC 5.10）。 */
export function planSourceRows(discovery) {
  return mergedSources(discovery).map(source => {
    const status = text(source.status);
    const read = ['live', 'cached'].includes(status) || (!status && Number.isSafeInteger(source.total));
    const title = text(source.title) || text(source.id) || '未命名来源';
    return {
      kind: read ? 'have' : 'slot',
      title,
      say: read
        ? `读到 ${countText(source.total)} 条，采用 ${countText(source.used)} 条。`
        : status === 'cached' ? '这次用的是缓存，读取时间见「依据和来源」。' : '这次没读到。',
    };
  });
}

/**
 * 「补齐并使用」下面那句：现成的块数按 plan.pluginIds 真实条数写。
 * 要补的那部分可能不止一块，所以不写它的块数。
 */
export function hybridInstallCopy(count) {
  const n = Number.isSafeInteger(count) && count > 0 ? count : 0;
  if (n === 1) return '先装好现成的那一块，再在发现好插件里补缺的。';
  if (n >= 2) return `先装好现成的 ${n} 块，再在发现好插件里补缺的。`;
  return '先装好现成的，再在发现好插件里补缺的。';
}

export function createPlanSurface(React) {
  const h = React.createElement;
  const Lego = createLego(React);

  const brick = (kind, label) => h(Lego, { kinds: [kind], label: label || BLOCK_STATE[kind] || '' });

  const actionButton = action => h('button', {
    key: action.label, type: 'button',
    className: action.primary ? 'pf8_btn pf8_ink pf8_big pfv_primary' : 'pf8_btn pf8_big',
    disabled: Boolean(action.disabled),
    onClick: action.onClick,
  }, action.label);

  /** 5.8 解法卡：一张卡能单独截图讲清楚。 */
  const solution = ({
    request, understanding, quoteLabel = '你说：', plan, candidates, actions = [], discovery,
    searchedAt, note = '', tag = '', showSignature = true, compact = false,
  }) => {
    const blocks = planBlocks({ plan, candidates, request });
    const count = sourceReadTotal(discovery);
    const read = records(candidates).length;
    const selected = new Set(items(plan?.pluginIds));
    const rejected = records(candidates).filter(candidate => !selected.has(candidate.id) && text(candidate.summary));
    const numberLine = count && read
      ? `从社区目录的 ${countText(count)} 个里筛出 ${countText(read)} 个候选。`
      : count ? `为这件事翻了社区目录里的 ${countText(count)} 个。`
        : read ? `筛出 ${countText(read)} 个候选。` : '';
    const types = {
      native: ['不用装，DSH 自己就会', []],
      single: ['一块现成的就够', ['have']],
      combo: ['几块现成的拼起来', blocks.map(() => 'have')],
      hybrid: ['现成的拼起来，再补一块', [...blocks.map(block => block.kind)]],
      gap: ['没有现成的，我陪你做', ['build']],
    }[plan?.kind] || ['', []];

    return h('article', { className: `pf8_card${compact ? ' pf8_card_mini' : ''}`, 'aria-label': '解法卡', id: 'pf8_card' },
      text(request) ? h('p', { className: 'pf8_q' }, quoteLabel, h('b', null, `「${text(request)}」`)) : null,
      text(understanding) && understanding !== request
        ? h('p', { className: 'pf8_q pf8_under' }, '我的理解：', h('b', null, text(understanding)))
        : null,
      h('h1', { className: 'pf8_verdict' },
        types[1].length ? h(Lego, { kinds: types[1], label: types[0] }) : null,
        text(plan?.title) || types[0] || '这份方案'),
      text(plan?.rationale) ? h('p', { className: 'pf8_why' }, text(plan.rationale)) : null,
      blocks.length ? h('div', { className: 'pf8_fit' }, ...blocks.map((block, index) => h('div', {
        key: `${block.kind}-${index}`, className: `pf8_blk ${block.kind}`,
      },
      h('code', null, block.kind === 'native' ? null : brick(block.kind), text(block.name)),
      block.note ? h('span', null, text(block.note)) : null,
      block.version ? h('span', { className: 'pf8_blk_ver' }, `现在是 ${block.version} 版`) : null,
      h('em', null, BLOCK_STATE[block.kind] || '')))) : null,
      numberLine ? h('p', { className: 'pf8_count' }, numberLine) : null,
      rejected.length ? h(React.Fragment, null,
        h('p', { className: 'pf8_sub' }, '也看过这几个'),
        h('ul', { className: 'pf8_rej' }, ...rejected.map((candidate, index) => h('li', { key: text(candidate.id) || index },
          brick('seen'),
          h('code', null, text(candidate.name) || text(candidate.id)),
          h('span', null, text(candidate.summary)))))) : null,
      actions.length ? h('div', { className: 'pf8_acts' }, ...actions.filter(action => action && text(action.label)).map(actionButton)) : null,
      text(note) ? h('p', { className: 'pf8_next' }, text(note)) : null,
      tag ? h('p', { className: 'pf8_fine' }, h('span', { className: 'pf8_tag' }, tag)) : null,
      showSignature ? h('div', { className: 'pf8_sign' },
        brick('mark', '发现好插件'),
        h('span', null, signatureText(searchedAt, discovery))) : null);
  };

  /** 5.9 正在找：不编进度，只把真实的查找说明和已经发生的事写出来。 */
  const searching = ({ request, progress, waited = 0, events = [], actions = [] }) => h('article', { className: 'pf8_card pf8_find', role: 'status', 'aria-live': 'polite' },
    text(request) ? h('p', { className: 'pf8_q' }, '你说：', h('b', null, `「${text(request)}」`)) : null,
    h('h1', { className: 'pf8_verdict' }, '正在替你找。'),
    h('p', { className: 'pf8_why' }, '找完会留在这里，不用守着。'),
    h('ul', { className: 'pf8_log' },
      h('li', { className: 'pf8_cur' },
        h(React.Fragment, null, h('i', { className: 'pf8_dot', 'aria-hidden': 'true' }), h('span', null, text(progress) || '正在查找可行路径',
          waited >= 30 ? `，已等待 ${waited} 秒，比平时久；可以继续等，或点下面的「停止」。` : waited >= 3 ? `，已用时 ${waited} 秒。` : ''))),
      ...items(events).slice(-4).map((event, index) => h('li', { key: `${text(event.seq) || index}` },
        h(React.Fragment, null, h('i', { className: 'pf8_dot pf8_dot_done', 'aria-hidden': 'true' }), h('span', null, text(event.text)))))),
    h('p', { className: 'pf8_next' }, '方案正在形成，通常十几秒。'),
    actions.length ? h('div', { className: 'pf8_acts' }, ...actions.filter(action => action && text(action.label)).map(actionButton)) : null);

  /** 5.10 没查完：说清读到什么、没读到什么、为什么不给结论。 */
  const incomplete = ({ request, health, discovery, actions = [], tentative = null }) => {
    const rows = planSourceRows(discovery);
    return h('article', { className: 'pf8_card pf8_warn', role: 'status', 'aria-label': '这次没查完' },
      text(request) ? h('p', { className: 'pf8_q' }, '你说：', h('b', null, `「${text(request)}」`)) : null,
      h('h1', { className: 'pf8_verdict' }, '这次没查完，先不给你结论。'),
      h('p', { className: 'pf8_why' }, text(health?.message) || '部分来源没有读回来，只凭已经读到的内容下结论，容易让你装错。'),
      h('p', { className: 'pf8_fine' }, h('span', { className: 'pf8_tag' }, '还有来源没核对')),
      rows.length
        ? h('ul', { className: 'pf8_src' }, ...rows.map((row, index) => h('li', { key: `${row.title}-${index}`, className: row.kind === 'have' ? 'pf8_near' : '' },
          h(Lego, { kinds: [row.kind], label: row.kind === 'have' ? '读到了' : '没读到' }),
          h('code', null, row.title), h('span', null, row.say))))
        : h('p', { className: 'pf8_fine' }, '这次没有留下可展示的来源记录。'),
      actions.length ? h('div', { className: 'pf8_acts' }, ...actions.filter(action => action && text(action.label)).map(actionButton)) : null,
      h('p', { className: 'pf8_next' }, '再查一次通常就好。你说的话和已经读到的内容都留着，不用重新输入。'),
      tentative ? h('details', { className: 'pf8_disclosure' },
        h('summary', { className: 'pf8_lk' }, '先看读到的'),
        h('div', { className: 'pf8_disclosure_body' },
          h('p', { className: 'pf8_fine' }, '下面是当时模型给出的判断，来源没读全，还不能当结论。'),
          tentative)) : null);
  };

  /** 澄清提问：问题用宋体结论的样式，选项用胶囊按钮（SPEC 第 4 节那一行）。 */
  const clarification = ({ question, options = [], current, disabled = false, onPick }) => h('section', { className: 'pf8_card pf8_clarify', 'aria-labelledby': 'pfv_question_title' },
    h('h3', { id: 'pfv_question_title', className: 'pf8_verdict_sm' }, text(question.question)),
    text(question.reason) ? h('p', { className: 'pf8_why' }, text(question.reason)) : null,
    h('div', { className: 'pf8_pills' }, ...items(options).filter(option => text(option)).map(option => h('button', {
      key: option, type: 'button', className: 'pf8_pill', disabled,
      'aria-pressed': current === option, onClick: () => onPick?.(option),
    }, option))),
    h('p', { className: 'pf8_fine' }, '也可以在下面补充你的想法。'));

  return { solution, searching, incomplete, clarification, planBlocks, planSourceRows };
}
