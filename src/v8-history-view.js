// 「我交代过的事」整页（SPEC 5.12）。只负责排版，点击仍走原来的 controller。
import { createLego } from './v8-lego.js';
import { historyState } from './v8-home-view.js';

const text = value => (typeof value === 'string' ? value : '');
const items = value => (Array.isArray(value) ? value : []);
const PAGE = 20;

// 状态话术和首页共用同一份 historyState：部分完成、没做成都照原样说。
// 本地时间「11月11日 15:53」，和首页一致；不写 UTC。
const localTime = value => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '时间未记录';
  const at = new Date(time);
  const pad = number => String(number).padStart(2, '0');
  return `${at.getMonth() + 1}月${at.getDate()}日 ${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

export function createHistoryView(React) {
  const h = React.createElement;
  const Lego = createLego(React);
  return function HistoryView({ state, controller, busy = false, drafts = null, extra = null, unlinked = [] }) {
    const rows = items(state.history).filter(item => item && typeof item === 'object');
    const total = Number.isSafeInteger(state.historyTotal) ? state.historyTotal : rows.length;
    const offset = Number.isSafeInteger(state.historyOffset) ? state.historyOffset : 0;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    const page = Math.min(pages, Math.floor(offset / PAGE) + 1);
    const hasNext = offset + rows.length < total;
    return h('div', { className: 'pf_v8 pf8_histpage' },
      h('div', { className: 'pf8_wrap pf8_histwrap' },
        h('header', { className: 'pf8_histhead' },
          h('div', null,
            h('h1', { className: 'pf8_histtitle', tabIndex: -1 }, '你交代过的事'),
            h('p', { className: 'pf8_histlede' }, `本机存着 ${total} 件。回看不会重新查找，也不会调用模型。`)),
          h('button', { type: 'button', className: 'pf8_lk', disabled: busy, onClick: () => controller.showHistory?.(offset) }, '刷新历史')),
        rows.length
          ? h('ul', { className: 'pf8_histlist' }, ...rows.map(item => {
            const status = historyState(item);
            return h('li', { key: item.taskId },
              h('button', {
                type: 'button', className: 'pf8_histrow', disabled: busy,
                'aria-label': `回看「${text(item.title) || '未命名任务'}」`,
                onClick: () => controller.openTask?.(item.taskId, item.latestRevisionId ?? item.revisionId),
              },
              h('span', { className: 'pf8_histlego' }, h(Lego, { kinds: [status.lego], label: status.say })),
              h('span', { className: 'pf8_histbody' },
                h('b', null, text(item.title) || text(item.request).slice(0, 80) || '未命名任务'),
                h('small', null, `${status.say}，${localTime(item.updatedAt)}`))));
          }))
          : h('div', { className: 'pf8_histempty' },
            h('p', null, '还没有交代过事。回首页说一件想做的事，或者从「更多」里导入本机备份。'),
            h('button', { type: 'button', className: 'pf8_btn pf8_ink', disabled: busy, onClick: () => controller.showHome?.() }, '回首页')),
        rows.length && pages > 1 ? h('nav', { className: 'pf8_store_pages', 'aria-label': '历史分页' },
          h('button', { type: 'button', className: 'pf8_store_page', disabled: busy || offset <= 0, onClick: () => controller.showHistory?.(Math.max(0, offset - PAGE)) }, '上一页'),
          h('span', null, `第 ${page} 页，共 ${pages} 页`),
          h('button', { type: 'button', className: 'pf8_store_page', disabled: busy || !hasNext, onClick: () => controller.showHistory?.(offset + PAGE) }, '下一页')) : null,
        drafts,
        items(unlinked).length ? h('details', { className: 'pf8_disclosure pf8_histunlinked' },
          h('summary', { className: 'pf8_lk' }, `旧版未关联反馈，${unlinked.length} 条`),
          h('p', { className: 'pf8_fine' }, '这些记录缺少精确任务关联，未猜配到任何方案。'),
          ...items(unlinked).map((item, index) => h('p', { key: index, className: 'pf8_fine' }, `${localTime(item.createdAt)}，${({ complete: '完成了', partial: '部分完成', blocked: '没能完成' }[item.outcome] || '调整意见')} ${text(item.note)}`))) : null,
        extra));
  };
}
