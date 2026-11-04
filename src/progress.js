// 搜索进度事件流：只记录宿主真实发生的事，不预测、不伪造。
// 以「代数(generation)」隔离并发请求：只有当前代的记录会被采纳，
// 旧请求的迟到事件、取消或失败后的收尾都不会污染新一代。
const LIMIT = 40;

let current = null;
let lastId = 0;

const TERMINALS = {
  done: { kind: 'done', text: '已完成' },
  stopped: { kind: 'stopped', text: '已停止' },
  failed: { kind: 'failed', text: '这一步失败了' },
};

function push(entry) {
  try {
    current.events.push({ ...entry, at: Date.now(), seq: ++current.seq });
    if (current.events.length > LIMIT) current.events.shift();
  } catch {}
}

/** 开启一代进度，返回代数；上一代若仍在运行，直接作废。 */
export function beginProgress(label) {
  lastId += 1;
  current = {
    id: lastId,
    label: String(label || '正在准备'),
    events: [],
    seq: 0,
    running: true,
    outcome: null,
    startedAt: Date.now(),
  };
  push({ kind: 'phase', text: current.label });
  return current.id;
}

/** 记录一条真实事件；id 缺省表示「当前代」。 */
export function recordProgress(entry, id) {
  if (!current) return;
  if (id !== undefined && id !== null && id !== current.id) return;
  if (!current.running) return;
  push({ kind: entry?.kind || 'step', text: String(entry?.text || '') });
}

/** 收尾：只有当前代、且尚未收尾时才写终态，避免取消后又被写成「已完成」。 */
export function endProgress(id, outcome = 'done') {
  if (!current || id !== current.id || !current.running) return;
  current.running = false;
  current.outcome = TERMINALS[outcome] ? outcome : 'done';
  push(TERMINALS[current.outcome]);
}

export function currentProgressId() {
  return current ? current.id : 0;
}

export function progressSnapshot() {
  if (!current) return { id: 0, running: false, outcome: null, startedAt: 0, events: [] };
  return {
    id: current.id,
    running: current.running,
    outcome: current.outcome,
    startedAt: current.startedAt,
    events: current.events.map(({ kind, text, at, seq }) => ({ kind, text, at, seq })),
  };
}

/** 仅用于测试与插件关闭时清场。 */
export function resetProgress() {
  current = null;
  lastId = 0;
}
