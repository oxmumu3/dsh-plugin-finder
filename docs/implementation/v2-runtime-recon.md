# Finder V2：运行环境、更新与两路径实跑侦察

只读核查：2026-10-23 07:32–07:36 UTC。该记录未安装、卸载、停用、重启、操作原生 UI、调用模型或修改用户数据；仅此文档为新增文件。

## 当前已核实状态

| 项目 | 本次读回 |
| --- | --- |
| 安装位置 | `<local-home>/.dsh/profiles/desktop/node_modules/dsh-plugin-finder` |
| 实装版本 | `0.5.0-preview.1` |
| 安装文件 | 与 2026-10-22 最后安全快照的 38/38 个文件逐字节一致 |
| `dist/client.js` SHA-256 | `82c966984a44879df513358369d2ad956d8a0d24863818c75db4143d19421852` |
| Finder 任务 | 5 条；与昨日快照的 5 条 `serialized` 全部相同，无新增任务 |
| `plugin_finder.json` | 1075 B；SHA-256 `e69a65d6cc4913c153c432eb846df008b82ccc0183644fbcea6b51571ee5ac47`，与昨日相同 |
| `plugin_finder_history.json` | 816200 B；SHA-256 `abe8a62076b84e57996d2aed23d845cded331ddecef9c6a1d24916ea09ddd9df`，与昨日相同 |
| 当前 Desktop | main PID `27247`；Host PID `27312`，父进程 `27247`；启动于 2026-10-22 23:28 本地时间 |
| 当前 Host 监听 | `127.0.0.1:54533` |
| Connector 0.5 | 认证 status 返回 online / native task worker ready；`list_tasks(status=running)` 返回 0 条 |

旧记录中的 Desktop `27339` / Host `27365` / 端口 `54436` 已过期。本次 Connector status 的插件清单来自 persisted manifest，不能证明组件当前 active。Connector 的 running=0 只覆盖它创建的任务，不证明所有普通原生会话空闲。CPU 低和会话文件时间也不是空闲证据；原生更新前仍由 UI owner 核对真实宿主活动状态。本次未重新读取原生草稿数据库，因此草稿当前不变尚待新的私有稳定快照证明。

只读复查命令（不输出进程参数或凭据）：

```sh
ps -axo pid,ppid,lstart,etime,%cpu,comm | rg -i 'deepseek|harness|dsh'
/usr/sbin/lsof -nP -a -p 27312 -iTCP -sTCP:LISTEN
node -e "const p=require('<local-home>/.dsh/profiles/desktop/node_modules/dsh-plugin-finder/package.json'); console.log(JSON.stringify({name:p.name,version:p.version}))"
```

## 保留数据的官方更新路径

1. 在当前活跃的 desktop profile 创建新私有基线：两个 Finder JSON、可选存在的 telemetry JSON、关联会话压缩文件的哈希、LevelDB 稳定副本及指定草稿键、Finder 本机输入副本/推荐偏好。私有目录用 `0700`，原始副本文件 `0600`，交付目录只留计数/哈希/不变断言。
2. 在新包生成后核对确切包名/版本/SHA-256/所有包内文件。保留下面已核验的 0.5 回退包。
3. 使用原生插件管理器的当前官方更新路径。该宿主的 `installBundle()` 对同名已安装 bundle 返回 `already-installed`；实质更新为 `removeBundle(name)` 后 `installBundle(spec, options)`，不是原子操作。安装 options 为 `{enabled:true,saveExact:true,requestId:<fresh UUID>}`。
4. 有 HMR 时 `publishAndReload()` 经 `hmr.reconcileProfile()` 协调，不要求主动重启 Host；但共享 desktop profile 的包管理锁和 HMR 队列会被使用，且广播 plugin-manager changed，不能承诺其他任务零影响。若管理器返回需重启/被使用/失败，保留证据并由 owner 决定，不能以 CLI 或手改 node_modules 绕过。
5. 成功后读回目标版本、enabled、组件 active / running、Finder bootstrap，再做包与安装目录全文件比对。比对旧任务 serialized、旧草稿 whole-value、输入副本与偏好，确认普通/Creator 原关联没有改变；最后再开始新增合成验收。
6. remove 成功而 install 失败时，优先通过同一个官方管理器重装已知 0.5 包。不要从旧快照覆盖整个 profile 或全量数据库，以免覆盖并发产生的合法工作。

官方实现依据（本机安装包拆包源码，当前仍存在）：

- `<temporary-workspace>/dsh-plugin-manager/lib/index.js`：1970 install、1991 already-installed、2137 remove、2324 configure/runExclusive、2351 publishAndReload、2360 reconcileProfile。
- `<temporary-workspace>/dsh-plugin-manager/lib/typert.host.js`：530 install、640 remove、672 enable 的参数说明。
- RPC 形状：`POST /api/<method>`（例如 `/api/pluginManager/listBundles`），`{type:'client-request',rpcId,method:'pluginManager/<method>',payload:{args:<named parameters>}}`。需要当前 Host 认证；不能使用旧端口或从日志打印/复制 Cookie、launch token。2026-10-23 隔离 Host 实测统一 `/api/remote.rpc` 返回 404；昨日笔记该地址不适用于当前安装版，已按真实网关的 `/api` prefix + endpoint 和原实跑 helper 修正。
- 当前源码 `index.js` 定义独立 `plugin_finder`、`plugin_finder_history`、`plugin_finder_telemetry` storage domains；`src/lifecycle.js` 关闭 domain handle 而不删除其数据。卸载 bundle 本身不清空这些领域数据。

0.5 回退包（本次重新哈希）：

```text
<project-workspace>/output/dsh-plugin-finder-featured-2026-10-22/dsh-plugin-finder-0.5.0-preview.1.tgz
182212 bytes
SHA-256 eaa2319806591f1a1823d2e2257ec41519d82da9a03dc71417af8124a1b43910
```

旧 0.6 本地候选仍存在（194300 B，SHA-256 `c43af2282140237c45eb50a2dbbc9b996b84962db91d6d2f76a4b1618a46f1c7`），它没有 V2 新实现，不能作为本次新包或新体验证据。

## 可复用脚本与注意点

| 现存文件 | 用途与复用限制 |
| --- | --- |
| `<temporary-workspace>` | 稳定复制 Finder JSON + Chromium LevelDB，读任务/会话关联，只输出哈希与计数。硬编码旧 PID、输出目录、基线名称，必须改成本轮值再执行。最多 3 次前后/副本哈希一致检查；失败即停，不打开原 DB。 |
| `<temporary-workspace>` | 在另一个一次性 LevelDB 副本上只取已知关联草稿键；同时哈希关联 session 压缩文件。依赖旧恢复记录推导 Chromium key 编码；不得枚举/打印其他会话正文。 |
| `<temporary-workspace>/snapshot-desktop-after-update.py` | 更新后快照的旧实现；基线和输出路径硬编码，需适配。 |
| `<temporary-workspace>/verify-native-matching-draft.mjs` | 从生产 controller 的 `prompt()` 派生预期草稿，比较精确文本；旧 task/session IDs、旧验证源码路径必须替换。 |
| `<temporary-workspace>/verify-native-creator-draft.mjs` | 比较当前 creation.draft 与唯一 Creator attempt 的真实 draft；旧 ID 和快照路径必须替换。 |
| `<temporary-workspace>/run-matching.mjs` | 原现成路径的真实 analyze → recommend 请求和合成需求。 |
| `<temporary-workspace>/run-customization.mjs` | 原主动定制路径的 analyze → recommend → creation-start。 |
| `<temporary-workspace>/confirm-customization-after-fix.mjs` | creation-update/confirm 示例，问题 ID 和 assumptions 数组位置硬编码为旧模型结果；必须按本轮返回问题生成，不能照跑。 |
| `<temporary-workspace>/acceptance-api.mjs` | 旧隔离 Host HTTP helper；`runtime.json` 虽还在，`api-cookie.private.txt` 已删除，因此不能当成可连接 runtime。 |
| `<temporary-workspace>/hot-update-preserve.mjs` | 展示 remove/install/readback 和 byte invariant 的完整旧逻辑；硬编码 `profiles/web`、0.4 版本及需有 creation 状态，不可对 Desktop 原样执行。 |

这些是参考与改写起点，不是可直接运行的当前验收命令。旧脚本里的隔离 host restart/credential setup 不在本次使用路径内。

## 本轮两条有界真实路径

UI owner 使用新装最终包、当前宿主默认模型、专用合成工作区；记录实际 task/revision/session/attempt ID。每条路径运行一次，允许一次明确的瞬时模型失败重试；每请求设有界超时（旧 helper：Finder 240 秒，RPC 300 秒）。失败不自动新开会话、换 profile 或并发重复任务。不得把 0.4 / 0.5 旧结果算成本轮通过。

**A：已有能力。** 首页输入下列需求，实跑新的连续查找 UI，检查结果、来源状态、方案/理解调整以及精确版本。选择专用合成工作区，预览并准备普通会话草稿，读回 `applied/preserved/blocked`；以当前生产 controller 生成的 prompt 比较草稿，核对 0 用户发送/0 turn。重新打开历史应恢复原 task/revision/session，无重搜或覆盖。可以在已有合成文件上验证候选能力，但推荐、候选安装和渲染必须独立记证据。

```text
这是开发验收用的合成任务。我想在 DSH 右侧查看本地 Markdown 文件 plugin-discovery-demo.md 中的 Mermaid 流程图和 KaTeX 数学公式。请查找现成能力，说明安装前提、怎样只读打开和验证。原文件不修改，不上传第三方知识库。
```

**B：主动定制。** 首页输入下列需求，先真实检索，然后明确从共创入口继续。完成引导、澄清、局部编辑、可读蓝图、确认后的供给复查。代理默认值标 `assumed:true`，不能编造用户回答。确认 `creation.status=ready` 和 `supply.status=current` 后，预览并接续官方 `cordis`；读回唯一 attempt、草稿与 `creation.draft` 精确相同，重复继续仍是同一会话。已授权的 Creator 实施若执行，只在本轮合成目录发送有界任务；其代码/build/install/功能验收再单独记录，不把草稿接通当成完成建造。

```text
这是开发验收用的合成需求。我明确想定制一个 DSH 本地 Markdown 阅读列表，即使有现成插件也按主动定制讨论，不要据此宣称生态没有供给。首版针对我手动选择的一个本地目录，只读查看 Markdown 原文；我手工填写标题、主题和阅读状态（未读、在读、已读），在一个简单列表里按主题或阅读状态筛选，点击能打开原文。元信息存于所选工作区中的独立 JSON，绝不改写 Markdown 原文件，不扫描其他目录，不做自动抓取、云同步或后台定时，不上传第三方知识库，不新配模型 Key。请先核对现成能力，再协作给出最小首版方案。
```

服务契约仍在 `src/routes.js`：`GET /api/plugin_finder/bootstrap`；其余 POST JSON。最小顺序为 `analyze({request})` → `recommend({taskId,revisionId,intent})`；共创再 `creation-start({taskId,revisionId,trigger:'user-customization',reason})` → `creation-update({taskId,revisionId,answers,blueprint?,assumptions?,confirm:true})`。每次后续使用最新回包的 ID，不沿用旧 revision。HTTP 实跑只能证明服务路径，必须补 UI 的输入、状态、错误恢复和草稿接续证据。

已有自动测试的正确命令（由实施 owner 在最终变更后执行）：

```sh
npm test
npm run build
git diff --check
```

定向回归覆盖参考：`test/live-service.test.mjs`、`test/creation-service.test.mjs`、`test/creator-handoff.test.mjs`、`test/history-refinement.test.mjs`、`test/featured-integration.test.mjs`。`live-service.test.mjs` 使用 mock model/discovery，名字中的 live 不代表联网或真实模型。

## 证据归档边界

旧完整实跑档案在 `Agent/output/dsh-plugin-finder-creator-2026-10-22/evidence/runtime/`；上次未安装 0.6 的记录在 `Agent/output/dsh-plugin-finder-single-flow-2026-10-22/native-install-blocker.md`。本轮验收另建版本化目录；保留模型失败、修复前后与最终包身份，不覆写旧记录。新资料只报告合成需求、状态、来源、计数和哈希；私人历史正文、草稿、数据库、Cookie/token/model credentials 不进公共包或安全证据索引。

## 后续授权：独立官方 Host 已准备

2026-10-23 07:47 UTC 左右，owner 确认共享 Desktop 仍有家庭助手、AI 分身、Dot 等任务，明确禁止更新或重启，改授权准备隔离真实实跑。已核对当前安装包的 `dsh-home-paths`、`dsh-app-boot`、官方 CLI wrapper 与账户 grant 实现，并启动独立进程：

- 私有 root：`<temporary-workspace>`；Host PID `11304`，`http://127.0.0.1:51889`。
- `DSH_HOME=<root>/home`、`DSH_AGENTS_HOME=<root>/agents`，独立 `web` profile，只选官方 `dsh-base` 和 `dsh-web-app`。仅合成工作区，ID `redacted-record-id`。
- 配置采用已核实的 `deepseek-account / deepseek-flash`；只复制这一账户的单个 grant 到私有 `0600` 文件，未带入 desktop profile、第三方插件、历史或草稿。源凭据文件最终哈希仍相同。
- 显式关闭 `schedule`、`ui-schedule`、`session-title-llm`、`session-telemetry-otel` 和 Desktop 产品遥测；设置 `DSH_TELEMETRY_DISABLED=1`。未加载微信、Dot、AI 分身、家庭助手，不开浏览器。
- 共享 Desktop main `27247` / Host `27312` 的 PID/启动时间保持原值。未调用模型、未发送任务；新 Finder 最终包待 owner 提供。

临时 helper：`<temporary-workspace>`，提供 `prepare`、`start`、`connect`、`install`、`status`、`stop`。`prepare` 总是新建私有目录；后续只接受 helper 自建的 `<temporary-workspace>*`。启动命令用 Desktop 官方 Electron 的 Node 模式和随包 CLI；不启动 Desktop app main。API helper 为 `<root>/acceptance-api.mjs`，导出 `rpc`、`finder`、`context`，认证仅从本 runtime 读取，证据限定新合成数据。

```sh
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' <temporary-workspace> install <temporary-workspace> '/absolute/final-package.tgz' '<sha256>'
ELECTRON_RUN_AS_NODE=1 '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness' <temporary-workspace> status <temporary-workspace>
```

`launch-url.private.txt`、`api-cookie.private.txt`、`.credentials.yaml`、`host.private.log` 都不得输出到聊天或安全证据。验收 owner 完成后可运行 helper 的 `stop <root>`；它先核对 PID、监听和 cwd，只停止这个隔离 Host，再删除这四项临时秘密，保留合成历史与安全证据。
