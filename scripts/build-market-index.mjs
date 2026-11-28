import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'index.json');
const AUTHOR = '牛村木木山';

const unixSeconds = iso => Math.floor(Date.parse(iso) / 1000);
const svgDataUri = svg => `data:image/svg+xml;base64,${Buffer.from(svg.trim(), 'utf8').toString('base64')}`;

const ICONS = Object.freeze({
  dot: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="DSH Dot">
  <rect width="64" height="64" rx="14" fill="#182230"/>
  <circle cx="32" cy="32" r="15" fill="none" stroke="#60a5fa" stroke-width="4"/>
  <circle cx="32" cy="32" r="5.5" fill="#f8fafc"/>
</svg>`),
  superagent: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="DSH Super Agent">
  <rect width="64" height="64" rx="14" fill="#1e293b"/>
  <rect x="13" y="16" width="10" height="32" rx="3.5" fill="#60a5fa"/>
  <rect x="27" y="16" width="10" height="22" rx="3.5" fill="#f59e0b"/>
  <rect x="41" y="16" width="10" height="28" rx="3.5" fill="#34d399"/>
</svg>`),
  family: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Lele Family Assistant">
  <rect width="64" height="64" rx="14" fill="#1f4d3a"/>
  <path d="M16 33 32 19l16 14" fill="none" stroke="#f7f4ec" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M21 31v15h22V31" fill="none" stroke="#f7f4ec" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="32" cy="37.5" r="3.5" fill="#d8b989"/>
</svg>`),
  learn: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Incidental Learn Coach">
  <rect width="64" height="64" rx="14" fill="#2b2620"/>
  <path d="M17 22c5-2 10-1 15 2 5-3 10-4 15-2v23c-5-2-10-1-15 2-5-3-10-4-15-2V22Z" fill="none" stroke="#f5efe6" stroke-width="3" stroke-linejoin="round"/>
  <path d="M32 24v23" stroke="#e5a93b" stroke-width="2.6" stroke-linecap="round"/>
</svg>`),
  twin: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJBSSDliIbouqvlt6XkvZzlj7AiPgogIDxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjE0IiBmaWxsPSIjMjQ1OTQ3Ii8+CiAgPHJlY3QgeD0iNiIgeT0iNiIgd2lkdGg9IjUyIiBoZWlnaHQ9IjUyIiByeD0iMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2Y2ZjVmMCIgc3Ryb2tlLW9wYWNpdHk9IjAuMjQiIHN0cm9rZS13aWR0aD0iMS41Ii8+CiAgPGNpcmNsZSBjeD0iMjQiIGN5PSIyNiIgcj0iOC41IiBmaWxsPSJub25lIiBzdHJva2U9IiNmNmY1ZjAiIHN0cm9rZS13aWR0aD0iMyIvPgogIDxwYXRoIGQ9Ik0xMy41IDQ3YzAtNi4yIDQuNy0xMC41IDEwLjUtMTAuNVMzNC41IDQwLjggMzQuNSA0NyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZjZmNWYwIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxjaXJjbGUgY3g9IjQzLjUiIGN5PSIyNC41IiByPSI2LjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2Q4Yjk4OSIgc3Ryb2tlLXdpZHRoPSIyLjUiLz4KICA8cGF0aCBkPSJNMzYgNDUuNWMuOC00LjggNC03LjggOC03LjggMy42IDAgNi41IDIuNSA3LjUgNi44IiBmaWxsPSJub25lIiBzdHJva2U9IiNkOGI5ODkiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9zdmc+Cg==',
  memory: svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Dot Memory Bus">
  <rect width="64" height="64" rx="14" fill="#1b2638"/>
  <rect x="14" y="16" width="36" height="32" rx="8" fill="none" stroke="#e2e8f0" stroke-width="3.2"/>
  <path d="M22 26.5h20M22 34.5h13" stroke="#e2e8f0" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="42" cy="36.5" r="4.2" fill="#38bdf8"/>
</svg>`),
});

function versionEntry({ version, publishedAt, dsh }) {
  return {
    version,
    publishTimestamp: unixSeconds(publishedAt),
    source: { type: 'npm' },
    engines: { dsh },
  };
}

/**
 * Build the official DSH `format: 1` plugin market index document for the `@oxmumu3/*` suite.
 * @returns {Promise<Record<string, unknown>>} Validated index object ready for `index.json`.
 */
export async function buildMarketIndex() {
  const finderPkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const finderIconSvg = await fs.readFile(path.join(ROOT, 'icon.svg'));
  const finderIconUrl = `data:image/svg+xml;base64,${finderIconSvg.toString('base64')}`;

  return {
    format: 1,
    title: {
      en: 'Oxmumu3 Curated DSH Plugins',
      zh: '发现好插件 · 自研精选索引',
    },
    description: {
      en: 'Curated, local-first DeepSeek Harness plugins from @oxmumu3 with npm Provenance releases and dual 0.2.2 / 0.2.3-alpha.2 compatibility.',
      zh: '牛村木木山自研精选 DeepSeek Harness 插件索引：全部开源于 GitHub、通过 npm OIDC 签名发布，主力插件双兼容 0.2.2 与 0.2.3-alpha.2。',
    },
    metadata: {
      categories: {
        discovery: { title: { en: 'Plugin Discovery', zh: '找插件与拼装' } },
        assistant: { title: { en: 'Personal Assistant', zh: '随身参谋与家庭' } },
        orchestration: { title: { en: 'Multi-Agent Orchestration', zh: '多智能体调度' } },
        learning: { title: { en: 'Knowledge & Learning', zh: '经验沉淀与分身' } },
      },
      labels: {
        'dual-023': { title: { en: '0.2.3 Ready', zh: '兼容 0.2.3' } },
        'local-first': { title: { en: 'Local-First', zh: '本机隐私优先' } },
      },
      sortKeys: {
        featured: {
          title: { en: 'Featured Order', zh: '精选顺序' },
          order: 'asc',
        },
      },
    },
    plugins: [
      {
        name: finderPkg.name,
        title: {
          en: 'Plugin Finder',
          zh: '发现好插件',
        },
        description: {
          en: 'Search 11,979+ community plugins by task intent, reuse installed bundles first, assemble verifiable plans, and enter Creator Mode with lessons learned when a gap remains.',
          zh: '按真实任务需求倒推检索 11,979+ 社区插件与本机已装能力；差最后 20% 缺口时带避坑经验进创造模式补齐并回原工作区交付。',
        },
        icon: finderIconUrl,
        author: AUTHOR,
        homepage: 'https://github.com/oxmumu3/dsh-plugin-finder',
        repository: { url: 'https://github.com/oxmumu3/dsh-plugin-finder' },
        metadata: {
          category: 'discovery',
          keywords: ['discovery', 'catalog', 'creator', 'npm', 'token-savings', '发现好插件'],
          labels: ['dual-023', 'local-first'],
          sortKeys: { featured: 1 },
        },
        versions: [
          versionEntry({
            version: finderPkg.version,
            publishedAt: '2026-11-28T11:30:00.000Z',
            dsh: finderPkg.engines.dsh,
          }),
        ],
      },
      {
        name: '@oxmumu3/dsh-project-companion',
        title: {
          en: 'DSH Dot',
          zh: 'DSH Dot · 随身参谋',
        },
        description: {
          en: 'Personal chief-of-staff bridging Mac workspaces, Google Workspace, flomo, Dida, and native DSH sessions with Sentinel safety confirmation and WeChat/iOS sync.',
          zh: '住在电脑里、手机随时聊的私人参谋：直连 Mac 工作区、Google 三件套、flomo 与滴答，原生会话同源并带 Sentinel 安全确认卡。',
        },
        icon: ICONS.dot,
        author: AUTHOR,
        homepage: 'https://github.com/oxmumu3/dsh-project-companion',
        repository: { url: 'https://github.com/oxmumu3/dsh-project-companion' },
        metadata: {
          category: 'assistant',
          keywords: ['dot', 'companion', 'wechat', 'ios', 'proactive', 'memory'],
          labels: ['dual-023', 'local-first'],
          sortKeys: { featured: 2 },
        },
        versions: [
          versionEntry({
            version: '0.43.1',
            publishedAt: '2026-11-23T02:24:12.865Z',
            dsh: '0.2.0-rc.2 || 0.2.1-rc.2 || 0.2.1-rc.3 || 0.2.1-rc.4 || 0.2.1-rc.5 || 0.2.2-rc.1 || 0.2.2-rc.2 || 0.2.2-rc.3 || 0.2.2-rc.4 || 0.2.2-rc.5 || 0.2.3-alpha.2',
          }),
        ],
      },
      {
        name: '@oxmumu3/dsh-superagent',
        title: {
          en: 'DSH Super Agent',
          zh: 'DSH Super Agent · 任务总管',
        },
        description: {
          en: 'AI task triage cockpit with parallel Codex worktree dispatch, unified ledger MCP, topic repository view, and evidence-backed acceptance.',
          zh: 'DeepSeek Harness 原生智能任务总管：一句话 AI 拆单分诊、Codex Git Worktree 并发派工、驾驶舱/选题双视图与证据验收闭环。',
        },
        icon: ICONS.superagent,
        author: AUTHOR,
        homepage: 'https://github.com/oxmumu3/dsh-superagent#readme',
        repository: { url: 'https://github.com/oxmumu3/dsh-superagent' },
        metadata: {
          category: 'orchestration',
          keywords: ['superagent', 'codex', 'worktree', 'orchestration', 'taskboard'],
          labels: ['dual-023', 'local-first'],
          sortKeys: { featured: 3 },
        },
        versions: [
          versionEntry({
            version: '0.3.0',
            publishedAt: '2026-11-19T07:30:59.725Z',
            dsh: '>=0.2.2-rc.2 <0.3.0',
          }),
        ],
      },
      {
        name: '@oxmumu3/dsh-family-assistant',
        title: {
          en: 'Lele Family Assistant',
          zh: '乐乐家庭助手',
        },
        description: {
          en: 'Family WeChat assistant with isolated member sessions, consent-scoped memory sharing, reminders, and host-side configuration.',
          zh: '给每位家人配一个独立的微信小助手：隔离会话与偏好记忆、明确分享授权范围、日程提醒与家庭事务协助。',
        },
        icon: ICONS.family,
        author: AUTHOR,
        homepage: 'https://github.com/oxmumu3/dsh-family-assistant#readme',
        repository: { url: 'https://github.com/oxmumu3/dsh-family-assistant' },
        metadata: {
          category: 'assistant',
          keywords: ['family', 'wechat', 'assistant', 'reminders', '乐乐'],
          labels: ['dual-023', 'local-first'],
          sortKeys: { featured: 4 },
        },
        versions: [
          versionEntry({
            version: '0.2.9',
            publishedAt: '2026-11-23T02:25:32.042Z',
            dsh: '0.2.1-rc.2 || 0.2.1-rc.3 || 0.2.1-rc.4 || 0.2.1-rc.5 || 0.2.2-rc.1 || 0.2.2-rc.2 || 0.2.2-rc.3 || 0.2.2-rc.4 || 0.2.2-rc.5 || 0.2.3-alpha.2',
          }),
        ],
      },
      {
        name: '@oxmumu3/dsh-incidental-learn',
        title: {
          en: 'Incidental Learn Coach',
          zh: '顺带私教',
        },
        description: {
          en: 'Zero-interruption micro-learning cards at real engineering trade-offs with 10-second quizzes, side-panel coaching, and a local skills notebook.',
          zh: '在日常协作的关键取舍处顺手生成防刷屏微学习卡，支持 10 秒快测、右侧边聊边测与本机个人技能手账沉淀。',
        },
        icon: ICONS.learn,
        author: AUTHOR,
        homepage: 'https://github.com/oxmumu3/dsh-incidental-learn#readme',
        repository: { url: 'https://github.com/oxmumu3/dsh-incidental-learn' },
        metadata: {
          category: 'learning',
          keywords: ['learning', 'coaching', 'quiz', 'tradeoff', '顺带私教'],
          labels: ['dual-023', 'local-first'],
          sortKeys: { featured: 5 },
        },
        versions: [
          versionEntry({
            version: '0.2.0',
            publishedAt: '2026-11-19T13:45:33.886Z',
            dsh: '>=0.2.2-rc.2 <0.3.0',
          }),
        ],
      },
      {
        name: '@oxmumu3/dsh-agent-twin',
        title: {
          en: 'AI Twin Workbench',
          zh: 'AI 分身工作台',
        },
        description: {
          en: 'Publish any local workspace as an isolated full-blooded DSH AI Twin with /try public scan-to-try lobby, 0.2.3 Feishu/WeCom connectors, personal WeChat iLink QR, inline/mobile approvals, scopePaths isolation, and semantic knowledge graph.',
          zh: '3 分钟把本地专业工作区发布为满血隔离 AI 分身：支持 /try 公开扫码真体验大厅、0.2.3 官方飞书/企微连接器与个人微信扫码、对话流原位与手机远程拍板、目录级物理隔离及语义知识图谱。',
        },
        icon: ICONS.twin,
        author: AUTHOR,
        homepage: 'https://github.com/oxmumu3/ai-twin-starter',
        repository: { url: 'https://github.com/oxmumu3/ai-twin-starter' },
        metadata: {
          category: 'learning',
          keywords: ['twin', 'collaboration', 'feishu', 'wecom', 'wechat', 'semantic-graph', 'knowledge', 'public-try', '分身'],
          labels: ['dual-023', 'local-first'],
          sortKeys: { featured: 6 },
        },
        versions: [
          versionEntry({
            version: '0.6.3',
            publishedAt: '2026-11-26T10:25:00.000Z',
            dsh: '>=0.2.2-rc.2 <0.2.3-0 || >=0.2.3-alpha.0 <0.2.4-0',
          }),
        ],
      },
      {
        name: '@oxmumu3/dot-memory',
        title: {
          en: 'Dot Memory Bus',
          zh: 'Dot 记忆总线',
        },
        description: {
          en: 'Local plaintext Markdown memory bus shared across DSH, Antigravity, Claude Code, Codex, and MCP-compatible agents with transparent review and zero cloud lock-in.',
          zh: '跨工具共享的本机明文 Markdown 记忆总线：打通 DSH 与多款本机 AI 工具的偏好、项目脉络与交接记录，随时可读可改。',
        },
        icon: ICONS.memory,
        author: AUTHOR,
        homepage: 'https://github.com/oxmumu3/dot-memory',
        repository: { url: 'https://github.com/oxmumu3/dot-memory' },
        metadata: {
          category: 'learning',
          keywords: ['memory', 'mcp', 'markdown', 'cross-agent', 'local-first', '记忆总线'],
          labels: ['dual-023', 'local-first'],
          sortKeys: { featured: 7 },
        },
        versions: [
          versionEntry({
            version: '0.1.0',
            publishedAt: '2026-11-26T15:52:00.393Z',
            dsh: '>=0.2.2-rc.2 <0.3.0',
          }),
        ],
      },
    ],
  };
}

/**
 * Generate and write `index.json` at the repository root.
 * @returns {Promise<{ path: string, plugins: number, bytes: number }>}
 */
export async function writeMarketIndex() {
  const doc = await buildMarketIndex();
  const content = `${JSON.stringify(doc, null, 2)}\n`;
  await fs.writeFile(OUTPUT_PATH, content, 'utf8');
  return {
    path: OUTPUT_PATH,
    plugins: doc.plugins.length,
    bytes: Buffer.byteLength(content, 'utf8'),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const receipt = await writeMarketIndex();
  console.log(JSON.stringify(receipt));
}
