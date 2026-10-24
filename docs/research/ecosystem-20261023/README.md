# 插件很多之后，用户怎样真正用起来？

2026-10-23 研究入口。现有证据支持“社区供给已经形成，发现、适配和使用之间仍值得研究”；还不足以证明需求缺口、重复开发程度，或 Finder 改善了真实用户结果。以下均使用本轮已保存的公开资料，不是代码验收或生态效果报告。

## Harness 有多少用户？

**本次已查资料没有可核实的绝对用户数，也没有 DAU / MAU 数值。** 不能拿 DeepSeek 整体用户、GitHub Star、下载量或插件数量代替。

官方 2026-09-30 披露：在**通过官方 API 访问模型的 Harness 用户中，约 60% 使用第三方插件**。这说明该口径下插件已有使用基础；原文未给样本量、统计窗口和去重方法，不能外推为全部 Harness 用户，更不能反推总人数。[官方原文](https://x.com/DeepSeekHarness/article/2105330281389662575)

官网同时展示办公、编程与自建 Harness，并演示通过对话创建插件。“开发者预览”描述发布阶段，不能改写为 Creator 只服务开发者或多数用户都是开发者。[官网](https://www.deepseek.com/harness/)、[官方 README](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/README.zh.md)

## 五千、六千多个插件，具体是什么数？

本次数据抓取于 2026-10-23；上游 `updated` 为 2026-10-22，但该字段是条目新增日期的最大值，不是全部插件最近核验日期。[上游字段生成规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/build-site.mjs#L1119-L1173)

| 数字 | 对象与含义 |
| --- | --- |
| **6,565** | 社区 `plugins.json` 全量目录条目，含 npm 与 GitHub / Release 来源；不是官方审核数或已安装数 |
| **3,382** | 同一目录本轮 `index.json` 的 format-1 市场索引子集；与 6,565 不相加 |
| **6,563** | Finder 本次用于展示的元数据条目；两个自有旧账号条目的正式归属未迁移，暂不作为推荐入口，原始研究数据仍保留 |

两份公开数据是[全目录](https://awesome-dsh-plugin.com/plugins.json)和[市场索引](https://awesome-dsh-plugin.com/index.json)，本轮固定值与 hash 见[本地统计](data/catalog-statistics.json)和[展示数据回执](data/production-catalog-receipt.json)。该社区生产器目前只将具备所需 npm 映射字段的条目写入市场索引；这是生产器边界，不是官方 format-1 不支持 Git。[索引生成源码](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/lib/market-index.mjs#L1-L15)

目录数据声明 CC0-1.0，可与原作者归属一起复用；插件代码、README 全文、截图等各有自己的许可。社区收录也不等于安全审计、兼容或功能通过。[目录发布脚本](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/publish-catalog.mjs#L98-L161)、[收录边界](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/README.zh.md#L33-L45)

## 是不是很多人在重复造轮子？

目前只能给出核查线索，不能给“功能重复率”。在 6,565 条原始记录中：

- 规范化条目 URL 有 6,565 个；去掉 monorepo 子路径后是 6,336 个仓库。同一仓库可能提供多个独立插件，不能直接删成一条。
- 裸名称相同的有 320 组、涉及 829 条。这只表示同名，不证明功能、实现、授权或作者关系相同。
- 按公开名称/描述的关键词规则，找到了番茄钟 6 条、用量与费用统计 89 条、主题与皮肤 216 条、名称指向侧栏的 UI 插件 34 条。它们是**用途邻域**，规则可重叠，也可能漏掉同用途项目，不是精确重复组。[统计与方法](data/catalog-statistics.json)、[用途规则及成员](data/purpose-clusters.json)

例如两个番茄钟描述分别侧重通知提醒，以及关联任务、专注统计和 CSV 导出。是否互相替代，需要核对具体输入输出、环境、实现和实际效果；“都是番茄钟”不足以判定没有新增价值。[causebefore 作者仓库](https://github.com/causebefore/dsh-pomodoro)、[yongfanbeta 作者仓库](https://github.com/yongfanbeta/dsh-pomodoro)

## 供给是不是偏技术用户，普通人用不上？

23 个上游分类中，界面增强有 1,237 条，会话消息 465 条、开发运行 431 条、模型提供方 355 条、用量费用 346 条。从分类和用途看，**围绕 Harness 自身使用环境的增强是显著供给方向**；这不等于已测得“技术用户比例”，也不能推断普通人用不上。[上游分类定义](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/scripts/lib/entries.mjs#L12-L27)、[本轮分类计数](data/catalog-statistics.json)

已有不少可以直接用日常任务理解的方向。以下只核对作者用途声明，没有据此保证可安装、兼容或任务成功：

| 日常任务 | 一手例子 | 已知前提 |
| --- | --- | --- |
| 从邮件整理发票和报销汇总 | [Invoice-Downloader](https://github.com/EthanYoQ/Invoice-Downloader/tree/main/plugins/dsh-invoice-downloader) | 需邮箱配置、Python 与首次联网安装；识别文本会交给当前模型 |
| 读取或制作 Word、Excel、PPT | [dsh-office-tools](https://github.com/kw78/dsh-office-tools) | 工作区与文件格式有范围限制 |
| 找论文、笔记和引用证据 | [dsh-zotero](https://github.com/Vncntvx/dsh-zotero) | 需配置本机 Zotero |
| 语音输入、专注计时、阅读公式图表 | [Voice Scribe](https://github.com/PensiveFei/dsh-voice-scribe)、[Pomodoro](https://github.com/yongfanbeta/dsh-pomodoro)、[Markdown Studio](https://github.com/BioAIEvolu/dsh-md-studio) | 分别涉及麦克风/识别方式、本地计时记录和渲染范围 |

本轮 18 个首页代表项是有目的抽样，用来理解用途与入口，不是随机样本，不能据此计算整个生态对普通人的覆盖率。逐项边界见[样本核验](sample-review.md)。

## 现有市场和 Creator 已经做到哪里？

社区已经有分类网站，dsh-market 声明提供安装、更新、分组与启停；awesome 目录维护者另有 dsh-find-plugin，明确支持用户描述能力后由 Agent 搜索，并返回安装命令。官方自定义市场还让 Creator 使用只读检索工具，取得可交给安装工具的精确参数。[awesome 作者说明](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/README.md)、[dsh-market](https://github.com/dsh-market/dsh-market/blob/2477c36e2226b6ed731c88e66adc5a431976dcaa/README.md)、[对话找插件](https://github.com/awesome-dsh-plugin/dsh-find-plugin/blob/afce1cd43f98b8a8b02e4a35cd6a65d6444de412/README.md)、[官方市场契约](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/plugin-market/README.zh.md)

官方市场当前不内置索引源，需要用户自行添加。这能解释一部分入口发现成本，但不是“官方没有市场”，也不能据此判断所有用户的体验。[官方市场指南](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/user/guide/plugin-market.zh.md)

官方 Creator 已有对话开发、配置组合、安装和安装后验证指引。因此 Finder 不能把目录、对话找插件、一键安装或对话创造单项描述为首创；本轮也没有证据证明别的方案一定不能接完整任务。[官方创造技能](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset/skills/cordis-plugin-development/SKILL.md)；完整差异与未确认项见[现有方案对照](existing-alternatives.md)。

Finder 的待验证价值是：**用户从目标或兴趣条目进入后，能否更自然地完成适配核对、复用或组合、不足时创建，并拿到能使用的结果。** 目录是发现入口，不是这条价值已经成立的证据。

个人需求形成的新能力，将来可能服务其他人；但长尾贡献“五五开”没有本轮证据。成果回流应是创作者自愿公开后的后续方向，可衔接既有分发渠道；该设想不授权自动上传需求或公开发布作品，本轮未建设公开回流池。

## 接下来怎样验证，而不是继续堆概念？

1. 选一小组真实任务，分别覆盖办公材料、阅读表达和 Harness 使用增强；固定模型、权限、初始插件状态及明确的成功标准。
2. 对照各方案的最佳已文档化路径，包括官方 Creator + 已配社区索引、对话找插件 + Agent，以及 Finder；记录是否完成、人工操作次数和实际阻碍，不故意只拿纯目录作弱基线。
3. 对相似用途项目抽样比输入输出、运行环境、配置与实际结果，再判断是否可替代；不把同名计数转换成重复率。
4. 在明确同意的前提下收集任务反馈，区分发现不到、资料不够、兼容问题和执行失败；另外观察作者是否愿意公开、第二位用户能否成功复用。当前不预设留存、增长或生态循环效果。

本轮边界：一次公开快照、元数据统计、18 项作者资料核验、有限现有方案阅读；未审计全部插件、未抽样全体用户、未测全生态任务成功率。原始证据与详细限定分别见[来源审计](source-audit.md)、[用户与平台](users-and-platform.md)、[样本核验](sample-review.md)、[现有方案](existing-alternatives.md)；作者原始思考与文章阅读结构另存于[产品思考草稿](product-thesis.md)。
