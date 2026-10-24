// Editorial reading aids for the 18 homepage examples. These are descriptions
// of the recorded source, not renamed plugins, ratings or verification claims.
// Selection always uses the original, complete catalog identity.
const examples = {
  'https://github.com/cloader/dsh-taskboard': ['把待办整理成项目看板', '可手动或定时执行', 'board'],
  'https://github.com/vncntvx/dsh-zotero': ['查找论文、笔记与引用', '需已配置本机 Zotero', 'book'],
  'https://github.com/ethanyoq/invoice-downloader/tree/main/plugins/dsh-invoice-downloader': ['收集发票，汇总成 Excel', '需 Python；识别文本交给当前模型', 'receipt'],
  'https://github.com/bioaievolu/dsh-md-studio': ['看清文档里的流程图与公式', '支持 Markdown 预览', 'document'],
  'https://github.com/kw78/dsh-office-tools': ['读取和制作 Office 文档', 'Word、Excel、PowerPoint', 'office'],
  'https://github.com/pensivefei/dsh-voice-scribe': ['用语音听写代替打字', '需麦克风权限', 'voice'],
  'https://github.com/ecnu/eduwork/tree/main/packages/dsh-memory': ['找回过去的对话与记忆', '需 Node 24.18+ 与 DSH 0.2.1-rc.2', 'memory'],
  'https://github.com/benrong2048-boop/dsh-prompt-polish': ['把一句想法变成清楚的需求', '会使用模型额度，确认后写回', 'prompt'],
  'https://github.com/lifangjin/dsh-maoying': ['从大纲到审校，一起写小说', '需启用作者的小说助手预设', 'pen'],
  'https://github.com/boogoo619/dsh-focus-overlay': ['专注阅读，收起工具调用', '简洁的全屏回复视图', 'focus'],
  'https://github.com/yongfanbeta/dsh-pomodoro': ['安排专注与休息时间', '专注记录保存在本机', 'timer'],
  'https://github.com/nwflower/dsh-claude-style': ['换一套 Claude 风格界面', '含 PolyForm Shield 条款，使用前核对许可', 'theme'],
  'https://github.com/saya-ch/dsh-mobile': ['在手机上接着用 Harness', '需配对；原生 App 仅 Android', 'phone'],
  'https://github.com/f-e-n-g-0531/dsh-vcs': ['查看代码改动与版本历史', '只读；商用需另行授权', 'branch'],
  'https://github.com/tencent/browserskill/tree/main/packages/dsh-plugin-browserskill': ['让助手操作可见的浏览器', '需另装 CLI 与浏览器扩展', 'browser'],
  'https://github.com/han-1413141/dsh-cost-meter': ['看清模型花费与预算', '按配置的价格规则统计', 'meter'],
  'https://github.com/nwflower/dsh-chat-import': ['带着其他 AI 的对话接着聊', '需提供相应历史文件', 'chat'],
  'https://github.com/howillmakeit/dsh-model-context-catalog': ['核对模型能读多长的内容', '查看来源后确认更新', 'settings'],
};

export function communityPresentation(entry) {
  const example = entry?.preview && examples[entry.id];
  return example ? { title: example[0], note: example[1], symbol: example[2] } : null;
}
