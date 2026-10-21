# 集中匹配记录收集器

独立 Cloudflare Worker + D1。没有网站或作者登录后台，不复用 Finvo 资源。宿主插件只有在用户明确同意后才注册、产生新事件及后台回传；服务器只接受共享 `src/telemetry-contract.js` 的白名单事件。

已部署端点：`https://dsh-plugin-finder-feedback-v1.dsh-plugin-finder.workers.dev`。独立数据库 `dsh-plugin-finder-feedback-v1`；Cloudflare 的实际部署响应确认账户为 Workers Free，未升级。2026-10-21 UTC 已用纯合成 test 事件完成公网注册、重复 ACK、跨身份冲突、鉴权、测试隔离、A/B 归因、敏感文本清理、删除及迟到写拒绝，并清理测试事件；本机 `Agent/output/plugin-finder-central-feedback-2026-10-20/collector-synthetic-smoke-2026-10-20.json` 是不含凭据的证据（不提交到源码仓库）。首次请求网络失败另外留档；这不证明任意网络或全部真实任务可用。

## HTTP v1

- `POST /v1/register`：JSON `{policyVersion,consentedAt,clientVersion,environment}`，environment 仅 `production|test`。201 返回 `{installationId,uploadToken,deleteToken}`，令牌随机且仅此时返回；D1 仅存 SHA-256。拒绝未知字段。
- `POST /v1/events`：`Authorization: Bearer <uploadToken>`，JSON `{schemaVersion:1,events:[...]}`，1–20 条，整个请求最多 65,536 bytes。200 返回 `{acceptedEventIds,receivedAt}`，只 ACK 本安装拥有的事件。相同 eventId 幂等；其他安装拥有相同 ID 返回 409。整批先校验再事务写入。
- `DELETE /v1/installation`：使用独立 deleteToken，200 返回 `{deleted:true}`。原子撤销、删除全部事件；旧 uploadToken 不能再写，重复删除仍成功。不能用 uploadToken 删除或管理数据。
- `GET /admin/summary`、`GET /admin/cases?plugin=<精确包名>&limit=25`、`GET /admin/creator-report?plugin=<精确包名>`：仅服务器 ADMIN_TOKEN 可读。默认只查询 production，显式 `includeTest=1` 才包含测试。cases 最多 100 条。
- `GET /health`：仅公开运行状态、schemaVersion 和 policyVersion，不提供任何记录。

事件必须是共享 contract 的严格白名单：`{schemaVersion:1,eventId,epochId,taskId,revisionId,type,occurredAt,clientVersion,hostVersion,data}`。服务端对自由文本再次清理敏感常见模式，版本/仓库身份不自动改写，非法值拒绝；这不是对所有个人信息的识别保证。客户端需继续遵守告知与最小化投影。

错误 JSON 只有固定 `error` 代码：400 校验、401 无效或撤销凭据、409 eventId 归属冲突、413 体积、415 Content-Type、429 本收集器容量、503 暂时不可用。没有自动外发给作者，没有在公开接口读数据的权限。

## 数据与配额

事件保留 90 天，每小时清理；查询实时排除超龄事件。无近期事件的超过 90 天旧身份、撤销身份及旧日计数也清理。清理旧身份后其凭据失效。匿名同意周期不等于独立人数。作者汇总区分 candidateAppearances（plan_generated 中出现）、modelRecommendations（该插件被模型选中）、userSelections（plan_selected 中该插件被用户明确选择）；eventTypes 是引用该插件的过程事件，不是它的采用数。任务反馈仅标为含该插件所选或推荐方案的任务自报，不等于任一插件的安装、调用或成功；verifiedInstallations/verifiedTaskSuccesses 固定为 0。

SQL trigger 与 D1 batch 在并发中执行配额及撤销检查：注册 100/UTC日、同来源 IP 的当日不可逆带密钥哈希桶 5/日、身份最多 2,000；事件 5,000/UTC日、每身份 500/日；留存最多 50,000 事件、100 MiB payload。不存明文 IP，哈希按天轮换。删除事件不会返还当日写配额。D1 计数与事件同事务，超过限额回滚整批，不静默丢数据。

使用 Workers Free 的平台默认 CPU 限额（免费套餐不接受显式 cpu_ms 配置），未启用请求日志/Logpush、R2、Queues、AI、付费升级或自定义域。账户本身的计费套餐由操作者管理；应用限额不能替代平台限额或防护所有未授权请求。不能通过升级付费套餐绕过容量错误。

## 管理查询

管理员凭据放在 workspace 外 `~/.config/dsh-plugin-finder/collector-admin.json`（0600），格式 `{endpoint,adminToken}`；不放源码、安装包或参数。CLI 不输出凭据，也拒绝宽权限文件。

```sh
node collector/query.mjs summary
node collector/query.mjs cases --plugin dsh-local-library
node collector/query.mjs creator-report --plugin dsh-local-library
node collector/query.mjs summary --include-test
```

首次部署：使用已授权 Wrangler 为**本收集器独立数据库**应用 `schema.sql`；dry-run 后部署此目录配置，通过 stdin 写 ADMIN_TOKEN secret，再读回 health、未授权拒绝、synthetic test register/upload/幂等/admin/delete/迟到写闭环。仅合成测试可默认运行；不能代替真实用户点击同意，也不能倒灌历史。不得执行公开输出 token 的 curl 或 env dump。
