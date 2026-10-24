# Single-flow Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. User's explicit flow correction is the accepted design.

**Goal:** 一个极简首页串起输入、推荐、匹配和必要时创作。
**Architecture:** 原服务与保存协议不变，客户端增加独立首页输入和可取消查找链；推荐纯视图同页，创作先进入无模型引导；历史/设置降为次要入口。
**Tech Stack:** React、原controller、Node tests，无新依赖。

- [x] 首页视图/样式：featured-view.js、client-style.js；home/detail/drafts三模式、猜你喜欢和精选同页、兴趣折叠。
- [x] 创作引导：creation-guide.js及测试，能力/case/实践来源有界，进入引导不生成蓝图。
- [x] client controller与整页：新增showHome/setHomeRequest/searchHome/showCreationGuide，取消与新任务身份保护；移除tabs和步骤栏；历史/设置/旧任务恢复仍可用。
- [x] 回归：首次及带历史重开均首页；一击理解→推荐；取消不继续请求；失败不写别的任务；主页输入和旧蓝图并存；搜索失败不称无供给；创作CTA先看引导。
- [x] 独立审查、全套与build；0.6本地打包与身份/包内容核对。
- [ ] 原生更新并检验首页、同页推荐、详情返回保留输入、一击匹配、创作引导、旧Creator继续；逐任务/草稿/包文件保护比对；整合main与记录，不push。
