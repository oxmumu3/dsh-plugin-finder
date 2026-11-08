// 创造模式经验包：装了「发现好插件」后，官方创造模式（cordis）会话自动按省 Token 的顺序干活。
//
// Host 只做三件事：
//   1. 给创造模式会话加一段简短、文字固定的经验提示（其他会话拿到空文本，段落自动消失）；
//   2. 给创造模式会话挂三个工具：读完整经验、记入插件经验、记录当前阶段（when 条件按每一步判断）；
//   3. 保存开关、用户经验和每个会话的阶段记录，供面板和输入框上方的进度条读取。
// 不改官方创造模式本身，不加审批、不拦截工具；用户可随时在面板或进度条上关闭。
import {FinderError} from './contracts.js';

export const CREATOR_PRESET = 'cordis';
export const CREATOR_SECTION = 'finder:creator-assist';
export const CREATOR_MARKER = '【发现好插件 · 创造经验】';
export const CREATOR_TOOLS = Object.freeze({guide: 'finder_creator_guide', note: 'finder_creator_note', step: 'finder_creator_step'});
export const CREATOR_STAGES = Object.freeze(['search', 'design', 'skeleton', 'feature', 'verify', 'blocked']);
const STAGE_LABEL = {search: '查现成', design: '定设计', skeleton: '空架子', feature: '加功能', verify: '验证', blocked: '卡住了'};
const ID = /^[A-Za-z0-9_.:-]{1,200}$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const MAX_NOTES = 100, MAX_NOTE = 500, MAX_STEPS = 20, MAX_SUMMARY = 300;

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clean = (value, max) => typeof value === 'string' ? value.replace(CONTROL, '').trim().slice(0, max) : '';
const fail = code => { throw new FinderError(code); };

/** 写进每个创造模式请求的经验提示：保持短、文字固定（只随已存经验条数变化），以便命中请求缓存。 */
export function renderCreatorPrompt(noteCount = 0) {
  return [
    `${CREATOR_MARKER}这是创造模式会话，用户装了「发现好插件」并开启了创造经验。按下面的顺序做，能少走弯路、少花 Token：`,
    '1. 先查现成：用户说出需求后，先用 finder_search 查社区现成插件。有合适的先推荐给用户选；用户说要自己做，再继续。',
    '2. 先对齐设计：写代码前，用三五句大白话说清准备挂在哪个位置、分几个文件、数据存在哪，等用户确认。',
    `3. 开工前读经验：调用 ${CREATOR_TOOLS.guide}，读取完整避坑清单${noteCount > 0 ? `和用户以前记下的 ${noteCount} 条经验` : ''}。`,
    '4. 先跑空架子：第一版只做能点开、不白屏的最小入口；之后每轮只加一个功能。',
    '5. 说清怎么看效果：只改了界面，告诉用户按 Cmd+R 刷新；加了工具、改了后台或重装同名插件，告诉用户彻底退出再打开 DSH。',
    '6. 卡住就止损：同一个问题连续改 3 轮还没好，停下来总结试过什么、卡在哪里，建议用户点输入框上方的「开新窗口接着做」。',
    `每进入一个新阶段，调用 ${CREATOR_TOOLS.step} 记一笔，输入框上方的进度条会跟着更新。用户说「记入插件经验：……」时，调用 ${CREATOR_TOOLS.note} 保存。这些是建议做法，用户的明确要求优先。`,
  ].join('\n');
}

/** 按需读取的完整经验：来自作者连做多个插件的实测记录，不随每次请求发送。 */
export const CREATOR_GUIDE = [
  '## 动手前',
  '- 先调 cordis_inspect_list / cordis_inspect_query 查清当前宿主的展位（slot）、服务签名和主题变量，不凭记忆猜接口名。',
  '- 找一个结构最接近的内置插件或本机已有插件照着改：目录结构、注册方式、样式变量都抄现成的。',
  '- 先给用户三五句话的设计（挂哪、几个文件、数据存哪），确认后再写。',
  '',
  '## 写的时候',
  '- 第一版只做能点开、不白屏的空架子，再一轮加一个功能。',
  '- 不要在独立面板（main）里自己画聊天输入框：main 没有 inputActions，也没有多轮记忆。对话优先挂到 conversation.view，或嵌入原生会话组件；新页面只负责展示和整理。',
  '- main 根容器用 flex: 1 1 0; height: 100%; min-height: 0，不要用 position: absolute; inset: 0，否则会盖住左侧栏回不去。',
  '- 颜色只用宿主的 --dsw-alias-* 变量，不引用宿主内部 UI 包。',
  '- connection.fetch.register 要在 inject 里声明 connection，路径以 /api/ 开头，写明 requestBody: \'buffered\'，不要包在 ctx.effect() 里。',
  '- 工具参数里的可选字段直接省略 required，不要写 required: false，否则宿主会拒绝注册。',
  '',
  '## 看效果和排错',
  '- 只改了前端界面：按 Cmd+R（Windows 按 Ctrl+R）刷新。',
  '- 改了后台 index.js、加了工具或重装同名插件：彻底退出再打开 DSH。',
  '- 同一个错误连续改 3 轮没好：停下总结「试过什么、卡在哪」，开新窗口带着总结继续，别在越来越长的上下文里硬磨。',
].join('\n');

function stageInput(value) {
  if (!record(value) || Object.keys(value).some(key => !['stage', 'summary'].includes(key))) fail('INVALID_INPUT');
  if (!CREATOR_STAGES.includes(value.stage)) fail('INVALID_INPUT');
  const summary = clean(value.summary, MAX_SUMMARY);
  if (!summary) fail('INVALID_INPUT');
  return {stage: value.stage, summary};
}

/**
 * store: {
 *   readEnabled(): boolean|undefined, writeEnabled(boolean),
 *   listNotes(): rows, putNote(row), deleteNote(id),
 *   listSteps(): rows, putSteps(row)
 * }  row = { id, serialized }
 * presetOf(agent): 当前会话的 Agent preset id，读不到返回 null。
 */
export function createCreatorAssist({store, presetOf, now = () => new Date(), newId = () => `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`} = {}) {
  if (!store || typeof presetOf !== 'function') throw new TypeError('creator assist store required');
  let enabled = store.readEnabled() !== false;
  const notes = new Map(), steps = new Map();
  for (const row of store.listNotes() ?? []) {
    try { const value = JSON.parse(row.serialized); if (record(value) && typeof value.text === 'string' && ID.test(value.id)) notes.set(value.id, value); } catch { /* 跳过损坏记录 */ }
  }
  for (const row of store.listSteps() ?? []) {
    try { const value = JSON.parse(row.serialized); if (record(value) && ID.test(value.sessionId) && Array.isArray(value.steps)) steps.set(value.sessionId, value); } catch { /* 跳过损坏记录 */ }
  }
  let prompt = renderCreatorPrompt(notes.size);
  const refreshPrompt = () => { prompt = renderCreatorPrompt(notes.size); };
  const isCreator = agent => {
    if (!enabled || typeof agent?.id !== 'string') return false;
    try { return presetOf(agent) === CREATOR_PRESET; } catch { return false; }
  };
  const noteList = () => [...notes.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const sessionView = sessionId => {
    const value = steps.get(sessionId);
    return {sessionId, steps: value ? value.steps.map(item => ({...item, label: STAGE_LABEL[item.stage]})) : []};
  };

  return Object.freeze({
    isEnabled: () => enabled,
    isCreator,
    sectionText(context) {
      const agent = context?.agent ?? context?.scope;
      return isCreator(agent) ? prompt : '';
    },
    guideText() {
      const saved = noteList();
      return saved.length ? `${CREATOR_GUIDE}\n\n## 你以前记下的经验\n${saved.map(item => `- ${item.text}`).join('\n')}` : CREATOR_GUIDE;
    },
    async setEnabled(value) {
      if (typeof value !== 'boolean') fail('INVALID_INPUT');
      await store.writeEnabled(value);
      enabled = value;
      return {enabled};
    },
    async addNote(text) {
      const value = clean(text, MAX_NOTE);
      if (!value) fail('INVALID_INPUT');
      const duplicate = [...notes.values()].find(item => item.text === value);
      if (duplicate) return {note: duplicate, count: notes.size, duplicate: true};
      if (notes.size >= MAX_NOTES) fail('INVALID_INPUT');
      const note = {id: newId(), text: value, createdAt: now().toISOString()};
      await store.putNote({id: note.id, serialized: JSON.stringify(note)});
      notes.set(note.id, note);
      refreshPrompt();
      return {note, count: notes.size, duplicate: false};
    },
    async deleteNote(id) {
      if (typeof id !== 'string' || !ID.test(id)) fail('INVALID_INPUT');
      if (!notes.has(id)) return {deleted: false, count: notes.size};
      await store.deleteNote(id);
      notes.delete(id);
      refreshPrompt();
      return {deleted: true, count: notes.size};
    },
    async recordStep(sessionId, input) {
      if (typeof sessionId !== 'string' || !ID.test(sessionId)) fail('INVALID_INPUT');
      const step = {...stageInput(input), at: now().toISOString()};
      const previous = steps.get(sessionId)?.steps ?? [];
      const next = {sessionId, steps: [...previous, step].slice(-MAX_STEPS)};
      await store.putSteps({id: sessionId, serialized: JSON.stringify(next)});
      steps.set(sessionId, next);
      return {count: next.steps.length, label: STAGE_LABEL[step.stage]};
    },
    settings: () => ({enabled, notes: noteList()}),
    session(input = {}) {
      if (!record(input) || typeof input.sessionId !== 'string' || !ID.test(input.sessionId)) fail('INVALID_INPUT');
      return {enabled, ...sessionView(input.sessionId)};
    },
  });
}

/** 注册经验提示段与三个创造模式工具；全部只对开启状态下的创造模式会话生效。 */
export function registerCreatorAssist(ctx, assist, {defineTool} = {}) {
  if (typeof defineTool !== 'function' || typeof ctx?.tools?.register !== 'function' || typeof ctx?.systemPrompt?.section !== 'function') throw new TypeError('creator assist host unavailable');
  const disposers = [];
  const release = () => { for (const dispose of disposers.splice(0).reverse()) try { dispose(); } catch { /* 其余注册仍须释放 */ } };
  const when = ({agent} = {}) => assist.isCreator(agent);
  const guard = exec => { if (!assist.isCreator(exec?.agent)) throw new Error('这个工具只在开启了「发现好插件」创造经验的创造模式会话中可用，未执行。'); };
  const text = {schema: {type: 'string'}, render: (_args, value) => [{type: 'text', text: value}]};
  try {
    disposers.push(ctx.systemPrompt.section({name: CREATOR_SECTION, order: 5120, interpolate: false, text: context => assist.sectionText(context)}));
    disposers.push(ctx.tools.register(defineTool({
      name: CREATOR_TOOLS.guide,
      description: '读取「发现好插件」整理的创造模式完整避坑清单，以及用户以前记下的插件经验。开始写插件前调用一次即可。只读。',
      parameters: {},
      output: text,
      async execute(_args, exec) { guard(exec); return assist.guideText(); },
      presentCall: () => ({card: 'generic', title: '读取创造经验', kind: 'read'}),
    }), {when}));
    disposers.push(ctx.tools.register(defineTool({
      name: CREATOR_TOOLS.note,
      description: '把一条插件开发经验存进「发现好插件」，之后所有创造模式会话都能读到。只在用户明确说「记入插件经验」或同意保存时调用；不要自作主张保存。',
      parameters: {text: {type: 'string', required: true, description: '一条经验，一句到三句话，最多500字。写清楚在什么情况下、该怎么做。'}},
      output: text,
      async execute(args, exec) {
        guard(exec);
        const result = await assist.addNote(args.text);
        return result.duplicate ? `这条经验已经存过，现有 ${result.count} 条。` : `已记入插件经验，现有 ${result.count} 条；之后新开的创造模式会话都会读到。`;
      },
      presentCall: args => ({card: 'generic', title: '记入插件经验', kind: 'other', rawInput: args}),
    }), {when}));
    disposers.push(ctx.tools.register(defineTool({
      name: CREATOR_TOOLS.step,
      description: '记录这次创造进行到哪一步，更新输入框上方的进度条。进入新阶段时调用：search=查现成插件，design=设计已确认，skeleton=空架子跑通，feature=新增了一个功能，verify=已安装并核对效果，blocked=同一问题卡住。',
      parameters: {
        stage: {type: 'string', required: true, enum: [...CREATOR_STAGES], description: '当前阶段。'},
        summary: {type: 'string', required: true, description: '一句话说明这一步的结果或卡点，最多300字；开新窗口时会作为交接内容。'},
      },
      output: text,
      async execute(args, exec) {
        guard(exec);
        const result = await assist.recordStep(exec.agent.id, args);
        return `已记录「${result.label}」。`;
      },
      presentCall: args => ({card: 'generic', title: `创造进度：${STAGE_LABEL[args?.stage] ?? '更新'}`, kind: 'other', rawInput: args}),
    }), {when}));
  } catch (cause) { release(); throw cause; }
  ctx.effect?.(() => release);
  return release;
}

/** 从 Host 的 preset 注册表读取会话所属的 Agent preset；读不到时返回 null，不猜测。 */
export function hostPresetReader(ctx) {
  return agent => {
    let presets;
    try { presets = ctx.get?.('agentPresets', false); } catch { presets = undefined; }
    if (typeof presets?.presetForSession !== 'function' || !agent?.session) return null;
    return presets.presetForSession(agent.session) ?? null;
  };
}
