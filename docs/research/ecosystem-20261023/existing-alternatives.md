# 现有方案有界对照

核查日：2026-10-23。范围：awesome 网站及其维护者的找插件工具、dsh-market 作者仓库、官方市场与 Creator 的公开契约。沿用 ego Space 136 / p1；未安装这些第三方插件，未执行安装/创建/发布，以下区分页面观察、作者声明、源码契约与未确认项。目录总量另见目录审计，不在此重算。

## 结论

目录、分类搜索、安装更新、对话找插件和对话创建插件都已有现成方案。**不能把这些单项能力当作 Finder 首创。** 官方 Creator 配好市场后，已有搜索工具与安装工具的衔接契约，也有插件开发、组合与安装后验证指引。新的产品价值若成立，应由真实任务证明：用户表达目标后，系统能否连续判断覆盖程度、合理复用或组合、必要时创建，并返回可使用的结果；不能仅凭“几个入口在一页”认定更好。

本轮未找到这几套产品把“需求理解 → 覆盖核对 → 多插件协作 → 不足时创建 → 验证并使用”明确承诺为固定完整流程的材料；这表示**未确认**，不表示它们一定不能完成，也不证明整个生态不存在类似方案。当前比较以实际验证、使用为终点，不将公开分发作为竞争缺口。

## 一手来源、日期与原文摘要

| 一手来源 | 快照 / 日期 | 原文摘要与本次可确认内容 |
| --- | --- | --- |
| [awesome-dsh-plugin 作者 README](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/README.md)、[实际网站](https://awesome-dsh-plugin.com/) | 固定提交 `a5284f2`，提交时间 `2026-10-23T00:02:04Z`；网站 2026-10-23 观察 | 自述社区插件精选列表；网站可见搜索、分类、排序、npm 可安装与近七天过滤、安装命令及投稿入口。README 说明可把同一目录作为 format-1 索引接入官方 Discover 与 `plugin_market`；该索引覆盖已知版本的 npm 项，GitHub-only 项仍有旁边的安装命令。README 另推荐同组织的会话找插件工具。页脚明确非 DeepSeek 官方关联，收录不代表背书。 |
| [dsh-market 作者 README](https://github.com/dsh-market/dsh-market/blob/2477c36e2226b6ed731c88e66adc5a431976dcaa/README.md)、[网站](https://dshmarket.com/) | 固定提交 `2477c36`，提交时间 `2026-10-22T20:55:06Z`；网站 2026-10-23 观察 | 作者声明在 DSH 插件页内浏览/搜索/安装，兼容性展示、截图、评论、收藏、分组及整组开关、主题、备份恢复、单项/批量更新、启停/卸载、诊断与加载顺序。网站与 README 都说明读取 awesome 同一目录；其“AI fix”是复制诊断提示词，由用户贴到新会话并决定发送，不能写成自动修复已验收。README 的当前目录数字是文案快照，不用于本报告计数。 |
| [官方 plugin-market Host 文档](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/plugin-market/README.zh.md)、[官方发现页文档](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-plugin-market/README.zh.md) | 固定官方 master `687f282`；Host 文档最近提交 `2026-10-14T21:37:44Z` | 读取用户配置索引，按文本/类别/标签搜索并计算安装状态、版本兼容。Creator 得到只读 `plugin_market`，每版本返回可传给 `plugin_manager.install_bundle` 的 target/registry；安装仍遵循自己的审批。官方 UI 可确认安装，但当前文档明确没有升级操作，只显示更新状态。 |
| [awesome 维护者的 dsh-find-plugin README](https://github.com/awesome-dsh-plugin/dsh-find-plugin/blob/afce1cd43f98b8a8b02e4a35cd6a65d6444de412/README.md)、[工具实现](https://github.com/awesome-dsh-plugin/dsh-find-plugin/blob/afce1cd43f98b8a8b02e4a35cd6a65d6444de412/src/index.ts) | 固定提交 `afce1cd`，提交时间 `2026-09-25T14:58:14Z` | 用户向 Agent 描述所需能力，模型调用 `find_dsh_plugin`。实时搜 GitHub 的 `dsh-plugin` topic、按 Star 排序，补精选目录描述；受限/失败时退化为目录关键词匹配，结果说明来源。返回描述、链接和安装命令；作者说明可再请 Agent 执行命令。已读工具实现仅执行检索并返回结果，没有在这个工具内执行安装或创建。不能据此断言整个 Agent 没有后续能力。 |

提交日期是所固定仓库快照的时间，不是每项功能的首次发布日期；网页没有展示独立发布日期时只记核查日。以上作者声明未转换为本机验收结论。

## 按用户路径比较

| 环节 | awesome 网站 / 目录 | dsh-market | dsh-find-plugin | 官方市场 + Creator |
| --- | --- | --- | --- | --- |
| 发现已有插件 | 页面观察到分类/文本搜索/排序；目录提供描述和安装入口 | 作者声明完整浏览、搜索、过滤、兼容展示 | Agent 调用检索工具，实时 topic 搜索或目录降级 | Discover UI 模糊文本搜索；Creator 可查已配索引 |
| 自然语言需求 | README 指向独立找插件工具，不能把纯网站搜索说成需求推理 | 已查 README/相关入口未确认专门的需求规划主路径 | 明确支持“告诉 Agent 想做什么，再找插件” | Creator 可接收对话，调用市场与安装工具；不能称官方仅有手动目录 |
| 安装 / 更新 | 给命令；可接官方市场或 dsh-market | 作者声明确认来源后安装、进度、单项/批量更新 | 返回命令，Agent 可按用户后续指令执行 | 搜索结果带精确安装参数；安装经官方工具审批；当前市场 UI 无升级操作 |
| 组合 | 收录可组合的 bundle；投稿规则接受有自己配置/协调行为的组合包 | 分组、整组开关；源码另有保存/预览/应用启用状态及顺序的 preset 机制 | 该检索工具不作组合计算，Agent 后续规划未验 | 官方出货 Cordis 组合/预设编辑技能；这是组合能力基础，不是已验收的需求覆盖规划器 |
| 创建不足的能力 | 网站投稿/分发入口不等于运行时创建器 | 本轮未确认 Creator 创建入口或自动创建契约 | 本工具只返回搜索结果；未确认专门 Creator 衔接 | 官方明确对话创建/配置持久插件，安装后要求实跑或检查真实 UI |
| 验证与实际使用 | 提供信息与安装命令；本轮未安装或验证实际任务 | 作者声明安装与诊断能力；本轮未实跑任务 | 已读工具返回检索结果；Agent 后续执行与任务结果未验 | 开发技能要求安装后实跑能力或核对真实 UI；本轮未做任务对照实跑 |

“组合”有不同含义：分组启停、加载层/配置组合、多个能力协作完成任务不能混为一件事。前两项已有明确实现/契约；按用户目标自动规划、验证跨插件工作流是否可靠，须另做任务对照。

## 官方 Creator 的重叠尤其要保留

[官方出货的插件开发技能](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset/skills/cordis-plugin-development/SKILL.md)（该文件最近提交 `2026-09-30T10:10:38Z`）已经要求在工作区编写 bundle，调用 `plugin_manager.install_bundle` 装入当前 profile，并根据安装返回状态实跑能力或核对真实 Client。它还关联组合编辑技能。因此“Creator 只生成代码，用户必须自行搬运/安装”不是当前公开契约。

[官方预设包文档](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset/README.zh.md)明确出货插件开发、组合编辑与组合参考技能。[打包安装教程](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/user/develop/basic/publish.zh.md)另说明 npm、Git 与 tarball 分发；这是创作者可选择的分发路径，不计入本轮任务完成对照。

dsh-market 的[分组/配置 preset 实现](https://github.com/dsh-market/dsh-market/blob/2477c36e2226b6ed731c88e66adc5a431976dcaa/src/presets.ts)保存启用状态及 bundle 顺序，应用前做 trial 校验；不是按一句业务需求自动生成跨插件工作流的证据。awesome 的[投稿规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/a5284f29fddb836f4afb87893fa9ea6c8b4cb9ff/contributing.md)接受自身提供配置/协调行为的组合包，纯依赖聚合包不单独列一行。因此不能说生态里“没有组合”。

## 对 Finder 叙事与验证的约束

- 可以说正在尝试把匹配、覆盖核对、使用/组合、必要时创造及结果验证连成更容易完成的用户路径；这是产品假设，是否有改善须实跑对照。
- 不说“首个对话找插件”“首次一键安装”“现有平台只能让用户手动写代码”“官方完全没有市场或创造能力”。
- 对照任务应允许对方使用其已文档化的最佳路径，例如官方 Creator + awesome 索引、dsh-find-plugin + Agent；不能故意只拿纯目录页面当弱基线。
- 先用相同的目标、权限、模型与初始安装状态比较：能否自然说明缺项、合理选现成/组合/创建、任务成功与人工操作次数、失败后是否能安全续接。发布/投稿只有用户有明确授权时才应发生，不能为“闭环”擅自公开作品。

## 后续方向：作者自愿公开分发

让新能力在创作者明确选择公开后服务其他人，是 Finder 的未来研究方向，当前没有公开回流池。awesome 已有向目录提 PR 的投稿路径，dsh-market 引导投稿到 awesome，官方也有上述 npm、Git 与 tarball 分发方式。未来可研究怎样衔接这些既有渠道；不能把尚未确认的自动发布能力当成现有方案的缺口，也不能把本地创建、安装或持久化等同公共发布。

## 关于“头部 / 长尾五五开”

本次没有足以支持“不同场景普遍五五开”的一手证据，也没有 Harness 需求分布样本。一次有界论文检索定位到 Brynjolfsson 等关于 Long Tails / Superstars 的研究，但 SSRN 原文页触发安全验证，未读取论文正文，未据搜索摘要采纳任何数值。故五五开**不是已证据化前提**，本轮不引用该论文支持产品假设。

若后续需要这个论点，应先定义“头部”按插件数量、调用量、任务量还是用户量划分，固定排名切点和观察窗口，再读取真实分布；插件目录规模与下载排名都不能直接替代用户需求分布。
