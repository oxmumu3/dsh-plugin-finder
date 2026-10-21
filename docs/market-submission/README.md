# Awesome DSH 收录提交记录

已于 **2026-10-21 07:35:44 UTC** 提交 [Awesome DSH PR #8439](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8439)，**等待审核，尚未合并或收录**。仅新增上游 `data/plugins/piggy00544__dsh-plugin-finder.yml`（7 行），不改生成的 README 或其他条目；同目录 `awesome-dsh-plugin.yml` 与提交内容一致。未私信维护者。

提交分支为 `piggy00544:add-dsh-plugin-finder-preview-2-20261021`，提交为 `453ae27e779017b98babd1174a69cd4fd8e1999d`。GitHub 读回 `MERGEABLE`（无冲突），`check` 正在运行；这些都不等于维护者同意收录。PR 已附加到当前工作会话。

条目使用 `market` 分类，说明实际的需求确认、动态发现、作者资料理解、方案版本和原生草稿接续；不宣称自动安装、全网穷尽或任务成功。安装来源钉住已发布的 **`v0.3.0-preview.2` Release tarball**，没有 `npm:` 字段，也不使用 `latest/download`。

## 上游依据

2026-10-21 读取的上游 `main` 为 **`89257f135874cf0fd21b97faa71e444dd3cf9031`**：

- [实际字段与校验规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/scripts/lib/entries.mjs#L110-L225)：允许 `url/name/category/description/tarball`；名称、目标文件名须对应仓库，英文描述必填，描述单行。`tarball` 必须是 GitHub 托管的 HTTPS Release 压缩包。
- [同类 market 条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/data/plugins/awesome-dsh-plugin__dsh-find-plugin.yml)：使用同样的仓库名称、分类和中英描述结构。
- [投稿与人工审核](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L9-L22)、[资格条件](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L52-L90)：真实代码、`dsh.bundle`、公开且维护中的仓库、创建满一天、`dsh-plugin` topic；CI 通过只是前提，仍需维护者读源码后合并。
- [预构建 tarball](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L113-L130)、[npm 可选](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L205-L213)：无需先发 npm；发布后 npm 映射另按包的 `repository` 字段识别。没有“加 topic 就自动收录”的承诺，网站 Submit 链接进入贡献指南。

## 提交时核对

| 项目 | 当前证据或前提 |
|---|---|
| 公开源码 | `piggy00544/dsh-plugin-finder` 为 public；公开树包含 `package.json`、`cordis.patch.yml`、`dist/client.js`。清单声明 `dsh.bundle`，官方 SDK 列在 peerDependencies。 |
| topic 可发现 | 2026-10-21 06:14:43 UTC，用**未发送 Authorization 头**的 GitHub 搜索 API 查询 `repo:piggy00544/dsh-plugin-finder topic:dsh-plugin`，HTTP 200、准确命中 1，`incomplete_results=false`。这不代表 Awesome 已收录。 |
| 一天门槛 | 仓库创建于 `2026-10-20T06:37:58Z`；本次提交于 `2026-10-21T07:35:44Z`，已超过 1 天。提交前重新核对 public、非 archived/disabled、`dsh-plugin` topic 及发布附件。 |
| 旧版公开附件 | `v0.3.0-preview.1` tarball 已实际 HTTP 200 下载核对，121646 bytes，SHA-256 与 Release 一致；只能证明旧版附件可达。 |
| 本次目标附件 | 已发布 `v0.3.0-preview.2`，匿名 GET 实际下载 123979 bytes，SHA-256 `382b912a7e6785e3a10cf076b63377153b7a8b9c2e180efe917ce0a27de08748`；包内 31 个文件、预构建客户端与源码构建一致，无后台或管理员凭据。完整 259 项测试通过，当前 DSH 原生管理器已安装启用；安装文件与公开包一致，历史保护、方案优先、安装指引与原会话打开已读回，详见本版 Release。 |
| 当前收录状态 | 最新上游 `main` 源条目中没有本仓库，作者名下也无本 Finder 的重复 PR。PR #8439 现为 `OPEN`、非 Draft，恰好 1 个新增 YAML；尚无合并或上架回执。最终收录仍以上游实际合并和公开池读回为准。 |

匿名搜索证据保存在本机、源码仓库之外：`Agent/output/plugin-finder-launch-review-2026-10-21/github-topic-anonymous-search.json`。只保留公开 URL、请求方法、无认证标记、时间、状态和必要仓库元数据，不含凭据；不把本地 output 一并提交。

本次使用安全 YAML 解析与手动字段契约检查，不运行上游脚本、不发布 npm。提交前再次确认上游规则 SHA 未变、完整条目无重复、匿名下载附件的字节数及哈希与 Release 元数据一致；PR 正文披露 AI 辅助、动态发现的有界范围、原生安装确认和默认关闭的可选反馈，不宣称独立人工安全审计。

现有 fork 落后于上游，直接同步会触发 GitHub OAuth 的 `workflow` scope 限制。本次没有扩大权限，也没有同步工作流；改从 fork 已有且属于上游祖先的基线创建独立分支，仅追加本条目。GitHub PR 三点 diff 核对仍只含 7 行新增 YAML，且无冲突。fork 的默认分支未改动。
