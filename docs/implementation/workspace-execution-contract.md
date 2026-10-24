# 当前工作区内执行：官方 0.2.1-rc.2 契约核查

核查日期：2026-10-23。接口核查只读已安装官方发布包和本地 SDK 源码；随后按 owner 派单实现独立适配器及本地测试。没有创建真实会话、提交真实 prompt、调用模型、运行真实工作区命令或操作浏览器/原生 Desktop。本文件不是端到端验收。

A–E 节保留最初只读接口审计的证据与接入要求，其中“待实现/验收”描述属于该阶段；当前适配器、恢复、停止与关闭协议以 F 节为准。实际安装与 Host 验收由 owner 另行记录。

## 结论

可实现“Finder 留在当前工作区内，自动分析/检索，然后在本页执行现成方案或生成插件，并显示真实进展与结果”。官方 Client 已具备直接创建、提交、订阅、取消和内嵌会话的接口。Creator 可仅作为新会话的 `cordis` 预设，不需要跳转、复制草稿或打开 Creator 产品页。

必须一起实现三项：

1. 根据当前 `mainView` 会话确定工作区；只有一个工作区时可明确采用它。多工作区无当前绑定时不能猜。
2. Finder 持久化的原子执行领取、固定会话 ID 与固定 requestId；Host requestId 检查不提供任意并发 exactly-once 保证。
3. 把官方 `conversation.composer` 审批链装进 Finder 的精确 Session 作用域。只后台 retain 和 prompt 会产生看不到的授权等待。

## 一手发布包与证据路径

本机隔离 Host 的启动记录指向：

`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js`

以下所有 `P/…` 路径的 `P` 代表：

`/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai`

通过只读解析 ASAR header/entry offset 直接读取文件。每个相关 package.json 均为 `0.2.1-rc.2`，包括 session/workspace controller、ui-session、ui-workspace、ui-conversation、ui-approval、ui-renderer、ui-subagent、agent-preset。ASAR 内没有这些 Client 的 `.d.ts`，本报告用实际发布 JS 实现作为主要证据；下面的 TypeScript 签名是对实现与本地 SDK 声明的整理。

| 文件 | SHA-256 |
|---|---|
| `P/dsh-api-session-controller/lib/client.js` | `82f2301c18f0e51340c1eedf8ecdfb939e873b3770a80632e438b86e82887d0e` |
| `P/dsh-api-session-controller/lib/index.js` | `a9801acb577b03053c5d5a3191ff555c5f1d791d0acddec113bea4511e33b386` |
| `P/dsh-client-ui-session/lib/client.js` | `c2aee5c41e606b62f845ff65bb9db8874a1ea4e21dfec8551ca70a9e36767311` |
| `P/dsh-client-ui-workspace/lib/client.js` | `977c75d31c356b1ffd11a0419997c4426dad48a852c80be01819d01902254050` |
| `P/dsh-client-ui-conversation/lib/client.js` | `48d308ca86c9350986982e113bb775696719a958415f436ce7b977de1eace0b6` |
| `P/dsh-client-ui-approval/lib/client.js` | `a792cc7996834448ec597b738367e99fdb6b83553095f807d65af7a4d760fda9` |
| `P/dsh-client-ui-renderer/lib/client.js` | `dbdb3f26bfbc1d143bc8a0eed5982a2507c4f0cf8027e7c170f3bed3604be356` |
| `P/dsh-client-ui-subagent/lib/client.js` | `fa8a0e37b504b7a55e80e08a5546cbef71d881c095dc15f1f56c375dd5bae95f` |

本地便于阅读的 SDK 源码根为 `<project-workspace>/DSH/dsh-wechat-desktop-source/`；整个 checkout 不能冒称当前官方版本。实际发行代码核查优先于该源码。

## A. 自动确定当前工作区

公开可观测入口：

```js
ctx.sessions.list.getSnapshot() // { phase, ids, byId, ... }
ctx.sessions.list.subscribe(listener) // -> unsubscribe
ctx.workspaces.list.getSnapshot() // { phase, items, archivedSessionIds, ... }
ctx.workspaces.list.subscribe(listener) // -> unsubscribe
```

从 `sessions.byId` 读取 `row.retainedBy.mainView > 0` 的当前会话，按该 `row.id` 查找 `workspace.items[].sessionIds`。`items` 含 `workspaceId`、`path`、`title`、`sessionIds`。两份列表必须到 `phase === 'ready'` 才作选择。

```js
const sessions = ctx.sessions.list.getSnapshot();
const workspaces = ctx.workspaces.list.getSnapshot();
const selected = Object.values(sessions.byId)
  .filter(row => (row.retainedBy.mainView ?? 0) > 0);
const matches = selected.length === 1
  ? workspaces.items.filter(ws => ws.sessionIds.includes(selected[0].id))
  : [];
// matches.length === 1: 自动采用，记录来源 current-session。
// selected.length <= 1 && matches.length === 0 && items.length === 1:
//   可采用唯一工作区，记录来源 only-workspace。
// 多个 mainView / 多个归属匹配: 等状态收敛，不能任取第一个。
// 没有当前归属且多个工作区: 显示一次目标选择，不能用最近工作区冒称当前。
```

证据：官方工作区快捷键自身在 `P/dsh-client-ui-workspace/lib/client.js:87–89` 使用 `retainedBy.mainView` 找当前会话；官方 ui-session 在 `P/dsh-client-ui-session/lib/client.js:913–923` 同样投影当前会话。当前工作区映射见工作区包 `:1505–1508`。工作区列表结构见 workspace controller `lib/client.js:255–271`。

`uiWorkspace.selection` 是实现内保存的选择，不需要读取 localStorage 或依赖该内部属性。Finder 当前 root panel 不拥有自己的工作区；必须从当前会话归属建立并锁定执行目标。打开 Finder 后应保持原 `mainView` 引用；该行为尚未本轮 UI 验证。运行开始后，导航到别的工作区不应把已有执行重定向。

## B. 新建专用会话并直接发送一次

### 精确方法

```ts
ctx.sessions.create({
  workspaceId?: string,
  cwd?: string,
  sessionId?: string,
  agentPreset?: string,
}): Promise<string>

ctx.sessions.retain(sessionId, {
  source: 'controllerOperation',
  signal?: AbortSignal,
}): SessionReference

reference.ready: Promise<SessionBinding>
reference.binding: { sessionId, session, eventSource, ctx }
reference.release(): void
ctx.sessions.binding(sessionId): SessionBinding | undefined

binding.session.beginSubmission({
  mode: 'queue' | 'steer', text: string, attachments: [], onRetire?: callback,
}): { requestId: string, abandon(): void }

binding.session.prompt(
  content, // 纯文本 [{ type: 'text', text: prompt }]
  mode: 'queue' | 'steer',
  signal?: AbortSignal,
  requestId?: string,
): Promise<{ok:true,value:{accepted:true}} | {ok:false,error}>
```

发布包证据：session controller Client `:3972–3976`、`:3842–3863`、`:3751–3785`、`:4056–4057`、`:4122–4133`、`:2309–2331`、`:2341–2391`。官方 composer 自身在 conversation Client `:4717–4738` 调用 `beginSubmission` 后传同一 `submission.requestId` 给 `session.prompt`。

创建现成执行会话使用 `{workspaceId, agentPreset:'standard'}`；创建插件使用 `{workspaceId, agentPreset:'cordis'}`。两预设 ID 在实际发布 `P/dsh-web-app/presets/standard.patch.yml:8`、`presets/cordis.patch.yml:8`。不要传 `cwd` 和 `workspaceId` 两者；Host 拒绝该组合。

新会话必须省略 `sessionId`。它在 create 中表示“可复用的 blank”，不是创建幂等键。`uiWorkspace.connectWorkspace()` 会寻找并复用已有 blank，因此不适合独立执行；证据为 workspace Client `:1397–1429`。直接 `sessions.create()` 不调用 `openSession`、`selectPanel` 或剪贴板。

等待 `reference.ready` 后核对：

```js
const binding = reference.binding;
binding.sessionId === savedSessionId;
ctx.sessions.binding(savedSessionId) === binding;
binding.session.projections.faceOf('agentPreset').getSnapshot() === wantedPreset;
ctx.workspaces.list.getSnapshot().items
  .find(ws => ws.workspaceId === savedWorkspaceId)
  ?.sessionIds.includes(savedSessionId) === true;
```

工作区 attachment 经异步事件进入列表，不能把暂时未观察到当成可另建新会话；等待列表收敛或记录未核实。`session/workspace-attach-failed` 是会话已创建但挂接失败，真实 ID 在 `error.rpcError.details.sessionId`，必须保存，不能重新 create。Host 证据 `P/dsh-api-session-controller/lib/index.js:755–786`。

### 必需的 Finder 提交协议

1. 用户明确执行按钮触发后，Host 原子 claim `(taskId, revisionId, contentHash, workspaceId, preset)`。原有 Creator attempt 领取设计可复用，但应扩为执行记录。
2. 只有 acquired 方调用一次 create；创建结果立即持久化。创建超时/响应丢失进入 indeterminate，不自动再建。
3. retain 精确 ID 并完成归属/预设核对。保存不可变执行 prompt 与 hash。
4. 当前 Finder 由 execution-claim 生成并保存固定 requestId；发送前须通过 execution-submit-claim 原子取得 `created → submitting` 的唯一首次发送权，核对 canonical 回执身份和 prompt（见 F 节）。不再调用会 mint 新 requestId 的 `beginSubmission`。该官方方法可用于别的 composer 本地 echo，但不能替换服务器 claim ID。已有 requestId 的重开不能 mint 新 ID。
5. 保持该 claim 独占；订阅进度和官方审批 UI 后，调用 `binding.session.prompt(content,'queue',signal,requestId)` 一次。该按钮本身就是发送动作，不再要求复制/到另一个输入框发送。
6. `.ok && .value.accepted` 只记录 accepted；后续 durable `user/message` 中 `data.source.rpcId === requestId` 才证明对应请求进入该会话记录。
7. 结果不明时只重绑/回读原 sessionId、requestId 和日志；不自动换 ID 重发。重试保存不等于重试发送。

### Host 去重的准确边界

Host `commands.prompt` 在 `index.js:925–927` 调用 `hasPromptRequest`；实现 `:1128–1138` 检查该 Agent 的 `inbox.nextTurn` / `nextStep` 和历史 `user/message.source.rpcId`。固定 requestId 的顺序重试在已观察到 admission 后能被识别。

但不能宣称 Host 自带任意并发 exactly-once：去重检查发生于后续 `await attachments.admitPromptContent(...)` 之前（`:942–950`），普通文本 admission 没有该函数内的互斥锁；`:965` 只为图片走 serializeImageAdmission。检查也不比较同 requestId 的内容 hash。Finder 必须自己持久化 claim、串行提交并校验不可变 payload；多标签页不能各持一把内存锁就宣称全局幂等。

断线/进程崩溃时，“已提交但回执丢失”需要保守未知状态。仅依据本轮接口审计不能承诺崩溃恢复的无损 exactly-once；要额外实现并验收 reconciliation。

## C. 真实进度、结果与取消

### 可观测方法

```js
binding.session.subscribe(listener);        // -> unsubscribe
binding.session.getSnapshot();
binding.eventSource.subscribe(listener);    // -> unsubscribe
binding.eventSource.getSnapshot();          // { entries, hasMore, revision, change }
ctx.uiSession.sessionStatus.subscribe(listener);
ctx.uiSession.sessionStatus.getSnapshot().get(sessionId);
```

Session snapshot 含 `running`, `openState`, `openError`, `promptError`, `lastAgentError`, `removed`, `blank`, `awaitingFirstTurn`, `pendingSubmissions`。证据：session controller Client `:2575–2584`、`:2898–2921`。事件源在 binding 上，不应依赖 Session 实例的实现内字段；构造证据 `:4129–4133`，订阅/快照 `:1753–1785`。

事件 `entries` 是 `{type:'event', event:{type,seq,time,data}}` 或 `{type:'transient', event:{type:'assistant/live-chunk',...}}`。流片段只展示进展，durable settlement 会替换它们。不要按追加字符串累积而把重连/settlement 渲染两遍。

完成依据为本次 requestId 对应的 `user/message` 及该轮 `turn/end`，并检查 `data.reason.kind`；不能以 `running === false`、一次模型回复、accepted 或本地 UI 动画作完成依据。已安装 `P/dsh-tool-cordis/lib/types/api-catalog.js:7024` 记录 `turn/start/end`、`assistant/message`、`tool/call/result` 的发布结构，`:8308` 的 reason 包括 `completed`, `aborted`, `blocked`, `error`, `max-tokens`, `interrupted`, `forked`。

`assistant/message.data.message` 是实际回复，`data.turn` / `data.step` 供关联。`turn/end` 的 completed 代表该 Agent turn 完成；是否插件成功构建、安装、完成用户验收仍应根据真实工具结果和产物分别记录。任务级后续追问可能是新 turn，不要把旧终态覆盖新运行。

新建专用空会话有利于准确对应首轮。恢复时若 `eventSource.hasMore` 且请求或对应 turn/start 不在当前窗口，适配器只读补页；不会“未看到”即认定未发送。

```ts
binding.session.loadOlder(): Promise<void>
binding.session.loadThrough(seq: number): Promise<void>
```

实际发行源码 `P/dsh-api-session-controller/lib/client.js:2491–2509`：loadOlder 无参数，每次补一页（至少 50 messages 和两个 turn starts，500 messages 上限），已在 loading 或未 open 时直接返回；失败可被内部捕获，故 Promise resolve 不保证新增记录。`:2510–2553` 的 loadThrough 会循环补页直到覆盖指定 seq，无调用侧页数上限。本实现不用未知 requestId 猜 seq：最多调用 5 次 loadOlder，逐页验证窗口最早 durable seq 确实前移，恢复 exact requestId 与 turn 后停止。无进展、接口缺失或上限后未找到时保持 unknown，订阅继续等待真实事件；不会借同 session 中其他活动推断本次运行/完成。

### 取消

```ts
binding.session.cancel(): Promise<RemoteResult<{accepted:true}>>
binding.session.updateQueue(itemId, {kind:'remove'}): Promise<RemoteResult<{accepted:true}>>
```

session controller Client `:2422–2439` 清楚注明 cancel 停当前 turn，保留 pending inbox；不是撤销已做的工作，也不代表队列都清空。`updateQueue` 见 `:2414–2420`，QueueAction 发布声明见 cordis catalog `:6568`。

对本轮单次首条执行保持禁止重复排队；取消时先按 requestId 精确移除自己的 inbox occurrence。只有 durable events 证明当前 open turn 的所有用户输入独占属于本次 requestId，才调用 `session.cancel()`；自身仅排队、当前运行其他请求时不得中断他人 turn。持续观察 aborted/error/blocked 等真实终态，不能只 abort 本地 UI 请求。提交信号在 Host 的 `index.js:3218–3230` 仅于 admission 开始前检查一次，abort 可能晚于接受；发生该竞争时必须回读，并在确有本次活动时继续取消同一会话。

`reference.release()` 只释放客户端观察，不取消 Host 工作；不能把关闭页面当停止成功。运行/授权等待中保留 reference 和订阅；结束后清理。准备阶段的 AbortSignal 可以用于 `retain`，发送后的观察寿命应由执行记录管理，避免 UI 切换撤掉审批显示。

## D. 保持官方权限 UX，留在 Finder 内

### 已存在且在发布包中实际使用的内嵌方式

官方 ui-subagent 使用精确 SessionReference 包一层 `SessionProvider`，内嵌官方 conversation factory；该机制不限于改变主会话导航。证据：`P/dsh-client-ui-subagent/lib/client.js:781–809`。

```jsx
// Finder main entry 要声明一个 session scope 子 slot。
// ui-renderer 会据此注入 SessionProvider，不能自行仿造 context。
<SessionProvider session={reference}>
  {renderSlot('plugin-finder.execution', {})}
</SessionProvider>

// plugin-finder.execution 在 session scope 中注册，使用官方 factory：
renderFactorySlot('conversation.content', {
  variant: 'embedded', phase: 'active', hero: false,
}, {
  slots: { views: FinderExecutionView },
});
```

`FinderExecutionView` 可显示 Finder 定义的进度/产物，官方 conversation factory 留住 composer 与权限链。若直接显示官方 chat，官方先例 `FixedChatConversationView` 调用 `props.renderSlot('conversation.session',{view:'chat'})`。这是实现建议而非本轮已跑通的 Finder 代码。

`SessionProvider` 由官方 renderer `lib/client.js:753–759` 在 entry 声明非 root children 时注入；其 `:704–722` 明确按 `props.session` 调用 adapter.bindingSource，不读取主导航来覆盖显式引用。ui-session `lib/client.js:837–841` 检验 reference 仍属当前 Controller generation。必须把 reference 本体传入，不能只传 sessionId。

官方 factory 在 `P/dsh-client-ui-conversation/lib/client.js:19733–19774` 注册，scope 为 session-maybe，包含 session scope 的 `conversation.composer` chain。其 `:17846–17854` 传入 `{sessionId,session,pendingInteraction}` 并渲染该 chain；`pendingInteraction` 取自 `uiSession.sessionStatus`（`:17747`）。

官方 approval 在 `P/dsh-client-ui-approval/lib/client.js:343–356` 注册到 `conversation.composer` priority 1，并处理 `approval/request`。选择器通过 `pendingInteraction instanceof PendingApproval` 命中官方实例；Finder 不应该复制对象、替用户 answer、改变批准策略或直接绕过该 chain。

### 需要改动的接入点

- Finder `src/client.js` 目前 main registration 没有声明 session 子 slot（当前 `apply()` 末尾）；要增加子 slot 和 SessionProvider/renderFactorySlot 的 props 传递。
- 明确依赖/注入 `uiSession` 与官方 ui-approval 的 Client 包，核实该 profile 实际已加载。现有 package manifest 包含 ui-conversation，但“依赖包存在”与“本次 profile 已注入审批服务”需运行时检查。
- 内嵌组件必须在 `prompt()` 前已挂载，并在等待用户批准时继续显示。若无法构造官方作用域/审批链，应阻止执行并显示具体依赖问题，而不是后台发送后要求跳转 Creator。
- 需要实际验证 permission request、批准/拒绝、取消等待、session binding 换代及插件热更新。只读审计确认机制存在，尚未证明本项目接入后 UI 行为正确。

## 仍待实现/验收的边界

| 项目 | 本轮结论 |
|---|---|
| 自动当前工作区 | 真实公开快照字段与官方同用法已确认；Finder 打开后 mainView 保留需实测 |
| standard/cordis 新会话 | 发布包支持；必须精确 readback preset/workspace |
| 原地直接提交 | 真实 session.prompt API 已确认；需替换现有草稿/导航链 |
| 进度与最终结果 | 真事件流与生命周期接口已确认；任务关联与结果归纳需实现 |
| 官方权限卡原地呈现 | 官方 factory + explicit SessionProvider 先例已确认；Finder 尚未挂载/点击验收 |
| 跨标签页单次执行 | 必须扩展 Finder Host 原子 claim；Host 本身不足以保证并发 exactly-once |
| 断线/崩溃后恢复 | 有固定 ID + durable event 回读基础；未知结果不能自动重发，完整恢复尚未验收 |
| 取消 | 有真实 cancel；保留队列、admission 竞争与终态核实必须处理 |
| 插件生成/安装/运行 | cordis 是执行预设，不是成功保证；必须读真实结果；安装通常影响 profile，不能称工作区运行隔离 |

原 `src/creator-handoff.js` 的草稿保护、精确 binding 检查、晚到 sessionId 保存仍可借用，但该函数当前的 `openSession`、`selectPanel(null)`、requestDraftInitialization 与 `opened/applied` 状态无法满足新执行契约。应有独立 workspace execution controller，不把“草稿已放入”重新命名成“执行成功”。

## E. 最小注册、导入与导出

Finder 当前是 JavaScript Client bundle，只需要自己的 React import 与服务注入，不需要导入官方私有组件：

```js
import React from 'react';
import { executeInWorkspace, inferWorkspace } from './workspace-execution.js';
export const inject = ['slots', 'layout', 'workspaces', 'sessions', 'uiSession'];
const h = React.createElement;

function ExecutionSlotPanel({ renderFactorySlot }) {
  // 在此组件的 effect/真实 descendant ready 后 resolve onReference 的挂载门槛。
  return renderFactorySlot('conversation.content', {
    variant: 'embedded', phase: 'active', hero: false,
  });
}

function Workbench({ SessionProvider, renderSlot }) {
  // reference 来自 executeInWorkspace 的 onReference(reference)，不是自行构造。
  const reference = useFinderState().executionReference;
  return h('section', null,
    /* Finder 自己的需求、方案和执行摘要 */
    reference ? h(SessionProvider, { session: reference },
      renderSlot('plugin-finder.execution', {})) : null);
}

ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
  name: 'main', key: 'dsh-plugin-finder',
  children: { 'plugin-finder.execution': { kind: 'single', scope: 'session' } },
}, Workbench)));
ctx.effect(() => ctx.slots.inject('plugin-finder.execution', () =>
  ctx.slots.register({ name: 'plugin-finder.execution' }, ExecutionSlotPanel)));
```

`useFinderState` 是示意名称；owner 应使用现有 controller hook。实际官方同构注册在 `P/dsh-client-ui-subagent/lib/client.js:830–838`，外层声明 session child，内层注册对应组件。不存在需要猜测的 `ctx.uiSession.open` 或 `SessionProvider` value import；SessionProvider 由 Slot renderer 提供。`uiSession` 是全局服务（其构造 `super(ctx,'uiSession')` 在 `ui-session/lib/client.js:797–805`），`sessionStatus` 是全局 Map snapshot，并非 scoped 服务才可访问。

官方 `@deepseek-ai/dsh-client-ui-conversation/client` 的发布 exports（实现末尾 `:20047–20060`）没有 `ConversationContent` 或 `SessionProvider` 组件，不能 import 它们。调用 factory 是已确认路径。`dsh-client-ui-conversation`、`dsh-client-ui-approval`、`dsh-client-ui-session`、`dsh-client-ui-renderer` 的 package.json 均声明 `./client` 入口为 `./lib/client.js`；通过 manifest `dsh.client.inject` 加载所需官方 Client 插件并由 ctx 注入服务，避免将其私有类复制进 Finder bundle。

若最终产品只保留 Finder 自己的输入框，可在自有 session slot entry 中额外声明：

```js
children: { 'conversation.composer': { kind: 'chain', scope: 'session' } }
```

然后在该 session slot 组件中按官方 factory 的同样 owner 形状调用：

```js
const session = useSession(value => value);
const pendingInteraction = useSessionStatus(value => value.get(sessionId)?.pendingInteraction);
renderSlotChain('conversation.composer', {sessionId, session, pendingInteraction}, {
  fallback: null, overlay: true,
});
```

这保留官方审批/询问 chain，无需复制审批按钮或 answer 调用。该精简组装是从已发布 Slot API 和官方 factory 的用法推导，尚无 Finder 本轮运行证据；优先实测完整 factory 再调整视觉。

## F. 已实现适配器合同与测试状态

文件：`src/workspace-execution.js`、`test/workspace-execution.test.mjs`。接口：

```ts
inferWorkspace(ctx, selectedId?): { workspaceId, source?, reason?, workspace?, sessionId? }
executeInWorkspace(ctx, {
  attempt, acquired = false, allowSubmit = false,
  record, claimSubmission, claimCancellation,
  onReference, onStatus, onHandle, signal,
}): Promise<ExecutionHandle>
```

`inferWorkspace` 当前会话优先，selectedId 仅作无当前归属时的兜底，防止把上次自动选择冻结成旧工作区。

`attempt` 是 Finder 服务端 execution-claim 的 canonical record：`attemptId/requestId/taskId/revisionId/kind/workspaceId/status/sessionId/provenance/prompt`。只有 `acquired:true`、`provenance:'local'`、`status:'claimed'` 且没有 sessionId 才创建会话。自动恢复 existing 时 `allowSubmit:false`，只观察原 session；无 sessionId 时保持 unknown。Imported 不创建、不发送、不写 record、不取消。

`created` 表示真实 sessionId 已保存，但尚未取得首次发送权。官方界面临时挂载失败或关闭后，保留该状态并提供明确“继续执行”；用户点击后才传 `allowSubmit:true`，复用同一 sessionId/requestId。界面挂载、归属及预设核对完成后，新建和恢复两条路径都必须调用 `claimSubmission(row)`；`row` 仅含 `attemptId/requestId/taskId/revisionId/kind/workspaceId/sessionId`，回传 `{claim:'acquired'|'existing',attempt}`。

controller 将该回调映射到 POST `/api/plugin_finder/execution-submit-claim`。服务端对 exact local created 原子写为 submitting，只有 acquired 回执允许以其 canonical prompt 发送一次。existing 或 submitting/submitted/failed/cancelled 不重发；并发只有一方获权。授权回执丢失或发送结果未知保持 unknown/submitting，不自动领取、换 ID 或重发。旧的 record(submitting) 兼容接口不作为新适配器发送授权。

`record(row)` 必须返回 canonical attempt（或 `{attempt}`），字段身份与 sessionId 完全相符；created/submitting 回执若已是 cancelled/failed/submitted，不能继续发送。发出后才收到 canonical cancelled 只进入 cancelling 并核对 Host，不冒称已停。

`claimCancellation(row)` 映射到 POST `/api/plugin_finder/execution-cancel-claim`，身份与回传结构同 claimSubmission。与提交共用服务端 mutation queue：仅 exact local created 原子变 cancelled 的 acquired 回执可确认“未提交，已取消”。如果提交已经抢先获得授权，existing 回执不会改写 submitting/submitted，也不确认已取消；适配器完成绑定后持续核对原 request 的队列/turn，只移除或停止可证实属于它的活动。取消准备回执未知时保持 unknown。创建尚未返回时，Stop 先阻止发送，保存迟到 sessionId 后再执行原子停止。

`onHandle(handle)` 在异步准备/提交尚未结束时即调用，让 controller 可及时 dispose 或 Stop。`onReference(reference)` 的 Promise 必须在官方审批/结果区域真正挂载后 resolve；拒绝或挂载前取消都会阻止发送。`onStatus` 输出 `phase, summary, details, terminal, sessionId, requestId, canContinue`，完成时有 `result, turn, endReason`。原始 phases 是 `preparing/ready/submitting/submitted/running/waiting-user/cancelling/unknown/blocked/record-failed/completed/failed/cancelled`；ready 对应尚未发送、可明确继续的本地 created。

返回 handle 提供：

- `sessionId` / `reference` / `recoveryRecord`：实时 getter。
- `ready`：准备/挂载/一次提交的处理 Promise；取消等待创建可提前返回 handle，但 ready 仍保存迟到 sessionId。
- `completion`：真实终态 Promise；dispose 时返回 `phase:'detached', terminal:false`，不伪造 Host 已停止。
- `getSnapshot()` / `subscribe(listener)`：真实本地观察状态。
- `cancel()`：准备阶段走上述原子停止；已提交阶段先按 requestId 移除 inbox occurrence，仅在确认当前运行 turn 独占属于本次请求时 session cancel；Host accepted 不是 confirmed。只把 `source.kind === 'user'` 计入请求归属；真实 user 缺 rpcId 仍阻止 whole-turn cancel，runtime/skill/time context 不当成另一用户。晚到入队会继续核查。
- `dispose()`：一次性取消订阅/释放 reference，不停止 Host 执行。controller close 先 dispose 再 abort 本地等待，防止 pending prompt 被误解成 Stop；关闭前尚未领取发送权保留 created，迟到 create 仍保存 ID；已领取则保留 submitting 且不发送、不自动重发，不写 cancelled。

历史阶段本地 adapter 24 项、controller 5 项共 29/29 通过（2026-10-23）。后续补充了 created 明确继续、并发首次发送、授权回执丢失、pending prompt 关闭只 detach、迟到 create/挂载/claim 关闭、原子停止准备及 submit 抢先时的精确取消回归。最新定向结果在本次 owner 交付报告记录；这些是本地服务与适配器测试，不是 Host 实装或模型执行验收。

已知保守边界：历史补页最多 5 页，超限仍缺本次 requestId/turn 时保持 unknown，可由官方内嵌历史继续读取，订阅会自动重新核对。创建后工作区 membership 暂未投影时会保留 ID 并 blocked，重连可再核对，不新建。Host 没有带 turnId 的条件 cancel RPC，调用前检查能阻止已观察到的无关 turn，但不能提供跨进程原子 compare-and-cancel。完整事件重连及 Host 崩溃 exactly-once 未经本子任务实跑，不作保证。
