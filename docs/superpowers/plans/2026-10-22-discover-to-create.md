# 发现到共创首版实施计划

用户已于 2026-10-22 明确批准设计并要求直接实现和实跑，不再逐步征求实现选择。

**目标：** 在同一 Finder 任务中完成发现、渐进共创、可编辑建造方案与官方 Creator 接续，保护旧历史和草稿。

**架构：** 保留现有发现与普通任务路径；新增受验证的 creation 状态和版本，首版共创分支仅本机记录。Creator 会话通过服务端持久 attempt 领取创建权，客户端精确创建/绑定预设/初始化未发送草稿。

**技术：** 现有 JavaScript、React、DSH 0.2.1-rc.2、Node test；不增加模型凭据或生产依赖。

- [x] 在独立 worktree 核对基线；并行只读侦察真实宿主与隔离安装入口。
- [x] 后端：creation 契约、模型方案、渐进澄清与编辑、必要重搜；扩展 history、备份、format 2、telemetry 分支隔离；添加有意义的失败回归再实现。
- [x] Creator：独立 SDK helper、创建结果不明及迟到恢复、精确 cordis 投影、已知 sessionId 恢复、错误包装与旧版降级；先回归后实现。
- [x] 客户端：共创入口、逐问澄清、字段编辑与验收例子、版本恢复、Creator attempt API 与继续建造会话；保留旧安装路径和草稿预览。
- [x] 联合回归：跨标签页领取唯一创建权、内容改变重核、导入导出、旧版误写保护、遥测哨兵、取消与存储失败；独立规格/代码审读。
- [x] 独立审读修复：题目/选项随答案进入确认与 Creator 草稿，回答实际更新蓝图；保留祖先链用户反馈；运行假设和 UI 能力变化重查供给；起点与当前候选版本分开；attempt 容量写前拒绝。
- [x] 实跑故障回归：累计硬限制最多 24 条、模型单次仍最多 6 条；普通累计超过 6 条也采用 format 2；安全阶段诊断、旧共创可选字段兼容；相关回归 94/94。
- [x] Finder 源码完整测试 332/332 通过、客户端构建成功；提交 `0cb1585` 包含恢复 A 后保留下一条 B 恢复入口的最终修复。
- [x] 已打包并实跑较早候选 0.4.0-preview.1，SHA-256 `47d43f7605a6082ec25fdf1dfd420fb6dcb2eaf76ac57866b16950451fed215c`。
- [x] 最终重新打包，交付目录记录包清单与 SHA-256；34/34 安装文件与包一致，最终值见 acceptance-status.json。
- [x] 较早候选在独立官方 profile 与真实默认模型完成现成匹配 `dsh-md-studio@1.2.0`，本轮未安装或验证该候选渲染；原 clarify 任务复测到 ready，3 answers、supply current。
- [x] 原生 Desktop 导入两个合成任务，旧两个任务保留，总数 4；普通 handoff 独立保存为 applied。
- [x] 普通任务 `standard` 会话的 4,184 字草稿与生产 controller.prompt 逐字相同，0 用户消息/0 turn，仍未发送。
- [x] 真实官方 Creator 会话、cordis 预设、精确工作区/会话/唯一 attempt 和 applied 状态读回；32,495 字未发送草稿逐字相同，重复点击不新增会话。
- [x] 草稿验收后，操作者另行追加合成实施范围并显式发送；Creator 两轮生成均 completed。
- [x] 第二轮 `dsh-reading-shelf-fixture@0.1.0` 通过 35/35 测试及 check/build/pack，操作者审查后原生安装，显示 1 个组件运行中。
- [x] 手工绝对路径读取合成目录；保存 `Fixture One / Agent / Reading`，实跑主题/状态筛选和清除筛选、63 B 原文的只读 Markdown 文本预览，Refresh 后重新读取元信息仍在。
- [x] UI 操作后两个 Markdown 的 SHA-256 与 mtime 完全不变；421 B 独立 JSON 仅含元信息，不含原文正文。
- [ ] Browse 点击未观察到可见 picker，原生目录选择器仍未验证；重启恢复、长期稳定性及外部用户接受仍待各自证据。
- [x] 已通过原生管理器把 Desktop Finder 热更新至较早 0.4.0-preview.1 包，enabled、1 running；两份历史 JSON 字节与两份原草稿完整存储值均一致。
- [x] 最终包再次原生热更新，1 running；4 任务序列化内容、原 2 草稿完整存储值、普通未发送草稿和 Creator 记录均核验不变。
- [x] 补新版验收章节框架与设计批准/实施状态附记，保留旧版历史记录。
- [x] owner 补齐最终验收结果、说明与 checkpoint，交付本地可安装包和可审阅变更；未公开发布。

文件分工：backend agent owns src/creation.js, src/creation-service.js, src/history.js, src/service.js, src/contracts.js, src/routes.js, backend test files；Creator agent owns src/creator-handoff.js 与独立 test/creator-handoff.test.mjs；root owns src/client.js, src/client-style.js, client tests, package/docs/integration。共享文件改动只由 owner 写入。

真实实跑的探针采用公开合成需求，未验证的层级不能写成通过。完整细节见已批准 spec；所有新建造数据按本地私有分支处理。
