# 官方 Creator 与 Finder 接续能力核查

2026-10-22（用户时区 America/Mexico_City）。只读核查，未创建宿主会话、调用宿主模型、安装插件或重启 App。

## 来源与版本

官方 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 `master` 与 `dsh-v0.2.1-rc.2` 在本轮核查时均指向 [`687f282e8625c6b8d11ff58211a90524be2e4317`](https://github.com/deepseek-ai/deepseek-harness/commit/687f282e8625c6b8d11ff58211a90524be2e4317)。通过官方 GitHub 页面、远端 ref 和固定提交源码交叉核对；读取的 15 份当前文件与本地相关文件一致。该结论是本轮快照，不保证后续 master 不变。

本地完整源码位于 `DSH/dsh-wechat-desktop-source/`，本地 checkout HEAD 与当前官方 HEAD 不同，不能用整个本地 checkout 冒称当前官方；只有逐字核对过的相关文件可作本轮 API 依据。

浏览器核查仅用 ego TaskSpace `62`，已正常结束，无其他 Space；未触及用户日常 Chrome。

## 可复用的官方建造能力

- Creator 预设 id 为 `cordis`，内置 `cordis-plugin-development`、UI/MCP 模板、`cordis_inspect_list/query` 与 `plugin_manager`。先检查实际安装中的宿主 API，再编写工作区 bundle、通过原生管理器安装、验证实际行为。[官方开发 Skill](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset/skills/cordis-plugin-development/SKILL.md#L6-L32)
- 当前路径是持久化 bundle，旧动态插件卡片与进程内 runner 不是当前 Creator 路径。[官方 extensions 说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/extensions/README.md#L10-L12)
- UI 应通过已分配 slots 增加内容，不能替换 app root 或向 body 再挂一套应用。[官方 UI 开发约束](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset/skills/cordis-plugin-development/references/ui-plugin.md#L3-L13)

## 安全 Creator 会话接续

当前官方支持 `ctx.sessions.create({workspaceId, agentPreset:'cordis'})`，不提供 `sessionId` 时 Host 创建新会话身份。[Client API](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/client/contract/sessions.ts#L81-L93)、[Host 实现](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/agent.ts#L269-L281)。

新会话 `retain` 并等待 ready 后，需要核对精确 binding 与 `binding.session.projections.faceOf('agentPreset').getSnapshot() === 'cordis'`。只传参数不能证明预设生效。[projection API](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/client/contract/session.ts#L51-L67)

Client 创建错误包装为 `SessionCreateError.rpcError`，Host 的 `session/workspace-attach-failed` 在 `rpcError.details.sessionId` 带回真实已创建 ID。前端 IWorkspaces 没有 attach facade；再次 create 并带该 ID 也不能假定重挂，Host 的 reusable 条件可能导致新建。首版应保存 ID 并提供打开/复制降级，不自动重建。[创建与错误语义](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/commands.ts#L125-L149)

Finder 再复用已有 binding 的草稿初始化，保留 `clearPreviousDraft:false` 和 `applied/preserved/blocked` 区分。普通方案继续用原有路径；建造分支只写入新 Creator 会话。

不要把 `connectWorkspace(workspaceId,{agentPreset:'cordis'})` 当作“必定创建新会话”：它可能复用带未发草稿的 blank 并改变其预设。[导航实现](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-workspace/src/client/navigation.ts#L193-L232)、[官方对应 e2e](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/web/tests/agent-preset-selection.e2e.ts#L438-L478)。

| 版本 | 已核事实 | Finder 新分支策略 |
| --- | --- | --- |
| `0.2.1-rc.2` | create/connectWorkspace 支持 agentPreset | 可实现并验收新 Creator 会话 |
| `0.2.0-rc.2` | 两者不支持该参数，可能被静默忽略 | 不调用自动 Creator 接续；保留方案复制和手选路径 |
| 其他版本 | 本轮未验证 | 不能继承以上验收，需要核对 API 与实际预设 |

[0.2.0 create 源码](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/api/session-controller/src/client/sessions/service.ts#L425-L438)、[0.2.1 create 源码](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/client/sessions/service.ts#L427-L443)。

## 安装与运行边界

安装作用于整个 profile，影响其中所有会话；Host 代码在宿主进程内、沙箱外执行。安装结果要区分 applied、restart-required 与失败。不能把工作区子目录等同运行隔离，也不能把构建/安装成功等同实际任务完成。[官方 Plugin Manager](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/plugin-manager/README.md#L29-L42)

Finder 当前模型路径已使用宿主 `agentDefaultModel.currentSelection()` 与 `llm.prepareCall`。新增共创沿用此路径，正常消耗现有额度，不新增专用 Key。Creator 会话后续推理也有正常用量；外部服务可能另有前提。

## 已有独立 Builder 的查找范围

有界查找覆盖 `DSH/` 一级、二级项目目录，排除依赖/构建/日志后的 Creator/Builder 文件名，及 Markdown 中“构建好插件 / 创造好插件 / 一起创造 / plugin builder / dsh builder / dsh creator”等关键词。另看了当前可列的 Codex chat 标题和摘要（50 个近期非置顶及所有置顶），未唤醒或发送任何其他 chat。

找到官方 Creator 和 Finder 的 `creator-feedback`（后者是反馈草稿功能）。在上述范围内未定位到独立自建 Builder 的源码或发布证据；**不能据此断言其他工作区、归档 chat 或产品中不存在**。若之后定位到本人已有实现，应优先复核复用。

## 与本轮交付的关系

本轮只确认可采用的官方路径与兼容限制。Finder 尚未集成这些新行为。设计见 `docs/superpowers/specs/2026-10-22-discover-to-create-design.md`；未来新包需独立通过本地测试、隔离安装、真实宿主与模型、生成插件运行、用户首用和发布读回。
