# Awesome DSH 收录提交记录

现行投稿为 [Awesome DSH PR #8457](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8457)，于 **2026-10-21 08:49:36 UTC** 由 **`oxmumu3`** 创建。当前 `OPEN`、非 Draft、`MERGEABLE`，**等待审核，尚未合并或收录**。只新增 `data/plugins/oxmumu3__dsh-plugin-finder.yml`（7 行，0 删除），没有改生成的 README、其他条目或工作流；同目录 `awesome-dsh-plugin.yml` 与新投稿一致。

现行 head 为 `oxmumu3/awesome-dsh-plugin:add-dsh-plugin-finder-preview-2`，提交 `adc2628ee3b513b0a0df23b508184bd7b2fb4310`。只读复核时 `check` 为 `IN_PROGRESS`，尚不能称为 CI 全部通过；不等待或推断维护者审核结果。PR 已附加到当前工作会话，未私信维护者或添加额外评论。

条目使用 `market` 分类，说明实际的需求确认、动态发现、作者资料理解、方案版本和原生草稿接续；不宣称自动安装、全网穷尽或任务成功。安装来源钉住已发布的 **`v0.3.0-preview.2` Release tarball**，没有 `npm:` 字段，也不使用 `latest/download`。

## 上游依据

2026-10-21 读取的上游 `main` 为 **`89257f135874cf0fd21b97faa71e444dd3cf9031`**：

- [实际字段与校验规则](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/scripts/lib/entries.mjs#L110-L225)：允许 `url/name/category/description/tarball`；名称、目标文件名须对应仓库，英文描述必填，描述单行。`tarball` 必须是 GitHub 托管的 HTTPS Release 压缩包。
- [同类 market 条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/data/plugins/awesome-dsh-plugin__dsh-find-plugin.yml)：使用同样的仓库名称、分类和中英描述结构。
- [投稿与人工审核](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L9-L22)、[资格条件](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L52-L90)：真实代码、`dsh.bundle`、公开且维护中的仓库、创建满一天、`dsh-plugin` topic；CI 通过只是前提，仍需维护者读源码后合并。
- [预构建 tarball](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L113-L130)、[npm 可选](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/89257f135874cf0fd21b97faa71e444dd3cf9031/contributing.md#L205-L213)：无需先发 npm；发布后 npm 映射另按包的 `repository` 字段识别。没有“加 topic 就自动收录”的承诺，网站 Submit 链接进入贡献指南。

## 现行投稿核对

| 项目 | 当前证据或前提 |
|---|---|
| 正式命名空间 | [oxmumu3/dsh-plugin-finder](https://github.com/oxmumu3/dsh-plugin-finder) 为 public；这是同一个 GitHub repository ID `1426606023` 的 owner 转移，创建时间和历史保留，并非重新创建仓库。所有现行条目 URL、name 和 tarball 均使用 `oxmumu3`。 |
| 可安装代码与 topic | 公开树包含 `package.json`、`cordis.patch.yml`、`dist/client.js`，清单声明 `dsh.bundle`，官方 SDK 列在 peerDependencies；迁移后已回读 `dsh-plugin` topic。旧命名空间的匿名搜索记录仅作历史证据，不冒充迁移后的新查询。 |
| 一天门槛 | 同一仓库创建于 `2026-10-20T06:37:58Z`；现行投稿于 `2026-10-21T08:49:36Z`，已超过 1 天。 |
| 迁移后附件 | 新命名空间的 [v0.3.0-preview.2 tarball](https://github.com/oxmumu3/dsh-plugin-finder/releases/download/v0.3.0-preview.2/dsh-plugin-finder-0.3.0-preview.2.tgz) 已匿名实际下载：HTTP 200、123979 bytes、SHA-256 `382b912a7e6785e3a10cf076b63377153b7a8b9c2e180efe917ce0a27de08748`。既有 Release asset ID `661581899` 保留，附件字节未替换。 |
| 验证范围 | 原版发布包完成 259 项测试及 DSH Desktop `0.2.1-rc.2` 原生安装启用、历史保护、安装指引和原会话打开验证；迁移后的 main 重新构建并再次通过 259 项测试。后者是迁移源码的构建与测试，不冒充重新打包或一次新的原生安装验收。 |
| 新条目核对 | 7 行 YAML 已安全解析并检查字段；本地 SHA-256 为 `5b1358cd57d275477b5089dd826004ed574210b8a2ec19cf5995cbbac12ddf27`。GitHub 读回作者 `oxmumu3`、head `oxmumu3/awesome-dsh-plugin`、目标上游 main，并确认实际 diff 只新增该条目。 |
| 当前收录状态 | PR #8457 现为 `OPEN`、非 Draft、无冲突；`check` 正在运行。尚无合并或上架回执，最终收录仍以上游实际合并和公开池读回为准。旧 PR #8439 已关闭、未合并，不构成第二个有效投稿。 |

本次新 PR 通过已核实为 `oxmumu3` 的 Ego 网页正常流程创建。GitHub connector 可读到该身份和新 fork，但创建分支返回 `403 Resource not accessible by integration`，因此停止 connector 写入；没有扩大 App 权限，也没有用旧账号 CLI 重投。

现行 PR 正文披露同仓库迁移、旧 PR 关闭、AI 辅助、动态发现的有界范围、原生安装确认和默认关闭的可选反馈，不宣称独立人工安全审计。不运行上游脚本，不发布 npm。

## 历史投稿与证据（已被现行投稿替代）

2026-10-21 07:35:44 UTC 曾通过开发账号 `piggy00544` 提交 [PR #8439](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8439)，分支为 `piggy00544:add-dsh-plugin-finder-preview-2-20261021`，提交为 `453ae27e779017b98babd1174a69cd4fd8e1999d`。当时仅新增 `data/plugins/piggy00544__dsh-plugin-finder.yml`（7 行），两项检查最终通过。因纠正正式 owner 和投稿账号，该 PR **已关闭、未合并**；这不是维护者拒收，也不表示曾经收录。

旧命名空间当时的只读证据保留原样：2026-10-21 06:14:43 UTC，用**未发送 Authorization 头**的 GitHub 搜索 API 查询 `repo:piggy00544/dsh-plugin-finder topic:dsh-plugin`，HTTP 200、准确命中 1，`incomplete_results=false`。它仅证明当时开发命名空间的 topic 可发现，不证明 Awesome 收录，也不作为新命名空间的匿名查询结果。

这份匿名搜索证据仍保存在本机、源码仓库之外：`Agent/output/plugin-finder-launch-review-2026-10-21/github-topic-anonymous-search.json`，没有篡改旧 URL 或时间。只保留公开 URL、请求方法、无认证标记、时间、状态和必要仓库元数据，不含凭据；不把本地 output 一并提交。

旧版 `v0.3.0-preview.1` tarball 当时曾实际 HTTP 200 下载核对，121646 bytes，SHA-256 与 Release 一致；它只能证明旧版附件当时可达。原 `v0.3.0-preview.2` 包内 31 个文件、预构建客户端与源码构建一致，无后台或管理员凭据；迁移保留此附件，现行下载证据见上表。

旧开发账号 fork 曾落后于上游，直接同步触发 GitHub OAuth 的 `workflow` scope 限制。当时没有扩大权限或同步工作流，而是从该 fork 已有且属于上游祖先的基线创建独立分支，仅追加条目；旧 PR 三点 diff 也只含 7 行新增 YAML，fork 默认分支未改动。这仅描述旧投稿过程，不是现行 `oxmumu3` PR 的创建方式。
