// 创造模式进度条：挂在创造模式会话输入框上方（conversation.input.dock），只在 cordis 会话、且经验开启时出现。
// 数据来自 Host 的阶段记录（创造会话里的 finder_creator_step 工具），不轮询：工具调用或一轮结束时刷新。
const STAGES = [
  { id: 'search', label: '查现成' },
  { id: 'design', label: '定设计' },
  { id: 'skeleton', label: '空架子' },
  { id: 'feature', label: '加功能' },
  { id: 'verify', label: '验证' },
];
const ORDER = Object.fromEntries(STAGES.map((stage, index) => [stage.id, index]));
const LABEL = { ...Object.fromEntries(STAGES.map(stage => [stage.id, stage.label])), blocked: '卡住了' };
const text = value => typeof value === 'string' ? value : '';
export const CREATOR_PRESET = 'cordis';

/** 把阶段记录折算成进度条：走到的最远阶段、最近一步、是否卡住。 */
export function creatorProgress(steps) {
  const rows = Array.isArray(steps) ? steps.filter(item => item && typeof item.stage === 'string' && LABEL[item.stage]) : [];
  const furthest = rows.reduce((max, item) => item.stage in ORDER ? Math.max(max, ORDER[item.stage]) : max, -1);
  const recorded = new Set(rows.map(item => item.stage));
  const last = rows.at(-1) ?? null;
  // Only a recorded stage counts as done; an earlier stage with no record is shown as skipped, not completed.
  return {
    stages: STAGES.map((stage, index) => ({ ...stage, state: index === furthest ? 'current' : index > furthest ? 'todo' : recorded.has(stage.id) ? 'done' : 'skipped' })),
    last: last ? { stage: last.stage, label: LABEL[last.stage], summary: text(last.summary) } : null,
    blocked: last?.stage === 'blocked',
    count: rows.length,
  };
}

/** 开新窗口时放进输入框的交接草稿：只用阶段记录里已有的内容，不替用户编造进展。 */
export function creatorHandoffPrompt(steps) {
  const rows = (Array.isArray(steps) ? steps : []).filter(item => item && LABEL[item.stage] && text(item.summary).trim()).slice(-8);
  const lines = rows.map((item, index) => `${index + 1}. ${LABEL[item.stage]}：${text(item.summary).trim()}`);
  return [
    '接着上一个创造模式窗口继续做。上个窗口记下的进展：',
    ...(lines.length ? lines : ['（上个窗口还没有记录进展）']),
    '',
    '请先调用 finder_creator_guide 读取创造经验，再从最后一步继续；已经跑通的部分不要重写。需要上个窗口的细节时先问我。',
  ].join('\n');
}

const css = `
.pfc_strip { box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 8px 10px 8px 12px; margin: 0 0 8px; border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l3, #dce4ed); background: var(--dsw-alias-bg-layer-1, #f7f9fc); }
.pfc_strip[data-blocked="true"] { border-color: color-mix(in srgb, #f0a841 55%, var(--dsw-alias-border-l3, #dce4ed)); }
.pfc_brand { display: inline-flex; align-items: center; gap: 7px; color: var(--dsw-alias-label-primary, #18263b); font-weight: 600; white-space: nowrap; font-size: 12.5px; }
.pfc_brand::before { content: ""; width: 16px; height: 16px; border-radius: 5px; flex: none;
  background: linear-gradient(155deg, #7c93ff, #3b56e0); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3); }
.pfc_track { display: flex; align-items: center; gap: 3px; margin: 0; padding: 0; list-style: none; }
.pfc_stage { display: block; width: 20px; height: 4px; border-radius: 2px; padding: 0; overflow: hidden; text-indent: -9999px; white-space: nowrap;
  background: color-mix(in srgb, var(--dsw-alias-label-primary, #18263b) 14%, transparent); }
.pfc_stage[data-state="done"] { background: var(--dsw-alias-state-business-primary, #4d6bfe); }
.pfc_stage[data-state="current"] { background: var(--dsw-alias-state-business-primary, #4d6bfe); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary, #4d6bfe) 24%, transparent); }
.pfc_stage[data-state="skipped"] { background: transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-label-primary, #18263b) 26%, transparent); }
.pfc_dot { display: none; }
.pfc_last { flex: 1 1 200px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px;
  color: var(--dsw-alias-label-secondary, #606b78); }
.pfc_actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.pfc_button { font: inherit; font-size: 12px; padding: 4px 11px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, #becbdb);
  background: transparent; color: var(--dsw-alias-label-primary, #18263b); cursor: pointer; }
.pfc_button:hover { border-color: var(--dsw-alias-state-business-primary, #4d6bfe); }
.pfc_button[data-primary="true"] { border-color: transparent; background: var(--dsw-alias-state-business-primary, #4d6bfe); color: #fff; }
.pfc_button:disabled { opacity: .5; cursor: default; }
.pfc_link { font: inherit; font-size: 12px; border: 0; padding: 0; background: none; color: var(--dsw-alias-label-secondary, #606b78); cursor: pointer;
  text-decoration: underline; text-underline-offset: 3px; text-decoration-color: color-mix(in srgb, var(--dsw-alias-label-secondary, #606b78) 40%, transparent); }
.pfc_link:hover { color: var(--dsw-alias-label-primary, #18263b); }
.pf_creator_notes { padding-left: 18px; line-height: 1.7; }
.pf_creator_notes li { margin: 4px 0; }
.pfc_link:focus-visible, .pfc_button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #4d6bfe); outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) { .pfc_stage { transition: background-color .2s, box-shadow .2s; } }
`;
export const creatorStripCss = css;

function presetOf(ctx, sessionId) {
  try { return ctx.sessions?.binding?.(sessionId)?.session?.projections?.faceOf?.('agentPreset')?.getSnapshot?.() ?? null; } catch { return null; }
}

/** 在当前会话所在的工作区新建一个创造模式会话，放入交接草稿（不发送），并打开它。 */
export async function openCreatorContinuation(ctx, sessionId, prompt) {
  const fail = message => { const error = new Error(message); error.safeForUser = true; return error; };
  const items = ctx.workspaces?.list?.getSnapshot?.()?.items;
  const workspaceId = Array.isArray(items) ? items.find(item => Array.isArray(item?.sessionIds) && item.sessionIds.includes(sessionId))?.workspaceId : undefined;
  if (!workspaceId) throw fail('没找到这个会话所在的工作区，请从左侧新建创造模式会话。');
  if (typeof ctx.sessions?.create !== 'function' || typeof ctx.sessions?.retain !== 'function' || typeof ctx.uiWorkspace?.openSession !== 'function') throw fail('当前 DSH 版本不支持自动开新窗口。');
  const created = await ctx.sessions.create({ workspaceId, agentPreset: CREATOR_PRESET });
  const nextId = typeof created === 'string' ? created : text(created?.sessionId) || text(created?.id);
  if (!nextId) throw fail('新窗口的创建结果尚未确认，请到左侧会话列表查看。');
  const reference = ctx.sessions.retain(nextId, { source: 'controllerOperation' });
  try {
    await reference.ready;
    const binding = reference.binding;
    const conversation = binding?.ctx?.get?.('conversation', false);
    const status = typeof conversation?.input?.requestDraftInitialization === 'function'
      ? conversation.input.requestDraftInitialization(binding, { prompt, clearPreviousDraft: false }) : 'unavailable';
    ctx.uiWorkspace.openSession(nextId);
    return { sessionId: nextId, draft: status };
  } finally { try { reference.release(); } catch { /* already released */ } }
}

/**
 * request(path, body?) → Promise<value>：调用 Finder Host 路由。
 * 返回一个 React 组件，作为 conversation.input.dock 条目渲染。
 */
export function createCreatorStrip(React, { ctx, request, openSettings }) {
  const h = React.createElement;
  return function CreatorStrip(props) {
    const sessionId = text(props?.sessionId);
    const [preset, setPreset] = React.useState(() => presetOf(ctx, sessionId));
    const [data, setData] = React.useState(null);
    const [busy, setBusy] = React.useState('');
    const [notice, setNotice] = React.useState('');
    const [closedHere, setClosedHere] = React.useState(false);

    React.useEffect(() => {
      setPreset(presetOf(ctx, sessionId));
      const face = (() => { try { return ctx.sessions?.binding?.(sessionId)?.session?.projections?.faceOf?.('agentPreset'); } catch { return null; } })();
      const stop = typeof face?.subscribe === 'function' ? face.subscribe(() => setPreset(presetOf(ctx, sessionId))) : null;
      return () => { if (typeof stop === 'function') stop(); };
    }, [sessionId]);

    const creator = preset === CREATOR_PRESET;
    React.useEffect(() => {
      if (!creator || !sessionId) return undefined;
      let live = true, timer = null, seen = -1;
      const load = () => { void request('creator-session', { sessionId }).then(value => { if (live) setData(value); }).catch(() => { if (live) setData(current => current ?? { enabled: true, steps: [] }); }); };
      load();
      const source = (() => { try { return ctx.sessions?.binding?.(sessionId)?.eventSource; } catch { return null; } })();
      const count = () => {
        const entries = source?.getSnapshot?.()?.entries;
        if (!Array.isArray(entries)) return 0;
        let total = 0;
        for (const entry of entries) {
          const event = entry?.event;
          if (entry?.type === 'event' && (event?.type === 'turn/end' || event?.type === 'tool/call' && event.data?.name === 'finder_creator_step')) total += 1;
        }
        return total;
      };
      const check = () => { const now = count(); if (now === seen) return; seen = now; if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; load(); }, 900); };
      const stop = typeof source?.subscribe === 'function' ? source.subscribe(check) : null;
      check();
      return () => { live = false; if (timer) clearTimeout(timer); if (typeof stop === 'function') stop(); };
    }, [creator, sessionId]);

    if (!creator || !data) return null;
    if (closedHere) {
      return h('div', { className: 'pfc_strip', role: 'status' },
        h('span', null, '已关闭「发现好插件」的创造经验，之后新开的创造模式会话不再带上。'),
        h('div', { className: 'pfc_actions' }, h('button', { type: 'button', className: 'pfc_link', disabled: busy !== '', onClick: () => {
          setBusy('enable');
          void request('creator-configure', { enabled: true }).then(() => { setClosedHere(false); setData(current => ({ ...(current ?? {}), enabled: true })); }).catch(() => setNotice('没有重新开启，请稍后再试。')).finally(() => setBusy(''));
        } }, '撤销')));
    }
    if (data.enabled === false) return null;
    const progress = creatorProgress(data.steps);
    const openNext = () => {
      setBusy('next'); setNotice('');
      void openCreatorContinuation(ctx, sessionId, creatorHandoffPrompt(data.steps))
        .then(result => { if (result.draft !== 'applied') setNotice('新窗口已打开，交接内容没能放进输入框，可以手动说明进展。'); })
        .catch(error => setNotice(error?.safeForUser ? error.message : '没能开新窗口，请从左侧新建创造模式会话。'))
        .finally(() => setBusy(''));
    };
    const close = () => {
      setBusy('close'); setNotice('');
      void request('creator-configure', { enabled: false }).then(() => setClosedHere(true)).catch(() => setNotice('没有关闭成功，请稍后再试。')).finally(() => setBusy(''));
    };
    return h('div', { className: 'pfc_strip', 'data-blocked': progress.blocked ? 'true' : 'false', role: 'region', 'aria-label': '发现好插件 · 创造进度' },
      h('span', { className: 'pfc_brand', title: '「发现好插件」按先查现成、先定设计、先跑空架子带你做，每一步都会先问你。' }, '插件专家陪你做'),
      h('ol', { className: 'pfc_track', 'aria-label': '创造阶段' }, ...progress.stages.map(stage => h('li', { key: stage.id, className: 'pfc_stage', 'data-state': stage.state, 'aria-current': stage.state === 'current' ? 'step' : undefined, title: stage.state === 'skipped' ? '这一步没有记录' : undefined },
        h('span', { className: 'pfc_dot', 'aria-hidden': true }), stage.label))),
      h('span', { className: 'pfc_last', title: progress.last ? `${progress.last.label}：${progress.last.summary}` : undefined },
        notice || (progress.last ? `${progress.last.label}：${progress.last.summary}` : '说出你想做的功能，它会先帮你查有没有现成插件。')),
      h('div', { className: 'pfc_actions' },
        progress.blocked && progress.count > 0 ? h('button', { type: 'button', className: 'pfc_button', 'data-primary': 'true', disabled: busy !== '', onClick: openNext, title: '新建一个干净的创造模式窗口，把这里记下的进展放进输入框（不会自动发送）' }, busy === 'next' ? '正在打开…' : '开新窗口接着做') : null,
        typeof openSettings === 'function' ? h('button', { type: 'button', className: 'pfc_link', onClick: openSettings }, '经验') : null,
        h('button', { type: 'button', className: 'pfc_link', disabled: busy !== '', onClick: close }, '关闭')));
  };
}
