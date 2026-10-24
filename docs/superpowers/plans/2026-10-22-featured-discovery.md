# 精选与为你推荐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** 用户无需先写需求即可浏览四组精选作品，结合 Finder 内记录与明确兴趣获得可解释推荐，并安全进入既有任务路径。

**Architecture:** 打包一份有来源与检查时间的编辑目录；纯函数负责卡片校验、推荐排序和本机偏好。客户端使用单独 localStorage 键保存兴趣和隐藏选择，历史只读取现有 bootstrap/history 结果；不新增服务端模型调用、跨会话读取或遥测。一个独立视图渲染卡片与详情，controller 只负责切换、偏好和保留原任务后预填场景。

**Tech Stack:** 现有 JavaScript/React/Node test/DSH SDK，无新增运行依赖。

## Task 1 — 有来源的精选目录

Files: create `src/featured-catalog.js`, `test/featured-catalog.test.mjs`, `docs/research/2026-10-22-featured-catalog-audit.md`.

- [x] 先补有意义失败断言：四个唯一产品；管理/桥接组件合并；只有已核对的公开精确资产可安装；预览无安装地址；来源只允许 HTTPS。
- [x] 核对 Agent Twin、家庭助手、DSH Dot、Dot连接Harness 的本机来源与公开资料，记录检查时间；不把私有本机路径打包展示。
- [x] 导出 `featuredCatalog`，每条固定字段：id/title/subtitle/summary/why/audience/topics/scenario/requirements/limitations/components/status/version/checkedAt/sourceUrls/install。status 为 available|preview|private；install 为 null 或 {spec,version,verifiedAt}。topics 只用 twin/family/projects/connections。scenario 是通用实际任务，不把插件名作为搜索条件。
- [x] 测试通过后 owner 审核措辞、来源与版本边界。

## Task 2 — 本机推荐与偏好

Files: create `src/featured.js`, `test/featured.test.mjs`.

- [x] 测试先失败：冷启动无假推荐；明确兴趣有解释；负反馈不当正信号；隐藏条目从推荐移除；坏 JSON/未知 ID 安全忽略；无模型/网络/任务写入。
- [x] 导出 `featuredTopics` (id/label/keywords), `normalizeFeaturedPreferences(value)`, `rankFeatured(catalog,{history,preferences})`, `safeFeaturedInstall(entry,now)`。
- [x] 偏好固定 `{version:1,interests:[],dismissed:[]}`，仅合法主题和条目 ID；字符串长度与数组数量有界。rank 返回 `{entry,reason,score}` 前三项；只有明确兴趣或保存的相关方案产生正分；history 的 failed/partial 反馈不得称为喜欢或成功。理由只写主题，不回显私人任务原文。
- [x] 公开资产过期（30天）、未来时间、非 HTTPS 或无精确版本时禁用复制安装来源，保留说明。用固定 clock 测边界。

## Task 3 — 原生界面与安全场景入口

Files: modify `src/client.js`, `src/client-style.js`, `test/client.test.mjs`; create `src/featured-view.js`.

- [x] 客户端先写失败回归：无模型可浏览；浏览不请求模型、不改活动任务；新场景先保留原任务，reset 未确认不得清空；输入或蓝图编辑中的内容保留且可恢复；历史/Creator 两条原有接续不变。
- [x] 新增“精选”导航、describe 页内精选，详情内使用前提/边界/来源/版本/作者归属和安装指引。只允许 available+safeFeaturedInstall 的复制来源；其他显示预览/私有。
- [x] 兴趣主题选择、不感兴趣、恢复隐藏条目，使用 `dsh.plugin-finder.featured.v1` 本机键；保存失败明确提示仅本次有效。当前窗口仍可继续用。
- [x] “试试这个场景”仅准备新需求草稿，不自动模型/安装/发送；已有编辑草稿保存到独立本机 cache，可恢复。开始前先通过既有 reset 保存/切换，失败保留原任务。
- [x] 新 UI 使用宿主主题 token、窄屏断点与键盘 focus；卡片按实际场景排列。原生亮色宽屏已看图；暗色/窄屏未人工实跑，边界见交付报告。

## Task 4 — 审查和回归

- [x] 各模块定向 Node tests，完整 `npm test` 与 `npm run build`。
- [x] 独立规格审查后代码审查：隐私信号、推荐理由、安装来源、输入覆盖和异步 reset 竞态；修复后只重跑受影响与全套必要检查。
- [x] 更新 README、安装/验收说明、版本 `0.5.0-preview.1`；打包并检查文件清单/校验值，无私有数据或凭据。

## Task 5 — 原生实跑与交付

- [x] 原生桌面更新前备份/哈希4条原任务及原草稿；不重启用户Host，不操作微信客户端或网络配置。
- [x] 通过 DSH 原生管理器安装本地包，核对版本、运行中与安装文件匹配。
- [x] 实跑精选、详情/公开安装来源、预览无安装按钮、兴趣推荐解释、隐藏恢复和重开偏好；冷启动无历史分支由自动化覆盖，未清空用户历史。卡片合成需求完成真实模型匹配，并通过新版继续原官方 Creator。
- [x] 最终历史与草稿逐项比较，归档安全证据和旧包；更新 checkpoint并整合回主项目。未获发布授权不push/Release。
