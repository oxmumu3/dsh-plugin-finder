# 需求匹配后的创作引导

2026-10-22。实现范围为 `src/creation-guide.js` 和纯界面树测试；不调用宿主、不创建会话、不运行模型或安装插件。界面接入由主流程负责。

## 入口与行为

- 结果页的创作入口先打开引导；仅查看内容不调用模型。
- 显示当次已理解的目标；目标缺失时回退原始需求。只截短显示，不修改保存内容。
- `native / single / combo` 明示已有可尝试方案，保留用户主动定制的选择。
- `discovery.sources` 或 `sourceCoverage` 的 `failed / stale`，以及顶层 `status:failed`，显示“搜索未完成”；不能转成生态无供给或新建的必要性。缺少搜索记录同样保留未知。
- “重新找方案”回到原方案后重试原有 `recommend()`；“回看现成方案”只导航。模块不清除需求、方案或历史。
- “用我的需求起草”是唯一创作动作，调用既有 `startCreation()`。当前任务、版本或方案缺失、模型明确未配置、或任务忙碌时禁用。

## 能力依据

复用本项目 [Creator 能力审计](2026-10-22-creator-capability-audit.md) 的固定版本，不将本机整个 checkout 冒称最新官方源码。版本为 DSH `0.2.1-rc.2`，固定提交 `687f282e8625c6b8d11ff58211a90524be2e4317`。

本轮用 GitHub connector 再次读取该固定提交的官方文件：

- [Creator 开发说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset/skills/cordis-plugin-development/SKILL.md)：持久化 bundle、按安装版本检查接口、原生管理器安装及实际行为验证；MCP 与 UI 模板的明确文件路径。
- [实践说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset/skills/cordis-plugin-development/references/practices.md)：在宿主 slot 内呈现界面；插件独立数据使用检查得到的 storage service；工具和状态扩展不能猜接口。
- [UI 与工具共用操作](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset/skills/cordis-plugin-development/references/user-actions.md)：Host 服务负责操作；界面与 Agent 工具复用相同语义；授权性操作留给用户。

[UI 文档](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset/skills/cordis-plugin-development/references/ui-plugin.md) 的链接来自已核审计，并在本轮读过对应本地文件；不拼接未经来源出现的站点文档路径。

“沿用宿主模型”依据本项目 `src/model.js` 的 `agentDefaultModel.currentSelection()` 与 `llm.prepareCall()`。这是 Finder 现有共创调用方式，不能扩写成所有插件均无需外部账号或服务配置。

版本、提交、源码路径和安装影响收进原生 `<details>`；界面主内容用任务语言解释侧栏、工具、本机进度、外部服务和现有模型。

## 两个参考案例的证据层级

### 阅读列表：合成样例已实跑

依据 [Creator 首版记录](../creator-preview.md) 与 [验证范围](../verification.md)：`dsh-reading-shelf-fixture@0.1.0` 的元信息保存、主题/状态筛选、只读预览、Refresh 后读取已在合成目录跑通；两份原文的 hash 与 mtime 未变。界面明确这是合成样例；手工绝对路径、目录选择器未验证、重启恢复/长期稳定性/外部接受未验证仍保留。

它提供的首版做法是“限定目录、原文只读、元信息独立保存、一条可检查流程”，不提供公开安装链接。

### Agent Twin：仅核验预发布资产与文档

在 2026-10-22 20:00 UTC 前用 GitHub connector GET 重新读回：

| 一手来源 | 本轮读回 |
| --- | --- |
| [仓库 API](https://api.github.com/repos/oxmumu3/ai-twin-starter) | `full_name:oxmumu3/ai-twin-starter`，owner `oxmumu3`，public，repository ID `1425173537` |
| [固定发行 API](https://api.github.com/repos/oxmumu3/ai-twin-starter/releases/tags/v0.3.0) | release ID `417004231`，tag `v0.3.0`，`prerelease:true`，`draft:false` |
| 同一发行的 assets | `dsh-agent-twin-0.3.0.tgz`，ID `655528257`，67859 B；`SHA256SUMS`，ID `655528254`，91 B |
| API 声明的包 digest | `sha256:8da2ee6b1132e9132fe7772dd2b3ba157c9dfe4d52d53cd360b1ed00c33c250b` |

实际包下载及 hash 核对沿用同日 [精选来源审计](2026-10-22-featured-catalog-audit.md) 的记录，本轮未重新下载或执行。产品中只链接已读回的 [v0.3.0 预发布页](https://github.com/oxmumu3/ai-twin-starter/releases/tag/v0.3.0)，不将其叫作 latest，不新增安装操作。

案例的用途是借鉴选材、来源和权限边界。真实消息通道、业务执行和持续运行均不能由本轮发行核验推导为已验收。

## 验证

`node --test test/creation-guide.test.mjs`：8/8 通过。覆盖导航无副作用、明确起草动作、失败与未知来源、主动定制、案例证据层级、折叠来源与固定链接、忙碌及前提不足。首次运行因模块尚未实现而失败，随后实现通过；未调用模型或 runtime。

本记录不代替主流程整合后的构建、整体回归和真实界面验收。
