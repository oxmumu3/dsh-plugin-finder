// Evidence and editorial boundaries: docs/research/2026-10-22-creation-guidance.md.
// Rendering is local and side-effect free. Only the explicit draft action starts
// the existing creation workflow; this module owns neither models nor sessions.
const officialCommit = '687f282e8625c6b8d11ff58211a90524be2e4317';
const officialRoot = `https://github.com/deepseek-ai/deepseek-harness/blob/${officialCommit}/packages/preset/agent-preset/skills/cordis-plugin-development`;
const twinRelease = 'https://github.com/oxmumu3/ai-twin-starter/releases/tag/v0.3.0';
const text = value => typeof value === 'string' ? value.trim() : '';
const objects = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];

export function renderCreationGuide({ h, state, controller, busy = false }) {
  const sources = [...objects(state.discovery?.sources), ...objects(state.discovery?.sourceCoverage)];
  const incomplete = state.discovery?.status === 'failed' || sources.some(source => ['failed', 'stale'].includes(source.status));
  const searched = sources.some(source => ['live', 'cached'].includes(source.status));
  const existing = ['native', 'single', 'combo'].includes(state.plan?.kind);
  const need = text(state.intent?.goal) || text(state.request);
  const reason = incomplete
    ? '搜索未完成，暂不能判断现成方案是否足够。可以先重试搜索；如果你已经希望定制，也可以把待核对的部分带入草案。'
    : existing
      ? '已有可尝试的现成方案。你可以回去继续使用，也可以按自己的流程定制；起草时会先评估配置或扩展，再决定是否新建。'
      : searched
        ? '本次已返回的来源中，方案仍有需要补齐的部分。先判断能否配置或扩展现成能力，再决定是否新建。'
        : '搜索范围与结果还需核对。你可以回看方案或重新搜索，也可以先围绕自己的流程起草定制方向。';
  const button = (label, onClick, extra = {}) => h('button', { type: 'button', className: 'pf_btn', disabled: busy, onClick, ...extra }, label);
  const link = (label, href) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label);
  const details = (label, ...children) => h('details', { className: 'pf_details' }, h('summary', null, label), ...children);
  const paragraph = value => h('p', { className: 'pf_small pf_muted' }, value);
  const canDraft = Boolean(state.taskId && state.revisionId && state.plan && state.bootstrap?.model?.configured !== false);

  return h('div', { className: 'pf_creation_guide', 'aria-label': '创作引导' },
    h('section', { className: 'pf_section' },
      h('div', { className: 'pf_section_head' }, h('h2', null, '一起创造，先做能用的第一版'),
        button('回看现成方案', () => controller.showFind())),
      h('div', { className: 'pf_plan' }, h('strong', null, '这次想完成'),
        h('p', { className: 'pf_preline' }, need ? need.length > 300 ? `${need.slice(0, 300)}…` : need : '先回到找方案，描述你想完成的任务。')),
      h('p', { className: incomplete ? 'pf_banner pf_small' : 'pf_muted', ...(incomplete ? { role: 'status' } : {}) }, reason),
      incomplete || !searched ? button('重新找方案', () => { controller.showFind(); return controller.recommend(); }, { disabled: busy || !state.intent }) : null),

    h('section', { className: 'pf_section' }, h('h2', null, 'DeepSeek 插件能帮你做什么'),
      h('ul', { className: 'pf_list' },
        h('li', null, h('strong', null, '做一个侧栏工作台。'), ' 把列表、筛选、表单和结果放在 Harness 里，适合重复使用的任务。'),
        h('li', null, h('strong', null, '让 Agent 调用专用工具。'), ' 为统计、检索或处理材料定义清楚的输入、输出和失败提示。'),
        h('li', null, h('strong', null, '保存本机进度。'), ' 单独保存标签、状态和设置；读取材料时可把原文设为只读。'),
        h('li', null, h('strong', null, '连接外部服务。'), ' 接入需要的 API 或 MCP；按实际账号、授权和可用能力确定范围。'),
        h('li', null, h('strong', null, '沿用宿主已有模型。'), ' 共创蓝图使用 DSH 当前模型配置，无需另填模型 Key，按已有方式消耗用量。')),
      paragraph('能力依据：DSH 0.2.1-rc.2 · 2026-10-22 核查。具体接口仍要按你安装的版本确认。'),
      details('查看官方依据与版本边界',
        paragraph(`官方固定提交：${officialCommit}。Creator 会先检查宿主可用接口，再制作可安装的插件包。`),
        h('ul', { className: 'pf_list pf_small' },
          h('li', null, link('官方 Creator 开发说明', `${officialRoot}/SKILL.md`)),
          h('li', null, link('界面插槽与宿主风格', `${officialRoot}/references/ui-plugin.md`)),
          h('li', null, link('工具、状态与扩展实践', `${officialRoot}/references/practices.md`)),
          h('li', null, link('界面操作与 Agent 工具', `${officialRoot}/references/user-actions.md`))),
        paragraph('Finder 已核验 0.2.1-rc.2 的官方 Creator 接续；0.2.0-rc.2 与未知版本保留复制蓝图、手动选择 Creator 的路径。模型沿用方式另见本项目能力审计与 src/model.js。'),
        paragraph('插件安装会影响当前 profile 内的会话；Host 代码在宿主进程中运行。完成蓝图后仍要核对权限、审查实现，再由原生插件管理器处理安装。'))),

    h('section', { className: 'pf_section' }, h('h2', null, '两个可以借鉴的例子'),
      h('div', { className: 'pf_candidates' },
        h('article', { className: 'pf_history_card' },
          h('h3', null, '把 Markdown 目录变成阅读列表'),
          h('p', { className: 'pf_tag' }, '合成样例 · 已实跑'),
          h('p', { className: 'pf_small' }, '从选定目录读取文章，单独记录标题、主题和阅读状态，再筛选和预览原文。'),
          paragraph('可借鉴：原文保持只读，进度单独保存；先验证一条完整的阅读流程。'),
          details('查看样例的验证范围',
            paragraph('dsh-reading-shelf-fixture@0.1.0 · 2026-10-22。本地 Creator 生成的合成样例已验证元信息保存、筛选、只读预览与 Refresh 后读取；两份 Markdown 的哈希和修改时间未变。'),
            paragraph('本轮用手工绝对路径选择目录；目录选择器仍未验证。尚未验证重启恢复、长期稳定性或外部用户接受。'),
            paragraph('本机记录：docs/creator-preview.md 与 docs/verification.md。'))),
        h('article', { className: 'pf_history_card' },
          h('h3', null, '把项目材料整理成 AI 分身'),
          h('p', { className: 'pf_tag' }, 'Agent Twin 0.3.0 · 预发布'),
          h('p', { className: 'pf_small' }, '先选择材料，再整理有出处的知识、判断和工作方法，并单独核对通道和权限。'),
          paragraph('可借鉴：每条判断保留来源与缺口。此处仅核验发行资产与文档，功能需要独立验证。'),
          details('查看发行来源与适用边界',
            h('p', { className: 'pf_small' }, link('Agent Twin 0.3.0 预发布记录', twinRelease)),
            paragraph('2026-10-22 已读回仓库归属 oxmumu3，以及 0.3.0 预发布的 tgz 和校验文件。目标为 DSH 0.2.1-rc.2、Node.js 22+。'),
            paragraph('真实消息通道、业务执行和持续运行仍需另行验收；发行记录不能代替这些结果。'))))),

    h('section', { className: 'pf_section' }, h('h2', null, '首版这样做，更容易验证'),
      h('ol', { className: 'pf_list' },
        h('li', null, h('strong', null, '只选一个核心任务。'), ' 说清输入是什么、完成后得到什么；先复用已有能力。'),
        h('li', null, h('strong', null, '把权限和数据范围写清楚。'), ' 先限定一个目录或账号；原文只读，新增记录单独保存，写入或发送单独确认。'),
        h('li', null, h('strong', null, '约定可检查的验收。'), ' 用一份样例走完输入到结果，检查保存后能否读回，以及失败时是否说明原因。')),
      h('div', { className: 'pf_actions' }, button('用我的需求起草', () => controller.startCreation(), { className: 'pf_btn pf_primary', disabled: busy || !canDraft })),
      paragraph('点击后调用 DSH 已有模型，生成可修改的首版蓝图，再由你确认范围并接续官方 Creator。')));
}
