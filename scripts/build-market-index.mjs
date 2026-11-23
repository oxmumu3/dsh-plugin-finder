import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'index.json');
const AUTHOR = '牛村木木山';

const unixSeconds = iso => Math.floor(Date.parse(iso) / 1000);

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
          en: 'Search 11,979+ community plugins by task intent, assemble verifiable plans, and enter Creator Mode with lessons learned when a gap remains.',
          zh: '按真实任务需求倒推检索 11,979+ 社区插件与精选方案；差最后 20% 缺口时带避坑经验进创造模式补齐并回原工作区交付。',
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
            publishedAt: '2026-11-23T02:36:20.250Z',
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
          en: 'Curate selected project materials with source provenance, boundary rules, and verified channel connections into a personal AI twin.',
          zh: '从选定项目材料整理有溯源的知识、边界规则与通道授权，在本地打造可核对的个人 AI 分身。',
        },
        author: AUTHOR,
        homepage: 'https://github.com/oxmumu3/ai-twin-starter',
        repository: { url: 'https://github.com/oxmumu3/ai-twin-starter' },
        metadata: {
          category: 'learning',
          keywords: ['twin', 'knowledge', 'provenance', 'workbench', '分身'],
          labels: ['local-first'],
          sortKeys: { featured: 6 },
        },
        versions: [
          versionEntry({
            version: '0.4.0-preview.6',
            publishedAt: '2026-11-04T22:11:30.129Z',
            dsh: '0.2.1-rc.2 || 0.2.1-rc.3 || 0.2.1-rc.4 || 0.2.1-rc.5 || 0.2.2-rc.1',
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
