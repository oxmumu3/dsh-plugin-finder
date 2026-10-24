# Finder 目录设计：两个开源项目的可用模式

2026-10-23，通过 GitHub 插件只读核查公开源码。没有启动浏览器、安装依赖或改项目。本报告说明源码体现的结构和交互，**没有把源码阅读冒充真实页面视觉验收**；下方 Finder 建议是据此作出的设计判断。

## 1. LobeHub：发现页只给精选预览，完整目录独立承接

canonical 仓库现为 `lobehub/lobehub`（原 `lobe-chat` 会指向这里）；检查 `canary` 的固定提交 [`5b336e1f0bf1ccc009e5be5eac681ae99e58f3aa`](https://github.com/lobehub/lobehub/commit/5b336e1f0bf1ccc009e5be5eac681ae99e58f3aa)。

- **概览和完整目录分层。** Community 首页使用独立 section title + “更多”入口，各取少量条目；MCP 完整页再承接分类与分页，不在首页直接铺完整数据。[首页源码](https://github.com/lobehub/lobehub/blob/5b336e1f0bf1ccc009e5be5eac681ae99e58f3aa/src/routes/(main)/community/(list)/(home)/index.tsx#L47-L74)
- **条目内容有先后。** 图标/名称为第一层，作者为弱化信息，描述最多三行；元数据放底部独立区域。整条主动作只有进入详情，源码入口作为次级动作，并阻止冒泡，不和主动作混淆。[Item.tsx](https://github.com/lobehub/lobehub/blob/5b336e1f0bf1ccc009e5be5eac681ae99e58f3aa/src/routes/(main)/community/(list)/mcp/features/List/Item.tsx#L94-L245)
- **浏览上下文被保存。** 类目切换保留搜索 `q`，选中类目有明确 selected 状态；完整页 21 项分页，loading、empty、error/retry 是不同状态。[分类](https://github.com/lobehub/lobehub/blob/5b336e1f0bf1ccc009e5be5eac681ae99e58f3aa/src/routes/(main)/community/(list)/mcp/features/Category/index.tsx#L30-L54) · [列表状态与分页](https://github.com/lobehub/lobehub/blob/5b336e1f0bf1ccc009e5be5eac681ae99e58f3aa/src/routes/(main)/community/(list)/mcp/index.tsx#L18-L56)

**Finder 应借鉴：**“概览是选择方向，展开才是完整浏览”；分类标题+数量+查看全部只出现一次，下面三条形成一致扫描节奏。作者和来源弱化，用户第一眼先读能做什么。展开不丢搜索、原始需求或返回位置。

**不照搬：** LobeHub MCP 卡片有分数、连接类型、依赖、工具数、安装数与 Spotlight 装饰；这是它有数据的技术市场，Finder 没有对应可靠数据，不能复制成虚构质量/热度信息，也不应该让技术属性抢走用途。它的多频道导航也不是 Finder 必需品。

## 2. Flowise Marketplace：稳定条目结构与明确的使用动作

检查 [`FlowiseAI/Flowise@9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb`](https://github.com/FlowiseAI/Flowise/commit/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb)，main 提交日期为 2026-08-13。GitHub 本次返回仓库已归档；这里只作为已有设计实现参考，不推荐把它当活跃依赖引入。

- **列表任务非常具体。** 页标题之下是一句探索并使用模板的目的说明；搜索覆盖名称/描述/节点；用途筛选和完整内容浏览相互配合。[marketplaces/index.jsx:266–318,585–593](https://github.com/FlowiseAI/Flowise/blob/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/packages/ui/src/views/marketplaces/index.jsx#L266-L318)
- **条目有固定阅读顺序。** 名称最多两行、描述最多三行，能力图标放底部，最多三项再折叠，标题和说明不会被长技术清单挤走。[ItemCard.jsx](https://github.com/FlowiseAI/Flowise/blob/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/packages/ui/src/ui-component/cards/ItemCard.jsx)
- **详情的目标动作直接命名。** 模板详情顶部保留返回，主操作是 `Use Template`，功能对象与动作一致；点击列表先去详情或工具对话框，不直接假装已执行。[详情标题动作](https://github.com/FlowiseAI/Flowise/blob/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/packages/ui/src/views/marketplaces/MarketplaceCanvasHeader.jsx#L19-L69) · [列表动作映射](https://github.com/FlowiseAI/Flowise/blob/9291856d1ea4a4ceea9f8fef8ce14f4f6c81e8eb/packages/ui/src/views/marketplaces/index.jsx#L322-L349)

**Finder 应借鉴：** 名称、用途、次级来源各占固定视觉层；按钮说清用户会得到什么。最重要的是给条目建立一致结构，而非继续加边框、标签和按钮。

**不照搬：** LangChain/LlamaIndex 筛选、多种 workflow type、Community/My Templates 两个 tab、卡片/表格切换、工作流画布和 Copy 图标都服务开发者。Finder 不应把这些变成普通用户必经步骤；不需要另加“看详情→看预览→复制→继续”的链条。Flowise 的固定三列与卡片内部 overflow 也不是可直接继承的响应式标准。

## 可直接用于下一版的设计决定

1. 保留用户要求的六类、每类三条、查看全量，但从“六块容器各塞三张多动作卡片”改为**清楚的分组标题与精简条目**；不新增宿主 tab。
2. 一个条目先回答“它是什么、能帮我什么”。建议稳定为名称 + 一行/两行用途 + 一个主要入口；作者与来源进入弱信息层，不重复铺按钮。
3. “按用途找插件”是首页的辅助浏览区，应与需求输入、作者精选明显分段；进入某类后切换为可浏览列表，减少同时并列的内容量，保留返回与上下文。
4. 不把“查看使用方案”直接改名成“已安装/立即可用”。若条目需要模型核验，入口与状态必须诚实；用户已经说过需求就保留并继续。
5. 最终用真实长名称、缺少描述、同名不同作者、窄屏、空结果与网络失败验收。以上只借鉴信息组织和动作语义，不复制第三方代码或虚构市场数据。
