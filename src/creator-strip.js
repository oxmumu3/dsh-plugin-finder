// 创造模式向导条 v2：挂在创造模式会话输入框上方（conversation.input.dock），只在 cordis 会话、且经验开启时出现。
// 数据来自 Host 的阶段记录（finder_creator_step 工具）与实时事件流，不轮询；默认收成单行引导条，展开后显示阶段轨迹与人读锦囊。
const STAGES = [
  { id: 'search', label: '查现成' },
  { id: 'design', label: '定设计' },
  { id: 'skeleton', label: '空架子' },
  { id: 'feature', label: '加功能' },
  { id: 'verify', label: '验证' },
];
const ORDER = Object.fromEntries(STAGES.map((stage, index) => [stage.id, index]));
const LABEL = { ...Object.fromEntries(STAGES.map(stage => [stage.id, stage.label])), blocked: '卡住了' };
const PLAIN = {
  search: '先看看有没有现成的',
  design: '先对齐 3 句话方案',
  skeleton: '先搭能点开的空架子',
  feature: '一次只加一个核心功能',
  verify: '按提示刷新核对实效',
  blocked: '卡住了',
};
const STAGE_SHORT = Object.freeze({
  search: '查现成',
  design: '定方案',
  skeleton: '搭架子',
  feature: '加功能',
  verify: '待验收',
});
const STAGE_HINTS = Object.freeze({
  search: '有现成插件优先复用，确实没有再自己造',
  design: '先确认挂在哪、平时怎么用，再让它写代码',
  skeleton: '先点开看位置和入口没白屏，先不管细节',
  feature: '看一眼刚加的功能顺不顺手，一次只改一处',
  verify: '按 ⌘R 刷新看实效（改了后台或工具需退出重开 DSH）',
});

// 给「人类用户」看的分步锦囊（不放给 AI 看的 SDK 内部实现细节）
const STAGE_LESSONS = Object.freeze({
  search: [
    '先搜社区现成插件能省掉大量重复造轮子；真没有现成的，也可挑最接近的让 AI 照着改。',
    '聊完发现现成的就能用时，直接装现成插件最稳。',
  ],
  design: [
    '动手前只对齐三件事：入口挂在哪（侧栏、顶部标签还是悬浮窗）、占多大空间、数据存哪。',
    '首版砍掉锦上添花的功能，越聚焦越容易一次做成。',
  ],
  skeleton: [
    '第一版只要能点开、不白屏、位置顺眼就算过关，别一口气塞满所有功能。',
    '入口位置如果不顺手，趁现在还没堆逻辑时换位置最轻松。',
  ],
  feature: [
    '每次只提 1–2 个具体调整（如“压小字号”“只留三项指标”），比一次改十处稳得多。',
    '每加完一块都顺手点一下，确认没把上一版做好的地方改坏。',
  ],
  verify: [
    '只改界面样式按 ⌘R 即可生效；新加了工具、后台接口或重装同名插件，需 ⌘Q 退出重开 DSH。',
    '顺手切一下深色/浅色和窄窗口，看有没有挤爆、遮挡或看不清的字。',
  ],
  blocked: [
    '同一问题连改三轮没好，继续在长对话里硬磨只会越改越乱、越花越多 Token；带进展换干净窗口最划算。',
  ],
});

const STARTER_CHIPS = Object.freeze([
  {
    label: '先查有没有现成的',
    prompt: '我想做一个功能：___。先别急着写代码，请先用 finder_search 查查社区有没有现成或相近的插件。',
  },
  {
    label: '先对齐 3 句话方案',
    prompt: '我想自己做一个小插件：___。先别写代码，请用三五句大白话跟我确认入口挂在哪、怎么交互、数据存哪。',
  },
  {
    label: '搭最小可点开初版',
    prompt: '我想做：___。第一版请只搭一个最小能点开、不白屏的空架子，我确认位置顺眼后再逐个加功能。',
  },
]);

const STAGE_CHIPS = Object.freeze({
  search: {
    primary: {
      label: '自己造 · 先定 3 句方案',
      prompt: '现成插件不完全合适，我们自己做一个轻量版。先别写代码，请用三五句大白话跟我确认入口挂在哪、平时怎么用、数据存哪。',
    },
    secondary: {
      label: '挑最接近的照着改',
      prompt: '请挑一个结构最接近的现成插件参考它的挂载方式，按我的需求精简重做一版。',
    },
  },
  design: {
    primary: {
      label: '方案可以 · 先搭空架子',
      prompt: '这个方案可以，第一版请先搭一个最小能点开、不白屏的空架子，先不塞复杂逻辑。',
    },
    secondary: {
      label: '再压精简一点',
      prompt: '首版还可以再精简一点，只保留最核心的一项能力：',
    },
  },
  skeleton: {
    primary: {
      label: '架子 OK · 加核心功能',
      prompt: '入口我已经点开确认正常了，现在请只加上最核心的第一个功能：',
    },
    secondary: {
      label: '怎么刷新看效果？',
      prompt: '请告诉我这一步只需要按 Cmd+R 刷新界面，还是需要彻底退出重开 DSH？',
    },
  },
  feature: {
    primary: {
      label: '自查深浅色与窄窗口',
      prompt: '请帮我检查一下当前界面在深色/浅色主题和窄窗口下的排版、对比度与溢出情况。',
    },
    secondary: {
      label: '微调交互与细节',
      prompt: '刚加的功能我看了一眼，想微调一处细节：',
    },
  },
  verify: {
    primary: {
      label: '微调样式与精简度',
      prompt: '我看了一眼当前效果，想微调一下视觉样式和信息精简度：',
    },
    secondary: {
      label: '把踩坑记入经验库',
      prompt: '请把这次制作过程中值得复用的避坑点调用 finder_creator_note 记入插件经验。',
    },
  },
  blocked: {
    primary: {
      label: '先总结试过什么与卡点',
      prompt: '先停一下别改代码了：请用三句话总结刚才试过了什么、具体卡在哪个现象，方便我判断或换新窗口继续。',
    },
  },
});

const SPARK_PATH = 'M10 2.25 11.9 7.1l4.85 1.9-4.85 1.9L10 15.75l-1.9-4.85-4.85-1.9 4.85-1.9L10 2.25Z';
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
    stages: STAGES.map((stage, index) => ({
      ...stage,
      plain: PLAIN[stage.id],
      state: index === furthest ? 'current' : index > furthest ? 'todo' : recorded.has(stage.id) ? 'done' : 'skipped',
    })),
    last: last ? { stage: last.stage, label: LABEL[last.stage], summary: text(last.summary) } : null,
    blocked: last?.stage === 'blocked',
    blockedStep: recordedStep,
    count: rows.length,
    reached: Math.max(0, STAGES.filter((_, index) => index <= furthest).length),
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

/** 将向导引导语安全填入或追加到当前输入框草稿中，绝不覆盖用户未发文字，必要时回退剪贴板。 */
export async function applyCreatorPrompt({ ctx, sessionId, inputActions } = {}, prompt) {
  const value = text(prompt).trim();
  if (!value) return 'noop';
  if (typeof inputActions?.captureInsertion === 'function' && typeof inputActions?.insertText === 'function') {
    try {
      const span = inputActions.captureInsertion();
      const prefix = span && Number.isInteger(span.start) && span.start > 0 && span.start === span.end ? '\n' : '';
      if (inputActions.insertText(prefix + value, span)) {
        try {
          const editor = globalThis.document?.querySelector?.('[data-composer-seat] [contenteditable="true"], [data-composer-seat] textarea');
          editor?.focus?.();
        } catch { /* 聚焦为尽善体验，失败不影响已写入的草稿 */ }
        return 'inserted';
      }
    } catch { /* 回退到底层会话草稿或剪贴板 */ }
  }
  try {
    const binding = sessionId ? ctx?.sessions?.binding?.(sessionId) : null;
    const convInput = binding?.ctx?.get?.('conversation', false)?.input;
    if (typeof convInput?.requestDraftInitialization === 'function') {
      const status = convInput.requestDraftInitialization(binding, {
        prompt: value,
        whenDraftExists: 'append',
        clearPreviousDraft: false,
      });
      if (status === 'applied') return 'inserted';
    }
  } catch { /* 回退到剪贴板 */ }
  try {
    if (typeof globalThis.navigator?.clipboard?.writeText === 'function') {
      await globalThis.navigator.clipboard.writeText(value);
      return 'copied';
    }
  } catch { /* 无剪贴板权限 */ }
  return 'unavailable';
}

const css = `
.pfc_dock, .pfc_closed {
  box-sizing: border-box;
  container-type: inline-size;
  container-name: pfc-dock;
  color-scheme: light dark;
  --pfc_ink: var(--dsw-alias-label-primary, #191b1f);
  --pfc_ink2: var(--dsw-alias-label-secondary, #4b5058);
  --pfc_ink3: var(--dsw-alias-label-tertiary, #868c95);
  --pfc_card: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2, #ffffff));
  --pfc_chip_bg: var(--dsw-alias-fill-l2, rgba(25, 27, 31, 0.05));
  --pfc_chip_hover: var(--dsw-alias-fill-l3, rgba(25, 27, 31, 0.09));
  --pfc_line: var(--dsw-alias-border-l1, rgba(25, 27, 31, 0.08));
  --pfc_line2: var(--dsw-alias-border-l3, rgba(25, 27, 31, 0.16));
  --pfc_accent: var(--dsw-alias-brand-primary, #4b83f0);
  --pfc_build: var(--dsw-alias-state-warn-primary, #d97706);
  --pfc_ok: var(--dsw-alias-state-success-primary, #2fa36b);
  --pfc_primary: var(--dsw-alias-button-primary-fill, #191b1f);
  --pfc_on_primary: var(--dsw-alias-label-primary-inverted, #ffffff);
  --pfc_sans: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif);
  width: calc(100% - var(--dsh-composer-side-clearance, 0px) - var(--dsh-composer-side-clearance, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px));
  max-width: calc(var(--dsh-composer-card-max-width, 768px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px));
  margin: 0 auto 6px;
  border-radius: var(--dsw-radius-lg, 12px);
  border: 1px solid var(--pfc_line);
  background: var(--pfc_card);
  backdrop-filter: var(--dsw-menu-backdrop-filter, blur(16px));
  box-shadow: var(--dsw-elevation-panel, 0 2px 8px rgba(0, 0, 0, 0.06));
  font-family: var(--pfc_sans);
  color: var(--pfc_ink);
  overflow: hidden;
}
:where(.pfc_dock, .pfc_closed)[data-theme="dark"], .dark :where(.pfc_dock, .pfc_closed) {
  --pfc_ink: var(--dsw-alias-label-primary, #eceded);
  --pfc_ink2: var(--dsw-alias-label-secondary, #b5b9bf);
  --pfc_ink3: var(--dsw-alias-label-tertiary, #7e848d);
  --pfc_card: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2, rgba(31, 33, 38, 0.92)));
  --pfc_chip_bg: var(--dsw-alias-fill-l2, rgba(255, 255, 255, 0.07));
  --pfc_chip_hover: var(--dsw-alias-fill-l3, rgba(255, 255, 255, 0.12));
  --pfc_line: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
  --pfc_line2: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
  --pfc_accent: var(--dsw-alias-brand-primary, #6c9ef8);
  --pfc_build: var(--dsw-alias-state-warn-primary, #f0a530);
  --pfc_ok: var(--dsw-alias-state-success-primary, #4cc38a);
  --pfc_primary: var(--dsw-alias-button-primary-fill, #eceded);
  --pfc_on_primary: var(--dsw-alias-label-primary-inverted, #141517);
  box-shadow: var(--dsw-elevation-panel, 0 2px 10px rgba(0, 0, 0, 0.28));
}
@media (prefers-color-scheme: dark) {
  :where(.pfc_dock, .pfc_closed):not([data-theme="light"]) {
    --pfc_ink: var(--dsw-alias-label-primary, #eceded);
    --pfc_ink2: var(--dsw-alias-label-secondary, #b5b9bf);
    --pfc_ink3: var(--dsw-alias-label-tertiary, #7e848d);
    --pfc_card: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2, rgba(31, 33, 38, 0.92)));
    --pfc_chip_bg: var(--dsw-alias-fill-l2, rgba(255, 255, 255, 0.07));
    --pfc_chip_hover: var(--dsw-alias-fill-l3, rgba(255, 255, 255, 0.12));
    --pfc_line: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
    --pfc_line2: var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16));
    --pfc_accent: var(--dsw-alias-brand-primary, #6c9ef8);
    --pfc_build: var(--dsw-alias-state-warn-primary, #f0a530);
    --pfc_ok: var(--dsw-alias-state-success-primary, #4cc38a);
    --pfc_primary: var(--dsw-alias-button-primary-fill, #eceded);
    --pfc_on_primary: var(--dsw-alias-label-primary-inverted, #141517);
  }
}

.pfc_dock[data-compact="true"] { padding: 5px 10px; }
.pfc_dock:not([data-compact="true"]) { padding: 10px 14px; }
.pfc_dock[data-stuck="true"] { border-color: color-mix(in srgb, var(--pfc_build) 52%, var(--pfc_line)); }

.pfc_bar { display: flex; align-items: center; gap: 8px; min-height: 26px; }
.pfc_bar_toggle {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.pfc_bar_toggle:hover:not(:disabled) { background: var(--pfc_chip_bg); }

.pfc_mini_steps { display: inline-flex; align-items: center; gap: 3px; flex: none; }
.pfc_mini_steps i { display: block; width: 14px; height: 4px; border-radius: 999px; background: var(--pfc_line2); }
.pfc_mini_steps .is_done { background: var(--pfc_ok); }
.pfc_mini_steps .is_skipped { background: color-mix(in srgb, var(--pfc_ok) 36%, var(--pfc_line2)); }
.pfc_mini_steps .is_current { background: var(--pfc_accent); }
.pfc_dock[data-stage="verify"][data-running="false"] .pfc_mini_steps .is_current { background: var(--pfc_ok); }
.pfc_dock[data-stuck="true"] .pfc_mini_steps .is_current { background: var(--pfc_build); }
.pfc_mini_steps .is_current.is_running { background: var(--pfc_accent); }

.pfc_badge { font-size: 12px; font-weight: 600; line-height: 18px; color: var(--pfc_ink); white-space: nowrap; flex: none; }
.pfc_hint {
  min-width: 0;
  flex: 1 1 auto;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--pfc_ink2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pfc_bar_actions { display: flex; align-items: center; gap: 4px; flex: none; }

.pfc_chip {
  box-sizing: border-box;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--pfc_line);
  background: var(--pfc_chip_bg);
  color: var(--pfc_ink);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 24px;
  white-space: nowrap;
  cursor: pointer;
}
.pfc_chip:hover:not(:disabled) { background: var(--pfc_chip_hover); border-color: var(--pfc_line2); }
.pfc_chip:disabled { opacity: 0.45; cursor: default; }

.pfc_icon_btn {
  box-sizing: border-box;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pfc_ink3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: none;
}
.pfc_icon_btn:hover:not(:disabled) { background: var(--pfc_chip_bg); color: var(--pfc_ink); }
.pfc_icon_btn:disabled { opacity: 0.45; cursor: default; }

.pfc_hd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 24px; }
.pfc_hd b { font-size: 13px; font-weight: 600; line-height: 20px; color: var(--pfc_ink); }
.pfc_sub { font-size: 12.5px; line-height: 18px; color: var(--pfc_ink2); flex: 1 1 200px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pfc_hd_tools { display: flex; align-items: center; gap: 6px; margin-left: auto; flex: none; }
.pfc_spark { width: 15px; height: 15px; flex: none; color: var(--pfc_accent); }
.pfc_stuck_dot { width: 7px; height: 7px; border-radius: 50%; background: var(--pfc_build); flex: none; }

.pfc_chip_row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.pfc_stuck_note { margin: 6px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--pfc_ink2); }

.pfc_dock .pfc_button, .pfc_closed .pfc_button {
  box-sizing: border-box;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--pfc_line2);
  background: transparent;
  color: var(--pfc_ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
}
.pfc_dock .pfc_button:hover:not(:disabled), .pfc_closed .pfc_button:hover:not(:disabled) { background: var(--pfc_chip_bg); }
.pfc_dock .pfc_button[data-primary="true"] { border-color: var(--pfc_primary); background: var(--pfc_primary); color: var(--pfc_on_primary); }
.pfc_dock .pfc_button[data-primary="true"]:hover:not(:disabled) { opacity: 0.9; background: var(--pfc_primary); }
.pfc_dock .pfc_button:disabled, .pfc_closed .pfc_button:disabled { opacity: 0.45; cursor: default; }

.pfc_dock .pfc_ghost, .pfc_closed .pfc_ghost {
  box-sizing: border-box;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pfc_ink3);
  font: inherit;
  font-size: 12px;
  line-height: 24px;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}
.pfc_dock .pfc_ghost:hover:not(:disabled), .pfc_closed .pfc_ghost:hover:not(:disabled) { background: var(--pfc_chip_bg); color: var(--pfc_ink); }
.pfc_dock .pfc_ghost:disabled, .pfc_closed .pfc_ghost:disabled { opacity: 0.45; cursor: default; }

.pfc_drawer { margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--pfc_line); display: flex; flex-direction: column; gap: 10px; }
.pfc_five { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.pfc_five div { min-width: 0; }
.pfc_five i { display: block; height: 4px; border-radius: 999px; background: var(--pfc_line2); }
.pfc_five .is_done i { background: var(--pfc_ok); }
.pfc_five .is_skipped i { background: color-mix(in srgb, var(--pfc_ok) 36%, var(--pfc_line2)); }
.pfc_five .is_current i { background: var(--pfc_accent); }
.pfc_dock[data-stage="verify"][data-running="false"] .pfc_five .is_current i { background: var(--pfc_ok); }
.pfc_dock[data-stuck="true"] .pfc_five .is_current i { background: var(--pfc_build); }
.pfc_five span { display: block; margin-top: 5px; font-size: 11.5px; line-height: 1.35; color: var(--pfc_ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pfc_five .is_done span { color: var(--pfc_ink2); }
.pfc_five .is_skipped span { color: var(--pfc_ink3); }
.pfc_five .is_current span { color: var(--pfc_ink); font-weight: 600; }
.pfc_meta_note { margin: -2px 0 0; font-size: 11.5px; line-height: 1.45; color: var(--pfc_ink3); }

.pfc_summary { margin: 0; padding: 8px 0 0; border-top: 1px solid var(--pfc_line); font-size: 12.5px; line-height: 1.55; color: var(--pfc_ink2); }
.pfc_lessons { padding-top: 8px; border-top: 1px solid var(--pfc_line); }
.pfc_lessons_hd { font-size: 12px; font-weight: 600; line-height: 18px; color: var(--pfc_ink); }
.pfc_lessons_list { margin: 4px 0 0; padding-left: 16px; list-style: disc; font-size: 12px; line-height: 1.6; color: var(--pfc_ink2); }
.pfc_lessons_list li + li { margin-top: 2px; }

.pfc_drawer_foot {
  padding-top: 8px;
  border-top: 1px solid var(--pfc_line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.pfc_drawer_left, .pfc_drawer_right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.pfc_notice_row { margin-top: 6px; font-size: 12px; line-height: 1.4; color: var(--pfc_ok); }
.pfc_closed {
  padding: 6px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--pfc_ink2);
}
.pfc_closed .pfc_ghost { margin-left: auto; color: var(--pfc_ink); font-weight: 500; }
.pfc_bar_toggle:focus-visible, .pfc_chip:focus-visible, .pfc_icon_btn:focus-visible, .pfc_button:focus-visible, .pfc_ghost:focus-visible {
  outline: 2px solid var(--pfc_accent);
  outline-offset: 2px;
}

@container pfc-dock (max-width: 560px) {
  .pfc_hint { display: none; }
  .pfc_five { gap: 4px; }
  .pfc_five span { font-size: 11px; }
}
@media (prefers-reduced-motion: no-preference) {
  @keyframes pfc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.38; } }
  .pfc_mini_steps .is_current.is_running { animation: pfc-pulse 1.4s ease-in-out infinite; }
  .pfc_mini_steps i, .pfc_five i { transition: background-color 0.2s ease; }
}
`;
export const creatorStripCss = css;

/** 纯展示：v2 精简引导条，保持完全无状态以便 SSR 与单元测试直接驱动。 */
export function createCreatorDock(React) {
  const h = React.createElement;
  const sparkIcon = () => h('svg', { className: 'pfc_spark', viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: SPARK_PATH, stroke: 'currentColor', strokeWidth: '1.5', strokeLinejoin: 'round' }));
  const chevronIcon = open => h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: open ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' }));
  const closeIcon = () => h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('path', { d: 'M4.5 4.5l7 7m0-7l-7 7', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round' }));

  return function CreatorDock({
    mode = 'intro',
    progress = null,
    expanded = false,
    running = false,
    busy = '',
    notice = '',
    onKnow,
    onSkip,
    onToggleExpand,
    onPrompt,
    onOpenNext,
    onClose,
    onSettings,
    onShowSteps,
    onEnable,
    onDismiss,
  }) {
    if (mode === 'closed') {
      return h('div', { className: 'pfc_closed', role: 'status' },
        h('span', null, '已全局关闭创造向导与后台省 Token 经验，新开创造会话不再启用。'),
        notice ? h('span', { className: 'pfc_notice_row', role: 'status' }, notice) : null,
        h('button', { type: 'button', className: 'pfc_ghost', disabled: busy !== '', onClick: onEnable }, '撤销'));
    }

    const stages = progress?.stages ?? [];
    const reached = progress?.reached ?? 0;
    const last = progress?.last ?? null;
    const current = stages.find(stage => stage.state === 'current') ?? stages[Math.min(Math.max(reached - 1, 0), (stages.length || 1) - 1)] ?? STAGES[0];
    const currentId = current?.id || 'search';
    const isExpanded = Boolean(expanded);
    const hasSkipped = stages.some(stage => stage.state === 'skipped');
    const stageTip = (stage, index, isRunning) => {
      const shortLabel = STAGE_SHORT[stage.id] ?? stage.label;
      const stateLabel = stage.state === 'done'
        ? '已完成'
        : stage.state === 'skipped'
          ? '本轮免走（如继续迭代已有插件），无需补做'
          : stage.state === 'current'
            ? (isRunning ? 'AI 正在改动' : '当前步骤')
            : '待进行';
      return `${index + 1}. ${shortLabel} · ${stateLabel}`;
    };
    const metaNote = () => h('p', { className: 'pfc_meta_note' },
      hasSkipped
        ? '来自「发现好插件」· 后台省 Token 引导生效中（点 × 仅收起浮条）· 标「免走」代表老项目迭代或直奔主题，无需回头补做'
        : '来自「发现好插件」· 找现成没合适的就陪你造 · 后台省 Token 引导生效中（点 × 仅收起浮条）');

    const five = () => h('div', {
      className: 'pfc_five',
      role: 'img',
      'aria-label': `五步流程：${stages.map((stage, index) => `${index + 1} ${STAGE_SHORT[stage.id] ?? stage.label}`).join('，')}`,
    }, ...stages.map((stage, index) => {
      const shortLabel = STAGE_SHORT[stage.id] ?? stage.label;
      const tip = stageTip(stage, index, running);
      return h('div', {
        key: stage.id,
        title: tip,
        className: stage.state === 'done' ? 'is_done' : stage.state === 'skipped' ? 'is_skipped' : stage.state === 'current' ? 'is_current' : '',
      }, h('i', null), h('span', { title: tip }, `${index + 1} ${shortLabel}${stage.state === 'skipped' ? ' · 免走' : ''}`));
    }));

    const lessonList = (stageId, label) => {
      const items = STAGE_LESSONS[stageId] ?? STAGE_LESSONS.search;
      return h('div', { className: 'pfc_lessons' },
        h('div', { className: 'pfc_lessons_hd' }, label ? `这一步注意什么 · ${label}` : '这一步注意什么'),
        h('ul', { className: 'pfc_lessons_list' }, ...items.map((item, idx) => h('li', { key: idx }, item))));
    };

    const noticeEl = notice ? h('div', { className: 'pfc_notice_row', role: 'status' }, notice) : null;

    if (mode === 'intro') {
      return h('div', { className: 'pfc_dock', 'data-mode': 'intro', role: 'region', 'aria-label': '发现好插件 · 创造向导' },
        h('div', { className: 'pfc_hd' },
          sparkIcon(),
          h('b', null, '发现好插件 · 创造向导'),
          h('span', { className: 'pfc_sub' }, '没现成插件时陪你按 5 步稳造 · 后台已自动给 AI 开启省 Token 规矩'),
          h('div', { className: 'pfc_hd_tools' },
            typeof onSkip === 'function' ? h('button', { type: 'button', className: 'pfc_ghost', title: '仅隐藏本次起步卡，后台省 Token 引导继续生效', onClick: onSkip }, '这回不用') : null,
            typeof onClose === 'function' ? h('button', { type: 'button', className: 'pfc_ghost', title: '在所有创造会话中同时关闭向导浮条与后台省 Token 经验', disabled: busy !== '', onClick: onClose }, '全局关闭') : null)),
        h('div', { className: 'pfc_chip_row' },
          ...STARTER_CHIPS.map(chip => h('button', {
            key: chip.label,
            type: 'button',
            className: 'pfc_chip',
            title: chip.prompt,
            onClick: () => (onPrompt ? onPrompt(chip.prompt, { fromIntro: true }) : onKnow?.()),
          }, chip.label)),
          !onPrompt && typeof onKnow === 'function' ? h('button', { type: 'button', className: 'pfc_ghost', onClick: onKnow }, '知道了') : null),
        noticeEl);
    }

    if (mode === 'stuck') {
      const blockedStep = progress?.blockedStep;
      const heading = blockedStep ? `卡在第 ${blockedStep} 步` : '这里卡住了';
      const stuckChip = STAGE_CHIPS.blocked.primary;
      return h('div', { className: 'pfc_dock', 'data-mode': 'stuck', 'data-stuck': 'true', 'data-stage': currentId, 'data-running': running ? 'true' : 'false', role: 'region', 'aria-label': '发现好插件 · 卡点止损' },
        h('div', { className: 'pfc_hd' },
          h('i', { className: 'pfc_stuck_dot', 'aria-hidden': 'true' }),
          h('b', null, heading),
          last?.summary ? h('span', { className: 'pfc_sub', title: last.summary }, last.summary) : null,
          h('div', { className: 'pfc_hd_tools' },
            typeof onToggleExpand === 'function' ? h('button', { type: 'button', className: 'pfc_ghost', 'aria-expanded': isExpanded, onClick: onToggleExpand }, isExpanded ? '收起' : '详情') : null,
            h('button', { type: 'button', className: 'pfc_ghost', title: '本次先收起提示，后台省 Token 引导继续生效', onClick: onDismiss }, '先不用'))),
        h('p', { className: 'pfc_stuck_note' }, '同一个问题在长对话里反复改只会越改越乱；把进展和卡点带去新窗口接着做最稳。'),
        h('div', { className: 'pfc_chip_row' },
          h('button', {
            type: 'button',
            className: 'pfc_button',
            'data-primary': 'true',
            disabled: busy !== '',
            onClick: onOpenNext,
            title: '新建一个干净的创造模式窗口，把这里记下的进展带过去',
          }, '开新窗口接着做'),
          h('button', {
            type: 'button',
            className: 'pfc_chip',
            title: stuckChip.prompt,
            onClick: () => onPrompt?.(stuckChip.prompt),
          }, stuckChip.label)),
        isExpanded ? h('div', { className: 'pfc_drawer' },
          five(),
          metaNote(),
          lessonList('blocked', '止损换窗'),
          h('div', { className: 'pfc_drawer_foot' },
            h('div', { className: 'pfc_drawer_right' },
              typeof onSettings === 'function' ? h('button', { type: 'button', className: 'pfc_ghost', onClick: onSettings }, '管理经验库') : null,
              typeof onClose === 'function' ? h('button', { type: 'button', className: 'pfc_ghost', title: '在所有创造会话中同时关闭向导浮条与后台省 Token 经验', disabled: busy !== '', onClick: onClose }, '全局关闭') : null))) : null,
        noticeEl);
    }

    const stepNum = Math.min(Math.max(reached, 1), stages.length || 5);
    const chips = STAGE_CHIPS[currentId] ?? STAGE_CHIPS.search;
    const shortTitle = STAGE_SHORT[currentId] ?? current?.label ?? '进行中';
    const hintText = running ? '正在按你的要求更新，完成后再核对效果' : (STAGE_HINTS[currentId] ?? '');
    const badgeText = running ? `第 ${stepNum}/5 步 · 正在改动…` : `第 ${stepNum}/5 步 · ${shortTitle}`;

    return h('div', {
      className: 'pfc_dock',
      'data-mode': 'run',
      'data-compact': isExpanded ? 'false' : 'true',
      'data-stage': currentId,
      'data-running': running ? 'true' : 'false',
      role: 'region',
      'aria-label': '发现好插件 · 创造向导',
    },
    h('div', { className: 'pfc_bar' },
      h('button', {
        type: 'button',
        className: 'pfc_bar_toggle',
        'aria-expanded': isExpanded,
        onClick: onToggleExpand,
        title: isExpanded ? '收起向导详情' : '点击查看 5 步轨迹与验收锦囊（来自「发现好插件」，后台省 Token 引导生效中）',
      },
      h('span', { className: 'pfc_mini_steps', 'aria-hidden': 'true' }, ...stages.map((stage, index) => h('i', {
        key: stage.id,
        title: stageTip(stage, index, running),
        className: stage.state === 'done'
          ? 'is_done'
          : stage.state === 'skipped'
            ? 'is_skipped'
            : stage.state === 'current'
              ? (running ? 'is_current is_running' : 'is_current')
              : '',
      }))),
      h('span', { className: 'pfc_badge' }, badgeText),
      h('span', { className: 'pfc_hint' }, hintText)),
      h('div', { className: 'pfc_bar_actions' },
        !running && chips.primary ? h('button', {
          type: 'button',
          className: 'pfc_chip',
          title: chips.primary.prompt,
          onClick: () => onPrompt?.(chips.primary.prompt),
        }, chips.primary.label) : null,
        h('button', {
          type: 'button',
          className: 'pfc_icon_btn',
          'aria-expanded': isExpanded,
          'aria-label': isExpanded ? '收起向导详情' : '展开向导详情',
          title: isExpanded ? '收起向导详情' : '展开阶段与锦囊',
          onClick: onToggleExpand,
        }, chevronIcon(isExpanded)),
        typeof onDismiss === 'function' ? h('button', {
          type: 'button',
          className: 'pfc_icon_btn',
          'aria-label': '本会话收起向导',
          title: '本次对话先收起浮条（后台省 Token 引导继续生效）',
          onClick: onDismiss,
        }, closeIcon()) : null)),
    isExpanded ? h('div', { className: 'pfc_drawer' },
      five(),
      metaNote(),
      last?.summary ? h('p', { className: 'pfc_summary' }, `最近记录：${last.summary}`) : null,
      lessonList(currentId, shortTitle),
      h('div', { className: 'pfc_drawer_foot' },
        h('div', { className: 'pfc_drawer_left' },
          chips.secondary ? h('button', {
            type: 'button',
            className: 'pfc_chip',
            title: chips.secondary.prompt,
            onClick: () => onPrompt?.(chips.secondary.prompt),
          }, chips.secondary.label) : null,
          typeof onOpenNext === 'function' ? h('button', {
            type: 'button',
            className: 'pfc_chip',
            disabled: busy !== '',
            onClick: onOpenNext,
          }, '带进展换新窗口') : null),
        h('div', { className: 'pfc_drawer_right' },
          typeof onShowSteps === 'function' ? h('button', { type: 'button', className: 'pfc_ghost', onClick: onShowSteps }, '查看起步模板') : null,
          typeof onSettings === 'function' ? h('button', { type: 'button', className: 'pfc_ghost', onClick: onSettings }, '管理经验库') : null,
          typeof onClose === 'function' ? h('button', { type: 'button', className: 'pfc_ghost', title: '在所有创造会话中同时关闭向导浮条与后台省 Token 经验', disabled: busy !== '', onClick: onClose }, '全局关闭') : null))) : null,
    noticeEl);
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
    const [expanded, setExpanded] = React.useState(false);
    const [running, setRunning] = React.useState(false);
    const [turnEnds, setTurnEnds] = React.useState(0);
    // 记录关闭时的步数；只有之后新产生卡点步骤时才自动重新冒头打扰。
    const [dismissedAt, setDismissedAt] = React.useState(-1);
    const [manualIntro, setManualIntro] = React.useState(false);
    const [introOpen, setIntroOpen] = React.useState(() => {
      try {
        const store = globalThis.localStorage;
        return store?.getItem(`finder.creator.intro.${text(props?.sessionId)}`) !== '1'
          && store?.getItem(`finder.creator.skip.${text(props?.sessionId)}`) !== '1';
      } catch { return true; }
    });
    const noticeTimerRef = React.useRef(null);
    const showNotice = React.useCallback(message => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      setNotice(message);
      if (message) noticeTimerRef.current = setTimeout(() => { noticeTimerRef.current = null; setNotice(''); }, 2400);
    }, []);
    React.useEffect(() => () => { if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current); }, []);

    const dismissIntro = hideForever => {
      try {
        globalThis.localStorage?.setItem(hideForever ? `finder.creator.skip.${sessionId}` : `finder.creator.intro.${sessionId}`, '1');
      } catch { /* 无痕模式就只在本次渲染生效 */ }
      setIntroOpen(false);
      setManualIntro(false);
    };

    React.useEffect(() => {
      setPreset(presetOf(ctx, sessionId));
      setExpanded(false);
      setDismissedAt(-1);
      setManualIntro(false);
      setRunning(false);
      setTurnEnds(0);
      setNotice('');
      try {
        const store = globalThis.localStorage;
        setIntroOpen(store?.getItem(`finder.creator.intro.${sessionId}`) !== '1' && store?.getItem(`finder.creator.skip.${sessionId}`) !== '1');
      } catch { setIntroOpen(true); }
      const face = (() => { try { return ctx.sessions?.binding?.(sessionId)?.session?.projections?.faceOf?.('agentPreset'); } catch { return null; } })();
      const stop = typeof face?.subscribe === 'function' ? face.subscribe(() => setPreset(presetOf(ctx, sessionId))) : null;
      return () => { if (typeof stop === 'function') stop(); };
    }, [sessionId]);

    const creator = preset === CREATOR_PRESET;
    React.useEffect(() => {
      if (!creator || !sessionId) return undefined;
      let live = true, timer = null, seen = -1;
      const load = () => {
        void request('creator-session', { sessionId })
          .then(value => { if (live) setData(value); })
          .catch(() => { if (live) setData(current => current ?? { enabled: true, steps: [] }); });
      };
      load();
      const source = (() => { try { return ctx.sessions?.binding?.(sessionId)?.eventSource; } catch { return null; } })();
      const scan = () => {
        const entries = source?.getSnapshot?.()?.entries;
        if (!Array.isArray(entries)) return { signalCount: 0, endedCount: 0, isRunning: false };
        let signalCount = 0;
        let endedCount = 0;
        let lastTurnType = '';
        for (const entry of entries) {
          const event = entry?.event;
          if (entry?.type !== 'event') continue;
          if (event?.type === 'turn/start') { lastTurnType = 'turn/start'; continue; }
          if (event?.type === 'turn/end') {
            lastTurnType = 'turn/end';
            endedCount += 1;
            signalCount += 1;
            continue;
          }
          if (event?.type === 'tool/call' && event.data?.name === 'finder_creator_step') signalCount += 1;
        }
        return { signalCount, endedCount, isRunning: lastTurnType === 'turn/start' };
      };
      const check = () => {
        const next = scan();
        setRunning(next.isRunning);
        setTurnEnds(next.endedCount);
        if (next.signalCount === seen) return;
        seen = next.signalCount;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; load(); }, 900);
      };
      const stop = typeof source?.subscribe === 'function' ? source.subscribe(check) : null;
      check();
      return () => { live = false; if (timer) clearTimeout(timer); if (typeof stop === 'function') stop(); };
    }, [creator, sessionId]);

    if (!creator || !data) return null;
    const enable = () => {
      setBusy('enable');
      void request('creator-configure', { enabled: true })
        .then(() => { setClosedHere(false); setData(current => ({ ...(current ?? {}), enabled: true })); })
        .catch(() => showNotice('没有重新开启，请稍后再试。'))
        .finally(() => setBusy(''));
    };
    if (closedHere) return h(Dock, { mode: 'closed', busy, notice, onEnable: enable });
    if (data.enabled === false) return null;

    const progress = creatorProgress(data.steps);
    const openNext = () => {
      setBusy('next'); showNotice('');
      void openCreatorContinuation(ctx, sessionId, creatorHandoffPrompt(data.steps))
        .then(result => { if (result.draft !== 'applied') showNotice('新窗口已打开，交接内容没能放进输入框，可以手动说明进展。'); })
        .catch(error => showNotice(error?.safeForUser ? error.message : '没能开新窗口，请从左侧新建创造模式会话。'))
        .finally(() => setBusy(''));
    };
    const close = () => {
      setBusy('close'); showNotice('');
      void request('creator-configure', { enabled: false })
        .then(() => setClosedHere(true))
        .catch(() => showNotice('没有关闭成功，请稍后再试。'))
        .finally(() => setBusy(''));
    };
    const handlePrompt = (prompt, opts = {}) => {
      void applyCreatorPrompt({ ctx, sessionId, inputActions: props?.inputActions }, prompt).then(status => {
        if (opts.fromIntro) dismissIntro(false);
        if (status === 'copied') showNotice('已复制引导话术，可直接粘贴到输入框');
        else if (status === 'unavailable') showNotice('暂时写入不到输入框，请先点一下输入框再试');
        else if (status === 'inserted' && !opts.fromIntro) showNotice('已填入输入框，补充细节即可发送');
      });
    };

    // 普通闲聊首轮结束后（还没记过创造步骤），自动退场不打扰；手动点「查看起步模板」时重新展开。
    if (!progress.count && !manualIntro && (!introOpen || turnEnds > 0)) return null;
    const isDismissed = dismissedAt >= 0 && !(progress.blocked && progress.count > dismissedAt);
    if (isDismissed && !manualIntro) return null;

    const mode = manualIntro ? 'intro' : progress.blocked ? 'stuck' : progress.count ? 'run' : 'intro';
    return h(Dock, {
      mode,
      progress,
      expanded,
      running,
      busy,
      notice,
      onKnow: () => dismissIntro(false),
      onSkip: () => dismissIntro(true),
      onToggleExpand: () => setExpanded(v => !v),
      onPrompt: handlePrompt,
      onShowSteps: () => { setExpanded(false); setManualIntro(true); setIntroOpen(true); },
      onOpenNext: openNext,
      onClose: close,
      onDismiss: () => { setExpanded(false); setManualIntro(false); setDismissedAt(progress.count); },
      onSettings: typeof openSettings === 'function' ? openSettings : null,
      onEnable: enable,
    });
  };
}
