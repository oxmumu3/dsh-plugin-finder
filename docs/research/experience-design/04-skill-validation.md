# Skill 安装与行为校验

日期：2026-10-23。用户要求将研究沉淀为 SOP / Skill，并可安装现成技能。本轮只安装声明式指导，不启用新服务、遥测、项目 hook 或二进制工具。

## 已落地的共享工具

| 包 | 真源 | 安装与检查 |
|---|---|---|
| `frontend-design` | `Agent/claude-shared/agents/skills/frontend-design/` | 来自 `anthropics/skills` 固定 commit `dbd4588f9e1033efb41dad4bef2f7947c8993d44` 的两份原文件；Apache-2.0。builtin skill-installer 下载，未运行第三方脚本。 |
| `product-experience-design` | `Agent/claude-shared/agents/skills/product-experience-design/` | 本轮自有指导；通用流程、DSH适配、来源与边界分层存放。没有执行脚本与外部请求。 |

两者均在 `shared-agent-core/config/skill-registry.json` 登记为 shared；Codex个人目录与Claude共享视图分别通过相对软链指向同一真源。定向 `skillViewsStatus` 回读四条视图均为 `installed: true`。这证明文件与注册可发现，不表示所有已开启会话已热加载或未来必然自动触发。

使用系统 `skill-creator/scripts/quick_validate.py` 校验两包，均返回 `Skill is valid!`。临时 Python venv 位于 `/tmp/finder-design-skill-validator`，仅为校验提供 PyYAML 6.0.2；不修改系统依赖。

安装后校验值：

```text
frontend-design/SKILL.md
d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3
frontend-design/LICENSE.txt
0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594
product-experience-design/SKILL.md
b4e2d32f5ccacea96fdb6c1f43eb2aa7708f7e462cd2614fed3d24da09c15724
```

Impeccable只审查固定版本与方法，**未安装/启用**。详见 [候选审查](02-skill-landscape.md)。

## 独立行为演练

独立代理读取新Skill及两份references，不读取本轮最终DESIGN和研究综合，不操作服务、不修改项目。它处理两种不同范围的任务：

1. **局部文案：** 将空态 `No data` 改成与“新建”真实行为一致的中文。输出仅建议原位文案及容器溢出检查，没有扩展为品牌重设计、重做聊天或状态机。
2. **Finder重设计：** 输出实际brief、状态与验证方式。保留单一Host入口、首页需求与探索、主动共创；区分搜索失败与无充分候选；保留原请求和版本；将家庭助手视觉认可与交互认可分开；没有宣称已做用户测试或接通Creator。

演练暴露四处需要澄清：

| 含糊处 | 本轮修正 |
|---|---|
| 小修改是否也要走全流程 | 明确按改动比例应用，文案只核对契约与溢出，纯审计交付发现与计划。 |
| 精选/推荐去重如何排序 | DSH参考明确按产品/版本去重；冷启动策展顺序，有真实信号才重排并说明。 |
| DESIGN文件是否自动代表认可 | 明确区分用户决定、核验事实与待审提案；本轮去重组织方式标为设计提案。 |
| 没有界面时是否仍声称已走查 | 明确无法渲染/纯设计时报告未测项与验证计划。 |

修正后重新格式校验通过。此次演练可发现指令歧义，不是受控可用性研究，也不证明新Skill提高真实用户效率。之前的一次无新Skill探索暴露“按功能加tabs”等风险，但两次上下文不完全相同，不作量化前后效果比较。

## 与项目连接

- 总项目方法：`DSH/docs/product-experience/SOP.md`；`DSH/DESIGN.md` 已链接。
- 本轮应用：[Finder V2设计](../../design/experience-v2/DESIGN.md)。
- 研究和技能不是验收结论：可点击HTML、生产前端、真实模型、Creator会话、安装、实际任务通过分别核对。

本轮原型的运行与截图证据见其单独 QA 记录；本文件只记录技能层。
