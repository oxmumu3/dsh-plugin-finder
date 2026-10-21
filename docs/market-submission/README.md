# Awesome DSH 收录材料草稿

仅准备材料，**未提交 PR、未联系维护者，也不表示已经收录**。候选文件为同目录 `awesome-dsh-plugin.yml`；提交时复制并改名为上游仓库的 `data/plugins/piggy00544__dsh-plugin-finder.yml`，只新增这一条，不改上游生成的 README。

条目使用 `market` 分类，说明实际的需求确认、动态发现、作者资料理解、方案版本和原生草稿接续；不宣称自动安装、全网穷尽或任务成功。安装来源钉住已发布的 **`v0.3.0-preview.2` Release tarball**，没有 `npm:` 字段，也不使用 `latest/download`。

## 上游依据

2026-10-21 读取的上游 `main` 为 **`89257f135874cf0fd21b97faa71e444dd3cf9031`**：

- [实际字段与校验规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/scripts/lib/entries.mjs#L110-L225)：允许 `url/name/category/description/tarball`；名称、目标文件名须对应仓库，英文描述必填，描述单行。`tarball` 必须是 GitHub 托管的 HTTPS Release 压缩包。
- [同类 market 条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/data/plugins/awesome-dsh-plugin__dsh-find-plugin.yml)：使用同样的仓库名称、分类和中英描述结构。
- [投稿与人工审核](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L9-L22)、[资格条件](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L52-L90)：真实代码、`dsh.bundle`、公开且维护中的仓库、创建满一天、`dsh-plugin` topic；CI 通过只是前提，仍需维护者读源码后合并。
- [预构建 tarball](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L113-L130)、[npm 可选](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L205-L213)：无需先发 npm；发布后 npm 映射另按包的 `repository` 字段识别。没有“加 topic 就自动收录”的承诺，网站 Submit 链接进入贡献指南。

## 已核对与提交前待核对

| 项目 | 当前证据或前提 |
|---|---|
| 公开源码 | `piggy00544/dsh-plugin-finder` 为 public；公开树包含 `package.json`、`cordis.patch.yml`、`dist/client.js`。清单声明 `dsh.bundle`，官方 SDK 列在 peerDependencies。 |
| topic 可发现 | 2026-10-21 06:14:43 UTC，用**未发送 Authorization 头**的 GitHub 搜索 API 查询 `repo:piggy00544/dsh-plugin-finder topic:dsh-plugin`，HTTP 200、准确命中 1，`incomplete_results=false`。这不代表 Awesome 已收录。 |
| 一天门槛 | 仓库创建于 `2026-10-20T06:37:58Z`；仅在 **2026-10-21 06:37:58 UTC（墨西哥城00:37:58）之后**才满一天。准备材料时尚未达到，提交前须重新核对。 |
| 旧版公开附件 | `v0.3.0-preview.1` tarball 已实际 HTTP 200 下载核对，121646 bytes，SHA-256 与 Release 一致；只能证明旧版附件可达。 |
| 本次目标附件 | 已发布 `v0.3.0-preview.2`，匿名 GET 实际下载 123979 bytes，SHA-256 `382b912a7e6785e3a10cf076b63377153b7a8b9c2e180efe917ce0a27de08748`；包内 31 个文件、预构建客户端与源码构建一致，无后台或管理员凭据。完整 259 项测试通过，当前 DSH 原生管理器已安装启用；安装文件与公开包一致，历史保护、方案优先、安装指引与原会话打开已读回，详见本版 Release。 |
| 当前收录状态 | 本轮公开 `plugins.json` 与 `index.json` 均未找到本仓库；本材料没有提交、受理、合并或上架回执。提交后也须以上游实际合并和公开池读回为准。 |

匿名搜索证据保存在本机、源码仓库之外：`Agent/output/plugin-finder-launch-review-2026-10-21/github-topic-anonymous-search.json`。只保留公开 URL、请求方法、无认证标记、时间、状态和必要仓库元数据，不含凭据；不把本地 output 一并提交。

本次只按已读取的规则检查候选字段和 YAML，不运行上游脚本或 CI、不发布 npm、不创建 PR。提交前应再看上游是否修改规则，并完成上表的版本附件与仓库年龄核对。
