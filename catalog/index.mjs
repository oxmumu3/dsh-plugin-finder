import { readFile } from 'node:fs/promises';

export const DEFAULT_CATALOG_URL = new URL('./plugins.json', import.meta.url);
export const CAPABILITY_TERMS = Object.freeze({
  'data-analysis': ['数据分析', '数据画像', '表格', 'csv', 'tsv', 'excel', 'sql', 'duckdb', 'analytics', '分析投放', '投放表'],
  'data-quality': ['数据质量', '重复', '缺失', '异常', '校验数据', '清洗', 'data quality', 'missing', 'duplicate', 'profile', 'outlier'],
  'report-writing': ['报告', '周报', '月报', '汇报', 'report', '商业结论', '洞察'],
  'evidence-ledger': ['证据', '溯源', '核查结论', '可核查', 'citation', 'evidence', '来源', '引用核对'],
  'literature-search': ['论文检索', '文献检索', '找论文', '学术搜索', 'literature', 'crossref', 'openalex', 'doi', 'bibtex'],
  'pdf-reading': ['pdf', '读论文', '阅读论文', '论文阅读', 'paper reading', '扫描件', '页码'],
  'library-docs': ['库文档', '框架文档', '版本文档', 'context7', 'library docs', 'react文档', '查文档', '依赖文档'],
  'web-search': ['联网搜索', '网页搜索', '搜索网页', 'web search', '网络检索', '竞品研究', '竞品调研', '研究竞品'],
  'web-fetch': ['网页正文', '抓取网页', '读取网页', '读网页', 'web fetch', 'url', '竞品研究', '竞品调研', '研究竞品'],
  'browser-automation': ['浏览器', '网页操作', 'browser', '点击网页', '截图', '动态页面', 'playwright'],
  'code-review': ['代码审查', '审查代码', '代码评审', '审查变更', '只读审查', 'review', '审计代码', 'pull request', 'pr审查', 'git diff'],
  'git-workflow': ['git', '提交代码', 'commit', '版本控制', '分支', 'diff'],
  'software-development': ['开发流程', '工程流程', '工程化', 'tdd', '需求澄清', 'software development', '写代码'],
  'workflow-orchestration': ['工作流', '编排', 'workflow', '多智能体', 'multi-agent', '多agent'],
  'workflow-templates': ['工作流模板', '模板工作流', 'workflow template', '固定模板'],
  'workflow-persistence': ['保存工作流', '工作流复用', '重复运行', 'saved workflow', '持久化工作流', '复跑'],
  'messaging-im': ['微信', 'wechat', '飞书', 'feishu', 'lark', '企微', '企业微信', 'wecom', '钉钉', 'dingtalk', 'telegram', 'slack', 'discord', 'qq', '消息通道', '机器人'],
  'memory-knowledge': ['记忆', 'memory', '知识库', '知识图谱', 'graph', '笔记', 'obsidian', 'flomo', 'notion', 'rag', '沉淀', '分身'],
  'voice-audio': ['语音', 'voice', 'tts', '配音', '音频', '转写', 'asr', 'whisper', '播客', '朗读', 'siri'],
  'task-schedule': ['看板', 'taskboard', '待办', 'todo', '日程', '定时', 'cron', 'schedule', '提醒', 'reminder', '滴答', 'dida', '项目管理'],
  'media-design': ['封面', '海报', '画图', '图片', '图像', 'svg', 'mermaid', 'drawio', '视频', '剪辑', 'video', 'remotion', 'hyperframes', '图表', '设计'],
  'mail-calendar': ['邮件', '邮箱', 'email', 'mail', 'gmail', 'imap', 'smtp', '日历', 'calendar', '会议'],
  'terminal-ops': ['终端', 'terminal', 'ssh', 'docker', '部署', 'deploy', '服务器', '运维', '监控', '日志'],
  'translation-writing': ['翻译', 'translate', '润色', '写作', '改稿', '文章', '公众号', '小红书', '推文', '文案', '周报'],
  'finance-invoice': ['发票', 'invoice', '记账', '账单', '报销', '财税', '预算', '财务', 'excel'],
  'mcp-bridge': ['mcp', '桥接', 'bridge', 'webhook', '连接器', 'connector', '同步', '互通'],
  'ui-theme': ['主题', 'theme', '外观', '侧栏', '悬浮窗', '快捷键', 'shortcut', '布局', '美化'],
  'model-usage': ['模型', 'model', '用量', '费用', 'token', '计费', 'billing', 'quota', '余额', 'provider'],
});

const clone = value => structuredClone(value);
const normalize = value => String(value ?? '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();

export async function loadCatalog({ path = DEFAULT_CATALOG_URL } = {}) {
  const catalog = JSON.parse(await readFile(path, 'utf8'));
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.plugins)) throw new Error('Unsupported plugin catalog schema');
  const ids = new Set();
  for (const plugin of catalog.plugins) {
    if (!plugin?.id || ids.has(plugin.id) || !Array.isArray(plugin.capabilities)) throw new Error('Invalid or duplicate plugin catalog entry');
    ids.add(plugin.id);
  }
  return catalog;
}

export function getPluginDetails(catalog, id) {
  const entry = catalog.plugins.find(plugin => plugin.id === id || plugin.name === id);
  return entry ? clone(entry) : null;
}

export function inferCapabilities(query) {
  const text = normalize(query);
  return Object.entries(CAPABILITY_TERMS).filter(([, terms]) => terms.some(term => text.includes(term))).map(([capability]) => capability);
}

function versionParts(input) {
  const match = String(input).trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? null] : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  if (a[3] === b[3]) return 0;
  if (a[3] === null) return 1;
  if (b[3] === null) return -1;
  const left = a[3].split('.'); const right = b[3].split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === undefined) return -1;
    if (right[i] === undefined) return 1;
    if (left[i] === right[i]) continue;
    const lnum = /^\d+$/.test(left[i]); const rnum = /^\d+$/.test(right[i]);
    if (lnum && rnum) return Number(left[i]) < Number(right[i]) ? -1 : 1;
    if (lnum !== rnum) return lnum ? -1 : 1;
    return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

// A deliberately bounded SemVer evaluator. Unsupported range syntax is unknown,
// never silently accepted. It covers the comparators observed in this catalog.
function evaluateClause(version, clause) {
  if (!clause || clause === '*') return true;
  if (/\s-\s|[,()]|workspace:/.test(clause)) return null;
  const terms = clause.replace(/([<>]=?|[=^~])\s+/g, '$1').trim().split(/\s+/);
  let unknown = false;
  for (const term of terms) {
    if (term === '*') continue;
    const match = term.match(/^(>=|<=|>|<|=|\^|~)?(.+)$/);
    if (!match) { unknown = true; continue; }
    const partial = /^(\d+)(?:\.(\d+))?$/.exec(match[2]);
    const target = versionParts(partial && ['>=', '<'].includes(match[1]) ? `${partial[1]}.${partial[2] ?? '0'}.0` : match[2]);
    if (!target) { unknown = true; continue; }
    const operator = match[1] ?? '=';
    const comparison = compareVersions(version, target);
    let accepted;
    if (operator === '^' || operator === '~') {
      const upper = operator === '~' ? [target[0], target[1] + 1, 0, '0']
        : target[0] > 0 ? [target[0] + 1, 0, 0, '0']
          : target[1] > 0 ? [0, target[1] + 1, 0, '0'] : [0, 0, target[2] + 1, '0'];
      accepted = comparison >= 0 && compareVersions(version, upper) < 0;
    } else accepted = operator === '>=' ? comparison >= 0 : operator === '<=' ? comparison <= 0
      : operator === '>' ? comparison > 0 : operator === '<' ? comparison < 0 : comparison === 0;
    if (!accepted) return false;
  }
  // DSH's app-boot/plugin-compatibility.ts uses includePrerelease: true.
  return unknown ? null : true;
}

export function assessCompatibility(plugin, hostVersion) {
  const declared = plugin.compatibility?.dsh;
  const ranges = Array.isArray(declared) ? declared : declared ? [declared] : [];
  if (!hostVersion || !versionParts(hostVersion) || !ranges.length) return { status: 'unknown', range: declared ?? null, basis: plugin.compatibility?.basis ?? 'not-declared' };
  const version = versionParts(hostVersion);
  const results = ranges.map(range => {
    const choices = String(range).split('||').map(clause => evaluateClause(version, clause.trim()));
    return choices.includes(true) ? true : choices.includes(null) ? null : false;
  });
  return { status: results.includes(false) ? 'incompatible' : results.includes(null) ? 'unknown' : 'compatible', range: declared, basis: plugin.compatibility?.basis ?? 'manifest-declaration', note: 'Version-range check only; installation and task execution have not been verified.' };
}

export function searchCatalog(catalog, { query = '', capabilities = [], requiredCapabilities = [], requiresNoApiKey = false, hostVersion, nodeVersion = process.versions.node, platform, limit = 8 } = {}) {
  const text = normalize(query).slice(0, 4000);
  const inferred = inferCapabilities(text);
  const wanted = [...new Set([...capabilities, ...requiredCapabilities, ...inferred])];
  const tokens = [...new Set(text.match(/[a-z0-9][a-z0-9@._-]{1,}/g) ?? [])].filter(word => !['plugin', 'dsh', 'the', 'for', 'and', 'with'].includes(word));
  const hasQuery = Boolean(text || wanted.length);
  const results = [];
  for (const plugin of catalog.plugins) {
    if (plugin.install?.readiness === 'blocked') continue;
    if (requiredCapabilities.some(capability => !plugin.capabilities.includes(capability))) continue;
    if (requiresNoApiKey && !['not-required', 'optional'].includes(plugin.requirements?.extraApiKey)) continue;
    if (platform && plugin.requirements?.platforms?.length && !plugin.requirements.platforms.includes(platform)) continue;
    const hostCompatibility = assessCompatibility(plugin, hostVersion);
    if (hostVersion && hostCompatibility.status === 'incompatible') continue;
    const nodeCompatibility = assessCompatibility({ compatibility: { dsh: plugin.compatibility?.node, basis: 'engines.node' } }, nodeVersion);
    if (nodeVersion && nodeCompatibility.status === 'incompatible') continue;
    const matchedCapabilities = wanted.filter(capability => plugin.capabilities.includes(capability));
    const haystack = normalize([plugin.name, plugin.title, plugin.summary, ...(plugin.keywords ?? []), ...plugin.capabilities].join(' '));
    const matchedTerms = tokens.filter(token => haystack.includes(token));
    const exactName = text && (normalize(plugin.id) === text || normalize(plugin.name) === text);
    const score = matchedCapabilities.reduce((sum, capability) => sum + (capability === 'code-review' ? 18 : 12), 0) + matchedTerms.length * 3 + (exactName ? 40 : 0);
    if (hasQuery && !score) continue;
    results.push({ ...clone(plugin), match: { score, terms: matchedTerms, capabilities: matchedCapabilities }, hostCompatibility, nodeCompatibility });
  }
  return results.sort((a, b) => b.match.score - a.match.score || a.id.localeCompare(b.id)).slice(0, Math.max(0, Math.min(Number(limit) || 8, 20)));
}
