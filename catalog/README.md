# 历史静态索引（v0.1）

此目录的数据与下列快照用法仅供历史研究和回归测试。v0.2 生产路径使用 `src/discovery.js` 动态读取外部供给，不加载此处 JSON，不受此处白名单限制。当前发布包不含 `plugins.json`、`sources.json` 或刷新脚本；下列 `loadCatalog()` 示例只适用于保留这些历史资料的源码 checkout。`index.mjs` 中的兼容过滤工具仍被生产路径复用，不表示生产候选来自静态名单。

`plugins.json` 是可离线检索的真实元数据快照；`sources.json` 是人工维护的 GitHub 仓库白名单和中文适用性摘要。发现源为 GitHub `dsh-plugin` topic 与 awesome-dsh-plugin；每条记录最终回到作者固定 commit 的 manifest、README 和 bundle patch 核对。

本轮只核对包清单、`dsh.bundle.patch` 声明及文件存在性、作者文档。`metadata: verified` **不等于**安装成功、安全审计、任务完成或组合可用。记录始终保留 `installation/task/combination: not-tested`。作者自述的测试、下载量和徽章不作为本项目的成功证据，也不进入排序。

## 历史快照用法

```js
import { loadCatalog, searchCatalog, getPluginDetails } from './catalog/index.mjs';
const catalog = await loadCatalog();
const matches = searchCatalog(catalog, {
  query: '检查 CSV 重复与缺失，再生成周报',
  capabilities: ['data-analysis'],       // OR 召回与加分
  requiredCapabilities: [],             // AND 硬条件
  requiresNoApiKey: true,               // 保留不需要额外 Key 或仅可选 Key 的基础路径
  hostVersion: '0.2.1-rc.2',
  nodeVersion: '22.22.0',                // 默认使用调用模块的 Node 版本
  platform: 'darwin',
  limit: 8,
});
const details = getPluginDetails(catalog, matches[0]?.id);
```

检索按中英文能力词表扩展、能力覆盖与包名/关键词匹配排序，不做联网请求，不执行候选代码。未知需求可返回空集。没有声明版本范围时兼容性为 `unknown`，不把未知写成兼容；支持的 SemVer 子集遵循 DSH `includePrerelease: true`，未知语法返回 unknown，安装时仍以宿主的正式兼容性检查为准。范围声明相容不等于运行可用。

## 刷新

以下命令只维护克隆项目中的历史资料；安装用 tarball 不包含刷新脚本和测试。旧 v0.1 读取随包快照，当前 v0.2 按需求动态读取外部来源，二者不可混用。

```sh
node scripts/refresh-catalog.mjs
node --test test/catalog.test.mjs
```

刷新仅请求白名单 GitHub 仓库的 HEAD commit，再用该固定 commit 读取 JSON、README 与 patch；不读取用户凭据、不安装依赖、不执行 npm 生命周期或第三方代码。固定 HTTPS 主机，无重定向；单次 15 秒、常规文件 512 KiB、patch 128 KiB、并发最多 4、最多 20 个候选。失败条目保留上次成功结果并记录错误，命令返回非零。首次失败且没有旧成功时不收录该条目。写入采用同目录临时文件后 rename。

新增源、包身份变更与适用性摘要需要人工核对。自动刷新只更新元数据，不证明新的代码行为与旧摘要相同；发布索引更新前应阅读作者变更并复核摘要、额外账号、依赖及权限。

## 本轮发现的实际限制

- Context7 所在仓库是 monorepo，根清单不含 bundle；必须定位 `packages/dsh-mcp-context7`，不能把仓库名当成安装包名。
- Tavily 的当前作者文档声明 search / extract 支持免 Key，crawl / map / research 需要 Key；本轮未请求这些第三方端点。其 patch 会更改默认网页搜索提供方，已有同名 MCP row 可能冲突。
- 科研工作区、文献检索、部分工程/模板插件的 peer 范围仍在较旧 DSH 版本线上；当前宿主下检索会按声明过滤。索引仍保留记录以便明确解释供给缺口。
- 数据质量/证据报告的 Git 安装包含 prepare 构建；索引只披露脚本存在，没有替用户授权构建。
- 工作流模板的 `wf_template_run` 只产生交给官方 workflow 的起点，不直接执行；工作流持久化插件也不证明脚本已经跑通。
- 数据分析 runbook 已包含 CSV 画像，不应机械叠加另一个数据质量插件；组合需要按用户规则强度与具体分工决定。

每条记录只保存必要元数据、人工摘要和文件哈希，未转载完整 README。作者及原文链接保留在 evidence.sources。
