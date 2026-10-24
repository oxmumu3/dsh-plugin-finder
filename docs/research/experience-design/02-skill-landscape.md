# 产品体验设计 Skill 盘点与采用边界

核对日期：2026-10-23。方法：本地文件、软链与配置只读核对；GitHub connector 读取 canonical 仓库元数据、固定版本正文、目录和许可证。未运行第三方安装器或脚本，未启用 Impeccable。后续 frontend-design 的安装由主任务执行，本报告回读文件与软链确认其落地。

## 结论

采用两层补充：用固定版本的 Anthropic `frontend-design`承担视觉执行，用自有 `product-experience-design`连接任务分析、交互模型、状态、品牌表达、原型和实测。已有 `visual-style`继续提供项目视觉约束。Impeccable 作为方法研究材料，不整包启用。

这些技能是执行层补充，不能替代理论研究、真实用户研究或用户测试。设计原则和自动检测帮助发现问题；只有相应测试能证明目标用户是否理解并完成任务。单次本地走查也不能证明普遍易用或长期效果。

## 现有能力与缺口

| 来源 | 已有价值 | 本次缺口 / 适用边界 |
|---|---|---|
| 自有 `visual-style` | 先定方向、字体颜色布局、明确视觉反模式；优先项目 DESIGN.md | 主要约束视觉，未覆盖从用户任务到交互及状态的完整推导。不能把品牌参考配色当成适用于所有插件的统一皮肤。 |
| Product Design `audit` | 当前截图取证、逐步体验审计、UX及可访问性风险、验证边界 | 适合已有界面审计；其插件路由中的浏览器默认和强制三图选择需服从本地ego规则与用户已明确的范围，不直接移植为通用审批流程。 |
| Anthropic `frontend-design` | 从产品主题推导视觉，紧凑token计划、文案、自审和渲染检查 | 是视觉实现补充；没有独立完成用户研究、AI持续服务或宿主能力核验。不能由“精致”推出交互有效。 |
| Impeccable | `shape / operate / critique / onboard / harden`覆盖任务、首次使用、认知负担、恢复和产品界面克制 | 当前是提示词与工具运行时组合；整包采用会引入可执行代码、网络请求、项目hook与额外选择流程，超出本次需要。 |

## 上游身份、固定版本与许可

| 项目 | 已核验 canonical owner/repo | 本次审查 commit | 许可与入口 |
|---|---|---|---|
| Anthropic Skills | `anthropics/skills`，public | `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | [frontend-design目录](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design)；[Apache-2.0许可证](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design/LICENSE.txt) |
| Impeccable | `pbakaus/impeccable`，public | `5cb95eea9c96479f57afe0732a45470d30183326` | [仓库](https://github.com/pbakaus/impeccable/tree/5cb95eea9c96479f57afe0732a45470d30183326)；[Apache-2.0许可证](https://github.com/pbakaus/impeccable/blob/5cb95eea9c96479f57afe0732a45470d30183326/LICENSE)；[第三方NOTICE](https://github.com/pbakaus/impeccable/blob/5cb95eea9c96479f57afe0732a45470d30183326/NOTICE.md) |

Impeccable 的 NOTICE注明iOS/Android平台参考来自MIT许可的 `ehmo/platform-design-skills`。若未来复制或改写上游文件，应保留相应许可、归属和变更说明，随分发处理适用的NOTICE。本次自有SOP独立组织方法并链接来源，没有复制整套上游技能。

### frontend-design：本次采用的纯声明式补充

固定commit的 `skills/frontend-design/`只有 `SKILL.md`和 `LICENSE.txt`。该包没有脚本、hook或安装后自动请求外部服务的机制；正文仍会指导代理写代码和按环境做渲染检查，实际行为权限由任务授权与宿主控制。

主任务已将这两份文件放入共享真源 `claude-shared/agents/skills/frontend-design/`，Codex的 `~/.codex/skills/frontend-design`为指向它的相对软链。回读本地SKILL文件的Git blob为 `a5333457c414d20d625f307df945842c0952ecc3`，与本次上游读取的SKILL blob一致。文件和软链存在不等于新会话已自动触发，也不等于产品设计质量已通过。

盘点开始时它不在Codex个人Skill目录；Claude官方marketplace仅缓存了同名文件，未见个人 `installed_plugins`或 `enabledPlugins`启用记录。不能把那份缓存当成此前已启用的跨产品技能。

### Impeccable：研究方法，不整包启用

当前[SKILL入口](https://github.com/pbakaus/impeccable/blob/5cb95eea9c96479f57afe0732a45470d30183326/skill/SKILL.src.md)包含launcher和 `npx impeccable`命令调用，`ENGINE_VERSION`为 `0.1.16`；这不是只有Markdown的提示词包。

- [launcher](https://github.com/pbakaus/impeccable/blob/5cb95eea9c96479f57afe0732a45470d30183326/skill/scripts/impeccable)会使用本地engine，或下载GitHub Release二进制到本机cache，校验SHA256后设执行位并运行。检查和下载机制存在，不代表本次已完成二进制安全审计。
- [README](https://github.com/pbakaus/impeccable/blob/5cb95eea9c96479f57afe0732a45470d30183326/README.md)说明install/update可写项目hook；不同宿主可能在文件编辑或Stop事件自动调用检测器。未获任务需要时，不为获取设计建议引入这些运行机制。
- 新视觉方向的roll要访问 `impeccable.style`。匿名telemetry可关闭，但关闭后roll API请求仍存在；不能把“关闭telemetry”等同于“完全离线”。
- [shape](https://github.com/pbakaus/impeccable/blob/5cb95eea9c96479f57afe0732a45470d30183326/skill/reference/shape.md)要求访谈并确认brief后停止；[new-work](https://github.com/pbakaus/impeccable/blob/5cb95eea9c96479f57afe0732a45470d30183326/skill/reference/new-work.md)还有视觉选择、资产和构建gate。可学习它们为何先定义任务与状态，不把整个节奏强加给已明确方向的用户。

值得吸收的判断：`operate`把工作界面的可扫描性、熟悉控件与一致性放在表达欲前；`onboard / harden`提醒首次使用、空态、失败和恢复是产品的一部分；`critique`强调分离视觉喜好与任务表现。它们仍需由当前产品证据和用户测试裁决。

## 自有Skill的职责

通用Skill应回答“谁在什么情境下完成什么任务，用哪种交互和状态反馈更省力，品牌如何帮助理解，怎样验证”。项目规则另放reference；不把DSH本次单一对话与可编辑卡片扩成所有产品必须聊天、永远不能有tabs或三稿必选。

本次DSH/Finder保留用户明确的边界：需求入口与推荐在同一首页，创作也是用户可主动选择的路径，不必等全市场无供给才出现。本轮另提出把精选与有依据的推荐合成一个去重场景集合，仍待走查与用户审阅。不能把它们扩成通用体验定律。

共享真源为 `claude-shared/agents/skills/product-experience-design/`；Claude/Codex通过软链或薄adapter复用，同名完整副本容易漂移。注册和激活由主任务处理，本报告不修改registry或运行配置。

## 验证范围

先用Skill格式校验与定向引用检查确认包可读；再用隔离行为测试检查它是否保留已定产品决策、能否把原则落实到观察点。现有共享core的 `skills scan / audit / views status`可检查真源与链接；`skills validate`可能执行registry中各包命令，使用前应知其范围。

对实际产品仍需独立验证主任务、状态恢复、键盘、窄屏及真实服务边界。假数据原型、源码支持、安装配置、接口接受、实际用户完成是不同证据，不能互相替代。Google PAIR本次只读到cookie提示，不能列作已经阅读的理论依据。
