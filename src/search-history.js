// 每次检索的留痕：只压成一条小记录，供首页回看，不保存候选正文或作者资料。
// 记录构造与合并是纯函数，存储适配器由 index.js 提供。
import { createHash } from 'node:crypto';

export const SEARCH_RECORD_VERSION = 1;
export const SEARCH_HISTORY_LIMIT = 20;
const PLAN_KINDS = new Set(['native', 'single', 'combo', 'gap', 'hybrid']);
const records = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
const shortText = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

function isoTime(value) {
  const milliseconds = typeof value === 'string' ? Date.parse(value) : value instanceof Date ? value.getTime() : NaN;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : new Date(0).toISOString();
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Build one bounded record. `sources[].used` counts this source's candidates
 * that entered the final plan; a candidate shared by two sources counts for both.
 */
export function buildSearchRecord({ request, searchedAt, sources, plan, candidates } = {}) {
  const searched = isoTime(searchedAt);
  const planKind = PLAN_KINDS.has(plan?.kind) ? plan.kind : 'native';
  const planTitle = shortText(plan?.title, 500);
  const selected = new Set((Array.isArray(plan?.pluginIds) ? plan.pluginIds : []).filter(id => typeof id === 'string'));
  const usedBySource = new Map();
  for (const candidate of records(candidates)) {
    if (typeof candidate.id !== 'string' || !selected.has(candidate.id)) continue;
    // A merged candidate can name several origins; each origin contributed it.
    const seen = new Set();
    for (const origin of records(candidate.sourceTags)) {
      if (typeof origin.id !== 'string' || !origin.id || seen.has(origin.id)) continue;
      seen.add(origin.id);
      usedBySource.set(origin.id, (usedBySource.get(origin.id) ?? 0) + 1);
    }
  }
  const rows = records(sources).filter(source => typeof source.id === 'string' && source.id).slice(0, 16).map(source => ({
    id: source.id.slice(0, 200),
    title: shortText(source.title, 300),
    status: shortText(source.status, 40) || 'unknown',
    total: count(source.total),
    used: usedBySource.get(source.id) ?? 0,
  }));
  const usedCandidates = records(candidates).filter(candidate => typeof candidate.id === 'string' && selected.has(candidate.id)).length;
  const totals = {
    // A failed source has nothing readable; its zero total must not inflate this.
    read: rows.filter(source => source.status !== 'failed').reduce((sum, source) => sum + source.total, 0),
    used: usedCandidates,
    failed: rows.filter(source => source.status === 'failed').length,
  };
  const hashed = [searched, shortText(request, 6000), planKind, planTitle].join('\0');
  return {
    id: `search-${digest(hashed).slice(0, 24)}`,
    request: shortText(request, 6000),
    searchedAt: searched,
    sources: rows,
    totals,
    planKind,
    planTitle,
    recordVersion: SEARCH_RECORD_VERSION,
  };
}

/** De-duplicate by id, keep the newest copy, order by search time, then truncate. */
export function mergeRecent(list, record, limit = SEARCH_HISTORY_LIMIT) {
  const bounded = Number.isInteger(limit) && limit > 0 ? limit : SEARCH_HISTORY_LIMIT;
  const rows = new Map();
  for (const item of [...records(list), ...(record && typeof record === 'object' ? [record] : [])]) {
    if (typeof item.id === 'string' && item.id) rows.set(item.id, item);
  }
  return [...rows.values()]
    .sort((left, right) => (Date.parse(right.searchedAt) || 0) - (Date.parse(left.searchedAt) || 0))
    .slice(0, bounded);
}
