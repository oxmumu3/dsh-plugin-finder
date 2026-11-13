// 创造模式进度条：挂在创造模式会话输入框上方（conversation.input.dock），只在 cordis 会话、且经验开启时出现。
// 数据来自 Host 的阶段记录（创造会话里的 finder_creator_step 工具），不轮询：工具调用或一轮结束时刷新。
// 外观按 v8 设计稿的陪做条（SPEC 5.11）：三种状态、五步一行、颜色之外每步都写着名字。
const STAGES = [
  { id: 'search', label: '查现成' },
  { id: 'design', label: '定设计' },
  { id: 'skeleton', label: '空架子' },
  { id: 'feature', label: '加功能' },
  { id: 'verify', label: '验证' },
];
const ORDER = Object.fromEntries(STAGES.map((stage, index) => [stage.id, index]));
const LABEL = { ...Object.fromEntries(STAGES.map(stage => [stage.id, stage.label])), blocked: '卡住了' };
// What a user reads. The internal labels are shorthand for logs and handoff text.
const PLAIN = {
  search: '先看看有没有现成的', design: '说清怎么做', skeleton: '先搭个能打开的',
  feature: '一次加一个功能', verify: '跑一遍确认', blocked: '卡住了',
};
const BRICK = 'M3 7H3.4V5.3a1.1 1.1 0 0 1 1.1-1.1h3a1.1 1.1 0 0 1 1.1 1.1V7h2.8V5.3a1.1 1.1 0 0 1 1.1-1.1h3a1.1 1.1 0 0 1 1.1 1.1V7H17a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z';
const text = value => typeof value === 'string' ? value : '';
export const CREATOR_PRESET = 'cordis';

/** 把阶段记录折算成进度条：走到的最远阶段、最近一步、是否卡住。 */
export function creatorProgress(steps) {
  const rows = Array.isArray(steps) ? steps.filter(item => item && typeof item.stage === 'string' && LABEL[item.stage]) : [];
  const blockedRow = rows.at(-1)?.stage === 'blocked' ? rows.at(-1) : null;
  // 只有记录里真的写了步号，才在标题里写第几步；否则只写「卡住了」，不拿推算的步号冒充记录。
  const recordedStep = blockedRow && Number.isSafeInteger(blockedRow.step) && blockedRow.step >= 1 && blockedRow.step <= STAGES.length ? blockedRow.step : null;
  let furthest = rows.reduce((max, item) => item.stage in ORDER ? Math.max(max, ORDER[item.stage]) : max, -1);
  if (recordedStep) furthest = Math.max(furthest, recordedStep - 1);
  const recorded = new Set(rows.map(item => item.stage));
  const last = rows.at(-1) ?? null;
  // Only a recorded stage counts as done; an earlier stage with no record is shown as skipped, not completed.
  return {
    stages: STAGES.map((stage, index) => ({ ...stage, plain: PLAIN[stage.id], state: index === furthest ? 'current' : index > furthest ? 'todo' : recorded.has(stage.id) ? 'done' : 'skipped' })),
    last: last ? { stage: last.stage, label: LABEL[last.stage], summary: text(last.summary) } : null,
    blocked: last?.stage === 'blocked',
    blockedStep: recordedStep,
    count: rows.length,
    reached: Math.max(0, STAGES.filter((stage, index) => index <= furthest).length),
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
.pfc_dock, .pfc_closed { box-sizing: border-box;
  --pfc_ink: var(--dsw-alias-label-primary, #191b1f);
  --pfc_ink2: var(--dsw-alias-label-secondary, #4b5058);
  --pfc_ink3: var(--dsw-alias-label-tertiary, #868c95);
  --pfc_card: var(--dsw-alias-bg-layer-2, #ffffff);
  --pfc_line: var(--dsw-alias-border-l2, #e7e7e2);
  --pfc_line2: var(--dsw-alias-border-l4, #d0d0c9);
  --pfc_build: var(--dsw-alias-state-warn-primary, #dd8500);
  --pfc_ok: var(--dsw-alias-state-success-primary, #2fa36b);
  --pfc_primary: var(--dsw-alias-button-primary-fill, #191b1f);
  --pfc_on_primary: var(--dsw-alias-label-primary-inverted, #ffffff);
  --pfc_serif: "Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", Georgia, serif;
  --pfc_sans: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif);
  font-family: var(--pfc_sans); color: var(--pfc_ink); }
.pfc_dock { width: 100%; margin: 0 0 8px; padding: 16px 20px 18px; border: 1px solid var(--pfc_line2); border-radius: 20px; background: var(--pfc_card); }
.pfc_dock[data-stuck="true"] { border-color: var(--pfc_build); }
.pfc_hd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pfc_hd b { font: 400 18px/1.4 var(--pfc_serif); }
.pfc_brick { width: 24px; height: 24px; flex: none; margin: -2px 0 -2px -2px; overflow: visible; }
.pfc_brick path { fill: color-mix(in srgb, var(--pfc_build) 9%, transparent); stroke: var(--pfc_build); stroke-width: 1.3; stroke-dasharray: 2.6 2.3; stroke-linecap: round; stroke-linejoin: round; }
.pfc_hd .pfc_steps_link { margin-left: auto; }
.pfc_dock p { margin: 6px 0 0; font-size: 14px; line-height: 1.7; color: var(--pfc_ink2); }
.pfc_dock p b { color: var(--pfc_ink); font-weight: 500; }
.pfc_five { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 3px; margin-top: 14px; }
.pfc_five div { min-width: 0; padding-right: 8px; }
.pfc_five i { display: block; height: 5px; border-radius: 3px; background: var(--pfc_line); }
.pfc_five .is_done i { background: var(--pfc_ok); }
.pfc_five .is_current i { background: var(--pfc_build); }
.pfc_five span { display: block; margin-top: 6px; font-size: 12px; line-height: 1.45; color: var(--pfc_ink3); }
.pfc_five .is_done span { color: var(--pfc_ink2); }
.pfc_five .is_current span { color: var(--pfc_ink); font-weight: 600; }
.pfc_acts { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 16px; }
.pfc_dock .pfc_button, .pfc_closed .pfc_button { box-sizing: border-box; font: inherit; font-size: 13px; height: 32px; padding: 0 16px; border-radius: 16px; border: 1px solid var(--pfc_line2);
  background: transparent; color: var(--pfc_ink); cursor: pointer; }
.pfc_dock .pfc_button:hover:not(:disabled), .pfc_closed .pfc_button:hover:not(:disabled) { background: color-mix(in srgb, var(--pfc_ink) 5%, transparent); }
.pfc_dock .pfc_button[data-primary="true"], .pfc_closed .pfc_button[data-primary="true"] { border-color: var(--pfc_primary); background: var(--pfc_primary); color: var(--pfc_on_primary); }
.pfc_dock .pfc_button[data-primary="true"]:hover:not(:disabled), .pfc_closed .pfc_button[data-primary="true"]:hover:not(:disabled) { opacity: .9; background: var(--pfc_primary); }
.pfc_dock .pfc_button:disabled, .pfc_closed .pfc_button:disabled { opacity: .45; cursor: default; }
.pfc_dock .pfc_link, .pfc_closed .pfc_link { box-sizing: border-box; font: inherit; font-size: 12.5px; padding: 0; border: 0; background: none; color: var(--pfc_ink3); cursor: pointer;
  border-bottom: 1px solid var(--pfc_line2); line-height: 1.5; }
.pfc_dock .pfc_link:hover, .pfc_closed .pfc_link:hover { color: var(--pfc_ink); }
.pfc_notice { font-size: 12.5px; color: var(--pfc_ink3); }
.pfc_closed { width: 100%; margin: 0 0 8px; padding: 10px 14px; border: 1px solid var(--pfc_line); border-radius: 14px;
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--pfc_ink3); background: var(--pfc_card); }
.pfc_button:focus-visible, .pfc_link:focus-visible { outline: 2px solid var(--pfc_ink); outline-offset: 2px; border-radius: 6px; }@media (max-width: 560px) {
  .pfc_dock { padding: 14px 16px 16px; }
  .pfc_five span { font-size: 11px; }
}
@media (prefers-reduced-motion: no-preference) { .pfc_five i { transition: background-color .2s; } }
`;
export const creatorStripCss = css;

/** 纯展示：三种状态都只是排版，行为和文字沿用 preview.21。 */
export function createCreatorDock(React) {
  const h = React.createElement;
  const brick = () => h('svg', { className: 'pfc_brick', viewBox: '-3 0.6 26 22.6', role: 'img', 'aria-label': '还没做完，要一起做' },
    h('path', { d: BRICK }));

  return function CreatorDock({
    mode = 'intro', progress = null, busy = '', notice = '',
    onKnow, onSkip, onReopen, onOpenNext, onClose, onSettings, onShowSteps, onEnable, onDismiss,
  }) {
    if (mode === 'closed') {
      return h('div', { className: 'pfc_closed', role: 'status' },
        h('span', null, '已关闭「发现好插件」的创造经验，之后新开的创造模式会话不再带上。'),
        h('button', { type: 'button', className: 'pfc_link', disabled: busy !== '', onClick: onEnable }, '撤销'),
        notice ? h('span', { className: 'pfc_notice', role: 'status' }, notice) : null);
    }
    const stages = progress?.stages ?? [];
    const reached = progress?.reached ?? 0;
    const last = progress?.last ?? null;
    const five = () => h('div', { className: 'pfc_five', role: 'img', 'aria-label': `五步：${stages.map((stage, index) => `${index + 1} ${stage.plain ?? stage.label}`).join('，')}` },
      ...stages.map((stage, index) => h('div', { key: stage.id, className: stage.state === 'done' ? 'is_done' : stage.state === 'current' ? 'is_current' : '' },
        h('i', null), h('span', null, `${index + 1} ${stage.plain ?? stage.label}`))));
    const links = (showSteps = false) => h(React.Fragment, null,
      showSteps ? h('button', { type: 'button', className: 'pfc_link pfc_steps_link', onClick: onShowSteps, title: '这几步是什么' }, '这几步是什么') : null,
      typeof onSettings === 'function' ? h('button', { type: 'button', className: 'pfc_link', onClick: onSettings }, '经验') : null,
      h('button', { type: 'button', className: 'pfc_link', disabled: busy !== '', onClick: onClose }, '关闭'));

    if (mode === 'intro') {
      return h('div', { className: 'pfc_dock', role: 'region', 'aria-label': '发现好插件 · 陪你做插件的做法' },
        h('div', { className: 'pfc_hd' }, brick(), h('b', null, '这一块，我陪你做')),
        h('p', null, '做插件的时候我按下面五步来，每一步先问你。不用设置；聊别的事我不出声。'),
        five(),
        h('div', { className: 'pfc_acts' },
          h('button', { type: 'button', className: 'pfc_button', 'data-primary': 'true', onClick: onKnow }, '知道了'),
          h('button', { type: 'button', className: 'pfc_link', onClick: onSkip }, '这个对话不用陪')));
    }

    if (mode === 'stuck') {
      const blockedStep = progress?.blockedStep;
      const heading = blockedStep
        ? `卡在第 ${blockedStep} 步${last?.summary ? `：${last.summary}` : ''}`
        : `卡住了${last?.summary ? `：${last.summary}` : ''}`;
      return h('div', { className: 'pfc_dock', 'data-stuck': 'true', role: 'region', 'aria-label': '发现好插件 · 创造进度' },
        h('div', { className: 'pfc_hd' }, brick(),
          h('b', null, heading)),
        h('p', null, '同一个问题在一个对话里反复改，只会越改越贵。开个新窗口，把试过什么、卡在哪一起带过去。'),
        five(),
        h('div', { className: 'pfc_acts' },
          h('button', { type: 'button', className: 'pfc_button', 'data-primary': 'true', disabled: busy !== '', onClick: onOpenNext, title: '新建一个干净的创造模式窗口，把这里记下的进展带过去' }, '开新窗口接着做'),
          h('button', { type: 'button', className: 'pfc_link', onClick: onDismiss }, '先不用'),
          links()),
        notice ? h('span', { className: 'pfc_notice', role: 'status' }, notice) : null);
    }

    const current = stages.find(stage => stage.state === 'current') ?? stages[Math.min(Math.max(reached, 0), (stages.length || 1) - 1)];
    return h('div', { className: 'pfc_dock', role: 'region', 'aria-label': '发现好插件 · 创造进度' },
      h('div', { className: 'pfc_hd' }, brick(),
        h('b', null, `做到第 ${Math.min(Math.max(reached, 1), stages.length || 5)} 步${current ? `：${current.plain ?? current.label}` : ''}`),
        links(true)),
      h('p', null, last?.summary ? last.summary : '每一步都先问你，你说了才往下走。'),
      five(),
      notice ? h('span', { className: 'pfc_notice', role: 'status' }, notice) : null);
  };
}

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
  const Dock = createCreatorDock(React);
  return function CreatorStrip(props) {
    const sessionId = text(props?.sessionId);
    const [preset, setPreset] = React.useState(() => presetOf(ctx, sessionId));
    const [data, setData] = React.useState(null);
    const [busy, setBusy] = React.useState('');
    const [notice, setNotice] = React.useState('');
    const [closedHere, setClosedHere] = React.useState(false);
    // 「先不用」只关这一个入口，不动全局的创造经验开关。
    const [dismissed, setDismissed] = React.useState(false);
    // The five stages mean nothing without a first explanation, so it is shown
    // once per session and can be reopened with the 「这几步是什么」 link.
    const [introOpen, setIntroOpen] = React.useState(() => {
      try {
        const store = globalThis.localStorage;
        return store?.getItem(`finder.creator.intro.${text(props?.sessionId)}`) !== '1'
          && store?.getItem(`finder.creator.skip.${text(props?.sessionId)}`) !== '1';
      } catch { return true; }
    });
    const dismissIntro = hideForever => {
      try {
        globalThis.localStorage?.setItem(hideForever ? `finder.creator.skip.${sessionId}` : `finder.creator.intro.${sessionId}`, '1');
      } catch { /* 无痕模式就只在本次渲染生效 */ }
      setIntroOpen(false);
    };

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
    const enable = () => {
      setBusy('enable');
      void request('creator-configure', { enabled: true }).then(() => { setClosedHere(false); setData(current => ({ ...(current ?? {}), enabled: true })); }).catch(() => setNotice('没有重新开启，请稍后再试。')).finally(() => setBusy(''));
    };
    if (closedHere) return h(Dock, { mode: 'closed', busy, notice, onEnable: enable });
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
    // 没有记录、也关掉了第一次的说明：不打扰。
    if (!progress.count && !introOpen) return null;
    // 这一条只关当前入口；下一次有问题时再出现。
    if (dismissed) return null;
    const mode = progress.blocked ? 'stuck' : progress.count ? 'run' : 'intro';
    return h(Dock, {
      mode, progress, busy, notice,
      onKnow: () => dismissIntro(false),
      onSkip: () => dismissIntro(true),
      onShowSteps: () => setIntroOpen(true),
      onOpenNext: openNext,
      onClose: close,
      onDismiss: () => setDismissed(true),
      onSettings: typeof openSettings === 'function' ? openSettings : null,
      onEnable: enable,
    });
  };
}
