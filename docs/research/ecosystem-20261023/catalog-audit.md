# 社区插件目录：数量、用途重合与浏览入口

截至本次快照，社区全目录有 **6,565 条插件记录**，市场索引有 **3,382 条**。同名和相近用途都不少，值得做比较与筛选；现有证据不能给出“功能重复率”，更不能把 6,565 解释成 6,565 个互不重叠、已验证可用的产品。

## 数据口径

本次只读公开资料。网站 JSON 抓取于 **2026-10-23 12:49 UTC**；来源 `updated=2026-10-22` 是上游条目日期字段，不等于每个插件最后核查时间。原始响应、时间、SHA-256 在 [fetch-manifest.json](data/fetch-manifest.json)，统计在 [catalog-statistics.json](data/catalog-statistics.json)。

| 口径 | 数量 | 解释 |
|---|---:|---|
| 全目录条目 / 唯一条目 URL | 6,565 / 6,565 | 同一仓库内不同插件目录仍是不同条目 |
| 唯一 GitHub 仓库 | 6,336 | 不把仓库数当插件数 |
| 声明的 GitHub owner | 4,214 | 账号或组织命名空间，不是核实后的独立作者人数 |
| 唯一裸名称 | 6,056 | 同名不保证同作者、同功能或同代码 |
| 有 npm 名称及版本的条目 | 3,383 | 无 npm 映射的 3,182 条仍在全目录 |
| 市场索引条目 / 版本记录 | 3,382 / 3,382 | 每条只列一个版本，不是累加历史版本得到的规模 |
| 不同版本字符串 | 628 | `0.1.0` 等字符串重复没有功能含义 |

两份 JSON 来自同一个社区目录，但当前市场索引生成器要求 npm 映射、版本、发布时间和格式校验通过。全目录有一条 npm 映射未进索引，具体原因未确认。不能以较小索引的条数说另外三千余条不存在，也不能称全目录均可直接安装。许可与生成规则见 [来源审计](source-audit.md)。

## “高度重合”目前能证实到哪里

| 线索 | 组数 | 涉及条目 | 能说明什么 |
|---|---:|---:|---|
| 相同条目 URL | 0 | 0 | 当前快照没有同 URL 重复行 |
| 相同仓库 | 84 | 313 | 包括一个仓库里的多个插件，不能直接去重 |
| 完全同名 | 320 | 829 | 例如 `dsh-session-delete` 15 条、`dsh-memory` 13 条、`dsh-prompt-optimizer` 10 条 |
| 规范化名称相同 | 367 | 972 | 去 npm scope、DSH / plugin 前后缀及分隔符后的候选线索 |
| 中 / 英介绍逐字相同 | 0 / 0 | 0 / 0 | 改写一句话就可避开此检验，**不说明功能不重复** |

完整成员与规范化规则在 [duplicate-signals.json](data/duplicate-signals.json)。名称相同有可能是独立实现、fork、同一产品的分发变体，或确有相似需求；本次没有进行全生态源码、依赖、交互和实际效果比较，不能据此认定抄袭、重复造轮子或质量高低。

以下是更接近用户用途的有界例子。数量来自明确关键词规则；组可相交，漏掉关键词不代表用途独特，也不把集合内所有成员视为可互换产品。完整正则、筛选字段与成员在 [purpose-clusters.json](data/purpose-clusters.json)。例子差异来自目录介绍；除另列的 18 项外，未逐一阅读作者 README。

| 用途邻域 | 规则命中的条目数 | 具体差异 |
|---|---:|---|
| 番茄钟 | 6 | 名称或中英介绍含番茄钟 / 番茄工作 / 番茄闹钟 / pomodoro 等；[causebefore](https://github.com/causebefore/dsh-pomodoro) 侧重可配置循环与提醒，[yongfanbeta](https://github.com/yongfanbeta/dsh-pomodoro) 加入任务关联、热力图与 CSV，[study-desk](https://github.com/slow-stack/dsh-study-desk) 把计时放进复习队列和学习工作台。 |
| 用量与费用统计 | 89 | 限 `usage` 类，并匹配 token / 费用等与统计、计量、监控、聚合等词；[usage-billing](https://github.com/0x7A7A6572/dsh-forge-studio/tree/main/packages/plugin-usage-billing) 描述按日志与事件价格归集，[team-cost](https://github.com/1569126506-sudo/dsh-team-cost) 强调团队归因、预算告警与可选拦截，[cost-meter](https://github.com/Han-1413141/dsh-cost-meter) 偏个人会话、余额和预算查看。 |
| 主题与皮肤 | 216 | 限 `theme` 类，并含主题 / 配色 / 皮肤 / theme / skin；[codex-appearance](https://github.com/AaronKate/dsh-codex-appearance) 提供字体、宽度与明暗可读性设置，[aqua-theme](https://github.com/acdsh4869/dsh-aqua-theme) 提供玻璃和壁纸效果，[aqua-patched](https://github.com/Aliww2468/dsh-client-ui-aqua-patched) 明确自述上游分支与版本适配修复。后两者的关系不能仅凭样式相近判断。 |
| 名称指向侧栏的 UI 插件 | 34 | 限 `ui` 类，名称含 sidebar / side-bar / 侧栏 / 侧边栏；[panel-fold](https://github.com/ACGsu/dsh-sidebar-panel-fold) 折叠面板列表，[better-sidebar-N23](https://github.com/All3nCN/dsh-better-sidebar-N23) 是含编辑器、终端等的工作台 fork，[popout-sidebar](https://github.com/e2mcc/dsh-popout-sidebar) 强调独立窗口与多显示器。 |

这足以支持“先告诉用户具体差异，再决定装哪个或是否需要新做”；不足以支持“89 个费用插件都一样”或“整个生态大部分无用”。

## 原始用途分布与普通用户入口

下表完整保留上游 23 类计数，分母 6,565。它反映目录编辑分类，不能直接换算成开发者人数、普通用户比例或真实使用量。

| 原类 | 条目 | 原类 | 条目 | 原类 | 条目 |
|---|---:|---|---:|---|---:|
| ui | 1,237 | tools | 854 | session | 465 |
| dev | 431 | workflow | 374 | model | 355 |
| usage | 346 | memory | 279 | theme | 256 |
| skill | 250 | notify | 250 | fun | 200 |
| remote | 197 | security | 196 | git | 145 |
| browser | 141 | vision | 137 | docs | 103 |
| market | 97 | voice | 84 | wsl | 80 |
| identity | 52 | agi | 36 | | |

界面、会话、模型管理和开发连接占有显著位置，但分类不能回答“硬核工具有多少可被普通用户直接用”。例如 `tools` 同时可能含开发工具与报销工具，`ui` 也含番茄钟和学习看板。本次已核对的普通用途包括发票整理、论文检索、Office 文档、语音输入、小说创作和专注计时，说明供给不只面向程序员；**18 项是目的性选择，不是随机样本，不能据此估算全生态比例**。

首页先提供 6 类 × 3 个代表入口，全部条目仍可本地检索分页。18 项的作者资料、使用前提和许可例外见 [样本核验](sample-review.md)。每类挑用途不同、资料可读的入口，不按星标排质量，不称热门，不以阅读 README 代替运行验收。

## 已落到 Finder 的数据边界

| 浏览类 | 原始分类映射 | 实际可浏览条目 |
|---|---|---:|
| 办公与工具 | tools / workflow / notify | 1,476 |
| 内容与输入 | docs / vision / voice | 324 |
| 知识与助手 | memory / skill / identity / agi | 617 |
| 界面与趣味 | ui / theme / fun | 1,693 |
| 开发与连接 | dev / git / browser / remote / wsl | 994 |
| 模型与管理 | model / session / usage / security / market | 1,459 |

正式快照 `sourceTotal=6565 / total=6563 / excludedTotal=2`。排除的两条旧自有项目经 GitHub canonical API 核验仍在旧账号，正式身份对应仓库返回 404；未伪造迁移链接，历史事实保留在 [身份核验记录](data/own-identity-evidence.json)。生成器仅按这两条已核 ID 排除，遇到其他旧自有 ID 会失败并要求核验。

生产快照只包含轻量目录元信息、作者来源和自写短摘要，约 3.79 MB；没有 README 全文、图片、可执行代码或虚构下载地址。目录数据明确以 CC0-1.0 发布；各插件自身的许可独立处理。作者 README 和额外原始网页缓存已忽略，不纳入可公开跟踪文件或安装包。

生产浏览为纯本地检索，单页默认 24 条、最多 60 条；首页不挂载 6,563 个 DOM 项。点选后保存 `communityEntryId`，服务端回读目录并精确核对作者、仓库、monorepo 路径与包版本；模型不能因通用关键词把 A 换成 B。核对不清或不兼容会说明缺口，点目录本身不安装、不执行。

## 复跑与证据层级

在仓库根目录执行：

```sh
node docs/research/ecosystem-20261023/scripts/analyze-catalog.mjs
node docs/research/ecosystem-20261023/scripts/analyze-purpose-clusters.mjs
node scripts/build-community-catalog.mjs
node --test test/community-catalog.test.mjs test/community-selection.test.mjs test/community-view.test.mjs
```

分析与生成使用已保存快照，可离线复跑；`fetch-catalog.mjs` 会重新抓取并覆盖研究快照，更新前应保留本次目录。生成器检查源数据 hash、分类覆盖、唯一身份、18 项作者核验记录和旧身份处理。`production-catalog-receipt.json` 记录当前产物 hash 与数量。

本页证明公开目录统计、18 项文档用途核对以及代码级边界测试。真实 Host 的浏览、安装和执行验收由主任务另行记录；不把这里的通过计数写成插件功能实测。全量原始介绍与生产摘要均未发现 U+FFFD，18 项已统一改为人工短摘要；界面最终显示仍以浏览器验收为准。
