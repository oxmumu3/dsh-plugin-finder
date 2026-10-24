# 分类插件目录实施计划

**Goal:** 首页精选下增加六类各三项及全量分类浏览，沿用当前方案和执行流程，同时保存可核查的生态研究。

**Architecture:** CC0公开快照经可复跑脚本生成精简静态数据，纯本地查询模块为生产与离线HTML共用；独立浏览组件承接列表与筛选，controller只负责保留用户内容并进入已有searchHome链。数据研究与UI在不重叠文件中推进，root负责整合、真实浏览器和最终审阅。

**Tech Stack:** JavaScript、React 19、esbuild、Node test、现有DSH官方宿主API。

- [ ] 数据：新增scripts/build-community-catalog.mjs、src/community-catalog-data.js、src/community-catalog.js。按完整来源URL保留6565项；23类映射6类，18项手选代表；输出来源、时间、统计、许可、复跑说明。验证身份冲突/计数和/分页及不安全URL不进入可点击来源。
- [ ] 浏览组件：新增src/community-view.js及样式；src/experience-view.js首页精选后渲染。每类3条，展开区块支持6类筛选、检索、每页24条、空状态和回到分类。使用明确按钮而非全卡多重点击区；窄屏一列，不新增主导航tab。
- [ ] 连续动作：src/client.js新增startCommunityPlugin(id)，从可信本地索引回读条目，复用旧内容保留与自动searchHome链，作者说明只作参考资料。点击开始按钮即进入方案核对，不先要求复制或另开项目。离线preview-controller明示此行为不调用模型，保留真实目录及原演示数据边界。
- [ ] 内容：docs/research/ecosystem-20261023保存目录原快照/元数据、用户规模证据、重复与用途分析、作者思考与文章结构草稿；区分个人观察、假设、一手事实和已实现能力。不发布公告或文章。
- [ ] 整合：构建HTML与客户端，必要回归后跑一次全套；egospace136实走目录→筛选/分页→选条目→方案，并检查390px/键盘/溢出。复核文章数字、来源归属、包元信息及旧历史。新包另存，0.8验收制品保持不变。
