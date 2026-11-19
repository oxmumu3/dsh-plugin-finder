// 省 Token 估算基准与本机去重账本聚合（纯模块：Host 与 Client 共用，零额外持久化域、零网络请求）。
// 数值来源：本机真实 DSH 插件开发/调优会话用量保守分位（普通插件 ~90 万、多模块工作台 ~180 万、带避坑经验自建 ~45 万）。

const text = value => (typeof value === 'string' ? value.trim() : '');
const list = value => (Array.isArray(value) ? value : []);
const obj = value => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null);
const safeInt = value => (Number.isSafeInteger(value) && value >= 0 ? value : 0);

export const TOKEN_BENCHMARKS = Object.freeze({
  REUSE_STANDARD: 900_000,
  REUSE_WORKBENCH: 1_800_000,
  COMBO_EXTRA: 600_000,
  COMBO_CAP: 3_000_000,
  HYBRID_REUSE_STANDARD: 650_000,
  HYBRID_REUSE_WORKBENCH: 1_150_000,
  HYBRID_REUSE_EXTRA: 300_000,
  HYBRID_REUSE_CAP: 1_850_000,
  HYBRID_GAP: 450_000,
  HYBRID_CAP: 2_300_000,
  GUIDED_CREATE: 450_000,
});

const WORKBENCH_SLUGS = Object.freeze([
  'dsh-project-companion',
  'dsh-family-assistant',
  'dsh-agent-twin',
  'dot-dsh-management',
  'dot-dsh-connector',
  'dsh-superagent',
  'dsh-dot',
  'agent-twin',
  'family-assistant',
  'dot-harness',
]);

export function formatWanTokens(tokens) {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0';
  const wan = Math.max(1, Math.round(tokens / 10_000));
  return `${wan.toLocaleString('en-US')} 万`;
}

function normalizeStringIdentity(rawValue) {
  let value = text(rawValue);
  if (!value) return '';
  if (value.startsWith('npm:')) value = value.slice(4).trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const parts = url.pathname.split('/').filter(Boolean);
      if (url.hostname.toLowerCase() === 'github.com' && parts.length >= 2) {
        return `github:${parts[0].toLowerCase()}/${parts[1].replace(/\.git$/i, '').toLowerCase()}`;
      }
      return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
    } catch {
      return value.toLowerCase();
    }
  }
  const hashIndex = value.lastIndexOf('#');
  if (hashIndex >= 0 && !value.startsWith('@')) {
    value = value.slice(hashIndex + 1).trim();
  }
  if (value.startsWith('@')) {
    const slash = value.indexOf('/');
    const secondAt = slash > 0 ? value.indexOf('@', slash + 1) : -1;
    if (secondAt > 0) value = value.slice(0, secondAt);
    return value.toLowerCase();
  }
  const versionAt = value.indexOf('@');
  if (versionAt > 0) value = value.slice(0, versionAt);
  return value.toLowerCase();
}

export function canonicalPluginKey(input) {
  if (typeof input === 'string') return normalizeStringIdentity(input);
  const rec = obj(input);
  if (!rec) return '';
  const candidates = [
    rec.packageName,
    rec.npmName,
    rec.install?.packageName,
    rec.install?.spec,
    rec.spec,
    rec.name,
    rec.sourceUrl,
    rec.repositoryUrl,
    rec.entryId,
    rec.id,
    rec.candidateId,
  ];
  for (const field of candidates) {
    const key = normalizeStringIdentity(field);
    if (key) return key;
  }
  return '';
}

export function isWorkbenchPlugin(info) {
  const rec = typeof info === 'string' ? { name: info } : obj(info);
  if (!rec) return false;
  if (Array.isArray(rec.capabilities) && rec.capabilities.length >= 5) return true;
  const probeText = [
    canonicalPluginKey(rec),
    text(rec.id),
    text(rec.entryId),
    text(rec.name),
    text(rec.packageName),
    text(rec.npmName),
  ].join(' ').toLowerCase();
  return WORKBENCH_SLUGS.some(slug => probeText.includes(slug));
}

function resolveSelectedCandidates(plan, candidates) {
  const ids = list(plan?.pluginIds).filter(id => typeof id === 'string' && id);
  const byId = new Map(list(candidates).filter(c => obj(c) && typeof c.id === 'string').map(c => [c.id, c]));
  return ids.map(id => byId.get(id) ?? { id, name: id });
}

function singleReuseTokens(info) {
  return isWorkbenchPlugin(info) ? TOKEN_BENCHMARKS.REUSE_WORKBENCH : TOKEN_BENCHMARKS.REUSE_STANDARD;
}

export function estimatePlanSavings({ plan, candidates = [], creation = null, mode = 'plan' } = {}) {
  if (mode === 'create') {
    if (!obj(creation)) return null;
    if (plan?.kind === 'hybrid') {
      const selected = resolveSelectedCandidates(plan, candidates);
      const count = Math.max(1, selected.length);
      const anyWorkbench = selected.some(isWorkbenchPlugin);
      const reuseBase = anyWorkbench ? TOKEN_BENCHMARKS.HYBRID_REUSE_WORKBENCH : TOKEN_BENCHMARKS.HYBRID_REUSE_STANDARD;
      const reusePart = Math.min(TOKEN_BENCHMARKS.HYBRID_REUSE_CAP, reuseBase + (count - 1) * TOKEN_BENCHMARKS.HYBRID_REUSE_EXTRA);
      const tokens = Math.min(TOKEN_BENCHMARKS.HYBRID_CAP, reusePart + TOKEN_BENCHMARKS.HYBRID_GAP);
      const wanText = formatWanTokens(tokens);
      const reuseWan = formatWanTokens(reusePart);
      return {
        kind: 'create',
        tokens,
        wanText,
        headline: `带着全网踩坑经验补齐缺口 · 预计省约 ${wanText} Token`,
        badge: '5 步避坑向导已就绪',
        desc: `保留 ${count} 块现成主流程，只在最后一块注入「先查后建 + 3 句定设计 + 空架子先点开 + ⌘R/⌘Q 分流 + 三轮止损」经验包。`,
        mathTitle: '带经验补缺口具体帮你省在哪里？',
        mathItems: [
          `直接复用 ${count} 块现成能力扛住主流程：保守折算免去约 ${reuseWan} Token 重复实现；`,
          '缺失模块开造时自动带上 5 步避坑经验与样式/契约约束，预计少走 3–5 轮大上下文返工（再省约 45 万 Token）。',
        ],
        confirmFact: `约 ${wanText} Token（少走 3–5 轮返工）`,
      };
    }
    const tokens = TOKEN_BENCHMARKS.GUIDED_CREATE;
    const wanText = formatWanTokens(tokens);
    return {
      kind: 'create',
      tokens,
      wanText,
      headline: `带着全网踩坑经验一键开造 · 预计少烧约 ${wanText} Token`,
      badge: '5 步避坑向导已就绪',
      desc: '自动带上「先查后建 + 3 句定设计 + 空架子先点开 + ⌘R/⌘Q 分流 + 三轮止损」经验包，预计少走 3–5 轮重开发与布局返工。',
      mathTitle: '带经验自建具体帮你挡掉了哪几坑？',
      mathItems: [
        '不带蓝图直接从零写插件，常因边界发散、宿主变量撞车或误重开宿主多绕 3–5 轮大上下文修改（按每轮保守多耗约 10万–15万 Token 折算）；',
        '确认开始创建并实际开工后，自动计入本机省 Token 账本（按 45 万/次保守计入）。',
      ],
      confirmFact: `约 ${wanText} Token（少走 3–5 轮返工）`,
    };
  }

  if (!obj(plan) || plan.kind === 'native') return null;

  if (plan.kind === 'single') {
    const selected = resolveSelectedCandidates(plan, candidates)[0] ?? null;
    const workbench = isWorkbenchPlugin(selected);
    const tokens = workbench ? TOKEN_BENCHMARKS.REUSE_WORKBENCH : TOKEN_BENCHMARKS.REUSE_STANDARD;
    const wanText = formatWanTokens(tokens);
    return {
      kind: 'reuse',
      tokens,
      wanText,
      headline: `预计帮你省约 ${wanText} Token`,
      badge: workbench ? '复用已验证工作台' : '直接复用现成插件',
      desc: workbench
        ? '免去从零搭建前后端通信、持久化与多视图联调（按保守档免省 40+ 轮重开发与调试对话估算）。'
        : '现成插件直接安装即用，免去从零读接口、搭架子与反复改 bug 的多轮开发开销。',
      mathTitle: '怎么算的？（基于真实 DSH 开发会话基准）',
      mathItems: [
        workbench
          ? '多模块工作台自建从空架子到联调通常需要多轮长上下文迭代；保守按 180 万 Token 基准折算，同插件不重复累计。'
          : '单个轻量/常规插件从需求梳理到写码调试完成，保守按 90 万 Token 基准折算，同插件不重复累计。',
        '确认使用、完成安装或带结果反馈后，自动记入首页累计省 Token 账本（仅做省流参考）。',
      ],
      confirmFact: `约 ${wanText} Token（免从零重复造轮子）`,
    };
  }

  if (plan.kind === 'combo') {
    const selected = resolveSelectedCandidates(plan, candidates);
    const count = Math.max(2, selected.length);
    const anyWorkbench = selected.some(isWorkbenchPlugin);
    const base = anyWorkbench ? TOKEN_BENCHMARKS.REUSE_WORKBENCH : TOKEN_BENCHMARKS.REUSE_STANDARD;
    const tokens = Math.min(TOKEN_BENCHMARKS.COMBO_CAP, base + (count - 1) * TOKEN_BENCHMARKS.COMBO_EXTRA);
    const wanText = formatWanTokens(tokens);
    return {
      kind: 'reuse',
      tokens,
      wanText,
      headline: `预计帮你省约 ${wanText} Token`,
      badge: `${count} 块现成拼装`,
      desc: `组合复用 ${count} 个现成插件直接协同交付，只需轻胶水衔接，免去逐个重新开发与排错。`,
      mathTitle: '怎么算的？（组合复用保守估算）',
      mathItems: [
        `首块主能力按${anyWorkbench ? '工作台 180 万' : '常规插件 90 万'}计，其余每多复用 1 块现成能力按 60 万增量叠加（上限 300 万）。`,
        '同一插件在不同任务中去重只计一次，避免虚高。',
      ],
      confirmFact: `约 ${wanText} Token（${count} 块现成组合）`,
    };
  }

  if (plan.kind === 'hybrid') {
    const selected = resolveSelectedCandidates(plan, candidates);
    const count = Math.max(1, selected.length);
    const anyWorkbench = selected.some(isWorkbenchPlugin);
    const reuseBase = anyWorkbench ? TOKEN_BENCHMARKS.HYBRID_REUSE_WORKBENCH : TOKEN_BENCHMARKS.HYBRID_REUSE_STANDARD;
    const reusePart = Math.min(TOKEN_BENCHMARKS.HYBRID_REUSE_CAP, reuseBase + (count - 1) * TOKEN_BENCHMARKS.HYBRID_REUSE_EXTRA);
    const tokens = Math.min(TOKEN_BENCHMARKS.HYBRID_CAP, reusePart + TOKEN_BENCHMARKS.HYBRID_GAP);
    const wanText = formatWanTokens(tokens);
    const reuseWan = formatWanTokens(reusePart);
    return {
      kind: 'hybrid',
      tokens,
      wanText,
      headline: `预计帮你省约 ${wanText} Token`,
      badge: `${count} 块复用 + 带经验补缺`,
      desc: '现有插件扛住主流程，不用整套重造；只按真实缺口带着避坑经验补最后一块薄能力。',
      mathTitle: `这 ${wanText} Token 怎么拆出来的？`,
      mathItems: [
        `保留复用 ${count} 块现成插件主干：保守省去约 ${reuseWan} Token 的重复开发；`,
        '缺口部分注入「3 句定边界 + 空架子先行」5 步经验包，少走 3–5 轮踩坑再省约 45 万 Token。',
      ],
      confirmFact: `约 ${wanText} Token（复用主干 + 避坑补缺）`,
    };
  }

  if (plan.kind === 'gap') {
    const tokens = TOKEN_BENCHMARKS.GUIDED_CREATE;
    const wanText = formatWanTokens(tokens);
    return {
      kind: 'create',
      tokens,
      wanText,
      headline: `预计帮你少烧约 ${wanText} Token`,
      badge: '带踩坑经验自建',
      desc: '社区暂无现成整套插件；接下来会先起最小蓝图并注入 5 步避坑经验，少走 3–5 轮重开发返工。',
      mathTitle: '为什么自己做也能省 Token？',
      mathItems: [
        '先由插件专家对齐首版最小边界与避坑清单，避免边写边推翻重来与宿主样式/注册返工；',
        '保守按少走 3–5 轮大上下文修改折算 45 万 Token，确认开始创建后才记入首页账本。',
      ],
      confirmFact: `约 ${wanText} Token（少走 3–5 轮返工）`,
    };
  }

  return null;
}

export function estimateDetailInstallSavings(detailOrEntry) {
  return isWorkbenchPlugin(detailOrEntry)
    ? '约 180 万 Token（免从零重造工作台）'
    : '约 90 万 Token（免从零重造插件）';
}

const VALID_USE_EXEC = new Set(['created', 'submitting', 'submitted']);
const VALID_HANDOFF = new Set(['applied', 'preserved']);
const VALID_FEEDBACK = new Set(['complete', 'partial']);
const VALID_CREATOR_ATTEMPT = new Set(['creating', 'created', 'applied', 'preserved']);
const VALID_CREATOR_STAGES = new Set(['design', 'skeleton', 'feature', 'verify']);

function displayPluginName(candidate, fallbackId) {
  const raw = text(candidate?.name) || text(candidate?.title) || text(candidate?.packageName) || text(fallbackId);
  if (!raw) return '现成插件';
  const hash = raw.lastIndexOf('#');
  return hash >= 0 && !raw.startsWith('@') ? raw.slice(hash + 1) : raw;
}

export function summarizeTokenSavingsLedger({
  historyTasks = [],
  catalogInstalls = [],
  creatorSessions = [],
  agentRequests = [],
} = {}) {
  const reusedMap = new Map();
  const createdMap = new Map();
  const claimedSessionIds = new Set();

  const creditReuse = (keyInput, entry) => {
    const key = canonicalPluginKey(keyInput);
    if (!key || reusedMap.has(key)) return;
    reusedMap.set(key, entry);
  };

  for (const task of list(historyTasks)) {
    if (!obj(task)) continue;
    const revisions = list(task.revisions).filter(obj);
    const revById = new Map(revisions.filter(r => typeof r.id === 'string').map(r => [r.id, r]));
    const latestRev = revisions.at(-1) ?? null;
    const latestPlan = latestRev?.workflow?.plan;

    const executions = list(task.executions).filter(obj);
    const handoffs = list(task.handoffs).filter(obj);
    const feedback = list(task.feedback).filter(obj);
    const creatorAttempts = list(task.creatorAttempts).filter(obj);

    for (const exec of executions) {
      if (typeof exec.sessionId === 'string' && exec.sessionId) claimedSessionIds.add(exec.sessionId);
    }
    for (const att of creatorAttempts) {
      if (typeof att.sessionId === 'string' && att.sessionId) claimedSessionIds.add(att.sessionId);
    }

    const adoptedRevIds = new Set();
    let bestUseAt = '';
    for (const exec of executions) {
      if (exec.kind === 'use' && VALID_USE_EXEC.has(exec.status)) {
        if (exec.revisionId) adoptedRevIds.add(exec.revisionId);
        const at = text(exec.updatedAt || exec.createdAt);
        if (at > bestUseAt) bestUseAt = at;
      }
    }
    for (const handoff of handoffs) {
      if (VALID_HANDOFF.has(handoff.status)) {
        if (handoff.revisionId) adoptedRevIds.add(handoff.revisionId);
        const at = text(handoff.createdAt);
        if (at > bestUseAt) bestUseAt = at;
      }
    }
    for (const fb of feedback) {
      if (fb.type === 'result' && VALID_FEEDBACK.has(fb.outcome)) {
        if (fb.revisionId) adoptedRevIds.add(fb.revisionId);
        const at = text(fb.createdAt);
        if (at > bestUseAt) bestUseAt = at;
      }
    }
    if (latestPlan?.kind === 'hybrid' && executions.some(e => e.kind === 'create' && VALID_USE_EXEC.has(e.status))) {
      if (latestRev?.id) adoptedRevIds.add(latestRev.id);
      const createAt = text(executions.find(e => e.kind === 'create' && VALID_USE_EXEC.has(e.status))?.updatedAt);
      if (createAt > bestUseAt) bestUseAt = createAt;
    }

    if (adoptedRevIds.size > 0) {
      for (const revId of adoptedRevIds) {
        const rev = revById.get(revId) ?? latestRev;
        const revPlan = rev?.workflow?.plan;
        const revCandidates = list(rev?.workflow?.candidates);
        const candidateById = new Map(revCandidates.filter(c => obj(c) && typeof c.id === 'string').map(c => [c.id, c]));
        for (const pluginId of list(revPlan?.pluginIds)) {
          const cand = candidateById.get(pluginId) ?? { id: pluginId, name: pluginId };
          const workbench = isWorkbenchPlugin(cand);
          const tokens = workbench ? TOKEN_BENCHMARKS.REUSE_WORKBENCH : TOKEN_BENCHMARKS.REUSE_STANDARD;
          creditReuse(cand, {
            kind: 'reuse',
            badge: workbench ? '复用工作台' : '复用插件',
            name: displayPluginName(cand, pluginId),
            detail: text(revPlan?.title) ? `方案「${text(revPlan.title)}」已选用并推进` : '已选用现成插件并接入工作区',
            tokens,
            at: bestUseAt || text(task.updatedAt || task.createdAt),
          });
        }
      }
    }

    const createExec = executions.find(e => e.kind === 'create' && VALID_USE_EXEC.has(e.status));
    const creatorAtt = creatorAttempts.find(c => VALID_CREATOR_ATTEMPT.has(c.status));
    if (createExec || creatorAtt) {
      const taskKey = typeof task.id === 'string' && task.id ? `task:${task.id}` : '';
      if (taskKey && !createdMap.has(taskKey)) {
        const blueprintName = text(latestRev?.workflow?.creation?.blueprint?.name)
          || text(latestPlan?.title)
          || text(task.originalRequest).slice(0, 28)
          || '插件共创项目';
        createdMap.set(taskKey, {
          kind: 'create',
          badge: '带经验自建',
          name: blueprintName,
          detail: '已带 5 步避坑经验与蓝图在工作区实际开造',
          tokens: TOKEN_BENCHMARKS.GUIDED_CREATE,
          at: text(createExec?.updatedAt || createExec?.createdAt || creatorAtt?.updatedAt || creatorAtt?.createdAt || task.updatedAt || task.createdAt),
        });
      }
    }
  }

  for (const row of list(catalogInstalls)) {
    if (!obj(row)) continue;
    const ready = row.attempt?.status === 'ready' || (Array.isArray(row.archivedAttempts) && row.archivedAttempts.length > 0);
    if (!ready) continue;
    const merged = { ...(obj(row.entry) ?? {}), ...(obj(row.candidate) ?? {}), entryId: row.entryId };
    const workbench = isWorkbenchPlugin(merged);
    const tokens = workbench ? TOKEN_BENCHMARKS.REUSE_WORKBENCH : TOKEN_BENCHMARKS.REUSE_STANDARD;
    creditReuse(merged, {
      kind: 'reuse',
      badge: workbench ? '复用工作台' : '复用插件',
      name: displayPluginName(merged, row.entryId),
      detail: '通过发现好插件商店直接安装并就绪',
      tokens,
      at: text(row.updatedAt),
    });
  }

  for (const req of list(agentRequests)) {
    if (!obj(req)) continue;
    if (typeof req.creator?.sessionId === 'string' && req.creator.sessionId) {
      claimedSessionIds.add(req.creator.sessionId);
    }
    const historyRow = Object.values(obj(req.history?.rows) ?? {}).find(obj);
    let parsedTask = null;
    if (historyRow && typeof historyRow.serialized === 'string') {
      try { parsedTask = JSON.parse(historyRow.serialized); } catch { parsedTask = null; }
    }
    const lastRev = list(parsedTask?.revisions).at(-1);
    const reqCandidates = list(lastRev?.workflow?.candidates);

    const prepGroups = [];
    if (req.status === 'ready' && req.preparation?.kind === 'existing' && req.preparation?.status === 'ready') {
      prepGroups.push(req.preparation);
    }
    if (req.existingPreparation?.kind === 'existing' && req.existingPreparation?.status === 'ready') {
      prepGroups.push(req.existingPreparation);
    }
    for (const prep of prepGroups) {
      for (const p of list(prep.plugins)) {
        if (!obj(p) || (p.status && p.status !== 'ready')) continue;
        const matched = reqCandidates.find(c => c?.id === p.candidateId) ?? p;
        const workbench = isWorkbenchPlugin({ ...matched, ...p });
        const tokens = workbench ? TOKEN_BENCHMARKS.REUSE_WORKBENCH : TOKEN_BENCHMARKS.REUSE_STANDARD;
        creditReuse({ ...matched, ...p }, {
          kind: 'reuse',
          badge: workbench ? '复用工作台' : '复用插件',
          name: displayPluginName({ ...matched, ...p }, p.packageName || p.candidateId),
          detail: '通过 Agent 助手复用现成插件并安装就绪',
          tokens,
          at: text(prep.verifiedAt || req.updatedAt || req.createdAt),
        });
      }
    }

    const genDone = req.creator?.status === 'completed' || (req.preparation?.kind === 'generated' && req.preparation?.status === 'ready');
    if (genDone) {
      const key = typeof req.creator?.sessionId === 'string' && req.creator.sessionId
        ? `session:${req.creator.sessionId}`
        : `agent:${text(req.id) || createdMap.size}`;
      if (!createdMap.has(key)) {
        const goal = text(lastRev?.workflow?.creation?.blueprint?.name)
          || text(req.input?.goal)
          || text(lastRev?.workflow?.request).slice(0, 28)
          || 'Agent 带经验自建插件';
        createdMap.set(key, {
          kind: 'create',
          badge: '带经验自建',
          name: goal,
          detail: '通过 Agent 先查后建蓝图与避坑流程生成',
          tokens: TOKEN_BENCHMARKS.GUIDED_CREATE,
          at: text(req.preparation?.verifiedAt || req.updatedAt || req.createdAt),
        });
      }
    }
  }

  for (const sess of list(creatorSessions)) {
    if (!obj(sess) || typeof sess.sessionId !== 'string' || !sess.sessionId) continue;
    if (claimedSessionIds.has(sess.sessionId)) continue;
    const steps = list(sess.steps).filter(obj);
    if (!steps.some(step => VALID_CREATOR_STAGES.has(step.stage))) continue;
    const key = `session:${sess.sessionId}`;
    if (createdMap.has(key)) continue;
    const lastStep = steps.at(-1);
    createdMap.set(key, {
      kind: 'create',
      badge: '带经验自建',
      name: `创造模式会话（${steps.length} 步向导）`,
      detail: text(lastStep?.summary) ? `最近进展：${text(lastStep.summary).slice(0, 48)}` : '已启用创造向导并推进结构与验证',
      tokens: TOKEN_BENCHMARKS.GUIDED_CREATE,
      at: text(lastStep?.at || sess.updatedAt),
    });
  }

  const allEntries = [...reusedMap.values(), ...createdMap.values()];
  const totalTokens = allEntries.reduce((sum, entry) => sum + safeInt(entry.tokens), 0);
  allEntries.sort((a, b) => text(b.at).localeCompare(text(a.at)));

  return {
    totalTokens,
    reuseCount: reusedMap.size,
    createCount: createdMap.size,
    totalItems: reusedMap.size + createdMap.size,
    items: allEntries.slice(0, 30).map(({ kind, badge, name, detail, tokens }) => ({
      kind,
      badge,
      name,
      detail,
      tokens: safeInt(tokens),
    })),
  };
}

export function normalizeTokenSavings(raw) {
  const rec = obj(raw);
  if (!rec) return null;
  const rows = list(rec.items)
    .filter(obj)
    .slice(0, 30)
    .map(item => ({
      kind: item.kind === 'create' ? 'create' : 'reuse',
      badge: text(item.badge).slice(0, 40) || (item.kind === 'create' ? '带经验自建' : '复用插件'),
      name: text(item.name).slice(0, 120) || '插件方案',
      detail: text(item.detail).slice(0, 200),
      tokens: safeInt(item.tokens),
    }))
    .filter(item => item.tokens > 0);
  return {
    totalTokens: safeInt(rec.totalTokens),
    reuseCount: safeInt(rec.reuseCount),
    createCount: safeInt(rec.createCount),
    totalItems: safeInt(rec.totalItems),
    items: rows,
  };
}
