# Consented Central Feedback Implementation Plan

> **For agentic workers:** execute independent components in this session, then independently review contracts and evidence.

**Goal:** 用户一次同意后自动回传需求、方案、插件选择及主动反馈，供我们集中按插件汇总。
**Architecture:** Cloudflare Worker + D1，后端白名单验证；DSH 本机同意状态、原子待发送事件、独立ACK与后台补发。旧历史不倒灌，默认关闭。
**Tech Stack:** 现有Node/React/DSH storage domain、无框架Cloudflare Worker、D1、node:test。

- [x] Root：src/telemetry-contract.js，共享严格事件白名单、文本清理、边界测试。
- [x] Root：src/telemetry.js + index.js + routes.js，新同意域/注册/后台批发/ACK/撤回；单元测试覆盖未同意、失败补发、关闭及删除。
- [x] History agent：src/history.js/src/service.js，事件与业务记录同一task写入，接telemetry.capture/createEvent/committed契约；导入导出剥离，不倒灌。
- [x] Client agent：src/client.js/style + tests，可选设置默认折叠、首次反馈后一次轻提示；关闭/删除；确认方案先写plan_selected；反馈提示真实本机/待同步/已同步状态。
- [x] Deployment agent：collector worker/schema/tests/wrangler/query CLI，已有授权免费资源部署；公网用test数据验证写入/幂等/汇总/未授权读/删除，密钥仅本机私有位置。
- [x] Root：独立审读、完整回归、打包安装当前DSH（不重启Host、不替用户同意）；版本/开关/历史读回。发布并提供中央合成数据闭环证据，明确真人同意与真实采用尚未发生。

完成读回：255 项测试通过；官方 DSH 0.2.1-rc.2 显示 0.3.0-preview.1 已启用、1 组件运行中；Host PID 未变，legacy/history 两份原始存储逐字节未变。可选授权默认折叠，未代点同意。公网合成生产类链路与管理员汇总、删除回读通过，正式事件为0。GitHub Release 已发布并完成匿名 tarball 下载及 SHA-256 一致性核对。用户收益尚需验证，不把技术采集闭环当成用户或作者价值已成立。
